import { loadEnvConfig } from "@next/env";

import { assertArtifactAudit, auditArtifactBundle } from "@/lib/artifacts/audit";
import { loadArtifactBundle } from "@/lib/artifacts/store";

async function main() {
  loadEnvConfig(process.cwd());
  const bundle = await loadArtifactBundle();
  const result = auditArtifactBundle(bundle);
  assertArtifactAudit(result);

  console.log(
    JSON.stringify(
      {
        ok: true,
        episodeCount: bundle.episodes.length,
        chunkCount: bundle.chunks.length,
        warnings: result.warnings,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
