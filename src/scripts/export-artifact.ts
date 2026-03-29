import { loadEnvConfig } from "@next/env";

import { exportArtifacts } from "@/lib/artifacts/export";

async function main() {
  loadEnvConfig(process.cwd());
  const result = await exportArtifacts();
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
