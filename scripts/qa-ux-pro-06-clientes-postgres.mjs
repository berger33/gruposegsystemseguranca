#!/usr/bin/env node
// UX-PRO-06 (contas administrativas do cliente) — gate focal de /admin/clientes
// em PostgreSQL REAL e descartável.
// Sobe um cluster temporário exclusivo, aplica as migrações vigentes da main e
// executa tests/ux-pro-06-clientes-contas.integration.test.mjs, que sobe o
// servidor de verdade e exercita a tela em Chromium real: o contrato de leitura
// e escrita dos cadastros centrais (401 sem sessão, 403 fora de marcelo|ti,
// POST/PATCH com auditoria), a recusa do AdminGate para papel fora do escopo e
// os estados de leitura desta fatia — falha na releitura preservando os
// cadastros já lidos com hora e repetição, releitura em curso com role="status"
// sem esconder o conteúdo, falha na primeira leitura sem spinner eterno e
// negativa falhando fechada.
// O servidor nunca é enfraquecido: a falha é injetada apenas em window.fetch,
// dentro da própria página. Nunca toca em banco do operador: o cluster é
// temporário, exclusivo e descartado ao fim.
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
// embedded-postgres traz libpq/ICU ao lado dos binários nativos; expor esse
// diretório evita falha de carregamento em imagens de QA mínimas.
const embeddedNativeLib = path.join(root, 'node_modules', '@embedded-postgres', 'linux-x64', 'native', 'lib');
process.env.LD_LIBRARY_PATH = [embeddedNativeLib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');

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

const database = 'seg_qa_ux_pro_06_clientes';
const port = await freeLoopbackPort();
const directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-ux-pro-06-clientes-pg-'));
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
  console.log('QA_UX_PRO_06_CLIENTES_SCOPE: /admin/clientes — leitura dos cadastros centrais (estados de carregando, concluída, releitura em curso, desatualizada, falha sem leitura anterior e negativa), contrato HTTP de GET/POST/PATCH e responsividade/teclado. Portal do cliente, /admin/portal e as leituras próprias das outras nove seções não são promovidos por este gate.');

  const migrated = await run(process.execPath, ['scripts/migrate-site-visual.mjs'], {
    DATABASE_MIGRATION_URL: url, DATABASE_URL: '', QA_MIGRATION_ONLY: 'true',
  });
  if (migrated !== 0) throw new Error(`migrations_failed_exit_${migrated}`);

  result = await run(process.execPath, ['--test', '--test-concurrency=1',
    ...(process.env.UX_PRO_06_CLIENTES_TEST_PATTERN ? ['--test-name-pattern', process.env.UX_PRO_06_CLIENTES_TEST_PATTERN] : []),
    'tests/ux-pro-06-clientes-contas.integration.test.mjs'], {
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
  console.log(`UX_PRO_06_CLIENTES_TEST_EXIT: ${result}`);
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
