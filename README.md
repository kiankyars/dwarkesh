# Dwarkesh Podcast RAG

Public RAG app over Dwarkesh's podcast transcripts with:

- Next.js 16 + `assistant-ui`
- Gemini embeddings via `gemini-embedding-2-preview`
- Artifact-backed retrieval from checked-in chunk + embedding files
- Dynamic model picker for:
  - fixed Gemini models
  - all free OpenRouter text-generation models
- Scheduled reindexing through GitHub Actions

## Local setup

1. Copy [`.env.example`](/Users/kian/Developer/dwarkesh/.env.example) to `.env.local`.
2. Fill in `GEMINI_API_KEY` and `OPENROUTER_API_KEY`.
3. Run `npm install`.
4. Generate the local retrieval bundle with `npm run ingest:backfill`.
5. Start the app with `npm run dev`.

The first backfill writes the live index into [`data/artifacts/current`](/Users/kian/Developer/dwarkesh/data/artifacts/current).

## Commands

- `npm run ingest`
- `npm run ingest:backfill`
- `npm run artifact:export`
- `npm run lint`
- `npm run build`

## Deployment shape

[render.yaml](/Users/kian/Developer/dwarkesh/render.yaml) now targets a free Render web service only. The app serves the checked-in artifact directly from disk, so it no longer needs Render Postgres or Redis to answer queries.

Automatic corpus refreshes happen in [`.github/workflows/reindex.yml`](/Users/kian/Developer/dwarkesh/.github/workflows/reindex.yml):

- every 6 hours the workflow runs `npm run ingest`
- updated files in `data/artifacts/current` are committed back to the repo
- Render auto-deploys the new artifact on the next push

## Runtime notes

- If a selected chat model fails upstream, the UI shows the raw provider error and the user can switch models.
- The internal ingest/export routes still exist for manual refreshes, but GitHub Actions is the durable update path for Render because free web disks are not a persistent database.
