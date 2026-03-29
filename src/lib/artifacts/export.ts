import { rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { EMBEDDING_DIMENSIONS } from "@/lib/config";
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

export async function exportArtifacts(input?: ExportArtifactInput) {
  const bundle = input ?? (await loadArtifactBundle());
  const exportedAt = new Date().toISOString();
  const manifest: ArtifactManifest = {
    exportedAt,
    episodeCount: bundle.episodes.length,
    chunkCount: bundle.chunks.length,
    embeddingDimensions: EMBEDDING_DIMENSIONS,
  };

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
  await Promise.all([
    writeFile(path.join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8"),
    writeJsonLines(
      path.join(targetDir, "episodes.jsonl"),
      bundle.episodes.map((episode) => JSON.stringify(episode)),
    ),
    writeJsonLines(
      path.join(targetDir, "chunks.jsonl"),
      bundle.chunks.map((chunk) => JSON.stringify(chunk)),
    ),
  ]);
}

async function writeJsonLines(filePath: string, rows: string[]) {
  await writeFile(filePath, rows.length > 0 ? `${rows.join("\n")}\n` : "", "utf8");
}
