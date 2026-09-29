#!/usr/bin/env node
// PLT-MIG-001: somente um cluster PostgreSQL descartável em loopback, criado aqui.
// Nunca usa a URL de banco que veio do operador. Falhas propagam exit != 0.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.ALLOW_REMOTE_MIGRATIONS === 'true') {
  console.error('QA_MIGRATIONS_REFUSED: unset database URLs and remote migrations before using this local-only runner.');
  process.exit(2);
}

function freeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const port = await freeLoopbackPort();
const directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-migrations-pg-'));
const password = randomBytes(24).toString('hex');
const database = 'seg_qa_migrations';
const connectionString = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'data'), port, user: 'seg_qa', password,
  persistent: false, postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {},
  onError: error => console.error('QA_PG_ENGINE_ERROR', String(error).replaceAll(password, '[redacted]').slice(0, 300)),
});

async function runMigrator(pass, targetUrl = connectionString) {
  console.log(`QA_MIGRATIONS_PASS_${pass}: starting on disposable ${new URL(targetUrl).pathname.slice(1)}`);
  const child = spawn(process.execPath, ['scripts/migrate-site-visual.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env, DATABASE_URL: '', DATABASE_MIGRATION_URL: targetUrl,
      QA_MIGRATION_ONLY: 'true', ALLOW_REMOTE_MIGRATIONS: '',
      QA_PGLITE_ONLY: '', MAIL_HOST: '', OLLAMA_ENABLED: 'false',
    },
    stdio: 'inherit',
  });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}

// Ensaio de reversão apenas em cópia do próprio banco QA efêmero. TEMPLATE
// clona dentro do cluster, NÃO é pg_dump/pg_restore nem comprova RPO/RTO.
async function verifyIsolatedCloneRestore() {
  const admin = postgres.getPgClient('postgres', '127.0.0.1');
  const cloneName = 'seg_qa_clone'; // constante; cluster foi criado nesta execução
  const cloneUrl = connectionString.replace(`/${database}`, `/${cloneName}`);
  let clone;
  let adminConnected = false;
  try {
    await admin.connect();
    adminConnected = true;
    await admin.query(`CREATE DATABASE ${cloneName} TEMPLATE ${database}`);
    clone = new pg.Pool({ connectionString: cloneUrl, max: 1 });
    const { rows: ledgerBefore } = await clone.query('SELECT filename, checksum FROM __migrations ORDER BY filename');
    const tableCount = await clone.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'");
    if (ledgerBefore.length !== 98) throw new Error('qa_clone_incomplete_ledger');
    await clone.query("DELETE FROM data_retention_policies_legacy WHERE id='audit_12m'");
    await clone.query("INSERT INTO audit_log (action, actor, target) VALUES ('qa_clone_mutation','qa_synthetic','qa-only')");
    const { rows: [changed] } = await clone.query(`SELECT
      (SELECT count(*)::int FROM data_retention_policies_legacy) AS legacy_count,
      (SELECT count(*)::int FROM audit_log WHERE action='qa_clone_mutation') AS mutation_count`);
    if (changed.legacy_count !== 2 || changed.mutation_count !== 1) throw new Error('qa_clone_mutation_missing');
    // Divergência simulada exclusivamente no ledger do clone. Não rebaselinear.
    await clone.query("UPDATE __migrations SET checksum=repeat('0',64) WHERE filename='006-admin-identities.sql'");
    const mismatchExit = await runMigrator('CLONE_CHECKSUM_MISMATCH', cloneUrl);
    if (mismatchExit !== 1) throw new Error('qa_clone_checksum_mismatch_not_rejected');
    console.log('QA_CLONE_CHECKSUM_MISMATCH: 006 rejected (exit 1), no automatic rebaseline');
    await clone.end(); clone = undefined;
    await admin.query(`DROP DATABASE ${cloneName}`); // somente clone fechado desta execução
    await admin.query(`CREATE DATABASE ${cloneName} TEMPLATE ${database}`);
    clone = new pg.Pool({ connectionString: cloneUrl, max: 1 });
    const { rows: ledgerAfter } = await clone.query('SELECT filename, checksum FROM __migrations ORDER BY filename');
    const { rows: [restored] } = await clone.query(`SELECT
      (SELECT count(*)::int FROM data_retention_policies_legacy) AS legacy_count,
      (SELECT count(*)::int FROM audit_log WHERE action='qa_clone_mutation') AS mutation_count,
      (SELECT count(*)::int FROM pg_tables WHERE schemaname='public') AS table_count`);
    if (JSON.stringify(ledgerAfter) !== JSON.stringify(ledgerBefore) || restored.legacy_count !== 3 ||
        restored.mutation_count !== 0 || restored.table_count !== tableCount.rows[0].count) {
      throw new Error('qa_clone_restore_mismatch');
    }
    console.log(`QA_CLONE_RESTORE: 98/98 checksums preserved; legacy 2->3; synthetic mutation 1->0; tables ${restored.table_count}; TEMPLATE only`);
  } finally {
    await clone?.end();
    if (adminConnected) await admin.end();
  }
}

