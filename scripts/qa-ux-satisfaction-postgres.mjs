#!/usr/bin/env node
// UX-07 / EXT-06 — gate da tela /admin/satisfacao em PostgreSQL REAL e
// descartável, servidor HTTP real e Chromium real.
//
// Sobe um cluster temporário exclusivo, aplica as migrações vigentes do main
// (001–174, nenhuma alterada e nenhuma nova), executa `server.mjs` de verdade
// e exercita, com massa fictícia criada pelas PRÓPRIAS APIs canônicas de
// satisfação (pesquisa pela rota staff, resposta pelo portal do cliente,
// transição do acompanhamento pela rota canônica):
//   - 401 sem sessão e 403 `forbidden_role` com papel fora da lista do
//     servidor, sem vazar pesquisa alguma na negativa;
//   - 400 sem `idempotency-key` e 403 de origem cruzada;
//   - o defeito corrigido nesta fatia: `start` lê `note`, `complete` lê
//     `result` e `cancel` lê `justification`. A tela deixou de inventar o
//     texto do registro imutável, e a chave de idempotência continua
//     preservada e visível depois da recusa;
//   - estados honestos de leitura: carregando, vazio, falha e negado nunca se
//     confundem; falha nunca vira lista vazia nem indicador zero;
//   - as quatro abas por teclado (roving tabindex, ←/→/Home/End);
//   - vocabulário em português no lugar do valor cru do banco;
//   - ausência honesta (sem resposta, sem acompanhamento, sem conclusão),
//     nunca 0, 0% ou 01/01/1970;
//   - 390px sem transbordo horizontal.
//
// EXT-06 não usa permissão granular por grant do lado da equipe: o servidor
// canônico decide por sessão, papel (`admin|marcelo|ti`) e origem. O portal do
// cliente é que depende de concessão de acesso ativa na conta. Nada aqui
// alarga AdminGate, papel ou rota.
//
// O servidor NUNCA é enfraquecido: a falha é injetada apenas em `window.fetch`,
// dentro da própria página, por `page.addInitScript`.
// Nunca toca em banco do operador: o cluster é temporário e descartado ao fim.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_PG_REFUSED: limpe DATABASE_URL, DATABASE_MIGRATION_URL e RUN_DATABASE_INTEGRATION_REMOTE antes deste gate local.');
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');

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

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}

const database = 'seg_qa_ux_satisfaction';
const port = await freeLoopbackPort();
const directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-ux-satisfaction-pg-'));
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

  result = await run(process.execPath, ['--test', '--test-concurrency=1',
    ...(process.env.UX_SATISFACTION_TEST_PATTERN ? ['--test-name-pattern', process.env.UX_SATISFACTION_TEST_PATTERN] : []),
    'tests/ux-satisfaction-workspace.integration.test.mjs'], {
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
  });
  console.log(`UX_SATISFACTION_TEST_EXIT: ${result}`);
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
