import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWLIST, CSV_FILE, REPORT_FILE, buildCoverageMap, declaredCases, extractCommands,
  parseWorkflow, renderCsv, renderReport, runnerInfo,
} from '../scripts/qa-ci-coverage-map.mjs';

// Fatia 06B — guarda do MAPA de equivalência de cobertura da CI.
//
// O mapa não prova jornada: ele prova ONDE cada gate é executado e impede que
// um gate volte a ficar órfão (script existir e nenhum workflow chamar), que um
// comando aponte para arquivo inexistente ou que o versionado fique velho em
// relação ao código. A execução de cada jornada continua sendo provada pelo TAP
// do próprio gate.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('06B: extrator cobre as formas de comando realmente usadas pelos workflows', () => {
  const kinds = (text) => extractCommands(text).map((command) => `${command.kind}:${command.target}`);

  assert.deepEqual(kinds('npm run test:l08-delivery:pg'), ['npm:test:l08-delivery:pg']);
  assert.deepEqual(kinds('npm test'), ['npm:test']);
  assert.deepEqual(kinds('npm run "test:backup-restore:pg:http"'), ['npm:test:backup-restore:pg:http']);
  assert.deepEqual(kinds('npm ci'), [], 'npm ci é instalação, não gate');
  assert.deepEqual(kinds('npm audit --audit-level=moderate'), [], 'npm audit não é script do manifest');

  const direct = extractCommands('RUN_DATABASE_INTEGRATION=1 node --test --test-concurrency=1 tests/client-security.integration.test.mjs');
  assert.deepEqual(direct.map((command) => `${command.kind}:${command.files.join(',')}`),
    ['node-test:tests/client-security.integration.test.mjs']);

  const withoutFlag = extractCommands('RUN_DATABASE_INTEGRATION=1 node tests/ai-rag.integration.test.mjs');
  assert.deepEqual(withoutFlag.map((command) => `${command.kind}:${command.files.join(',')}`),
    ['node-test:tests/ai-rag.integration.test.mjs'], 'sem `--test` o arquivo ainda é a jornada');

  assert.deepEqual(kinds('npm run test:ux-public-routes:pg 2>&1 | tail -30'), ['npm:test:ux-public-routes:pg']);
  assert.deepEqual(kinds('node scripts/qa-wave0-static.mjs'), ['runner:scripts/qa-wave0-static.mjs']);
});

test('06B: laço `for gate in …` do backup/restore resolve cada variante e indireção sem laço reprova', () => {
  const loop = [
    'set +e',
    'failed=0',
    'for gate in \\',
    '  test:backup-restore:pg \\',
    '  test:backup-restore:pg:clusters \\',
    '  test:backup-restore:pg:files',
    'do',
    '  npm run "$gate"',
    '  result=$?',
    'done',
  ].join('\n');
  const commands = extractCommands(loop);
  assert.deepEqual(commands.map((command) => command.target),
    ['test:backup-restore:pg', 'test:backup-restore:pg:clusters', 'test:backup-restore:pg:files']);
  for (const command of commands) assert.equal(command.via, 'loop:gate');

  // Sem o laço correspondente, o parser NÃO pode chutar o alvo: falha fechada.
  const loose = extractCommands('npm run "$gate"');
  assert.deepEqual(loose.map((command) => command.kind), ['unresolved']);
});

test('06B: parser lê passos com comentário entre eles, bloco `|` e escalar dobrado `>-`', () => {
  const source = [
    'name: exemplo',
    'on:',
    '  pull_request:',
    'jobs:',
    '  gate:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - run: npm ci',
    '      # comentário entre passos não encerra a lista (regressão do 1º parser)',
    '      - name: Gate serial',
    '        run: |',
    '          set -e',
    '          npm run test:l08-delivery:pg',
    '      - name: Relatório',
    '        run: >-',
    '          node scripts/qa-evidence-report.mjs',
    '          --only=typecheck,unit',
  ].join('\n');
  const parsed = parseWorkflow(source, 'exemplo.yml');
  assert.equal(parsed.jobs.length, 1);
  assert.equal(parsed.jobs[0].name, 'gate');
  // `actions/checkout` e `npm ci` não produzem comando de gate: ficam fora do
  // mapa de propósito (instalação não prova jornada).
  const names = parsed.jobs[0].steps.map((step) => step.name);
  assert.deepEqual(names, ['Gate serial', 'Relatório']);
  assert.deepEqual(parsed.jobs[0].steps[0].commands.map((command) => command.target), ['test:l08-delivery:pg'],
    'bloco `|` preserva a linha do gate');
  assert.deepEqual(parsed.jobs[0].steps[1].commands.map((command) => command.target),
    ['scripts/qa-evidence-report.mjs'], 'escalar dobrado vira uma linha só');
});

