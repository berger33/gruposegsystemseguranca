// Evidência de QA — o próprio artefato de evidência precisa ser confiável.
//
// Um relatório que trava, corta texto ou pinta de verde um passo reprovado é
// pior que nenhum relatório. Estes testes cobrem o gerador de PDF sem
// dependência externa (estrutura do arquivo, quebra de linha, acentuação) e as
// funções que interpretam a saída real dos comandos.
import test from "node:test";
import assert from "node:assert/strict";
import { createPdfDocument, measureText, wrapText, COLORS } from "../scripts/lib/pdf-report.mjs";
import { extrairTap, destaques, renderizarPdf, BATERIA, formatarDuracao } from "../scripts/qa-evidence-report.mjs";

const LARGURA_CONTEUDO = 595 - 48 - 48;

/** Validação estrutural de PDF sem biblioteca: cabeçalho, xref e trailer. */
function validarPdf(buffer) {
  const texto = buffer.toString("latin1");
  assert.equal(texto.startsWith("%PDF-1.4\n"), true, "cabeçalho PDF ausente");
  assert.equal(texto.trimEnd().endsWith("%%EOF"), true, "trailer %%EOF ausente");

  const posXref = texto.lastIndexOf("xref\n0 ");
  assert.ok(posXref > 0, "tabela xref ausente");
  const startxref = Number(texto.slice(texto.lastIndexOf("startxref") + 9).trim().split("\n")[0]);
  assert.equal(startxref, posXref, "startxref não aponta para a tabela xref");

  // Formato: "xref" / "0 N" / entrada livre / N-1 entradas de objeto.
  const linhasXref = texto.slice(posXref).split("\n");
  assert.equal(linhasXref[0], "xref");
  const totalObjetos = Number(linhasXref[1].trim().split(/\s+/)[1]);
  assert.ok(Number.isInteger(totalObjetos) && totalObjetos > 1, "cabeçalho da xref ilegível");
  assert.match(linhasXref[2], /^0000000000 65535 f $/, "entrada livre da xref ausente");
  const offsets = linhasXref.slice(3, 3 + totalObjetos - 1).map((l) => {
    assert.match(l, /^\d{10} 00000 n $/, `entrada xref malformada: ${JSON.stringify(l)}`);
    return Number(l.slice(0, 10));
  });
  assert.equal(offsets.length, totalObjetos - 1, "quantidade de entradas xref divergente");
  offsets.forEach((off, i) => {
    const esperado = `${i + 1} 0 obj`;
    assert.equal(texto.slice(off, off + esperado.length), esperado,
      `offset da entrada ${i + 1} não aponta para o objeto correspondente`);
  });

  const count = Number(texto.match(/\/Type \/Pages \/Kids \[([^\]]*)\] \/Count (\d+)/)[2]);
  const paginas = (texto.match(/\/Type \/Page /g) || []).length;
  assert.equal(paginas, count, "/Count divergente do número de objetos de página");
  assert.match(texto, /\/Producer \(gruposegsystemseguranca qa-evidence\)/);
  for (const fonte of ["/Helvetica", "/Helvetica-Bold", "/Courier"]) {
    assert.ok(texto.includes(`/BaseFont ${fonte} /Encoding /WinAnsiEncoding`), `fonte ${fonte} não declarada com WinAnsiEncoding`);
  }
  return { paginas, texto };
}

test("evidência: quebra de linha nunca estoura a largura útil", () => {
  const amostras = [
    "Gate EXT-07 — jornada por HTTP real contra PostgreSQL real, com sessão staff e autoauditoria TAP",
    "palavrainterminavelquenaotemespaconenhumeprecisaserquebradaporcaracteresemqualquerhipoteseabsoluta",
    "ok 12 - PLAT-01 rejeição assíncrona vira 500 fail-closed (o defeito original do despacho)",
  ];
  for (const texto of amostras) {
    for (const linha of wrapText(texto, LARGURA_CONTEUDO, { size: 10 })) {
      assert.ok(measureText(linha, { size: 10 }) <= LARGURA_CONTEUDO + 0.5,
        `linha excede a largura útil: ${linha}`);
    }
  }
});

test("evidência: texto acentuado e travessões sobrevivem à codificação", () => {
  const doc = createPdfDocument({ title: "Acentuação" });
  doc.cover({ titulo: "Relatório de validação", subtitulo: "execução — ação, coerção, atenção", metadados: [["Chave", "Ação"]] });
  const buffer = doc.build();
  const { texto } = validarPdf(buffer);
  for (const palavra of ["Relat\u00f3rio", "valida\u00e7\u00e3o", "execu\u00e7\u00e3o", "coer\u00e7\u00e3o"]) {
    assert.ok(texto.includes(palavra), `acentuação perdida: ${palavra}`);
  }
  assert.ok(texto.includes("\u0097"), "travessão deveria virar o byte 0x97 do WinAnsi");
  assert.equal(texto.includes("â€”"), false, "não pode haver UTF-8 cru dentro do PDF");
});

