import { DEFAULT_CHUNK_MAX_TOKENS } from "@/lib/config";
import { estimateTokens, unique } from "@/lib/utils";
import type { EpisodeChunk, ParsedEpisode, ParsedTranscriptTurn } from "@/lib/types";

type ChunkingOptions = {
  maxTokens?: number;
  overlapTokens?: number;
};

export const DEFAULT_MAX_TOKENS = DEFAULT_CHUNK_MAX_TOKENS;
const DEFAULT_OVERLAP_TOKENS = 150;

export function chunkEpisode(
  episode: ParsedEpisode,
  options: ChunkingOptions = {},
): EpisodeChunk[] {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  const chunks: EpisodeChunk[] = [];

  let currentTurns: ParsedTranscriptTurn[] = [];
  const transcriptTurns = episode.transcriptTurns.flatMap((turn) =>
    splitOversizedTurn(turn, maxTokens),
  );

  const flush = () => {
    if (currentTurns.length === 0) return;

    const text = renderChunkText(currentTurns);
    chunks.push({
      id: `${episode.id}:chunk:${chunks.length}`,
      episodeId: episode.id,
      episodeSlug: episode.slug,
      episodeTitle: episode.title,
      guestNamesText: episode.guestNames.join(", "),
      sourceUrl: episode.sourceUrl,
      sectionHeading: currentTurns[0]?.sectionHeading ?? null,
      speakerNames: unique(currentTurns.map((turn) => turn.speaker)),
      chunkIndex: chunks.length,
      tokenCount: estimateTokens(text),
      text,
    });
  };

  for (const turn of transcriptTurns) {
    if (currentTurns.length > 0 && chunkTokenCount([...currentTurns, turn]) > maxTokens) {
      flush();
      currentTurns = carryOverlap(currentTurns, overlapTokens);
    }

    if (currentTurns.length > 0 && chunkTokenCount([...currentTurns, turn]) > maxTokens) {
      currentTurns = [];
    }

    currentTurns.push(turn);
  }

  flush();
  return chunks;
}

function splitOversizedTurn(
  turn: ParsedTranscriptTurn,
  maxTokens: number,
): ParsedTranscriptTurn[] {
  if (chunkTokenCount([turn]) <= maxTokens) {
    return [turn];
  }

  const headingReserve = turn.sectionHeading ? estimateTokens(`## ${turn.sectionHeading}`) : 0;
  const textBudget = Math.max(1, maxTokens - headingReserve);

  return splitTextByBudget(turn.text, turn.speaker, textBudget).map((text, index) => ({
    ...turn,
    text,
    sectionHeading: index === 0 ? turn.sectionHeading : null,
  }));
}

function splitTextByBudget(text: string, speaker: string, maxTokens: number) {
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const sentenceParts = paragraphs.flatMap(splitSentences);
  const pieces: string[] = [];
  let current = "";

  const flushCurrent = () => {
    if (!current.trim()) return;
    pieces.push(current.trim());
    current = "";
  };

  for (const part of sentenceParts) {
    if (fitsBudget(part, speaker, maxTokens)) {
      const candidate = current ? `${current} ${part}` : part;
      if (fitsBudget(candidate, speaker, maxTokens)) {
        current = candidate;
      } else {
        flushCurrent();
        current = part;
      }
      continue;
    }

    flushCurrent();
    pieces.push(...splitWordsByBudget(part, speaker, maxTokens));
  }

  flushCurrent();
  return pieces;
}

function splitSentences(text: string) {
  return (
    text
      .match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)
      ?.map((part) => part.trim())
      .filter(Boolean) ?? [text]
  );
}

function splitWordsByBudget(text: string, speaker: string, maxTokens: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const pieces: string[] = [];
  let current: string[] = [];

  for (const word of words) {
    const candidate = [...current, word].join(" ");
    if (current.length > 0 && !fitsBudget(candidate, speaker, maxTokens)) {
      pieces.push(current.join(" "));
      current = [word];
    } else {
      current.push(word);
    }
  }

  if (current.length > 0) {
    pieces.push(current.join(" "));
  }

  return pieces;
}

function fitsBudget(text: string, speaker: string, maxTokens: number) {
  return estimateTokens(`${speaker}: ${text}`) <= maxTokens;
}

function carryOverlap(turns: ParsedTranscriptTurn[], overlapTokens: number) {
  const carried: ParsedTranscriptTurn[] = [];
  let total = 0;

  for (const turn of [...turns].reverse()) {
    carried.unshift(turn);
    total += estimateTokens(renderTurn(turn));
    if (total >= overlapTokens) break;
  }

  return carried;
}

function chunkTokenCount(turns: ParsedTranscriptTurn[]) {
  return estimateTokens(renderChunkText(turns));
}

function renderChunkText(turns: ParsedTranscriptTurn[]) {
  const lines: string[] = [];
  let activeHeading: string | null = null;

  for (const turn of turns) {
    if (turn.sectionHeading && turn.sectionHeading !== activeHeading) {
      activeHeading = turn.sectionHeading;
      lines.push(`## ${activeHeading}`);
    }

    lines.push(renderTurn(turn));
  }

  return lines.join("\n\n");
}

function renderTurn(turn: ParsedTranscriptTurn) {
  return `${turn.speaker}: ${turn.text}`;
}
