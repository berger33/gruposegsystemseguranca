#!/usr/bin/env node
// UX-PRO-07E-2-ALVO: gate ADITIVO do alvo de toque dos botões "Tentar
// novamente" legados de /admin/financeiro (`fin11-retry` e `fin10-retry`).
// 44 casos herdados intactos (prefixo byte a byte) + 2 provas novas: alvo
// >= 44px nos 4 viewports canônicos nos temas dia e noite, e repetição
// continuando a recuperar a leitura real.
// PostgreSQL descartável, HTTP real e Chromium; falhas somente em window.fetch.
//
// Os runners herdados scripts/qa-ux-finance-postgres.mjs,
// scripts/qa-ux-pro-07e1-postgres.mjs e scripts/qa-ux-pro-07e2-postgres.mjs
// permanecem INTACTOS; este é independente.
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

// 44 herdados + 2 novos. Nenhum filtro de testes é aceito: reduzir a suíte
// invalidaria a prova.
const MINIMUM_CASES = 46;
function auditTap(output) {
  const number = label => {
    const match = output.match(new RegExp(`^# ${label} (\\d+)$`, 'm'));
    return match ? Number(match[1]) : null;
  };
  const pass = number('pass'), fail = number('fail'), skipped = number('skipped'), todo = number('todo');
  const problems = [];
  if ([pass, fail, skipped, todo, number('tests')].some(value => value === null)) problems.push('resumo TAP ausente: a suíte não chegou a rodar');
  if (/^not ok /m.test(output)) problems.push('caso TAP reprovado');
  if (/^ok .*# (?:SKIP|TODO)/mi.test(output)) problems.push('diretiva skip/todo');
  if (number('tests') !== pass) problems.push('total de testes difere das aprovações');
  if (fail) problems.push(`${fail} caso(s) reprovado(s)`);
  if (skipped) problems.push(`${skipped} caso(s) pulado(s) — skip não é prova`);
  if (todo) problems.push(`${todo} caso(s) marcado(s) como todo`);
  if (pass !== null && pass < MINIMUM_CASES) problems.push(`apenas ${pass} caso(s) aprovado(s); a jornada exige ao menos ${MINIMUM_CASES}`);
  return { pass, fail, skipped, todo, problems };
}

const database = 'seg_qa_ux_finance_07e2_alvo';
const port = await freeLoopbackPort();
const directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-ux-finance-07e2-alvo-pg-'));
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
const etapa = nome => console.log(`UX_FIN_07E2_ALVO_SETUP: ${nome}`);

let result = 1;
try {
  etapa('DATABASE_URL vazio confirmado; cluster temporário exclusivo solicitado');
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(database);
  const url = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`QA_PG_READY: 127.0.0.1:${port}/${database}; cluster temporário exclusivo; segredo omitido.`);

  etapa('cluster PostgreSQL descartável no ar');
  const migrated = await run(process.execPath, ['scripts/migrate-site-visual.mjs'], {
    DATABASE_MIGRATION_URL: url, DATABASE_URL: '', QA_MIGRATION_ONLY: 'true',
  });
  if (migrated !== 0) throw new Error(`migrations_failed_exit_${migrated}`);
  etapa('migrações reais aplicadas (nenhuma nova nesta fatia)');
  etapa('servidor real e Chromium Playwright entregues ao teste de integração');

  const executed = await run(process.execPath, ['--test', '--test-concurrency=1',
    'tests/ux-finance-workspace.integration.test.mjs'], {
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
    // Diretório de evidência só quando o operador pede; sem ele o gate roda
    // como no CI e não escreve arquivo algum.
    ...(process.env.UX_FINANCE_EVIDENCE_DIR ? { UX_FINANCE_EVIDENCE_DIR: process.env.UX_FINANCE_EVIDENCE_DIR } : {}),
  }, true);
  result = executed.code;
  const summary = auditTap(executed.output);
  console.log(`UX_FIN_07E2_ALVO_TAP_SUMMARY: pass=${summary.pass} fail=${summary.fail} skipped=${summary.skipped} todo=${summary.todo} minimo_exigido=${MINIMUM_CASES}`);
  if (summary.problems.length) {
    console.error(`UX_FIN_07E2_ALVO_GATE_REJECTED: ${summary.problems.join('; ')}`);
    result = result || 1;
  }
  console.log(`UX_FIN_07E2_ALVO_TEST_EXIT: ${result}`);
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
  console.log('UX_FIN_07E2_ALVO_SETUP: temporário limpo');
}
process.exit(result);
