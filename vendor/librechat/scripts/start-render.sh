#!/bin/sh
set -eu

: "${MONGO_HOSTPORT:?MONGO_HOSTPORT is required}"
: "${MEILI_HOSTPORT:?MEILI_HOSTPORT is required}"
: "${MEILI_MASTER_KEY:?MEILI_MASTER_KEY is required}"
: "${DWARKESH_RAG_HOSTPORT:?DWARKESH_RAG_HOSTPORT is required}"

if [ -z "${DOMAIN_CLIENT:-}" ] && [ -n "${RENDER_EXTERNAL_HOSTNAME:-}" ]; then
  export DOMAIN_CLIENT="https://${RENDER_EXTERNAL_HOSTNAME}"
fi

if [ -z "${DOMAIN_SERVER:-}" ] && [ -n "${RENDER_EXTERNAL_HOSTNAME:-}" ]; then
  export DOMAIN_SERVER="https://${RENDER_EXTERNAL_HOSTNAME}"
fi

export HOST="${HOST:-0.0.0.0}"
export MONGO_URI="${MONGO_URI:-mongodb://${MONGO_HOSTPORT}/LibreChat}"
export MEILI_HOST="${MEILI_HOST:-http://${MEILI_HOSTPORT}}"
export DWARKESH_RAG_API_BASE="${DWARKESH_RAG_API_BASE:-http://${DWARKESH_RAG_HOSTPORT}}"

exec npm run backend
