#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/out"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ ! -f "$OUT/layout-03.html" || ! -f "$OUT/layout-02.html" || ! -f "$OUT/index.html" || ! -d "$OUT/_next" ]]; then
  echo "Static export not found. Run npm run build:preview first." >&2
  exit 1
fi

mkdir -p "$TMP/_next" "$TMP/images" "$ROOT/downloads"
cp -R "$OUT/_next/." "$TMP/_next/"
cp -R "$OUT/images/." "$TMP/images/"
cp "$OUT/index.html" "$TMP/layout-01.html"

rewrite_page() {
  local source="$1" target="$2" back_link="$3"
  node - "$source" "$target" "$back_link" <<'NODE'
const fs = require('node:fs');
const [source, target, backLink] = process.argv.slice(2);
let html = fs.readFileSync(source, 'utf8');
// Keep static previews usable when opened directly from an extracted folder.
html = html.replaceAll('src="/images/', 'src="./images/');
html = html.replaceAll('href="/images/', 'href="./images/');
html = html.replaceAll('href="/"', `href="${backLink}"`);
fs.writeFileSync(target, html);
NODE
}

rewrite_page "$OUT/layout-02.html" "$TMP/layout-02.html" "./layout-01.html"
rewrite_page "$OUT/layout-03.html" "$TMP/index.html" "./layout-01.html"

cat > "$TMP/LEIA-ME.txt" <<'EOF'
GRUPO SEG SYSTEM — PRÉVIA DO LAYOUT 03: PRESENÇA

1. Extraia todos os arquivos para uma pasta.
2. Abra index.html em um navegador atualizado para ver o Layout 03.
3. layout-01.html e layout-02.html estão incluídos para comparação.

Esta é uma prévia visual estática. O formulário apenas prepara uma mensagem
para revisão e envio pelo WhatsApp; não armazena dados nem envia e-mail.
A imagem de atendimento é conceitual e foi gerada para esta proposta — não
retrata um funcionário ou local da empresa. O logotipo original ainda não foi
inserido, pois o anexo não ficou acessível nos arquivos do projeto nesta sessão.
EOF

rm -f "$ROOT/downloads/layout-03-presenca-preview.zip"
(cd "$TMP" && zip -qr "$ROOT/downloads/layout-03-presenca-preview.zip" .)
echo "Created $ROOT/downloads/layout-03-presenca-preview.zip"
