import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { sha256 } from "@/lib/server-utils";
import { slugFromUrl, unique } from "@/lib/utils";
import type { ParsedEpisode, ParsedTranscriptTurn } from "@/lib/types";

const TRANSCRIPT_HEADING = /^transcript$/i;
const TIMESTAMP_HEADING = /^(\d+:)?\d{1,2}:\d{2}\s*-\s*/;
const INLINE_SPEAKER = /^([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,4}):\s+(.+)$/;
const HOST_NAME = "Dwarkesh Patel";

type TranscriptSegment = {
  start?: number;
  end?: number;
  text?: string;
  speaker?: string;
};

export async function parseEpisodeHtml(html: string, sourceUrl: string): Promise<ParsedEpisode | null> {
  const $ = cheerio.load(html);
  const article = $("article").first();
  const root = article.length > 0 ? article : $("body");

  const title = extractTitle($, root);
  if (!title) return null;

  const guestNames = extractGuestNames(title);
  const transcriptTurns = await extractTranscriptTurns($, root, html, guestNames);
  if (transcriptTurns.length === 0) {
    return null;
  }

  const slug = slugFromUrl(sourceUrl);
  const transcriptChecksum = sha256(JSON.stringify(transcriptTurns));

  return {
    id: `episode:${slug}`,
    slug,
    title,
    guestNames,
    publishedAt: extractPublishedAt($),
    sourceUrl,
    htmlChecksum: sha256(html),
    transcriptChecksum,
    transcriptTurns,
  };
}

async function extractTranscriptTurns(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
  html: string,
  guestNames: string[],
) {
  const transcriptAssetUrl = extractTranscriptAssetUrl(html);
  if (transcriptAssetUrl) {
    const remoteTurns = await fetchTranscriptTurns(transcriptAssetUrl, guestNames);
    if (remoteTurns.length > 0) {
      return remoteTurns;
    }
  }

  return extractInlineTranscriptTurns($, root);
}

function extractInlineTranscriptTurns(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
) {
  const nodes = root.find("h2, h3, h4, p, li, blockquote").toArray();
  const turns: ParsedTranscriptTurn[] = [];
  let inTranscript = false;
  let currentHeading: string | null = null;
  let pendingSpeaker: string | null = null;

  for (const node of nodes) {
    const tagName = node.tagName.toLowerCase();
    const text = normalizeText($(node).text());
    if (!text) continue;

    if (!inTranscript) {
      if ((tagName === "h2" || tagName === "h3") && TRANSCRIPT_HEADING.test(text)) {
        inTranscript = true;
      }
      continue;
    }

    if (tagName === "h2" && !TRANSCRIPT_HEADING.test(text)) {
      break;
    }

    if ((tagName === "h3" || tagName === "h4") && TIMESTAMP_HEADING.test(text)) {
      currentHeading = text;
      continue;
    }

    const inlineMatch = text.match(INLINE_SPEAKER);
    if (inlineMatch) {
      turns.push({
        sectionHeading: currentHeading,
        timestamp: extractTimestamp(currentHeading),
        speaker: inlineMatch[1],
        text: inlineMatch[2],
      });
      pendingSpeaker = null;
      continue;
    }

    if (isLikelySpeakerLabel(text)) {
      pendingSpeaker = text.replace(/:$/, "");
      continue;
    }

    if (pendingSpeaker) {
      turns.push({
        sectionHeading: currentHeading,
        timestamp: extractTimestamp(currentHeading),
        speaker: pendingSpeaker,
        text,
      });
      pendingSpeaker = null;
      continue;
    }

    const previous = turns.at(-1);
    if (previous && previous.sectionHeading === currentHeading) {
      previous.text = `${previous.text}\n\n${text}`;
      continue;
    }

    turns.push({
      sectionHeading: currentHeading,
      timestamp: extractTimestamp(currentHeading),
      speaker: "Unknown speaker",
      text,
    });
  }

  return turns.filter((turn) => turn.text.length > 0);
}

