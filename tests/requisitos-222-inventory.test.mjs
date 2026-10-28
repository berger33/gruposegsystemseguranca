import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Reauditoria da matriz de 222 IDs — guarda do INVENTÁRIO, não do aceite.
// Executa `--check` dentro do `npm test` (sem workflow novo): qualquer deriva
// entre a fotografia de 04/10, o workspace e os arquivos gerados bloqueia o CI.
// A guarda também impede que alguém marque aceite humano ou reauditoria
// integral sem uma fatia real de homologação.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATOR = 'scripts/requisitos-222-inventory.mjs';
const CSV = 'docs/REQUISITOS-222-INVENTARIO-2026-10-27.csv';
const JSON_FILE = 'docs/REQUISITOS-222-INVENTARIO-2026-10-27.json';
const REPORT = 'docs/REQUISITOS-222-REAUDITORIA-INVENTARIO-2026-10-27.md';

function runGenerator(args) {
  return execFileSync(process.execPath, [GENERATOR, ...args], { cwd: root, encoding: 'utf8' });
}

function parseCsv(source) {
  const lines = source.split('\n').filter(line => line.trim().length > 0);
  const split = line => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(match => match[1].replaceAll('""', '"'));
  const columns = split(lines[0]);
  return lines.slice(1).map(line => Object.fromEntries(split(line).map((value, index) => [columns[index], value])));
}

test('reauditoria 222: os arquivos versionados conferem com o código atual', () => {
  const stdout = runGenerator(['--check']);
  assert.match(stdout, /^OK: /m, 'rode o gerador e versione CSV + JSON antes do commit');
});

test('reauditoria 222: a matriz histórica tem exatamente 222 IDs únicos em 14 famílias', async () => {
  const data = JSON.parse(await readFile(path.join(root, JSON_FILE), 'utf8'));
  assert.equal(data.resumo.total, 222);
  assert.equal(data.resumo.unicos, 222);
  assert.equal(data.requisitos.length, 222);
  assert.equal(new Set(data.requisitos.map(row => row.id)).size, 222);
  assert.equal(Object.keys(data.resumo.porPrefixo).length, 14);
  assert.deepEqual(data.resumo.porPrefixo, {
    ADM: 12, AI: 10, AST: 12, CLI: 15, CON: 11, CRM: 27, EMP: 19,
    EXT: 17, FIN: 16, HR: 24, OPS: 16, PLT: 18, PUB: 10, SEC: 15,
  });
  const csv = parseCsv(await readFile(path.join(root, CSV), 'utf8'));
  assert.equal(csv.length, 222);
  assert.deepEqual(csv.map(row => row.id), data.requisitos.map(row => row.id),
    'CSV e JSON precisam listar os mesmos IDs na mesma ordem');
});

test('reauditoria 222: 46 a_revalidar, 21 sem menção após fatias CLI-02/03/05..08', async () => {
  const data = JSON.parse(await readFile(path.join(root, JSON_FILE), 'utf8'));
  const resumo = data.resumo;
  assert.equal(resumo.porEstadoDeclarado0410.a_revalidar, 46,
    'a fotografia de 04/10 registra 46 IDs como a_revalidar');
  assert.equal(resumo.porEstadoConfirmado0410.a_revalidar, 45,
    'a coluna de estado confirmado registra 45; a diferença precisa continuar explícita');
  // 36 era o retrato inicial; PLT-11/13 reduziram 2. O mapa SEC reduziu
  // 7 sem gate; fatias focais CLI-02/03/05..08 reduziram mais 6 para 21.
  // É menção técnica em gate, NÃO implementação integral nem aceite humano.
  assert.equal(resumo.aRevalidarSemGate, 21);
  // SEC-03 e CLI-02/03/05..08 têm mapa/prova técnica, sem inferir aceite.
  for (const id of ['SEC-03', 'CLI-02', 'CLI-03', 'CLI-05', 'CLI-06', 'CLI-07', 'CLI-08']) {
    assert.ok(!resumo.idsARevalidarSemGate.includes(id), `${id} tem evidência técnica focal`);
  }
  for (const id of ['PLT-03', 'PLT-15', 'EXT-16', 'EXT-17', 'AI-01', 'AI-10']) {
    assert.ok(resumo.idsARevalidarSemGate.includes(id), `${id} precisa seguir no núcleo sem gate`);
  }
  const byId = new Map(data.requisitos.map(row => [row.id, row]));
  for (const id of resumo.idsARevalidarSemGate) {
    const row = byId.get(id);
    assert.equal(row.estado_declarado_0410, 'a_revalidar');
    assert.equal(row.ocorrencias_gate, 0,
      `${id}: núcleo sem gate não pode ter ocorrência em teste/workflow`);
  }
});