test('06B: contagem de casos é de declarações `test(` e o piso TAP vem do runner', () => {
  const source = [
    "test('um', () => {});",
    "test('dois', () => {});",
    "test.skip('pulado', () => {});",
    'const notATest = 1;',
  ].join('\n');
  assert.equal(declaredCases(source), 3, 'skip conta como declaração, não como execução garantida');

  const runner = 'const MINIMUM_CASES = 21;\nspawn(node, ["--test", "tests/staff.integration.test.mjs"]);';
  assert.deepEqual(runnerInfo(runner), { tests: ['tests/staff.integration.test.mjs'], floor: 21 });
  assert.deepEqual(runnerInfo('console.log("sem gate")'), { tests: [], floor: null });
});

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'seg-ci-map-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const write = async (relative, content) => {
    await mkdir(path.dirname(path.join(directory, relative)), { recursive: true });
    await writeFile(path.join(directory, relative), content);
  };
  await write('package.json', JSON.stringify({
    scripts: {
      test: 'npm run test:unit',
      'test:unit': 'node --test tests/a.test.mjs',
      'test:orphan': 'node --test tests/b.test.mjs',
      'test:aliasado': 'node --test tests/a.test.mjs',
      'test:runner': 'node scripts/qa-runner.mjs',
      'test:pendurado': 'node --test tests/inexistente.test.mjs',
      dev: 'node server.mjs',
    },
  }, null, 2));
  await write('tests/a.test.mjs', "test('a', () => {});\n");
  await write('tests/b.test.mjs', "test('b', () => {});\n");
  await write('tests/livre.test.mjs', "test('livre', () => {});\n");
  await write('scripts/qa-runner.mjs', 'const MINIMUM_CASES = 1;\nspawn("node", ["--test", "tests/a.test.mjs"]);\n');
  await write('.github/workflows/ci.yml', [
    'jobs:',
    '  base:',
    '    steps:',
    '      - run: npm test',
    '      - run: npm run test:runner',
  ].join('\n'));
  return directory;
}

test('06B: mapa classifica alcance, alias, órfão, comando pendurado e allowlist obsoleta', async (t) => {
  const directory = await fixture(t);
  const map = await buildCoverageMap({ root: directory, allowlist: [] });
  assert.deepEqual(map.failures.dangling.map((item) => item.target), ['tests/inexistente.test.mjs'],
    'script que aponta para arquivo inexistente não pode passar em silêncio');
  assert.deepEqual(map.failures.orphanTests, ['tests/b.test.mjs', 'tests/livre.test.mjs']);
  assert.deepEqual(map.failures.orphanScripts.map((item) => item.name).sort(),
    ['test:orphan', 'test:pendurado'], 'alias não é órfão: os alvos já são alcançados');
  assert.deepEqual(map.aliasScripts.sort(), ['test:aliasado'],
    'script cujos alvos já são alcançados é alias, não órfão');
  assert.equal(map.counts.reachableTests, 1, 'só `a.test.mjs` é alcançado pelo workflow');
  assert.equal(map.reachable.npm.has('dev'), false, 'script local (dev) nunca é promovido a gate');
  assert.equal(map.reachable.npm.has('test:unit'), true, 'o caminho `npm test` → `test:unit` é resolvido');

  const withAllowlist = await buildCoverageMap({
    root: directory,
    allowlist: [{ alvo: 'tests/livre.test.mjs', tipo: 'teste', motivo: 'fixture' }],
  });
  assert.deepEqual(withAllowlist.failures.orphanTests, ['tests/b.test.mjs']);
  assert.deepEqual(withAllowlist.failures.staleAllowlist, [], 'entrada válida não é obsoleta');

  // Se o alvo passa a ser alcançado, a allowlist fica obsoleta e o mapa reprova:
  // allowlist não pode virar depósito permanente de dívida silenciosa.
  const stale = await buildCoverageMap({
    root: directory,
    allowlist: [{ alvo: 'tests/a.test.mjs', tipo: 'teste', motivo: 'já coberto' }],
  });
  assert.deepEqual(stale.failures.staleAllowlist, ['tests/a.test.mjs']);
});

test('06B: workflow sem job reconhecido e `npm run "$X"` solto reprovam por falha fechada', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'seg-ci-map-vazio-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, '.github', 'workflows'), { recursive: true });
  await mkdir(path.join(directory, 'tests'));
  await mkdir(path.join(directory, 'scripts'));
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ scripts: {} }));
  await writeFile(path.join(directory, '.github', 'workflows', 'quebrado.yml'), 'name: sem jobs\non: push\n');
  await writeFile(path.join(directory, '.github', 'workflows', 'solto.yml'), [
    'jobs:', '  base:', '    steps:', '      - run: npm run "$desconhecido"',
  ].join('\n'));
  const map = await buildCoverageMap({ root: directory, allowlist: [] });
  assert.equal(map.failures.unresolved.length, 2);
  assert.ok(map.failures.unresolved.some((item) => item.command.includes('nenhum job reconhecido')));
  assert.ok(map.failures.unresolved.some((item) => item.command.includes('$desconhecido')));
});

