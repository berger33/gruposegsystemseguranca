// F03 / QA-HOM-008: synthetic mass only for the isolated persistent local demo.
// Never import this module into migrations or normal application startup. The SQL
// guard below requires the dedicated database name, an empty business database
// on first run, and the installation UUID owned by local-demo.mjs.
import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from '../src/lib/client-auth-core.mjs';
import { seedShowcase } from './local-demo-showcase.mjs';

const SEED_VERSION = 2;
const DEMO_DATABASE = 'seg_demo_local';
const DEMO_MODE = 'isolated-local-demo';
const password = () => randomBytes(24).toString('base64url');

function identity(kind, label, email, extra = {}) {
  return { id: randomUUID(), kind, label, email, password: password(), ...extra };
}

/**
 * Seeds the minimum F03 actors and tenant boundaries in one transaction.
 *
 * Replay is deliberately a no-op: credentials are never rotated or printed
 * again. A failed first run rolls back marker and data together. This function
 * refuses a database other than seg_demo_local and refuses to adopt a database
 * that already contains identities/accounts/employees.
 */
export async function seedFreshDemo(pool, installationId, authorization = {}) {
  if (authorization.mode !== DEMO_MODE || authorization.databaseName !== DEMO_DATABASE ||
      typeof installationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(installationId)) {
    throw new Error('demo_seed_authorization_refused');
  }

  const staff = ['ti', 'rh', 'admin', 'marcelo', 'comercial', 'financeiro', 'supervisor'].map(role =>
    identity('staff', role, `${role}.demo@example.invalid`, { role }));
  const clients = [
    identity('client', 'cliente_a', 'cliente.a.demo@example.invalid'),
    identity('client', 'cliente_b', 'cliente.b.demo@example.invalid'),
  ];
  const employee = identity('employee', 'funcionario', 'funcionario.demo@example.invalid');
  const accountA = randomUUID(), accountB = randomUUID();
  const contractA = randomUUID(), contractB = randomUUID(), employeeId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialises first run and replay without relying on a process-local lock.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('seg_demo_f03_seed_v1'))");
    const { rows: [database] } = await client.query('SELECT current_database() AS name');
    if (database?.name !== DEMO_DATABASE) throw new Error('demo_seed_database_refused');

    await client.query(`CREATE TABLE IF NOT EXISTS seg_demo_bootstrap (
      installation_id UUID PRIMARY KEY,
      seed_version INTEGER NOT NULL CHECK (seed_version >= 1),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    // Compatibility is fail-closed. This script does not silently upgrade an
    // older demo marker because that could create and print new credentials on
    // an installation the operator already uses.
    const columns = await client.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='seg_demo_bootstrap'`);
    if (!columns.rows.some(row => row.column_name === 'seed_version')) {
      throw new Error('demo_seed_legacy_marker_requires_new_isolated_installation');
    }
    const marker = await client.query('SELECT installation_id, seed_version FROM seg_demo_bootstrap');
    if (marker.rowCount) {
      if (marker.rowCount !== 1 || marker.rows[0].installation_id !== installationId ||
          marker.rows[0].seed_version !== SEED_VERSION) throw new Error('demo_seed_marker_mismatch');
      await client.query('COMMIT');
      return { credentials: [], replay: true, seedVersion: SEED_VERSION };
    }

    const { rows: [existing] } = await client.query(`SELECT
      (SELECT count(*)::int FROM auth_identities) AS identities,
      (SELECT count(*)::int FROM client_accounts) AS accounts,
      (SELECT count(*)::int FROM hr_employees) AS employees`);
    if (existing.identities || existing.accounts || existing.employees) {
      throw new Error('demo_seed_nonempty_database_refused');
    }
    await client.query('INSERT INTO seg_demo_bootstrap (installation_id,seed_version) VALUES ($1,$2)',
      [installationId, SEED_VERSION]);

    for (const item of [...staff, ...clients, employee]) {
      await client.query(`INSERT INTO auth_identities
        (id,kind,email,display_name,status,verification_method,verified_at)
        VALUES ($1,$2,$3,$4,'active','manual',NOW())`,
      [item.id, item.kind, item.email, `DEMONSTRAÇÃO FICTÍCIA — ${item.label.toUpperCase()}`]);
      await client.query('INSERT INTO auth_credentials (identity_id,password_hash) VALUES ($1,$2)',
        [item.id, await hashPassword(item.password)]);
    }
    for (const item of staff) {
      await client.query(`INSERT INTO auth_staff_profiles (identity_id,role,assigned_by)
        VALUES ($1,$2,'admin_system')`, [item.id, item.role]);
    }

    for (const [id, name] of [[accountA, 'DEMO FICTÍCIA — Empresa A'], [accountB, 'DEMO FICTÍCIA — Empresa B']]) {
      await client.query(`INSERT INTO client_accounts (id,display_name,status,created_by,notes)
        VALUES ($1,$2,'active','ti','Dados inteiramente sintéticos; não representam clientes reais.')`, [id, name]);
    }
    for (const [id, account, suffix] of [[contractA, accountA, 'A'], [contractB, accountB, 'B']]) {
      await client.query(`INSERT INTO client_contracts
        (id,client_account_id,title,service,status,starts_on,summary,created_by)
        VALUES ($1,$2,$3,'Portaria fictícia','planned',CURRENT_DATE,$4,'ti')`,
      [id, account, `DEMO — Contrato fictício ${suffix}`,
        'Simulação sem preço, assinatura, prestação real ou validade jurídica.']);
    }
    for (const [person, account] of [[clients[0], accountA], [clients[1], accountB]]) {
      await client.query(`INSERT INTO client_access_grants
        (id,identity_id,client_account_id,scope_note,reason,granted_by)
        VALUES ($1,$2,$3,'Escopo exclusivo da empresa fictícia','Bootstrap F03 sintético e isolado','ti')`,
      [randomUUID(), person.id, account]);
    }

    await client.query(`INSERT INTO hr_employees
      (id,matricula,identity_id,display_name,admission_date,status,employment_type,cargo,empregador,
       filial,lotacao,contact_email,notes,created_by,created_by_id)
      VALUES ($1,'DEMO-0001',$2,'Funcionário Fictício F03',CURRENT_DATE,'ativo','clt','Vigilante',
        'Empresa empregadora fictícia','Filial demonstração','Posto fictício A',$3,
        'Massa sintética; sem CPF, remuneração ou dado pessoal real.','bootstrap_f03',$4)`,
    [employeeId, employee.id, employee.email, staff.find(item => item.role === 'rh').id]);
    const rhIdentity = staff.find(item => item.role === 'rh').id;
    await client.query(`INSERT INTO auth_employee_access
      (identity_id,employee_id,must_change_password,provisioned_by,password_changed_at)
      VALUES ($1,$2,FALSE,$3,NOW())`, [employee.id, employeeId, rhIdentity]);
    await client.query(`INSERT INTO auth_permissions
      (id,identity_id,permission,scope_type,scope_id,granted_by,granted_by_role,reason)
      VALUES ($1,$2,'employees.self_service','own',NULL,$3,'rh','Bootstrap F03 sintético: somente autoatendimento próprio')`,
    [randomUUID(), employee.id, rhIdentity]);

    const showcase = await seedShowcase(client, {
      staff: staff.map(({ role, id }) => ({ role, id })),
      employeeId,
      employeeIdentityId: employee.id,
      accounts: [accountA, accountB],
    });

    await client.query(`INSERT INTO audit_log (action,actor,target,meta)
      VALUES ('demo_f03_seed','system',$1,$2::jsonb)`, [installationId, JSON.stringify({
      seedVersion: SEED_VERSION, synthetic: true, staff: staff.length, clients: clients.length,
      employees: 1, accounts: 2, contracts: 2, showcase,
    })]);
    await client.query('COMMIT');
    return {
      credentials: [...staff, ...clients, employee].map(({ label, email, password: secret }) =>
        ({ role: label, email, password: secret })),
      replay: false,
      seedVersion: SEED_VERSION,
      showcase,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
