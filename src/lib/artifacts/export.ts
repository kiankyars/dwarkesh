import { rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  EMBEDDING_PROVIDER,
  GEMINI_EMBEDDING_MODEL_ID,
} from "@/lib/config";
import { assertArtifactAudit, auditArtifactBundle } from "@/lib/artifacts/audit";
import {
  getCurrentArtifactDir,
  getSnapshotArtifactDir,
  loadArtifactBundle,
  type ArtifactBundle,
} from "@/lib/artifacts/store";
import { ensureDirectory } from "@/lib/server-utils";
import type { ArtifactManifest, IndexedChunk, IndexedEpisode } from "@/lib/types";

type ExportArtifactInput = {
  episodes: IndexedEpisode[];
  chunks: IndexedChunk[];
};

const CHUNKS_PER_FILE = 500;

type ExportArtifactOptions = {
  expectedEpisodeCount?: number;
  expectedSlugs?: string[];
  skippedCount?: number;
  failedCount?: number;
  embeddingProvider?: ArtifactManifest["embeddingProvider"];
  embeddingModel?: string;
  embeddingDimensions?: number;
  source?: ArtifactManifest["source"];
};

export async function exportArtifacts(input?: ExportArtifactInput, options: ExportArtifactOptions = {}) {
  const bundle = input ?? (await loadArtifactBundle());
  const existingManifest: ArtifactManifest | undefined =
    "manifest" in bundle ? (bundle as ArtifactBundle).manifest : undefined;
  const exportedAt = new Date().toISOString();
  const chunkFiles = getChunkFiles(bundle.chunks.length);
  const embeddingDimensions =
    options.embeddingDimensions ?? existingManifest?.embeddingDimensions ?? EMBEDDING_DIMENSIONS;
  const embeddingProvider =
    options.embeddingProvider ??
    existingManifest?.embeddingProvider ??
    (embeddingDimensions === 1536 ? "gemini" : EMBEDDING_PROVIDER);
  const embeddingModel =
    options.embeddingModel ??
    existingManifest?.embeddingModel ??
    (embeddingProvider === "gemini" ? GEMINI_EMBEDDING_MODEL_ID : EMBEDDING_MODEL_ID);
  const manifest: ArtifactManifest = {
    schemaVersion: 2,
    exportedAt,
    episodeCount: bundle.episodes.length,
    chunkCount: bundle.chunks.length,
    embeddingProvider,
    embeddingModel,
    embeddingDimensions,
    chunkFiles,
    expectedEpisodeCount: options.expectedEpisodeCount,
    skippedCount: options.skippedCount,
    failedCount: options.failedCount,
    source: options.source,
  };

  assertArtifactAudit(
    auditArtifactBundle(
      {
        ...bundle,
        manifest,
      },
      {
        expectedEpisodeCount: options.expectedEpisodeCount,
        expectedSlugs: options.expectedSlugs,
        embeddingDimensions,
      },
    ),
  );

  const snapshotDir = path.join(
    getSnapshotArtifactDir(),
    exportedAt.replace(/[:.]/g, "-"),
  );
  const currentDir = getCurrentArtifactDir();

  await writeBundle(snapshotDir, bundle, manifest);
  await writeBundle(currentDir, bundle, manifest, { replace: true });

  return {
    snapshotDir,
    currentDir,
    ...manifest,
  };
}

async function writeBundle(
  targetDir: string,
  bundle: ExportArtifactInput | ArtifactBundle,
  manifest: ArtifactManifest,
  options?: { replace?: boolean },
) {
  if (options?.replace) {
    await rm(targetDir, { recursive: true, force: true });
  }

  await ensureDirectory(targetDir);
  await ensureDirectory(path.join(targetDir, "chunks"));

  const chunkFileWrites = getChunkFileRows(bundle.chunks).map(({ file, rows }) =>
    writeJsonLines(
      path.join(targetDir, file),
      rows.map((chunk) => JSON.stringify(chunk)),
    ),
  );

  await Promise.all([
    writeFile(path.join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8"),
    writeJsonLines(
      path.join(targetDir, "episodes.jsonl"),
      bundle.episodes.map((episode) => JSON.stringify(episode)),
    ),
    ...chunkFileWrites,
  ]);
}

async function writeJsonLines(filePath: string, rows: string[]) {
  await writeFile(filePath, rows.length > 0 ? `${rows.join("\n")}\n` : "", "utf8");
}

function getChunkFiles(chunkCount: number) {
  const fileCount = Math.ceil(chunkCount / CHUNKS_PER_FILE);
  return Array.from({ length: fileCount }, (_, index) => chunkFileName(index));
}

function getChunkFileRows(chunks: IndexedChunk[]) {
  return getChunkFiles(chunks.length).map((file, index) => ({
    file,
    rows: chunks.slice(index * CHUNKS_PER_FILE, (index + 1) * CHUNKS_PER_FILE),
  }));
}

function chunkFileName(index: number) {
  return `chunks/chunks-${String(index).padStart(3, "0")}.jsonl`;
}
