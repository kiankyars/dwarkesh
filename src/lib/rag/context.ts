import { DEFAULT_CHAT_CONTEXT_LIMIT } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { buildContextBlocks } from "@/lib/rag/retrieval";
import type { RagContextMessage, RagContextPayload, RagSource } from "@/lib/types";

const MAX_TOP_K = 12;

export async function buildGroundingContext({
  messages,
  topK,
}: {
  messages: RagContextMessage[];
  topK?: number;
}): Promise<RagContextPayload> {
  const query = extractLatestUserText(messages);
  if (!query) {
    throw new AppError(400, "Unable to extract the latest user message");
  }

  const { blocks, hits } = await buildContextBlocks(query, normalizeTopK(topK));
  const sources = hits.map(
    (hit, index): RagSource => ({
      id: hit.id,
      label: `S${index + 1}`,
      sourceUrl: hit.sourceUrl,
      episodeTitle: hit.episodeTitle,
      sectionHeading: hit.sectionHeading,
      speakerNames: hit.speakerNames,
      snippet: hit.text,
      publishedAt: hit.publishedAt,
      score: hit.score,
    }),
  );

  return {
    query,
    injectedSystemText: buildInjectedSystemText(blocks),
    sources,
  };
}

export function extractLatestUserText(messages: RagContextMessage[]) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  if (!latestUserMessage) {
    return "";
  }

  return stringifyMessageContent(latestUserMessage.content).trim();
}

function normalizeTopK(value?: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_CHAT_CONTEXT_LIMIT;
  }

  return Math.max(1, Math.min(MAX_TOP_K, Math.floor(value ?? DEFAULT_CHAT_CONTEXT_LIMIT)));
}

function buildInjectedSystemText(blocks: string[]) {
  if (blocks.length === 0) {
    return [
      "You answer questions only from the Dwarkesh Patel podcast transcript archive.",
      "No supporting transcript evidence was retrieved for this request.",
      "Reply with a brief insufficient-evidence answer instead of guessing.",
    ].join("\n");
  }

  return [
    "You answer questions only from the Dwarkesh Patel podcast transcript archive.",
    "Use only the transcript evidence below.",
    "Cite supporting evidence inline with labels like [S1] and [S2].",
    "If the evidence is insufficient or conflicting, say so plainly.",
    "",
    "Transcript evidence:",
    ...blocks,
  ].join("\n");
}

function stringifyMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => stringifyMessageContent(part)).filter(Boolean).join("\n");
  }

  if (content && typeof content === "object") {
    const textValue =
      "text" in content
        ? (content as { text?: unknown }).text
        : "content" in content
          ? (content as { content?: unknown }).content
          : undefined;

    if (typeof textValue === "string") {
      return textValue;
    }

    if (Array.isArray(textValue)) {
      return stringifyMessageContent(textValue);
    }
  }

  return "";
}
