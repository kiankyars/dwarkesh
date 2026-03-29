import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function estimateTokens(value: string) {
  const wordCount = value.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount * 1.3));
}

export function unique<T>(values: Iterable<T>) {
  return [...new Set(values)];
}

export function slugFromUrl(url: string) {
  return url.replace(/\/+$/, "").split("/").at(-1) ?? url;
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "Unknown date";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
