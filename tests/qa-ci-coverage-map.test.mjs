import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWLIST, CSV_FILE, REPORT_FILE, TAP_AUDIT_ALLOWLIST, buildCoverageMap, declaredCases,
  extractCommands, parseWorkflow, renderCsv, renderReport, runnerInfo,
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

  const runner = [
    "import { assertTapSummary, collectTap } from './lib/qa-tap-summary.mjs';",
    'const MINIMUM_CASES = 21;',
    'const child = spawn(node, ["--test", "tests/staff.integration.test.mjs"], { stdio: ["ignore", "pipe", "pipe"] });',
    'const out = await collectTap(child);',
    'if (!assertTapSummary(out.output, { minimum: MINIMUM_CASES, label: "staff" }).ok) process.exit(1);',
  ].join('\n');
  assert.deepEqual(runnerInfo(runner), {
    tests: ['tests/staff.integration.test.mjs'],
    floor: 21,
    tapAudit: 'auditado_tap',
    tapMode: 'qa-tap-summary',
    executesNodeTest: true,
  });
  assert.deepEqual(runnerInfo('console.log("sem gate")'), {
    tests: [],
    floor: null,
    tapAudit: 'nao_aplicavel',
    tapMode: null,
    executesNodeTest: false,
  });
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
  await write('scripts/qa-runner.mjs', [
    "import { assertTapSummary, collectTap } from './lib/qa-tap-summary.mjs';",
    'const child = spawn("node", ["--test", "tests/a.test.mjs"], { stdio: ["ignore", "pipe", "pipe"] });',
    'const out = await collectTap(child);',
    'if (!assertTapSummary(out.output, { minimum: 1, label: "fixture" }).ok) process.exit(1);',
  ].join('\n'));
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
  assert.equal(map.failures.semAuditoriaTap.length, 0,
    `gate sem auditoria TAP fora da lista de resíduos: ${map.failures.semAuditoriaTap.map((item) => item.alvo).join(', ')}`);
  assert.equal(map.failures.invalidAllowlist.length, 0, 'entrada inválida na allowlist de resíduos TAP');
  assert.equal(map.failures.staleAllowlist.length, 0, 'allowlist com entrada já coberta ou já auditada');
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