test("evidência: parênteses e contrabarras da saída não corrompem o PDF", () => {
  const doc = createPdfDocument({ title: "Escape" });
  doc.paragraph("caminho C:\\temp\\log (parcial) — fim)");
  doc.mono(["assert (a) \\ (b)", "res.end() — ) ( \\"]);
  validarPdf(doc.build());
});

test("evidência: documento longo pagina e numera corretamente", () => {
  const doc = createPdfDocument({ title: "Longo" });
  doc.cover({ titulo: "Bateria", metadados: [["x", "y"]] });
  for (let i = 0; i < 40; i += 1) {
    doc.subheading(`Passo ${i}`);
    doc.mono(Array.from({ length: 30 }, (_, j) => `ok ${j} - asserção sintética ${i}.${j}`));
  }
  const buffer = doc.build({ rodape: "rodapé" });
  const { paginas, texto } = validarPdf(buffer);
  assert.ok(paginas > 8, `esperado documento multipágina, obtido ${paginas}`);
  assert.ok(texto.includes(`P\u00e1gina ${paginas} de ${paginas}`), "rodapé da última página incorreto");
  assert.ok(texto.includes(`P\u00e1gina 1 de ${paginas}`), "rodapé da primeira página incorreto");
});

test("evidência: tabela com muitas linhas repete o cabeçalho em cada página", () => {
  const doc = createPdfDocument({ title: "Tabela" });
  doc.table({
    columns: [{ header: "Identificador", width: 0.5 }, { header: "Resultado", width: 0.5 }],
    rows: Array.from({ length: 90 }, (_, i) => ({ cells: [`passo-${i}`, "APROVADO"] })),
  });
  const { paginas, texto } = validarPdf(doc.build());
  assert.ok(paginas >= 2, "a tabela deveria ocupar mais de uma página");
  const ocorrenciasCabecalho = (texto.match(/\(Identificador\) Tj/g) || []).length;
  assert.equal(ocorrenciasCabecalho, paginas, "o cabeçalho precisa ser repetido em cada página da tabela");
});

test("evidência: nenhuma página sai em branco", () => {
  // Regressão: uma régua decorativa no fim de seção abria página nova, e o
  // pageBreak seguinte deixava uma página contendo apenas o rodapé.
  // Caso determinístico na borda inferior: o cursor é posicionado a poucos
  // pontos do rodapé e então se pede uma régua decorativa. Antes da correção,
  // a régua abria página nova e o pageBreak seguinte deixava essa página
  // contendo apenas o rodapé.
  const naBorda = createPdfDocument({ title: "Borda" });
  naBorda.paragraph("conteúdo real no topo da página");
  const antes = naBorda.pageCount;
  naBorda.spacer(720); // cursor a ~6 pt acima da margem inferior
  naBorda.rule();
  assert.equal(naBorda.pageCount, antes, "régua decorativa não pode abrir página nova");
  naBorda.pageBreak();
  naBorda.heading("Seção após a quebra");
  naBorda.paragraph("texto");
  const bufferBorda = naBorda.build({ rodape: "rodapé" });
  const borda = validarPdf(bufferBorda);
  [...borda.texto.matchAll(/stream\n([\s\S]*?)\nendstream/g)].forEach((m, i) => {
    assert.ok((m[1].match(/\) Tj/g) || []).length > 2, `página ${i + 1} ficou só com o rodapé`);
  });

  // Propriedade: para qualquer volume de saída, nenhuma página fica só com o
  // rodapé.
  for (let linhas = 40; linhas <= 92; linhas += 1) {
    const doc = createPdfDocument({ title: "Em branco" });
    doc.cover({ titulo: "Capa", metadados: [["a", "b"]] });
    doc.heading("Seção");
    doc.mono(Array.from({ length: linhas }, (_, j) => `linha ${j} de saída sintética do passo`));
    doc.rule();
    doc.pageBreak();
    doc.heading("Seção final");
    doc.paragraph("Conteúdo após a quebra.");
    const buffer = doc.build({ rodape: "rodapé" });
    const { texto, paginas } = validarPdf(buffer);
    const fluxos = [...texto.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) => m[1]);
    assert.equal(fluxos.length, paginas, "cada página precisa ter um fluxo de conteúdo");
    fluxos.forEach((fluxo, i) => {
      // O rodapé contribui com exatamente duas escritas de texto.
      const escritas = (fluxo.match(/\) Tj/g) || []).length;
      assert.ok(escritas > 2, `com ${linhas} linhas, a página ${i + 1} contém apenas o rodapé`);
    });
  }
});

