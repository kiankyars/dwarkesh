#!/bin/sh
set -eu

: "${MEILI_MASTER_KEY:?MEILI_MASTER_KEY is required}"

if [ -z "${MONGO_URI:-}" ] && [ -z "${MONGO_HOSTPORT:-}" ]; then
  echo "Either MONGO_URI or MONGO_HOSTPORT is required" >&2
  exit 1
fi

if [ -z "${MEILI_HOST:-}" ] && [ -z "${MEILI_HOSTPORT:-}" ]; then
  echo "Either MEILI_HOST or MEILI_HOSTPORT is required" >&2
  exit 1
fi

if [ -z "${DWARKESH_RAG_API_BASE:-}" ] && [ -z "${DWARKESH_RAG_HOSTPORT:-}" ]; then
  echo "Either DWARKESH_RAG_API_BASE or DWARKESH_RAG_HOSTPORT is required" >&2
  exit 1
fi

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
