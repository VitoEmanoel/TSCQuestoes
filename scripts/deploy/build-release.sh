#!/usr/bin/env bash
set -euo pipefail

URL="${1:-}"
if [[ ! "$URL" =~ ^https://[a-z0-9.-]+$ ]]; then
  echo "Uso: npm run release -- https://seunome.cloud.deploy.uespi.br" >&2
  exit 1
fi

cd "$(dirname "$0")/../.."

if [[ -n "$(git status --porcelain)" && "${PERMITIR_SUJO:-}" != "1" ]]; then
  echo "Há mudanças não commitadas. Faça o commit antes (ou use PERMITIR_SUJO=1 para um ensaio)." >&2
  exit 1
fi

VERSION="$(git rev-parse --short=12 HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  VERSION="${VERSION}-sujo"
fi
NAME="tscquestoes-${VERSION}"
STAGE="release/pacote/${NAME}"
APP="${STAGE}/app"

rm -rf .next/standalone "release/pacote"
mkdir -p "$STAGE"

AUTH_URL="$URL" DEPLOYMENT_VERSION="$VERSION" NEXT_TELEMETRY_DISABLED=1 npx next build

cp -a .next/standalone "$APP"
mkdir -p "$APP/public" "$APP/.next/static"
cp -a public/. "$APP/public/"
cp -a .next/static/. "$APP/.next/static/"
if [[ -d .next/node_modules ]]; then
  cp -a .next/node_modules "$APP/.next/node_modules"
fi
rm -rf "$APP/.next/cache"
find "$APP" -name ".env*" -not -path "*/node_modules/*" -delete

rm -rf "$APP"/node_modules/@img/*linuxmusl* "$APP"/node_modules/@img/sharp-wasm32
find "$APP/node_modules/@prisma/client/runtime" "$APP/node_modules/.prisma/client" \
  -maxdepth 1 -type f \( -name "*wasm*" -o -name "*.map" -o -name "edge*" -o -name "react-native*" \) -delete

ENGINE="libquery_engine-debian-openssl-3.0.x.so.node"
mkdir -p "$APP/node_modules/.prisma/client"
if [[ ! -f "$APP/node_modules/.prisma/client/$ENGINE" ]]; then
  cp "node_modules/.prisma/client/$ENGINE" "$APP/node_modules/.prisma/client/"
fi

for forbidden in storage ProvasEnadeADS docs scripts .git app components lib prisma deploy public/public; do
  if [[ -e "$APP/$forbidden" ]]; then
    echo "O pacote não pode levar a pasta $forbidden." >&2
    exit 1
  fi
done
if [[ -n "$(find "$APP" -name ".env*" -not -path "*/node_modules/*" -print -quit)" ]]; then
  echo "O pacote tem arquivo .env." >&2
  exit 1
fi
for key in AUTH_SECRET AUTH_GOOGLE_SECRET SMTP_PASSWORD; do
  value="$(sed -n "s/^${key}=\"\{0,1\}\([^\"]*\)\"\{0,1\}\$/\1/p" .env 2>/dev/null || true)"
  if [[ ${#value} -ge 8 ]] && grep -rqsF -- "$value" "$APP"; then
    echo "O pacote contém o valor de $key do seu .env." >&2
    exit 1
  fi
done
if [[ ! -f "$APP/node_modules/@prisma/client/default.js" || ! -e "$APP/node_modules/.prisma/client/default.js" ]]; then
  echo "O pacote ficou sem o Prisma." >&2
  exit 1
fi

mkdir -p "$APP/ferramentas"
npx esbuild prisma/seed.ts --bundle --platform=node --target=node20 --format=cjs \
  --external:@prisma/client --outfile="$APP/ferramentas/seed.cjs" --log-level=warning \
  --log-override:empty-import-meta=silent
npx esbuild scripts/deploy/import-content.ts --bundle --platform=node --target=node20 --format=cjs \
  --external:@prisma/client --outfile="$APP/ferramentas/carregar-conteudo.cjs" --log-level=warning

mkdir -p "$STAGE/prisma"
cp -a prisma/schema.prisma prisma/migrations "$STAGE/prisma/"
cp -a deploy/. "$STAGE/"
printf '%s\n' "$VERSION" > "$STAGE/VERSAO"
printf '%s\n' "$URL" > "$STAGE/ENDERECO"

tar -C release/pacote -czf "release/${NAME}.tar.gz" "$NAME"
echo "Pacote pronto: release/${NAME}.tar.gz ($(du -h "release/${NAME}.tar.gz" | cut -f1))"
