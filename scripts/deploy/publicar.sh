#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-}"
WHAT="${2:-site}"
if [[ -z "$HOST" || ! "$WHAT" =~ ^(site|conteudo)$ ]]; then
  echo "Uso: npm run publicar -- <servidor-ssh> [site|conteudo]" >&2
  echo "Ex.: npm run publicar -- aluno@10.10.10.212" >&2
  exit 1
fi

cd "$(dirname "$0")/../.."

if [[ "$WHAT" == "conteudo" ]]; then
  if [[ ! -f release/conteudo.tar.gz ]]; then
    echo "Gere antes com: npm run release:conteudo" >&2
    exit 1
  fi
  ssh "$HOST" 'umask 077 && cat > /var/tmp/tscquestoes-conteudo.tar.gz' < release/conteudo.tar.gz
  ssh "$HOST" 'sudo bash /opt/tscquestoes/atual/carregar-conteudo.sh /var/tmp/tscquestoes-conteudo.tar.gz; status=$?; rm -f /var/tmp/tscquestoes-conteudo.tar.gz; exit $status'
  exit 0
fi

PACKAGE="$(ls -1t release/tscquestoes-*.tar.gz 2>/dev/null | head -1 || true)"
if [[ -z "$PACKAGE" ]]; then
  echo "Gere antes com: npm run release -- https://seunome.cloud.deploy.uespi.br" >&2
  exit 1
fi
NAME="$(basename "$PACKAGE" .tar.gz)"
echo "Enviando $NAME..."
ssh "$HOST" "umask 077 && cat > /var/tmp/$NAME.tar.gz" < "$PACKAGE"

ssh "$HOST" sudo bash -s -- "$NAME" <<'REMOTE'
set -euo pipefail
NAME="$1"
DIR="/opt/tscquestoes/versoes/$NAME"
mkdir -p /opt/tscquestoes/versoes
rm -rf "$DIR"
tar -xzf "/var/tmp/$NAME.tar.gz" -C /opt/tscquestoes/versoes
rm -f "/var/tmp/$NAME.tar.gz"
if [[ ! -f /etc/tscquestoes/ambiente || ! -x /opt/tscquestoes/ferramentas/node_modules/.bin/prisma ]]; then
  bash "$DIR/instalar-servidor.sh"
fi
if ! grep -qE '^DATABASE_URL="?[^"]+' /etc/tscquestoes/ambiente; then
  echo "Falta preencher /etc/tscquestoes/ambiente no servidor. Depois rode de novo: npm run publicar"
  exit 0
fi
bash "$DIR/ativar-versao.sh"
REMOTE
