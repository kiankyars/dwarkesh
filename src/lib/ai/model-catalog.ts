import { GEMINI_CHAT_MODELS, MODEL_CATALOG_TTL_MS } from "@/lib/config";
import type { ModelOption } from "@/lib/types";

type OpenRouterModelApiResponse = {
  data: OpenRouterModel[];
};

type OpenRouterModel = {
  id: string;
  name: string;
  description?: string | null;
  context_length?: number | null;
  architecture?: {
    input_modalities?: string[] | null;
    output_modalities?: string[] | null;
  } | null;
  pricing?: {
    prompt?: string;
    completion?: string;
  } | null;
};

let cache: { fetchedAt: number; models: ModelOption[] } | null = null;

export async function listModelOptions() {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < MODEL_CATALOG_TTL_MS) {
    return cache.models;
  }

  const openRouterModels = await fetchOpenRouterModels();
  const models = [...GEMINI_CHAT_MODELS, ...openRouterModels];

  cache = {
    fetchedAt: now,
    models,
  };

  return models;
}

async function fetchOpenRouterModels(): Promise<ModelOption[]> {
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    cache: "no-store",
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load OpenRouter models: ${response.status}`);
  }

  const payload = (await response.json()) as OpenRouterModelApiResponse;
  return payload.data
    .filter(isFreeTextModel)
    .map((model) => ({
      id: `openrouter:${model.id}`,
      rawId: model.id,
      label: model.name,
      family: "OpenRouter",
      provider: "openrouter" as const,
      description: model.description ?? "Free text model routed via OpenRouter.",
      contextLength: model.context_length ?? undefined,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function isFreeTextModel(model: OpenRouterModel) {
  const promptIsFree = model.pricing?.prompt === "0";
  const completionIsFree = model.pricing?.completion === "0";
  const outputsText = model.architecture?.output_modalities?.includes("text") ?? false;
  const acceptsText = model.architecture?.input_modalities?.includes("text") ?? false;

  return promptIsFree && completionIsFree && outputsText && acceptsText;
}
