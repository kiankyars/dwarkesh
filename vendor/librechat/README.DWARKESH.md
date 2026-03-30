# Dwarkesh LibreChat Deployment

This vendored LibreChat app is the public frontend for the Dwarkesh transcript RAG deployment.

## What is customized

- all non-assistant chats call the Render backend for Dwarkesh transcript grounding before model execution
- Google supports an admin default key plus optional per-user override via `GOOGLE_USER_PROVIDE=true`
- OpenRouter is exposed as a custom endpoint with an admin default key plus optional per-user override
- the OpenRouter model list is filtered to free text-capable models only
- assistant messages render a compact transcript source strip under the answer

## Bring-up

1. Copy `.env.dwarkesh.example` to `.env.dwarkesh`.
2. Fill in the domain, JWT, encryption, Google, OpenRouter, and Dwarkesh backend values.
3. Run `docker compose -f docker-compose.dwarkesh.yml --env-file .env.dwarkesh up -d --build`.
4. Put a reverse proxy in front of `localhost:3080` and terminate HTTPS there.

## Render deployment

If you do not want to host LibreChat on your own machine, the repo root `render.yaml` now defines a full Render-native stack:

- `dwarkesh`: public LibreChat web service
- `dwarkesh-mongodb`: private MongoDB service with a persistent disk
- `dwarkesh-meilisearch`: private MeiliSearch service with a persistent disk
- `dwarkesh-rag-web`: the existing Dwarkesh transcript backend

The LibreChat service starts through `scripts/start-render.sh`, which derives:

- `MONGO_URI` from the Mongo private service host/port
- `MEILI_HOST` from the Meili private service host/port
- `DWARKESH_RAG_API_BASE` from the backend private service host/port
- `DOMAIN_CLIENT` and `DOMAIN_SERVER` from Render's external hostname when not set explicitly

Secrets still requiring manual entry in Render:

- `GOOGLE_KEY`
- `OPENROUTER_KEY`

## Required backend contract

- `DWARKESH_RAG_API_BASE` must point at the Render backend from this repo.
- `DWARKESH_RAG_SHARED_SECRET` must match the Render-side `LIBRECHAT_SHARED_SECRET`.
- The Render backend must expose `POST /api/rag/context`.
