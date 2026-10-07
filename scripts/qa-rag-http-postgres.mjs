// RAG-01 — gate focal: PostgreSQL 17 descartável, migrações 001–175 do zero,
// replay idempotente, servidor HTTP real e Chromium real quando pedido.
// Sem banco remoto, sem fixture sintética de resposta e sem `page.route`.
//
// Prova: aplicação do ledger, replay com checksum, escopo antes da busca,
// ausência honesta de fonte, indisponibilidade explícita do modelo, ledger de
// respostas, feedback por protocolo canônico, indexação idempotente com
// provedor de teste declarado e vocabulário da interface.
//
// Não prova: embedding real, inferência real, satisfação humana, desempenho.

import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_PG_REFUSED: use apenas cluster descartável local neste gate.');
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');
const MINIMO = 10;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
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
const httpPort = await freePort();
const silentModelPort = await freePort();
const directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-rag-http-'));
const password = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'data'), port, user: 'seg_qa', password, persistent: false,
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {},
  onError: error => console.error('QA_PG_ENGINE_ERROR', String(error).replaceAll(password, '[redacted]').slice(0, 400)),
});

let exitCode = 1;
try {
  await postgres.initialise();
  await postgres.start();
  const database = 'seg_qa_rag_http';
  await postgres.createDatabase(database);
  const url = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`QA_PG_READY: PostgreSQL 17 descartável em 127.0.0.1:${port}/${database}; segredo omitido.`);

  const first = await run(process.execPath, ['scripts/migrate-site-visual.mjs'], { DATABASE_MIGRATION_URL: url, DATABASE_URL: '', QA_MIGRATION_ONLY: 'true' });
  if (first.code !== 0) throw new Error(`migrations_failed_exit_${first.code}`);
  const replay = await run(process.execPath, ['scripts/migrate-site-visual.mjs'], { DATABASE_MIGRATION_URL: url, DATABASE_URL: '', QA_MIGRATION_ONLY: 'true' });
  if (replay.code !== 0) throw new Error(`migration_replay_failed_exit_${replay.code}`);
  if (!/already applied|idempotente|0 migra/i.test(replay.output) && !/175/.test(replay.output)) {
    console.log('QA_MIGRATION_REPLAY_OUTPUT_HEAD:', replay.output.split('\n').slice(0, 6).join(' | ').slice(0, 400));
  }

  const executed = await run(process.execPath, ['--test', '--test-concurrency=1', 'tests/rag-http.integration.test.mjs'], {
    RUN_DATABASE_INTEGRATION: '1',
    QA_RAG_HTTP_REQUIRE_DB: '1',
    DATABASE_URL: url,
    DATABASE_MIGRATION_URL: '',
    QA_PGLITE_ONLY: '',
    RUN_DATABASE_INTEGRATION_REMOTE: '',
    ALLOW_REMOTE_MIGRATIONS: '',
    RAG_QA_HTTP_PORT: String(httpPort),
    RAG_QA_MODEL_PORT: String(silentModelPort),
    OLLAMA_ENABLED: 'true',
    OLLAMA_BASE_URL: `http://127.0.0.1:${silentModelPort}`,
    OLLAMA_EMBED_MODEL: 'nomic-embed-text',
    MAIL_HOST: '',
    NEXT_TELEMETRY_DISABLED: '1',
  });
  exitCode = executed.code;
  const summary = auditTap(executed.output);
  console.log(`RAG_HTTP_TAP_SUMMARY: pass=${summary.pass} fail=${summary.fail} skipped=${summary.skipped} todo=${summary.todo} minimo_exigido=${MINIMO}`);
  if (summary.problems.length) {
    console.error(`RAG_HTTP_GATE_REJECTED: ${summary.problems.join('; ')}`);
    exitCode = 1;
  }
  console.log(`RAG_HTTP_TEST_EXIT: ${exitCode}`);
} catch (error) {
  console.error('QA_PG_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 600));
  exitCode = 1;
} finally {
  await postgres.stop().catch(() => {});
  await rm(directory, { recursive: true, force: true }).catch(() => {});
  console.log('QA_RAG_HTTP_PG_TEMP_CLEANED: true');
}

process.exit(exitCode);
