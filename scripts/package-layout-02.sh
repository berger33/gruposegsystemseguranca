#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/out"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ ! -f "$OUT/layout-02.html" || ! -f "$OUT/index.html" || ! -d "$OUT/_next" ]]; then
  echo "Static export not found. Run npm run build:preview first." >&2
  exit 1
fi

mkdir -p "$TMP/_next" "$TMP/images" "$ROOT/downloads"
cp -R "$OUT/_next/." "$TMP/_next/"
cp -R "$OUT/images/." "$TMP/images/"
cp "$OUT/index.html" "$TMP/layout-01.html"

node - "$OUT/layout-02.html" "$TMP/index.html" <<'NODE'
const fs = require('node:fs');
const [source, target] = process.argv.slice(2);
let html = fs.readFileSync(source, 'utf8');
// The downloaded package opens from its own directory, not a web-server root.
html = html.replaceAll('src="/images/', 'src="./images/');
html = html.replaceAll('href="/images/', 'href="./images/');
html = html.replaceAll('href="/"', 'href="./layout-01.html"');
fs.writeFileSync(target, html);
NODE

cat > "$TMP/LEIA-ME.txt" <<'EOF'
GRUPO SEG SYSTEM — PRÉVIA DO LAYOUT 02: CENTRAL

1. Extraia todos os arquivos para uma pasta.
2. Abra index.html em um navegador atualizado para ver o Layout 02.
3. Use o link no rodapé para comparar com layout-01.html.

Esta é uma prévia visual estática. O formulário apenas prepara uma mensagem
para revisão e envio pelo WhatsApp; não armazena dados nem envia e-mail.
A imagem de central é conceitual e foi gerada para esta proposta — não retrata
uma instalação real da empresa. O logotipo original ainda não foi inserido,
pois o anexo não ficou acessível nos arquivos do projeto nesta sessão.
EOF

rm -f "$ROOT/downloads/layout-02-central-preview.zip"
(cd "$TMP" && zip -qr "$ROOT/downloads/layout-02-central-preview.zip" .)
echo "Created $ROOT/downloads/layout-02-central-preview.zip"
