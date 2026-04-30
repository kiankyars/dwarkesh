import { appendFile, readFile, rm } from "node:fs/promises";
import path from "node:path";

import {
  DWARKESH_ARCHIVE_API_URL,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  EMBEDDING_PROVIDER,
} from "@/lib/config";
import { embedDocumentBatch } from "@/lib/ai/providers";
import { exportArtifacts } from "@/lib/artifacts/export";
import { getArtifactRootDir, loadArtifactBundle } from "@/lib/artifacts/store";
import { chunkEpisode } from "@/lib/dwarkesh/chunking";
import {
  discoverPodcastPosts,
  fetchPostDetail,
  type DiscoveredPodcastPost,
} from "@/lib/dwarkesh/discovery";
import { parseSubstackPostDetail } from "@/lib/dwarkesh/parser";
import { ensureDirectory } from "@/lib/server-utils";
import type { IndexedChunk, IndexedEpisode, ParsedEpisode } from "@/lib/types";

const FETCH_PACING_MS = 750;

type IngestMode = "incremental" | "backfill";

type IngestSummary = {
  mode: IngestMode;
  discovered: number;
  indexed: number;
  unchanged: number;
  cached: number;
  skipped: number;
  skippedSources: Array<{ url: string; reason: string }>;
  failed: Array<{ url: string; error: string }>;
  artifact?: {
    snapshotDir: string;
    currentDir: string;
    episodeCount: number;
    chunkCount: number;
    embeddingDimensions: number;
    exportedAt: string;
  };
};

type IngestCheckpointRecord = {
  slug: string;
  episode: IndexedEpisode;
  chunks: IndexedChunk[];
};