let result = 1;
let pool;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(database);
  console.log(`QA_PG_READY: 127.0.0.1:${port}/${database}; senha omitida; sem banco preexistente.`);
  pool = new pg.Pool({ connectionString, max: 1 });
  const firstExit = await runMigrator(1);
  const { rows: first } = await pool.query('SELECT count(*)::int AS count FROM __migrations WHERE checksum IS NOT NULL');
  console.log(`QA_MIGRATIONS_FIRST_EXIT=${firstExit} CHECKSUMMED=${first[0].count}/98`);
  if (first[0].count >= 49) {
    const { rows: [retention] } = await pool.query(`
      SELECT (SELECT count(*)::int FROM data_retention_policies_legacy) AS legacy_count,
             (SELECT count(*)::int FROM data_retention_policies) AS current_count,
             (SELECT count(*)::int FROM data_retention_policies WHERE pg_typeof(id)::text = 'uuid') AS uuid_count
    `);
    console.log(`QA_RETENTION_011_PRESERVED=${retention.legacy_count} PLT11_POLICIES=${retention.current_count} UUID=${retention.uuid_count}`);
    if (retention.legacy_count !== 3 || retention.current_count === 0 || retention.uuid_count !== retention.current_count) {
      throw new Error('qa_retention_legacy_or_new_schema_mismatch');
    }
  }
  if (first[0].count >= 70) {
    const { rows: [rules] } = await pool.query(`
      SELECT count(*)::int AS count, count(*) FILTER (WHERE is_approved OR is_active)::int AS prematurely_enabled
      FROM ops_work_rules WHERE name IN ('Regra Padrão CLT 44h','Regra 12x36','Regra Limpeza 8h')
    `);
    console.log(`QA_WORK_RULES_REVIEW_REQUIRED=${rules.count} PREMATURELY_ENABLED=${rules.prematurely_enabled}`);
    if (rules.count !== 3 || rules.prematurely_enabled !== 0) throw new Error('qa_unreviewed_work_rules_enabled');
  }
  let auditSampleId;
  if (first[0].count >= 75) {
    // Dois catálogos distintos: operação (audit_log) e autenticação (auth_access_audit).
    // Testar ação que nem constava nas listas antigas de 075–078, e rejeição de chave inválida.
    const saved = await pool.query(`INSERT INTO audit_log (action, actor, target, meta)
      VALUES ('crm_retention_policy_create','qa_synthetic','qa-sample','{}'::jsonb) RETURNING id`);
    auditSampleId = saved.rows[0].id;
    let invalidCode;
    try {
      await pool.query("INSERT INTO audit_log (action, actor) VALUES ('wrong action;drop', 'qa_synthetic')");
    } catch (error) { invalidCode = error.code; }
    if (invalidCode !== '23514') throw new Error('qa_audit_format_constraint_not_enforced');
    const auth = await pool.query(`INSERT INTO auth_access_audit (actor_kind, actor_id, action, result)
      VALUES ('system','qa_synthetic','login','allowed') RETURNING id`);
    if (!auth.rows[0]?.id) throw new Error('qa_auth_access_audit_broken');
    console.log(`QA_AUDIT_OPERATIONAL_AND_ACCESS: valid action persisted; invalid key rejected (${invalidCode}); legacy login recorded`);
  }
  if (first[0].count >= 95) {
    const { rows: [approval] } = await pool.query(`
      SELECT (SELECT count(*)::int FROM ai_rag_indexes WHERE is_approved OR is_published OR is_active) AS rag_enabled,
             (SELECT count(*)::int FROM ai_rag_documents) AS rag_documents,
             (SELECT count(*)::int FROM pub_faq_assisted_rules WHERE is_approved OR is_published) AS faq_published,
             (SELECT count(*)::int FROM pub_page_performance_metrics) AS perf_claims,
             (SELECT count(*)::int FROM pub_accessibility_checks) AS accessibility_claims,
             (SELECT count(*)::int FROM fin_collection_policies WHERE is_approved OR is_active) AS collection_enabled
    `);
    console.log(`QA_SYNTHETIC_APPROVAL_GATE: ${JSON.stringify(approval)}`);
    if (Object.values(approval).some(v => v !== 0)) throw new Error('qa_unreviewed_seed_enabled');
  }
  if (firstExit === 0 && first[0].count === 98) {
    const tablesBefore = await pool.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'");
    const secondExit = await runMigrator(2);
    const { rows: second } = await pool.query('SELECT count(*)::int AS count FROM __migrations WHERE checksum IS NOT NULL');
    const tablesAfter = await pool.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'");
    const { rows: [auditAfter] } = await pool.query('SELECT count(*)::int AS count FROM audit_log WHERE id=$1 AND action=$2', [auditSampleId, 'crm_retention_policy_create']);
    console.log(`QA_MIGRATIONS_SECOND_EXIT=${secondExit} CHECKSUMMED=${second[0].count}/98 TABLES=${tablesBefore.rows[0].count}->${tablesAfter.rows[0].count} AUDIT_SAMPLE=${auditAfter.count}`);
    result = secondExit === 0 && second[0].count === 98 && tablesBefore.rows[0].count === tablesAfter.rows[0].count && auditAfter.count === 1 ? 0 : 1;
    if (result === 0) {
      await pool.end(); pool = undefined; // TEMPLATE exige zero conexões à base origem.
      await verifyIsolatedCloneRestore();
    }
  }
} catch (error) {
  console.error('QA_MIGRATIONS_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 400));
  result = 1;
} finally {
  try { await pool?.end(); } catch { result = 1; }
  try { await postgres.stop(); } catch (error) {
    console.error('QA_PG_STOP_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 300));
    result = 1;
  }
  await rm(directory, { recursive: true, force: true }); // somente o mkdtemp desta execução
  console.log('QA_PG_TEMP_CLEANED: true');
}
// embedded-postgres registra async-exit-hook: process.exitCode isolado pode virar 0.
process.exit(result);
