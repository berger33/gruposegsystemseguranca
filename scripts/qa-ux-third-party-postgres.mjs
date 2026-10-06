#!/usr/bin/env node
// UX-07 / EXT-02 — gate da tela /admin/terceiros em PostgreSQL REAL e descartável,
// servidor HTTP real e Chromium real.
//
// Este é o PRIMEIRO gate com banco real da família FROTA: antes desta fatia
// existia apenas tests/ext01-third-party.test.mjs (unitário, com pool dublê) e
// NENHUM scripts/qa-ext01-*.mjs herdado — diferente de EXT-05/EXT-06, que já
// tinham gate de família. Declarado no documento da fatia.
//
// Sobe um cluster temporário exclusivo, aplica as migrações vigentes do main
// (001–174, nenhuma alterada e nenhuma nova), executa `server.mjs` de verdade
// e exercita, com massa fictícia criada pelas PRÓPRIAS APIs canônicas de terceiros
// (veículo, responsável, abastecimento, manutenção, documento e regra de
// manutenção, todos por HTTP — nenhuma linha de `ext_third-party_*` escrita por SQL):
//   - 401 sem sessão e 403 `forbidden_role` com papel fora da lista do
//     servidor, sem vazar veículo algum na negativa;
//   - 400 sem `Idempotency-Key` e 403 de origem cruzada;
//   - a rota legada viva: 200 em leitura e 410 `legacy_route_retired` com
//     `use` em escrita, sem que a tela a consuma;
//   - a lacuna corrigida nesta fatia: o ramo GET de `maintenance-rules`
//     devolve o histórico — inclusive a regra que o servidor desativou — e a
//     tela passou a lê-lo como leitura independente;
//   - estados honestos de leitura: carregando, vazio, falha e negado nunca se
//     confundem; falha nunca vira lista vazia nem indicador zero;
//   - as sete abas por teclado (roving tabindex, ←/→/Home/End);
//   - vocabulário em português no lugar do valor cru do banco;
//   - ausência honesta (sem responsável, sem abastecimento, sem manutenção,
//     sem documento, sem regra), nunca 0, 0 km, R$ 0,00 ou 01/01/1970 — e o
//     zero REAL do servidor (odômetro 0 km) continua aparecendo;
//   - 390px sem transbordo horizontal.
//
// EXT-01 não usa permissão granular por grant: o servidor canônico decide por
// sessão de equipe, papel (`admin|marcelo|ti`) e origem. Nada aqui alarga
// AdminGate, papel ou rota.
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

const database = 'seg_qa_ux_third_party';
const port = await freeLoopbackPort();
const directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-ux-third-party-pg-'));
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
  console.log('UX_THIRD_PARTY_SETUP: inicializando cluster descartável');
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(database);
  const url = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`QA_PG_READY: 127.0.0.1:${port}/${database}; cluster temporário exclusivo; segredo omitido.`);

  console.log('UX_THIRD_PARTY_SETUP: aplicando migrações reais');
  const migrated = await run(process.execPath, ['scripts/migrate-site-visual.mjs'], {
    DATABASE_MIGRATION_URL: url, DATABASE_URL: '', QA_MIGRATION_ONLY: 'true',
  });
  if (migrated !== 0) throw new Error(`migrations_failed_exit_${migrated}`);

  console.log('UX_THIRD_PARTY_SETUP: executando HTTP e Chromium reais');
  result = await run(process.execPath, ['--test', '--test-concurrency=1',
    ...(process.env.UX_THIRD_PARTY_TEST_PATTERN ? ['--test-name-pattern', process.env.UX_THIRD_PARTY_TEST_PATTERN] : []),
    'tests/ux-third-party-workspace.integration.test.mjs'], {
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
  console.log(`UX_THIRD_PARTY_TEST_EXIT: ${result}`);
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
