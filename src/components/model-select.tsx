"use client";

import type { ModelOption } from "@/lib/types";
import { cn } from "@/lib/utils";

type ModelSelectProps = {
  models: ModelOption[];
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
};

export function ModelSelect({
  models,
  value,
  onChange,
  disabled = false,
}: ModelSelectProps) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Model
      </span>
      <select
        className={cn(
          "min-w-0 rounded-2xl border border-line bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent",
          disabled && "cursor-not-allowed opacity-60",
        )}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>
    </label>
  );
}
