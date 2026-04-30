import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { embed, embedMany, generateText, streamText, type ModelMessage } from "ai";

import {
  DEFAULT_CHAT_CONTEXT_LIMIT,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  EMBEDDING_PROVIDER,
  GEMINI_EMBEDDING_MODEL_ID,
  GEMINI_CHAT_MODELS,
} from "@/lib/config";
import { AppError } from "@/lib/errors";
import { getOptionalEnv, getRequiredEnv } from "@/lib/env";
import type { ArtifactManifest, EmbeddingProvider, ModelOption } from "@/lib/types";

export type EmbeddingConfig = {
  provider: EmbeddingProvider;
  modelId: string;
  dimensions: number;
};

const defaultModelId = GEMINI_CHAT_MODELS[0].id;
const EMBEDDING_BATCH_SIZE = readPositiveIntegerEnv("EMBEDDING_BATCH_SIZE", 100);
const EMBEDDING_BATCH_PACING_MS = readNonNegativeIntegerEnv("EMBEDDING_BATCH_PACING_MS", 0);
const EMBEDDING_ATTEMPTS = 6;
const EMBEDDING_MAX_RETRY_DELAY_MS = readPositiveIntegerEnv(
  "EMBEDDING_MAX_RETRY_DELAY_MS",
  60_000,
);

function getGeminiProvider() {
  return createGoogleGenerativeAI({
    apiKey: getRequiredEnv("GEMINI_API_KEY"),
  });
}

function getOpenRouterProvider() {
  return createOpenRouter({
    apiKey: getRequiredEnv("OPENROUTER_API_KEY"),
    compatibility: "strict",
    headers: {
      "HTTP-Referer":
        getOptionalEnv("OPENROUTER_HTTP_REFERER", "https://dwarkesh.com") ??
        "https://dwarkesh.com",
      "X-Title":
        getOptionalEnv("OPENROUTER_APP_NAME", "Dwarkesh Podcast RAG") ??
        "Dwarkesh Podcast RAG",
    },
  });
}

export function getDefaultChatModelId() {
  return defaultModelId;
}

export function parseSelectedModelId(selectedModelId?: string | null) {
  return selectedModelId?.trim() || defaultModelId;
}

export function resolveModelOption(selectedModelId: string, catalog: ModelOption[]) {
  const match = catalog.find((model) => model.id === selectedModelId);
  if (!match) {
    throw new AppError(400, `Unknown model: ${selectedModelId}`);
  }

  return match;
}

export function getDefaultEmbeddingConfig(): EmbeddingConfig {
  return {
    provider: EMBEDDING_PROVIDER,
    modelId: EMBEDDING_MODEL_ID,
    dimensions: EMBEDDING_DIMENSIONS,
  };
}

export function getArtifactEmbeddingConfig(manifest: ArtifactManifest): EmbeddingConfig {
  return {
    provider:
      manifest.embeddingProvider ??
      (manifest.embeddingDimensions === 1536 ? "gemini" : EMBEDDING_PROVIDER),
    modelId:
      manifest.embeddingModel ??
      (manifest.embeddingDimensions === 1536 ? GEMINI_EMBEDDING_MODEL_ID : EMBEDDING_MODEL_ID),
    dimensions: manifest.embeddingDimensions,
  };
}

export async function embedDocumentBatch(
  values: string[],
  config: EmbeddingConfig = getDefaultEmbeddingConfig(),
) {
  if (values.length === 0) return [];

  const embeddings: number[][] = [];

  for (let index = 0; index < values.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = values.slice(index, index + EMBEDDING_BATCH_SIZE);
    const batchEmbeddings = await withEmbeddingRetries(() =>
      runEmbedMany(batch, "RETRIEVAL_DOCUMENT", config),
    );
    embeddings.push(...batchEmbeddings);

    if (EMBEDDING_BATCH_PACING_MS > 0 && index + EMBEDDING_BATCH_SIZE < values.length) {
      await sleep(EMBEDDING_BATCH_PACING_MS);
    }
  }

  return embeddings;
}

export async function embedQueryText(value: string, config: EmbeddingConfig = getDefaultEmbeddingConfig()) {
  return withEmbeddingRetries(() => runEmbedQuery(value, "RETRIEVAL_QUERY", config));
}

export function streamChatCompletion({
  modelId,
  messages,
  system,
}: {
  modelId: string;
  messages: ModelMessage[];
  system: string;
}) {
  const [provider, rawId] = modelId.split(":");

  if (!provider || !rawId) {
    throw new AppError(400, `Invalid model identifier: ${modelId}`);
  }

  if (provider === "gemini") {
    const google = getGeminiProvider();
    return streamText({
      model: google.chat(rawId),
      system,
      messages,
      maxRetries: 0,
    });
  }

  if (provider === "openrouter") {
    const openRouter = getOpenRouterProvider();
    return streamText({
      model: openRouter.chat(rawId),
      system,
      messages,
      maxRetries: 0,
    });
  }

  throw new AppError(400, `Unsupported provider: ${provider}`);
}

