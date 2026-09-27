#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/out"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for page in index layout-02 layout-03 layout-04 layout-05 layout-06 layout-07 layout-08 layout-09; do
  [[ -f "$OUT/$page.html" ]] || { echo "Missing $OUT/$page.html; run npm run build:preview first." >&2; exit 1; }
done
[[ -d "$OUT/_next" ]] || { echo "Missing static Next assets." >&2; exit 1; }
[[ -f "$OUT/layout-01.html" && -d "$OUT/visuals/layout-01" ]] || { echo "Missing Layout 01 static preview; run npm run build:preview first." >&2; exit 1; }

mkdir -p "$TMP/_next" "$TMP/images" "$ROOT/downloads"
cp -R "$OUT/_next/." "$TMP/_next/"
cp -R "$OUT/images/." "$TMP/images/"
mkdir -p "$TMP/visuals"
cp -R "$OUT/visuals/layout-01" "$TMP/visuals/layout-01"

rewrite_page() {
  local source="$1" target="$2" back_link="$3"
  node - "$source" "$target" "$back_link" <<'NODE'
const fs = require('node:fs');
const [source, target, backLink] = process.argv.slice(2);
let html = fs.readFileSync(source, 'utf8');
html = html.replaceAll('src="/images/', 'src="./images/');
html = html.replaceAll('src="/visuals/', 'src="./visuals/');
html = html.replaceAll('href="/images/', 'href="./images/');
html = html.replaceAll('href="/"', `href="${backLink}"`);
html = html.replaceAll('href="/layout-01"', 'href="./layout-01.html"');
fs.writeFileSync(target, html);
NODE
}

rewrite_page "$OUT/layout-01.html" "$TMP/layout-01.html" "./layout-01.html"
rewrite_page "$OUT/layout-02.html" "$TMP/layout-02.html" "./layout-01.html"
rewrite_page "$OUT/layout-03.html" "$TMP/layout-03.html" "./layout-01.html"
rewrite_page "$OUT/layout-04.html" "$TMP/layout-04.html" "./layout-01.html"
rewrite_page "$OUT/layout-05.html" "$TMP/layout-05.html" "./layout-01.html"
rewrite_page "$OUT/layout-06.html" "$TMP/layout-06.html" "./layout-01.html"
rewrite_page "$OUT/layout-07.html" "$TMP/layout-07.html" "./layout-01.html"
rewrite_page "$OUT/layout-08.html" "$TMP/layout-08.html" "./layout-01.html"
rewrite_page "$OUT/layout-09.html" "$TMP/index.html" "./layout-01.html"

cat > "$TMP/LEIA-ME.txt" <<'EOF'
GRUPO SEG SYSTEM — PRÉVIA DO LAYOUT 09: BRIEFING GUIADO

1. Extraia todos os arquivos para uma pasta.
2. Abra index.html em um navegador atualizado para ver o Layout 09.
3. Os conceitos anteriores estão incluídos em layout-01.html até layout-08.html.

O Layout 09 é uma prévia interativa sem fotografia: o visitante percorre três
etapas para organizar o primeiro contato. O formulário prepara uma mensagem
para revisão e envio manual pelo WhatsApp; não armazena dados nem envia e-mail.
As escolhas são apenas um briefing inicial e não constituem preço ou recomendação
automática de serviços.
EOF

rm -f "$ROOT/downloads/layout-09-briefing-preview.zip"
(cd "$TMP" && zip -qr "$ROOT/downloads/layout-09-briefing-preview.zip" .)
echo "Created $ROOT/downloads/layout-09-briefing-preview.zip"
