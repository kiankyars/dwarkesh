export type ModelProvider = "gemini" | "openrouter";

export type ModelOption = {
  id: string;
  rawId: string;
  label: string;
  family: string;
  provider: ModelProvider;
  description?: string;
  contextLength?: number;
};

export type ParsedTranscriptTurn = {
  sectionHeading: string | null;
  timestamp: string | null;
  speaker: string;
  text: string;
};

export type ParsedEpisode = {
  id: string;
  slug: string;
  title: string;
  guestNames: string[];
  publishedAt: string | null;
  sourceUrl: string;
  htmlChecksum: string;
  transcriptChecksum: string;
  transcriptTurns: ParsedTranscriptTurn[];
};

export type EpisodeChunk = {
  id: string;
  episodeId: string;
  episodeSlug: string;
  episodeTitle: string;
  guestNamesText: string;
  sourceUrl: string;
  sectionHeading: string | null;
  speakerNames: string[];
  chunkIndex: number;
  tokenCount: number;
  text: string;
};

export type RetrievedChunk = EpisodeChunk & {
  score: number;
  publishedAt?: string | null;
};

export type IndexedEpisode = {
  id: string;
  slug: string;
  title: string;
  guestNames: string[];
  publishedAt: string | null;
  sourceUrl: string;
  htmlChecksum: string;
  transcriptChecksum: string;
  turnCount: number;
  chunkCount: number;
};

export type IndexedChunk = EpisodeChunk & {
  embedding: number[];
  publishedAt: string | null;
};

export type ArtifactManifest = {
  exportedAt: string;
  episodeCount: number;
  chunkCount: number;
  embeddingDimensions: number;
};