export async function generateChatCompletion({
  modelId,
  messages,
  system,
}: {
  modelId: string;
  messages: ModelMessage[];
  system: string;
}) {
  const [provider, rawId] = modelId.split(":");

  if (!provider || !rawId) {
    throw new AppError(400, `Invalid model identifier: ${modelId}`);
  }

  if (provider === "gemini") {
    const google = getGeminiProvider();
    const result = await generateText({
      model: google.chat(rawId),
      system,
      messages,
      maxRetries: 0,
    });
    return result.text;
  }

  if (provider === "openrouter") {
    const openRouter = getOpenRouterProvider();
    const result = await generateText({
      model: openRouter.chat(rawId),
      system,
      messages,
      maxRetries: 0,
    });
    return result.text;
  }

  throw new AppError(400, `Unsupported provider: ${provider}`);
}

export function buildSystemPrompt(contextBlocks: string[]) {
  return [
    "You answer questions about Dwarkesh Patel's podcast transcripts.",
    "Only use the supplied transcript evidence.",
    "When you use evidence, cite the source IDs inline like [S1] or [S2].",
    "If the evidence is insufficient or ambiguous, say so plainly.",
    `Use at most ${DEFAULT_CHAT_CONTEXT_LIMIT} evidence chunks in your reasoning.`,
    "",
    "Transcript evidence:",
    ...contextBlocks,
  ].join("\n");
}

async function runEmbedMany(
  values: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
  config: EmbeddingConfig,
) {
  if (config.provider === "openrouter") {
    const openRouter = getOpenRouterProvider();
    const result = await embedMany({
      model: openRouter.textEmbeddingModel(config.modelId),
      values: values.map((value) => formatOpenRouterEmbeddingInput(value, taskType, config)),
      maxRetries: 0,
    });

    return result.embeddings;
  }

  const google = getGeminiProvider();
  const result = await embedMany({
    model: google.embedding(config.modelId),
    values,
    maxRetries: 0,
    providerOptions: {
      google: {
        outputDimensionality: config.dimensions,
        taskType,
      },
    },
  });

  return result.embeddings;
}

async function runEmbedQuery(
  value: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
  config: EmbeddingConfig,
) {
  if (config.provider === "openrouter") {
    const openRouter = getOpenRouterProvider();
    const result = await embed({
      model: openRouter.textEmbeddingModel(config.modelId),
      value: formatOpenRouterEmbeddingInput(value, taskType, config),
      maxRetries: 0,
    });

    return result.embedding;
  }

  const google = getGeminiProvider();
  const result = await embed({
    model: google.embedding(config.modelId),
    value,
    maxRetries: 0,
    providerOptions: {
      google: {
        outputDimensionality: config.dimensions,
        taskType,
      },
    },
  });

  return result.embedding;
}

async function withEmbeddingRetries<T>(operation: () => Promise<T>) {
  for (let attempt = 0; attempt < EMBEDDING_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableEmbeddingError(error) || attempt === EMBEDDING_ATTEMPTS - 1) {
        throw error;
      }

      const delay = getEmbeddingRetryDelay(error, attempt);
      console.warn(
        `[embedding] retry ${attempt + 1}/${EMBEDDING_ATTEMPTS - 1} after ${Math.ceil(
          delay / 1_000,
        )}s: ${summarizeError(error)}`,
      );
      await sleep(delay);
    }
  }

  throw new AppError(503, "Embedding request failed after retries");
}

function isRetryableEmbeddingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /quota|resource exhausted|rate limit|please retry in/i.test(message);
}

function getEmbeddingRetryDelay(error: unknown, attempt: number) {
  const message = error instanceof Error ? error.message : String(error);
  const explicitRetry = message.match(/Please retry in ([\d.]+)s/i);
  if (explicitRetry) {
    return Math.min(
      EMBEDDING_MAX_RETRY_DELAY_MS,
      Math.max(1_000, Math.ceil(Number(explicitRetry[1]) * 1_000)),
    );
  }

  return Math.min(EMBEDDING_MAX_RETRY_DELAY_MS, 2_000 * 2 ** attempt);
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function formatOpenRouterEmbeddingInput(
  value: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
  config: EmbeddingConfig,
) {
  if (!config.modelId.startsWith("nvidia/llama-nemotron-embed-vl-1b-v2")) {
    return value;
  }

  return `${taskType === "RETRIEVAL_QUERY" ? "query" : "passage"}: ${value}`;
}

function readPositiveIntegerEnv(name: string, defaultValue: number) {
  const rawValue = getOptionalEnv(name);
  if (!rawValue) return defaultValue;

  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function readNonNegativeIntegerEnv(name: string, defaultValue: number) {
  const rawValue = getOptionalEnv(name);
  if (!rawValue) return defaultValue;

  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : defaultValue;
}

function summarizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 300);
}
