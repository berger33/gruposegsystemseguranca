// L01 / SEC-04, SEC-05, SEC-06 — decisões de autenticação administrativa.
// Cobre os casos negativos que o código anterior aceitava.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateStaffLogin,
  evaluateLegacyTokenPolicy,
  evaluateStaffSessionRow,
  isUuid,
  STAFF_ROLES,
  STAFF_SESSION_TTL_SECONDS,
  STAFF_SESSION_TTL_NO_MFA_SECONDS,
} from '../src/server/staff-session.mjs';

const ID = '11111111-2222-3333-4444-555555555555';

test('SEC-04: identidade sem perfil de staff NÃO recebe papel admin', () => {
  // Regressão direta: antes era `rec.role || "admin"`.
  const verdict = evaluateStaffLogin({ status: 'active', role: null, hasProfile: false });
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, 'staff_profile_missing');
  assert.equal(verdict.status, 403);
});

test('SEC-04: perfil ausente nega mesmo se o papel vier preenchido de outra fonte', () => {
  const verdict = evaluateStaffLogin({ status: 'active', role: 'admin', hasProfile: false });
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, 'staff_profile_missing');
});

test('SEC-04: somente status active autentica', () => {
  for (const status of ['pending_email', 'suspended', 'disabled', 'invited', '', null, undefined, 'ACTIVE']) {
    const verdict = evaluateStaffLogin({ status, role: 'ti', hasProfile: true });
    assert.equal(verdict.allowed, false, `status ${String(status)} não pode autenticar`);
    assert.equal(verdict.reason, 'identity_not_active');
  }
});

test('SEC-04: papel fora do catálogo é negado (fail-closed)', () => {
  for (const role of ['root', 'superadmin', '', null, 'Admin', 'cliente', 42, {}]) {
    const verdict = evaluateStaffLogin({ status: 'active', role, hasProfile: true });
    assert.equal(verdict.allowed, false, `papel ${String(role)} não pode autenticar`);
  }
});

test('SEC-04: papéis válidos autenticam e preservam o papel do banco', () => {
  for (const role of STAFF_ROLES) {
    const verdict = evaluateStaffLogin({ status: 'active', role, hasProfile: true });
    assert.equal(verdict.allowed, true);
    assert.equal(verdict.role, role);
  }
});

test('SEC-05: token compartilhado é recusado por padrão', () => {
  const policy = evaluateLegacyTokenPolicy({
    enabledFlag: undefined, provisionedStaffCount: 0, tokensConfigured: true,
  });
  assert.equal(policy.allowed, false);
  assert.equal(policy.reason, 'legacy_admin_tokens_disabled');
});

test('SEC-05: token compartilhado desliga sozinho quando existe conta individual', () => {
  const policy = evaluateLegacyTokenPolicy({
    enabledFlag: 'true', provisionedStaffCount: 1, tokensConfigured: true,
  });
  assert.equal(policy.allowed, false);
  assert.equal(policy.reason, 'legacy_admin_tokens_superseded');
});

test('SEC-05: bootstrap só vale com flag explícita, token forte e nenhuma conta ainda', () => {
  const policy = evaluateLegacyTokenPolicy({
    enabledFlag: 'true', provisionedStaffCount: 0, tokensConfigured: true,
  });
  assert.equal(policy.allowed, true);
  assert.equal(policy.reason, 'legacy_bootstrap');

  assert.equal(evaluateLegacyTokenPolicy({
    enabledFlag: 'true', provisionedStaffCount: 0, tokensConfigured: false,
  }).reason, 'admin_auth_not_configured');

  // Variações de verdade textual não podem ligar o bootstrap por acidente.
  for (const flag of ['1', 'yes', 'sim', 'TRUE ', ' true', 'on']) {
    assert.equal(evaluateLegacyTokenPolicy({
      enabledFlag: flag, provisionedStaffCount: 0, tokensConfigured: true,
    }).allowed, flag.trim().toLowerCase() === 'true', `flag ${JSON.stringify(flag)}`);
  }
});

const liveRow = (over = {}) => ({
  id: ID, identity_id: ID, role: 'ti', epoch: 3, identity_epoch: 3,
  identity_status: 'active', profile_role: 'ti', mfa_verified_at: new Date(),
  expires_at: new Date(Date.now() + 60_000), revoked_at: null, ...over,
});

test('sessão válida é aceita', () => {
  const verdict = evaluateStaffSessionRow(liveRow());
  assert.equal(verdict.valid, true);
  assert.equal(verdict.role, 'ti');
  assert.equal(verdict.identityId, ID);
});

test('sessão inexistente, revogada ou expirada é negada', () => {
  assert.equal(evaluateStaffSessionRow(null).reason, 'session_unknown');
  assert.equal(evaluateStaffSessionRow(liveRow({ revoked_at: new Date() })).reason, 'session_revoked');
  assert.equal(evaluateStaffSessionRow(liveRow({ expires_at: new Date(Date.now() - 1) })).reason, 'session_expired');
  assert.equal(evaluateStaffSessionRow(liveRow({ expires_at: null })).reason, 'session_expired');
});

test('suspender a identidade invalida a sessão já emitida', () => {
  // Cookie continua com assinatura válida; o servidor é quem decide.
  const verdict = evaluateStaffSessionRow(liveRow({ identity_status: 'suspended' }));
  assert.equal(verdict.valid, false);
  assert.equal(verdict.reason, 'identity_not_active');
});

test('remover o perfil de staff invalida a sessão já emitida', () => {
  assert.equal(evaluateStaffSessionRow(liveRow({ profile_role: null })).reason, 'staff_profile_missing');
});

test('rebaixar o papel invalida a sessão emitida com o papel antigo', () => {
  // Sessão foi criada como 'admin'; o perfil agora é 'rh'.
  const verdict = evaluateStaffSessionRow(liveRow({ role: 'admin', profile_role: 'rh' }));
  assert.equal(verdict.valid, false);
  assert.equal(verdict.reason, 'role_changed');
});

test('incrementar session_epoch invalida todas as sessões anteriores', () => {
  const verdict = evaluateStaffSessionRow(liveRow({ epoch: 3, identity_epoch: 4 }));
  assert.equal(verdict.valid, false);
  assert.equal(verdict.reason, 'session_superseded');
});

test('sessão sem MFA vive menos que sessão com MFA', () => {
  assert.ok(STAFF_SESSION_TTL_NO_MFA_SECONDS < STAFF_SESSION_TTL_SECONDS);
});

test('isUuid rejeita entradas não canônicas', () => {
  assert.equal(isUuid(ID), true);
  for (const bad of ['', null, undefined, 'abc', `${ID} `, `${ID}'--`, 123, {}]) {
    assert.equal(isUuid(bad), false, `${String(bad)} não é UUID`);
  }
});