export async function runIngest(mode: IngestMode): Promise<IngestSummary> {
  const existing = mode === "incremental" ? await loadArtifactBundle({ allowMissing: true }) : null;
  const canReuseExisting = existing ? hasCompatibleEmbeddingConfig(existing.manifest) : false;
  const episodeMap = new Map<string, IndexedEpisode>(
    canReuseExisting ? existing?.episodes.map((episode) => [episode.slug, episode]) ?? [] : [],
  );
  const chunkMap = new Map<string, IndexedChunk[]>();

  for (const chunk of canReuseExisting ? existing?.chunks ?? [] : []) {
    const current = chunkMap.get(chunk.episodeSlug);
    if (current) {
      current.push(chunk);
    } else {
      chunkMap.set(chunk.episodeSlug, [chunk]);
    }
  }

  if (existing && !canReuseExisting && existing.episodes.length > 0) {
    console.log(
      `[ingest] existing artifact uses ${existing.manifest.embeddingProvider ?? "unknown"}/${
        existing.manifest.embeddingModel ?? "unknown"
      }/${existing.manifest.embeddingDimensions}; re-embedding with ${EMBEDDING_PROVIDER}/${EMBEDDING_MODEL_ID}/${EMBEDDING_DIMENSIONS}`,
    );
  }

  const posts = await discoverPodcastPosts();
  if (existing && posts.length < existing.episodes.length) {
    throw new Error(
      `Discovery returned ${posts.length} podcast posts, below existing index size ${existing.episodes.length}; refusing to overwrite artifacts`,
    );
  }

  const summary: IngestSummary = {
    mode,
    discovered: posts.length,
    indexed: 0,
    unchanged: 0,
    cached: 0,
    skipped: 0,
    skippedSources: [],
    failed: [],
  };

  const nextEpisodes = new Map<string, IndexedEpisode>();
  const nextChunks = new Map<string, IndexedChunk[]>();
  const checkpoint = mode === "backfill" ? await loadIngestCheckpoint() : new Map();

  for (const [index, post] of posts.entries()) {
    try {
      console.log(`[ingest] ${index + 1}/${posts.length} ${post.slug}`);
      await sleep(FETCH_PACING_MS);

      const detail = await fetchPostDetail(post.slug);
      const parsed = await parseSubstackPostDetail(detail, post);
      if (!parsed) {
        summary.skipped += 1;
        summary.skippedSources.push({
          url: post.sourceUrl,
          reason: "No public transcript found in Substack post detail",
        });
        console.log(`[ingest] skipped ${post.slug}: no public transcript`);
        continue;
      }

      const existingEpisode = episodeMap.get(parsed.slug);
      const unchanged =
        mode === "incremental" &&
        existingEpisode &&
        existingEpisode.htmlChecksum === parsed.htmlChecksum &&
        existingEpisode.transcriptChecksum === parsed.transcriptChecksum;

      if (unchanged) {
        nextEpisodes.set(parsed.slug, existingEpisode);
        nextChunks.set(parsed.slug, chunkMap.get(parsed.slug) ?? []);
        summary.unchanged += 1;
        console.log(`[ingest] unchanged ${parsed.slug}`);
        continue;
      }

      const cached = checkpoint.get(parsed.slug);
      if (
        cached &&
        cached.episode.htmlChecksum === parsed.htmlChecksum &&
        cached.episode.transcriptChecksum === parsed.transcriptChecksum
      ) {
        nextEpisodes.set(parsed.slug, cached.episode);
        nextChunks.set(parsed.slug, cached.chunks);
        summary.cached += 1;
        console.log(`[ingest] cached ${parsed.slug}: ${cached.chunks.length} chunks`);
        continue;
      }

      const embeddedChunks = await embedParsedEpisode(parsed).catch((error) => {
        throw new Error(`Embedding failed for ${parsed.slug}: ${formatError(error)}`, {
          cause: error,
        });
      });
      const indexedEpisode = toIndexedEpisode(parsed, embeddedChunks.length);
      nextEpisodes.set(parsed.slug, indexedEpisode);
      nextChunks.set(parsed.slug, embeddedChunks);
      if (mode === "backfill") {
        await appendIngestCheckpoint({
          slug: parsed.slug,
          episode: indexedEpisode,
          chunks: embeddedChunks,
        });
      }
      summary.indexed += 1;
      console.log(`[ingest] indexed ${parsed.slug}: ${embeddedChunks.length} chunks`);
    } catch (error) {
      if (isFatalIngestError(error)) {
        throw error;
      }

      summary.failed.push({
        url: post.sourceUrl,
        error: formatError(error),
      });
      console.error(
        `[ingest] failed ${post.slug}: ${formatError(error)}`,
      );
    }
  }

  assertCompleteIngest(posts, summary);
  const skippedUrls = new Set(summary.skippedSources.map((source) => source.url));

  summary.artifact = await exportArtifacts(
    {
      episodes: [...nextEpisodes.values()].sort(compareEpisodes),
      chunks: [...nextChunks.values()]
        .flat()
        .sort((left, right) =>
          left.episodeSlug === right.episodeSlug
            ? left.chunkIndex - right.chunkIndex
            : left.episodeSlug.localeCompare(right.episodeSlug),
        ),
    },
    {
      expectedEpisodeCount: posts.length - summary.skipped,
      expectedSlugs: posts
        .filter((post) => !skippedUrls.has(post.sourceUrl))
        .map((post) => post.slug),
      skippedCount: summary.skipped,
      failedCount: summary.failed.length,
      embeddingProvider: EMBEDDING_PROVIDER,
      embeddingModel: EMBEDDING_MODEL_ID,
      embeddingDimensions: EMBEDDING_DIMENSIONS,
      source: {
        name: "Substack archive API",
        url: DWARKESH_ARCHIVE_API_URL,
        fetchedAt: new Date().toISOString(),
      },
    },
  );

  if (mode === "backfill") {
    await clearIngestCheckpoint();
  }

  return summary;
}

