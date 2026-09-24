#!/usr/bin/env bash
set -euo pipefail

BASE=/opt/tscquestoes
CONF=/etc/tscquestoes/ambiente
DATA=/var/lib/tscquestoes
HERE="$(cd "$(dirname "$0")" && pwd)"
KEEP=3

if [[ "$(id -u)" != "0" ]]; then
  echo "Rode como root." >&2
  exit 1
fi
if [[ "$(dirname "$HERE")" != "$BASE/versoes" ]]; then
  echo "Este script precisa estar dentro de $BASE/versoes/<versão>." >&2
  exit 1
fi

missing=()
for key in AUTH_URL AUTH_SECRET DATABASE_URL; do
  if ! grep -qE "^${key}=\"?[^\"]+" "$CONF"; then
    missing+=("$key")
  fi
done
if (( ${#missing[@]} > 0 )); then
  echo "Preencha em $CONF: ${missing[*]}" >&2
  exit 1
fi

with_env() {
  systemd-run --quiet --wait --pipe --collect --service-type=exec \
    -p EnvironmentFile="$CONF" -p User=tscquestoes -p Group=tscquestoes \
    -p WorkingDirectory="$HERE/app" "$@"
}

install -m 0644 "$HERE/tscquestoes.service" "$HERE/tscquestoes-backup.service" \
  "$HERE/tscquestoes-backup.timer" "$HERE/tscquestoes-firewall.service" /etc/systemd/system/
install -m 0755 "$HERE/backup.sh" "$BASE/backup.sh"
install -m 0644 "$HERE/firewall.nft" /etc/tscquestoes/firewall.nft
systemctl daemon-reload
systemctl enable tscquestoes-firewall.service >/dev/null
systemctl restart tscquestoes-firewall.service

chown -R root:root "$HERE"
chmod -R u=rwX,go=rX "$HERE"
ln -sfn "$DATA/cache" "$HERE/app/.next/cache"

echo "Aplicando migrações do banco..."
with_env "$BASE/ferramentas/node_modules/.bin/prisma" migrate deploy --schema "$HERE/prisma/schema.prisma"

PREVIOUS="$(readlink -f "$BASE/atual" 2>/dev/null || true)"
ln -sfn "$HERE" "$BASE/atual.novo"
mv -T "$BASE/atual.novo" "$BASE/atual"
systemctl restart tscquestoes.service

healthy=0
for _ in $(seq 1 30); do
  if curl -fs -o /dev/null --max-time 5 http://127.0.0.1:80/login; then
    healthy=1
    break
  fi
  sleep 1
done

if [[ "$healthy" != "1" ]]; then
  echo "A versão nova não respondeu. Voltando para a anterior." >&2
  journalctl -u tscquestoes.service -n 30 --no-pager >&2 || true
  if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    ln -sfn "$PREVIOUS" "$BASE/atual.novo"
    mv -T "$BASE/atual.novo" "$BASE/atual"
    systemctl restart tscquestoes.service
  fi
  exit 1
fi

CURRENT="$(readlink -f "$BASE/atual")"
mapfile -t old < <(ls -1dt "$BASE"/versoes/*/ | sed 's|/$||' | grep -vxF "$CURRENT" | tail -n +"$KEEP")
for dir in "${old[@]}"; do
  rm -rf "$dir"
done

echo "No ar: versão $(cat "$HERE/VERSAO")"