test('06B: o mapa versionado confere com o repositório e não há gate nem teste órfão', async () => {
  const stdout = execFileSync(process.execPath, ['scripts/qa-ci-coverage-map.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.match(stdout, /^OK: /m, 'regenere CSV + relatório antes de versionar (`npm run qa:ci-map`)');
  assert.match(stdout, /docs\/CI-MAPA-COBERTURA-2026-11-07\.csv/);

  const map = await buildCoverageMap();
  assert.equal(map.failures.orphanTests.length, 0, `teste inalcançável: ${map.failures.orphanTests.join(', ')}`);
  assert.equal(map.failures.dangling.length, 0, 'comando de workflow apontando para alvo inexistente');
  assert.equal(map.failures.unresolved.length, 0, 'indireção que o parser não resolveu');
  assert.equal(map.failures.orphanRunners.length, 0, `runner de gate sem workflow: ${map.failures.orphanRunners.join(', ')}`);
  assert.equal(map.failures.staleAllowlist.length, 0, 'allowlist com entrada já coberta');
  assert.equal(map.failures.orphanScripts.length, 0,
    `gate sem workflow: ${map.failures.orphanScripts.map((item) => item.name).join(', ')}`);
  assert.equal(map.counts.workflows, 60, 'o mapa precisa ver os 60 workflows versionados');
  assert.ok(map.counts.reachableTests >= 240, `arquivos de teste alcançados abaixo do esperado: ${map.counts.reachableTests}`);
});

test('06B: nenhum gate é mascarado por `continue-on-error` ou `|| true` nos workflows', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(path.join(root, '.github', 'workflows'))).filter((name) => /\.ya?ml$/.test(name));
  assert.equal(files.length, 60);
  for (const file of files) {
    const source = await readFile(path.join(root, '.github', 'workflows', file), 'utf8');
    assert.doesNotMatch(source, /continue-on-error:\s*true/,
      `${file}: mascarar falha de gate com continue-on-error contradiz "nenhum skip silencioso"`);
    assert.doesNotMatch(source, /\|\|\s*true/,
      `${file}: "|| true" transforma falha de gate em sucesso`);
  }
});

test('06B: render é determinístico para o mesmo repositório', async () => {
  const first = await buildCoverageMap();
  const second = await buildCoverageMap();
  assert.equal(renderCsv(first), renderCsv(second));
  assert.equal(renderReport(first), renderReport(second));
  assert.equal(CSV_FILE, 'docs/CI-MAPA-COBERTURA-2026-11-07.csv');
  assert.equal(REPORT_FILE, 'docs/CI-EQUIVALENCIA-COBERTURA-2026-11-07.md');
  assert.ok(ALLOWLIST.length >= 1, 'a allowlist precisa declarar os resíduos com motivo');
  for (const entry of ALLOWLIST) assert.ok(entry.motivo.length > 40, `motivo curto demais: ${entry.alvo}`);
});

test('06B: auditor TAP dos gates reaproveitados recusa skip, falha, todo e resumo inconsistente', async () => {
  const { auditTapSummary } = await import('../scripts/lib/qa-tap-summary.mjs');
  const summary = ({ tests = 21, pass = 21, fail = 0, cancelled = 0, skipped = 0, todo = 0 } = {}) => [
    'TAP version 13',
    "ok 1 - jornada nomeada",
    '1..1',
    `# tests ${tests}`,
    '# suites 0',
    `# pass ${pass}`,
    `# fail ${fail}`,
    `# cancelled ${cancelled}`,
    `# skipped ${skipped}`,
    `# todo ${todo}`,
  ].join('\n');

  assert.deepEqual(auditTapSummary(summary(), { minimum: 21 }), { problems: [], tests: 21 });
  assert.deepEqual(auditTapSummary(summary({ skipped: 21, pass: 0 }), { minimum: 21 }).problems.sort(),
    ['pass_diferente_de_tests', 'skipped'], 'TAP todo skip é exit 0 no Node: o auditor precisa recusar');
  assert.ok(auditTapSummary(summary({ fail: 1, pass: 20 }), { minimum: 1 }).problems.includes('fail'));
  assert.ok(auditTapSummary(summary({ todo: 1, pass: 20 }), { minimum: 1 }).problems.includes('todo'));
  assert.ok(auditTapSummary(summary({ tests: 20, pass: 20 }), { minimum: 21 }).problems.includes('abaixo_do_piso'));
  assert.ok(auditTapSummary(summary(), { minimum: 1, truncated: true }).problems.includes('output_limit'));
  assert.ok(auditTapSummary('sem resumo nenhum', { minimum: 1 }).problems.includes('counter_tests'));
  assert.ok(auditTapSummary(`${summary()}\n# tests 21`, { minimum: 1 }).problems.includes('counter_tests'),
    'resumo duplicado não pode passar');
  assert.ok(auditTapSummary('# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n', { minimum: 1 })
    .problems.includes('sem_cenario_nomeado'), 'contar só o nome do arquivo não é cenário');
});
