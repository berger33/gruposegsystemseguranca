#!/usr/bin/env node
// E6 / UX-PRO-06 — gate das rotas públicas de descoberta em PostgreSQL REAL e
// descartável + Chromium real. Sobe cluster temporário exclusivo, aplica as
// migrações vigentes, executa o servidor de verdade e exercita as sete rotas
// do grupo 1 (/servicos, /servicos/[id], /segmentos, /segmentos/[key],
// /conteudos, /conteudos/[slug], /faq) em 320/390/768/1440 px, com teclado,
// estados de leitura e honestidade do noindex. O servidor nunca é enfraquecido:
// falhas de leitura são injetadas apenas em window.fetch, dentro da página.
// Nunca toca em banco do operador: o cluster é temporário e descartado ao fim.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { auditPublicTap } from './lib/qa-public-tap-audit.mjs';
import { snapshotGeneratedFiles, restoreGeneratedFiles } from './qa-generated-files.mjs';
import { releaseSignalHandlers } from './qa-generated-files-guard.mjs';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_PUBLIC_PG_REFUSED: limpe DATABASE_URL, DATABASE_MIGRATION_URL e RUN_DATABASE_INTEGRATION_REMOTE antes deste teste local.');
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');
// 05AH: o pai supervisiona o grupo e restaura gerados após a contenção.
const supervised = process.env.QA_PG_SUPERVISED === '1' && !!process.send;
if (process.platform !== 'win32' && !supervised) {
  releaseSignalHandlers();
  const { superviseLocalPg, PG_PHASE_LIMITS } = await import('./lib/qa-pg-supervisor.mjs');
  const generatedSnapshot = await snapshotGeneratedFiles();
  let result;
  try {
    result = await superviseLocalPg({ entry: path.resolve(import.meta.filename),
      args: process.argv.slice(2), limits: { ...PG_PHASE_LIMITS, migrate: 90_000, test: 1_500_000 } });
  } finally {
    await restoreGeneratedFiles(generatedSnapshot);
    console.log('QA_PUBLIC_GENERATED_FILES_RESTORED: true');
  }
  if (result.cleaned) console.log('QA_PUBLIC_PG_TEMP_CLEANED: true');
  process.exit(result.code);
}
// Mantém o TAP em streaming, mas limita a memória usada pela auditoria.
// `close` espera os pipes, evitando auditar antes do resumo final.
async function runPublicTap(args, env, { echo = true } = {}) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env, ...env };
    delete childEnv.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, args, { cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'inherit'] });
    const decoder = new StringDecoder('utf8');
    let output = '', bytes = 0, truncated = false;
    const limit = 2 * 1024 * 1024;
    child.stdout.on('data', chunk => {
      if (echo) process.stdout.write(chunk);
      bytes += chunk.length;
      if (bytes <= limit) output += decoder.write(chunk);
      else truncated = true;
    });
    child.once('error', reject);
    child.once('close', code => { output += decoder.end(); resolve({ code: code ?? 1, output, truncated }); });
  });
}
const pattern = process.env.UX_PUBLIC_TEST_PATTERN || '';
const testArgs = ['--test', '--test-concurrency=1', '--test-reporter=tap',
  ...(pattern ? ['--test-name-pattern', pattern] : []), 'tests/ux-public-routes.integration.test.mjs'];
