import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { evaluateEmployeeSessionRow } from '../src/server/employee-session.mjs';
import { hasPermission } from '../src/server/rbac.mjs';

function validSessionRow(overrides = {}) {
  const identity = randomUUID();
  const employee = randomUUID();
  return {
    id: randomUUID(), identity_id: identity, employee_id: employee,
    expires_at: new Date(Date.now() + 60_000), revoked_at: null,
    identity_kind: 'employee', identity_status: 'active',
    identity_epoch: 3, epoch: 3, linked_identity_id: identity,
    access_employee_id: employee, employee_status: 'ativo', display_name: 'Pessoa QA',
    must_change_password: false,
    ...overrides,
  };
}

test('L03 sessão employee exige vínculo, status ativo, epoch e sessão vigente', () => {
  assert.equal(evaluateEmployeeSessionRow(validSessionRow()).valid, true);
  assert.equal(evaluateEmployeeSessionRow(validSessionRow({ employee_status: 'em_admissao', must_change_password: true })).valid, true);
  assert.equal(evaluateEmployeeSessionRow(validSessionRow({ employee_status: 'suspenso' })).reason, 'employee_not_active');
  assert.equal(evaluateEmployeeSessionRow(validSessionRow({ epoch: 2 })).reason, 'session_superseded');
  assert.equal(evaluateEmployeeSessionRow(validSessionRow({ access_employee_id: randomUUID() })).reason, 'employee_link_invalid');
  assert.equal(evaluateEmployeeSessionRow(validSessionRow({ revoked_at: new Date() })).reason, 'session_revoked');
});

test('L03 RBAC não tem bypass por papel e own compara proprietário real', async () => {
  const actor = randomUUID();
  const owner = randomUUID();
  const db = { query: async () => ({ rows: [{ scope_type: 'own', scope_id: null }] }) };
  assert.equal(await hasPermission(db, { identityId: actor, permission: 'employees.read', resourceOwnerIdentityId: actor }), true);
  assert.equal(await hasPermission(db, { identityId: actor, permission: 'employees.read', resourceOwnerIdentityId: owner }), false);
  // Campos de papel, mesmo privilegiado, não fazem parte do contrato da decisão.
  assert.equal(await hasPermission(db, { identityId: actor, role: 'admin', permission: 'employees.read' }), false);
});

test('L03 RBAC aplica unit/contract e falha fechado quando consulta quebra', async () => {
  const actor = randomUUID();
  const unit = randomUUID();
  const contract = randomUUID();
  const scopedDb = { query: async () => ({ rows: [
    { scope_type: 'unit', scope_id: unit },
    { scope_type: 'contract', scope_id: contract },
  ] }) };
  assert.equal(await hasPermission(scopedDb, { identityId: actor, permission: 'employees.read', unitId: unit }), true);
  assert.equal(await hasPermission(scopedDb, { identityId: actor, permission: 'employees.read', unitId: randomUUID() }), false);
  assert.equal(await hasPermission(scopedDb, { identityId: actor, permission: 'employees.read', contractId: contract }), true);
  assert.equal(await hasPermission({ query: async () => { throw new Error('down'); } }, { identityId: actor, permission: 'employees.read' }), false);
});
