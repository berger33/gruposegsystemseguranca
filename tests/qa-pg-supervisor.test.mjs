import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { superviseLocalPg, PG_PHASE_LIMITS } from '../scripts/lib/qa-pg-supervisor.mjs';

const posix = process.platform !== 'win32';
const options = posix ? {} : { skip: 'Piloto POSIX; runner Windows preserva caminho anterior, sem validação nova' };
const cleanEnv = { ...process.env, DATABASE_URL: '', DATABASE_MIGRATION_URL: '', RUN_DATABASE_INTEGRATION_REMOTE: '' };
const protocol = `const phase=name=>process.send({type:'phase',name});
const done=code=>{phase('done');process.send({type:'complete',code},()=>process.exit(code));};`;
const limits = { ...PG_PHASE_LIMITS, boot: 5_000 };

async function fixture(t, body) {
  const directory = await mkdtemp(path.join(tmpdir(), 'seg-pg-unit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const entry = path.join(directory, 'worker.mjs');
  await writeFile(entry, `import {writeFileSync} from 'node:fs';
writeFileSync(new URL('metadata.json',import.meta.url),JSON.stringify({directory:process.env.QA_PG_DIRECTORY,pid:process.pid}));
${protocol}\n${body}`);
  const logs = [];
  return { directory, entry, logs, run: extra => superviseLocalPg({ entry, env: cleanEnv, limits,
    graceMs: 500, log: line => logs.push(line), ...extra }) };
}

async function assertRemoved(f) {
  const metadata = JSON.parse(await readFile(path.join(f.directory, 'metadata.json'), 'utf8'));
  await assert.rejects(access(metadata.directory), { code: 'ENOENT' });
}

test('PG supervisor: recusa URL herdada antes de criar worker ou sandbox', options, async () => {
  for (const key of ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'RUN_DATABASE_INTEGRATION_REMOTE']) {
    const result = await superviseLocalPg({ entry: 'not-used', env: { ...cleanEnv, [key]: key.includes('URL') ? 'postgresql://synthetic.invalid/not-used' : '1' } });
    assert.equal(result.code, 2);
    assert.equal(result.reason, 'remote-or-inherited-url-refused');
    assert.equal(result.cleaned, false);
  }
});

test('PG supervisor: sucesso exige complete, done e exit 0, e sandbox realmente removido', options, async t => {
  const f = await fixture(t, "phase('initialise'); phase('start'); phase('create'); phase('test'); phase('stop'); done(0);");
  const beforeInt = process.listenerCount('SIGINT'), beforeTerm = process.listenerCount('SIGTERM');
  const result = await f.run();
  assert.deepEqual(result, { code: 0, reason: 'complete', cleaned: true, phase: 'done' });
  await assertRemoved(f);
  assert.equal(process.listenerCount('SIGINT'), beforeInt);
  assert.equal(process.listenerCount('SIGTERM'), beforeTerm);
});

test('PG supervisor: falha de teste e saída zero sem protocolo nunca viram verde', options, async t => {
  for (const [body, expected] of [["phase('test'); phase('stop'); done(1);", 1], ["phase('test'); done(7);", 7], ['process.exit(0);', 1], ["phase('test'); process.exit(0);", 1]]) {
    const f = await fixture(t, body);
    const result = await f.run();
    assert.equal(result.code, expected);
    assert.equal(result.cleaned, true);
    await assertRemoved(f);
  }
});

test('PG supervisor: prazo limita cada fase, incluindo stop pendurado', options, async t => {
  for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop']) {
    const f = await fixture(t, `phase('${phase}'); setInterval(()=>{},1000);`);
    const result = await f.run({ limits: { ...limits, [phase]: 100 } });
    assert.equal(result.code, 1);
    assert.equal(result.reason, `timeout-${phase}`);
    assert.equal(result.cleaned, true);
    await assertRemoved(f);
  }
  const repeated = await fixture(t, "phase('start'); setInterval(()=>phase('start'),10);");
  const result = await repeated.run({ limits: { ...limits, start: 100 } });
  assert.equal(result.reason, 'timeout-start', 'repetir fase não pode renovar o prazo');
  assert.equal(result.cleaned, true);
  await assertRemoved(repeated);
});

test('PG supervisor: worker que rejeita undefined continua vermelho e não imprime motivo sensível pelo supervisor', options, async t => {
  const f = await fixture(t, "phase('start'); Promise.reject(undefined).catch(()=>{process.exit(1);});");
  const result = await f.run();
  assert.equal(result.code, 1);
  assert.equal(result.cleaned, true);
  await assertRemoved(f);
  assert.doesNotMatch(f.logs.join('\n'), /postgresql:|password=|DATABASE_URL/);
});

test('PG supervisor: SIGKILL encerra worker que ignora SIGTERM sem limpeza fictícia', options, async t => {
  const f = await fixture(t, "process.on('SIGTERM',()=>{}); phase('stop'); setInterval(()=>{},1000);");
  const outsider = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  t.after(async () => {
    if (outsider.exitCode === null && outsider.signalCode === null) {
      const ended = once(outsider, 'exit'); outsider.kill('SIGKILL'); await ended;
    }
  });
  const result = await f.run({ limits: { ...limits, stop: 100 } });
  assert.doesNotThrow(() => process.kill(outsider.pid, 0), 'não atingir processos fora do grupo próprio');
  assert.equal(result.code, 1);
  assert.equal(result.reason, 'timeout-stop');
  assert.equal(result.cleaned, true);
  await assertRemoved(f);
});

