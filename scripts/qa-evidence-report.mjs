#!/usr/bin/env node
// Relatório de evidência de QA — executa a bateria declarada, registra o
// resultado real de cada passo e emite PDF + ledger JSON.
//
// Objetivo: transformar a bateria de validação (hoje dispersa em saídas de
// terminal) em artefato organizado, auditável e apresentável. Nada aqui
// fabrica resultado: cada linha do PDF vem do código de saída e da saída
// padrão do comando efetivamente executado nesta máquina.
//
// Uso:
//   node scripts/qa-evidence-report.mjs --list
//   node scripts/qa-evidence-report.mjs                      # bateria integral
//   node scripts/qa-evidence-report.mjs --only=typecheck,unit
//   node scripts/qa-evidence-report.mjs --skip=build
//   node scripts/qa-evidence-report.mjs --from-ledger=<arquivo.json>   # só re-renderiza
//
// Saída:
//   docs/evidencias/<slug>.json   ledger estruturado (versionável)
//   docs/evidencias/<slug>.pdf    relatório paginado
//   docs/evidencias/logs/<id>.log saída integral por passo (fora do git)

import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPdfDocument, COLORS } from "./lib/pdf-report.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = path.join(root, "docs", "evidencias");

const MINUTO = 60_000;

/**
 * Bateria declarada. `peso` separa o que é barato do que levanta cluster
 * PostgreSQL descartável. `exigeTap` marca passos cujo resumo TAP é extraído.
 */
