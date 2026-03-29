export const DWARKESH_SITE_URL = "https://www.dwarkesh.com";

export const GEMINI_CHAT_MODELS = [
  {
    id: "gemini:gemini-3.1-flash-lite-preview",
    rawId: "gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite Preview",
    family: "Gemini",
    provider: "gemini" as const,
    description: "Fast Gemini preview model.",
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

export const EMBEDDING_MODEL_ID = "gemini-embedding-2-preview";
export const EMBEDDING_DIMENSIONS = 1536;
export const DEFAULT_SEARCH_LIMIT = 10;
export const DEFAULT_CHAT_CONTEXT_LIMIT = 8;
export const MODEL_CATALOG_TTL_MS = 15 * 60 * 1000;
