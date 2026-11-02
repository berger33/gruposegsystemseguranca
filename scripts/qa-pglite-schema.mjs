#!/usr/bin/env node
// E7 — a demo PGlite carrega o schema REAL?
//
// Defeito original: `npm run dev` sem DATABASE_URL subia o PGlite com
// `db/beta-pglite-init.sql` (27 tabelas) contra 581 do PostgreSQL, e o
// `/api/health/ready` nascia `degraded` por tabela ausente. Este gate prova, em
// processo real do PGlite (PostgreSQL em WASM), que:
//
//   1. a demo aplica TODAS as migrações de `db/migrations` (nenhuma lista à mão);
//   2. o schema resultante tem a ordem de grandeza do PostgreSQL (centenas de
//      tabelas, não 27);
//   3. o segundo boot não reaplica nada (ledger idempotente) e não muda o schema;
//   4. diretório criado pelo modo beta antigo é RECUSADO com mensagem explícita
//      (não vira híbrido inconsistente nem "demo meio funcionando");
//   5. (E16) a fila durável `durable_jobs` existe no schema da demo com suas
//      guardas, e o motor funciona nela — mas SOMENTE em sessão única. O PGlite
//      serializa as consultas na mesma sessão: `FOR UPDATE SKIP LOCKED` não tem
//      com quem competir aqui. A prova de exclusão mútua entre PROCESSOS, de
//      retomada de lease órfão e de exactly-once sob kill real está no gate
//      `npm run test:durable-scheduler:pg` (PostgreSQL descartável). Este gate
//      prova schema/boot; quem precisar de contenção vai para o gate PG.
//
// Tudo em diretório temporário: nunca toca `.data/pglite` do operador e não fala
// com banco externo. Exit 0 só com as quatro provas.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const poolUrl = pathToFileURL(path.join(root, 'src/server/pglite-pool.mjs')).href;
const healthUrl = pathToFileURL(path.join(root, 'src/server/healthcheck-api.mjs')).href;
const durableUrl = pathToFileURL(path.join(root, 'src/server/durable-scheduler.mjs')).href;
const migrations = readdirSync(path.join(root, 'db/migrations')).filter((name) => /^\d{3}-.+\.sql$/.test(name)).sort();
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`FALHOU ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const BOOT = `
const started = Date.now();
let code = 0;
let pool = null;
try {
  const mod = await import(${JSON.stringify(poolUrl)});
  pool = await mod.getPGlitePool();
  const info = mod.getPGliteSchemaInfo();
  const scalar = async (sql) => (await pool.query(sql)).rows[0].c;
  const tables = await scalar("select count(*)::int c from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name<>'__migrations'");
  const migrated = await scalar("select count(*)::int c from __migrations where filename like '___-%'");
  const demoStaff = await scalar("select count(*)::int c from auth_staff_profiles where identity_id='00000000-0000-0000-0000-000000000099'");
  // Mesma consulta do gate PostgreSQL (qa-migrations-postgres): pg_tables em public.
  const pgTables = await scalar("select count(*)::int c from pg_tables where schemaname='public'");
  const { createHealthcheckApi } = await import(${JSON.stringify(healthUrl)});
  let ready = null;
  const api = createHealthcheckApi({
    json: (res, status, payload) => { ready = { status, payload }; },
    getPool: () => pool,
    readAdminSession: async () => null,
    sameOrigin: () => true,
    observability: null,
  });
  await api.handleReady({ url: '/api/health/ready' }, {});
  console.log('__RESULT__' + JSON.stringify({
    ...info, tables, migrated, demoStaff, pgTables, ms: Date.now() - started,
    readyStatus: ready?.status,
    overall: ready?.payload?.overall_status,
    degraded: ready?.payload?.degraded_dependencies,
    failingChecks: (ready?.payload?.checks || []).filter((c) => c.is_degraded || c.status === 'unknown').map((c) => c.name),
  }));
} catch (error) {
  code = 1;
  console.log('__ERROR__' + JSON.stringify({ message: String(error.message).slice(0, 500) }));
} finally {
  try { await pool?.end?.(); } catch {}
  process.exit(code);
}
`;

const DURABLE = `
let code = 0;
let pool = null;
try {
  const poolMod = await import(${JSON.stringify(poolUrl)});
  const durable = await import(${JSON.stringify(durableUrl)});
  pool = await poolMod.getPGlitePool();
  const out = {};
  out.table = (await pool.query("select count(*)::int c from pg_tables where schemaname='public' and tablename='durable_jobs'")).rows[0].c;
  out.columns = (await pool.query("select count(*)::int c from information_schema.columns where table_schema='public' and table_name='durable_jobs'")).rows[0].c;
  out.indexes = (await pool.query("select indexname from pg_indexes where tablename='durable_jobs' and indexdef like '%WHERE%' order by indexname")).rows.map((r) => r.indexname);
  const key = 'e16:pglite-probe';
  out.first = (await durable.enqueue(pool, { jobKey: key, jobType: 'probe', slot: 'pglite:s-1', dueAt: new Date(Date.now() - 1000), leaseSeconds: 5, maxBackoffSeconds: 3600, payload: {} })).status;
  out.duplicated = (await durable.enqueue(pool, { jobKey: key, jobType: 'probe', slot: 'pglite:s-1', dueAt: new Date(Date.now() - 1000), leaseSeconds: 5, maxBackoffSeconds: 3600, payload: {} })).status;
  out.rows = (await pool.query("select count(*)::int c from durable_jobs where job_key=$1", [key])).rows[0].c;
  const claimed = await durable.claimJob(pool, { jobKey: key, leaseSeconds: 5, batchSize: 1 });
  out.claimed = claimed.length;
  out.token = typeof claimed[0]?.token === 'string' && claimed[0].token.length === 36;
  out.statusAfterClaim = (await durable.inspectJob(pool, key)).status;
  const nextDue = new Date(Date.now() + 3_600_000);
  await durable.completeJobOrThrow(pool, { jobKey: key, token: claimed[0].token, slot: claimed[0].slot, nextSlot: 'pglite:s-2', nextDueAt: nextDue });
  out.afterComplete = await durable.inspectJob(pool, key);
  out.reclaimAfterComplete = (await durable.claimJob(pool, { jobKey: key, leaseSeconds: 5, batchSize: 1 })).length;
  const failed = await durable.enqueue(pool, { jobKey: key, jobType: 'probe', slot: 'pglite:s-3', dueAt: new Date(Date.now() - 1000), leaseSeconds: 5, maxBackoffSeconds: 3600, payload: {}, refresh: true, force: true });
  out.forced = failed.status;
  const claim2 = await durable.claimJob(pool, { jobKey: key, leaseSeconds: 5, batchSize: 1 });
  const f = await durable.failJob(pool, { jobKey: key, token: claim2[0].token, error: new Error('probe'), retryable: true, failures: 1, backoffSeconds: 60, backoffMaxSeconds: 3600 });
  out.failApplied = f.applied;
  const afterFail = await durable.inspectJob(pool, key);
  out.failStatus = afterFail.status;
  out.failDueInTheFuture = new Date(afterFail.due_at).getTime() > Date.now() + 30_000;
  out.claimWhileBackoff = (await durable.claimJob(pool, { jobKey: key, leaseSeconds: 5, batchSize: 1 })).length;
  await pool.query("DELETE FROM durable_jobs WHERE job_key=$1", [key]);
  console.log('__DURABLE__' + JSON.stringify(out));
} catch (error) {
  code = 1;
  console.log('__DURABLE_ERR__' + JSON.stringify({ message: String(error.message).slice(0, 400) }));
} finally {
  try { await pool?.end?.(); } catch {}
  process.exit(code);
}
`;

function durableProbe(dataDir) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', DURABLE], {
    cwd: root,
    encoding: 'utf8',
    timeout: 180_000,
    env: { ...process.env, PGLITE_DATA_DIR: dataDir, DATABASE_URL: '', PGLITE_DEBUG: '' },
  });
  const stdout = result.stdout || '';
  const line = stdout.split('\n').find((entry) => entry.startsWith('__DURABLE__') || entry.startsWith('__DURABLE_ERR__')) || '';
  if (line.startsWith('__DURABLE__')) return { ok: true, data: JSON.parse(line.slice('__DURABLE__'.length)) };
  if (line.startsWith('__DURABLE_ERR__')) return { ok: false, error: JSON.parse(line.slice('__DURABLE_ERR__'.length)).message };
  return { ok: false, error: `sem resultado legível (exit ${result.status}): ${stdout.slice(-300) || result.stderr?.slice(-300)}` };
}

function boot(dataDir) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', BOOT], {
    cwd: root,
    encoding: 'utf8',
    timeout: 180_000,
    env: { ...process.env, PGLITE_DATA_DIR: dataDir, DATABASE_URL: '', PGLITE_DEBUG: '' },
  });
  const stdout = result.stdout || '';
  const payload = stdout.split('\n').find((line) => line.startsWith('__RESULT__') || line.startsWith('__ERROR__')) || '';
  if (payload.startsWith('__RESULT__')) return { ok: true, data: JSON.parse(payload.slice('__RESULT__'.length)), status: result.status };
  if (payload.startsWith('__ERROR__')) return { ok: false, error: JSON.parse(payload.slice('__ERROR__'.length)).message, status: result.status };
  return { ok: false, error: `sem resultado legível (exit ${result.status}): ${stdout.slice(-400) || result.stderr?.slice(-400)}`, status: result.status };
}

const workspace = mkdtempSync(path.join(tmpdir(), 'seg-e7-pglite-'));
try {
  // 1ª subida: banco vazio → aplica o ledger inteiro.
  const fresh = path.join(workspace, 'fresh');
  const first = boot(fresh);
  check('E7 a demo sobe e aplica o schema real', first.ok, first.ok ? `${first.data.ms} ms` : first.error);
  if (first.ok) {
    check(`E7 aplica as ${migrations.length} migrações de db/migrations`,
      first.data.migrationFiles === migrations.length && first.data.migrated === migrations.length,
      `migrationFiles=${first.data.migrationFiles} ledger=${first.data.migrated}`);
    check('E7 o schema da demo deixa de ser o mínimo de 27 tabelas', first.data.tables >= 500, `${first.data.tables} tabelas de conteúdo`);
    check('E7 a contagem de tabelas é a do PostgreSQL (pg_tables, como no gate PG)',
      first.data.pgTables === first.data.tables + 1,
      `${first.data.pgTables} em pg_tables = ${first.data.tables} de conteúdo + __migrations`);
    check('E7 o conteúdo sintético da demo entra depois do schema', first.data.demoSeedApplied === true && first.data.demoStaff === 1,
      `seed=${first.data.demoSeedApplied} staff=${first.data.demoStaff}`);
    check('E7 /api/health/ready nasce saudável, não degraded por tabela ausente',
      first.data.readyStatus === 200 && first.data.overall === 'healthy' && (first.data.degraded || []).length === 0,
      `HTTP ${first.data.readyStatus} overall=${first.data.overall} degraded=[${(first.data.degraded || []).join(',')}] checks=${JSON.stringify(first.data.failingChecks)}`);
  }

  // 2ª subida no MESMO diretório: ledger idempotente, nada reaplicado.
  const second = boot(fresh);
  check('E7 o segundo boot não reaplica migração', second.ok && second.data.appliedNow === 0,
    second.ok ? `appliedNow=${second.data.appliedNow}, ${second.data.ms} ms` : second.error);
  if (first.ok && second.ok) {
    check('E7 o segundo boot mantém o mesmo schema', second.data.tables === first.data.tables && second.data.migrated === first.data.migrated,
      `${first.data.tables} → ${second.data.tables} tabelas`);
  }

  // Diretório do modo beta antigo: 27 tabelas + marcador v3 → recusa explícita.
  const legacy = path.join(workspace, 'legacy');
  // Materializa o schema mínimo como a demo antiga fazia, com o marcador v3.
  const probe = spawnSync(process.execPath, ['--input-type=module', '-e', `
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite(${JSON.stringify(legacy)});
await db.exec(fs.readFileSync(${JSON.stringify(path.join(root, 'db/beta-pglite-init.sql'))}, 'utf8'));
await db.query("CREATE TABLE IF NOT EXISTS __migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())");
await db.query("INSERT INTO __migrations (filename) VALUES ('beta-pglite-init-v3.sql') ON CONFLICT DO NOTHING");
await db.close();
`], { cwd: root, encoding: 'utf8', timeout: 300_000 });
  check('E7 o diretório legado é reproduzível para o teste', probe.status === 0, probe.status === 0 ? 'schema mínimo materializado' : (probe.stderr || '').slice(-300));
  const legacyBoot = boot(legacy);
  check('E7 diretório beta antigo é recusado com mensagem explícita',
    !legacyBoot.ok && /pglite_legacy_beta_schema/.test(legacyBoot.error || '') && /\.data\/pglite/.test(legacyBoot.error || ''),
    legacyBoot.ok ? 'subiu sem recusar (regressão)' : 'pglite_legacy_beta_schema');

  // E16 — a demo tem a fila durável e o motor funciona nela em sessão única.
  const dur = durableProbe(fresh);
  check('E16 a demo traz durable_jobs com as guardas da migração 182', dur.ok, dur.ok ? `${dur.data.columns} colunas, índices parciais [${dur.data.indexes.join(', ')}]` : dur.error);
  if (dur.ok) {
    const d = dur.data;
    check('E16 durable_jobs existe no schema aplicado', d.table === 1, `pg_tables=${d.table}`);
    check('E16 job_key é único: reenqueue no mesmo slot não cria segunda linha',
      d.first === 'inserido' && d.duplicated === 'existente' && d.rows === 1,
      `first=${d.first} dup=${d.duplicated} rows=${d.rows}`);
    check('E16 reivindicar devolve token de cercamento e marca o dono',
      d.claimed === 1 && d.token === true && d.statusAfterClaim === 'executando',
      `claimed=${d.claimed} token=${d.token} status=${d.statusAfterClaim}`);
    check('E16 intervalo concluído não é reivindicado de novo (guarda no banco)',
      d.afterComplete?.status === 'aguardando' && d.afterComplete?.last_completed_slot === 'pglite:s-1'
        && d.reclaimAfterComplete === 0 && new Date(d.afterComplete?.due_at).getTime() > Date.now() + 3_000_000,
      `status=${d.afterComplete?.status} done=${d.afterComplete?.last_completed_slot} reclaim=${d.reclaimAfterComplete}`);
    check('E16 falha vira retry adiado, e ninguém reivindica durante o backoff',
      d.forced === 'reatualizado' && d.failApplied === true && d.failStatus === 'falha'
        && d.failDueInTheFuture === true && d.claimWhileBackoff === 0,
      `fail=${d.failStatus} futuro=${d.failDueInTheFuture} claim_no_backoff=${d.claimWhileBackoff}`);
  }
  // A limitação do motor tem de continuar escrita onde ela vale: PGlite não
  // prova contenção, e a prova de concorrência tem de existir no gate PG.
  const runbook = readFileSync(path.join(root, 'docs/APLICACAO-BANCO-DESTINO.md'), 'utf8');
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const ci = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  const self = readFileSync(path.join(root, 'scripts/qa-pglite-schema.mjs'), 'utf8');
  check('E16 a limitação do PGlite é declarada (runbook + comentário deste gate)',
    /SKIP LOCKED/.test(runbook) && /serializa/.test(runbook) && /serializa/.test(self),
    'sem a declaração, "gate PGlite verde" leria como prova de concorrência');
  const gateScript = pkg.scripts?.['test:durable-scheduler:pg'] || '';
  check('E16 a prova de contenção existe e está ligada (npm + CI)',
    gateScript.includes('qa-durable-scheduler-postgres.mjs') && ci.includes('npm run test:durable-scheduler:pg'),
    `npm=${JSON.stringify(gateScript || null)} ci=${ci.includes('npm run test:durable-scheduler:pg')}`);

  // O schema real não pode depender de lista escrita à mão no código da demo.
  const poolSource = readFileSync(path.join(root, 'src/server/pglite-pool.mjs'), 'utf8');
  check('E7 a lista de migrações vem do diretório, não de array manual',
    /listMigrationFiles/.test(poolSource) && !/'0\d\d-[a-z0-9-]+\.sql'/.test(poolSource) && /readdirSync\(directory\)/.test(poolSource));
  writeFileSync(path.join(workspace, 'ok.txt'), 'ok');
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`QA_PGLITE_SCHEMA_FAILED (${failures.length}): ${failures.join(' | ')}`);
  process.exit(1);
}
console.log(`QA_PGLITE_SCHEMA_PASS: ${migrations.length} migrações, schema real, ledger idempotente, legado recusado`);
