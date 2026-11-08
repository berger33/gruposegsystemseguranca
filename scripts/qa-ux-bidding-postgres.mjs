#!/usr/bin/env node
// UX-08 / EXT-03 — gate focal de /admin/licitacoes com PostgreSQL, servidor
// HTTP e Chromium reais. Sobe cluster temporário, aplica todas as migrações,
// executa a suíte canônica completa copiada sem enfraquecer as asserções e
// acrescenta prova do workspace em desktop/mobile e falha injetada somente em
// window.fetch. O gate herdado scripts/qa-ext03-biddings-postgres.mjs continua
// independente. Nunca usa banco do operador e sempre remove o cluster.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { releaseSignalHandlers } from './qa-generated-files-guard.mjs';
import { assertTapSummary, collectTap } from './lib/qa-tap-summary.mjs';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_PG_REFUSED: limpe DATABASE_URL, DATABASE_MIGRATION_URL e RUN_DATABASE_INTEGRATION_REMOTE antes deste gate local.');
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');
// Grupo 05T: jornadas e resultado originais sob contenção POSIX.
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


// Mesma compatibilidade de bibliotecas usada pelos gates anteriores da série:
// o binário embutido procura sonames sem a versão completa.
const embeddedLib = path.join(root, 'node_modules/@embedded-postgres/linux-x64/native/lib');
process.env.LD_LIBRARY_PATH = [embeddedLib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
for (const [target, link] of [
  ['libpq.so.5.17', 'libpq.so.5'],
  ['libicuuc.so.60.2', 'libicuuc.so.60'],
  ['libicui18n.so.60.2', 'libicui18n.so.60'],
  ['libicudata.so.60.2', 'libicudata.so.60'],
]) await symlink(target, path.join(embeddedLib, link)).catch(() => {});

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

async function run(cmd, args, env, tap) {
  if (tap) {
    const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const journey = await collectTap(child);
    const tapResult = assertTapSummary(journey.output, { minimum: tap.minimum, truncated: journey.truncated, label: tap.label });
    return journey.code === 0 && tapResult.ok ? 0 : (journey.code || 1);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}

const database = 'seg_qa_ux_bidding';
const port = await freeLoopbackPort();
const directory = supervised ? process.env.QA_PG_DIRECTORY : await mkdtemp(path.join(tmpdir(), 'seg-qa-ux-bidding-pg-'));
if (!directory) throw new Error('qa_pg_sandbox_missing');
const password = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'data'),
  port, user: 'seg_qa', password, persistent: false,
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {},
  onError: error => console.error('QA_PG_ENGINE_ERROR', String(error).replaceAll(password, '[redacted]').slice(0, 300)),
});

// Marca de progresso do preparo: quando o gate falha em CI, ela diz em qual
// etapa parou. Não altera asserção alguma.
const etapa = nome => console.log(`UX_BIDDING_SETUP: ${nome}`);

let result = 1;
try {
  etapa('DATABASE_URL vazio confirmado; cluster temporário exclusivo solicitado');
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
  console.log(`QA_PG_READY: 127.0.0.1:${port}/${database}; cluster temporário exclusivo; segredo omitido.`);

  etapa('cluster PostgreSQL descartável no ar');
  phase('migrate');
  const migrated = await run(process.execPath, ['scripts/migrate-site-visual.mjs'], {
    DATABASE_MIGRATION_URL: url, DATABASE_URL: '', QA_MIGRATION_ONLY: 'true',
  });
  if (migrated !== 0) throw new Error(`migrations_failed_exit_${migrated}`);
  etapa('migrações reais aplicadas (001–174, nenhuma nova)');
  etapa('servidor real e Chromium Playwright entregues ao teste de integração');

  phase('test');
  result = await run(process.execPath, ['--test', '--test-concurrency=1',
    ...(process.env.UX_BIDDING_TEST_PATTERN ? ['--test-name-pattern', process.env.UX_BIDDING_TEST_PATTERN] : []),
    'tests/ux-bidding-workspace.integration.test.mjs'], {
    RUN_DATABASE_INTEGRATION: '1',
    RUN_DATABASE_INTEGRATION_REMOTE: '',
    DATABASE_URL: url,
    DATABASE_MIGRATION_URL: '',
    QA_PGLITE_ONLY: '',
    ALLOW_REMOTE_MIGRATIONS: '',
    OLLAMA_ENABLED: 'false',
    MAIL_HOST: '',
    NEXT_TELEMETRY_DISABLED: '1',
    // Baixa memória: um processo de teste por vez, heap antigo limitado e
    // Chromium em --single-process (escolhido no próprio teste).
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=1024'].filter(Boolean).join(' '),
    // @sparticuz/chromium inclui as bibliotecas AL2023 (libnspr4 etc.) quando
    // esta flag está presente; mesma convenção dos demais gates, sem usar AWS.
    AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x',
  }, { minimum: 28, label: 'UX bidding' });
  console.log(`UX_BIDDING_TEST_EXIT: ${result}`);
} catch (error) {
  console.error('QA_PG_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 500));
  result = 1;
} finally {
  phase('stop');
  try { await postgres.stop(); } catch (error) {
    console.error('QA_PG_STOP_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 300));
    result = 1;
  }
  if (!supervised) {
    await rm(directory, { recursive: true, force: true });
    console.log('QA_PG_TEMP_CLEANED: true');
  }
  if (!supervised) console.log('UX_BIDDING_SETUP: temporário limpo');
}
if (supervised) {
  phase('done');
  await new Promise(resolve => process.send({ type: 'complete', code: result }, resolve));
}
process.exit(result);
