import type { EmbeddingProvider } from "@/lib/types";

export const DWARKESH_SITE_URL = "https://www.dwarkesh.com";
export const DWARKESH_ARCHIVE_API_URL = `${DWARKESH_SITE_URL}/api/v1/archive`;
export const DWARKESH_POST_API_URL = `${DWARKESH_SITE_URL}/api/v1/posts`;

export const GEMINI_CHAT_MODELS = [
  {
    id: "gemini:gemini-3.5-flash",
    rawId: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    family: "Gemini",
    provider: "gemini" as const,
    description: "Default Gemini flash model.",
  },
  {
    id: "gemini:gemini-3.1-flash-lite",
    rawId: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    family: "Gemini",
    provider: "gemini" as const,
    description: "Fast Gemini model.",
  },
  {
    id: "gemini:gemini-3-flash-preview",
    rawId: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
    family: "Gemini",
    provider: "gemini" as const,
    description: "Preview Gemini flash model.",
  },
  {
    id: "gemini:gemini-2.5-flash",
    rawId: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    family: "Gemini",
    provider: "gemini" as const,
    description: "Stable Gemini flash model.",
  },
  {
    id: "gemini:gemini-2.5-flash-lite",
    rawId: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    family: "Gemini",
    provider: "gemini" as const,
    description: "Lower-latency Gemini flash variant.",
  },
] as const;

export const GEMINI_EMBEDDING_MODEL_ID = "gemini-embedding-001";
export const OPENROUTER_FREE_EMBEDDING_MODEL_ID = "nvidia/llama-nemotron-embed-vl-1b-v2:free";

export const EMBEDDING_PROVIDER = parseEmbeddingProvider(
  process.env.EMBEDDING_PROVIDER,
  "openrouter",
);
export const EMBEDDING_MODEL_ID =
  process.env.EMBEDDING_MODEL_ID ??
  (EMBEDDING_PROVIDER === "openrouter"
    ? OPENROUTER_FREE_EMBEDDING_MODEL_ID
    : GEMINI_EMBEDDING_MODEL_ID);
export const EMBEDDING_DIMENSIONS = Number(
  process.env.EMBEDDING_DIMENSIONS ?? getDefaultEmbeddingDimensions(),
);
export const DEFAULT_CHUNK_MAX_TOKENS = 850;
export const DEFAULT_SEARCH_LIMIT = 10;
export const DEFAULT_CHAT_CONTEXT_LIMIT = 8;
export const MODEL_CATALOG_TTL_MS = 15 * 60 * 1000;

function parseEmbeddingProvider(
  value: string | undefined,
  fallback: EmbeddingProvider,
): EmbeddingProvider {
  return value === "gemini" || value === "openrouter" ? value : fallback;
}

function getDefaultEmbeddingDimensions() {
  if (
    EMBEDDING_PROVIDER === "openrouter" &&
    EMBEDDING_MODEL_ID === OPENROUTER_FREE_EMBEDDING_MODEL_ID
  ) {
    return 2048;
  }

  return 1536;
}