test('06C: detector estático distingue exit-code-only, MINIMUM_CASES, minimum: condicional e comentários', () => {
  // 1) Runner só com exit code (`stdio: 'inherit'`): sem auditoria TAP.
  const exitOnly = [
    'const child = spawn(process.execPath, ["--test", "tests/l02-delivery.integration.test.mjs"], { stdio: "inherit" });',
    'child.once("exit", (code) => process.exit(code ?? 1));',
  ].join('\n');
  assert.deepEqual(runnerInfo(exitOnly), {
    tests: ['tests/l02-delivery.integration.test.mjs'],
    floor: null,
    tapAudit: 'sem_auditoria_tap',
    tapMode: null,
    executesNodeTest: true,
  });

  // 2) `MINIMUM_CASES` sozinho sem auditar resumo TAP NÃO é prova; com captura
  //    e auditor completo dos contadores vira `auditado_tap`.
  const fakeMinimumCases = [
    'const MINIMUM_CASES = 14;',
    'spawn(process.execPath, ["--test", "tests/admin-entry.integration.test.mjs"], { stdio: "inherit" });',
  ].join('\n');
  assert.equal(runnerInfo(fakeMinimumCases).tapAudit, 'sem_auditoria_tap');
  assert.equal(runnerInfo(fakeMinimumCases).floor, 14);

  const inlineMinimumCases = [
    'const MINIMUM_CASES = 14;',
    'const child = spawn(process.execPath, ["--test", "tests/admin-entry.integration.test.mjs"], { stdio: ["ignore", "pipe", "pipe"] });',
    'const pass = number("pass"); const fail = number("fail"); const skipped = number("skipped"); const todo = number("todo");',
    'if (fail || skipped || todo || pass < MINIMUM_CASES) result = 1;',
  ].join('\n');
  assert.deepEqual(runnerInfo(inlineMinimumCases), {
    tests: ['tests/admin-entry.integration.test.mjs'],
    floor: 14,
    tapAudit: 'auditado_tap',
    tapMode: 'inline-tap',
    executesNodeTest: true,
  });

  // 3) `minimum:` condicional conta pelo MENOR valor; se admitir 0 ou ignorar `.ok`, reprova.
  const conditionalMinimum = [
    "import { assertTapSummary, collectTap } from './lib/qa-tap-summary.mjs';",
    'const child = spawn(process.execPath, ["--test", flag ? "tests/a.mjs" : "tests/b.mjs"], { stdio: ["ignore", "pipe", "pipe"] });',
    'const journey = await collectTap(child);',
    'if (!assertTapSummary(journey.output, { minimum: flag ? 27 : 25, label: "TENANT" }).ok) process.exit(1);',
  ].join('\n');
  assert.equal(runnerInfo(conditionalMinimum).tapAudit, 'auditado_tap');
  assert.equal(runnerInfo(conditionalMinimum).floor, 25, 'piso condicional conta pelo menor valor');

  const uncheckedTapResult = [
    "import { assertTapSummary, collectTap } from './lib/qa-tap-summary.mjs';",
    'const child = spawn(process.execPath, ["--test", "tests/a.mjs"], { stdio: ["ignore", "pipe", "pipe"] });',
    'const journey = await collectTap(child);',
    'const tap = assertTapSummary(journey.output, { minimum: 5, label: "BUG" });',
    'process.exit(journey.code === 0 && tap ? 0 : 1);',
  ].join('\n');
  assert.equal(runnerInfo(uncheckedTapResult).tapAudit, 'sem_auditoria_tap',
    'assertTapSummary retorna { ok, tests }: tratar o objeto como booleano nunca reprova');

  const zeroBranchMinimum = [
    "import { assertTapSummary, collectTap } from './lib/qa-tap-summary.mjs';",
    'const child = spawn(process.execPath, ["--test", "tests/a.mjs"], { stdio: ["ignore", "pipe", "pipe"] });',
    'const journey = await collectTap(child);',
    'if (!assertTapSummary(journey.output, { minimum: pattern ? 0 : 21, label: "UX" }).ok) process.exit(1);',
  ].join('\n');
  assert.equal(runnerInfo(zeroBranchMinimum).floor, 0);
  assert.equal(runnerInfo(zeroBranchMinimum).tapAudit, 'sem_auditoria_tap',
    'caminho condicional com piso 0 deixa brecha para zero cenários executados');

  // 4) Falso positivo medido na 06B: comentário em runner não executa teste nem
  //    satisfaz auditoria TAP.
  const commentedOut = [
    "// import { assertTapSummary, collectTap } from './lib/qa-tap-summary.mjs';",
    '// spawn(process.execPath, ["--test", "tests/fantasma.integration.test.mjs"]);',
    '/* assertTapSummary(out, { minimum: 99, label: "falso" }); tests/outro.mjs */',
    'spawn(process.execPath, ["--test", "tests/real.integration.test.mjs"], { stdio: "inherit" });',
  ].join('\n');
  assert.deepEqual(runnerInfo(commentedOut).tests, ['tests/real.integration.test.mjs'],
    'teste citado apenas em comentário não entra como jornada executada');
  assert.equal(runnerInfo(commentedOut).tapAudit, 'sem_auditoria_tap');
  assert.equal(runnerInfo(commentedOut).floor, null);
});

