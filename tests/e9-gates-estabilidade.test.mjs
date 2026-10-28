import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// E9 — fechamento da frente de instabilidade de gates. Três padrões de
// estabilidade já existiam no código (l04, ext14, demo-local), mas nenhum era
// protegido por guarda: uma refatoração silenciosa poderia reintroduzir a
// flakiness sem que nenhum teste reclamasse. Esta guarda congela os padrões e
// exige que o runner de demo NÃO deixe arquivos gerados sujos na árvore.
//
// RED desta fatia: `qa-local-demo-persistent.mjs` reescreve next-env.d.ts com
// `.next/dev/types/...` e não restaurava — descoberto ao rodar o gate e ver o
// SHA versionado mudar de 1862ac4b… para 0f706298….

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');

test('E9: l04 espera a hidratação do data-theme antes de ler o atributo', async () => {
  const gate = await read('tests/l04-delivery.integration.test.mjs');
  const block = gate.slice(gate.indexOf('L04 fechamento: temas persistidos'),
    gate.indexOf('L04 fechamento: pacotes de catálogo'));
  assert.ok(block.length > 200, 'o subteste 17 de temas precisa existir');
  assert.match(block, /waitForFunction\(\(\)\s*=>\s*document\.documentElement\.dataset\.theme\s*===\s*'tech'/,
    'ler data-theme de rota pré-renderizada sem esperar hidratação é a causa da flakiness');
  assert.match(block, /page\.reload\(\{waitUntil:'domcontentloaded'\}\)/,
    'o reload precisa ser medido também');
  const waitPos = block.indexOf('waitForFunction');
  const readPos = block.indexOf("getAttribute('data-theme')");
  assert.ok(waitPos >= 0 && readPos > waitPos,
    'a espera precisa vir ANTES da leitura do atributo');
  assert.match(block, /polling:100/, 'a espera precisa ter polling explícito, não timeout arbitrário');
});

test('E9: ext14 retry de Chromium filtra só crash de infraestrutura', async () => {
  const gate = await read('tests/ext14-intel.integration.test.mjs');
  assert.match(gate, /const BROWSER_CRASH = \/Target page, context or browser has been closed/,
    'o filtro de crash precisa ser explícito, não um catch genérico');
  assert.match(gate, /for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/,
    'o launch do Chromium precisa de até 3 tentativas');
  assert.match(gate, /for \(let attempt = 1; attempt <= 2; attempt \+= 1\)/,
    'a sessão de UI precisa de até 2 tentativas');
  assert.match(gate, /error\?\.code === "ERR_ASSERTION" \|\| !BROWSER_CRASH\.test/,
    'uma asserção de negócio NUNCA pode ser re-tentada como se fosse crash');
  assert.match(gate, /EXT14_BROWSER_LAUNCH_RETRY/, 'o retry de launch precisa ser visível no log');
  assert.match(gate, /EXT14_BROWSER_SESSION_RETRY/, 'o retry de sessão precisa ser visível no log');
  assert.match(gate, /await browser\?\.close\(\)\.catch\(\(\) => \{\}\)/,
    'a tentativa falha precisa fechar o browser antes de tentar de novo');
  const runner = await read('scripts/qa-ext14-intel-postgres.mjs');
  assert.match(runner, /AWS_EXECUTION_ENV: "AWS_Lambda_nodejs22\.x"/,
    'sem a variável o chromium empacotado não expõe args e o gate cai (D10)');
});

test('E9: os runners do E9 usam o helper compartilhado de snapshot/restore', async () => {
  const helper = await read('scripts/qa-generated-files.mjs');
  assert.match(helper, /GENERATED_FILES = \['next-env\.d\.ts', 'tsconfig\.json'\]/,
    'o helper precisa cobrir os DOIS arquivos que o Next reescreve');
  assert.match(helper, /export async function snapshotGeneratedFiles/);
  assert.match(helper, /export async function restoreGeneratedFiles/);
  assert.match(helper, /export async function withCleanGeneratedFiles/,
    'o helper precisa oferecer a forma envelopada para runners futuros');
  assert.match(helper, /content !== null/, 'nunca inventar arquivo que não existia');
  // `local-demo.mjs` roda `server.mjs --dev` com allowlist de env e SEM
  // NEXT_DIST_DIR: o Next reescreve next-env.d.ts para `.next/dev/types/...`.
  const demo = await read('scripts/qa-local-demo-persistent.mjs');
  assert.match(demo, /qa-generated-files\.mjs/, 'o runner de demo precisa usar o helper');
  assert.match(demo, /snapshotGeneratedFiles\(\)/);
  assert.match(demo, /restoreGeneratedFiles\(generatedSnapshot\)/);
  assert.match(demo, /QA-HOM-008_GENERATED_FILES_RESTORED/,
    'o restore precisa ser visível no log para diagnóstico de CI');
  // O ext14 usa NEXT_DIST_DIR='.next/integration-ext14' e contaminava os DOIS
  // arquivos (next-env → e15fd6c2…, tsconfig com 2 includes extras).
  const ext14 = await read('scripts/qa-ext14-intel-postgres.mjs');
  assert.match(ext14, /qa-generated-files\.mjs/, 'o runner do ext14 precisa usar o helper');
  assert.match(ext14, /restoreGeneratedFiles\(generatedSnapshot\)/);
  assert.match(ext14, /QA_EXT14_GENERATED_FILES_RESTORED/);
  for (const runner of [demo, ext14]) {
    assert.match(runner, /finally/, 'o restore precisa acontecer no finally, inclusive em falha');
    // O restore precisa estar protegido por um finally INTERNO: se o cleanup
    // do postgres/rm lançar, a árvore ainda tem de ser devolvida.
    assert.ok((runner.match(/\bfinally\b/g) || []).length >= 2,
      'o restore precisa de um finally interno que sobreviva a falha de cleanup');
  }
  const hygiene = await read('tests/generated-files-hygiene.test.mjs');
  assert.match(hygiene, /assert\.match\(content,[^\n]*routes/,
    'a guarda E2 precisa continuar exigindo o routes.d.ts do distDir padrão');
  assert.match(hygiene, /assert\.doesNotMatch\(content, \/integration-\//,
    'a guarda E2 precisa continuar recusando distDir isolado no arquivo versionado');
});

test('E9: a dívida dos demais runners está inventariada, não escondida', async () => {
  const report = await read('docs/E9-ESTABILIZACAO-GATES-2026-10-27.md');
  assert.match(report, /E19/, 'a dívida sistêmica precisa virar fatia nomeada');
  assert.match(report, /74|62|47/, 'o relatório precisa quantificar os runners sem restore');
  assert.match(report, /NEXT_DIST_DIR/, 'o relatório precisa explicar a causa');
  assert.match(report, /E3-R2/, 'o item sem logs precisa permanecer declarado como não atribuído');
});

test('E9/E19: nenhum runner que spawn processos fica sem proteção de arquivos gerados', async () => {
  const { readdir } = await import('node:fs/promises');
  const runners = (await readdir(path.join(root, 'scripts')))
    .filter(file => /^qa-.*\.mjs$/.test(file)).sort();
  const desprotegidos = [];
  let spawnam = 0;
  for (const file of runners) {
    const source = await read(`scripts/${file}`);
    if (!/spawn\(|execFileSync|execSync/.test(source)) continue;
    spawnam += 1;
    // Três formas válidas de proteção: o guard de saída (E19), snapshot/restore
    // explícito, ou o envelope withCleanGeneratedFiles (E9).
    const protegido = /qa-generated-files-guard\.mjs|restoreGeneratedFiles|withCleanGeneratedFiles/.test(source);
    if (!protegido) desprotegidos.push(file);
  }
  // Antes da E19: 67 runners spawnavam, 65 sem proteção (teto congelado em 74).
  // Depois da E19: TODOS protegidos. O teto agora é ZERO e não pode subir.
  assert.ok(spawnam >= 67, `inventário de runners mudou: ${spawnam} spawnam processos`);
  assert.deepEqual(desprotegidos, [],
    `runners sem proteção de next-env.d.ts/tsconfig.json: ${desprotegidos.join(', ')}`);
});

test('E9: demo-local mantém erro nomeado e limpeza exclusiva', async () => {
  const runner = await read('scripts/qa-local-demo-persistent.mjs');
  assert.match(runner, /demo_isolated_restore_failed/,
    'a falha de restore isolado precisa continuar nomeada, não engolida');
  assert.match(runner, /QA-HOM-008_REFUSED/, 'o runner precisa recusar banco do operador');
  assert.match(runner, /QA-HOM-008\/009_TEMP_CLEANED/, 'o cleanup precisa ser reportado');
  assert.match(runner, /exitOfBounded/, 'recusas precisam de limite de tempo, não pendurar o CI');
  assert.doesNotMatch(runner, /\brm\([^)]*tmpdir\(\)/,
    'nunca remover o tmpdir inteiro, só os mkdtemp que o runner criou');
});

test('E9: os três gates estão no CI e a guarda roda no test:unit', async () => {
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /npm run test:demo-local:pg/, 'o restore persistente precisa rodar no CI');
  assert.match(ci, /npm test/, 'a suíte unitária precisa rodar no CI');
  const pkg = JSON.parse(await read('package.json'));
  for (const script of ['test:demo-local:pg', 'test:ext14-intel:pg', 'test:l04-delivery:pg']) {
    assert.ok(pkg.scripts[script], `script ${script} precisa existir`);
  }
  assert.match(pkg.scripts['test:unit'], /tests\/e9-gates-estabilidade\.test\.mjs/,
    'esta guarda precisa fazer parte da suíte local/CI');
});
