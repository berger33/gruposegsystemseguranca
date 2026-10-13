import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureAdminAccount, ADMIN_EMAIL, ADMIN_SECTOR } from '../src/admin-users.mjs';
import { userIdFor } from '../src/demo-users.mjs';
import { verifyPassword } from '../src/auth.mjs';

test('cria conta de gestão e reinicialização não altera credenciais', () => {
  const state = { users: [] };
  const created = ensureAdminAccount(state, { email: ADMIN_EMAIL, password: 'senha-inicial' });
  assert.equal(created.created, true);
  assert.equal(created.user.kind, 'gestao');
  assert.equal(created.user.sector, ADMIN_SECTOR);
  assert.equal(verifyPassword('senha-inicial', created.user), true);

  const snapshot = structuredClone(created.user);
  const again = ensureAdminAccount(state, { email: ADMIN_EMAIL, password: 'outra-senha' });
  assert.equal(again.created, false);
  assert.deepEqual(again.user, snapshot);
});

test('colisão com conta preexistente falha sem promover nem alterar a conta', () => {
  const email = ADMIN_EMAIL;
  const account = {
    id: userIdFor(email), name: 'Conta de demonstração', email,
    sector: 'funcionario', kind: 'usuario', salt: 'salt-original', hash: 'hash-original',
  };
  const state = { users: [structuredClone(account)] };

  assert.throws(() => ensureAdminAccount(state, { email, password: 'senha-admin' }), /Conflito na conta de gestão/);
  assert.deepEqual(state.users, [account]);
});

test('colisão de ID com e-mail diferente falha sem alterar usuário', () => {
  const email = ADMIN_EMAIL;
  const account = {
    id: userIdFor(email), name: 'Conta existente', email: 'outra-pessoa@exemplo.com',
    sector: 'rh', kind: 'usuario', salt: 'salt-original', hash: 'hash-original',
  };
  const state = { users: [structuredClone(account)] };

  assert.throws(() => ensureAdminAccount(state, { email, password: 'senha-admin' }), /Conflito na conta de gestão/);
  assert.deepEqual(state.users, [account]);
});