if (pattern) {
  // Node pode dizer "pass 1" para um arquivo sem caso selecionado; a sondagem
  // sem banco recusa isso ANTES de iniciar cluster, servidor ou navegador.
  const probe = await runPublicTap(testArgs, { RUN_DATABASE_INTEGRATION: '', DATABASE_URL: '',
    DATABASE_MIGRATION_URL: '', RUN_DATABASE_INTEGRATION_REMOTE: '', QA_PGLITE_ONLY: '',
    MAIL_HOST: '', OLLAMA_ENABLED: 'false' }, { echo: false });
  const checked = auditPublicTap(probe.output, { pattern, probe: true, truncated: probe.truncated });
  if (probe.code !== 0 || checked.problems.length) {
    console.error(`QA_PUBLIC_SELECTION_REFUSED: named=${checked.named}; minimum=${checked.minimum}; ${checked.problems.join(',') || 'probe_exit_nonzero'}`);
    process.exit(1);
  }
  console.log(`QA_PUBLIC_SELECTION_PROBE: ${checked.named} casos selecionados; não executados na sondagem.`);
}
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const phase = name => { if (supervised) process.send({ type: 'phase', name }); };

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
    const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}

const database = 'seg_qa_public_routes';
const port = await freeLoopbackPort();
const directory = supervised ? process.env.QA_PG_DIRECTORY : await mkdtemp(path.join(tmpdir(), 'seg-qa-public-routes-pg-'));
if (!directory) throw new Error('qa_pg_sandbox_missing');
const password = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'data'),
  port, user: 'seg_qa', password, persistent: false,
  initdbFlags: ['--encoding=UTF8'],
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {},
  onError: error => console.error('QA_PUBLIC_PG_ENGINE_ERROR', String(error).replaceAll(password, '[redacted]').slice(0, 300)),
});

let result = 1;
try {
  phase('initialise');
  await postgres.initialise();
  phase('start');
  await postgres.start();
  phase('create');
  if (supervised) {
    const { createLocalQaDatabase } = await import('./lib/qa-pg-supervisor.mjs');
    await createLocalQaDatabase({ port, user: 'seg_qa', password, database });
  } else { await postgres.createDatabase(database); }
  const url = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`QA_PUBLIC_PG_READY: 127.0.0.1:${port}/${database}; cluster temporário exclusivo; segredo omitido.`);

  phase('migrate');
  const migrated = await run(process.execPath, ['scripts/migrate-site-visual.mjs'], {
    DATABASE_MIGRATION_URL: url, DATABASE_URL: '', QA_MIGRATION_ONLY: 'true',
  });
  if (migrated !== 0) throw new Error(`migrations_failed_exit_${migrated}`);

  phase('test');
  const execution = await runPublicTap(testArgs, {
    RUN_DATABASE_INTEGRATION: '1',
    RUN_DATABASE_INTEGRATION_REMOTE: '',
    DATABASE_URL: url,
    DATABASE_MIGRATION_URL: '',
    QA_PGLITE_ONLY: '',
    ALLOW_REMOTE_MIGRATIONS: '',
    OLLAMA_ENABLED: 'false',
    MAIL_HOST: '',
    NEXT_TELEMETRY_DISABLED: '1',
    // @sparticuz/chromium inclui as bibliotecas AL2023 (libnspr4 etc.) quando
    // esta flag está presente; mesma convenção dos demais gates, sem usar AWS.
    AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x',
  });
  const audit = auditPublicTap(execution.output, { pattern, truncated: execution.truncated });
  result = execution.code || (audit.problems.length ? 1 : 0);
  console.log(`UX_PUBLIC_TAP_AUDIT: named=${audit.named}; minimum=${audit.minimum}; ${audit.problems.length ? `FAILED ${audit.problems.join(',')}` : 'PASS'}`);
  console.log(`UX_PUBLIC_TEST_EXIT: ${result}`);
} catch (error) {
  console.error('QA_PUBLIC_PG_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 500));
  result = 1;
} finally {
  phase('stop');
  try { await postgres.stop(); } catch (error) {
    console.error('QA_PUBLIC_PG_STOP_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 300));
    result = 1;
  }
  if (!supervised) {
    await rm(directory, { recursive: true, force: true });
    console.log('QA_PUBLIC_PG_TEMP_CLEANED: true');
  }
}
if (supervised) {
  phase('done');
  await new Promise(resolve => process.send({ type: 'complete', code: result }, resolve));
}
process.exit(result);
