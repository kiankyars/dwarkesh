import { AppError } from "@/lib/errors";

export function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new AppError(500, `${name} is not configured`);
  }

  return value;
}

export function getOptionalEnv(name: string, fallback?: string) {
  return process.env[name] ?? fallback;
}