async function embedParsedEpisode(parsed: ParsedEpisode) {
  const chunks = chunkEpisode(parsed);
  console.log(`[ingest] embedding ${parsed.slug}: ${chunks.length} chunks`);
  const embeddings = await embedDocumentBatch(chunks.map((chunk) => chunk.text));

  return chunks.map((chunk, index): IndexedChunk => {
    const embedding = embeddings[index] ?? [];
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding for ${chunk.id} has ${embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`,
      );
    }

    return {
      ...chunk,
      embedding,
      publishedAt: parsed.publishedAt,
    };
  });
}

function assertCompleteIngest(posts: DiscoveredPodcastPost[], summary: IngestSummary) {
  if (summary.failed.length > 0) {
    throw new Error(
      `Ingest failed for ${summary.failed.length} of ${posts.length} discovered podcast posts; refusing to overwrite artifacts`,
    );
  }
}

function toIndexedEpisode(parsed: ParsedEpisode, chunkCount: number): IndexedEpisode {
  return {
    id: parsed.id,
    slug: parsed.slug,
    title: parsed.title,
    guestNames: parsed.guestNames,
    publishedAt: parsed.publishedAt,
    sourceUrl: parsed.sourceUrl,
    htmlChecksum: parsed.htmlChecksum,
    transcriptChecksum: parsed.transcriptChecksum,
    turnCount: parsed.transcriptTurns.length,
    chunkCount,
  };
}

function compareEpisodes(left: IndexedEpisode, right: IndexedEpisode) {
  return (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "");
}

function hasCompatibleEmbeddingConfig(manifest: {
  embeddingProvider?: string;
  embeddingModel?: string;
  embeddingDimensions: number;
}) {
  return (
    manifest.embeddingProvider === EMBEDDING_PROVIDER &&
    manifest.embeddingModel === EMBEDDING_MODEL_ID &&
    manifest.embeddingDimensions === EMBEDDING_DIMENSIONS
  );
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadIngestCheckpoint() {
  const checkpoint = new Map<string, IngestCheckpointRecord>();
  const checkpointPath = getIngestCheckpointPath();

  let fileContents: string;
  try {
    fileContents = await readFile(checkpointPath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return checkpoint;
    }
    throw error;
  }

  for (const line of fileContents.split(/\r?\n/)) {
    if (!line.trim()) continue;

    const record = JSON.parse(line) as IngestCheckpointRecord;
    if (isValidCheckpointRecord(record)) {
      checkpoint.set(record.slug, record);
    }
  }

  if (checkpoint.size > 0) {
    console.log(`[ingest] loaded ${checkpoint.size} checkpointed episodes`);
  }

  return checkpoint;
}

async function appendIngestCheckpoint(record: IngestCheckpointRecord) {
  const checkpointPath = getIngestCheckpointPath();
  await ensureDirectory(path.dirname(checkpointPath));
  await appendFile(checkpointPath, `${JSON.stringify(record)}\n`, "utf8");
}

async function clearIngestCheckpoint() {
  await rm(getIngestCheckpointPath(), { force: true });
}

function getIngestCheckpointPath() {
  return path.join(
    getArtifactRootDir(),
    ".ingest-checkpoints",
    `${safePathSegment(EMBEDDING_PROVIDER)}-${safePathSegment(
      EMBEDDING_MODEL_ID,
    )}-${EMBEDDING_DIMENSIONS}.jsonl`,
  );
}

function isValidCheckpointRecord(record: IngestCheckpointRecord) {
  return (
    typeof record.slug === "string" &&
    record.episode?.slug === record.slug &&
    Array.isArray(record.chunks) &&
    record.chunks.length === record.episode.chunkCount &&
    record.chunks.every((chunk) => chunk.embedding.length === EMBEDDING_DIMENSIONS)
  );
}

function safePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function isMissingFileError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown ingest error";
}

function isFatalIngestError(error: unknown) {
  return /embedding failed|quota|resource exhausted|rate limit/i.test(formatError(error));
}
