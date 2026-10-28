#!/usr/bin/env node
// Reauditoria da matriz de 222 IDs — INVENTÁRIO REPRODUZÍVEL (não aceite).
//
//   node scripts/requisitos-222-inventory.mjs           # regenera CSV + JSON
//   node scripts/requisitos-222-inventory.mjs --check  # exit 1 se desatualizado
//
// O que este script FAZ: lê a fotografia de 04/10 em
// docs/STATUS-ATUAL-CONSOLIDADO.md (14 tabelas, 222 IDs únicos) e cruza cada
// ID com evidência LEGÍVEL POR MÁQUINA do workspace atual: testes, workflows,
// documentos, src/ e scripts/. Produz um índice de ONDE procurar.
//
// O que este script NÃO FAZ: não reaudita jornada por papel, não executa
// aceite humano, não marca requisito como "concluído", não substitui UAT e
// não transforma "mencionado num teste" em "provado". `aceite_humano` e
// `reauditoria_integral` ficam explicitamente `nao_registrado` em todos.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'docs/STATUS-ATUAL-CONSOLIDADO.md';
const CSV = 'docs/REQUISITOS-222-INVENTARIO-2026-10-27.csv';
const JSON_FILE = 'docs/REQUISITOS-222-INVENTARIO-2026-10-27.json';
const DATE = '2026-10-27';

const ID_SHAPE = /^[A-Z][A-Z0-9-]*-\d+$/;
const ID_SCAN = /\b([A-Z][A-Z0-9-]*-\d+)\b/gi;
const ID_IN_TEXT = /a_revalidar|pronto_local|em_execucao|entregue|pendente|nao_iniciado|bloqueado|condicional|parcial/i;

async function walk(directory) {
  const out = [];
  let entries = [];
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...await walk(absolute));
    else out.push(absolute);
  }
  return out;
}

function normalizeState(value) {
  const text = (value || '').replace(/\*/g, '').toLowerCase();
  for (const key of ['a_revalidar', 'pronto_local', 'em_execucao', 'entregue', 'pendente', 'nao_iniciado', 'bloqueado', 'condicional']) {
    if (text.includes(key)) return key;
  }
  return ID_IN_TEXT.test(text) ? 'outro' : 'nao_declarado';
}

/** Lê as 14 tabelas `| ID | ... |` da fotografia histórica. */
async function readMatrix() {
  const lines = (await readFile(path.join(root, SOURCE), 'utf8')).split('\n');
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*\| ID \|/.test(lines[index])) continue;
    let cursor = index + 2; // pula o separador |---|---|
    while (cursor < lines.length && /^\s*\|/.test(lines[cursor])) {
      const cells = lines[cursor].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
      while (cells.length < 6) cells.push('');
      const [id, requisito, estadoDeclarado, estadoConfirmado, pendencia, proximaAcao] = cells;
      if (ID_SHAPE.test(id)) {
        rows.push({
          id, requisito, estadoDeclarado, estadoConfirmado, pendencia, proximaAcao,
          prefixo: id.split('-')[0],
          estadoDeclaradoNorm: normalizeState(estadoDeclarado),
          estadoConfirmadoNorm: normalizeState(estadoConfirmado),
        });
      }
      cursor += 1;
    }
    index = cursor - 1;
  }
  return rows;
}

/** Variantes do ID como aparecem em NOMES de arquivo (EXT-07 → ext07, ext-07, ext_07). */
function filenameVariants(id) {
  const [prefix, number] = id.split(/-(?=\d+$)/);
  const lower = `${prefix.toLowerCase()}${number}`;
  return [lower, `${prefix.toLowerCase()}-${number}`, `${prefix.toLowerCase()}_${number}`];
}

// Mapas de REAUDITORIA TÉCNICA não são documentação comum: contêm âncoras de
// asserção executável (arquivo:linha) e o resultado da execução real dos
// gates. Por isso entram na classe de GATE, não na de documento. A distinção
// é deliberada e precisa continuar explícita: continua NÃO sendo aceite
// humano nem reauditoria integral por jornada.
const REAUDIT_GATE_FILES = new Set([
  'docs/REQUISITOS-SEC-REAUDITORIA-2026-10-28.json',
  'docs/REQUISITOS-SEC-EVIDENCIA-EXECUCAO-2026-10-28.json',
]);

