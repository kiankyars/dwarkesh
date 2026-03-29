import { loadEnvConfig } from "@next/env";

import { runIngest } from "@/lib/dwarkesh/ingest";

type IngestMode = "incremental" | "backfill";

async function main() {
  loadEnvConfig(process.cwd());
  const mode = parseMode(process.argv.slice(2));
  const summary = await runIngest(mode);
  console.log(JSON.stringify(summary, null, 2));
}

function parseMode(args: string[]): IngestMode {
  const explicit = args.find((arg) => arg.startsWith("--mode="));
  if (!explicit) return "incremental";
  return explicit.split("=")[1] === "backfill" ? "backfill" : "incremental";
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
