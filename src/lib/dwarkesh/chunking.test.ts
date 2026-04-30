import assert from "node:assert/strict";
import test from "node:test";

import { chunkEpisode } from "@/lib/dwarkesh/chunking";
import type { ParsedEpisode } from "@/lib/types";

test("splits a single oversized transcript turn into capped chunks", () => {
  const repeatedText = Array.from({ length: 1_800 }, (_, index) => `word${index}`).join(" ");
  const chunks = chunkEpisode(makeEpisode(repeatedText), {
    maxTokens: 120,
    overlapTokens: 20,
  });

  assert.ok(chunks.length > 1);
  assert.ok(
    chunks.every((chunk) => chunk.tokenCount <= 120),
    `Chunk token counts: ${chunks.map((chunk) => chunk.tokenCount).join(", ")}`,
  );
  assert.equal(chunks[0]?.sectionHeading, "00:00:00 – Opening");
});

test("accounts for section heading text when building chunk budgets", () => {
  const transcriptTurns = Array.from({ length: 12 }, (_, index) => ({
    sectionHeading: `00:${String(index).padStart(2, "0")}:00 – Topic ${index}`,
    timestamp: `00:${String(index).padStart(2, "0")}:00`,
    speaker: "Test Guest",
    text: "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu",
  }));

  const chunks = chunkEpisode(
    {
      ...makeEpisode("placeholder"),
      transcriptTurns,
    },
    {
      maxTokens: 60,
      overlapTokens: 10,
    },
  );

  assert.ok(chunks.length > 1);
  assert.ok(
    chunks.every((chunk) => chunk.tokenCount <= 60),
    `Chunk token counts: ${chunks.map((chunk) => chunk.tokenCount).join(", ")}`,
  );
});

function makeEpisode(text: string): ParsedEpisode {
  return {
    id: "episode:test",
    slug: "test",
    title: "Test Episode",
    guestNames: ["Test Guest"],
    publishedAt: "2026-01-01T00:00:00.000Z",
    sourceUrl: "https://www.dwarkesh.com/p/test",
    htmlChecksum: "html",
    transcriptChecksum: "transcript",
    transcriptTurns: [
      {
        sectionHeading: "00:00:00 – Opening",
        timestamp: "00:00:00",
        speaker: "Test Guest",
        text,
      },
    ],
  };
}
