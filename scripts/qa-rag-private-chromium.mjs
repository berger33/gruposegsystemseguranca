// RAG-01b — gate Chromium dos assistentes privados: PostgreSQL descartável,
// migrações 001–175 do zero, servidor real em modo de desenvolvimento e
// navegador Chromium real por papel/conta.
//
// Prova (ver tests/rag-private-chromium.integration.test.mjs): papel decide a
// tela, vínculo decide o corpus, ausência de modelo continua honesta e o
// feedback privado é gravado pelo protocolo canônico.
//
// Não prova: qualidade de resposta do modelo (exige Ollama com modelo), nem
// homologação humana. Nada aqui baixa modelo ou abre porta fora do loopback.

import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_PG_REFUSED: use apenas cluster descartável local neste gate.');
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');
const MINIMO = 8;

// Higiene do Chromium empacotado: o extrator reutiliza /tmp/chromium se ele já
// existir e, nesse caso, NÃO infla as bibliotecas AL2023 ao lado — o navegador
// então morre com "libnspr4.so: cannot open shared object file". Resíduo de
// execução anterior é removido para o gate rodar do zero, como os demais.
for (const leftover of ['chromium', 'al2023', 'fonts', 'swiftshader']) {
  await rm(path.join(tmpdir(), leftover), { recursive: true, force: true }).catch(() => {});
}

// `next dev` reescreve arquivos versionados (next-env.d.ts, tsconfig.json) com o
// diretório de build deste gate. Guardamos o conteúdo exato e restauramos no fim
// para que a árvore de trabalho não fique suja por efeito colateral do QA.
const generated = new Map();
for (const name of ['next-env.d.ts', 'tsconfig.json']) {
  generated.set(name, await readFile(path.join(root, name), 'utf8').catch(() => null));
}

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
const directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-rag-chromium-'));
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
  const database = 'seg_qa_rag_chromium';
  await postgres.createDatabase(database);
  const url = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`QA_PG_READY: PostgreSQL 17 descartável em 127.0.0.1:${port}/${database}; segredo omitido.`);

  const migrated = await run(process.execPath, ['scripts/migrate-site-visual.mjs'], { DATABASE_MIGRATION_URL: url, DATABASE_URL: '', QA_MIGRATION_ONLY: 'true' });
  if (migrated.code !== 0) throw new Error(`migrations_failed_exit_${migrated.code}`);

  const executed = await run(process.execPath, ['--test', '--test-concurrency=1',
    ...(process.env.RAG_CHROMIUM_TEST_PATTERN ? ['--test-name-pattern', process.env.RAG_CHROMIUM_TEST_PATTERN] : []),
    'tests/rag-private-chromium.integration.test.mjs'], {
    RUN_DATABASE_INTEGRATION: '1',
    QA_RAG_CHROMIUM_REQUIRE_DB: '1',
    DATABASE_URL: url,
    DATABASE_MIGRATION_URL: '',
    QA_PGLITE_ONLY: '',
    RUN_DATABASE_INTEGRATION_REMOTE: '',
    ALLOW_REMOTE_MIGRATIONS: '',
    RAG_QA_CHROMIUM_PORT: String(httpPort),
    RAG_QA_MODEL_PORT: String(silentModelPort),
    // Provider habilitado porém inalcançável (porta silenciosa): a resposta sai
    // indisponível com as fontes recuperadas — nunca texto simulado.
    OLLAMA_ENABLED: 'true',
    OLLAMA_BASE_URL: `http://127.0.0.1:${silentModelPort}`,
    OLLAMA_MODEL: 'qwen3:1.7b',
    OLLAMA_EMBED_MODEL: 'nomic-embed-text',
    MAIL_HOST: '',
    NEXT_TELEMETRY_DISABLED: '1',
    // @sparticuz/chromium traz as bibliotecas AL2023 quando esta flag existe
    // (mesma convenção dos outros gates de navegador do repositório).
    AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x',
  });
  exitCode = executed.code;
  const summary = auditTap(executed.output);
  console.log(`RAG_CHROMIUM_TAP_SUMMARY: pass=${summary.pass} fail=${summary.fail} skipped=${summary.skipped} todo=${summary.todo} minimo_exigido=${MINIMO}`);
  if (summary.problems.length) {
    console.error(`RAG_CHROMIUM_GATE_REJECTED: ${summary.problems.join('; ')}`);
    exitCode = 1;
  }
  console.log(`RAG_CHROMIUM_TEST_EXIT: ${exitCode}`);
} catch (error) {
  console.error('QA_PG_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 600));
  exitCode = 1;
} finally {
  await postgres.stop().catch(() => {});
  await rm(directory, { recursive: true, force: true }).catch(() => {});
  let restored = false;
  for (const [name, original] of generated) {
    if (original === null) continue;
    const current = await readFile(path.join(root, name), 'utf8').catch(() => null);
    if (current !== original) { await writeFile(path.join(root, name), original); restored = true; }
  }
  if (restored) console.log('QA_RAG_CHROMIUM_TRACKED_RESTORED: true');
  console.log('QA_RAG_CHROMIUM_TEMP_CLEANED: true');
}

process.exit(exitCode);
