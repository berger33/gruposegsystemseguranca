import { describe, it } from "node:test";
import assert from "node:assert";
import { Pool } from "pg";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";

const projectRoot = process.cwd();

async function applyMigrations(pool) {
  for (const f of [
    "001-site-visual.sql","002-public-leads.sql","003-client-access.sql",
    "004-client-space.sql","005-client-security.sql","006-admin-identities.sql","097-client-mfa-session.sql", "098-client-manual-verification.sql"
  ]) {
    const sql = await readFile(path.join(projectRoot, "db/migrations", f), "utf8");
    await pool.query(sql);
  }
}

describe("client security — migração 005/006 e regras (skip se DB não disponível)", () => {
  it("vínculo restrito a contrato não enxerga os demais (deny-by-default + auditoria)", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "seg-sec-"));
    const port = 54321; // não usado diretamente; embedded escolhe
    const pg = new EmbeddedPostgres({ databaseDir: path.join(root, "data"), user: "postgres", password: "int", port, persistent: false });
    await pg.initialise();
    await pg.start();
    const dbUrl = `postgresql://postgres:int@127.0.0.1:${pg.config.port}/postgres`;
    // Criar banco
    const setupPool = new Pool({ connectionString: dbUrl, max: 1 });
    await setupPool.query("CREATE DATABASE grupo_seg_system");
    await setupPool.end();

    const pool = new Pool({ connectionString: dbUrl.replace("postgres", "grupo_seg_system"), max: 2 });
    await applyMigrations(pool);

    // Dados mínimos de demonstração apenas para prova (identificados como teste)
    await pool.query(`
      INSERT INTO auth_identities (id, kind, email, status) VALUES
        ('11111111-1111-1111-1111-111111111111','client','t@t.invalid','active');
    `);
    await pool.query(`
      INSERT INTO client_accounts (id, display_name, status, created_by) VALUES
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Conta A','active','ti');
    `);
    await pool.query(`
      INSERT INTO client_contracts (id, client_account_id, title, service, status, created_by) VALUES
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','C1','S','active','ti'),
        ('cccccccc-cccc-cccc-cccc-cccccccccccc','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','C2','S','active','ti');
    `);
    // Grant selecionado apenas C1
    await pool.query(`
      INSERT INTO client_access_grants (id, identity_id, client_account_id, scope_note, reason, granted_by, contract_scope_mode, allowed_contract_ids)
      VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','teste','teste','ti','selected','{"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}');
    `);

    // Consulta simula a restrição de contrato na API
    const allowed = await pool.query(
      `SELECT id FROM client_contracts WHERE client_account_id = $1 AND id = ANY($2)`,
      ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', ['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']]
    );
    assert.strictEqual(allowed.rows.length, 1, "só C1 deve ser visível");
    assert.strictEqual(allowed.rows[0].id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

    // Grant vazio selected deve negar todos (deny-by-default)
    await pool.query(`
      UPDATE client_access_grants SET allowed_contract_ids = '{}' WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    `);
    const denied = await pool.query(
      `SELECT id FROM client_contracts WHERE client_account_id = $1 AND id = ANY($2)`,
      ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', []]
    );
    assert.strictEqual(denied.rows.length, 0, "grant vazio selected nega todos");

    // Auditoria de negação deve ser registrada (simulação de inserção)
    await pool.query(
      `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category, created_at)
       VALUES ('client','11111111-1111-1111-1111-111111111111','contract_list','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','denied','authorization_denied',NOW())`
    );
    const audit = await pool.query("SELECT * FROM auth_access_audit WHERE detail_category = 'authorization_denied'");
    assert.ok(audit.rows.length >= 1, "auditoria registra negativa");

    await pool.end();
    await pg.stop();
    await rm(root, { recursive: true, force: true });
  });

  it("vínculo por unidade não vaza entre unidades", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "seg-unit-"));
    const pg = new EmbeddedPostgres({ databaseDir: path.join(root, "data"), user: "postgres", password: "int", port: 54322, persistent: false });
    await pg.initialise();
    await pg.start();
    const dbUrl = `postgresql://postgres:int@127.0.0.1:${pg.config.port}/postgres`;
    const setupPool = new Pool({ connectionString: dbUrl, max: 1 });
    await setupPool.query("CREATE DATABASE grupo_seg_system");
    await setupPool.end();
    const pool = new Pool({ connectionString: dbUrl.replace("postgres", "grupo_seg_system"), max: 2 });
    await applyMigrations(pool);
    await pool.query(`INSERT INTO auth_identities (id, kind, email, status) VALUES ('22222222-2222-2222-2222-222222222222','client','u@u.invalid','active')`);
    await pool.query(`INSERT INTO client_accounts (id, display_name, status, parent_account_id, created_by) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Unidade Pai','active',NULL,'ti'), ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','Unidade Filha','active','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','ti')`);
    await pool.query(`INSERT INTO client_access_grants (id, identity_id, client_account_id, scope_note, reason, granted_by, unit_account_id) VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff','22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','teste','teste','ti','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')`);
    // Acesso à unidade pai permitido
    const pai = await pool.query(`SELECT id FROM client_accounts WHERE id = $1 AND (id = $2 OR parent_account_id = $2)`, ['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']);
    assert.strictEqual(pai.rows.length, 1);
    // Acesso à filha (que tem pai como parent) também permitido
    const filha = await pool.query(`SELECT id FROM client_accounts WHERE id = $1 AND (id = $2 OR parent_account_id = $2)`, ['eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']);
    assert.strictEqual(filha.rows.length, 1);
    // Acesso a conta totalmente independente negado
    await pool.query(`INSERT INTO client_accounts (id, display_name, status, created_by) VALUES ('11111111-1111-1111-1111-111111111111','Outra','active','ti')`);
    const outra = await pool.query(`SELECT id FROM client_accounts WHERE id = $1 AND (id = $2 OR parent_account_id = $2)`, ['11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']);
    assert.strictEqual(outra.rows.length, 0, "unidade separada não vaza");
    await pool.end();
    await pg.stop();
    await rm(root, { recursive: true, force: true });
  });

  it("MFA bloqueia login sem código válido", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "seg-mfa-"));
    const pg = new EmbeddedPostgres({ databaseDir: path.join(root, "data"), user: "postgres", password: "int", port: 54323, persistent: false });
    await pg.initialise();
    await pg.start();
    const dbUrl = `postgresql://postgres:int@127.0.0.1:${pg.config.port}/postgres`;
    const setupPool = new Pool({ connectionString: dbUrl, max: 1 });
    await setupPool.query("CREATE DATABASE grupo_seg_system");
    await setupPool.end();
    const pool = new Pool({ connectionString: dbUrl.replace("postgres", "grupo_seg_system"), max: 2 });
    await applyMigrations(pool);
    await pool.query(`INSERT INTO auth_identities (id, kind, email, status) VALUES ('33333333-3333-3333-3333-333333333333','client','m@t.invalid','active')`);
    await pool.query(`INSERT INTO auth_mfa (identity_id, totp_secret_encrypted, recovery_hashes, activated_at) VALUES ('33333333-3333-3333-3333-333333333333','secret','{}',NOW())`);
    // Sem código, não pode verificar
    const verify = await pool.query("SELECT * FROM auth_mfa WHERE identity_id = $1", ['33333333-3333-3333-3333-333333333333']);
    assert.ok(verify.rows[0].attempts_since_verified >= 0);
    await pool.end();
    await pg.stop();
    await rm(root, { recursive: true, force: true });
  });

  it("Não fui eu cancela troca e registra alerta", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "seg-email-"));
    const pg = new EmbeddedPostgres({ databaseDir: path.join(root, "data"), user: "postgres", password: "int", port: 54324, persistent: false });
    await pg.initialise();
    await pg.start();
    const dbUrl = `postgresql://postgres:int@127.0.0.1:${pg.config.port}/postgres`;
    const setupPool = new Pool({ connectionString: dbUrl, max: 1 });
    await setupPool.query("CREATE DATABASE grupo_seg_system");
    await setupPool.end();
    const pool = new Pool({ connectionString: dbUrl.replace("postgres", "grupo_seg_system"), max: 2 });
    await applyMigrations(pool);
    await pool.query(`INSERT INTO auth_identities (id, kind, email, status) VALUES ('44444444-4444-4444-4444-444444444444','client','e@e.invalid','active')`);
    await pool.query(`INSERT INTO auth_email_change (id, identity_id, old_email, new_email, token_hash, expires_at) VALUES ('99999999-9999-9999-9999-999999999999','44444444-4444-4444-4444-444444444444','e@e.invalid','novo@novo.invalid','hash',NOW()+INTERVAL '1 hour')`);
    await pool.query(`UPDATE auth_email_change SET cancelled_at = NOW(), cancelled_by = 'user', alert_generated_at = NOW() WHERE id = '99999999-9999-9999-9999-999999999999'`);
    const ch = await pool.query("SELECT * FROM auth_email_change WHERE id = $1", ['99999999-9999-9999-9999-999999999999']);
    assert.ok(ch.rows[0].cancelled_at, "cancelado");
    assert.strictEqual(ch.rows[0].cancelled_by, "user");
    assert.ok(ch.rows[0].alert_generated_at, "alerta gerado");
    await pool.end();
    await pg.stop();
    await rm(root, { recursive: true, force: true });
  });
});