const SCAN_DIRS = ['tests', '.github/workflows', 'docs', 'src', 'scripts'];
const SCAN_EXT = new Set(['.mjs', '.js', '.ts', '.tsx', '.md', '.yml', '.yaml', '.json', '.sql', '.css']);
const SKIP = [
  SOURCE, CSV, JSON_FILE,
  'docs/REQUISITOS-222-REAUDITORIA-INVENTARIO-2026-10-27.md',
  'scripts/requisitos-222-inventory.mjs',
  'tests/requisitos-222-inventory.test.mjs',
  // Documentos de META-ESTADO: descrevem a fila/auditoria corrente, não provam
  // requisito algum. Se entrassem na varredura, editar o próprio status mudaria
  // o índice e o --check ficaria frágil (auto-referência).
  'docs/STATUS-VIGENTE.md',
  'docs/AUDITORIA-FATIAS-PENDENTES-E-ERROS-2026-10-26.md',
];

async function readWorkspace() {
  const files = [];
  for (const directory of SCAN_DIRS) {
    for (const absolute of await walk(path.join(root, directory))) {
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (!SCAN_EXT.has(path.extname(absolute))) continue;
      if (SKIP.some(entry => relative === entry)) continue;
      // snapshots/pastas de evidência binária não entram no índice textual
      if (/\.(png|jpg|jpeg|zip|webp|gif)$/i.test(relative)) continue;
      files.push(relative);
    }
  }
  return files.sort();
}

const rows = await readMatrix();
const known = new Set(rows.map(row => row.id));
const files = await readWorkspace();

// Uma varredura por arquivo (não 222 × N): extrai todos os IDs citados.
const evidence = new Map(rows.map(row => [row.id, {
  gate: [], gateNamed: [], documento: [], codigo: [],
  ocorrenciasGate: 0, ocorrenciasDocumento: 0, ocorrenciasCodigo: 0,
}]));

for (const relative of files) {
  const source = await readFile(path.join(root, relative), 'utf8').catch(() => '');
  const isGate = relative.startsWith('tests/') || relative.startsWith('.github/workflows/')
    || REAUDIT_GATE_FILES.has(relative);
  const isCode = relative.startsWith('src/') || relative.startsWith('scripts/');
  const isDoc = relative.startsWith('docs/');
  const matches = [...source.matchAll(ID_SCAN)].map(match => match[1].toUpperCase());
  const unique = [...new Set(matches)].filter(id => known.has(id));
  if (!unique.length) continue;
  for (const id of unique) {
    const bucket = evidence.get(id);
    const count = matches.filter(value => value === id).length;
    if (isGate) {
      bucket.ocorrenciasGate += count;
      bucket.gate.push(relative);
      const base = path.basename(relative).toLowerCase();
      if (filenameVariants(id).some(variant => base.includes(variant))) bucket.gateNamed.push(relative);
    } else if (isCode) {
      bucket.ocorrenciasCodigo += count;
      bucket.codigo.push(relative);
    } else if (isDoc) {
      bucket.ocorrenciasDocumento += count;
      bucket.documento.push(relative);
    }
  }
}

function classify(bucket) {
  if (bucket.gateNamed.length) return 'gate_nomeado';
  if (bucket.gate.length) return 'mencionado_em_gate';
  if (bucket.documento.length) return 'somente_documento';
  if (bucket.codigo.length) return 'somente_codigo';
  return 'sem_evidencia_legivel';
}

const cap = list => [...new Set(list)].sort().slice(0, 8);
const inventory = rows.map(row => {
  const bucket = evidence.get(row.id);
  return {
    id: row.id,
    prefixo: row.prefixo,
    requisito: row.requisito.replace(/\|/g, '/').slice(0, 240),
    estado_declarado_0410: row.estadoDeclaradoNorm,
    estado_confirmado_0410: row.estadoConfirmadoNorm,
    pendencia_0410: row.pendencia.replace(/\|/g, '/').slice(0, 240),
    classe_evidencia_atual: classify(bucket),
    arquivos_gate_nomeados: cap(bucket.gateNamed),
    arquivos_gate: cap(bucket.gate),
    arquivos_documento: cap(bucket.documento),
    arquivos_codigo: cap(bucket.codigo),
    ocorrencias_gate: bucket.ocorrenciasGate,
    ocorrencias_documento: bucket.ocorrenciasDocumento,
    ocorrencias_codigo: bucket.ocorrenciasCodigo,
    // Nunca inferido: nenhum ID desta matriz tem aceite humano registrado.
    aceite_humano: 'nao_registrado',
    reauditoria_integral: 'nao_executada',
  };
});

