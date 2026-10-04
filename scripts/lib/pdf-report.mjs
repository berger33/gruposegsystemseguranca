// Gerador de PDF determinístico e sem dependências.
//
// O repositório já produz PDF artesanal (src/server/proposal-api.mjs). Este
// módulo generaliza aquele padrão para relatórios de evidência de QA: várias
// páginas, títulos, tabelas, blocos monoespaçados de saída de teste, rodapé
// numerado e acentuação correta (WinAnsiEncoding).
//
// Sem Chromium, sem rede, sem binário externo: roda em qualquer máquina que
// rode o projeto e o resultado é byte-determinístico para a mesma entrada
// (exceto a data informada pelo chamador, que é explícita).

const PAGE = { width: 595, height: 842 };
const MARGIN = { top: 56, right: 48, bottom: 58, left: 48 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;

export const COLORS = {
  ink: [0.10, 0.13, 0.18],
  muted: [0.42, 0.46, 0.52],
  brand: [0.06, 0.20, 0.36],
  ok: [0.07, 0.45, 0.31],
  fail: [0.70, 0.13, 0.11],
  warn: [0.70, 0.45, 0.05],
  line: [0.80, 0.83, 0.87],
  band: [0.95, 0.96, 0.975],
  white: [1, 1, 1],
};

// Larguras AFM (milésimos de em) das fontes padrão Type1. Só os caracteres
// ASCII são tabelados; acentuados herdam a largura da letra base.
const W_REG = { " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, "{": 334, "|": 260, "}": 334, "~": 584 };
const W_BOLD = { " ": 278, "!": 333, '"': 474, "#": 556, $: 556, "%": 889, "&": 722, "'": 238, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556, ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611, "@": 975, A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, "[": 333, "\\": 278, "]": 333, "^": 584, _: 556, "`": 333, a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500, "{": 389, "|": 280, "}": 389, "~": 584 };

const BASE_LETTER = {
  á: "a", à: "a", ã: "a", â: "a", ä: "a", é: "e", ê: "e", è: "e", ë: "e", í: "i", î: "i", ì: "i", ï: "i",
  ó: "o", ô: "o", õ: "o", ò: "o", ö: "o", ú: "u", û: "u", ù: "u", ü: "u", ç: "c", ñ: "n",
  Á: "A", À: "A", Ã: "A", Â: "A", Ä: "A", É: "E", Ê: "E", È: "E", Í: "I", Ó: "O", Ô: "O", Õ: "O", Ú: "U", Ü: "U", Ç: "C", Ñ: "N",
};

/** Caracteres fora do cp1252 recebem equivalente ASCII em vez de virar lixo. */
const TRANSLITERA = new Map(Object.entries({
  "—": "\u0097", "–": "\u0096", "‑": "-", "‒": "-", "−": "-",
  "“": "\u0093", "”": "\u0094", "‘": "\u0091", "’": "\u0092", "…": "\u0085", "•": "\u0095",
  "→": "->", "←": "<-", "↔": "<->", "⇒": "=>", "≥": ">=", "≤": "<=", "≠": "!=", "×": "x",
  "✓": "[ok]", "✔": "[ok]", "✗": "[x]", "✘": "[x]", "█": "#", "─": "-", "│": "|", "└": "+", "├": "+", "┌": "+", "┐": "+", "┘": "+", "°": "\u00b0",
  "\t": "    ", "\u00a0": " ", "\u200b": "", "\r": "",
}));

function sanitize(input) {
  let out = "";
  for (const ch of String(input ?? "")) {
    if (TRANSLITERA.has(ch)) { out += TRANSLITERA.get(ch); continue; }
    const code = ch.codePointAt(0);
    if (code === 10) { out += ch; continue; }
    if (code < 32) { out += " "; continue; }
    if (code <= 255) { out += ch; continue; }
    out += "?";
  }
  return out;
}

function charWidth(ch, bold) {
  const table = bold ? W_BOLD : W_REG;
  if (table[ch] !== undefined) return table[ch];
  const base = BASE_LETTER[ch];
  if (base && table[base] !== undefined) return table[base];
  return bold ? 611 : 556;
}

/** Largura em pontos de um texto já sanitizado. */
export function measureText(text, { size = 10, bold = false, mono = false } = {}) {
  const t = sanitize(text);
  if (mono) return t.length * size * 0.6;
  let total = 0;
  for (const ch of t) total += charWidth(ch, bold);
  return (total / 1000) * size;
}

/** Quebra o texto em linhas que cabem em `maxWidth`, sem estourar a margem. */
export function wrapText(text, maxWidth, opts = {}) {
  const linhas = [];
  for (const bruto of sanitize(text).split("\n")) {
    const palavras = bruto.split(/ +/);
    let atual = "";
    for (const palavra of palavras) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (measureText(tentativa, opts) <= maxWidth || !atual) {
        // Palavra isolada maior que a linha: corta por caractere.
        if (!atual && measureText(palavra, opts) > maxWidth) {
          let pedaco = "";
          for (const ch of palavra) {
            if (measureText(pedaco + ch, opts) > maxWidth && pedaco) { linhas.push(pedaco); pedaco = ch; }
            else pedaco += ch;
          }
          atual = pedaco;
          continue;
        }
        atual = tentativa;
      } else {
        linhas.push(atual);
        atual = palavra;
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

function escapePdfString(text) {
  return sanitize(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function colorOp(rgb, stroke = false) {
  const [r, g, b] = rgb;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} ${stroke ? "RG" : "rg"}`;
}

export function createPdfDocument({ title = "Relatório", author = "QA", subject = "", creationDate = new Date() } = {}) {
  const pages = [];
  let ops = null;
  let cursorY = 0;
  let pageIndexOfFirstContent = 0;

  let paginaVazia = true;

  function novaPagina({ cover = false } = {}) {
    ops = [];
    pages.push({ ops, cover });
    cursorY = PAGE.height - MARGIN.top;
    paginaVazia = true;
    return ops;
  }

  function garantirEspaco(altura) {
    if (!ops) novaPagina();
    if (cursorY - altura < MARGIN.bottom) novaPagina();
  }

  function desenharTexto(texto, x, y, { size = 10, bold = false, mono = false, color = COLORS.ink } = {}) {
    paginaVazia = false;
    const fonte = mono ? "/F3" : bold ? "/F2" : "/F1";
    ops.push(`BT ${colorOp(color)} ${fonte} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfString(texto)}) Tj ET`);
  }

  function retangulo(x, y, w, h, color) {
    paginaVazia = false;
    ops.push(`${colorOp(color)} ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }

  function linha(x1, y1, x2, y2, color = COLORS.line, largura = 0.6) {
    ops.push(`${colorOp(color, true)} ${largura} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  const api = {
    /** Capa com faixa, título, subtítulo e bloco de metadados. */
    cover({ titulo, subtitulo = "", etiqueta = "", metadados = [], nota = "" }) {
      novaPagina({ cover: true });
      retangulo(0, PAGE.height - 230, PAGE.width, 230, COLORS.brand);
      if (etiqueta) desenharTexto(etiqueta.toUpperCase(), MARGIN.left, PAGE.height - 70, { size: 10, bold: true, color: COLORS.white });
      let y = PAGE.height - 110;
      for (const l of wrapText(titulo, CONTENT_WIDTH, { size: 23, bold: true })) {
        desenharTexto(l, MARGIN.left, y, { size: 23, bold: true, color: COLORS.white });
        y -= 28;
      }
      if (subtitulo) {
        for (const l of wrapText(subtitulo, CONTENT_WIDTH, { size: 11 })) {
          desenharTexto(l, MARGIN.left, y, { size: 11, color: [0.85, 0.89, 0.93] });
          y -= 15;
        }
      }
      cursorY = PAGE.height - 270;
      if (metadados.length) api.keyValues(metadados, { larguraChave: 150 });
      if (nota) { api.spacer(10); api.paragraph(nota, { size: 9, color: COLORS.muted }); }
      pageIndexOfFirstContent = pages.length;
      return api;
    },

    // Não abre página nova sobre uma página que ainda não recebeu conteúdo:
    // uma régua decorativa no fim de seção gerava página em branco.
    pageBreak() { if (!ops || !paginaVazia) novaPagina(); return api; },

    spacer(h = 10) { if (!ops) novaPagina(); cursorY -= h; return api; },

    heading(texto) {
      garantirEspaco(42);
      if (cursorY < PAGE.height - MARGIN.top - 2) cursorY -= 10;
      const linhas = wrapText(texto, CONTENT_WIDTH - 10, { size: 14, bold: true });
      retangulo(MARGIN.left - 6, cursorY - 6 - (linhas.length - 1) * 17, 3, 15 + (linhas.length - 1) * 17, COLORS.brand);
      for (const l of linhas) {
        desenharTexto(l, MARGIN.left + 4, cursorY, { size: 14, bold: true, color: COLORS.brand });
        cursorY -= 17;
      }
      cursorY -= 8;
      return api;
    },

    subheading(texto, { color = COLORS.ink } = {}) {
      garantirEspaco(26);
      for (const l of wrapText(texto, CONTENT_WIDTH, { size: 11, bold: true })) {
        desenharTexto(l, MARGIN.left, cursorY, { size: 11, bold: true, color });
        cursorY -= 14;
      }
      cursorY -= 4;
      return api;
    },

    paragraph(texto, { size = 10, color = COLORS.ink, bold = false, indent = 0 } = {}) {
      const largura = CONTENT_WIDTH - indent;
      for (const l of wrapText(texto, largura, { size, bold })) {
        garantirEspaco(size + 4);
        desenharTexto(l, MARGIN.left + indent, cursorY, { size, color, bold });
        cursorY -= size + 4.2;
      }
      cursorY -= 4;
      return api;
    },

    bullets(itens, { size = 10 } = {}) {
      for (const item of itens) {
        const linhas = wrapText(item, CONTENT_WIDTH - 16, { size });
        linhas.forEach((l, i) => {
          garantirEspaco(size + 4);
          if (i === 0) desenharTexto("\u0095", MARGIN.left + 2, cursorY, { size, color: COLORS.brand });
          desenharTexto(l, MARGIN.left + 16, cursorY, { size });
          cursorY -= size + 3.6;
        });
      }
      cursorY -= 5;
      return api;
    },

    keyValues(pares, { larguraChave = 170, size = 10 } = {}) {
      for (const [chave, valor, cor] of pares) {
        const linhasValor = wrapText(String(valor), CONTENT_WIDTH - larguraChave, { size });
        garantirEspaco(linhasValor.length * (size + 3.4) + 2);
        desenharTexto(chave, MARGIN.left, cursorY, { size, bold: true, color: COLORS.muted });
        linhasValor.forEach((l, i) => {
          desenharTexto(l, MARGIN.left + larguraChave, cursorY - i * (size + 3.4), { size, color: cor || COLORS.ink });
        });
        cursorY -= linhasValor.length * (size + 3.4) + 2;
      }
      cursorY -= 6;
      return api;
    },

    /**
     * Tabela com cabeçalho, zebra e repetição de cabeçalho a cada página.
     * columns: [{ header, width (fração), align, bold }]
     */
    table({ columns, rows, size = 9, headerColor = COLORS.brand }) {
      const larguras = columns.map((c) => c.width * CONTENT_WIDTH);
      const alturaLinha = (celulas) => {
        const maxLinhas = Math.max(...celulas.map((texto, i) => wrapText(String(texto ?? ""), larguras[i] - 10, { size }).length));
        return maxLinhas * (size + 3) + 7;
      };
      const desenharCabecalho = () => {
        const h = alturaLinha(columns.map((c) => c.header));
        garantirEspaco(h + 4);
        retangulo(MARGIN.left, cursorY - h + 10, CONTENT_WIDTH, h, headerColor);
        let x = MARGIN.left;
        columns.forEach((c, i) => {
          wrapText(String(c.header), larguras[i] - 10, { size, bold: true }).forEach((l, j) => {
            desenharTexto(l, x + 5, cursorY - j * (size + 3), { size, bold: true, color: COLORS.white });
          });
          x += larguras[i];
        });
        cursorY -= h;
      };
      desenharCabecalho();
      rows.forEach((row, indice) => {
        const celulas = columns.map((c, i) => String(row.cells[i] ?? ""));
        const h = alturaLinha(celulas);
        if (cursorY - h < MARGIN.bottom) { novaPagina(); desenharCabecalho(); }
        if (indice % 2 === 1) retangulo(MARGIN.left, cursorY - h + 10, CONTENT_WIDTH, h, COLORS.band);
        let x = MARGIN.left;
        columns.forEach((c, i) => {
          const cor = row.colors?.[i] || c.color || COLORS.ink;
          wrapText(celulas[i], larguras[i] - 10, { size, bold: c.bold }).forEach((l, j) => {
            desenharTexto(l, x + 5, cursorY - j * (size + 3), { size, bold: c.bold, color: cor });
          });
          x += larguras[i];
        });
        cursorY -= h;
        linha(MARGIN.left, cursorY + 8, MARGIN.left + CONTENT_WIDTH, cursorY + 8);
      });
      cursorY -= 10;
      return api;
    },

    /** Bloco monoespaçado para saída bruta de teste (TAP, logs). */
    mono(texto, { size = 7.4, titulo = "", maxLinhas = 2000, color = COLORS.ink } = {}) {
      if (titulo) api.subheading(titulo, { color: COLORS.muted });
      const brutas = Array.isArray(texto) ? texto : String(texto).split("\n");
      const linhas = [];
      for (const l of brutas.slice(0, maxLinhas)) {
        const quebradas = wrapText(l.replace(/\s+$/, ""), CONTENT_WIDTH - 16, { size, mono: true });
        linhas.push(...(quebradas.length ? quebradas : [""]));
      }
      const alturaLinha = size + 2.4;
      let i = 0;
      while (i < linhas.length) {
        garantirEspaco(alturaLinha * 2 + 8);
        const disponiveis = Math.max(1, Math.floor((cursorY - MARGIN.bottom - 6) / alturaLinha));
        const bloco = linhas.slice(i, i + disponiveis);
        const h = bloco.length * alturaLinha + 8;
        retangulo(MARGIN.left, cursorY - h + alturaLinha, CONTENT_WIDTH, h, COLORS.band);
        bloco.forEach((l, j) => desenharTexto(l, MARGIN.left + 6, cursorY - j * alturaLinha - 2, { size, mono: true, color }));
        cursorY -= h + 2;
        i += bloco.length;
      }
      cursorY -= 6;
      return api;
    },

    /** Faixa de destaque com rótulo e valor (status geral, totais). */
    statusBanner({ rotulo, valor, color = COLORS.ok }) {
      garantirEspaco(40);
      retangulo(MARGIN.left, cursorY - 20, CONTENT_WIDTH, 30, color);
      desenharTexto(rotulo, MARGIN.left + 10, cursorY, { size: 10, bold: true, color: COLORS.white });
      const largura = measureText(valor, { size: 13, bold: true });
      desenharTexto(valor, MARGIN.left + CONTENT_WIDTH - largura - 10, cursorY - 1, { size: 13, bold: true, color: COLORS.white });
      cursorY -= 40;
      return api;
    },

    rule() {
      if (!ops || paginaVazia || cursorY - 10 < MARGIN.bottom) return api;
      linha(MARGIN.left, cursorY + 4, MARGIN.left + CONTENT_WIDTH, cursorY + 4);
      cursorY -= 10;
      return api;
    },

    /** Serializa o PDF. Rodapé numerado é aplicado aqui. */
    build({ rodape = "" } = {}) {
      const total = pages.length;
      pages.forEach((pagina, indice) => {
        const numero = indice + 1;
        const esquerda = rodape || title;
        const direita = `Página ${numero} de ${total}`;
        const y = MARGIN.bottom - 24;
        pagina.ops.push(`${colorOp(COLORS.line, true)} 0.6 w ${MARGIN.left} ${y + 14} m ${PAGE.width - MARGIN.right} ${y + 14} l S`);
        pagina.ops.push(`BT ${colorOp(COLORS.muted)} /F1 7.5 Tf 1 0 0 1 ${MARGIN.left} ${y} Tm (${escapePdfString(esquerda)}) Tj ET`);
        const largura = measureText(direita, { size: 7.5 });
        pagina.ops.push(`BT ${colorOp(COLORS.muted)} /F1 7.5 Tf 1 0 0 1 ${(PAGE.width - MARGIN.right - largura).toFixed(2)} ${y} Tm (${escapePdfString(direita)}) Tj ET`);
      });

      const objetos = [];
      const push = (corpo) => { objetos.push(corpo); return objetos.length; };

      const idCatalogo = 1;
      const idPaginas = 2;
      const idFonteRegular = 3;
      const idFonteNegrito = 4;
      const idFonteMono = 5;
      const idInfo = 6;
      const primeiraPagina = 7;
      const idsPaginas = pages.map((_, i) => primeiraPagina + i * 2);

      push(`<< /Type /Catalog /Pages ${idPaginas} 0 R >>`);
      push(`<< /Type /Pages /Kids [${idsPaginas.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
      push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
      push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
      push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
      const d = creationDate;
      const z = (n) => String(n).padStart(2, "0");
      const data = `D:${d.getUTCFullYear()}${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}${z(d.getUTCHours())}${z(d.getUTCMinutes())}${z(d.getUTCSeconds())}Z`;
      push(`<< /Title (${escapePdfString(title)}) /Author (${escapePdfString(author)}) /Subject (${escapePdfString(subject)}) /Producer (gruposegsystemseguranca qa-evidence) /CreationDate (${data}) >>`);

      const fluxos = [];
      pages.forEach((pagina, i) => {
        const id = primeiraPagina + i * 2;
        const idConteudo = id + 1;
        objetos[id - 1] = `<< /Type /Page /Parent ${idPaginas} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 ${idFonteRegular} 0 R /F2 ${idFonteNegrito} 0 R /F3 ${idFonteMono} 0 R >> >> /Contents ${idConteudo} 0 R >>`;
        const conteudo = pagina.ops.join("\n");
        fluxos.push({ id: idConteudo, conteudo });
        objetos[idConteudo - 1] = { stream: conteudo };
      });

      const partes = [];
      let offset = 0;
      const escrever = (texto) => {
        const buf = Buffer.from(texto, "latin1");
        partes.push(buf);
        offset += buf.length;
      };
      escrever("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
      const offsets = [];
      objetos.forEach((obj, i) => {
        offsets.push(offset);
        if (obj && typeof obj === "object" && obj.stream !== undefined) {
          const corpo = obj.stream;
          escrever(`${i + 1} 0 obj\n<< /Length ${Buffer.byteLength(corpo, "latin1")} >>\nstream\n${corpo}\nendstream\nendobj\n`);
        } else {
          escrever(`${i + 1} 0 obj\n${obj}\nendobj\n`);
        }
      });
      const xref = offset;
      escrever(`xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`);
      for (const off of offsets) escrever(`${String(off).padStart(10, "0")} 00000 n \n`);
      escrever(`trailer\n<< /Size ${objetos.length + 1} /Root ${idCatalogo} 0 R /Info ${idInfo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
      void fluxos;
      void pageIndexOfFirstContent;
      return Buffer.concat(partes);
    },

    get pageCount() { return pages.length; },
  };

  return api;
}
