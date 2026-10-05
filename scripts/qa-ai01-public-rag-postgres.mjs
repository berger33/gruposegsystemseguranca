#!/usr/bin/env node
// AI-01 — gate focal real e descartável. Exige Ollama local previamente
// autorizado com qwen3:1.7b; nunca baixa modelo e nunca usa banco remoto.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('AI01_REFUSED: limpe DATABASE_URL, DATABASE_MIGRATION_URL e RUN_DATABASE_INTEGRATION_REMOTE.');
  process.exit(2);
}
const root = path.resolve(import.meta.dirname, '..');
const ollamaUrl = process.env.AI01_OLLAMA_URL || 'http://127.0.0.1:11434';
const model = process.env.AI01_OLLAMA_MODEL || 'qwen3:1.7b';
const freePort = () => new Promise((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
const run = (cmd, args, env, capture = false) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  let output = '';
  if (capture) { child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); }); child.stderr.on('data', chunk => { output += chunk; process.stderr.write(chunk); }); }
  child.once('error', reject); child.once('exit', code => resolve({ code: code ?? 1, output }));
});

let postgres;
let directory;
let result = 1;
let password = '';
const safeError = value => password ? String(value).replaceAll(password, '[redacted]') : String(value);
try {
  const [versionResponse, tagsResponse] = await Promise.all([
    fetch(`${ollamaUrl}/api/version`, { signal: AbortSignal.timeout(3000) }),
    fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) }),
  ]);
  if (!versionResponse.ok || !tagsResponse.ok) throw new Error('ollama_preflight_http_failed');
  const version = await versionResponse.json(); const tags = await tagsResponse.json();
  const selected = tags.models?.find(item => item.name === model || item.model === model);
  if (!selected) throw new Error(`authorized_model_missing:${model}`);
  console.log(`AI01_OLLAMA_REAL: version=${version.version} model=${model} digest=${String(selected.digest || '').slice(0, 16)} size=${selected.size}`);

  const pgPort = await freePort(); const appPort = await freePort();
  directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-ai01-pg-'));
  password = randomBytes(24).toString('hex');
  postgres = new EmbeddedPostgres({ databaseDir: path.join(directory, 'data'), port: pgPort, user: 'seg_qa', password, persistent: false,
    postgresFlags: ['-c', 'listen_addresses=127.0.0.1'], onLog: () => {}, onError: error => console.error('AI01_PG_ERROR', safeError(error).slice(0, 300)) });
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase('seg_qa_ai01');
  const databaseUrl = `postgresql://seg_qa:${password}@127.0.0.1:${pgPort}/seg_qa_ai01`;
  const migrated = await run(process.execPath, ['scripts/migrate-site-visual.mjs'], { DATABASE_MIGRATION_URL: databaseUrl, DATABASE_URL: '', QA_MIGRATION_ONLY: 'true' });
  if (migrated.code) throw new Error(`migrations_failed_exit_${migrated.code}`);
  const token = `qa-ai01-ti-${randomBytes(24).toString('hex')}`;
  const executed = await run(process.execPath, ['--test', '--test-concurrency=1', 'tests/ai01-public-rag.integration.test.mjs'], {
    RUN_AI01_REAL: '1', RUN_DATABASE_INTEGRATION_REMOTE: '', DATABASE_URL: databaseUrl, DATABASE_MIGRATION_URL: '',
    AI01_BASE_URL: `http://127.0.0.1:${appPort}`, AI01_OLLAMA_URL: ollamaUrl, AI01_OLLAMA_MODEL: model,
    AI01_ADMIN_TOKEN: token, NEXT_TELEMETRY_DISABLED: '1',
  }, true);
  const skipped = Number(executed.output.match(/^# skipped (\d+)$/m)?.[1] || 0);
  const todo = Number(executed.output.match(/^# todo (\d+)$/m)?.[1] || 0);
  const pass = Number(executed.output.match(/^# pass (\d+)$/m)?.[1] || 0);
  if (executed.code || skipped || todo || pass < 1) throw new Error(`gate_rejected:exit=${executed.code},pass=${pass},skip=${skipped},todo=${todo}`);
  console.log(`AI01_GATE_OK: pass=${pass} skip=0 todo=0 PostgreSQL=descartavel HTTP=real Ollama=real model=${model}`);
  result = 0;
} catch (error) {
  console.error('AI01_GATE_BLOCKED', safeError(error?.message || error).slice(0, 500));
} finally {
  await postgres?.stop().catch(() => {});
  if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
  console.log('AI01_PG_TEMP_CLEANED: true');
}
process.exit(result);
