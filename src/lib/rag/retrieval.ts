import { embedQueryText } from "@/lib/ai/providers";
import { loadArtifactStore, tokenize } from "@/lib/artifacts/store";
import { DEFAULT_CHAT_CONTEXT_LIMIT, DEFAULT_SEARCH_LIMIT } from "@/lib/config";
import type { RetrievedChunk } from "@/lib/types";

const RRF_K = 60;

export async function retrieveChunks(query: string, limit = DEFAULT_SEARCH_LIMIT) {
  const [store, embedding] = await Promise.all([loadArtifactStore(), embedQueryText(query)]);
  const semantic = scoreSemantic(query, embedding, store.searchableChunks, limit * 2);
  const lexical = scoreLexical(query, store, limit * 2);

  return reciprocalRankFuse({ lexical, semantic }).slice(0, limit);
}

export async function buildContextBlocks(query: string, limit = DEFAULT_CHAT_CONTEXT_LIMIT) {
  const hits = await retrieveChunks(query, limit);
  const blocks = hits.map((hit, index) =>
    [
      `[S${index + 1}] ${hit.episodeTitle}`,
      `URL: ${hit.sourceUrl}`,
      hit.sectionHeading ? `Section: ${hit.sectionHeading}` : null,
      hit.speakerNames.length > 0 ? `Speakers: ${hit.speakerNames.join(", ")}` : null,
      `Excerpt: ${hit.text}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return { blocks, hits };
}

function scoreSemantic(
  query: string,
  embedding: number[],
  chunks: Awaited<ReturnType<typeof loadArtifactStore>>["searchableChunks"],
  limit: number,
) {
  const queryNorm = vectorNorm(embedding);
  if (queryNorm === 0) {
    return [];
  }

  return chunks
    .map((chunk) => ({
      ...toRetrievedChunk(chunk),
      score: cosineSimilarity(embedding, queryNorm, chunk.embedding, chunk.norm),
    }))
    .filter((chunk) => Number.isFinite(chunk.score))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function scoreLexical(
  query: string,
  store: Awaited<ReturnType<typeof loadArtifactStore>>,
  limit: number,
) {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return [];
  }

  const uniqueTokens = [...new Set(tokens)];

  return store.searchableChunks
    .map((chunk) => {
      let score = 0;

      for (const token of uniqueTokens) {
        const tokenFrequency = chunk.tokenCounts.get(token) ?? 0;
        if (!tokenFrequency) continue;

        const idf = store.idf.get(token) ?? 1;
        score += (tokenFrequency / Math.max(chunk.tokenCount, 1)) * idf * 100;

        if (chunk.titleText.includes(token)) score += 2.5;
        if (chunk.guestText.includes(token)) score += 1.5;
        if (chunk.sectionText.includes(token)) score += 1.2;
        if (chunk.speakerText.includes(token)) score += 0.8;
      }

      if (!score && chunk.searchText.includes(query.toLowerCase())) {
        score += 1;
      }

      return {
        ...toRetrievedChunk(chunk),
        score,
      };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function reciprocalRankFuse({
  semantic,
  lexical,
}: {
  semantic: RetrievedChunk[];
  lexical: RetrievedChunk[];
}) {
  const scores = new Map<string, RetrievedChunk>();

  for (const [index, chunk] of semantic.entries()) {
    const existing = scores.get(chunk.id);
    const score = 1 / (RRF_K + index + 1);
    scores.set(chunk.id, {
      ...(existing ?? chunk),
      score: (existing?.score ?? 0) + score,
    });
  }

  for (const [index, chunk] of lexical.entries()) {
    const existing = scores.get(chunk.id);
    const score = 1 / (RRF_K + index + 1);
    scores.set(chunk.id, {
      ...(existing ?? chunk),
      score: (existing?.score ?? 0) + score,
    });
  }

  return [...scores.values()].sort((left, right) => right.score - left.score);
}

function toRetrievedChunk(
  chunk: Awaited<ReturnType<typeof loadArtifactStore>>["searchableChunks"][number],
): RetrievedChunk {
  return {
    id: chunk.id,
    episodeId: chunk.episodeId,
    episodeSlug: chunk.episodeSlug,
    episodeTitle: chunk.episodeTitle,
    guestNamesText: chunk.guestNamesText,
    sourceUrl: chunk.sourceUrl,
    sectionHeading: chunk.sectionHeading,
    speakerNames: chunk.speakerNames,
    chunkIndex: chunk.chunkIndex,
    tokenCount: chunk.tokenCount,
    text: chunk.text,
    publishedAt: chunk.publishedAt,
    score: 0,
  };
}

function cosineSimilarity(
  left: number[],
  leftNorm: number,
  right: number[],
  rightNorm: number,
) {
  if (!leftNorm || !rightNorm) return 0;

  let dotProduct = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    dotProduct += left[index] * right[index];
  }

  return dotProduct / (leftNorm * rightNorm);
}

function vectorNorm(values: number[]) {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}
