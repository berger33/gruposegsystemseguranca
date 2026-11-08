#!/usr/bin/env node
// UX-PRO-06 (cadastros centrais de clientes) — gate da tela `/admin/clientes`
// em PostgreSQL REAL e descartável.
//
// Sobe um cluster temporário exclusivo, aplica as migrações vigentes do main,
// executa o servidor de verdade e exercita, com massa fictícia criada pelas
// próprias APIs: 401 sem sessão, 403 para papel sem acesso e — o recorte desta
// fatia — os estados da leitura dos cadastros centrais (falha inicial que não
// vira "carregando" eterno, falha de releitura que preserva o dado com hora e
// repetição, releitura em curso com `role="status"` e negativa que descarta o
// dado em falha fechada), além de 320/390/768/1440 px em dia e noite sem
// transbordo e do percurso de teclado até a seção 1.
//
// O servidor nunca é enfraquecido: a falha é injetada apenas em `window.fetch`,
// dentro da página. Nunca toca em banco do operador: o cluster é temporário,
// exclusivo e descartado ao fim.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { symlinkSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { releaseSignalHandlers } from './qa-generated-files-guard.mjs';
import { assertTapSummary, collectTap } from './lib/qa-tap-summary.mjs';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_PG_REFUSED: limpe DATABASE_URL, DATABASE_MIGRATION_URL e RUN_DATABASE_INTEGRATION_REMOTE antes deste teste local.');
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');
// Grupo 05O: estados/permissões e filtros focais preservados sob contenção POSIX.
const supervised = process.env.QA_PG_SUPERVISED === '1' && !!process.send;
if (process.platform !== 'win32' && !supervised) {
  releaseSignalHandlers();
  const { superviseLocalPg, PG_PHASE_LIMITS } = await import('./lib/qa-pg-supervisor.mjs');
  const result = await superviseLocalPg({ entry: path.resolve(import.meta.filename),
    args: process.argv.slice(2), limits: { ...PG_PHASE_LIMITS, migrate: 90_000, test: 600_000 } });
  // O supervisor já emite QA_PG_TEMP_CLEANED somente após confirmar a remoção.
  process.exit(result.code);
}
const phase = name => { if (supervised) process.send({ type: 'phase', name }); };


// embedded-postgres entrega libpq/ICU ao lado dos binários nativos; expõe esse
// diretório explicitamente em runners mínimos e imagens locais de QA — mesma
// convenção do gate L08 (no-op quando os links já existem).
const embeddedNativeLib = path.join(root, 'node_modules', '@embedded-postgres', 'linux-x64', 'native', 'lib');
for (const [soname, file] of [['libpq.so.5', 'libpq.so.5.17'], ['libicuuc.so.60', 'libicuuc.so.60.2'], ['libicui18n.so.60', 'libicui18n.so.60.2'], ['libicudata.so.60', 'libicudata.so.60.2']]) {
  const link = path.join(embeddedNativeLib, soname);
  if (!existsSync(link)) { try { symlinkSync(file, link); } catch {} }
}
process.env.LD_LIBRARY_PATH = [embeddedNativeLib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const { default: EmbeddedPostgres } = await import('embedded-postgres');

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

const database = 'seg_qa_ux_client_admin';
const port = await freeLoopbackPort();
const directory = supervised ? process.env.QA_PG_DIRECTORY : await mkdtemp(path.join(tmpdir(), 'seg-qa-ux-client-admin-pg-'));
if (!directory) throw new Error('qa_pg_sandbox_missing');
const password = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'data'),
  port, user: 'seg_qa', password, persistent: false,
  // Windows otherwise inherits the machine ANSI locale (often WIN1252),
  // which cannot store Unicode characters present in current migrations.
  initdbFlags: ['--encoding=UTF8'],
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {},
  onError: error => console.error('QA_PG_ENGINE_ERROR', String(error).replaceAll(password, '[redacted]').slice(0, 300)),
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
  console.log(`QA_PG_READY: 127.0.0.1:${port}/${database}; cluster temporário exclusivo; segredo omitido.`);

  phase('migrate');
  const migrated = await run(process.execPath, ['scripts/migrate-site-visual.mjs'], {
    DATABASE_MIGRATION_URL: url, DATABASE_URL: '', QA_MIGRATION_ONLY: 'true',
  });
  if (migrated !== 0) throw new Error(`migrations_failed_exit_${migrated}`);

  phase('test');
  result = await run(process.execPath, ['--test', '--test-concurrency=1',
    ...(process.env.UX_CLIENT_ADMIN_TEST_PATTERN ? ['--test-name-pattern', process.env.UX_CLIENT_ADMIN_TEST_PATTERN] : []),
    'tests/ux-client-admin-workspace.integration.test.mjs'], {
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
  }, { minimum: 8, label: 'UX client-admin' });
  console.log(`UX_CLIENT_ADMIN_TEST_EXIT: ${result}`);
} catch (error) {
  console.error('QA_PG_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 500));
  result = 1;
} finally {
  phase('stop');
  try { await postgres.stop(); } catch (error) {
    console.error('QA_PG_STOP_FAILED', String(error).slice(0, 300));
    result = 1;
  }
  if (!supervised) {
    await rm(directory, { recursive: true, force: true });
    console.log('QA_PG_TEMP_CLEANED: true');
  }
}
if (supervised) {
  phase('done');
  await new Promise(resolve => process.send({ type: 'complete', code: result }, resolve));
}
process.exit(result);
