import { embedDocumentBatch } from "@/lib/ai/providers";
import { exportArtifacts } from "@/lib/artifacts/export";
import { loadArtifactBundle } from "@/lib/artifacts/store";
import { chunkEpisode } from "@/lib/dwarkesh/chunking";
import { discoverEpisodeUrls } from "@/lib/dwarkesh/discovery";
import { parseEpisodeHtml } from "@/lib/dwarkesh/parser";
import type { IndexedChunk, IndexedEpisode, ParsedEpisode } from "@/lib/types";

const FETCH_ATTEMPTS = 6;
const FETCH_PACING_MS = 750;

type IngestMode = "incremental" | "backfill";

type IngestSummary = {
  mode: IngestMode;
  discovered: number;
  indexed: number;
  skipped: number;
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

export async function runIngest(mode: IngestMode): Promise<IngestSummary> {
  const existing = mode === "incremental" ? await loadArtifactBundle({ allowMissing: true }) : null;
  const episodeMap = new Map<string, IndexedEpisode>(
    existing?.episodes.map((episode) => [episode.slug, episode]) ?? [],
  );
  const chunkMap = new Map<string, IndexedChunk[]>();

  for (const chunk of existing?.chunks ?? []) {
    const current = chunkMap.get(chunk.episodeSlug);
    if (current) {
      current.push(chunk);
    } else {
      chunkMap.set(chunk.episodeSlug, [chunk]);
    }
  }

  const urls = await discoverEpisodeUrls();
  const summary: IngestSummary = {
    mode,
    discovered: urls.length,
    indexed: 0,
    skipped: 0,
    failed: [],
  };

  const nextEpisodes = new Map<string, IndexedEpisode>();
  const nextChunks = new Map<string, IndexedChunk[]>();

  for (const url of urls) {
    try {
      const html = await fetchEpisode(url);
      const parsed = await parseEpisodeHtml(html, url);
      if (!parsed) {
        summary.skipped += 1;
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
        summary.skipped += 1;
        continue;
      }

      const chunks = chunkEpisode(parsed);
      const embeddings = await embedDocumentBatch(chunks.map((chunk) => chunk.text));
      const embeddedChunks: IndexedChunk[] = chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index] ?? [],
        publishedAt: parsed.publishedAt,
      }));

      nextEpisodes.set(parsed.slug, toIndexedEpisode(parsed, embeddedChunks.length));
      nextChunks.set(parsed.slug, embeddedChunks);
      summary.indexed += 1;
    } catch (error) {
      summary.failed.push({
        url,
        error: error instanceof Error ? error.message : "Unknown ingest error",
      });
    }
  }

  if (mode === "incremental") {
    for (const [slug, episode] of episodeMap) {
      if (nextEpisodes.has(slug)) continue;
      nextEpisodes.set(slug, episode);
      nextChunks.set(slug, chunkMap.get(slug) ?? []);
    }
  }

  summary.artifact = await exportArtifacts({
    episodes: [...nextEpisodes.values()].sort(compareEpisodes),
    chunks: [...nextChunks.values()]
      .flat()
      .sort((left, right) =>
        left.episodeSlug === right.episodeSlug
          ? left.chunkIndex - right.chunkIndex
          : left.episodeSlug.localeCompare(right.episodeSlug),
      ),
  });

  return summary;
}

async function fetchEpisode(url: string) {
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await sleep(getRetryDelay(attempt));
    } else {
      await sleep(FETCH_PACING_MS);
    }

    const response = await fetch(url, {
      headers: {
        "user-agent": "dwarkesh-podcast-rag/0.1",
      },
      cache: "no-store",
    });

    if (response.ok) {
      return response.text();
    }

    if (response.status === 429 && attempt < FETCH_ATTEMPTS - 1) {
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) {
        await sleep(parseRetryAfter(retryAfter));
      }
      continue;
    }

    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  throw new Error(`Failed to fetch ${url}: exhausted retries`);
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

function getRetryDelay(attempt: number) {
  return Math.min(20_000, Math.round(FETCH_PACING_MS * 2 ** attempt));
}

function parseRetryAfter(value: string) {
  const numericSeconds = Number(value);
  if (Number.isFinite(numericSeconds) && numericSeconds > 0) {
    return numericSeconds * 1_000;
  }

  const retryDate = Date.parse(value);
  if (Number.isNaN(retryDate)) {
    return getRetryDelay(1);
  }

  return Math.max(1_000, retryDate - Date.now());
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
