import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { EMBEDDING_DIMENSIONS } from "@/lib/config";
import { getOptionalEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { resolveFromRepo } from "@/lib/server-utils";
import type { ArtifactManifest, IndexedChunk, IndexedEpisode } from "@/lib/types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "he",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "were",
  "will",
  "with",
]);

type SearchableChunk = IndexedChunk & {
  norm: number;
  searchText: string;
  tokenCounts: Map<string, number>;
  titleText: string;
  guestText: string;
  sectionText: string;
  speakerText: string;
};

export type ArtifactBundle = {
  manifest: ArtifactManifest;
  episodes: IndexedEpisode[];
  chunks: IndexedChunk[];
};

export type ArtifactStore = ArtifactBundle & {
  searchableChunks: SearchableChunk[];
  idf: Map<string, number>;
};

declare global {
  var __dwarkeshArtifactCache:
    | {
        key: string;
        store: ArtifactStore;
      }
    | undefined;
}

export function getArtifactRootDir() {
  const configuredPath = getOptionalEnv("ARTIFACT_DIR", "./data/artifacts") ?? "./data/artifacts";
  return path.isAbsolute(configuredPath) ? configuredPath : resolveFromRepo(configuredPath);
}

export function getCurrentArtifactDir() {
  return path.join(getArtifactRootDir(), "current");
}

export function getSnapshotArtifactDir() {
  return path.join(getArtifactRootDir(), "snapshots");
}

export async function loadArtifactBundle(options?: { allowMissing?: boolean }) {
  const allowMissing = options?.allowMissing ?? false;
  const currentDir = getCurrentArtifactDir();
  const manifestPath = path.join(currentDir, "manifest.json");
  const episodesPath = path.join(currentDir, "episodes.jsonl");
  const chunksPath = path.join(currentDir, "chunks.jsonl");

  try {
    const [manifest, episodes, chunks] = await Promise.all([
      readJsonFile<ArtifactManifest>(manifestPath),
      readJsonLines<IndexedEpisode>(episodesPath),
      readJsonLines<IndexedChunk>(chunksPath),
    ]);

    return {
      manifest,
      episodes,
      chunks,
    } satisfies ArtifactBundle;
  } catch (error) {
    if (allowMissing) {
      return emptyArtifactBundle();
    }

    throw toMissingArtifactError(error);
  }
}

export async function loadArtifactStore() {
  const manifestPath = path.join(getCurrentArtifactDir(), "manifest.json");

  let metadata;
  try {
    metadata = await stat(manifestPath);
  } catch (error) {
    throw toMissingArtifactError(error);
  }

  const cacheKey = `${metadata.size}:${metadata.mtimeMs}`;
  if (global.__dwarkeshArtifactCache?.key === cacheKey) {
    return global.__dwarkeshArtifactCache.store;
  }

  const bundle = await loadArtifactBundle();
  const store = buildArtifactStore(bundle);
  global.__dwarkeshArtifactCache = {
    key: cacheKey,
    store,
  };

  return store;
}

export function tokenize(value: string) {
  return value
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((token) => token.length > 1 && !STOP_WORDS.has(token)) ?? [];
}

function buildArtifactStore(bundle: ArtifactBundle): ArtifactStore {
  const searchableChunks = bundle.chunks.map((chunk) => {
    const titleText = chunk.episodeTitle.toLowerCase();
    const guestText = chunk.guestNamesText.toLowerCase();
    const sectionText = (chunk.sectionHeading ?? "").toLowerCase();
    const speakerText = chunk.speakerNames.join(" ").toLowerCase();
    const searchText = [
      chunk.episodeTitle,
      chunk.guestNamesText,
      chunk.sectionHeading ?? "",
      chunk.speakerNames.join(" "),
      chunk.text,
    ].join(" ");

    const tokenCounts = countTokens(searchText);

    return {
      ...chunk,
      norm: vectorNorm(chunk.embedding),
      searchText: searchText.toLowerCase(),
      tokenCounts,
      titleText,
      guestText,
      sectionText,
      speakerText,
    } satisfies SearchableChunk;
  });

  const documentFrequency = new Map<string, number>();
  for (const chunk of searchableChunks) {
    for (const token of chunk.tokenCounts.keys()) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const totalDocuments = Math.max(searchableChunks.length, 1);
  const idf = new Map<string, number>();
  for (const [token, frequency] of documentFrequency) {
    idf.set(token, Math.log((totalDocuments + 1) / (frequency + 1)) + 1);
  }

  return {
    ...bundle,
    searchableChunks,
    idf,
  };
}

function countTokens(value: string) {
  const counts = new Map<string, number>();
  for (const token of tokenize(value)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return counts;
}

function vectorNorm(values: number[]) {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

async function readJsonFile<T>(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readJsonLines<T>(filePath: string) {
  const contents = await readFile(filePath, "utf8");
  return contents
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function emptyArtifactBundle(): ArtifactBundle {
  return {
    manifest: {
      exportedAt: "",
      episodeCount: 0,
      chunkCount: 0,
      embeddingDimensions: EMBEDDING_DIMENSIONS,
    },
    episodes: [],
    chunks: [],
  };
}

function toMissingArtifactError(error: unknown) {
  if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
    return new AppError(
      503,
      "No local artifact index found. Run `npm run ingest:backfill` before using search or chat.",
    );
  }

  return error instanceof Error ? error : new Error("Failed to load artifact index");
}
