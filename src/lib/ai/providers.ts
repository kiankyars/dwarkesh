import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { embed, embedMany, generateText, streamText, type ModelMessage } from "ai";

import {
  DEFAULT_CHAT_CONTEXT_LIMIT,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  GEMINI_CHAT_MODELS,
} from "@/lib/config";
import { AppError } from "@/lib/errors";
import { getOptionalEnv, getRequiredEnv } from "@/lib/env";
import type { ModelOption } from "@/lib/types";

const defaultModelId = GEMINI_CHAT_MODELS[0].id;
const EMBEDDING_BATCH_SIZE = 100;
const EMBEDDING_ATTEMPTS = 6;

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

export async function embedDocumentBatch(values: string[]) {
  if (values.length === 0) return [];

  const embeddings: number[][] = [];

  for (let index = 0; index < values.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = values.slice(index, index + EMBEDDING_BATCH_SIZE);
    const batchEmbeddings = await withEmbeddingRetries(() =>
      runEmbedMany(batch, "RETRIEVAL_DOCUMENT"),
    );
    embeddings.push(...batchEmbeddings);
  }

  return embeddings;
}

export async function embedQueryText(value: string) {
  return withEmbeddingRetries(() => runEmbedQuery(value, "RETRIEVAL_QUERY"));
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

async function runEmbedMany(values: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") {
  const google = getGeminiProvider();
  const result = await embedMany({
    model: google.embedding(EMBEDDING_MODEL_ID),
    values,
    maxRetries: 0,
    providerOptions: {
      google: {
        outputDimensionality: Number(
          getOptionalEnv("EMBEDDING_DIMENSIONS", String(EMBEDDING_DIMENSIONS)),
        ),
        taskType,
      },
    },
  });

  return result.embeddings;
}

async function runEmbedQuery(value: string, taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") {
  const google = getGeminiProvider();
  const result = await embed({
    model: google.embedding(EMBEDDING_MODEL_ID),
    value,
    maxRetries: 0,
    providerOptions: {
      google: {
        outputDimensionality: Number(
          getOptionalEnv("EMBEDDING_DIMENSIONS", String(EMBEDDING_DIMENSIONS)),
        ),
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

      await sleep(getEmbeddingRetryDelay(error, attempt));
    }
  }

  throw new AppError(503, "Embedding request failed after retries");
}

function isRetryableEmbeddingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /quota exceeded|resource exhausted|please retry in/i.test(message);
}

function getEmbeddingRetryDelay(error: unknown, attempt: number) {
  const message = error instanceof Error ? error.message : String(error);
  const explicitRetry = message.match(/Please retry in ([\d.]+)s/i);
  if (explicitRetry) {
    return Math.max(1_000, Math.ceil(Number(explicitRetry[1]) * 1_000));
  }

  return Math.min(60_000, 2_000 * 2 ** attempt);
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
