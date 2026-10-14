#!/usr/bin/env node
// UX-PRO-07B — gate focal de /admin/emergencial.
//
// O cluster PostgreSQL é descartável e exclusivo; o servidor e o Chromium são
// reais. A suíte preserva os gates herdados (EXT-15, L06, L08) e injeta falhas
// somente em window.fetch dentro da página. Nenhuma API, permissão ou transição
// canônica é afrouxada para produzir os estados de interface.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, symlinkSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_PG_REFUSED: limpe DATABASE_URL, DATABASE_MIGRATION_URL e RUN_DATABASE_INTEGRATION_REMOTE antes deste teste local.');
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');

// embedded-postgres embarca libpq/ICU ao lado dos binários nativos; o Chromium
// empacotado precisa das bibliotecas de compatibilidade AL2023. Ambos entram no
// caminho do carregador antes de qualquer spawn.
const embeddedNativeLib = path.join(root, 'node_modules', '@embedded-postgres', 'linux-x64', 'native', 'lib');
for (const [soname, file] of [['libpq.so.5', 'libpq.so.5.17'], ['libicuuc.so.60', 'libicuuc.so.60.2'], ['libicui18n.so.60', 'libicui18n.so.60.2'], ['libicudata.so.60', 'libicudata.so.60.2']]) {
  const link = path.join(embeddedNativeLib, soname);
  if (!existsSync(link)) { try { symlinkSync(file, link); } catch {} }
}
const al2023Lib = path.join(tmpdir(), 'al2023', 'lib');
process.env.LD_LIBRARY_PATH = [embeddedNativeLib, al2023Lib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');

async function freeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', chunk => { output += chunk; process.stderr.write(chunk); });
    child.once('error', reject);
    child.once('exit', code => resolve({ code: code ?? 1, output }));
  });
}

/** Audita o resumo TAP: nenhum caso pode ser pulado, marcado todo ou falhar. */
function auditTap(output, { minimumCases }) {
  const value = label => {
    const match = output.match(new RegExp(`^# ${label} (\\d+)$`, 'm'));
    return match ? Number(match[1]) : null;
  };
  const pass = value('pass');
  const fail = value('fail');
  const skipped = value('skipped');
  const todo = value('todo');
  const problems = [];
  if (pass === null || fail === null) problems.push('resumo TAP ausente');
  if (fail) problems.push(`${fail} falha(s)`);
  if (skipped) problems.push(`${skipped} caso(s) pulado(s)`);
  if (todo) problems.push(`${todo} caso(s) todo`);
  if (minimumCases && pass !== null && pass < minimumCases) problems.push(`apenas ${pass} casos aprovados; mínimo ${minimumCases}`);
  return { pass, fail, skipped, todo, problems };
}

const database = 'seg_qa_ux_emergency';
const port = await freeLoopbackPort();
const directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-ux-emergency-pg-'));
const password = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'data'),
  port,
  user: 'seg_qa',
  password,
  persistent: false,
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {},
  onError: error => console.error('QA_PG_ENGINE_ERROR', String(error).replaceAll(password, '[redacted]').slice(0, 300)),
});

let result = 1;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(database);
  const url = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`QA_PG_READY: 127.0.0.1:${port}/${database}; cluster temporário exclusivo; segredo omitido.`);

  const migrated = await run(process.execPath, ['scripts/migrate-site-visual.mjs'], {
    DATABASE_MIGRATION_URL: url,
    DATABASE_URL: '',
    QA_MIGRATION_ONLY: 'true',
  });
  if (migrated.code !== 0) throw new Error(`migrations_failed_exit_${migrated.code}`);

  const pattern = process.env.UX_EMERGENCY_TEST_PATTERN;
  const executed = await run(process.execPath, [
    '--test',
    '--test-concurrency=1',
    ...(pattern ? ['--test-name-pattern', pattern] : []),
    'tests/ux-emergency-workspace.integration.test.mjs',
  ], {
    RUN_DATABASE_INTEGRATION: '1',
    RUN_DATABASE_INTEGRATION_REMOTE: '',
    DATABASE_URL: url,
    DATABASE_MIGRATION_URL: '',
    QA_PGLITE_ONLY: '',
    ALLOW_REMOTE_MIGRATIONS: '',
    OLLAMA_ENABLED: 'false',
    MAIL_HOST: '',
    NEXT_TELEMETRY_DISABLED: '1',
    AWS_EXECUTION_ENV: process.env.AWS_EXECUTION_ENV || 'AWS_Lambda_nodejs22.x',
    LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH,
    UX_EMERGENCY_EVIDENCE_DIR: process.env.UX_EMERGENCY_EVIDENCE_DIR || '',
    UX_EMERGENCY_UI_TIMEOUT: process.env.UX_EMERGENCY_UI_TIMEOUT || '',
  });
  result = executed.code;
  const summary = auditTap(executed.output, { minimumCases: pattern ? 0 : 12 });
  console.log(`UX_EMERGENCY_TAP_SUMMARY: pass=${summary.pass} fail=${summary.fail} skipped=${summary.skipped} todo=${summary.todo}`);
  if (summary.problems.length) {
    console.error(`UX_EMERGENCY_GATE_REJECTED: ${summary.problems.join('; ')}`);
    result = 1;
  }
  console.log(`UX_EMERGENCY_TEST_EXIT: ${result}`);
} catch (error) {
  console.error('QA_PG_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 500));
  result = 1;
} finally {
  try {
    await postgres.stop();
  } catch (error) {
    console.error('QA_PG_STOP_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 300));
    result = 1;
  }
  await rm(directory, { recursive: true, force: true });
  console.log('QA_PG_TEMP_CLEANED: true');
}

process.exit(result);
