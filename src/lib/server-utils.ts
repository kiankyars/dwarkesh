import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function ensureDirectory(directoryPath: string) {
  await mkdir(directoryPath, { recursive: true });
  return directoryPath;
}

export function resolveFromRepo(...segments: string[]) {
  return path.join(process.cwd(), ...segments);
}
