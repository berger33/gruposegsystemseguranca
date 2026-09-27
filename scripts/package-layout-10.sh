#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/out"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for page in index layout-02 layout-03 layout-04 layout-05 layout-06 layout-07 layout-08 layout-09 layout-10; do
  [[ -f "$OUT/$page.html" ]] || { echo "Missing $OUT/$page.html; run npm run build:preview first." >&2; exit 1; }
done
[[ -d "$OUT/_next" ]] || { echo "Missing static Next assets." >&2; exit 1; }

mkdir -p "$TMP/_next" "$TMP/images" "$ROOT/downloads"
cp -R "$OUT/_next/." "$TMP/_next/"
cp -R "$OUT/images/." "$TMP/images/"

rewrite_page() {
  local source="$1" target="$2" back_link="$3"
  node - "$source" "$target" "$back_link" <<'NODE'
const fs = require('node:fs');
const [source, target, backLink] = process.argv.slice(2);
let html = fs.readFileSync(source, 'utf8');
html = html.replaceAll('src="/images/', 'src="./images/');
html = html.replaceAll('href="/images/', 'href="./images/');
html = html.replaceAll('href="/"', `href="${backLink}"`);
fs.writeFileSync(target, html);
NODE
}

rewrite_page "$OUT/index.html" "$TMP/layout-01.html" "./layout-01.html"
rewrite_page "$OUT/layout-02.html" "$TMP/layout-02.html" "./layout-01.html"
rewrite_page "$OUT/layout-03.html" "$TMP/layout-03.html" "./layout-01.html"
rewrite_page "$OUT/layout-04.html" "$TMP/layout-04.html" "./layout-01.html"
rewrite_page "$OUT/layout-05.html" "$TMP/layout-05.html" "./layout-01.html"
rewrite_page "$OUT/layout-06.html" "$TMP/layout-06.html" "./layout-01.html"
rewrite_page "$OUT/layout-07.html" "$TMP/layout-07.html" "./layout-01.html"
rewrite_page "$OUT/layout-08.html" "$TMP/layout-08.html" "./layout-01.html"
rewrite_page "$OUT/layout-09.html" "$TMP/layout-09.html" "./layout-01.html"
rewrite_page "$OUT/layout-10.html" "$TMP/index.html" "./layout-01.html"

cat > "$TMP/LEIA-ME.txt" <<'EOF'
GRUPO SEG SYSTEM — PRÉVIA DO LAYOUT 10: LINHA DE CUIDADO

1. Extraia todos os arquivos para uma pasta.
2. Abra index.html em um navegador atualizado para ver o Layout 10.
3. Os conceitos anteriores estão incluídos em layout-01.html até layout-09.html.

Esta é uma prévia visual estática. Os serviços são apresentados como frentes
independentes; a linha é uma metáfora visual, não uma sequência obrigatória.
O formulário apenas prepara uma mensagem para revisão e envio pelo WhatsApp;
não armazena dados nem envia e-mail. Não há preços automáticos ou dados fictícios.
EOF

rm -f "$ROOT/downloads/layout-10-linha-de-cuidado-preview.zip"
(cd "$TMP" && zip -qr "$ROOT/downloads/layout-10-linha-de-cuidado-preview.zip" .)
echo "Created $ROOT/downloads/layout-10-linha-de-cuidado-preview.zip"