const BATERIA = [
  {
    id: "npm-ci",
    titulo: "Instalação determinística de dependências",
    categoria: "Base",
    comando: "npm ci",
    objetivo: "Reinstalar a partir do package-lock e confirmar ausência de vulnerabilidades reportadas.",
    timeout: 10 * MINUTO,
    peso: "leve",
  },
  {
    id: "wave0",
    titulo: "Wave 0 — conformidade estática e ledger de migrações",
    categoria: "Estático",
    comando: "node scripts/qa-wave0-static.mjs",
    objetivo: "Verificar o inventário de migrações 001–161, manifesto e invariantes estáticas do projeto.",
    timeout: 10 * MINUTO,
    peso: "leve",
  },
  {
    id: "typecheck",
    titulo: "Verificação de tipos (tsc --noEmit)",
    categoria: "Estático",
    comando: "npm run typecheck",
    objetivo: "Garantir que a árvore TypeScript compila sem erro após a alteração.",
    timeout: 15 * MINUTO,
    peso: "leve",
  },
  {
    id: "focal-plat01",
    titulo: "Focal PLAT-01 — despacho HTTP à prova de rejeição",
    categoria: "Focal",
    comando: "node --test tests/route-dispatch.test.mjs tests/route-dispatch-guard.test.mjs",
    objetivo: "Cobrir o defeito corrigido: rejeição assíncrona, fail-closed, término de conexão, rede de segurança e guarda estática.",
    timeout: 10 * MINUTO,
    peso: "leve",
    exigeTap: true,
  },
  {
    id: "focal-ext07",
    titulo: "Focal EXT-07 — jornada canônica de compliance",
    categoria: "Focal",
    comando: "node --test tests/ext07-compliance.test.mjs",
    objetivo: "Confirmar que a camada EXT-07 entregue anteriormente segue íntegra.",
    timeout: 10 * MINUTO,
    peso: "leve",
    exigeTap: true,
  },
  {
    id: "focal-ext07-agendamento",
    titulo: "Focal EXT-07 — execução agendada da avaliação temporal",
    categoria: "Focal",
    comando: "node --test tests/ext-compliance-scheduler.test.mjs",
    objetivo: "Cobrir o agendador: opt-in por ambiente, tick fail-closed, ledger de execuções, prova por mutação e guardas estáticas.",
    timeout: 10 * MINUTO,
    peso: "leve",
    exigeTap: true,
  },
  {
    id: "focal-ext08",
    titulo: "Focal EXT-08 — base de conhecimento e POPs canônicos",
    categoria: "Focal",
    comando: "node --test tests/ext08-knowledge.test.mjs",
    objetivo: "Cobrir procedimentos operacionais: criação v1, transições, publicação, ciências, idempotência e rollback atômico.",
    timeout: 10 * MINUTO,
    peso: "leve",
    exigeTap: true,
  },
  {
    id: "focal-ext09",
    titulo: "Focal EXT-09 — expansão, dimensionamento e cenários financeiros",
    categoria: "Focal",
    comando: "node --test tests/ext09-expansion.test.mjs",
    objetivo: "Cobrir planejamento de expansão: criação de planos, cenários financeiros A/B, cálculo de margem, transições e rollback atômico.",
    timeout: 10 * MINUTO,
    peso: "leve",
    exigeTap: true,
  },
  {
    id: "unit",
    titulo: "Suíte unitária integral (npm test)",
    categoria: "Regressão",
    comando: "npm test",
    objetivo: "Executar toda a suíte unitária do projeto, sem skip, todo ou falha.",
    timeout: 30 * MINUTO,
    peso: "leve",
    exigeTap: true,
  },
  {
    id: "build",
    titulo: "Build de produção (next build)",
    categoria: "Regressão",
    comando: "npm run build",
    objetivo: "Compilar a aplicação e confirmar a geração das páginas, incluindo /admin/compliance.",
    timeout: 30 * MINUTO,
    peso: "medio",
  },
  {
    id: "migrations-pg",
    titulo: "Ledger de migrações 001–161 em PostgreSQL descartável",
    categoria: "Banco",
    comando: "npm run test:migrations:pg",
    objetivo: "Aplicar todas as migrações em cluster efêmero, repetir para provar idempotência e rejeitar checksum divergente.",
    timeout: 45 * MINUTO,
    peso: "pesado",
  },
  {
    id: "ext07-pg",
    titulo: "Gate EXT-07 — jornada por HTTP real contra PostgreSQL real",
    categoria: "Banco",
    comando: "npm run test:ext07-compliance:pg",
    objetivo: "Subir servidor HTTP real, sessão staff real e percorrer a jornada de compliance ponta a ponta.",
    timeout: 45 * MINUTO,
    peso: "pesado",
    exigeTap: true,
  },
  {
    id: "ext08-pg",
    titulo: "Gate EXT-08 — base de conhecimento e POPs contra PostgreSQL real",
    categoria: "Banco",
    comando: "npm run test:ext08-knowledge:pg",
    objetivo: "Subir servidor HTTP real, sessões staff e percorrer ciclo completo de POPs e ciências.",
    timeout: 45 * MINUTO,
    peso: "pesado",
    exigeTap: true,
  },
  {
    id: "ext09-pg",
    titulo: "Gate EXT-09 — expansão e cenários contra PostgreSQL real",
    categoria: "Banco",
    comando: "npm run test:ext09-expansion:pg",
    objetivo: "Subir servidor HTTP real, sessões staff e validar ciclo completo de expansão e cenários A/B.",
    timeout: 45 * MINUTO,
    peso: "pesado",
    exigeTap: true,
  },
  {
    id: "ext06-pg",
    titulo: "Gate EXT-06 — satisfação (regressão de vizinhança)",
    categoria: "Banco",
    comando: "npm run test:ext06-satisfaction:pg",
    objetivo: "Provar que o endurecimento do despacho não alterou jornadas HTTP já entregues.",
    timeout: 45 * MINUTO,
    peso: "pesado",
    exigeTap: true,
  },
  {
    id: "ext05-pg",
    titulo: "Gate EXT-05 — qualidade (regressão de vizinhança)",
    categoria: "Banco",
    comando: "npm run test:ext05-quality:pg",
    objetivo: "Regressão de jornada HTTP real independente do EXT-07.",
    timeout: 45 * MINUTO,
    peso: "pesado",
    exigeTap: true,
  },
  {
    id: "ext04-pg",
    titulo: "Gate EXT-04 — fornecedores (regressão de vizinhança)",
    categoria: "Banco",
    comando: "npm run test:ext04-suppliers:pg",
    objetivo: "Regressão de jornada HTTP real independente do EXT-07.",
    timeout: 45 * MINUTO,
    peso: "pesado",
    exigeTap: true,
  },
  {
    id: "diff-check",
    titulo: "Higiene de diff (git diff --check)",
    categoria: "Estático",
    comando: "git diff --check",
    objetivo: "Nenhum espaço em branco residual ou marcador de conflito.",
    timeout: 2 * MINUTO,
    peso: "leve",
  },
];

function parseArgs(argv) {
  const args = { only: null, skip: [], fromLedger: null, list: false, rotulo: null, slug: null };
  for (const a of argv.slice(2)) {
    if (a === "--list") args.list = true;
    else if (a.startsWith("--only=")) args.only = a.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--skip=")) args.skip = a.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--from-ledger=")) args.fromLedger = a.slice(14);
    else if (a.startsWith("--rotulo=")) args.rotulo = a.slice(9);
    else if (a.startsWith("--slug=")) args.slug = a.slice(7);
    else throw new Error(`argumento desconhecido: ${a}`);
  }
  return args;
}

