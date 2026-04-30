import { DEFAULT_CHUNK_MAX_TOKENS, EMBEDDING_DIMENSIONS } from "@/lib/config";
import type { ArtifactManifest, IndexedChunk, IndexedEpisode } from "@/lib/types";

export type ArtifactAuditOptions = {
  expectedEpisodeCount?: number;
  expectedSlugs?: string[];
  maxChunkTokens?: number;
  embeddingDimensions?: number;
};

export type ArtifactAuditResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

type AuditableBundle = {
  manifest?: ArtifactManifest;
  episodes: IndexedEpisode[];
  chunks: IndexedChunk[];
};

export function auditArtifactBundle(
  bundle: AuditableBundle,
  options: ArtifactAuditOptions = {},
): ArtifactAuditResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const maxChunkTokens = options.maxChunkTokens ?? DEFAULT_CHUNK_MAX_TOKENS;
  const embeddingDimensions =
    options.embeddingDimensions ?? bundle.manifest?.embeddingDimensions ?? EMBEDDING_DIMENSIONS;
  const expectedEpisodeCount = options.expectedEpisodeCount ?? bundle.manifest?.expectedEpisodeCount;

  if (bundle.manifest) {
    if (bundle.manifest.episodeCount !== bundle.episodes.length) {
      errors.push(
        `Manifest episodeCount ${bundle.manifest.episodeCount} does not match ${bundle.episodes.length} episodes`,
      );
    }

    if (bundle.manifest.chunkCount !== bundle.chunks.length) {
      errors.push(
        `Manifest chunkCount ${bundle.manifest.chunkCount} does not match ${bundle.chunks.length} chunks`,
      );
    }

    if (bundle.manifest.embeddingDimensions !== embeddingDimensions) {
      errors.push(
        `Manifest embeddingDimensions ${bundle.manifest.embeddingDimensions} does not match expected ${embeddingDimensions}`,
      );
    }
  }

  if (expectedEpisodeCount !== undefined && bundle.episodes.length < expectedEpisodeCount) {
    errors.push(
      `Indexed ${bundle.episodes.length} episodes, below expected ${expectedEpisodeCount}`,
    );
  }

  checkUnique(
    bundle.episodes.map((episode) => episode.id),
    "episode id",
    errors,
  );
  checkUnique(
    bundle.episodes.map((episode) => episode.slug),
    "episode slug",
    errors,
  );
  checkUnique(
    bundle.chunks.map((chunk) => chunk.id),
    "chunk id",
    errors,
  );

  const episodesBySlug = new Map(bundle.episodes.map((episode) => [episode.slug, episode]));
  const chunksByEpisodeSlug = new Map<string, IndexedChunk[]>();

  for (const chunk of bundle.chunks) {
    if (!episodesBySlug.has(chunk.episodeSlug)) {
      errors.push(`Chunk ${chunk.id} references unknown episode slug ${chunk.episodeSlug}`);
    }

    if (!chunk.text.trim()) {
      errors.push(`Chunk ${chunk.id} has empty text`);
    }

    if (chunk.tokenCount > maxChunkTokens) {
      errors.push(
        `Chunk ${chunk.id} has ${chunk.tokenCount} tokens, above max ${maxChunkTokens}`,
      );
    }

    if (chunk.embedding.length !== embeddingDimensions) {
      errors.push(
        `Chunk ${chunk.id} embedding has ${chunk.embedding.length} dimensions, expected ${embeddingDimensions}`,
      );
    }

    const current = chunksByEpisodeSlug.get(chunk.episodeSlug) ?? [];
    current.push(chunk);
    chunksByEpisodeSlug.set(chunk.episodeSlug, current);
  }

  for (const episode of bundle.episodes) {
    const chunks = chunksByEpisodeSlug.get(episode.slug) ?? [];
    if (episode.chunkCount !== chunks.length) {
      errors.push(
        `Episode ${episode.slug} declares ${episode.chunkCount} chunks but has ${chunks.length}`,
      );
    }

    if (episode.turnCount <= 0) {
      errors.push(`Episode ${episode.slug} has no transcript turns`);
    }

    if (episode.chunkCount <= 0) {
      errors.push(`Episode ${episode.slug} has no chunks`);
    }
  }

  for (const expectedSlug of options.expectedSlugs ?? []) {
    if (!episodesBySlug.has(expectedSlug)) {
      errors.push(`Expected episode slug ${expectedSlug} is missing`);
    }
  }

  if (bundle.episodes.length > 0 && bundle.chunks.length === 0) {
    errors.push("Artifact has episodes but no chunks");
  }

  const lowTurnEpisodes = bundle.episodes.filter(
    (episode) => episode.turnCount <= 2 && episode.chunkCount <= 2,
  );
  if (lowTurnEpisodes.length > 0) {
    warnings.push(
      `Episodes with very low turn/chunk counts: ${lowTurnEpisodes
        .slice(0, 10)
        .map((episode) => episode.slug)
        .join(", ")}`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function assertArtifactAudit(result: ArtifactAuditResult) {
  if (result.ok) return;
  throw new Error(`Artifact audit failed:\n${result.errors.map((error) => `- ${error}`).join("\n")}`);
}

function checkUnique(values: string[], label: string, errors: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      errors.push(`Duplicate ${label}: ${value}`);
    }
    seen.add(value);
  }
}
