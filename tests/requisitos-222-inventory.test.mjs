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

test('reauditoria 222: 46 a_revalidar, contagem atual de IDs sem menção em gate', async () => {
  const data = JSON.parse(await readFile(path.join(root, JSON_FILE), 'utf8'));
  const resumo = data.resumo;
  assert.equal(resumo.porEstadoDeclarado0410.a_revalidar, 46,
    'a fotografia de 04/10 registra 46 IDs como a_revalidar');
  assert.equal(resumo.porEstadoConfirmado0410.a_revalidar, 45,
    'a coluna de estado confirmado registra 45; a diferença precisa continuar explícita');
  // 36 era o retrato inicial; PLT-11/13 reduziram 2. O mapa SEC reduziu
  // 7 sem gate; fatias focais CLI-02/03/05..08 reduziram mais 6 para 21; a
  // promoção da aba PLT-10 (28/10) tirou mais um do núcleo, deixando 20. A 19ª
  // promoção do console (01/11) citou PLT-03 e PLT-15; o gate PLT-07 e a prova
  // corrente do PLT-02 acrescentaram menções técnicas. Em 02/11 a jornada de
  // cobertura da revisão periódica de acessos criou dois testes com o ID no
  // nome e um gate dedicado, então PLT-01 saiu do núcleo (16 → 15). Em 02/11 a
  // fatia PLT-06 criou mais dois testes nomeados, um gate e um relatório, e
  // PLT-06 saiu do núcleo (15 → 14). Isso reduz a contagem sem gate, mas não
  // reaudita nem fecha os requisitos.
  assert.equal(resumo.aRevalidarSemGate, 14);
  // IDs com mapa/prova textual nomeada ou mencionada; nenhum recebe aceite por isso.
  for (const id of ['SEC-03', 'CLI-02', 'CLI-03', 'CLI-05', 'CLI-06', 'CLI-07', 'CLI-08', 'PLT-01', 'PLT-02', 'PLT-03', 'PLT-06', 'PLT-07', 'PLT-10', 'PLT-15']) {
    assert.ok(!resumo.idsARevalidarSemGate.includes(id), `${id} tem evidência técnica focal`);
  }
  for (const id of ['EXT-16', 'EXT-17', 'AI-01', 'AI-10']) {
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
  // passou de `mencionado_em_gate` para `gate_nomeado`. No mesmo dia a promoção
  // da aba PLT-10 (teste focal nomeado por área, não pelo ID) moveu PLT-10 de
  // `somente_documento` para `mencionado_em_gate`: 23/114/85. É evidência
  // textual acrescentada, não promoção de aceite (0/222 continua).
  // 23/114/85 → 23/115/84 em 31/10: o teste focal do CMS
  // (`ux-pro-03-ti-cms-conteudo-ui.test.mjs`) cita PUB-06, que sai de
  // `somente_documento` para `mencionado_em_gate` — mesma natureza dos casos
  // acima: evidência textual acrescentada, NÃO promoção de aceite (0/222).
  // 23/115/84 → 23/116/83 em 01/11 com PLT-05 (16ª promoção) e → 23/118/81 com
  // EMP-18/EMP-19 (17ª promoção, `browser UX-PRO-03 EMP-18/19`): os dois IDs
  // saem de `somente_documento` porque o cenário de gate os cita no conteúdo.
  // Mesma natureza: evidência textual, não aceite (0/222).
  // 23/118/81 → 23/120/79 em 01/11 com PUB-02/PUB-05 (18ª promoção,
  // `browser UX-PRO-03 PUB-02/05`): o relatório e o cenário de gate citam os
  // dois IDs. Continua sendo evidência textual acrescentada — nenhum dos dois
  // está aceito por humano, e a reauditoria integral segue 0/222.
  // 23/120/79 → 23/122/77 em 01/11 com a 19ª promoção (PLT-03 e PLT-15): os
  // dois IDs saem de `somente_documento` porque o relatório e o cenário
  // `browser UX-PRO-03 PLT-03` os citam. PLT-07 e PLT-02 também passam a
  // `mencionado_em_gate` por provas focais/browser, sem alterar o estado dos
  // requisitos nem inferir aceite.
  // 23/124/75 → 24/124/74 em 02/11: PLT-01 ganhou dois testes com o ID no nome
  // e um gate dedicado (cobertura da revisão periódica de acessos). Evidência
  // textual acrescentada; o requisito segue `a_revalidar` e 0/222 com aceite.
  // 24/124/74 → 25/124/73 também em 02/11: PLT-06 ganhou testes nomeados, gate
  // PostgreSQL dedicado e relatório de jornada/RBAC. Mesma natureza: onde
  // procurar a prova, não aceite humano.
  assert.equal(data.resumo.porClasseEvidencia.gate_nomeado, 25);
  assert.equal(data.resumo.porClasseEvidencia.mencionado_em_gate, 124);
  assert.equal(data.resumo.porClasseEvidencia.somente_documento, 73);
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
  assert.match(report, /mapa de reauditoria técnica com 35 âncoras/i,
    'o relatório deve explicar por que a classe dos SEC mudou');
  assert.match(report, /não é aceite|nao e aceite|NÃO É ACEITE/i);
  assert.match(report, /0\/222/, 'o relatório precisa declarar 0/222 com aceite humano');
});

// E23 — o §3 do relatório era escrito à mão e derivou do artefato (27 → 20 sem
// gate depois das promoções de UI). Esta guarda recontá-lo a partir do JSON:
// o texto não pode afirmar número ou núcleo diferentes do artefato gerado.
test('E23: o §3 do relatório confere com o JSON vigente (contagens e núcleo duro)', async () => {
  const data = JSON.parse(await readFile(path.join(root, JSON_FILE), 'utf8'));
  const report = await readFile(path.join(root, REPORT), 'utf8');

  for (const [classe, esperado] of Object.entries(data.resumo.porClasseEvidencia)) {
    const linha = new RegExp('\\| `' + classe + '` \\|[^\\n]*\\| \\*\\*(\\d+)\\*\\* \\|').exec(report);
    assert.ok(linha, `o §2 precisa declarar a classe ${classe}`);
    assert.equal(Number(linha[1]), esperado, `${classe} divergiu do JSON (${esperado})`);
  }

  const semGate = /`a_revalidar` sem nenhuma menção em gate\*\* \| \*\*(\d+)\*\*/.exec(report);
  assert.ok(semGate, 'o §3 precisa declarar o a_revalidar sem gate');
  assert.equal(Number(semGate[1]), data.resumo.aRevalidarSemGate,
    'o §3 precisa repetir o aRevalidarSemGate do JSON');

  const nucleo = /### O núcleo duro \((\d+) IDs\)\n\n([\s\S]*?)\n\n/.exec(report);
  assert.ok(nucleo, 'o §3 precisa manter a seção do núcleo duro');
  const declarados = expandirFaixas(nucleo[2]);
  const aRevalidar = new Set(data.requisitos.filter(row => row.estado_declarado_0410 === 'a_revalidar').map(row => row.id));
  assert.equal(Number(nucleo[1]), declarados.length,
    'o título do núcleo precisa contar os IDs listados');
  assert.ok(declarados.every(id => aRevalidar.has(id)),
    'o núcleo duro lista requisitos ainda a_revalidar, independentemente de já haver menção em gate');
  assert.ok(data.resumo.idsARevalidarSemGate.every(id => declarados.includes(id)),
    'todo requisito sem gate continua no núcleo duro, mas o núcleo pode incluir itens com evidência parcial');

  assert.ok(report.includes(data.resumo.arquivosVarridos.toLocaleString('pt-BR')),
    `o §2 precisa citar os ${data.resumo.arquivosVarridos} arquivos varridos`);
});

/**
 * Expande notação de intervalo do tipo "`AI-01`…`AI-10`" e devolve IDs únicos
 * ordenados. Só entende a forma usada no relatório; qualquer outra coisa seria
 * adivinhação.
 */
function expandirFaixas(trecho) {
  const ids = new Set();
  const tokens = [...trecho.matchAll(/`([A-Z]{2,3})-(\d{2})`|…/g)];
  let anterior = null;
  let intervalo = false;
  for (const token of tokens) {
    if (token[0] === '…') {
      intervalo = Boolean(anterior);
      continue;
    }
    const [, prefixo, numero] = token;
    if (intervalo && anterior && anterior.prefixo === prefixo) {
      for (let n = Number(anterior.numero) + 1; n < Number(numero); n += 1) {
        ids.add(`${prefixo}-${String(n).padStart(2, '0')}`);
      }
    }
    ids.add(`${prefixo}-${numero}`);
    anterior = { prefixo, numero };
    intervalo = false;
  }
  return [...ids].sort();
}