async function fetchTranscriptTurns(assetUrl: string, guestNames: string[]) {
  const response = await fetch(assetUrl, {
    headers: {
      "user-agent": "dwarkesh-podcast-rag/0.1",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as TranscriptSegment[];
  if (!Array.isArray(payload) || payload.length === 0) {
    return [];
  }

  const speakerMap = buildSpeakerMap(payload, guestNames);

  return payload
    .map((segment) => ({
      sectionHeading: null,
      timestamp: formatTimestamp(segment.start ?? null),
      speaker: speakerMap.get(segment.speaker ?? "") ?? normalizeSpeakerId(segment.speaker),
      text: normalizeText(segment.text ?? ""),
    }))
    .filter((turn) => turn.text.length > 0);
}

function buildSpeakerMap(segments: TranscriptSegment[], guestNames: string[]) {
  const speakerIds = unique(
    segments
      .map((segment) => segment.speaker?.trim())
      .filter((speakerId): speakerId is string => Boolean(speakerId)),
  );

  const speakerMap = new Map<string, string>();
  if (speakerIds.length === 0) {
    return speakerMap;
  }

  const firstSegment = segments.find((segment) => segment.text && segment.speaker);
  const firstText = firstSegment?.text?.toLowerCase() ?? "";
  const looksLikeHostOpening =
    speakerIds.length === guestNames.length + 1 ||
    guestNames.some((guestName) => mentionsGuest(firstText, guestName)) ||
    /\b(thank you|welcome|coming on|joining me|on the podcast)\b/.test(firstText);

  if (firstSegment?.speaker && looksLikeHostOpening) {
    speakerMap.set(firstSegment.speaker, HOST_NAME);
  }

  const remainingGuestNames = [...guestNames];
  for (const speakerId of speakerIds) {
    if (speakerMap.has(speakerId)) continue;

    const assignedGuestName = remainingGuestNames.shift();
    speakerMap.set(speakerId, assignedGuestName ?? normalizeSpeakerId(speakerId));
  }

  return speakerMap;
}

function mentionsGuest(text: string, guestName: string) {
  const parts = guestName
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part.length > 1);

  return parts.some((part) => text.includes(part));
}

function extractTranscriptAssetUrl(html: string) {
  const matches = html.match(/https:\\\/\\\/substackcdn\.com\\\/video_upload[^"\\]*transcription\.json[^"\\]*/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  const directMatch = matches.find((match) => !match.includes("unaligned_transcription.json"));
  if (!directMatch) {
    return null;
  }

  return directMatch.replace(/\\\//g, "/");
}

function extractTitle($: cheerio.CheerioAPI, root: cheerio.Cheerio<AnyNode>) {
  return normalizeText(
    $("meta[property='og:title']").attr("content") ||
      $("meta[name='twitter:title']").attr("content") ||
      root.find("h1").first().text(),
  );
}

function extractPublishedAt($: cheerio.CheerioAPI) {
  return (
    $("meta[property='article:published_time']").attr("content") ||
    $("meta[name='parsely-pub-date']").attr("content") ||
    $("time[datetime]").first().attr("datetime") ||
    null
  );
}

function extractGuestNames(title: string) {
  const parts = title.split(/\s+[—–-]\s+/).map(normalizeText).filter(Boolean);
  if (parts.length < 2) return [];

  const candidate =
    looksLikeGuestSegment(parts[0]) && !looksLikeGuestSegment(parts[1])
      ? parts[0]
      : !looksLikeGuestSegment(parts[0]) && looksLikeGuestSegment(parts[1])
        ? parts[1]
        : parts[0];

  return unique(
    candidate
      .split(/\s*(?:,|&| and )\s*/i)
      .map(normalizeText)
      .filter((part) => part.length > 0),
  );
}

function looksLikeGuestSegment(value: string) {
  const words = value.split(/\s+/);
  if (words.length === 0 || words.length > 8) return false;

  return words.every((word) => /^[A-Z][\w.'-]+$/.test(word));
}

function extractTimestamp(value: string | null) {
  if (!value) return null;
  const match = value.match(/^((\d+:)?\d{1,2}:\d{2})/);
  return match?.[1] ?? null;
}

function formatTimestamp(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function normalizeSpeakerId(value: string | undefined) {
  const speakerId = value?.trim();
  if (!speakerId) return "Unknown speaker";
  return speakerId.replaceAll("_", " ");
}

function isLikelySpeakerLabel(value: string) {
  if (value.length > 48) return false;
  if (/[?!]/.test(value)) return false;
  if (/^\d/.test(value)) return false;
  if (TIMESTAMP_HEADING.test(value)) return false;
  const words = value.replace(/:$/, "").split(/\s+/);
  if (words.length === 0 || words.length > 5) return false;

  return words.every((word) => /^[A-Z][\w.'-]+$/.test(word));
}

function normalizeText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