test('06C: gate novo sem auditoria TAP reprova; resíduo legado exige ordem/motivo e vira obsoleto ao migrar', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'seg-ci-map-06c-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const write = async (relative, content) => {
    await mkdir(path.dirname(path.join(directory, relative)), { recursive: true });
    await writeFile(path.join(directory, relative), content);
  };
  await write('package.json', JSON.stringify({
    scripts: {
      'test:legado:pg': 'node scripts/qa-legado-postgres.mjs',
      'test:auditado:pg': 'node scripts/qa-auditado-postgres.mjs',
    },
  }, null, 2));
  await write('tests/legado.integration.test.mjs', "test('legado', () => {});\n");
  await write('tests/auditado.integration.test.mjs', "test('auditado', () => {});\n");
  await write('scripts/qa-legado-postgres.mjs',
    'spawn(process.execPath, ["--test", "tests/legado.integration.test.mjs"], { stdio: "inherit" });\n');
  await write('scripts/qa-auditado-postgres.mjs', [
    "import { assertTapSummary, collectTap } from './lib/qa-tap-summary.mjs';",
    'const child = spawn(process.execPath, ["--test", "tests/auditado.integration.test.mjs"], { stdio: ["ignore", "pipe", "pipe"] });',
    'const out = await collectTap(child);',
    'if (!assertTapSummary(out.output, { minimum: 1, label: "auditado" }).ok) process.exit(1);',
  ].join('\n'));
  await write('.github/workflows/ci.yml', [
    'jobs:',
    '  gate:',
    '    steps:',
    '      - run: npm run test:legado:pg',
    '      - run: npm run test:auditado:pg',
  ].join('\n'));

  // Sem allowlist de resíduo TAP: o gate sem auditoria reprova na hora.
  const failing = await buildCoverageMap({ root: directory, allowlist: [], tapAllowlist: [] });
  assert.deepEqual(failing.failures.semAuditoriaTap.map((item) => item.alvo), ['scripts/qa-legado-postgres.mjs']);
  assert.match(renderCsv(failing), /"test:legado:pg","direct","tests\/legado\.integration\.test\.mjs","1","sem_auditoria_tap",""/);
  assert.match(renderCsv(failing), /"test:auditado:pg","direct","tests\/auditado\.integration\.test\.mjs","1","auditado_tap","1"/);

  // Entrada sem ordem ou com motivo curto demais também reprova.
  const invalid = await buildCoverageMap({
    root: directory,
    allowlist: [],
    tapAllowlist: [{ alvo: 'scripts/qa-legado-postgres.mjs', tipo: 'runner', ordem: '', motivo: 'curto' }],
  });
  assert.deepEqual(invalid.failures.invalidAllowlist, ['scripts/qa-legado-postgres.mjs']);

  // Com motivo e ordem declarados: não fica em silêncio (aparece no CSV/relatório), mas libera o check.
  const declared = await buildCoverageMap({
    root: directory,
    allowlist: [],
    tapAllowlist: [{
      alvo: 'scripts/qa-legado-postgres.mjs',
      tipo: 'runner',
      ordem: '01-familia-l',
      motivo: 'runner legado só com exit code; migrar para assertTapSummary no lote 1.',
    }],
  });
  assert.deepEqual(declared.failures.semAuditoriaTap, []);
  assert.deepEqual(declared.failures.staleAllowlist, []);
  assert.match(renderReport(declared), /Resíduos declarados sem auditoria TAP/);
  assert.match(renderReport(declared), /01-familia-l/);

  // Se o runner já é `auditado_tap` e permanece na allowlist: reprova como obsoleto.
  const stale = await buildCoverageMap({
    root: directory,
    allowlist: [],
    tapAllowlist: [
      {
        alvo: 'scripts/qa-legado-postgres.mjs',
        tipo: 'runner',
        ordem: '01-familia-l',
        motivo: 'runner legado só com exit code; migrar para assertTapSummary no lote 1.',
      },
      {
        alvo: 'scripts/qa-auditado-postgres.mjs',
        tipo: 'runner',
        ordem: '01-familia-l',
        motivo: 'já migrado: não pode ficar estacionado na allowlist.',
      },
    ],
  });
  assert.deepEqual(stale.failures.staleAllowlist, ['scripts/qa-auditado-postgres.mjs']);
  assert.ok(Array.isArray(TAP_AUDIT_ALLOWLIST));
  for (const entry of TAP_AUDIT_ALLOWLIST) {
    assert.ok(entry.ordem && entry.motivo.length >= 20, `resíduo TAP mal declarado: ${entry.alvo}`);
  }
});
