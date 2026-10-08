import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('migração 180 concede RH operacional ao Marcelo sem liberar saúde e revoga no downgrade', async () => {
  const pg = new PGlite();
  const identity = randomUUID();
  try {
    await pg.exec(`
      CREATE TABLE auth_identities(id uuid PRIMARY KEY);
      CREATE TABLE auth_staff_profiles(identity_id uuid PRIMARY KEY REFERENCES auth_identities(id), role text NOT NULL);
      CREATE TABLE auth_permissions(
        id uuid PRIMARY KEY, identity_id uuid NOT NULL REFERENCES auth_identities(id), permission text NOT NULL,
        scope_type text NOT NULL, scope_id uuid, granted_by uuid REFERENCES auth_identities(id),
        granted_by_role text, reason text NOT NULL, created_at timestamptz DEFAULT now(),
        revoked_at timestamptz, revoked_by uuid REFERENCES auth_identities(id), revoke_reason text
      );
      CREATE UNIQUE INDEX auth_permissions_active_unique
        ON auth_permissions(identity_id,permission,scope_type,COALESCE(scope_id,'00000000-0000-0000-0000-000000000000'::uuid))
        WHERE revoked_at IS NULL;
    `);
    await pg.exec(await readFile(new URL('../db/migrations/180-marcelo-rh-access.sql', import.meta.url), 'utf8'));
    await pg.query('INSERT INTO auth_identities(id) VALUES($1)', [identity]);
    await pg.query("INSERT INTO auth_staff_profiles(identity_id,role) VALUES($1,'marcelo')", [identity]);
    const granted = await pg.query('SELECT permission,scope_type,reason FROM auth_permissions WHERE identity_id=$1 AND revoked_at IS NULL ORDER BY permission', [identity]);
    assert.deepEqual(granted.rows.map(row => row.permission), ['employees.read', 'employees.write']);
    assert.ok(granted.rows.every(row => row.scope_type === 'organization' && row.reason === 'Acesso operacional de RH do papel Marcelo'));
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM auth_permissions WHERE identity_id=$1 AND permission LIKE 'employees.health.%' AND revoked_at IS NULL", [identity])).rows[0].n, 0);

    await pg.query("INSERT INTO auth_permissions(id,identity_id,permission,scope_type,reason) VALUES($1,$2,'employees.health.read','organization','Concessão explícita de teste')", [randomUUID(), identity]);
    await pg.query("UPDATE auth_staff_profiles SET role='comercial' WHERE identity_id=$1", [identity]);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM auth_permissions WHERE identity_id=$1 AND reason='Acesso operacional de RH do papel Marcelo' AND revoked_at IS NULL", [identity])).rows[0].n, 0);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM auth_permissions WHERE identity_id=$1 AND permission='employees.health.read' AND revoked_at IS NULL", [identity])).rows[0].n, 1);
  } finally {
    await pg.close();
  }
});