test('reauditoria 222: nenhum ID inventa aceite humano ou reauditoria integral', async () => {
  const data = JSON.parse(await readFile(path.join(root, JSON_FILE), 'utf8'));
  assert.equal(data.resumo.aceiteHumanoRegistrado, 0);
  assert.equal(data.resumo.reauditoriasIntegraisExecutadas, 0);
  for (const row of data.requisitos) {
    assert.equal(row.aceite_humano, 'nao_registrado', `${row.id} não pode ter aceite inferido`);
    assert.equal(row.reauditoria_integral, 'nao_executada', `${row.id} não pode ter reauditoria inferida`);
    assert.ok(['gate_nomeado', 'mencionado_em_gate', 'somente_documento', 'somente_codigo', 'sem_evidencia_legivel']
      .includes(row.classe_evidencia_atual), `${row.id}: classe de evidência inesperada`);
  }
  // Retrato congelado. 22/114/86 → 23/113/86 em 28/10: a fatia CLI-03 de UI
  // criou `tests/cli03-contract-published-details-ui.test.mjs`, então CLI-03
  // passou de `mencionado_em_gate` para `gate_nomeado`. É evidência textual
  // acrescentada, não promoção de aceite (0/222 continua).
  assert.equal(data.resumo.porClasseEvidencia.gate_nomeado, 23);
  assert.equal(data.resumo.porClasseEvidencia.mencionado_em_gate, 113);
  assert.equal(data.resumo.porClasseEvidencia.somente_documento, 86);
  assert.ok(data.requisitos.filter(row => row.prefixo === 'SEC')
    .every(row => row.classe_evidencia_atual === 'mencionado_em_gate'),
  'os 15 IDs SEC devem apontar para o mapa técnico de âncoras, sem inferir aceite');
  // "mencionado" NÃO é "provado": o resumo precisa carregar o aviso.
  assert.ok(data.resumo.limitacoes.some(limit => /NÃO é prova/.test(limit)));
});

test('reauditoria 222: o gerador exclui a própria fonte e não cria auto-evidência', async () => {
  const generator = await readFile(path.join(root, GENERATOR), 'utf8');
  assert.match(generator, /const SOURCE = 'docs\/STATUS-ATUAL-CONSOLIDADO\.md'/);
  assert.ok(generator.includes("SKIP.some(entry => relative === entry)"),
    'o gerador precisa pular a fonte e os próprios artefatos');
  assert.match(generator, /reauditoria_integral: 'nao_executada'/);
  assert.match(generator, /aceite_humano: 'nao_registrado'/);
  const data = JSON.parse(await readFile(path.join(root, JSON_FILE), 'utf8'));
  assert.ok(data.resumo.arquivosVarridos > 1000, 'a varredura precisa cobrir o workspace');
  for (const row of data.requisitos) {
    for (const list of [row.arquivos_gate, row.arquivos_gate_nomeados, row.arquivos_documento, row.arquivos_codigo]) {
      assert.ok(!list.some(file => file.includes('REQUISITOS-222-')),
        `${row.id}: artefatos do próprio inventário não podem contar como evidência`);
    }
  }
});

test('reauditoria 222: a guarda roda no test:unit e o relatório declara o limite', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['test:unit'], /tests\/requisitos-222-inventory\.test\.mjs/);
  const report = await readFile(path.join(root, REPORT), 'utf8');
  assert.match(report, /27/, 'o relatório precisa registrar os 27 a_revalidar sem gate após mapa SEC');
  assert.match(report, /mapa de reauditoria técnica com 35 âncoras/i,
    'o relatório deve explicar por que a classe dos SEC mudou');
  assert.match(report, /não é aceite|nao e aceite|NÃO É ACEITE/i);
  assert.match(report, /0\/222/, 'o relatório precisa declarar 0/222 com aceite humano');
});