function executar(passo) {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const filho = spawn(passo.comando, {
      cwd: root,
      shell: true,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let saida = "";
    const acumular = (chunk) => { saida += chunk.toString(); };
    filho.stdout.on("data", acumular);
    filho.stderr.on("data", acumular);
    const timer = setTimeout(() => {
      saida += `\n[qa-evidence] TIMEOUT após ${Math.round(passo.timeout / 1000)}s — processo encerrado.\n`;
      filho.kill("SIGKILL");
    }, passo.timeout);
    filho.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        exit_code: code,
        signal: signal || null,
        duracao_ms: Date.now() - inicio,
        saida,
      });
    });
  });
}

/** Extrai o resumo TAP (node:test) quando presente. */
export function extrairTap(saida) {
  const num = (rotulo) => {
    const m = saida.match(new RegExp(`^# ${rotulo} (\\d+)$`, "m"));
    return m ? Number(m[1]) : null;
  };
  const tests = num("tests");
  if (tests === null) return null;
  return { tests, pass: num("pass"), fail: num("fail"), skipped: num("skipped"), todo: num("todo"), cancelled: num("cancelled") };
}

/** Linhas mais informativas para o PDF (TAP falho, resumos, páginas de build). */
export function destaques(saida, { limite = 26 } = {}) {
  const linhas = saida.split("\n");
  const relevantes = linhas.filter((l) => /^(# (tests|pass|fail|skipped|todo|cancelled|duration_ms)|not ok |ok \d|✓|✔|Erro|ERRO|error|Error:|FAIL|PASS|found \d+ vulnerabilit|added \d+ packages|Route \(app\)|○|●|λ|\[qa-|\s*TAP|migra|Migra|gate|Gate|total|Total|OK —|OK:)/.test(l));
  const base = relevantes.length ? relevantes : linhas.filter((l) => l.trim());
  if (base.length <= limite) return base;
  const cabeca = base.slice(0, Math.ceil(limite / 2));
  const cauda = base.slice(-Math.floor(limite / 2));
  return [...cabeca, `... (${base.length - limite} linhas omitidas; log integral em docs/evidencias/logs/) ...`, ...cauda];
}

const formatarDuracao = (ms) => {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${String(Math.round(s - m * 60)).padStart(2, "0")} s`;
};

async function coletarContexto() {
  const git = (cmd) => new Promise((resolve) => {
    const p = spawn(cmd, { cwd: root, shell: true, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (c) => { out += c.toString(); });
    p.on("close", () => resolve(out.trim()));
  });
  const [commit, branch, sujo, node] = await Promise.all([
    git("git rev-parse HEAD"),
    git("git rev-parse --abbrev-ref HEAD"),
    git("git status --porcelain | wc -l"),
    Promise.resolve(process.version),
  ]);
  return { commit, branch, arquivos_modificados: Number(sujo || 0), node, plataforma: `${process.platform} ${process.arch}` };
}

function renderizarPdf(ledger, destinoPdf) {
  const { resumo, passos, contexto, rotulo, gerado_em } = ledger;
  const tudoOk = resumo.falhas === 0;
  const doc = createPdfDocument({
    title: `Relatório de evidência de QA — ${rotulo}`,
    author: "Grupo SEG System Segurança — Engenharia",
    subject: "Execução de bateria de validação com resultado verificável",
    creationDate: new Date(gerado_em),
  });

  doc.cover({
    etiqueta: "Controle de qualidade — evidência de execução",
    titulo: `Relatório de evidência de QA`,
    subtitulo: rotulo,
    metadados: [
      ["Gerado em", new Date(gerado_em).toISOString().replace("T", " ").slice(0, 19) + " UTC"],
      ["Repositório", "berger33/gruposegsystemseguranca"],
      ["Branch", contexto.branch],
      ["Commit", contexto.commit],
      ["Árvore de trabalho", contexto.arquivos_modificados === 0 ? "limpa" : `${contexto.arquivos_modificados} arquivo(s) modificado(s)`],
      ["Runtime", `Node ${contexto.node} — ${contexto.plataforma}`],
      ["Passos executados", `${resumo.total}`],
      ["Duração total", formatarDuracao(resumo.duracao_total_ms)],
    ],
    nota: "Cada resultado deste relatório provém do código de saída e da saída padrão do comando efetivamente executado na máquina indicada. Nenhum valor é transcrito manualmente. Os logs integrais acompanham o ledger JSON de mesmo nome.",
  });

  doc.pageBreak();
  doc.heading("1. Resultado consolidado");
  doc.statusBanner({
    rotulo: tudoOk ? "BATERIA APROVADA — nenhum passo falhou" : "BATERIA REPROVADA — há passo com falha",
    valor: `${resumo.sucessos}/${resumo.total}`,
    color: tudoOk ? COLORS.ok : COLORS.fail,
  });
  doc.keyValues([
    ["Passos aprovados", `${resumo.sucessos}`, COLORS.ok],
    ["Passos reprovados", `${resumo.falhas}`, resumo.falhas ? COLORS.fail : COLORS.ink],
    ["Asserções de teste agregadas", `${resumo.tap_total} executadas — ${resumo.tap_pass} aprovadas, ${resumo.tap_fail} reprovadas`],
    ["Skip / todo / cancelados", `${resumo.tap_skip} / ${resumo.tap_todo} / ${resumo.tap_cancelled}`,
      resumo.tap_skip + resumo.tap_todo + resumo.tap_cancelled === 0 ? COLORS.ok : COLORS.warn],
    ["Duração total", formatarDuracao(resumo.duracao_total_ms)],
  ], { larguraChave: 200 });

  doc.subheading("Quadro geral");
  doc.table({
    columns: [
      { header: "#", width: 0.05 },
      { header: "Passo", width: 0.40, bold: false },
      { header: "Categoria", width: 0.12 },
      { header: "Asserções", width: 0.14 },
      { header: "Duração", width: 0.12 },
      { header: "Resultado", width: 0.17, bold: true },
    ],
    rows: passos.map((p, i) => ({
      cells: [
        String(i + 1),
        p.titulo,
        p.categoria,
        p.tap ? `${p.tap.pass}/${p.tap.tests}` : "—",
        formatarDuracao(p.duracao_ms),
        p.aprovado ? "APROVADO" : "REPROVADO",
      ],
      colors: [null, null, null, null, null, p.aprovado ? COLORS.ok : COLORS.fail],
    })),
  });

  doc.paragraph(
    "Critério de aprovação por passo: código de saída 0. Para passos sob node:test, exige-se ainda zero falha, zero skip, zero todo e zero cancelado — o gate não reduz asserção para passar.",
    { size: 9, color: COLORS.muted },
  );

  doc.pageBreak();
  doc.heading("2. Evidência detalhada por passo");
  doc.paragraph(
    "Cada bloco traz o comando exato, o objetivo da verificação, o desfecho e um recorte fiel da saída. Os recortes preservam as linhas de resumo e as linhas de falha; quando há corte, o volume omitido é informado e o log integral permanece disponível.",
    { size: 9.5, color: COLORS.muted },
  );

  passos.forEach((p, i) => {
    doc.subheading(`${i + 1}. ${p.titulo}`, { color: p.aprovado ? COLORS.brand : COLORS.fail });
    doc.keyValues([
      ["Comando", p.comando],
      ["Categoria / peso", `${p.categoria} — ${p.peso}`],
      ["Objetivo", p.objetivo],
      ["Código de saída", `${p.exit_code}${p.signal ? ` (sinal ${p.signal})` : ""}`, p.aprovado ? COLORS.ok : COLORS.fail],
      ["Duração", formatarDuracao(p.duracao_ms)],
      ...(p.tap ? [["Resumo TAP", `${p.tap.tests} testes — ${p.tap.pass} ok, ${p.tap.fail} falhas, ${p.tap.skipped} skip, ${p.tap.todo} todo`,
        p.tap.fail === 0 && p.tap.skipped === 0 && p.tap.todo === 0 ? COLORS.ok : COLORS.fail]] : []),
      ["Desfecho", p.aprovado ? "APROVADO" : "REPROVADO", p.aprovado ? COLORS.ok : COLORS.fail],
    ], { larguraChave: 120, size: 9.5 });
    const recorte = p.destaques?.length ? p.destaques : ["(sem saída — o comando é silencioso quando aprova)"];
    doc.mono(recorte, { titulo: "Recorte da saída" });
    doc.rule();
  });

  if (ledger.secoes?.length) {
    doc.pageBreak();
    doc.heading("3. Contexto técnico da entrega");
    for (const secao of ledger.secoes) {
      doc.subheading(secao.titulo);
      for (const paragrafo of secao.paragrafos || []) doc.paragraph(paragrafo, { size: 9.8 });
      if (secao.itens?.length) doc.bullets(secao.itens, { size: 9.8 });
      if (secao.tabela) doc.table(secao.tabela);
      if (secao.mono) doc.mono(secao.mono, { titulo: secao.monoTitulo || "" });
    }
  }

  return doc.build({ rodape: `Evidência de QA — ${rotulo} — commit ${ledger.contexto.commit.slice(0, 12)}` });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.list) {
    for (const p of BATERIA) console.log(`${p.id.padEnd(16)} ${p.peso.padEnd(7)} ${p.titulo}`);
    return 0;
  }

  await mkdir(path.join(DESTINO, "logs"), { recursive: true });

  if (args.fromLedger) {
    const ledger = JSON.parse(await readFile(path.resolve(root, args.fromLedger), "utf8"));
    const destinoPdf = path.join(DESTINO, `${ledger.slug}.pdf`);
    await writeFile(destinoPdf, renderizarPdf(ledger, destinoPdf));
    console.log(`PDF regenerado: ${path.relative(root, destinoPdf)}`);
    return 0;
  }

  const selecionados = BATERIA
    .filter((p) => (args.only ? args.only.includes(p.id) : true))
    .filter((p) => !args.skip.includes(p.id));
  if (!selecionados.length) throw new Error("nenhum passo selecionado");

  const contexto = await coletarContexto();
  const rotulo = args.rotulo || "Bateria de validação";
  const slug = args.slug || `qa-evidencia-${new Date().toISOString().slice(0, 10)}`;
  const passos = [];

  console.log(`[qa-evidence] ${selecionados.length} passo(s) — commit ${contexto.commit.slice(0, 12)} — branch ${contexto.branch}`);
  for (const [indice, passo] of selecionados.entries()) {
    process.stdout.write(`[qa-evidence] (${indice + 1}/${selecionados.length}) ${passo.id} ... `);
    const r = await executar(passo);
    const tap = extrairTap(r.saida);
    const tapLimpo = tap ? tap.fail === 0 && (tap.skipped || 0) === 0 && (tap.todo || 0) === 0 && (tap.cancelled || 0) === 0 : true;
    const aprovado = r.exit_code === 0 && tapLimpo;
    const registro = {
      ...passo,
      exit_code: r.exit_code,
      signal: r.signal,
      duracao_ms: r.duracao_ms,
      tap,
      aprovado,
      destaques: destaques(r.saida),
      log: `logs/${passo.id}.log`,
      bytes_saida: Buffer.byteLength(r.saida),
    };
    delete registro.timeout;
    passos.push(registro);
    await writeFile(path.join(DESTINO, "logs", `${passo.id}.log`), r.saida);
    console.log(`${aprovado ? "APROVADO" : "REPROVADO"} (${formatarDuracao(r.duracao_ms)})`);
  }

  const soma = (f) => passos.reduce((acc, p) => acc + (p.tap ? p.tap[f] || 0 : 0), 0);
  const resumo = {
    total: passos.length,
    sucessos: passos.filter((p) => p.aprovado).length,
    falhas: passos.filter((p) => !p.aprovado).length,
    duracao_total_ms: passos.reduce((a, p) => a + p.duracao_ms, 0),
    tap_total: soma("tests"),
    tap_pass: soma("pass"),
    tap_fail: soma("fail"),
    tap_skip: soma("skipped"),
    tap_todo: soma("todo"),
    tap_cancelled: soma("cancelled"),
  };

  let secoes = [];
  const caminhoSecoes = path.join(DESTINO, `${slug}.secoes.json`);
  try { secoes = JSON.parse(await readFile(caminhoSecoes, "utf8")); } catch {}

  const ledger = { slug, rotulo, gerado_em: new Date().toISOString(), contexto, resumo, passos, secoes };
  const destinoJson = path.join(DESTINO, `${slug}.json`);
  const destinoPdf = path.join(DESTINO, `${slug}.pdf`);
  await writeFile(destinoJson, `${JSON.stringify(ledger, null, 2)}\n`);
  await writeFile(destinoPdf, renderizarPdf(ledger, destinoPdf));

  console.log(`[qa-evidence] ledger: ${path.relative(root, destinoJson)}`);
  console.log(`[qa-evidence] pdf:    ${path.relative(root, destinoPdf)}`);
  console.log(`[qa-evidence] resultado: ${resumo.sucessos}/${resumo.total} passos aprovados`);
  return resumo.falhas === 0 ? 0 : 1;
}

const chamadoDiretamente = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (chamadoDiretamente) {
  main().then((code) => { process.exitCode = code; }).catch((e) => {
    console.error("[qa-evidence] falhou:", e?.stack || e?.message || e);
    process.exitCode = 1;
  });
}

export { BATERIA, renderizarPdf, formatarDuracao };
