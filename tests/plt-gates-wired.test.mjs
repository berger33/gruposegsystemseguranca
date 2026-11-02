import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// PLT-01 / PLT-06 / PLT-12 — guarda de ORFANDADE de gate.
//
// As três fatias de jornada/RBAC/evidência entregues entre 01 e 02/11/2026
// criaram gates nomeados em PostgreSQL 17 descartável, com relatório datado,
// MAS nenhum deles era chamado por workflow algum: a prova só existia quando
// alguém rodava o script na mão. Um gate que ninguém executa não protege
// contra regressão e não pode ser citado como evidência de CI.
//
// RED: sem o workflow, isto falha. GREEN: os três gates estão ligados, com
// `paths:` precisos, e o script apontado existe no repositório.
//
// Isto NÃO promove requisito, NÃO registra aceite humano e NÃO substitui a
// execução manual: prova apenas ONDE o gate é executado automaticamente.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS_DIR = '.github/workflows';

const PLT_GATES = [
  { id: 'PLT-01', script: 'test:plt01-access-review-coverage:pg', runner: 'scripts/qa-plt01-access-review-coverage-postgres.mjs', focal: 'tests/plt01-access-review-coverage.test.mjs' },
  { id: 'PLT-06', script: 'test:plt06-observability:pg', runner: 'scripts/qa-plt06-observability-postgres.mjs', focal: 'tests/plt06-observability-read-contract.test.mjs' },
  { id: 'PLT-12', script: 'test:plt12-incidents:pg', runner: 'scripts/qa-plt12-incidents-postgres.mjs', focal: 'tests/plt12-incident-response.test.mjs' },
];

const readWorkflows = async () => {
  const files = (await readdir(path.join(root, WORKFLOWS_DIR))).filter(name => name.endsWith('.yml'));
  const entries = [];
  for (const name of files) {
    entries.push({ name, path: `${WORKFLOWS_DIR}/${name}`, content: await readFile(path.join(root, WORKFLOWS_DIR, name), 'utf8') });
  }
  return entries;
};

test('PLT: os gates nomeados existem como script, runner e focal no test:unit', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  for (const gate of PLT_GATES) {
    const command = pkg.scripts[gate.script];
    assert.ok(command, `${gate.id}: falta o script \`${gate.script}\` no package.json`);
    assert.match(command, /qa-plt\d+.*-postgres\.mjs/, `${gate.id}: o script precisa apontar para o runner PostgreSQL`);
    assert.ok(existsSync(path.join(root, gate.runner)), `${gate.id}: runner ${gate.runner} inexistente`);
    assert.ok(existsSync(path.join(root, gate.focal)), `${gate.id}: focal ${gate.focal} inexistente`);
    assert.match(pkg.scripts['test:unit'], new RegExp(gate.focal.replaceAll('.', '\\.')),
      `${gate.id}: o focal precisa rodar no test:unit`);
  }
});

test('PLT: nenhum gate nomeado é órfão — cada um é executado por um workflow', async () => {
  const workflows = await readWorkflows();
  for (const gate of PLT_GATES) {
    // Exige o nome exato do script: `includes()` simples aceitaria um prefixo
    // (`...plt12-incidents:pg` casa dentro de `...plt12-incidents:pg-antigo`),
    // então a guarda precisa recusar continuação de nome depois do comando.
    const call = new RegExp(`npm run ${gate.script.replaceAll(':', ':')}(?![-\\w:])`);
    const callers = workflows.filter(entry => call.test(entry.content));
    assert.ok(callers.length > 0,
      `${gate.id}: \`npm run ${gate.script}\` não é chamado por nenhum workflow de ${WORKFLOWS_DIR}`);
    for (const caller of callers) {
      // Padrão do repositório: todo workflow de entrega usa `paths:` precisos
      // para não disparar a bateria inteira a cada commit.
      assert.match(caller.content, /^\s*paths:/m,
        `${gate.id}: ${caller.path} precisa declarar \`paths:\` como os demais workflows de entrega`);
    }
  }
});

test('PLT: o runner protege os arquivos gerados (E19) e recusa banco do operador', async () => {
  for (const gate of PLT_GATES) {
    const source = await readFile(path.join(root, gate.runner), 'utf8');
    // PLT-01 usa aspas duplas, PLT-06/PLT-12 usam simples: o estilo é incidental,
    // o invariante é importar a guarda síncrona (E19) antes de subir o servidor.
    assert.match(source, /import\s+['"]\.\/qa-generated-files-guard\.mjs['"]/,
      `${gate.id}: o runner precisa importar a guarda síncrona de arquivos gerados (E19)`);
    assert.match(source, /QA_PG_REFUSED/,
      `${gate.id}: o runner precisa recusar execução com DATABASE_URL definida`);
    assert.match(source, /MINIMUM_CASES/,
      `${gate.id}: o runner precisa auditar o resumo TAP com mínimo de casos`);
  }
});
