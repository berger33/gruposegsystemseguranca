#!/usr/bin/env node
// UX — PostgreSQL descartável para a captura de evidência visual.
// Mesma política dos gates existentes: recusa banco externo e remove o cluster.

import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('UX_EVIDENCE_PG_REFUSED: limpe DATABASE_URL, DATABASE_MIGRATION_URL e RUN_DATABASE_INTEGRATION_REMOTE.');
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');
const stageArg = process.argv.find(arg => arg.startsWith('--stage=')) || '--stage=ux-03b';

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}

const database = 'seg_qa_ux_evidence';
const port = await freePort();
const directory = await mkdtemp(path.join(tmpdir(), 'seg-ux-evidence-pg-'));
const password = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'data'), port, user: 'seg_qa', password,
  persistent: false, postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {},
  onError: error => console.error('UX_EVIDENCE_PG_ENGINE_ERROR', String(error).replaceAll(password, '[redacted]').slice(0, 300)),
});

let result = 1;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(database);
  const databaseUrl = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`UX_EVIDENCE_PG_READY: 127.0.0.1:${port}/${database}; cluster temporário exclusivo; segredo omitido.`);
  const migrated = await run(process.execPath, ['scripts/migrate-site-visual.mjs'], {
    DATABASE_MIGRATION_URL: databaseUrl, DATABASE_URL: '', QA_MIGRATION_ONLY: 'true',
  });
  if (migrated !== 0) throw new Error(`migrations_failed_exit_${migrated}`);
  result = await run(process.execPath, ['scripts/ux-evidence-capture.mjs', stageArg], {
    DATABASE_URL: databaseUrl, DATABASE_MIGRATION_URL: '', RUN_DATABASE_INTEGRATION_REMOTE: '',
    OLLAMA_ENABLED: 'false', MAIL_HOST: '', NEXT_TELEMETRY_DISABLED: '1',
    // @sparticuz/chromium traz as bibliotecas do Chromium headless usadas pelos
    // gates de interface deste repositório; a flag apenas seleciona o pacote
    // local, sem envolver AWS.
    AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x',
  });
  console.log(`UX_EVIDENCE_EXIT: ${result}`);
} catch (error) {
  console.error('UX_EVIDENCE_PG_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 400));
  result = 1;
} finally {
  try { await postgres.stop(); } catch (error) {
    console.error('UX_EVIDENCE_PG_STOP_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 300));
    result = 1;
  }
  await rm(directory, { recursive: true, force: true });
  console.log('UX_EVIDENCE_PG_TEMP_CLEANED: true');
}
process.exit(result);