test('PG supervisor: SIGTERM/SIGINT no supervisor preservam exit de cancelamento e limpam o sandbox', options, async t => {
  for (const [signal, code] of [['SIGTERM', 143], ['SIGINT', 130]]) {
    const f = await fixture(t, "phase('start'); console.log('QA_WORKER_ARMED'); setInterval(()=>{},1000);");
    const driver = path.join(f.directory, 'driver.mjs');
    await writeFile(driver, `import {superviseLocalPg} from ${JSON.stringify(new URL('../scripts/lib/qa-pg-supervisor.mjs', import.meta.url).href)};
const result=await superviseLocalPg({entry:${JSON.stringify(f.entry)},graceMs:150});
process.exitCode=result.code;`);
    const child = spawn(process.execPath, [driver], { env: cleanEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let sent = false;
    child.stdout.on('data', chunk => { output += chunk; if (!sent && output.includes('QA_WORKER_ARMED')) { sent = true; child.kill(signal); } });
    child.stderr.resume();
    const watchdog = setTimeout(() => child.kill('SIGKILL'), 8_000);
    let exited;
    try { [exited] = await once(child, 'exit'); } finally { clearTimeout(watchdog); }
    assert.equal(exited, code);
    assert.match(output, /QA_PG_TEMP_CLEANED: true/);
    await assertRemoved(f);
  }
});

test('PG supervisor: piloto usa wrapper antes de importar biblioteca e limita client create', async () => {
  const runner = await readFile(new URL('../scripts/qa-tenant-postgres.mjs', import.meta.url), 'utf8');
  assert.ok(runner.indexOf('await superviseLocalPg(') < runner.indexOf("await import('embedded-postgres')"));
  assert.match(runner, /releaseSignalHandlers\(\)/);
  assert.match(runner, /connectionTimeoutMillis: 5_000, query_timeout: 5_000, statement_timeout: 5_000/);
  assert.match(runner, /process.platform !== 'win32'/);
  assert.match(runner, /phase\('stop'\)/);
  assert.match(runner, /type: 'complete', code: result/);
});

const adoptedRunners = [
  'qa-staff-auth-postgres.mjs', 'qa-cli-v2-postgres.mjs', 'qa-ext02-third-parties-postgres.mjs',
];

test('PG supervisor: grupo 05A preserva contratos e separa migração da jornada', async () => {
  for (const file of adoptedRunners) {
    const runner = await readFile(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
    assert.ok(runner.indexOf('await superviseLocalPg(') < runner.indexOf("await import('embedded-postgres')"));
    assert.match(runner, /releaseSignalHandlers\(\)/);
    assert.match(runner, /process.platform !== 'win32'/);
    assert.match(runner, /migrate: 90_000, test: 180_000/);
    assert.match(runner, /phase\('migrate'\)/);
    assert.match(runner, /phase\('test'\)/);
    assert.match(runner, /await createLocalQaDatabase\(/);
    assert.match(runner, /phase\('stop'\)/);
    assert.match(runner, /if \(!supervised\) \{\s*await rm\(directory/s);
    assert.match(runner, /type: 'complete', code: result/);
  }
  const cli = await readFile(new URL('../scripts/qa-cli-v2-postgres.mjs', import.meta.url), 'utf8');
  assert.match(cli, /QA_CLI_V2_OBJECT_CONTRACT === '1'/);
  assert.match(cli, /QA_CLI_V2_OBJECT_TEST_EXIT/);
  const ext = await readFile(new URL('../scripts/qa-ext02-third-parties-postgres.mjs', import.meta.url), 'utf8');
  assert.match(ext, /const MINIMUM_CASES = 21/);
  assert.match(ext, /QA_EXT02_REQUIRE_DB: '1'/);
  assert.match(ext, /summary.problems.length/);
  assert.match(await readFile(new URL('../.github/workflows/ext02-delivery.yml', import.meta.url), 'utf8'), /scripts\/lib\/qa-pg-supervisor.mjs/);
});

test('PG supervisor: guardas reais dos grupos 05A/05B/05C/05D/05E/05F/05G/05H/05I/05J/05K/05L/05M/05N/05O/05P/05Q/05R/05S/05T/05U/05V/05W/05X/05Y recusam URLs/opt-ins antes de spawn', options, async () => {
  const { spawnSync } = await import('node:child_process');
  for (const file of [...adoptedRunners, ...pltRunners.map(([file]) => file), ...extRunners.map(([file]) => file), ...groupERunners.map(([file]) => file), 'qa-migrations-postgres.mjs', 'qa-admin-entry-postgres.mjs', 'qa-ops-pendencies-postgres.mjs', 'qa-l02-delivery-postgres.mjs', 'qa-l03-delivery-postgres.mjs', 'qa-l04-delivery-postgres.mjs', 'qa-l05-delivery-postgres.mjs', 'qa-l06-delivery-postgres.mjs', 'qa-l07-delivery-postgres.mjs', 'qa-l08-delivery-postgres.mjs', 'qa-f03-client-ticket-acceptance-postgres.mjs', 'qa-f03-employee-request-rh-return-postgres.mjs', 'qa-f03-contas-baixa-relatorio-postgres.mjs', 'qa-f03-lead-to-implementation-postgres.mjs', 'qa-ux-client-admin-postgres.mjs', 'qa-ux-contract-postgres.mjs', 'qa-ux-crm-postgres.mjs', 'qa-ux-finance-postgres.mjs', 'qa-ux-ops-postgres.mjs', 'qa-ux-asset-postgres.mjs', 'qa-ux-hr-postgres.mjs', 'qa-ux-adm-postgres.mjs', 'qa-ux-fleet-postgres.mjs', 'qa-ux-third-party-postgres.mjs', 'qa-ux-bidding-postgres.mjs', 'qa-ux-supplier-postgres.mjs', 'qa-ux-quality-postgres.mjs', 'qa-ux-satisfaction-postgres.mjs', 'qa-ux-compliance-postgres.mjs', 'qa-ux-knowledge-postgres.mjs', 'qa-ux-intel-postgres.mjs', 'qa-ux-analytics-postgres.mjs', 'qa-ux-expansion-postgres.mjs', 'qa-ux-continuity-postgres.mjs', 'qa-ux-continuity-client-postgres.mjs', 'qa-ux-portal-postgres.mjs']) {
    for (const key of ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'RUN_DATABASE_INTEGRATION_REMOTE']) {
      const env = { ...cleanEnv, [key]: key.includes('URL') ? 'postgresql://synthetic.invalid/blocked' : '1' };
      const run = spawnSync(process.execPath, [new URL(`../scripts/${file}`, import.meta.url).pathname], { env, encoding: 'utf8', timeout: 10_000 });
      assert.equal(run.status, 2, `${file} deve recusar ${key}`);
      assert.doesNotMatch(run.stdout, /QA_PG_READY|QA_CLI_V2_READY|QA_PG_SUPERVISOR/);
      assert.doesNotMatch(run.stderr, /synthetic.invalid/);
    }
  }
  for (const extra of [{ ALLOW_REMOTE_MIGRATIONS: 'true' }, { QA_CLI_V2_OBJECT_CONTRACT: '1', CLIENT_DOCS_DIR: '/synthetic-not-used' }]) {
    const run = spawnSync(process.execPath, [new URL('../scripts/qa-cli-v2-postgres.mjs', import.meta.url).pathname], { env: { ...cleanEnv, ...extra }, encoding: 'utf8', timeout: 10_000 });
    assert.equal(run.status, 2);
    assert.doesNotMatch(run.stdout, /READY|SUPERVISOR/);
  }
});

test('PG supervisor: criação compartilhada recusa nome não QA e conexão IPv4 tem prazo real', { timeout: 20_000 }, async t => {
  const { createLocalQaDatabase } = await import('../scripts/lib/qa-pg-supervisor.mjs');
  const { createServer } = await import('node:net');
  await assert.rejects(createLocalQaDatabase({ port: 0, database: 'seg_qa_test' }), /invalid_local_qa_database/);
  await assert.rejects(createLocalQaDatabase({ port: 1234, database: 'production' }), /invalid_local_qa_database/);
  const sockets = new Set();
  const server = createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  });
  await assert.rejects(createLocalQaDatabase({ port: server.address().port,
    user: 'seg_qa', password: 'synthetic-not-a-real-credential', database: 'seg_qa_handshake' }), /timeout/i);
});


const pltRunners = [
  ['qa-plt01-access-review-coverage-postgres.mjs', 12],
  ['qa-plt06-observability-postgres.mjs', 20],
  ['qa-plt09-privacy-postgres.mjs', 26],
  ['qa-plt12-incidents-postgres.mjs', 20],
];

test('PG supervisor: grupo 05B mantém budgets, protocolo, fixtures obrigatórias e paths CI reais', async () => {
  const workflow = await readFile(new URL('../.github/workflows/plt-jornadas-delivery.yml', import.meta.url), 'utf8');
  assert.match(workflow, /scripts\/lib\/qa-pg-supervisor.mjs/);
  assert.match(workflow, /tests\/qa-pg-supervisor.test.mjs/);
  for (const [file, minimum] of pltRunners) {
    const source = await readFile(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/);
    assert.match(source, /process.platform !== 'win32'/);
    assert.match(source, /migrate: 90_000, test: 180_000/);
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      assert.ok(source.includes(`phase('${phase}')`), `${file}: fase ${phase}`);
    }
    assert.match(source, /await createLocalQaDatabase\(/);
    assert.ok(source.includes(`const MINIMUM_CASES = ${minimum};`));
    assert.match(source, /QA_PLT\d+_REQUIRE_DB: ['"]1['"]/);
    assert.match(source, /summary.problems.length/);
    assert.match(source, /type: 'complete', code: result/);
    assert.match(source, /if \(result.cleaned\) console.log\('QA_PLT\d+_PG_TEMP_CLEANED: true'\)/);
    const integration = source.match(/tests\/plt[^'"]+\.integration\.test\.mjs/)[0];
    assert.ok(workflow.includes(`'${integration}'`), `${file}: path CI da integração deve existir`);
    assert.ok(workflow.includes(`'scripts/${file}'`));
    if (file.includes('plt01')) assert.match(source, /ACCESS_REVIEW_INTERVAL_DAYS: ""/);
  }
});

test('PG supervisor: auditores TAP reais do grupo 05B rejeitam execução incompleta ou relaxada', async () => {
  const { runInNewContext } = await import('node:vm');
  for (const [file, minimum] of pltRunners) {
    const source = await readFile(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
    // Executa só o auditor existente: não importa nem inicia o gate/cluster.
    const audit = runInNewContext(source.slice(source.indexOf('const MINIMUM_CASES'), source.indexOf('const database =')) + '\nauditTap');
    const tap = (pass = minimum, fail = 0, skipped = 0, todo = 0) => `# pass ${pass}\n# fail ${fail}\n# skipped ${skipped}\n# todo ${todo}\n`;
    assert.equal(audit(tap()).problems.length, 0, `${file}: resumo completo aceita`);
    for (const output of ['', '# fail 0\n', tap(minimum - 1), tap(minimum, 1), tap(minimum, 0, 1), tap(minimum, 0, 0, 1)]) {
      assert.ok(audit(output).problems.length > 0, `${file}: ausência/mínimo/falha/skip/todo deve recusar`);
    }
  }
});

const extRunners = [
  ['qa-ext03-biddings-postgres.mjs', 25, 'auditTapSummary'],
  ['qa-ext04-suppliers-postgres.mjs', 28, 'auditTap'],
  ['qa-ext05-quality-postgres.mjs', 35, 'auditTap'],
  ['qa-ext06-satisfaction-postgres.mjs', 35, 'auditTap'],
  ['qa-ext07-compliance-postgres.mjs', 47, 'auditTap', '600_000'],
  ['qa-ext08-knowledge-postgres.mjs', 15, 'auditTap'],
];

test('PG supervisor: grupos 05C/05D preservam protocolo, budgets, UTF8 e ligação dos gates', async () => {
  for (const [file, minimum, , testBudget = '180_000'] of extRunners) {
    const source = await readFile(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
    const number = file.match(/ext(\d+)/)[1];
    const workflow = await readFile(new URL(`../.github/workflows/ext${number}-delivery.yml`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/);
    assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes(`migrate: 90_000, test: ${testBudget}`));
    const lifecycle = source.slice(source.indexOf('let result = 1;'));
    let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = lifecycle.indexOf(`phase('${phase}')`);
      assert.ok(index > previous, `${file}: fase ${phase} monotônica e presente`);
      previous = index;
    }
    assert.match(source, /await createLocalQaDatabase\(/);
    assert.ok(source.includes(`const MINIMUM_CASES = ${minimum};`));
    assert.match(source, /QA_EXT\d+_REQUIRE_DB: ['"]1['"]/);
    assert.match(source, /summary.problems.length/);
    assert.match(source, /type: 'complete', code: result/);
    assert.match(source, /if \(result.cleaned\) console.log\('QA_EXT\d+_PG_TEMP_CLEANED: true'\)/);
    assert.match(workflow, /scripts\/lib\/qa-pg-supervisor.mjs/);
    assert.match(workflow, /scripts\/qa-generated-files-guard.mjs/);
    assert.match(workflow, /tests\/qa-pg-supervisor.test.mjs/);
    assert.ok(workflow.includes(`'scripts/${file}'`));
    if (number === '04') assert.match(source, /initdbFlags: \["--encoding=UTF8", "--locale=C"\]/);
  }
});

test('PG supervisor: auditores TAP reais dos grupos 05C/05D não aceitam mínimo reduzido ou skip', async () => {
  const { runInNewContext } = await import('node:vm');
  for (const [file, minimum, auditor] of extRunners) {
    const source = await readFile(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
    const audit = runInNewContext(source.slice(source.indexOf('const MINIMUM_CASES'), source.indexOf('const database =')) + `\n${auditor}`);
    const tap = (pass = minimum, fail = 0, skipped = 0, todo = 0) => `# pass ${pass}\n# fail ${fail}\n# skipped ${skipped}\n# todo ${todo}\n`;
    assert.equal(audit(tap()).problems.length, 0, `${file}: resumo completo aceita`);
    for (const output of ['', '# fail 0\n', tap(minimum - 1), tap(minimum, 1), tap(minimum, 0, 1), tap(minimum, 0, 0, 1)]) {
      assert.ok(audit(output).problems.length > 0, `${file}: resumo inválido deve recusar`);
    }
  }
});


test('PG supervisor: conhecimento deixa de ser gate órfão e compliance mantém servidor agendador', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ext08-delivery.yml', import.meta.url), 'utf8');
  assert.match(workflow, /run: npm run test:ext08-knowledge:pg\s*$/m);
  assert.match(workflow, /node --test tests\/ext08-knowledge.test.mjs tests\/qa-pg-supervisor.test.mjs/);
  assert.ok(workflow.indexOf('node --test') < workflow.indexOf('npm run test:ext08-knowledge:pg'));
  assert.match(workflow, /DATABASE_URL: ''/);
  assert.match(workflow, /DATABASE_MIGRATION_URL: ''/);
  assert.match(workflow, /RUN_DATABASE_INTEGRATION_REMOTE: ''/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /'db\/migrations\/\*\*'/);
  const compliance = await readFile(new URL('../tests/ext07-compliance.integration.test.mjs', import.meta.url), 'utf8');
  assert.match(compliance, /EXT07_EVALUATE_INTERVAL_SECONDS:"2"/);
  assert.match(compliance, /schedulerServer=spawn/);
  const runner = await readFile(new URL('../scripts/qa-ext07-compliance-postgres.mjs', import.meta.url), 'utf8');
  assert.match(runner, /migrate: 90_000, test: 600_000/);
});

const groupERunners = [
  ['qa-ext09-expansion-postgres.mjs', 16, '180_000', ['ux-expansion-delivery.yml']],
  ['qa-ext10-continuity-postgres.mjs', 31, '300_000', ['ux-continuity-delivery.yml', 'ux-continuity-client-delivery.yml']],
  ['qa-ext11-analytics-postgres.mjs', 16, '180_000', ['ext11-delivery.yml']],
  ['qa-ext12-visual-postgres.mjs', 14, '180_000', ['ext12-delivery.yml']],
  ['qa-ext13-reports-postgres.mjs', 16, '180_000', ['ext13-delivery.yml']],
  ['qa-ext14-intel-postgres.mjs', 16, '300_000', ['ext14-delivery.yml']],
  ['qa-ext15-emergency-postgres.mjs', 16, '180_000', ['ext15-delivery.yml']],
];

test('PG supervisor: grupos 05E/05F/05G mantêm lifecycle, browser, contratos e chamadores CI', async () => {
  for (const [file, minimum, budget, workflows] of groupERunners) {
    const source = await readFile(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/);
    assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes(`migrate: 90_000, test: ${budget}`));
    const resultName = file.includes('ext09') ? 'result' : 'exitCode';
    const lifecycle = source.slice(source.indexOf(`let ${resultName} = 1`));
    let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = lifecycle.indexOf(`phase('${phase}')`);
      assert.ok(index > previous, `${file}: fase ${phase}`); previous = index;
    }
    assert.match(source, /await createLocalQaDatabase\(/);
    assert.match(source, /QA_EXT\d+_REQUIRE_DB: ['"]1['"]/);
    assert.match(source, /summary.problems.length/);
    assert.ok(source.includes(`type: 'complete', code: ${resultName}`));
    assert.match(source, /if \(result.cleaned\) console.log\('QA_EXT\d+_PG_TEMP_CLEANED: true'\)/);
    if (file.includes('ext09')) assert.ok(source.includes(`const MINIMUM_CASES = ${minimum};`));
    else assert.ok(source.includes(`pass < ${minimum}`));
    for (const name of workflows) {
      const workflow = await readFile(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
      assert.ok(workflow.includes(`'scripts/${file}'`));
      assert.match(workflow, /scripts\/lib\/qa-pg-supervisor.mjs/);
      assert.match(workflow, /scripts\/qa-generated-files-guard.mjs/);
      assert.match(workflow, /tests\/qa-pg-supervisor.test.mjs/);
      const command = file.replace('qa-', 'test:').replace('-postgres.mjs', ':pg');
      assert.ok(workflow.includes(`npm run ${command}`), `${file}: comando nomeado continua ligado`);
    }
    if (file.includes('ext10')) {
      assert.match(source, /AWS_EXECUTION_ENV: "AWS_Lambda_nodejs22.x"/);
      const integration = await readFile(new URL('../tests/ext10-continuity.integration.test.mjs', import.meta.url), 'utf8');
      assert.match(integration, /playwrightChromium.launch/);
      assert.match(integration, /await stopServer\(\);/);
      assert.match(integration, /await spawnServer\(\);/);
    }
  }
});

test('PG supervisor: auditores originais dos grupos 05E/05F/05G mantêm mínimo e zero skip/todo', async () => {
  const { runInNewContext } = await import('node:vm');
  for (const [file, minimum] of groupERunners) {
    const source = await readFile(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
    const isExpansion = file.includes('ext09');
    const start = source.indexOf(isExpansion ? 'const MINIMUM_CASES' : 'const auditTap =');
    const end = source.indexOf(isExpansion ? 'const database =' : 'const port =', start);
    const audit = runInNewContext(source.slice(start, end) + '\nauditTap');
    const tap = (pass = minimum, fail = 0, skipped = 0, todo = 0) => `# pass ${pass}\n# fail ${fail}\n# skipped ${skipped}\n# todo ${todo}\n`;
    assert.equal(audit(tap()).problems.length, 0);
    for (const output of ['', '# fail 0\n', tap(minimum - 1), tap(minimum, 1), tap(minimum, 0, 1), tap(minimum, 0, 0, 1)]) {
      assert.ok(audit(output).problems.length > 0, `${file}: resumo inválido recusado`);
    }
  }
});


test('PG supervisor: grupo 05F preserva UTF8, restore no pai e três gates antes órfãos', async () => {
  const report = await readFile(new URL('../scripts/qa-ext13-reports-postgres.mjs', import.meta.url), 'utf8');
  assert.match(report, /initdbFlags: \["--encoding=UTF8", "--locale=C"\]/);
  const intel = await readFile(new URL('../scripts/qa-ext14-intel-postgres.mjs', import.meta.url), 'utf8');
  const parent = intel.slice(0, intel.indexOf("const { default: EmbeddedPostgres }"));
  assert.match(parent, /const generatedSnapshot = await snapshotGeneratedFiles\(\)/);
  assert.match(parent, /finally \{\s*await restoreGeneratedFiles\(generatedSnapshot\)/);
  assert.ok(parent.indexOf('await superviseLocalPg(') < parent.indexOf('await restoreGeneratedFiles('));
  assert.ok(parent.indexOf('await restoreGeneratedFiles(') < parent.indexOf('process.exit(result.code)'));
  assert.match(intel, /AWS_EXECUTION_ENV: "AWS_Lambda_nodejs22.x"/);
  for (const [number, name] of [['12', 'visual'], ['13', 'reports'], ['14', 'intel']]) {
    const workflow = await readFile(new URL(`../.github/workflows/ext${number}-delivery.yml`, import.meta.url), 'utf8');
    assert.ok(workflow.includes(`run: npm run test:ext${number}-${name}:pg`));
    assert.match(workflow, /contents: read/);
    assert.match(workflow, /DATABASE_URL: ''/);
    assert.match(workflow, /DATABASE_MIGRATION_URL: ''/);
    assert.match(workflow, /RUN_DATABASE_INTEGRATION_REMOTE: ''/);
    assert.ok(workflow.indexOf('node --test') < workflow.indexOf(`npm run test:ext${number}-${name}:pg`));
  }
});


test('PG supervisor: gate de migrações mantém dois passes, clone, checksum negativo e SQL limitado', async () => {
  const source = await readFile(new URL('../scripts/qa-migrations-postgres.mjs', import.meta.url), 'utf8');
  assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
  assert.match(source, /releaseSignalHandlers\(\)/);
  assert.match(source, /process.platform !== 'win32'/);
  assert.match(source, /migrate: 90_000, test: 180_000/);
  assert.match(source, /await createLocalQaDatabase\(/);
  assert.match(source, /connectionTimeoutMillis: 10_000, query_timeout: 30_000, statement_timeout: 30_000/);
  assert.match(source, /if \(supervised\) client.on\('error'/);
  assert.match(source, /if \(qaDatabaseError\) result = 1/);
  assert.match(source, /if \(supervised \|\| adminConnected\) await admin.end\(\)/);
  assert.match(source, /await runMigrator\(1\)/);
  assert.match(source, /await runMigrator\(2\)/);
  assert.match(source, /await verifyIsolatedCloneRestore\(\)/);
  assert.match(source, /mismatchExit !== 1/);
  assert.match(source, /QA_CLONE_CHECKSUM_MISMATCH/);
  assert.match(source, /QA_CLONE_RESTORE/);
  assert.match(source, /TABLES=\$\{tablesBefore/);
  assert.match(source, /AUDIT_SAMPLE=\$\{auditAfter.count\}/);
  assert.match(source, /QA_RETENTION_011_PRESERVED/);
  assert.match(source, /QA_WORK_RULES_REVIEW_REQUIRED/);
  assert.match(source, /QA_SYNTHETIC_APPROVAL_GATE/);
  assert.match(source, /type: 'complete', code: result/);
  const body = source.slice(source.indexOf('let result = 1;')); let previous = -1;
  for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
    const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
  }
  const { readdir } = await import('node:fs/promises'); let callers = 0;
  for (const file of await readdir(new URL('../.github/workflows/', import.meta.url))) {
    if (!file.endsWith('.yml')) continue;
    const workflow = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8');
    if (!/npm run test:migrations:pg(?![-\w:])/.test(workflow)) continue;
    callers++;
    for (const dependency of ['scripts/qa-migrations-postgres.mjs', 'scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs']) {
      assert.ok(workflow.includes(`'${dependency}'`), `${file}: filtro deve acompanhar ${dependency}`);
    }
  }
  assert.ok(callers >= 10);
});

test('PG supervisor: migrador local recusa opt-in remoto explícito antes de spawn', options, async () => {
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync(process.execPath, [new URL('../scripts/qa-migrations-postgres.mjs', import.meta.url).pathname], {
    env: { ...cleanEnv, ALLOW_REMOTE_MIGRATIONS: 'true' }, encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.status, 2);
  assert.doesNotMatch(run.stdout, /READY|SUPERVISOR/);
});


test('PG supervisor: grupo 05H preserva browser de entrada, UTF8, contratos e comandos existentes', async () => {
  for (const [file, budget, resultName, workflowName, command] of [
    ['qa-admin-entry-postgres.mjs', '600_000', 'result', 'admin-entry-delivery.yml', 'test:admin-entry:pg'],
    ['qa-ops-pendencies-postgres.mjs', '180_000', 'exitCode', 'pendencies-delivery.yml', 'test:pendencies:pg'],
  ]) {
    const source = await readFile(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/);
    assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes(`migrate: 90_000, test: ${budget}`));
    assert.match(source, /await createLocalQaDatabase\(/);
    assert.match(source, /AWS_EXECUTION_ENV: ['"]AWS_Lambda_nodejs22.x['"]/);
    assert.ok(source.includes(`type: 'complete', code: ${resultName}`));
    const body = source.slice(source.indexOf(`let ${resultName} = 1;`)); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    const workflow = await readFile(new URL(`../.github/workflows/${workflowName}`, import.meta.url), 'utf8');
    for (const dependency of [`scripts/${file}`, 'scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs']) {
      assert.ok(workflow.includes(`'${dependency}'`));
    }
    assert.ok(workflow.includes(`npm run ${command}`));
    if (resultName === 'exitCode') {
      assert.match(source, /initdbFlags: \["--encoding=UTF8"\]/);
      assert.match(source, /pass < 17/);
      assert.match(source, /QA_PENDENCY_REQUIRE_DB: "1"/);
      assert.match(source, /if \(result.cleaned\) console.log\('QA_PENDENCY_PG_TEMP_CLEANED: true'\)/);
      assert.match(workflow, /DATABASE_URL: ''/); assert.match(workflow, /DATABASE_MIGRATION_URL: ''/);
      assert.match(workflow, /RUN_DATABASE_INTEGRATION_REMOTE: ''/); assert.match(workflow, /contents: read/);
      assert.ok(workflow.indexOf('node --test') < workflow.indexOf('npm run test:pendencies:pg'));
    } else {
      assert.match(source, /result = await run\(process.execPath, \['--test', '--test-concurrency=1', 'tests\/admin-entry.integration.test.mjs'\]/);
      const integration = await readFile(new URL('../tests/admin-entry.integration.test.mjs', import.meta.url), 'utf8');
      assert.match(integration, /playwrightChromium.launch/);
    }
  }
});

test('PG supervisor: auditor TAP original de pendências mantém mínimo 17 e recusa execução parcial', async () => {
  const { runInNewContext } = await import('node:vm');
  const source = await readFile(new URL('../scripts/qa-ops-pendencies-postgres.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('const auditTap ='); const end = source.indexOf('const port =', start);
  const audit = runInNewContext(source.slice(start, end) + '\nauditTap');
  const tap = (pass = 17, fail = 0, skipped = 0, todo = 0) => `# pass ${pass}\n# fail ${fail}\n# skipped ${skipped}\n# todo ${todo}\n`;
  assert.equal(audit(tap()).problems.length, 0);
  for (const output of ['', '# fail 0\n', tap(16), tap(17, 1), tap(17, 0, 1), tap(17, 0, 0, 1)]) {
    assert.ok(audit(output).problems.length > 0);
  }
});


test('PG supervisor: grupo 05I preserva contratos de resultado, fases e perfil browser próprio', async () => {
  for (const [number, budget] of [['02', '180_000'], ['03', '300_000']]) {
    const file = `qa-l${number}-delivery-postgres.mjs`;
    const source = await readFile(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/);
    assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes(`migrate: 90_000, test: ${budget}`));
    assert.match(source, /await createLocalQaDatabase\(/);
    assert.match(source, /if \(!supervised\) \{\s*await rm\(directory/);
    assert.match(source, /type: 'complete', code: result/);
    assert.ok(source.includes(`'tests/l${number}-delivery.integration.test.mjs'`));
    assert.match(source, /result = await run\(/);
    const body = source.slice(source.indexOf('let result = 1;')); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    const integration = await readFile(new URL(`../tests/l${number}-delivery.integration.test.mjs`, import.meta.url), 'utf8');
    assert.match(integration, /mkdtemp\(path.join\(tmpdir\(\)/);
    if (number === '03') {
      assert.match(source, /AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x'/);
      assert.match(source, /if \(result.cleaned\) console.log\('QA_L03_PG_TEMP_CLEANED: true'\)/);
      assert.match(integration, /playwrightChromium.launch/);
      assert.match(integration, /timeout: 180_000/);
      assert.match(integration, /EMPLOYEE_DOCS_DIR:/);
    } else {
      assert.match(integration, /CLIENT_DOCS_DIR:/);
      assert.match(integration, /MAIL_HOST: ''/);
      assert.match(integration, /MAIL_FROM: ''/);
    }
  }
});

test('PG supervisor: gates L02/L03 deixam de ser órfãos, com passos sequenciais e banco descartável', async () => {
  const workflow = await readFile(new URL('../.github/workflows/l02-l03-delivery.yml', import.meta.url), 'utf8');
  assert.match(workflow, /run: npm run test:l02-delivery:pg\s*$/m);
  assert.match(workflow, /run: npm run test:l03-delivery:pg\s*$/m);
  assert.ok(workflow.indexOf('node --test') < workflow.indexOf('npm run test:l02-delivery:pg'));
  assert.ok(workflow.indexOf('npm run test:l02-delivery:pg') < workflow.indexOf('npm run test:l03-delivery:pg'));
  assert.match(workflow, /DATABASE_URL: ''/); assert.match(workflow, /DATABASE_MIGRATION_URL: ''/);
  assert.match(workflow, /RUN_DATABASE_INTEGRATION_REMOTE: ''/); assert.match(workflow, /contents: read/);
  assert.match(workflow, /MAIL_HOST: ''/); assert.match(workflow, /cancel-in-progress: false/);
  for (const dependency of ['scripts/qa-l02-delivery-postgres.mjs', 'scripts/qa-l03-delivery-postgres.mjs', 'scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs', 'tests/helpers/staff-login.mjs']) {
    assert.ok(workflow.includes(`'${dependency}'`));
  }
});


test('PG supervisor: 05J preserva jornadas, custódia de anexos e budgets separados L04/L05', async () => {
  for (const [number, budget] of [['04', '900_000'], ['05', '300_000']]) {
    const source = await readFile(new URL(`../scripts/qa-l${number}-delivery-postgres.mjs`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/);
    assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes(`migrate: 90_000, test: ${budget}`));
    assert.match(source, /await createLocalQaDatabase\(/);
    assert.match(source, /if \(!supervised\) \{\s*await rm\(directory/);
    assert.match(source, /type: 'complete', code: result/);
    assert.ok(source.includes(`QA_L${number}_PG_TEMP_CLEANED: true`));
    assert.match(source, /if \(result.cleaned\) console.log/);
    assert.match(source, /AWS_EXECUTION_ENV: ['"]AWS_Lambda_nodejs22.x['"]/);
    assert.match(source, /result = await run\(/);
    const body = source.slice(source.indexOf('let result = 1;')); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    const integration = await readFile(new URL(`../tests/l${number}-delivery.integration.test.mjs`, import.meta.url), 'utf8');
    assert.match(integration, /mkdtemp\(path.join\(tmpdir\(\)/);
    assert.match(integration, /chromium.launch|playwrightChromium.launch/);
    assert.match(integration, /\.\.\.process.env/);
    if (number === '05') assert.match(integration, /CLIENT_DOCS_DIR:/);
    assert.match(integration, /timeout: 180_000/);
    if (number === '04') {
      assert.match(source, /CLIENT_DOCS_DIR: path.join\(directory, 'private-documents'\)/);
      assert.match(integration, /timeout: 300_000/);
      assert.equal((integration.match(/^test\(/gm) || []).length, 20);
    }
  }
});

test('PG supervisor: 05J mantém chamadores L04/L05 e migrações, com guardas antes de PG', async () => {
  for (const number of ['04', '05']) {
    const workflow = await readFile(new URL(`../.github/workflows/l${number}-delivery.yml`, import.meta.url), 'utf8');
    for (const dependency of [`scripts/qa-l${number}-delivery-postgres.mjs`, 'scripts/qa-migrations-postgres.mjs', 'scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs']) {
      assert.ok(workflow.includes(`'${dependency}'`));
    }
    assert.ok(workflow.indexOf('node --test') < workflow.indexOf('npm run test:migrations:pg'));
    assert.ok(workflow.indexOf('npm run test:migrations:pg') < workflow.indexOf(`npm run test:l${number}-delivery:pg`));
    for (const variable of ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'RUN_DATABASE_INTEGRATION_REMOTE', 'MAIL_HOST']) assert.ok(workflow.includes(`${variable}: ''`));
    assert.match(workflow, /cancel-in-progress: false/); assert.match(workflow, /contents: read/);
  }
});


test('PG supervisor: 05K preserva operações/finanças, diretórios privados e perfis pesados', async () => {
  for (const [number, budget, count, minutes] of [['06', '600_000', 9, 30], ['07', '900_000', 43, 35]]) {
    const source = await readFile(new URL(`../scripts/qa-l${number}-delivery-postgres.mjs`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/); assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes(`migrate: 90_000, test: ${budget}`));
    assert.match(source, /await createLocalQaDatabase\(/); assert.match(source, /type: 'complete', code: result/);
    assert.match(source, /if \(!supervised\) \{\s*await rm\(directory/);
    assert.match(source, /CLIENT_DOCS_DIR: path.join\(directory, "private-documents"\)/);
    assert.match(source, /AWS_EXECUTION_ENV: "AWS_Lambda_nodejs22.x"/);
    const body = source.slice(source.indexOf('let result = 1;')); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    const integration = await readFile(new URL(`../tests/l${number}-delivery.integration.test.mjs`, import.meta.url), 'utf8');
    assert.equal((integration.match(/^test\(/gm) || []).length, count);
    assert.match(integration, /mkdtemp\(path.join\(tmpdir\(\)/); assert.match(integration, /chromium.launch|playwrightChromium.launch/);
    const workflow = await readFile(new URL(`../.github/workflows/l${number}-delivery.yml`, import.meta.url), 'utf8');
    assert.ok(workflow.includes(`timeout-minutes: ${minutes}`));
    assert.ok(workflow.indexOf('node --test') < workflow.indexOf('npm run test:migrations:pg'));
    assert.ok(workflow.indexOf('npm run test:migrations:pg') < workflow.indexOf(`npm run test:l${number}-delivery:pg`));
    assert.match(workflow, /RUN_DATABASE_INTEGRATION_REMOTE: ''/); assert.match(workflow, /contents: read/);
    for (const file of [`scripts/qa-l${number}-delivery-postgres.mjs`, 'scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs']) assert.ok(workflow.includes(`'${file}'`));
  }
});

test('PG supervisor: L07 limpa distDir no pai com deadline e falha fechada', async () => {
  const source = await readFile(new URL('../scripts/qa-l07-delivery-postgres.mjs', import.meta.url), 'utf8');
  assert.match(source, /if \(result.cleaned\) \{\s*try \{ await cleanupNextDist\(\)/);
  assert.match(source, /process.exit\(cleanupFailed \? 1 : result.code\)/);
  assert.match(source, /if \(!supervised\) try \{ await rm\(nextDistDir/);
  const { runInNewContext } = await import('node:vm');
  const body = source.slice(source.indexOf('async function cleanupNextDist()'));
  for (const mode of ['ok', 'reject', 'hang']) {
    const logs = []; let cleared = false;
    const cleanup = runInNewContext(body + '\ncleanupNextDist', { root: '/synthetic', path, console: { log: x => logs.push(x) },
      rm: async (target, opts) => { assert.equal(target, '/synthetic/.next/integration-l07'); assert.equal(opts.recursive, true); assert.equal(opts.force, true);
        if (mode === 'reject') throw new Error('synthetic_rm_failed'); if (mode === 'hang') await new Promise(() => {}); },
      setTimeout: (fn, ms) => { assert.equal(ms, 10_000); return setTimeout(fn, mode === 'hang' ? 10 : 1000); },
      clearTimeout: timer => { cleared = true; clearTimeout(timer); },
    });
    if (mode === 'ok') { await cleanup(); assert.deepEqual(logs, ['QA_L07_NEXT_DIST_CLEANED: true']); }
    else { await assert.rejects(cleanup(), mode === 'hang' ? /next_dist_cleanup_timeout/ : /synthetic_rm_failed/); assert.deepEqual(logs, []); }
    assert.ok(cleared);
  }
});


test('PG supervisor: 05L preserva bootstrap nativo, portal canônico, SMTP local e resultado', async () => {
  const source = await readFile(new URL('../scripts/qa-l08-delivery-postgres.mjs', import.meta.url), 'utf8');
  const guard = source.indexOf('if (process.env.DATABASE_URL');
  const wrapper = source.indexOf('await superviseLocalPg(');
  const native = source.indexOf('const embeddedNativeLib');
  const library = source.indexOf("await import('embedded-postgres')");
  assert.ok(guard < wrapper && wrapper < native && native < library);
  assert.ok(source.indexOf('process.env.LD_LIBRARY_PATH =') < library);
  assert.match(source, /releaseSignalHandlers\(\)/); assert.match(source, /process.platform !== 'win32'/);
  assert.match(source, /test: 600_000/); assert.match(source, /await createLocalQaDatabase\(/);
  assert.match(source, /if \(!supervised\) \{\s*await rm\(directory/);
  assert.match(source, /type: 'complete', code: result/);
  assert.match(source, /if \(result.cleaned\) console.log\('QA_L08_PG_TEMP_CLEANED: true'\)/);
  for (const name of ['libpq.so.5.17', 'libicuuc.so.60.2', 'libicui18n.so.60.2', 'libicudata.so.60.2']) assert.ok(source.includes(name));
  assert.match(source, /CLIENT_DOCS_DIR: path.join\(directory, "private-documents"\)/);
  const body = source.slice(source.indexOf('let result = 1;')); let previous = -1;
  for (const phase of ['initialise', 'start', 'create', 'test', 'stop', 'done']) {
    const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
  }
  assert.doesNotMatch(source, /scripts\/migrate-site-visual.mjs/);
  const integration = await readFile(new URL('../tests/l08-delivery.integration.test.mjs', import.meta.url), 'utf8');
  for (const name of ['client-access', 'client-space']) {
    assert.ok(integration.includes(`import "./${name}.integration.test.mjs";`));
    const legacy = await readFile(new URL(`../tests/${name}.integration.test.mjs`, import.meta.url), 'utf8');
    assert.match(legacy, /await applyMigrations\(\)/); assert.match(legacy, /await restoreGeneratedFiles\(/);
  }
  assert.match(integration, /chromium.launch/); assert.match(integration, /180_000/);
  const access = await readFile(new URL('../tests/client-access.integration.test.mjs', import.meta.url), 'utf8');
  assert.match(access, /MAIL_HOST: "127.0.0.1"/); assert.match(access, /server.listen\(0, "127.0.0.1"/);
  const space = await readFile(new URL('../tests/client-space.integration.test.mjs', import.meta.url), 'utf8');
  assert.match(space, /mkdtemp\(path.join\(os.tmpdir\(\), "seg-client-docs-"\)\)/);
});

test('PG supervisor: 05L liga dependências de supervisor e preserva gate L08 único', async () => {
  const workflow = await readFile(new URL('../.github/workflows/l08-delivery.yml', import.meta.url), 'utf8');
  for (const file of ['scripts/qa-l08-delivery-postgres.mjs', 'scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs', 'tests/helpers/**']) assert.ok(workflow.includes(`'${file}'`));
  assert.ok(workflow.indexOf('node --test') < workflow.indexOf('npm run test:l08-delivery:pg'));
  assert.doesNotMatch(workflow, /npm run test:migrations:pg/);
  assert.match(workflow, /RUN_DATABASE_INTEGRATION_REMOTE: ''/); assert.match(workflow, /contents: read/);
  assert.match(workflow, /cancel-in-progress: false/); assert.match(workflow, /MAIL_HOST: ''/);
});


test('PG supervisor: 05M preserva seed, credenciais 0600, migração local e jornadas F03', async () => {
  for (const [name, tag] of [['client-ticket-acceptance', 'TICKET'], ['employee-request-rh-return', 'EMPLOYEE']]) {
    const source = await readFile(new URL(`../scripts/qa-f03-${name}-postgres.mjs`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/); assert.match(source, /process.platform !== 'win32'/);
    assert.match(source, /migrate: 90_000, test: 600_000/); assert.match(source, /if \(supervised\) await createF03Database\(\)/);
    assert.match(source, /if \(!supervised\) \{\s*await rm\(directory/); assert.match(source, /type: 'complete', code: result/);
    assert.ok(source.includes(`if (result.cleaned) console.log('QA_F03_${tag}_TEMP_CLEANED: true')`));
    for (const contract of ["const database = 'seg_demo_local'", "mode: 'isolated-local-demo'", "SEG_LOCAL_DEMO_ONLY: 'true'", 'seeded.credentials.length !== 10', 'mode: 0o600', 'await chmod(credentialsFile, 0o600)', "F03_CREDENTIALS_FILE: credentialsFile", "AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x'"]) assert.ok(source.includes(contract));
    assert.match(source, /if \(poolFailed\) result = 1/);
    assert.match(source, /connectionTimeoutMillis: 5_000, query_timeout: 30_000, statement_timeout: 30_000/);
    const body = source.slice(source.indexOf('let result = 1;')); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    assert.ok(body.indexOf("phase('test')") > body.indexOf('await chmod('));
    const integration = await readFile(new URL(`../tests/f03-${name}.integration.test.mjs`, import.meta.url), 'utf8');
    assert.match(integration, /playwrightChromium.launch/);
    assert.ok(integration.includes(name === 'client-ticket-acceptance' ? 'timeout: 240_000' : 'timeout: 180_000'));
  }
});

test('PG supervisor: criação F03 é estrita, limitada e fecha Client também em falhas', async () => {
  const { runInNewContext } = await import('node:vm');
  for (const name of ['client-ticket-acceptance', 'employee-request-rh-return', 'contas-baixa-relatorio', 'lead-to-implementation']) {
    const source = await readFile(new URL(`../scripts/qa-f03-${name}-postgres.mjs`, import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('async function createF03Database()'));
    for (const mode of ['ok', 'connect', 'query', 'error', 'refused']) {
      let closed = false, constructed = false;
      class Client {
        constructor(config) { constructed = true; for (const key of ['connectionTimeoutMillis', 'query_timeout', 'statement_timeout']) assert.equal(config[key], 5_000); assert.equal(config.host, '127.0.0.1'); assert.equal(config.database, 'postgres'); }
        on(event, fn) { if (mode === 'error') fn(); }
        async connect() { if (mode === 'connect') throw new Error('connect_failed'); }
        escapeIdentifier(value) { assert.equal(value, 'seg_demo_local'); return '"seg_demo_local"'; }
        async query(sql) { assert.equal(sql, 'CREATE DATABASE "seg_demo_local"'); if (mode === 'query') throw new Error('query_failed'); }
        async end() { closed = true; }
      }
      const create = runInNewContext(body + '\ncreateF03Database', { pg: { Client }, database: mode === 'refused' ? 'not_allowed' : 'seg_demo_local', pgPort: 5432, password: 'synthetic' });
      if (mode === 'ok') await create(); else await assert.rejects(create(), /failed|f03_create_client_error|f03_database_refused/);
      assert.equal(closed, mode !== 'refused'); assert.equal(constructed, mode !== 'refused');
    }
  }
});

test('PG supervisor: 05M liga dois comandos antes órfãos sequenciais e seed canônico', async () => {
  const workflow = await readFile(new URL('../.github/workflows/f03-ticket-employee-delivery.yml', import.meta.url), 'utf8');
  assert.ok(workflow.indexOf('node --test') < workflow.indexOf('npm run test:f03-client-ticket-acceptance:pg'));
  assert.ok(workflow.indexOf('npm run test:f03-client-ticket-acceptance:pg') < workflow.indexOf('npm run test:f03-employee-request-rh-return:pg'));
  for (const file of ['scripts/local-demo-seed.mjs', 'scripts/qa-f03-client-ticket-acceptance-postgres.mjs', 'scripts/qa-f03-employee-request-rh-return-postgres.mjs', 'scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs']) assert.ok(workflow.includes(`'${file}'`));
  for (const variable of ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'RUN_DATABASE_INTEGRATION_REMOTE', 'MAIL_HOST']) assert.ok(workflow.includes(`${variable}: ''`));
  assert.match(workflow, /contents: read/); assert.match(workflow, /cancel-in-progress: false/);
});

test('PG supervisor: 05N preserva seed, credenciais 0600, migração local e jornadas F03', async () => {
  for (const [name, tag] of [['contas-baixa-relatorio', 'FINANCE'], ['lead-to-implementation', '']]) {
    const source = await readFile(new URL(`../scripts/qa-f03-${name}-postgres.mjs`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/); assert.match(source, /process.platform !== 'win32'/);
    assert.match(source, /migrate: 90_000, test: 600_000/); assert.match(source, /if \(supervised\) await createF03Database\(\)/);
    assert.match(source, /if \(!supervised\) \{\s*await rm\(directory/); assert.match(source, /type: 'complete', code: result/);
    assert.ok(source.includes(`if (result.cleaned) console.log('QA_F03${tag ? '_'+tag : ''}_TEMP_CLEANED: true')`));
    for (const contract of ["const database = 'seg_demo_local'", "mode: 'isolated-local-demo'", "SEG_LOCAL_DEMO_ONLY: 'true'", 'seeded.credentials.length !== 10', 'mode: 0o600', 'await chmod(credentialsFile, 0o600)', "F03_CREDENTIALS_FILE: credentialsFile", "AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x'"]) assert.ok(source.includes(contract));
    assert.match(source, /if \(poolFailed\) result = 1/);
    assert.match(source, /connectionTimeoutMillis: 5_000, query_timeout: 30_000, statement_timeout: 30_000/);
    const body = source.slice(source.indexOf('let result = 1;')); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    assert.ok(body.indexOf("phase('test')") > body.indexOf('await chmod('));
    const integration = await readFile(new URL(`../tests/f03-${name}.integration.test.mjs`, import.meta.url), 'utf8');
    assert.match(integration, /playwrightChromium.launch|chromium.launch/);
    assert.ok((name === 'contas-baixa-relatorio' ? /timeout:\s*240_?000/.test(integration) : integration.includes('timeout: 180_000')));
  }
});


test('PG supervisor: 05N liga dois comandos antes órfãos sequenciais e seed canônico', async () => {
  const workflow = await readFile(new URL('../.github/workflows/f03-finance-lead-delivery.yml', import.meta.url), 'utf8');
  assert.ok(workflow.indexOf('node --test') < workflow.indexOf('npm run test:f03-contas-baixa-relatorio:pg'));
  assert.ok(workflow.indexOf('npm run test:f03-contas-baixa-relatorio:pg') < workflow.indexOf('npm run test:f03-lead-to-implementation:pg'));
  for (const file of ['scripts/local-demo-seed.mjs', 'scripts/qa-f03-contas-baixa-relatorio-postgres.mjs', 'scripts/qa-f03-lead-to-implementation-postgres.mjs', 'scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs']) assert.ok(workflow.includes(`'${file}'`));
  for (const variable of ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'RUN_DATABASE_INTEGRATION_REMOTE', 'MAIL_HOST']) assert.ok(workflow.includes(`${variable}: ''`));
  assert.match(workflow, /contents: read/); assert.match(workflow, /cancel-in-progress: false/);
});


test('PG supervisor: 05O mantém estados UX, bootstrap, UTF8 e filtros focais sem reduzir contratos', async () => {
  for (const [name, budget, pattern, count] of [['client-admin', '600_000', 'UX_CLIENT_ADMIN_TEST_PATTERN', 8], ['contract', '900_000', 'UX_CONTRACT_TEST_PATTERN', 18]]) {
    const source = await readFile(new URL(`../scripts/qa-ux-${name}-postgres.mjs`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/); assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes(`migrate: 90_000, test: ${budget}`));
    assert.match(source, /await createLocalQaDatabase\(/); assert.match(source, /type: 'complete', code: result/);
    assert.match(source, /if \(!supervised\) \{\s*await rm\(directory/);
    assert.ok(source.includes(`process.env.${pattern} ? ['--test-name-pattern', process.env.${pattern}] : []`));
    assert.match(source, /AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x'/);
    const body = source.slice(source.indexOf('let result = 1;')); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    const integration = await readFile(new URL(`../tests/ux-${name}-workspace.integration.test.mjs`, import.meta.url), 'utf8');
    assert.equal((integration.match(/^test\(/gm) || []).length, count);
    assert.match(integration, /120_000/); assert.match(integration, /playwrightChromium.launch|chromium.launch/);
    assert.match(integration, /window.fetch/);
    if (name === 'client-admin') {
      assert.match(source, /initdbFlags: \['--encoding=UTF8'\]/);
      assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf('const embeddedNativeLib'));
      assert.ok(source.indexOf('process.env.LD_LIBRARY_PATH =') < source.indexOf("await import('embedded-postgres')"));
      for (const soname of ['libpq.so.5.17', 'libicuuc.so.60.2', 'libicui18n.so.60.2', 'libicudata.so.60.2']) assert.ok(source.includes(soname));
    } else { assert.match(integration, /240_000/); }
  }
});

test('PG supervisor: 05O preserva chamadores e typecheck com filtros/guardas e execução sem pattern no CI', async () => {
  for (const [name, pattern] of [['client-admin', 'UX_CLIENT_ADMIN_TEST_PATTERN'], ['contract', 'UX_CONTRACT_TEST_PATTERN']]) {
    const workflow = await readFile(new URL(`../.github/workflows/ux-${name}-delivery.yml`, import.meta.url), 'utf8');
    for (const file of [`scripts/qa-ux-${name}-postgres.mjs`, 'scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs', 'scripts/migrate-site-visual.mjs']) assert.ok(workflow.includes(`'${file}'`));
    assert.ok(workflow.indexOf('node --test tests/qa-pg-supervisor.test.mjs') < workflow.indexOf(`npm run test:ux-${name}:pg`));
    assert.ok(workflow.indexOf('npm run typecheck') < workflow.indexOf(`npm run test:ux-${name}:pg`));
    for (const variable of ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'RUN_DATABASE_INTEGRATION_REMOTE', pattern]) assert.ok(workflow.includes(`${variable}: ''`));
    assert.match(workflow, /contents: read/); assert.match(workflow, /cancel-in-progress: false/);
    if (name === 'contract') assert.match(workflow, /node --test tests\/ux-contract-vocabulary.test.mjs/);
  }
});


test('PG supervisor: 05P mantém jornadas UX extensas, filtros e contratos de resultado', async () => {
  for (const [name, budget, pattern, count] of [['crm', '1_200_000', 'UX_CRM_TEST_PATTERN', 47], ['finance', '900_000', 'UX_FINANCE_TEST_PATTERN', 46]]) {
    const source = await readFile(new URL(`../scripts/qa-ux-${name}-postgres.mjs`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/); assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes(`migrate: 90_000, test: ${budget}`));
    assert.match(source, /await createLocalQaDatabase\(/); assert.match(source, /type: 'complete', code: result/);
    assert.match(source, /if \(!supervised\) \{\s*await rm\(directory/);
    assert.ok(source.includes(`process.env.${pattern} ? ['--test-name-pattern', process.env.${pattern}] : []`));
    assert.match(source, /AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x'/);
    const body = source.slice(source.indexOf('let result = 1;')); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    const integration = await readFile(new URL(`../tests/ux-${name}-workspace.integration.test.mjs`, import.meta.url), 'utf8');
    assert.equal((integration.match(/^test\(/gm) || []).length, count);
    assert.match(integration, /120_000/); assert.match(integration, /playwrightChromium.launch|chromium.launch/);
    assert.match(integration, /window.fetch/);
    if (name === 'finance') assert.match(integration, /timeout: 420_000/);
    else assert.match(integration, /await restoreGeneratedFiles\(/);
  }
});

test('PG supervisor: 05P preserva CI, vocabulário/typecheck e executa sem filtro focal', async () => {
  for (const [name, pattern] of [['crm', 'UX_CRM_TEST_PATTERN'], ['finance', 'UX_FINANCE_TEST_PATTERN']]) {
    const workflow = await readFile(new URL(`../.github/workflows/ux-${name}-delivery.yml`, import.meta.url), 'utf8');
    for (const file of [`scripts/qa-ux-${name}-postgres.mjs`, 'scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs', 'scripts/migrate-site-visual.mjs']) assert.ok(workflow.includes(`'${file}'`));
    assert.ok(workflow.indexOf('node --test tests/qa-pg-supervisor.test.mjs') < workflow.indexOf(`npm run test:ux-${name}:pg`));
    assert.ok(workflow.indexOf('npm run typecheck') < workflow.indexOf(`npm run test:ux-${name}:pg`));
    assert.ok(workflow.includes(`node --test tests/ux-${name}-vocabulary.test.mjs`));
    for (const variable of ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'RUN_DATABASE_INTEGRATION_REMOTE', pattern]) assert.ok(workflow.includes(`${variable}: ''`));
    assert.match(workflow, /contents: read/); assert.match(workflow, /cancel-in-progress: false/); assert.match(workflow, /timeout-minutes: 40/);
  }
});


test('PG supervisor: 05Q preserva UX operação/patrimônio e o contrato de resultado de cada runner', async () => {
  for (const [name, budget, pattern] of [['ops', '900_000', 'UX_OPS_TEST_PATTERN'], ['asset', '600_000', 'UX_ASSET_TEST_PATTERN']]) {
    const source = await readFile(new URL(`../scripts/qa-ux-${name}-postgres.mjs`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/); assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes(`migrate: 90_000, test: ${budget}`));
    assert.match(source, /await createLocalQaDatabase\(/); assert.match(source, /type: 'complete', code: result/);
    assert.match(source, /if \(!supervised\) \{\s*await rm\(directory/);
    assert.ok(source.includes(`process.env.${pattern} ? ['--test-name-pattern', process.env.${pattern}] : []`));
    assert.match(source, /AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x'/);
    const body = source.slice(source.indexOf('let result = 1;')); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    const integration = await readFile(new URL(`../tests/ux-${name}-workspace.integration.test.mjs`, import.meta.url), 'utf8');
    assert.match(integration, /120_000/); assert.match(integration, /playwrightChromium.launch|chromium.launch/);
    assert.match(integration, /window.fetch/);
    if (name === 'ops') {
      assert.match(source, /const MINIMUM_CASES = 29/); assert.match(source, /const summary = auditTap\(executed.output\)/);
      assert.match(source, /result = executed.code/); assert.match(source, /result = result \|\| 1/);
      assert.match(source, /\}, true\)/);
    } else assert.equal((integration.match(/^test\(/gm) || []).length, 7);
  }
});

test('PG supervisor: 05Q auditor TAP de operação continua reprovando falha, parcial, skip e todo', async () => {
  const { runInNewContext } = await import('node:vm');
  const source = await readFile(new URL('../scripts/qa-ux-ops-postgres.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('const MINIMUM_CASES ='); const end = source.indexOf('const database =', start);
  const audit = runInNewContext(source.slice(start, end) + '\nauditTap');
  const tap = (pass = 29, fail = 0, skip = 0, todo = 0) => `# pass ${pass}\n# fail ${fail}\n# skipped ${skip}\n# todo ${todo}\n`;
  assert.equal(audit(tap()).problems.length, 0);
  for (const value of ['', '# fail 0\n', tap(28), tap(29, 1), tap(29, 0, 1), tap(29, 0, 0, 1)]) assert.ok(audit(value).problems.length > 0);
});

test('PG supervisor: 05Q preserva CI, vocabulário/typecheck e acionamento manual de patrimônio', async () => {
  for (const [name, pattern] of [['ops', 'UX_OPS_TEST_PATTERN'], ['asset', 'UX_ASSET_TEST_PATTERN']]) {
    const workflow = await readFile(new URL(`../.github/workflows/ux-${name}-delivery.yml`, import.meta.url), 'utf8');
    for (const file of [`scripts/qa-ux-${name}-postgres.mjs`, 'scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs', 'scripts/migrate-site-visual.mjs']) assert.ok(workflow.includes(`'${file}'`));
    assert.ok(workflow.indexOf('node --test tests/qa-pg-supervisor.test.mjs') < workflow.indexOf(`npm run test:ux-${name}:pg`));
    assert.ok(workflow.indexOf('npm run typecheck') < workflow.indexOf(`npm run test:ux-${name}:pg`));
    for (const variable of ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'RUN_DATABASE_INTEGRATION_REMOTE', 'MAIL_HOST', pattern]) assert.ok(workflow.includes(`${variable}: ''`));
    assert.match(workflow, /contents: read/); assert.match(workflow, /cancel-in-progress: false/); assert.match(workflow, /timeout-minutes: 40/);
    if (name === 'ops') assert.match(workflow, /node --test tests\/ux-ops-vocabulary.test.mjs/);
    else assert.match(workflow, /workflow_dispatch:/);
  }
});


test('PG supervisor: 05R preserva UX RH/painel, UTF8/locale e contratos de resultado', async () => {
  for (const [name, budget, pattern, integrationFile, count] of [['hr', '900_000', 'UX_HR_TEST_PATTERN', 'ux-hr-workspace', 20], ['adm', '600_000', 'UX_ADM_TEST_PATTERN', 'ux-adm-panel', 12]]) {
    const source = await readFile(new URL(`../scripts/qa-ux-${name}-postgres.mjs`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/); assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes(`migrate: 90_000, test: ${budget}`));
    assert.match(source, /await createLocalQaDatabase\(/); assert.match(source, /type: 'complete', code: result/);
    assert.match(source, /if \(!supervised\) \{\s*await rm\(directory/);
    assert.ok(source.includes(`process.env.${pattern} ? ['--test-name-pattern', process.env.${pattern}] : []`));
    assert.match(source, /AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x'/);
    assert.ok(source.includes(name === 'hr' ? "initdbFlags: ['--encoding=UTF8']" : "initdbFlags: ['--locale=C', '--encoding=UTF8']"));
    const body = source.slice(source.indexOf('let result = 1;')); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    const integration = await readFile(new URL(`../tests/${integrationFile}.integration.test.mjs`, import.meta.url), 'utf8');
    assert.equal((integration.match(/^test\(/gm) || []).length, count);
    assert.match(integration, /120_000/); assert.match(integration, /playwrightChromium.launch|chromium.launch/);
    assert.match(integration, /window.fetch/);
  }
});

test('PG supervisor: 05R mantém CI, vocabulário/typecheck e jornadas completas sem patterns', async () => {
  for (const [name, pattern] of [['hr', 'UX_HR_TEST_PATTERN'], ['adm', 'UX_ADM_TEST_PATTERN']]) {
    const workflow = await readFile(new URL(`../.github/workflows/ux-${name}-delivery.yml`, import.meta.url), 'utf8');
    for (const file of [`scripts/qa-ux-${name}-postgres.mjs`, 'scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs', 'scripts/migrate-site-visual.mjs']) assert.ok(workflow.includes(`'${file}'`));
    assert.ok(workflow.indexOf('node --test tests/qa-pg-supervisor.test.mjs') < workflow.indexOf(`npm run test:ux-${name}:pg`));
    assert.ok(workflow.indexOf('npm run typecheck') < workflow.indexOf(`npm run test:ux-${name}:pg`));
    assert.ok(workflow.includes(`node --test tests/ux-${name}-vocabulary.test.mjs`));
    for (const variable of ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'RUN_DATABASE_INTEGRATION_REMOTE', 'MAIL_HOST', pattern]) assert.ok(workflow.includes(`${variable}: ''`));
    assert.match(workflow, /contents: read/); assert.match(workflow, /cancel-in-progress: false/); assert.match(workflow, /timeout-minutes: 30/);
  }
});

test('PG supervisor: 05S preserva UX frota/terceiros, limites e compatibilidade e contratos de resultado', async () => {
  for (const [name, budget, pattern, integrationFile, count] of [['fleet', '900_000', 'UX_FLEET_TEST_PATTERN', 'ux-fleet-workspace', 13], ['third-party', '900_000', 'UX_THIRD_PARTY_TEST_PATTERN', 'ux-third-party-workspace', 13]]) {
    const source = await readFile(new URL(`../scripts/qa-ux-${name}-postgres.mjs`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/); assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes(`migrate: 90_000, test: ${budget}`));
    assert.match(source, /await createLocalQaDatabase\(/); assert.match(source, /type: 'complete', code: result/);
    assert.match(source, /if \(!supervised\) \{\s*await rm\(directory/);
    assert.ok(source.includes(`process.env.${pattern} ? ['--test-name-pattern', process.env.${pattern}] : []`));
    assert.match(source, /AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x'/);
    assert.match(source, /LD_LIBRARY_PATH/); assert.match(source, /await symlink/);
    assert.match(source, /--max-old-space-size=1024/);
    assert.match(source, /stdio: 'inherit'/);
    assert.doesNotMatch(source, /const MINIMUM_CASES/);
    const body = source.slice(source.indexOf('let result = 1;')); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    const integration = await readFile(new URL(`../tests/${integrationFile}.integration.test.mjs`, import.meta.url), 'utf8');
    assert.equal((integration.match(/^test\(/gm) || []).length, count);
    assert.match(integration, /180_000/); assert.match(integration, /playwrightChromium.launch|chromium.launch/);
    assert.match(integration, /window.fetch/);
    assert.match(integration, /240_000/); assert.match(integration, /tentativa <= 3/);
    assert.match(integration, /erro\?\.code === 'ERR_ASSERTION'/);
  }
});

test('PG supervisor: 05S mantém CI, vocabulário/typecheck e jornadas completas sem patterns', async () => {
  for (const [name, pattern] of [['fleet', 'UX_FLEET_TEST_PATTERN'], ['third-party', 'UX_THIRD_PARTY_TEST_PATTERN']]) {
    const workflow = await readFile(new URL(`../.github/workflows/ux-${name}-delivery.yml`, import.meta.url), 'utf8');
    for (const file of [`scripts/qa-ux-${name}-postgres.mjs`, 'scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs', 'scripts/migrate-site-visual.mjs']) assert.ok(workflow.includes(`'${file}'`));
    assert.ok(workflow.indexOf('node --test tests/qa-pg-supervisor.test.mjs') < workflow.indexOf(`npm run test:ux-${name}:pg`));
    assert.ok(workflow.indexOf('npm run typecheck') < workflow.indexOf(`npm run test:ux-${name}:pg`));
    assert.ok(workflow.includes(`node --test tests/ux-${name}-vocabulary.test.mjs`));
    for (const variable of ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'RUN_DATABASE_INTEGRATION_REMOTE', 'MAIL_HOST', pattern]) assert.ok(workflow.includes(`${variable}: ''`));
    assert.ok(workflow.includes(`node --test tests/ext${name === 'fleet' ? '01-fleet' : '02-third-parties'}.test.mjs`));
    if (name === 'third-party') assert.ok(workflow.indexOf('npm run test:ext02-third-parties:pg') < workflow.indexOf('npm run test:ux-third-party:pg'));
    assert.match(workflow, /contents: read/); assert.match(workflow, /cancel-in-progress: false/); assert.match(workflow, /timeout-minutes: 40/);
  }
});

test('PG supervisor: 05T preserva UX licitações/fornecedores, limites e compatibilidade e contratos de resultado', async () => {
  for (const [name, budget, pattern, integrationFile, count] of [['bidding', '900_000', 'UX_BIDDING_TEST_PATTERN', 'ux-bidding-workspace', 28], ['supplier', '900_000', 'UX_SUPPLIER_TEST_PATTERN', 'ux-supplier-workspace', 20]]) {
    const source = await readFile(new URL(`../scripts/qa-ux-${name}-postgres.mjs`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/); assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes(`migrate: 90_000, test: ${budget}`));
    assert.match(source, /await createLocalQaDatabase\(/); assert.match(source, /type: 'complete', code: result/);
    assert.match(source, /if \(!supervised\) \{\s*await rm\(directory/);
    assert.ok(source.includes(`process.env.${pattern} ? ['--test-name-pattern', process.env.${pattern}] : []`));
    assert.match(source, /AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x'/);
    assert.match(source, /LD_LIBRARY_PATH/); assert.match(source, /await symlink/);
    assert.match(source, /--max-old-space-size=1024/);
    if (name === 'supplier') {
      assert.match(source, /const MINIMUM_CASES = 20/);
      assert.match(source, /const summary = auditTap\(executed.output\)/);
      assert.match(source, /result = executed.code/); assert.match(source, /result = result \|\| 1/);
      assert.match(source, /\}, true\)/);
      assert.ok(source.includes("initdbFlags: ['--encoding=UTF8', '--locale=C']"));
    } else { assert.doesNotMatch(source, /const MINIMUM_CASES/); assert.match(source, /stdio: 'inherit'/); }
    const body = source.slice(source.indexOf('let result = 1;')); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    const integration = await readFile(new URL(`../tests/${integrationFile}.integration.test.mjs`, import.meta.url), 'utf8');
    assert.equal((integration.match(/^test\(/gm) || []).length, count);
    assert.match(integration, name === 'supplier' ? /120_000/ : /60_000/); assert.match(integration, /playwrightChromium.launch|chromium.launch/);
    assert.match(integration, /window.fetch/);
    if (name === 'supplier') {
      assert.match(integration, /attempt <= 3/); assert.match(integration, /error\?\.code === 'ERR_ASSERTION'/);
      assert.match(integration, /UX_SUPPLIER_BROWSER_EXECUTABLE_PATH/);
    }
  }
});


test('PG supervisor: 05T auditor de fornecedores reprova falha, parcial, skip e todo', async () => {
  const { runInNewContext } = await import('node:vm');
  const source = await readFile(new URL('../scripts/qa-ux-supplier-postgres.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('const MINIMUM_CASES ='); const end = source.indexOf('const database =', start);
  const audit = runInNewContext(source.slice(start, end) + '\nauditTap');
  const tap = (pass = 20, fail = 0, skip = 0, todo = 0) => `# pass ${pass}\n# fail ${fail}\n# skipped ${skip}\n# todo ${todo}\n`;
  assert.equal(audit(tap()).problems.length, 0);
  for (const value of ['', '# fail 0\n', tap(19), tap(20, 1), tap(20, 0, 1), tap(20, 0, 0, 1)]) assert.ok(audit(value).problems.length > 0);
});
test('PG supervisor: 05T mantém CI, auditoria npm, typecheck e gate EXT04 herdado', async () => {
  for (const [name, minutes] of [['bidding', 35], ['supplier', 30]]) {
    const workflow = await readFile(new URL(`../.github/workflows/ux-${name}-delivery.yml`, import.meta.url), 'utf8');
    for (const file of ['scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs', 'scripts/migrate-site-visual.mjs']) assert.ok(workflow.includes(`'${file}'`));
    for (const step of ['node --test tests/qa-pg-supervisor.test.mjs','npm run typecheck',`node --test tests/ux-${name}-vocabulary.test.mjs`]) assert.ok(workflow.indexOf(step) < workflow.indexOf(`npm run test:ux-${name}:pg`));
    assert.ok(workflow.includes('npm audit --audit-level=moderate'));
    for (const variable of ['DATABASE_URL','DATABASE_MIGRATION_URL','RUN_DATABASE_INTEGRATION_REMOTE','ALLOW_REMOTE_MIGRATIONS','MAIL_HOST',`UX_${name.toUpperCase()}_TEST_PATTERN`]) assert.ok(workflow.includes(`${variable}: ''`));
    assert.match(workflow,/contents: read/); assert.ok(workflow.includes(`timeout-minutes: ${minutes}`));
    if (name === 'supplier') { assert.match(workflow,/workflow_dispatch:/); assert.ok(workflow.indexOf('npm run test:ext04-suppliers:pg') < workflow.indexOf('npm run test:ux-supplier:pg')); }
  }
});

test('PG supervisor: 05U preserva UX qualidade/satisfação, limites e compatibilidade e contratos de resultado', async () => {
  for (const [name, budget, pattern, integrationFile, count] of [['quality', '900_000', 'UX_QUALITY_TEST_PATTERN', 'ux-quality-workspace', 11], ['satisfaction', '900_000', 'UX_SATISFACTION_TEST_PATTERN', 'ux-satisfaction-workspace', 12]]) {
    const source = await readFile(new URL(`../scripts/qa-ux-${name}-postgres.mjs`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/); assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes(`migrate: 90_000, test: ${budget}`));
    assert.match(source, /await createLocalQaDatabase\(/); assert.match(source, /type: 'complete', code: result/);
    assert.match(source, /if \(!supervised\) \{\s*await rm\(directory/);
    assert.ok(source.includes(`process.env.${pattern} ? ['--test-name-pattern', process.env.${pattern}] : []`));
    assert.match(source, /AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x'/);
    assert.match(source, /LD_LIBRARY_PATH/); assert.match(source, /await symlink/);
    assert.match(source, /--max-old-space-size=1024/);
    assert.match(source, /stdio: 'inherit'/);
    assert.doesNotMatch(source, /const MINIMUM_CASES/);
    const body = source.slice(source.indexOf('let result = 1;')); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    const integration = await readFile(new URL(`../tests/${integrationFile}.integration.test.mjs`, import.meta.url), 'utf8');
    assert.equal((integration.match(/^test\(/gm) || []).length, count);
    assert.match(integration, /180_000/); assert.match(integration, /playwrightChromium.launch|chromium.launch/);
    assert.match(integration, /window.fetch/);
    assert.match(integration, /240_000/); assert.match(integration, /tentativa <= 3/);
    assert.match(integration, /erro\?\.code === 'ERR_ASSERTION'/);
  }
});

test('PG supervisor: 05U mantém CI, vocabulário/typecheck e jornadas completas sem patterns', async () => {
  for (const [name, pattern] of [['quality', 'UX_QUALITY_TEST_PATTERN'], ['satisfaction', 'UX_SATISFACTION_TEST_PATTERN']]) {
    const workflow = await readFile(new URL(`../.github/workflows/ux-${name}-delivery.yml`, import.meta.url), 'utf8');
    for (const file of [`scripts/qa-ux-${name}-postgres.mjs`, 'scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs', 'scripts/migrate-site-visual.mjs']) assert.ok(workflow.includes(`'${file}'`));
    assert.ok(workflow.includes('node --test tests/qa-pg-supervisor.test.mjs'));
    assert.ok(workflow.includes(`npm run test:ux-${name}:pg`));
    assert.ok(workflow.includes('npm run typecheck'));
    assert.ok(workflow.indexOf('node --test tests/qa-pg-supervisor.test.mjs') < workflow.indexOf(`npm run test:ux-${name}:pg`));
    assert.ok(workflow.indexOf('npm run typecheck') < workflow.indexOf(`npm run test:ux-${name}:pg`));
    assert.ok(workflow.includes(`node --test tests/ux-${name}-vocabulary.test.mjs`));
    for (const variable of ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'RUN_DATABASE_INTEGRATION_REMOTE', 'MAIL_HOST', pattern]) assert.ok(workflow.includes(`${variable}: ''`));
    assert.ok(workflow.includes(`node --test tests/ext${name === 'quality' ? '05-quality' : '06-satisfaction'}.test.mjs`));
    if (name === 'satisfaction') assert.ok(workflow.includes('tests/cli11-satisfaction-portal.test.mjs'));
    assert.ok(workflow.includes("ALLOW_REMOTE_MIGRATIONS: ''"));
    assert.match(workflow, /contents: read/); assert.match(workflow, /cancel-in-progress: false/); assert.match(workflow, /timeout-minutes: 40/);
  }
});


test('PG supervisor: 05V preserva UX compliance/conhecimento, limites e compatibilidade e contratos de resultado', async () => {
  for (const [name, budget, pattern, integrationFile, count] of [['compliance', '900_000', 'UX_COMPLIANCE_TEST_PATTERN', 'ux-compliance-workspace', 11], ['knowledge', '900_000', null, 'ux-knowledge-workspace', 11]]) {
    const source = await readFile(new URL(`../scripts/qa-ux-${name}-postgres.mjs`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/); assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes(`migrate: 90_000, test: ${budget}`));
    assert.match(source, /await createLocalQaDatabase\(/); assert.match(source, /type: 'complete', code: result/);
    assert.match(source, /if \(!supervised\) \{\s*await rm\(directory/);
    if (pattern) assert.ok(source.includes(`process.env.${pattern} ? ['--test-name-pattern', process.env.${pattern}] : []`));
    else { assert.doesNotMatch(source, /--test-name-pattern/); assert.ok(source.includes("initdbFlags: ['--encoding=UTF8', '--locale=C']")); }
    assert.match(source, /AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x'/);
    assert.match(source, /LD_LIBRARY_PATH/); assert.match(source, /await symlink/);
    assert.match(source, /--max-old-space-size=1024/);
    assert.match(source, /stdio: 'inherit'/);
    assert.doesNotMatch(source, /const MINIMUM_CASES/);
    const body = source.slice(source.indexOf('let result = 1;')); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    const integration = await readFile(new URL(`../tests/${integrationFile}.integration.test.mjs`, import.meta.url), 'utf8');
    assert.equal((integration.match(/^test\(/gm) || []).length, count);
    assert.match(integration, /180_000/); assert.match(integration, /playwrightChromium.launch|chromium.launch/);
    assert.match(integration, /window.fetch/);
    assert.match(integration, /240_000/);
    if (name === 'compliance') { assert.match(integration, /tentativa <= 3/); assert.match(integration, /erro\?\.code === 'ERR_ASSERTION'/); }
    else { assert.match(integration, /attempt < 3/); assert.match(integration, /UX_KNOWLEDGE_BROWSER_EXECUTABLE_PATH/); }
  }
});

test('PG supervisor: 05V mantém CI, vocabulário/typecheck e jornadas completas sem patterns', async () => {
  for (const [name, pattern] of [['compliance', 'UX_COMPLIANCE_TEST_PATTERN'], ['knowledge', null]]) {
    const workflow = await readFile(new URL(`../.github/workflows/ux-${name}-delivery.yml`, import.meta.url), 'utf8');
    for (const file of [`scripts/qa-ux-${name}-postgres.mjs`, 'scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs', 'scripts/migrate-site-visual.mjs']) assert.ok(workflow.includes(`'${file}'`));
    assert.ok(workflow.includes('node --test tests/qa-pg-supervisor.test.mjs'));
    assert.ok(workflow.includes(`npm run test:ux-${name}:pg`));
    assert.ok(workflow.includes('npm run typecheck'));
    assert.ok(workflow.indexOf('node --test tests/qa-pg-supervisor.test.mjs') < workflow.indexOf(`npm run test:ux-${name}:pg`));
    assert.ok(workflow.indexOf('npm run typecheck') < workflow.indexOf(`npm run test:ux-${name}:pg`));
    assert.ok(workflow.includes(`node --test tests/ux-${name}-vocabulary.test.mjs`));
    for (const variable of ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'RUN_DATABASE_INTEGRATION_REMOTE', 'MAIL_HOST', ...(pattern ? [pattern] : [])]) assert.ok(workflow.includes(`${variable}: ''`));
    assert.ok(workflow.includes(`node --test tests/ext${name === 'compliance' ? '07-compliance' : '08-knowledge'}.test.mjs`));
    if (name === 'compliance') assert.ok(workflow.includes('tests/ext-compliance-scheduler.test.mjs'));
    else assert.ok(workflow.includes("'src/components/ui/UiWorkspace.module.css'"));
    assert.ok(workflow.includes("ALLOW_REMOTE_MIGRATIONS: ''"));
    assert.match(workflow, /contents: read/); assert.match(workflow, /cancel-in-progress: false/); assert.match(workflow, /timeout-minutes: 40/);
  }
});


test('PG supervisor: 05W preserva perfis e jornadas reais distintas de intel/analytics', async () => {
  for (const [name, budget, file, count] of [['intel', '300_000', 'ext14-intel', 18], ['analytics', '900_000', 'ux-analytics-workspace', 10]]) {
    const source = await readFile(new URL(`../scripts/qa-ux-${name}-postgres.mjs`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/); assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes(`migrate: 90_000, test: ${budget}`));
    assert.match(source, /await createLocalQaDatabase\(/); assert.match(source, /type: 'complete', code: result/);
    assert.match(source, /if \(!supervised\) \{\s*await rm\((dir|directory)/);
    assert.match(source, /LD_LIBRARY_PATH/); assert.match(source, /await symlink/);
    assert.match(source, /stdio: 'inherit'/); assert.doesNotMatch(source, /const MINIMUM_CASES/);
    assert.ok(source.includes(`tests/${file}.integration.test.mjs`));
    const body = source.slice(source.indexOf('let result = 1;')); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    const integration = await readFile(new URL(`../tests/${file}.integration.test.mjs`, import.meta.url), 'utf8');
    assert.equal((integration.match(/^test\(/gm) || []).length, count);
    assert.match(integration, /window.fetch/); assert.match(integration, /chromium.launch|playwrightChromium.launch/);
    if (name === 'intel') {
      assert.match(source, /await snapshotGeneratedFiles\(/); assert.match(source, /finally \{\s*await restoreGeneratedFiles\(generatedSnapshot\)/);
      assert.match(source, /QA_EXT14_REQUIRE_DB: '1'/); assert.doesNotMatch(source, /--test-name-pattern/);
      assert.match(integration, /timeout: 90000/); assert.match(integration, /attempt <= 2/);
      assert.ok(integration.includes('error?.code === "ERR_ASSERTION"'));
      assert.match(source, /QA_PG_STOP_FAILED/);
    } else {
      assert.ok(source.includes("initdbFlags: ['--encoding=UTF8', '--locale=C']"));
      assert.ok(source.includes("process.env.UX_ANALYTICS_TEST_PATTERN ? ['--test-name-pattern', process.env.UX_ANALYTICS_TEST_PATTERN] : []"));
      assert.match(integration, /180_000/); assert.match(integration, /240_000/); assert.match(integration, /tentativa <= 3/);
    }
  }
});

test('PG supervisor: 05W mantém CI, vocabulários, typecheck e comandos reais', async () => {
  for (const name of ['intel', 'analytics']) {
    const workflow = await readFile(new URL(`../.github/workflows/ux-${name}-delivery.yml`, import.meta.url), 'utf8');
    for (const file of ['scripts/lib/qa-pg-supervisor.mjs', 'scripts/qa-generated-files-guard.mjs', 'tests/qa-pg-supervisor.test.mjs', 'scripts/migrate-site-visual.mjs']) assert.ok(workflow.includes(`'${file}'`));
    const gate = `npm run test:ux-${name}:pg`; assert.ok(workflow.includes(gate));
    for (const step of ['node --test tests/qa-pg-supervisor.test.mjs','npm run typecheck', `node --test tests/ux-${name}-vocabulary.test.mjs`]) {
      assert.ok(workflow.includes(step)); assert.ok(workflow.indexOf(step) < workflow.indexOf(gate));
    }
    for (const variable of ['DATABASE_URL','DATABASE_MIGRATION_URL','RUN_DATABASE_INTEGRATION_REMOTE','ALLOW_REMOTE_MIGRATIONS','MAIL_HOST']) assert.ok(workflow.includes(`${variable}: ''`));
    assert.match(workflow, /contents: read/); assert.match(workflow, /cancel-in-progress: false/); assert.match(workflow, /timeout-minutes: 40/);
    if (name === 'analytics') { assert.ok(workflow.includes("UX_ANALYTICS_TEST_PATTERN: ''")); assert.ok(workflow.includes('node --test tests/ext11-analytics.test.mjs')); }
    else { assert.ok(workflow.includes("'scripts/qa-generated-files.mjs'")); assert.ok(workflow.includes("'tests/ext14-intel.integration.test.mjs'")); }
  }
});

test('PG supervisor: 05X preserva jornadas, resultados e fronteiras de conta', async () => {
  for (const [name, count] of [['expansion', 12], ['continuity', 20]]) {
    const source = await readFile(new URL(`../scripts/qa-ux-${name}-postgres.mjs`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/); assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes('migrate: 90_000, test: 900_000'));
    assert.match(source, /await createLocalQaDatabase\(/); assert.match(source, /type: 'complete', code: (result|exitCode)/);
    assert.match(source, /if \(!supervised\) \{\s*await rm\(directory/);
    const start = source.indexOf(name === 'continuity' ? 'let exitCode = 1;' : 'let result = 1;');
    const body = source.slice(start); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    const integration = await readFile(new URL(`../tests/ux-${name}-workspace.integration.test.mjs`, import.meta.url), 'utf8');
    assert.equal((integration.match(/^test\(/gm) || []).length, count);
    assert.match(integration, /window.fetch/); assert.match(integration, /playwrightChromium.launch|chromium.launch/);
    assert.match(integration, /240_000/); assert.match(integration, /tentativa <= 3/);
    if (name === 'continuity') {
      assert.match(source, /const MINIMO = 17/); assert.match(source, /const summary = auditTap\(executed.output\)/);
      assert.match(source, /exitCode = executed.code/); assert.match(source, /summary.problems.length/);
      assert.match(source, /QA_UX_CONTINUITY_REQUIRE_DB: "1"/); assert.match(source, /QA_PG_STOP_FAILED/);
      assert.doesNotMatch(source, /--test-name-pattern/);
      assert.match(integration, /client_account_id/); assert.match(integration, /publica e retira no portal/);
    } else {
      assert.match(source, /LD_LIBRARY_PATH/); assert.match(source, /await symlink/);
      assert.match(source, /--max-old-space-size=1024/); assert.doesNotMatch(source, /const MINIMO|const MINIMUM_CASES/);
      assert.ok(source.includes("process.env.UX_EXPANSION_TEST_PATTERN ? ['--test-name-pattern', process.env.UX_EXPANSION_TEST_PATTERN] : []"));
      assert.match(integration, /180_000/);
    }
  }
});

test('PG supervisor: 05X executa auditor real de continuidade contra falha, parcial, skip e todo', async () => {
  const { runInNewContext } = await import('node:vm');
  const source = await readFile(new URL('../scripts/qa-ux-continuity-postgres.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('const MINIMO ='); const end = source.indexOf('const port =', start);
  const audit = runInNewContext(source.slice(start, end) + '\nauditTap');
  const tap = (pass = 20, fail = 0, skip = 0, todo = 0) => `# pass ${pass}\n# fail ${fail}\n# skipped ${skip}\n# todo ${todo}\n`;
  assert.equal(audit(tap()).problems.length, 0); assert.equal(audit(tap(17)).problems.length, 0);
  for (const value of ['', '# fail 0\n', tap(16), tap(20, 1), tap(20, 0, 1), tap(20, 0, 0, 1)]) assert.ok(audit(value).problems.length > 0);
});

test('PG supervisor: 05X mantém CI, gates herdados, evidências e auditoria npm', async () => {
  for (const [name, minutes, ext] of [['expansion', 30, 'ext09-expansion'], ['continuity', 50, 'ext10-continuity']]) {
    const workflow = await readFile(new URL(`../.github/workflows/ux-${name}-delivery.yml`, import.meta.url), 'utf8');
    for (const file of ['scripts/lib/qa-pg-supervisor.mjs','scripts/qa-generated-files-guard.mjs','tests/qa-pg-supervisor.test.mjs','scripts/migrate-site-visual.mjs']) assert.ok(workflow.includes(`'${file}'`));
    const gate = `npm run test:ux-${name}:pg`; assert.ok(workflow.includes(gate));
    for (const step of ['node --test tests/qa-pg-supervisor.test.mjs','npm run typecheck',`node --test tests/ux-${name}-vocabulary.test.mjs`, `npm run test:${ext}:pg`]) {
      assert.ok(workflow.includes(step)); assert.ok(workflow.indexOf(step) < workflow.indexOf(gate));
    }
    for (const variable of ['DATABASE_URL','DATABASE_MIGRATION_URL','RUN_DATABASE_INTEGRATION_REMOTE','ALLOW_REMOTE_MIGRATIONS','MAIL_HOST']) assert.ok(workflow.includes(`${variable}: ''`));
    assert.match(workflow,/contents: read/); assert.match(workflow,/workflow_dispatch:/);
    assert.ok(workflow.includes(`timeout-minutes: ${minutes}`)); assert.ok(workflow.includes('npm audit --audit-level=moderate'));
    if (name === 'continuity') {
      assert.match(workflow,/cancel-in-progress: false/); assert.ok(workflow.includes('UX_CONTINUITY_EVIDENCE_DIR=docs/ux-11-continuidade-evidencias'));
      assert.ok(workflow.includes('npm run ux:evidence -- --stage=ux-11-continuidade'));
      assert.ok(workflow.includes('tests/ux-continuity-client-portal-vocabulary.test.mjs'));
    } else assert.ok(workflow.includes("UX_EXPANSION_TEST_PATTERN: ''"));
  }
});

test('PG supervisor: 05Y preserva jornadas, resultados e fronteiras de conta', async () => {
  for (const [name, count] of [['portal', 60], ['continuity-client', 10]]) {
    const source = await readFile(new URL(`../scripts/qa-ux-${name}-postgres.mjs`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('await superviseLocalPg(') < source.indexOf("await import('embedded-postgres')"));
    assert.match(source, /releaseSignalHandlers\(\)/); assert.match(source, /process.platform !== 'win32'/);
    assert.ok(source.includes(`migrate: 90_000, test: ${name === 'portal' ? '2_400_000' : '900_000'}`));
    assert.match(source, /await createLocalQaDatabase\(/); assert.match(source, /type: 'complete', code: (result|exitCode)/);
    assert.match(source, /if \(!supervised\) \{\s*await rm\(directory/);
    const start = source.indexOf(name === 'continuity-client' ? 'let exitCode = 1;' : 'let result = 1;');
    const body = source.slice(start); let previous = -1;
    for (const phase of ['initialise', 'start', 'create', 'migrate', 'test', 'stop', 'done']) {
      const index = body.indexOf(`phase('${phase}')`); assert.ok(index > previous); previous = index;
    }
    const integration = await readFile(new URL(`../tests/${name === 'portal' ? 'ux-portal-workspace' : 'ux-continuity-client-portal'}.integration.test.mjs`, import.meta.url), 'utf8');
    assert.equal((integration.match(/^test\(/gm) || []).length, count);
    if (name === 'portal') assert.match(integration, /window.fetch/);
    else { assert.doesNotMatch(integration, /page\.route\(/); assert.match(integration, /queda real do servidor/); } assert.match(integration, /playwrightChromium.launch|chromium.launch/);
    assert.match(integration, /240_000/); assert.match(integration, /attempt <= 3/);
    if (name === 'continuity-client') {
      assert.match(source, /const MINIMO = 10/); assert.match(source, /const summary = auditTap\(executed.output\)/);
      assert.match(source, /exitCode = executed.code/); assert.match(source, /summary.problems.length/);
      assert.match(source, /QA_UX_CONTINUITY_CLIENT_REQUIRE_DB: '1'/); assert.match(source, /QA_PG_STOP_FAILED/);
      assert.doesNotMatch(source, /--test-name-pattern/);
      assert.match(integration, /client_account_id/); assert.match(integration, /detalhe recebe 404 real/); assert.match(integration, /stale_client_list_race/);
    } else {
      assert.ok(source.includes("initdbFlags: ['--encoding=UTF8']"));
      assert.match(source, /finally \{\s*await restoreGeneratedFiles\(generatedSnapshot\)/); assert.doesNotMatch(source, /const MINIMO|const MINIMUM_CASES/);
      assert.ok(source.includes("process.env.UX_PORTAL_TEST_PATTERN ? ['--test-name-pattern', process.env.UX_PORTAL_TEST_PATTERN] : []"));
      assert.match(integration, /120_000/);
    }
  }
});

test('PG supervisor: 05Y executa auditor real de continuidade contra falha, parcial, skip e todo', async () => {
  const { runInNewContext } = await import('node:vm');
  const source = await readFile(new URL('../scripts/qa-ux-continuity-client-postgres.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('const MINIMO ='); const end = source.indexOf('const port =', start);
  const audit = runInNewContext(source.slice(start, end) + '\nauditTap');
  const tap = (pass = 10, fail = 0, skip = 0, todo = 0) => `# pass ${pass}\n# fail ${fail}\n# skipped ${skip}\n# todo ${todo}\n`;
  assert.equal(audit(tap()).problems.length, 0); assert.equal(audit(tap(10)).problems.length, 0);
  for (const value of ['', '# fail 0\n', tap(9), tap(20, 1), tap(20, 0, 1), tap(20, 0, 0, 1)]) assert.ok(audit(value).problems.length > 0);
});

test('PG supervisor: 05Y mantém CI, gates herdados, evidências e auditoria npm', async () => {
  for (const [name, minutes, ext] of [['portal', 60, null], ['continuity-client', 50, 'ext10-continuity']]) {
    const workflow = await readFile(new URL(`../.github/workflows/ux-${name}-delivery.yml`, import.meta.url), 'utf8');
    for (const file of ['scripts/lib/qa-pg-supervisor.mjs','scripts/qa-generated-files-guard.mjs','tests/qa-pg-supervisor.test.mjs','scripts/migrate-site-visual.mjs']) assert.ok(workflow.includes(`'${file}'`));
    const gate = `npm run test:ux-${name}:pg`; assert.ok(workflow.includes(gate));
    for (const step of ['node --test tests/qa-pg-supervisor.test.mjs','npm run typecheck',`node --test tests/ux-${name === 'portal' ? 'portal' : 'continuity'}-vocabulary.test.mjs`, ...(ext ? [`npm run test:${ext}:pg`] : [])]) {
      assert.ok(workflow.includes(step)); assert.ok(workflow.indexOf(step) < workflow.indexOf(gate));
    }
    for (const variable of ['DATABASE_URL','DATABASE_MIGRATION_URL','RUN_DATABASE_INTEGRATION_REMOTE','ALLOW_REMOTE_MIGRATIONS','MAIL_HOST']) assert.ok(workflow.includes(`${variable}: ''`));
    assert.match(workflow,/contents: read/); if (name !== 'portal') assert.match(workflow,/workflow_dispatch:/);
    assert.ok(workflow.includes(`timeout-minutes: ${minutes}`)); if (name !== 'portal') assert.ok(workflow.includes('npm audit --audit-level=moderate'));
    if (name === 'continuity-client') {
      assert.match(workflow,/cancel-in-progress: false/); assert.ok(workflow.includes('UX_CONTINUITY_EVIDENCE_DIR=docs/ux-11-continuidade-evidencias'));
      assert.ok(workflow.includes('npm run test:ux-continuity:pg'));
      assert.ok(workflow.includes('tests/ux-continuity-client-portal-vocabulary.test.mjs'));
      assert.ok(workflow.includes('UX_CONTINUITY_CLIENT_EVIDENCE_DIR=docs/ux-11-continuidade-cliente-evidencias'));
      assert.ok(workflow.includes('npm run ux:evidence -- --stage=ux-11-continuidade-cliente'));
    } else { assert.ok(workflow.includes("UX_PORTAL_TEST_PATTERN: ''")); assert.ok(workflow.includes("'scripts/qa-generated-files.mjs'")); }
  }
});
