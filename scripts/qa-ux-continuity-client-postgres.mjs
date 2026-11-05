#!/usr/bin/env node
// UX-11 / EXT-10 — gate focal do portal de continuidade do cliente.
// Sobe PostgreSQL 17 descartável, aplica o ledger comum e executa o teste
// HTTP + Chromium real. O piso TAP impede que casos sejam removidos/saltados
// silenciosamente: node:test sair 0 não basta.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { releaseSignalHandlers } from './qa-generated-files-guard.mjs';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_PG_REFUSED: DATABASE_URL, DATABASE_MIGRATION_URL e banco remoto são proibidos neste gate local.');
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');
// Grupo 05Y: isolamento de conta e contratos originais sob contenção POSIX.
const supervised = process.env.QA_PG_SUPERVISED === '1' && !!process.send;
if (process.platform !== 'win32' && !supervised) {
  releaseSignalHandlers();
  const { superviseLocalPg, PG_PHASE_LIMITS } = await import('./lib/qa-pg-supervisor.mjs');
  const result = await superviseLocalPg({ entry: path.resolve(import.meta.filename),
    args: process.argv.slice(2), limits: { ...PG_PHASE_LIMITS, migrate: 90_000, test: 900_000 } });
  process.exit(result.code);
}
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const phase = name => { if (supervised) process.send({ type: 'phase', name }); };

const MINIMO = 10;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', chunk => { output += chunk; process.stderr.write(chunk); });
    child.once('error', reject);
    child.once('exit', code => resolve({ code: code ?? 1, output }));
  });
}

function auditTap(output) {
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
  if (pass !== null && pass < MINIMO) problems.push(`apenas ${pass} casos aprovados; mínimo ${MINIMO}`);
  return { pass, fail, skipped, todo, problems };
}

const port = await freePort();
const directory = supervised ? process.env.QA_PG_DIRECTORY : await mkdtemp(path.join(tmpdir(), 'seg-qa-ux-continuity-client-pg-'));
if (!directory) throw new Error('qa_pg_sandbox_missing');
const password = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'data'),
  port,
  user: 'seg_qa',
  password,
  persistent: false,
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {},
  onError: error => console.error('QA_PG_ENGINE_ERROR', String(error).replaceAll(password, '[redacted]').slice(0, 500)),
});

let exitCode = 1;
try {
  phase('initialise');
  await postgres.initialise();
  phase('start');
  await postgres.start();
  const database = 'seg_qa_ux_continuity_client';
  phase('create');
  if (supervised) {
    const { createLocalQaDatabase } = await import('./lib/qa-pg-supervisor.mjs');
    await createLocalQaDatabase({ port, user: 'seg_qa', password, database });
  } else { await postgres.createDatabase(database); }
  const url = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`QA_PG_READY: PostgreSQL 17 descartável em 127.0.0.1:${port}/${database}; segredo omitido.`);

  phase('migrate');
  const migrated = await run(process.execPath, ['scripts/migrate-site-visual.mjs'], {
    DATABASE_MIGRATION_URL: url,
    DATABASE_URL: '',
    QA_MIGRATION_ONLY: 'true',
  });
  if (migrated.code !== 0) throw new Error(`migrations_failed_exit_${migrated.code}`);

  phase('test');
  const executed = await run(process.execPath, ['--test', '--test-concurrency=1', 'tests/ux-continuity-client-portal.integration.test.mjs'], {
    RUN_DATABASE_INTEGRATION: '1',
    QA_UX_CONTINUITY_CLIENT_REQUIRE_DB: '1',
    DATABASE_URL: url,
    DATABASE_MIGRATION_URL: '',
    RUN_DATABASE_INTEGRATION_REMOTE: '',
    QA_PGLITE_ONLY: '',
    ALLOW_REMOTE_MIGRATIONS: '',
    OLLAMA_ENABLED: 'false',
    MAIL_HOST: '',
    NEXT_TELEMETRY_DISABLED: '1',
    AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x',
  });
  exitCode = executed.code;
  const summary = auditTap(executed.output);
  console.log(`UX11_CLIENT_TAP_SUMMARY: pass=${summary.pass} fail=${summary.fail} skipped=${summary.skipped} todo=${summary.todo} minimo_exigido=${MINIMO}`);
  if (summary.problems.length) {
    console.error(`UX11_CLIENT_GATE_REJECTED: ${summary.problems.join('; ')}`);
    exitCode = 1;
  }
  console.log(`UX11_CONTINUITY_CLIENT_TEST_EXIT: ${exitCode}`);
} catch (error) {
  console.error('QA_PG_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 700));
  exitCode = 1;
} finally {
  phase('stop');
  try { await postgres.stop(); } catch (error) {
    if (supervised) {
      console.error('QA_PG_STOP_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 300));
      exitCode = 1;
    }
  }
  if (!supervised) {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    console.log('QA_UX_CONTINUITY_CLIENT_PG_TEMP_CLEANED: true');
  }
}

if (supervised) {
  phase('done');
  await new Promise(resolve => process.send({ type: 'complete', code: exitCode }, resolve));
}
process.exit(exitCode);
