import assert from "node:assert/strict";
import test from "node:test";

import { parseSubstackPostDetail } from "@/lib/dwarkesh/parser";
import type { SubstackPostDetail } from "@/lib/dwarkesh/discovery";

test("parses edited Substack transcript speaker labels with timestamps", async () => {
  const episode = await parseSubstackPostDetail(makePost(`
    <p>Intro copy before transcript.</p>
    <h2>Transcript</h2>
    <h3>00:00:00 – Opening</h3>
    <p>Dwarkesh Patel</p>
    <p>Welcome to the show.</p>
    <p>Sarah Paine 00:00:09</p>
    <p>Thanks for having me.</p>
    <h3>00:01:00 – Next section</h3>
    <p>Dwarkesh Patel 00:01:00What should we know first?</p>
    <p>Sarah Paine</p>
    <p>Start with the map.</p>
  `));

  assert.ok(episode);
  assert.deepEqual(
    episode.transcriptTurns.map((turn) => ({
      speaker: turn.speaker,
      timestamp: turn.timestamp,
      text: turn.text,
      sectionHeading: turn.sectionHeading,
    })),
    [
      {
        speaker: "Dwarkesh Patel",
        timestamp: "00:00:00",
        text: "Welcome to the show.",
        sectionHeading: "00:00:00 – Opening",
      },
      {
        speaker: "Sarah Paine",
        timestamp: "00:00:09",
        text: "Thanks for having me.",
        sectionHeading: "00:00:00 – Opening",
      },
      {
        speaker: "Dwarkesh Patel",
        timestamp: "00:01:00",
        text: "What should we know first?",
        sectionHeading: "00:01:00 – Next section",
      },
      {
        speaker: "Sarah Paine",
        timestamp: "00:01:00",
        text: "Start with the map.",
        sectionHeading: "00:01:00 – Next section",
      },
    ],
  );
});

test("stops edited transcript parsing at the next h2", async () => {
  const episode = await parseSubstackPostDetail(makePost(`
    <h2>Transcript</h2>
    <p>Dwarkesh Patel</p>
    <p>Only this is transcript text.</p>
    <h2>Links</h2>
    <p>This should not be indexed.</p>
  `));

  assert.ok(episode);
  assert.equal(episode.transcriptTurns.length, 1);
  assert.equal(episode.transcriptTurns[0]?.text, "Only this is transcript text.");
});

test("parses older timestamped transcripts without a Transcript heading", async () => {
  const episode = await parseSubstackPostDetail(makePost(`
    <p>Watch on YouTube. Listen on Spotify.</p>
    <p>[00:00:00] <strong>Dwarkesh Patel:</strong> Welcome back.</p>
    <p>[00:00:04] <strong>Garett Jones:</strong> Thanks for having me.</p>
    <p>This continues the previous answer.</p>
  `));

  assert.ok(episode);
  assert.deepEqual(
    episode.transcriptTurns.map((turn) => ({
      speaker: turn.speaker,
      timestamp: turn.timestamp,
      text: turn.text,
    })),
    [
      {
        speaker: "Dwarkesh Patel",
        timestamp: "00:00:00",
        text: "Welcome back.",
      },
      {
        speaker: "Garett Jones",
        timestamp: "00:00:04",
        text: "Thanks for having me.\n\nThis continues the previous answer.",
      },
    ],
  );
});

test("parses separated speaker timestamp labels and timestamp-only continuations", async () => {
  const episode = await parseSubstackPostDetail(makePost(`
    <h2>Transcript</h2>
    <p><strong>Sarah Paine</strong> <em>00:00:00</em></p>
    <p>First paragraph.</p>
    <p><em>00:00:43</em></p>
    <p>Second timestamped paragraph.</p>
    <p><strong>Dwarkesh Patel</strong>&nbsp;(00:01:00 - 00:01:05):</p>
    <p>Question text.</p>
  `));

  assert.ok(episode);
  assert.deepEqual(
    episode.transcriptTurns.map((turn) => ({
      speaker: turn.speaker,
      timestamp: turn.timestamp,
      text: turn.text,
    })),
    [
      {
        speaker: "Sarah Paine",
        timestamp: "00:00:00",
        text: "First paragraph.",
      },
      {
        speaker: "Sarah Paine",
        timestamp: "00:00:43",
        text: "Second timestamped paragraph.",
      },
      {
        speaker: "Dwarkesh Patel",
        timestamp: "00:01:00",
        text: "Question text.",
      },
    ],
  );
});

function makePost(body_html: string): SubstackPostDetail {
  return {
    id: 1,
    type: "podcast",
    slug: "test-episode",
    title: "Test Guest — Test Episode",
    post_date: "2026-01-01T00:00:00.000Z",
    canonical_url: "https://www.dwarkesh.com/p/test-episode",
    body_html,
  };
}
