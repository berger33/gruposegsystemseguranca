#!/usr/bin/env node
// UX-07 (fatia A — Operação) — Gate da tela de Operação em PostgreSQL REAL e
// descartável.
// Sobe um cluster temporário exclusivo, aplica as migrações vigentes do main,
// executa o servidor de verdade e exercita, com massa fictícia criada pelas
// próprias APIs de operação: 401 sem sessão, a regra "menu não é autorização"
// (o papel supervisor abre /admin/operacao mas é recusado numa escrita
// restrita a admin/ti/rh), o estado honesto de leitura (carregando, vazio,
// falha e negado nunca se confundem — nenhuma falha vira lista vazia), as
// 14 abas por teclado, a idempotência do registro de ciência da escala e
// 390px sem transbordo.
// O servidor nunca é enfraquecido: a falha é injetada apenas em window.fetch,
// dentro da própria página.
// Nunca toca em banco do operador: o cluster é temporário e descartado ao fim.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_PG_REFUSED: limpe DATABASE_URL, DATABASE_MIGRATION_URL e RUN_DATABASE_INTEGRATION_REMOTE antes deste teste local.');
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');

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

function run(cmd, args, env, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let output = '';
    if (capture) {
      child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
      child.stderr.on('data', chunk => { output += chunk; process.stderr.write(chunk); });
    }
    child.once('error', reject);
    child.once('exit', code => resolve(capture ? { code: code ?? 1, output } : code ?? 1));
  });
}

// UX-PRO-07D-1 — auditoria do resumo TAP, aditiva ao gate UX-07. O mínimo
// protege contra regressão silenciosa: os 9 casos herdados da UX-07 (fatia A)
// mais os 10 casos de leitura da UX-PRO-07D-1. Falha, skip, todo, ausência do
// resumo TAP ou aprovações abaixo do mínimo reprovam o gate — inclusive uma
// execução filtrada por UX_OPS_TEST_PATTERN, que nunca vale como prova.
const MINIMUM_CASES = 19;
function auditTap(output) {
  const number = label => {
    const match = output.match(new RegExp(`^# ${label} (\\d+)$`, 'm'));
    return match ? Number(match[1]) : null;
  };
  const pass = number('pass'), fail = number('fail'), skipped = number('skipped'), todo = number('todo');
  const problems = [];
  if (pass === null || fail === null) problems.push('resumo TAP ausente: a suíte não chegou a rodar');
  if (fail) problems.push(`${fail} caso(s) reprovado(s)`);
  if (skipped) problems.push(`${skipped} caso(s) pulado(s) — skip não é prova`);
  if (todo) problems.push(`${todo} caso(s) marcado(s) como todo`);
  if (pass !== null && pass < MINIMUM_CASES) problems.push(`apenas ${pass} caso(s) aprovado(s); o gate exige ao menos ${MINIMUM_CASES}`);
  return { pass, fail, skipped, todo, problems };
}

const database = 'seg_qa_ux_ops';
const port = await freeLoopbackPort();
const directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-ux-ops-pg-'));
const password = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'data'),
  port, user: 'seg_qa', password, persistent: false,
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
    DATABASE_MIGRATION_URL: url, DATABASE_URL: '', QA_MIGRATION_ONLY: 'true',
  });
  if (migrated !== 0) throw new Error(`migrations_failed_exit_${migrated}`);

  const executed = await run(process.execPath, ['--test', '--test-concurrency=1',
    ...(process.env.UX_OPS_TEST_PATTERN ? ['--test-name-pattern', process.env.UX_OPS_TEST_PATTERN] : []),
    'tests/ux-ops-workspace.integration.test.mjs'], {
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
  }, true);
  result = executed.code;
  const summary = auditTap(executed.output);
  console.log(`UX_OPS_TAP_SUMMARY: pass=${summary.pass} fail=${summary.fail} skipped=${summary.skipped} todo=${summary.todo} minimo_exigido=${MINIMUM_CASES}`);
  if (summary.problems.length) {
    console.error(`UX_OPS_GATE_REJECTED: ${summary.problems.join('; ')}`);
    result = result || 1;
  }
  console.log(`UX_OPS_TEST_EXIT: ${result}`);
} catch (error) {
  console.error('QA_PG_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 500));
  result = 1;
} finally {
  try { await postgres.stop(); } catch (error) {
    console.error('QA_PG_STOP_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 300));
    result = 1;
  }
  await rm(directory, { recursive: true, force: true });
  console.log('QA_PG_TEMP_CLEANED: true');
}
process.exit(result);
