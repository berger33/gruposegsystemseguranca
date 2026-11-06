#!/usr/bin/env node
// FECH-01 — gate focal do assistente (RagWidget) e do contrato /api/ai/answer.
//
// Sobe PostgreSQL 17 descartável e exclusivo, aplica o ledger vigente do main
// (001–174, nenhuma migração alterada), executa `server.mjs` de verdade e roda
// o gate `tests/ai-rag-widget.integration.test.mjs`: HTTP real, cookies de
// sessão reais, Chromium real e um provedor de modelo DETERMINÍSTICO local
// identificado como stub (não é Ollama real).
//
// O auditor TAP impede que casos desapareçam ou sejam pulados em silêncio:
// exige piso mínimo de casos aprovados e zero fail/skipped/todo.
//
// Nunca toca banco do operador: o cluster é temporário e descartado ao fim.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { snapshotGeneratedFiles, restoreGeneratedFiles } from './qa-generated-files.mjs';
import { releaseSignalHandlers } from './qa-generated-files-guard.mjs';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_PG_REFUSED: limpe DATABASE_URL, DATABASE_MIGRATION_URL e RUN_DATABASE_INTEGRATION_REMOTE antes deste gate local.');
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');
// 05AG: o pai supervisiona o grupo e restaura gerados após a contenção.
const supervised = process.env.QA_PG_SUPERVISED === '1' && !!process.send;
if (process.platform !== 'win32' && !supervised) {
  releaseSignalHandlers();
  const { superviseLocalPg, PG_PHASE_LIMITS } = await import('./lib/qa-pg-supervisor.mjs');
  const generatedSnapshot = await snapshotGeneratedFiles();
  let result;
  try {
    result = await superviseLocalPg({ entry: path.resolve(import.meta.filename),
      args: process.argv.slice(2), limits: { ...PG_PHASE_LIMITS, migrate: 90_000, test: 1_200_000 } });
  } finally {
    await restoreGeneratedFiles(generatedSnapshot);
    console.log('QA_FECH01_RAG_WIDGET_GENERATED_FILES_RESTORED: true');
  }
  if (result.cleaned) console.log('QA_FECH01_RAG_WIDGET_PG_TEMP_CLEANED: true');
  process.exit(result.code);
}
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const phase = name => { if (supervised) process.send({ type: 'phase', name }); };
const MINIMO = 20;

// Mesma compatibilidade usada pelos demais gates locais: o binário embutido
// procura sonames sem a versão completa.
const embeddedLib = path.join(root, 'node_modules/@embedded-postgres/linux-x64/native/lib');
process.env.LD_LIBRARY_PATH = [embeddedLib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
for (const [target, link] of [
  ['libpq.so.5.17', 'libpq.so.5'],
  ['libicuuc.so.60.2', 'libicuuc.so.60'],
  ['libicui18n.so.60.2', 'libicui18n.so.60'],
  ['libicudata.so.60.2', 'libicudata.so.60'],
]) await symlink(target, path.join(embeddedLib, link)).catch(() => {});

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
const directory = supervised ? process.env.QA_PG_DIRECTORY : await mkdtemp(path.join(tmpdir(), 'seg-qa-fech01-rag-'));
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
  const database = 'seg_qa_fech01_rag';
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
  const executed = await run(process.execPath, ['--test', '--test-concurrency=1',
    ...(process.env.FECH01_TEST_PATTERN ? ['--test-name-pattern', process.env.FECH01_TEST_PATTERN] : []),
    'tests/ai-rag-widget.integration.test.mjs'], {
    RUN_DATABASE_INTEGRATION: '1',
    QA_AI_RAG_WIDGET_REQUIRE_DB: '1',
    DATABASE_URL: url,
    DATABASE_MIGRATION_URL: '',
    RUN_DATABASE_INTEGRATION_REMOTE: '',
    QA_PGLITE_ONLY: '',
    ALLOW_REMOTE_MIGRATIONS: '',
    // O servidor do gate usa o provedor determinístico local do próprio teste.
    MAIL_HOST: '',
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=1536'].filter(Boolean).join(' '),
    // @sparticuz/chromium inclui as bibliotecas AL2023 (libnspr4 etc.) quando
    // esta flag está presente; mesma convenção dos demais gates, sem usar AWS.
    AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x',
  });
  exitCode = executed.code;

  const summary = auditTap(executed.output);
  console.log(`FECH01_RAG_WIDGET_TAP_SUMMARY: pass=${summary.pass} fail=${summary.fail} skipped=${summary.skipped} todo=${summary.todo} minimo_exigido=${MINIMO}`);
  if (summary.problems.length) {
    console.error(`FECH01_RAG_WIDGET_GATE_REJECTED: ${summary.problems.join('; ')}`);
    exitCode = 1;
  }
  console.log(`FECH01_RAG_WIDGET_TEST_EXIT: ${exitCode}`);
} catch (error) {
  console.error('QA_PG_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 700));
  exitCode = 1;
} finally {
  phase('stop');
  if (supervised) {
    try { await postgres.stop(); } catch (error) {
      console.error('QA_PG_STOP_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 500));
      exitCode = 1;
    }
  } else {
    await postgres.stop().catch(() => {});
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    console.log('QA_FECH01_RAG_WIDGET_PG_TEMP_CLEANED: true');
  }
}
if (supervised) {
  phase('done');
  await new Promise(resolve => process.send({ type: 'complete', code: exitCode }, resolve));
}

process.exit(exitCode);
