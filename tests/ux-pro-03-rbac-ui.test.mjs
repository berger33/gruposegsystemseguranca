import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createAdminRbacApi } from '../src/server/admin-rbac-api.mjs';

const component = await readFile(new URL('../src/app/admin/ti/RbacClient.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/RbacClient.module.css', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/server/admin-rbac-api.mjs', import.meta.url), 'utf8');
const evaluator = await readFile(new URL('../src/server/rbac.mjs', import.meta.url), 'utf8');

test('UX-PRO-03 RBAC: preserves existing list, grant, and revoke API contracts', () => {
  assert.match(component, /fetch\("\/api\/admin\/permissions"\)/);
  assert.match(component, /fetch\("\/api\/admin\/permissions", \{ method: "POST"/);
  assert.match(component, /identityId: form\.identityId\.trim\(\), permission: form\.permission, scopeType: form\.scopeType, scopeId: form\.scopeId\.trim\(\) \|\| null, reason: form\.reason\.trim\(\)/);
  assert.match(component, /fetch\(`\/api\/admin\/permissions\/\$\{permission\.id\}`, \{ method: "DELETE"/);
  assert.match(component, /body: JSON\.stringify\(\{ reason: reason\.trim\(\) \}\)/);
});

test('Access review: records decisions under the dedicated permission and reports an unknown target as 404', async () => {
  let role = 'ti';
  let originAllowed = true;
  let output;
  const statements = [];
  const target = '00000000-0000-4000-8000-000000000111';
  const api = createAdminRbacApi({
    json: (_res, status, body) => { output = { status, body }; return output; },
    readJson: async req => req.payload,
    sameOrigin: () => originAllowed,
    readAdminSession: async () => role ? { role, identityId: '00000000-0000-4000-8000-000000000222' } : null,
    getPool: () => ({ query: async (sql, values = []) => {
      statements.push({ sql, values });
      if (sql.includes('FROM auth_permissions')) return { rows: role === 'ti' || role === 'admin' ? [{ scope_type: 'global', scope_id: null }] : [] };
      if (sql.includes('FROM auth_access_reviews')) return { rows: [{ id: 'review-1', target_identity_id: target, decision: 'keep' }] };
      if (sql === 'SELECT id FROM auth_identities WHERE id=$1') return { rows: values[0] === target ? [{ id: target }] : [] };
      return { rows: [] };
    } }),
  });
  await api.handleAccessReviews({ method: 'GET' }, {}, new URL('http://test.invalid/api/admin/access-reviews'));
  assert.equal(output.status, 200);
  assert.equal(output.body.reviews[0].target_identity_id, target);

  await api.handleAccessReviews({ method: 'DELETE' }, {}, new URL('http://test.invalid/api/admin/access-reviews'));
  assert.equal(output.status, 405);
  assert.equal(output.body.error, 'method_not_allowed');

  statements.length = 0;
  await api.handleAccessReviews({ method: 'POST', payload: { targetIdentityId: target, decision: 'erase' } }, {}, new URL('http://test.invalid/api/admin/access-reviews'));
  assert.equal(output.status, 400);
  assert.equal(output.body.error, 'invalid_decision');
  assert.ok(!statements.some(({ sql }) => sql.includes('INSERT INTO auth_access_reviews')));

  originAllowed = false;
  await api.handleAccessReviews({ method: 'POST', payload: { targetIdentityId: target, decision: 'keep' } }, {}, new URL('http://test.invalid/api/admin/access-reviews'));
  assert.equal(output.status, 403);
  assert.equal(output.body.error, 'same_origin_required');
  assert.ok(!statements.some(({ sql }) => sql.includes('INSERT INTO auth_access_reviews')));
  originAllowed = true;

  statements.length = 0;
  await api.handleAccessReviews({ method: 'POST', payload: { targetIdentityId: target, decision: 'keep', notes: 'Revisão sintética' } }, {}, new URL('http://test.invalid/api/admin/access-reviews'));
  assert.equal(output.status, 201);
  assert.ok(statements.some(({ sql }) => sql.includes('INSERT INTO auth_access_reviews')));
  assert.ok(statements.some(({ sql }) => sql.includes("'access_review'")));

  statements.length = 0;
  await api.handleAccessReviews({ method: 'POST', payload: { targetIdentityId: '00000000-0000-4000-8000-000000000999', decision: 'keep' } }, {}, new URL('http://test.invalid/api/admin/access-reviews'));
  assert.equal(output.status, 404);
  assert.equal(output.body.error, 'identity_not_found');
  assert.ok(!statements.some(({ sql }) => sql.includes('INSERT INTO auth_access_reviews')));

  role = 'rh';
  await api.handleAccessReviews({ method: 'GET' }, {}, new URL('http://test.invalid/api/admin/access-reviews'));
  assert.equal(output.status, 403);
});

test('Access review: persists against the real RBAC migration and keeps the permission decision separate', async () => {
  const pg = new PGlite();
  const reviewerId = randomUUID();
  const targetId = randomUUID();
  let activeReviewerId = reviewerId;
  let output;
  try {
    await pg.exec(`
      CREATE TABLE auth_identities(id uuid PRIMARY KEY, email text NOT NULL, kind text NOT NULL);
      CREATE TABLE auth_access_audit (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_kind text NOT NULL, actor_id text,
        action text NOT NULL, target text, result text NOT NULL, detail_category text NOT NULL DEFAULT 'none'
      );
    `);
    await pg.exec(await readFile(new URL('../db/migrations/010-rbac-permissions.sql', import.meta.url), 'utf8'));
    await pg.query('INSERT INTO auth_identities(id,email,kind) VALUES($1,$2,$3),($4,$5,$6)', [reviewerId, 'reviewer@example.invalid', 'staff', targetId, 'target@example.invalid', 'staff']);
    await pg.query("INSERT INTO auth_permissions(id,identity_id,permission,scope_type,reason) VALUES($1,$2,'admin.access_review','global','Teste sintético'),($3,$4,'client.portal.read','global','Acesso preexistente de teste')", [randomUUID(), reviewerId, randomUUID(), targetId]);

    const api = createAdminRbacApi({
      json: (_res, status, body) => { output = { status, body }; return output; },
      readJson: async req => req.payload,
      sameOrigin: () => true,
      readAdminSession: async () => ({ role: 'ti', identityId: activeReviewerId }),
      getPool: () => pg,
    });

    await api.handleAccessReviews({ method: 'POST', payload: { targetIdentityId: targetId, decision: 'revoke', notes: 'Revisão de integração' } }, {}, new URL('http://test.invalid/api/admin/access-reviews'));
    assert.equal(output.status, 201);
    const reviews = await pg.query('SELECT reviewed_by,target_identity_id,decision,notes FROM auth_access_reviews');
    assert.deepEqual(reviews.rows, [{ reviewed_by: reviewerId, target_identity_id: targetId, decision: 'revoke', notes: 'Revisão de integração' }]);
    assert.equal((await pg.query('SELECT count(*)::int AS total FROM auth_permissions WHERE identity_id=$1 AND permission=$2 AND revoked_at IS NULL', [targetId, 'client.portal.read'])).rows[0].total, 1,
      'a decisão de reavaliar revogação não deve revogar automaticamente a permissão ativa');

    await api.handleAccessReviews({ method: 'GET' }, {}, new URL('http://test.invalid/api/admin/access-reviews'));
    assert.equal(output.status, 200);
    assert.equal(output.body.reviews[0].target_email, 'target@example.invalid');
    assert.equal(output.body.reviews[0].decision, 'revoke');
    assert.equal((await pg.query("SELECT count(*)::int AS total FROM auth_access_audit WHERE action='access_review' AND target=$1", [targetId])).rows[0].total, 1);

    activeReviewerId = randomUUID();
    await api.handleAccessReviews({ method: 'POST', payload: { targetIdentityId: targetId, decision: 'keep' } }, {}, new URL('http://test.invalid/api/admin/access-reviews'));
    assert.equal(output.status, 403);
    assert.equal((await pg.query('SELECT count(*)::int AS total FROM auth_access_reviews')).rows[0].total, 1);
  } finally {
    await pg.close();
  }
});

test('UX-PRO-03 RBAC: clearly identifies the accepted team scope that does not match resources', () => {
  assert.match(evaluator, /if \(row\.scope_type === 'organization'\)/);
  assert.match(evaluator, /return false;/);
  assert.match(component, /o avaliador atual não concede acesso efetivo para ele/);
  assert.match(component, /Não efetivo no avaliador atual/);
});

test('UX-PRO-03 RBAC: does not claim audit logging is a required transaction', () => {
  assert.match(api, /auth_access_audit/);
  assert.match(api, /\.catch\(\(\)=>\{\}\)/);
  assert.match(component, /tenta registrar o evento em/);
  assert.match(component, /não depende de confirmar essa escrita auxiliar/);
});

test('Access review UI: registers and lists decisions without implying automatic permission changes', () => {
  assert.match(component, /Revisão periódica de acessos/);
  assert.match(component, /fetch\("\/api\/admin\/access-reviews"/);
  assert.match(component, /decision: reviewForm\.decision/);
  assert.match(component, /não altera nem revoga permissões automaticamente/);
  assert.match(component, /não executa a mudança/);
  assert.match(component, /Reavaliar revogação/);
  assert.match(component, /Não foi possível consultar as revisões/);
  assert.match(component, /detail=\{reviewError\} onRetry=\{\(\) => void loadReviews\(\)\}/);
  assert.match(component, /Filtrar revisões carregadas por identidade, revisor, decisão ou notas/);
  assert.match(component, /review\.target_identity_id, review\.reviewer_email/);
  assert.match(component, /Nenhuma revisão corresponde ao filtro/);
});

test('UX-PRO-03 RBAC: fields are labeled and table supports narrow-screen and keyboard use', () => {
  assert.match(component, /Identidade da pessoa/);
  assert.match(component, /Acesso que será concedido/);
  assert.match(component, /Identificador do escopo/);
  assert.match(component, /Motivo da concessão/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width: 760px\)/);
});