const countBy = key => inventory.reduce((acc, row) => { acc[row[key]] = (acc[row[key]] || 0) + 1; return acc; }, {});
const aRevalidar = inventory.filter(row => row.estado_declarado_0410 === 'a_revalidar').map(row => row.id);
const aRevalidarSemGate = inventory
  .filter(row => row.estado_declarado_0410 === 'a_revalidar' && !['gate_nomeado', 'mencionado_em_gate'].includes(row.classe_evidencia_atual))
  .map(row => row.id);

const summary = {
  fonte: SOURCE,
  data: DATE,
  metodo: 'varredura textual determinística de testes/workflows/docs/src/scripts; uma passada por arquivo; IDs extraídos por regex e cruzados com a matriz de 222; exclui a fonte, os artefatos gerados e os documentos de meta-estado',
  total: inventory.length,
  unicos: new Set(inventory.map(row => row.id)).size,
  porPrefixo: countBy('prefixo'),
  porEstadoDeclarado0410: countBy('estado_declarado_0410'),
  porEstadoConfirmado0410: countBy('estado_confirmado_0410'),
  porClasseEvidencia: countBy('classe_evidencia_atual'),
  aRevalidarDeclarado: aRevalidar.length,
  aRevalidarSemGate: aRevalidarSemGate.length,
  idsARevalidarSemGate: aRevalidarSemGate,
  aceiteHumanoRegistrado: inventory.filter(row => row.aceite_humano !== 'nao_registrado').length,
  reauditoriasIntegraisExecutadas: inventory.filter(row => row.reauditoria_integral !== 'nao_executada').length,
  arquivosVarridos: files.length,
  limitacoes: [
    '"mencionado em gate" NÃO é prova de jornada nem de aceite',
    'a fotografia de 04/10 é histórica e não foi revalidada por papel',
    'nenhuma reauditoria integral por jornada/papel foi executada',
    'sem UAT, leitor de tela, Windows real, produção ou aceite humano',
  ],
};

const csvEscape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const CSV_COLUMNS = [
  'id', 'prefixo', 'requisito', 'estado_declarado_0410', 'estado_confirmado_0410',
  'pendencia_0410', 'classe_evidencia_atual', 'ocorrencias_gate',
  'ocorrencias_documento', 'ocorrencias_codigo', 'arquivos_gate_nomeados',
  'arquivos_gate', 'arquivos_documento', 'arquivos_codigo',
  'aceite_humano', 'reauditoria_integral',
];
const csv = [
  CSV_COLUMNS.map(csvEscape).join(','),
  ...inventory.map(row => CSV_COLUMNS.map(column =>
    csvEscape(Array.isArray(row[column]) ? row[column].join(' | ') : row[column])).join(',')),
  '',
].join('\n');
const json = `${JSON.stringify({ resumo: summary, requisitos: inventory }, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const currentCsv = await readFile(path.join(root, CSV), 'utf8').catch(() => '');
  const currentJson = await readFile(path.join(root, JSON_FILE), 'utf8').catch(() => '');
  const outdated = [];
  if (currentCsv !== csv) outdated.push(CSV);
  if (currentJson !== json) outdated.push(JSON_FILE);
  console.log(JSON.stringify(summary, null, 2));
  if (outdated.length) {
    console.error(`DESATUALIZADO: ${outdated.join(', ')} — rode "node scripts/requisitos-222-inventory.mjs" e versione o resultado.`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${CSV} e ${JSON_FILE} conferem com o código atual (${summary.total} IDs; ${summary.aRevalidarSemGate} a_revalidar sem gate).`);
  }
} else {
  await writeFile(path.join(root, CSV), csv, 'utf8');
  await writeFile(path.join(root, JSON_FILE), json, 'utf8');
  console.log(JSON.stringify({ ...summary, inventario: CSV, json: JSON_FILE }, null, 2));
}
