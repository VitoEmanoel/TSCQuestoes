#!/usr/bin/env bash
set -euo pipefail

NODE_MAJOR="${NODE_MAJOR:-24}"
PRISMA_VERSION="6.19.3"
BASE=/opt/tscquestoes
DATA=/var/lib/tscquestoes
CONF=/etc/tscquestoes
HERE="$(cd "$(dirname "$0")" && pwd)"

if [[ "$(id -u)" != "0" ]]; then
  echo "Rode como root." >&2
  exit 1
fi

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl ca-certificates xz-utils openssl postgresql-client nftables nano >/dev/null

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) NODE_ARCH=x64 ;;
  aarch64) NODE_ARCH=arm64 ;;
  *) echo "Arquitetura não suportada: $ARCH" >&2; exit 1 ;;
esac

CURRENT_MAJOR="$(/usr/local/bin/node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
if [[ "$CURRENT_MAJOR" != "$NODE_MAJOR" ]]; then
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  DIST="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
  curl -fsSL "$DIST/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"
  FILE="$(grep -oE "node-v[0-9.]+-linux-${NODE_ARCH}\.tar\.xz" "$TMP/SHASUMS256.txt" | head -1)"
  curl -fsSL "$DIST/$FILE" -o "$TMP/$FILE"
  (cd "$TMP" && grep " $FILE\$" SHASUMS256.txt | sha256sum -c --quiet -)
  rm -rf /opt/node
  mkdir -p /opt/node
  tar -xJf "$TMP/$FILE" -C /opt/node --strip-components=1
  ln -sf /opt/node/bin/node /usr/local/bin/node
  ln -sf /opt/node/bin/npm /usr/local/bin/npm
  ln -sf /opt/node/bin/npx /usr/local/bin/npx
fi
echo "Node $(/usr/local/bin/node -v)"

if ! id tscquestoes >/dev/null 2>&1; then
  useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin tscquestoes
fi

install -d -m 0755 -o root -g root "$BASE" "$BASE/versoes"
install -d -m 0750 -o tscquestoes -g tscquestoes "$DATA" "$DATA/uploads" "$DATA/cache"
install -d -m 0700 -o root -g root /var/backups/tscquestoes
install -d -m 0750 -o root -g tscquestoes "$CONF"

if [[ ! -f "$CONF/ambiente" ]]; then
  install -m 0640 -o root -g tscquestoes "$HERE/ambiente.modelo" "$CONF/ambiente"
  SECRET="$(openssl rand -base64 32)"
  sed -i "s|^AUTH_SECRET=\"\"|AUTH_SECRET=\"${SECRET}\"|" "$CONF/ambiente"
  if [[ -f "$HERE/ENDERECO" ]]; then
    sed -i "s|^AUTH_URL=.*|AUTH_URL=\"$(cat "$HERE/ENDERECO")\"|" "$CONF/ambiente"
  fi
  echo "Criado $CONF/ambiente (AUTH_SECRET gerado). Preencha os demais valores com: nano $CONF/ambiente"
fi

if [[ ! -x "$BASE/ferramentas/node_modules/.bin/prisma" ]] ||
  [[ "$("$BASE/ferramentas/node_modules/.bin/prisma" --version 2>/dev/null | awk '/^prisma /{print $3}')" != "$PRISMA_VERSION" ]]; then
  install -d -m 0755 "$BASE/ferramentas"
  (cd "$BASE/ferramentas" && /usr/local/bin/npm init -y >/dev/null &&
    /usr/local/bin/npm install --no-audit --no-fund --silent "prisma@${PRISMA_VERSION}")
fi

install -m 0644 "$HERE/firewall.nft" "$CONF/firewall.nft"
install -m 0644 "$HERE/tscquestoes-firewall.service" /etc/systemd/system/tscquestoes-firewall.service
install -m 0644 "$HERE/tscquestoes.service" /etc/systemd/system/tscquestoes.service
install -m 0644 "$HERE/tscquestoes-backup.service" /etc/systemd/system/tscquestoes-backup.service
install -m 0644 "$HERE/tscquestoes-backup.timer" /etc/systemd/system/tscquestoes-backup.timer
install -m 0755 "$HERE/backup.sh" "$BASE/backup.sh"
systemctl daemon-reload
systemctl enable tscquestoes.service tscquestoes-backup.timer tscquestoes-firewall.service >/dev/null
systemctl restart tscquestoes-firewall.service
systemctl start tscquestoes-backup.timer

echo "Servidor preparado."