test("evidência: resumo TAP é extraído da saída real do node:test", () => {
  const saida = ["TAP version 13", "ok 1 - a", "not ok 2 - b", "1..2", "# tests 2", "# suites 0", "# pass 1", "# fail 1", "# cancelled 0", "# skipped 0", "# todo 0", "# duration_ms 12.3"].join("\n");
  assert.deepEqual(extrairTap(saida), { tests: 2, pass: 1, fail: 1, skipped: 0, todo: 0, cancelled: 0 });
  assert.equal(extrairTap("saída de build sem TAP"), null, "comando sem TAP não pode inventar resumo");
});

test("evidência: recorte preserva as linhas de falha e informa o que omitiu", () => {
  const ruido = Array.from({ length: 400 }, (_, i) => `ok ${i} - asserção ${i}`);
  const recorte = destaques([...ruido, "not ok 401 - asserção quebrada", "# tests 401", "# fail 1"].join("\n"));
  assert.ok(recorte.length <= 28, "o recorte precisa caber no relatório");
  assert.ok(recorte.some((l) => l.includes("linhas omitidas")), "omissão precisa ser declarada");
  assert.ok(recorte.some((l) => l.includes("# fail 1")), "o resumo de falha não pode ser cortado");
});

test("evidência: passo com skip ou todo não pode ser pintado como aprovado", () => {
  // Reproduz a regra de aprovação do runner sobre um TAP com skip.
  const tap = extrairTap(["# tests 10", "# pass 9", "# fail 0", "# cancelled 0", "# skipped 1", "# todo 0"].join("\n"));
  const tapLimpo = tap.fail === 0 && tap.skipped === 0 && tap.todo === 0 && tap.cancelled === 0;
  assert.equal(tapLimpo, false, "skip precisa reprovar o passo");
});

test("evidência: relatório de bateria reprovada é renderizado e marcado em vermelho", () => {
  const ledger = {
    slug: "sintetico",
    rotulo: "Bateria sintética",
    gerado_em: "2026-10-04T00:00:00.000Z",
    contexto: { commit: "0".repeat(40), branch: "arena/teste", arquivos_modificados: 0, node: "v22.0.0", plataforma: "linux x64" },
    resumo: { total: 2, sucessos: 1, falhas: 1, duracao_total_ms: 65000, tap_total: 10, tap_pass: 9, tap_fail: 1, tap_skip: 0, tap_todo: 0, tap_cancelled: 0 },
    passos: [
      { titulo: "Passo bom", categoria: "Focal", peso: "leve", comando: "node --test x", objetivo: "o", exit_code: 0, signal: null, duracao_ms: 5000, tap: { tests: 9, pass: 9, fail: 0, skipped: 0, todo: 0 }, aprovado: true, destaques: ["# pass 9"] },
      { titulo: "Passo ruim", categoria: "Banco", peso: "pesado", comando: "npm run test:x:pg", objetivo: "o", exit_code: 1, signal: null, duracao_ms: 60000, tap: { tests: 1, pass: 0, fail: 1, skipped: 0, todo: 0 }, aprovado: false, destaques: ["not ok 1 - quebrou"] },
    ],
    secoes: [{ titulo: "Contexto", paragrafos: ["Texto."], itens: ["item"] }],
  };
  const buffer = renderizarPdf(ledger, "/tmp/ignorado.pdf");
  const { texto } = validarPdf(buffer);
  assert.ok(texto.includes("BATERIA REPROVADA"), "bateria com falha precisa ser anunciada como reprovada");
  assert.ok(texto.includes("REPROVADO"), "o passo com falha precisa aparecer como reprovado");
  const vermelho = COLORS.fail.map((c) => c.toFixed(3)).join(" ") + " rg";
  assert.ok(texto.includes(vermelho), "a falha precisa ser destacada na cor de reprovação");
});

test("evidência: a bateria declarada cobre o alvo e os gates de regressão", () => {
  const ids = BATERIA.map((p) => p.id);
  for (const obrigatorio of ["typecheck", "focal-plat01", "unit", "build", "migrations-pg", "ext07-pg", "diff-check"]) {
    assert.ok(ids.includes(obrigatorio), `passo ausente da bateria: ${obrigatorio}`);
  }
  assert.equal(new Set(ids).size, ids.length, "identificadores duplicados na bateria");
  for (const passo of BATERIA) {
    assert.ok(passo.timeout > 0, `${passo.id} sem timeout`);
    assert.ok(passo.objetivo?.length > 20, `${passo.id} sem objetivo descrito`);
    assert.ok(["leve", "medio", "pesado"].includes(passo.peso), `${passo.id} com peso inválido`);
  }
});

test("evidência: duração é formatada de forma legível", () => {
  assert.equal(formatarDuracao(1500), "1.5 s");
  assert.equal(formatarDuracao(65000), "1 min 05 s");
  assert.equal(formatarDuracao(3_600_000), "60 min 00 s");
});
