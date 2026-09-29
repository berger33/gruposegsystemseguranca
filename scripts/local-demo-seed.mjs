// QA-HOM-008 / PLT-01: only called by the isolated persistent local-demo
// bootstrap. Never import into migrations or a normal application startup.
import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from '../src/lib/client-auth-core.mjs';

export async function seedFreshDemo(pool, installationId) {
  const staff = ['ti', 'rh', 'admin'].map(role => ({
    role, email: `${role}.demo@example.invalid`, password: randomBytes(24).toString('base64url'), id: randomUUID(),
  }));
  const accountA = randomUUID(), accountB = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // This marker is *not* created by the migrator; it only exists in the new
    // isolated cluster. No upsert / reset / password regeneration on restart.
    await client.query(`CREATE TABLE seg_demo_bootstrap (
      installation_id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await client.query('INSERT INTO seg_demo_bootstrap (installation_id) VALUES ($1)', [installationId]);
    for (const item of staff) {
      await client.query(`INSERT INTO auth_identities (id,kind,email,display_name,status)
        VALUES ($1,'staff',$2,$3,'active')`, [item.id, item.email, `DEMONSTRAÇÃO FICTÍCIA ${item.role.toUpperCase()}`]);
      await client.query('INSERT INTO auth_credentials (identity_id,password_hash) VALUES ($1,$2)',
        [item.id, await hashPassword(item.password)]);
      await client.query(`INSERT INTO auth_staff_profiles (identity_id,role,assigned_by)
        VALUES ($1,$2,'admin_system')`, [item.id, item.role]);
    }
    for (const [id, name] of [[accountA, 'DEMO FICTÍCIA — Empresa A'], [accountB, 'DEMO FICTÍCIA — Empresa B']]) {
      await client.query(`INSERT INTO client_accounts (id,display_name,status,created_by,notes)
        VALUES ($1,$2,'active','ti','Dados inteiramente sintéticos; não representam clientes reais.')`, [id, name]);
    }
    await client.query(`INSERT INTO client_contracts (id,client_account_id,title,service,status,summary,created_by)
      VALUES ($1,$2,'DEMO — Contrato fictício A','Portaria fictícia','planned',
        'Simulação sem preço, assinatura, prestação real ou validade jurídica.','ti')`, [randomUUID(), accountA]);
    await client.query('COMMIT');
    return staff.map(({ role, email, password }) => ({ role, email, password }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
