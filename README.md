# Dwarkesh

This repo now has two roles:

- the root Next.js app is a headless Dwarkesh transcript backend for ingestion, artifact export, retrieval, and private grounding
- the public chat product is the vendored LibreChat app in [`vendor/librechat`](/Users/kian/Developer/dwarkesh/vendor/librechat)

## Render backend

The root app owns:

- transcript discovery and parsing
- Gemini embeddings via `gemini-embedding-2-preview`
- artifact-backed retrieval from [`data/artifacts/current`](/Users/kian/Developer/dwarkesh/data/artifacts/current)
- `POST /api/rag/context` for private LibreChat grounding
- `GET /api/search?q=` for retrieval diagnostics
- internal ingest/export routes for refresh jobs

Local bring-up:

1. Copy [`.env.example`](/Users/kian/Developer/dwarkesh/.env.example) to `.env.local`.
2. Fill in `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `CRAWL_SECRET`, and `LIBRECHAT_SHARED_SECRET`.
3. Run `npm install`.
4. Run `npm run ingest:backfill`.
5. Start the backend with `npm run dev`.

Useful commands:

- `npm run ingest`
- `npm run ingest:backfill`
- `npm run artifact:export`
- `npm run lint`
- `npm run build`

The Render service config is in [render.yaml](/Users/kian/Developer/dwarkesh/render.yaml). Artifact refreshes still run through [`.github/workflows/reindex.yml`](/Users/kian/Developer/dwarkesh/.github/workflows/reindex.yml).

## Public frontend

The public app is the patched LibreChat deployment in [`vendor/librechat`](/Users/kian/Developer/dwarkesh/vendor/librechat). It uses:

- fixed Gemini chat models, with `gemini-3.1-flash-lite-preview` first
- all free text-capable OpenRouter models
- global Dwarkesh transcript grounding on every non-assistant chat
- raw upstream provider errors surfaced directly to the user

Deployment files:

- config: [`vendor/librechat/librechat.yaml`](/Users/kian/Developer/dwarkesh/vendor/librechat/librechat.yaml)
- env template: [`vendor/librechat/.env.dwarkesh.example`](/Users/kian/Developer/dwarkesh/vendor/librechat/.env.dwarkesh.example)
- compose: [`vendor/librechat/docker-compose.dwarkesh.yml`](/Users/kian/Developer/dwarkesh/vendor/librechat/docker-compose.dwarkesh.yml)
- notes: [`vendor/librechat/README.DWARKESH.md`](/Users/kian/Developer/dwarkesh/vendor/librechat/README.DWARKESH.md)
