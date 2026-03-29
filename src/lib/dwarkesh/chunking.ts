import { estimateTokens, unique } from "@/lib/utils";
import type { EpisodeChunk, ParsedEpisode, ParsedTranscriptTurn } from "@/lib/types";

type ChunkingOptions = {
  maxTokens?: number;
  overlapTokens?: number;
};

const DEFAULT_MAX_TOKENS = 850;
const DEFAULT_OVERLAP_TOKENS = 150;

export function chunkEpisode(
  episode: ParsedEpisode,
  options: ChunkingOptions = {},
): EpisodeChunk[] {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  const chunks: EpisodeChunk[] = [];

  let currentTurns: ParsedTranscriptTurn[] = [];
  let currentTokens = 0;

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

  for (const turn of episode.transcriptTurns) {
    const turnText = renderTurn(turn);
    const turnTokens = estimateTokens(turnText);

    if (currentTurns.length > 0 && currentTokens + turnTokens > maxTokens) {
      flush();
      currentTurns = carryOverlap(currentTurns, overlapTokens);
      currentTokens = estimateTokens(renderChunkText(currentTurns));
    }

    currentTurns.push(turn);
    currentTokens += turnTokens;
  }

  flush();
  return chunks;
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
