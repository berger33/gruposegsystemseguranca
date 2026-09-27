#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/out"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for page in index layout-02 layout-03 layout-04 layout-05 layout-06; do
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
rewrite_page "$OUT/layout-06.html" "$TMP/index.html" "./layout-01.html"

cat > "$TMP/LEIA-ME.txt" <<'EOF'
GRUPO SEG SYSTEM — PRÉVIA DO LAYOUT 06: AZUL EM CAMADAS

1. Extraia todos os arquivos para uma pasta.
2. Abra index.html em um navegador atualizado para ver o Layout 06.
3. Os conceitos anteriores estão incluídos em layout-01.html até layout-05.html.

Esta é uma prévia visual estática. O formulário apenas prepara uma mensagem
para revisão e envio pelo WhatsApp; não armazena dados nem envia e-mail.
A ilustração urbana é conceitual e foi gerada para esta proposta — não retrata
um sistema ou instalação real da empresa. O logotipo original ainda não foi
inserido, pois o anexo não ficou acessível nos arquivos do projeto.
EOF

rm -f "$ROOT/downloads/layout-06-azul-editorial-preview.zip"
(cd "$TMP" && zip -qr "$ROOT/downloads/layout-06-azul-editorial-preview.zip" .)
echo "Created $ROOT/downloads/layout-06-azul-editorial-preview.zip"
