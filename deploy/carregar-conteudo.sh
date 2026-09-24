#!/usr/bin/env bash
set -euo pipefail

BASE=/opt/tscquestoes
CONF=/etc/tscquestoes/ambiente
PACKAGE="${1:-}"

if [[ "$(id -u)" != "0" ]]; then
  echo "Rode como root." >&2
  exit 1
fi
if [[ -z "$PACKAGE" || ! -f "$PACKAGE" ]]; then
  echo "Uso: carregar-conteudo.sh /caminho/conteudo.tar.gz" >&2
  exit 1
fi
if [[ ! -e "$BASE/atual/app/server.js" ]]; then
  echo "Publique uma versão do site antes da carga do conteúdo." >&2
  exit 1
fi

WORK="$(mktemp -d "$BASE/conteudo.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
tar -xzf "$PACKAGE" -C "$WORK"
chmod -R u=rwX,go=rX "$WORK"

with_env() {
  systemd-run --quiet --wait --pipe --collect --service-type=exec \
    -p EnvironmentFile="$CONF" -p User=tscquestoes -p Group=tscquestoes \
    -p Environment=UPLOAD_DIR=/var/lib/tscquestoes/uploads \
    -p WorkingDirectory="$BASE/atual/app" "$@"
}

with_env /usr/local/bin/node ferramentas/carregar-conteudo.cjs "$WORK/conteudo"
with_env /usr/local/bin/node ferramentas/seed.cjs --somente-admin
echo "Conteúdo e administrador prontos."
