#!/usr/bin/env bash
set -euo pipefail

CONF=/etc/tscquestoes/ambiente
DATA=/var/lib/tscquestoes
OUT=/var/backups/tscquestoes
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M)"

DATABASE_URL="$(sed -n 's/^DATABASE_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$CONF")"
if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL vazio em $CONF" >&2
  exit 1
fi

DUMP_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')"

umask 077
pg_dump --format=custom --no-owner --no-privileges \
  --dbname="$DUMP_URL" --file="$OUT/banco-$STAMP.dump"
tar -C "$DATA" -czf "$OUT/imagens-$STAMP.tar.gz" uploads

find "$OUT" -type f \( -name 'banco-*.dump' -o -name 'imagens-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "Backup salvo em $OUT ($STAMP)"
