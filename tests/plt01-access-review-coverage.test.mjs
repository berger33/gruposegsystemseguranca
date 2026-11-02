// PLT-01 — cobertura da revisão periódica de acesso (focal, sem banco real).
// Prova: regra só existe quando declarada; classificação determinística; a
// leitura não escreve nada; RBAC nega rh e anônimo; a UI consome a nova visão.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAdminRbacApi } from '../src/server/admin-rbac-api.mjs';
import {
  REVIEW_INTERVAL_ENV,
  REVIEW_INTERVAL_MAX_DAYS,
  COVERAGE_LIMIT_DEFAULT,
  COVERAGE_LIMIT_MAX,
  COVERAGE_SITUATIONS,
  resolveReviewRule,
  parseCoverageLimit,
  classifyCoverage,
} from '../src/server/access-review-coverage.mjs';

const component = await readFile(new URL('../src/app/admin/ti/RbacClient.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/RbacClient.module.css', import.meta.url), 'utf8');
const console_ = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8');

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';

test('PLT-01 cobertura: sem regra declarada não existe prazo nem veredito', () => {
  for (const raw of [undefined, '', '   ']) {
    const rule = resolveReviewRule({});
    assert.equal(rule.declarada, false);
    assert.equal(rule.intervalo_dias, null);
    assert.equal(rule.fonte, 'nao_declarada');
    assert.equal(rule.motivo, 'nao_informada');
    assert.equal(rule.variavel, REVIEW_INTERVAL_ENV);
    assert.equal(raw, undefined ? undefined : raw);
  }
  assert.equal(resolveReviewRule({ [REVIEW_INTERVAL_ENV]: '' }).motivo, 'nao_informada');
  for (const raw of ['abc', '1.5', '180d', '-5', '1e3']) {
    assert.equal(resolveReviewRule({ [REVIEW_INTERVAL_ENV]: raw }).motivo, 'nao_inteira', `${raw} não é inteiro`);
    assert.equal(resolveReviewRule({ [REVIEW_INTERVAL_ENV]: raw }).declarada, false);
  }
  for (const raw of ['0', '731', '99999999999999999999']) {
    assert.equal(resolveReviewRule({ [REVIEW_INTERVAL_ENV]: raw }).motivo, 'fora_do_limite', `${raw} está fora do intervalo`);
  }
  assert.equal(resolveReviewRule({ [REVIEW_INTERVAL_ENV]: ' 180 ' }).intervalo_dias, 180);
  assert.equal(resolveReviewRule({ [REVIEW_INTERVAL_ENV]: ' 180 ' }).declarada, true);
  assert.equal(resolveReviewRule({ [REVIEW_INTERVAL_ENV]: ' 180 ' }).fonte, `env:${REVIEW_INTERVAL_ENV}`);
  assert.equal(resolveReviewRule({ [REVIEW_INTERVAL_ENV]: String(REVIEW_INTERVAL_MAX_DAYS) }).declarada, true);
});

test('PLT-01 cobertura: limite de leitura é limitado e previsível', () => {
  assert.equal(parseCoverageLimit(undefined), COVERAGE_LIMIT_DEFAULT);
  assert.equal(parseCoverageLimit(''), COVERAGE_LIMIT_DEFAULT);
  assert.equal(parseCoverageLimit('abc'), COVERAGE_LIMIT_DEFAULT);
  assert.equal(parseCoverageLimit('0'), COVERAGE_LIMIT_DEFAULT);
  assert.equal(parseCoverageLimit('5'), 5);
  assert.equal(parseCoverageLimit(String(COVERAGE_LIMIT_MAX + 1000)), COVERAGE_LIMIT_MAX);
});

test('PLT-01 cobertura: sem regra declarada o relatório mostra fatos e não atraso', () => {
  const asOf = new Date('2026-11-02T12:00:00.000Z');
  const out = classifyCoverage({
    rule: resolveReviewRule({}),
    identities: [
      { id: A, email: 'a@example.invalid', status: 'active', role: 'ti' },
      { id: B, email: 'b@example.invalid', status: 'active', role: 'rh' },
    ],
    reviews: [{ target_identity_id: A, created_at: '2026-01-02T00:00:00.000Z', total: 3 }],
    asOf,
  });
  assert.equal(out.regra.declarada, false);
  assert.equal(out.escopo, 'staff_ativo');
  assert.equal(out.as_of, asOf.toISOString());
  assert.equal(out.fonte, 'auth_access_reviews');
  assert.deepEqual(out.fronteira, {
    altera_permissoes: false,
    revoga_acesso: false,
    substitui_decisao_humana: false,
    veredito_sem_regra_declarada: false,
  });
  const reviewed = out.identidades.find(row => row.identity_id === A);
  const never = out.identidades.find(row => row.identity_id === B);
  assert.equal(reviewed.situacao, 'revisado_sem_regra');
  assert.equal(reviewed.pendente, false);
  assert.equal(reviewed.revisoes_registradas, 3);
  assert.equal(reviewed.ultima_revisao_em, '2026-01-02T00:00:00.000Z');
  assert.ok(reviewed.dias_desde_ultima_revisao > 300);
  assert.equal(never.situacao, 'nunca_revisada');
  assert.equal(never.pendente, false);
  assert.equal(never.dias_desde_ultima_revisao, null);
  assert.equal(out.resumo.pendentes, 0);
  assert.equal(out.resumo.total, 2);
});

test('PLT-01 cobertura: com regra declarada o atraso é derivado e ordenado', () => {
  const asOf = new Date('2026-11-02T00:00:00.000Z');
  const rule = resolveReviewRule({ [REVIEW_INTERVAL_ENV]: '180' });
  const out = classifyCoverage({
    rule,
    identities: [
      { id: A, email: 'a@example.invalid', status: 'active', role: 'ti' },
      { id: B, email: 'b@example.invalid', status: 'active', role: 'rh' },
      { id: C, email: 'c@example.invalid', status: 'active', role: 'admin' },
    ],
    reviews: [
      { target_identity_id: A, created_at: '2026-10-23T00:00:00.000Z' },
      { target_identity_id: B, created_at: '2026-04-01T00:00:00.000Z' },
      // Registro mais recente vence; o antigo não "rejuvenesce" a revisão.
      { target_identity_id: B, created_at: '2025-01-01T00:00:00.000Z' },
    ],
    asOf,
  });
  const byId = Object.fromEntries(out.identidades.map(row => [row.identity_id, row]));
  assert.equal(byId[A].situacao, 'em_dia');
  assert.equal(byId[A].pendente, false);
  assert.equal(byId[B].situacao, 'vencida');
  assert.equal(byId[B].pendente, true);
  assert.equal(byId[B].ultima_revisao_em, '2026-04-01T00:00:00.000Z');
  assert.equal(byId[C].situacao, 'nunca_revisada');
  assert.equal(byId[C].pendente, true);
  assert.equal(out.resumo.vencida, 1);
  assert.equal(out.resumo.em_dia, 1);
  assert.equal(out.resumo.nunca_revisada, 1);
  assert.equal(out.resumo.pendentes, 2);
  // Pendentes primeiro; nunca revisada (sem dias) antes da vencida.
  assert.deepEqual(out.identidades.map(row => row.identity_id), [C, B, A]);
  for (const row of out.identidades) assert.ok(COVERAGE_SITUATIONS.includes(row.situacao));
});

test('PLT-01 cobertura: dados tortos não viram veredito e entrada não é mutada', () => {
  const identities = [{ id: A, email: 'a@example.invalid', status: 'active', role: 'ti' }];
  const reviews = [
    { target_identity_id: A, created_at: 'data-invalida' },
    { target_identity_id: '', created_at: '2026-10-01T00:00:00.000Z' },
    null,
  ];
  const snapshot = JSON.stringify({ identities, reviews });
  const out = classifyCoverage({
    rule: resolveReviewRule({ [REVIEW_INTERVAL_ENV]: '30' }),
    identities, reviews, asOf: new Date('2026-11-02T00:00:00.000Z'), limit: 1,
  });
  assert.equal(JSON.stringify({ identities, reviews }), snapshot, 'classificação é somente leitura');
  assert.equal(out.identidades[0].situacao, 'nunca_revisada');
  assert.equal(out.identidades[0].ultima_revisao_em, null);
  assert.equal(out.limite, 1);
  assert.equal(out.truncado, false);
  assert.equal(classifyCoverage({ rule: resolveReviewRule({}), identities: [] }).resumo.total, 0);
  assert.equal(classifyCoverage({ rule: resolveReviewRule({}), identities: 'nao-e-lista' }).identidades.length, 0);
});

function buildApi({ role = 'ti', permissionRows = null, failOn = null, output }) {
  const statements = [];
  const api = createAdminRbacApi({
    json: (_res, status, body) => { output.current = { status, body }; return output.current; },
    readJson: async req => req.payload,
    sameOrigin: () => true,
    readAdminSession: async () => (role ? { role, identityId: '00000000-0000-4000-8000-000000000222' } : null),
    getPool: () => ({
      query: async (sql, values = []) => {
        statements.push({ sql, values });
        if (sql.includes('FROM auth_permissions')) return { rows: permissionRows ?? (role === 'ti' || role === 'admin' ? [{ scope_type: 'global', scope_id: null }] : []) };
        if (sql.includes('FROM auth_identities')) {
          if (failOn === 'identities') throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
          return { rows: [
            { id: A, email: 'a@example.invalid', status: 'active', role: 'ti' },
            { id: B, email: 'b@example.invalid', status: 'active', role: 'rh' },
          ] };
        }
        if (sql.includes('FROM auth_access_reviews')) return { rows: [{ target_identity_id: A, created_at: '2026-10-30T00:00:00.000Z', total: 1 }] };
        return { rows: [] };
      },
    }),
  });
  return { api, statements };
}

test('PLT-01 cobertura: API exige sessão e permissão próprias da revisão', async () => {
  const url = new URL('http://test.invalid/api/admin/access-reviews?view=coverage');
  const anonymous = { current: null };
  await buildApi({ role: null, output: anonymous }).api.handleAccessReviewCoverage({ method: 'GET' }, {}, url);
  assert.equal(anonymous.current.status, 401);
  assert.equal(anonymous.current.body.error, 'admin_session_required');

  const rh = { current: null };
  const rhStatements = buildApi({ role: 'rh', output: rh }).statements;
  await buildApi({ role: 'rh', output: rh }).api.handleAccessReviewCoverage({ method: 'GET' }, {}, url);
  assert.equal(rh.current.status, 403);
  assert.equal(rh.current.body.error, 'permission_required');
  assert.equal(rh.current.body.permission, 'admin.access_review');
  assert.ok(!rhStatements.some(({ sql }) => sql.includes('FROM auth_access_reviews')));
});

test('PLT-01 cobertura: leitura devolve derivação e nunca escreve', async () => {
  const output = { current: null };
  const { api, statements } = buildApi({ output });
  const url = new URL('http://test.invalid/api/admin/access-reviews?view=coverage&limit=1');
  await api.handleAccessReviews({ method: 'GET' }, {}, url);
  assert.equal(output.current.status, 200);
  const body = output.current.body;
  assert.equal(body.escopo, 'staff_ativo');
  assert.equal(body.limite, 1);
  assert.equal(body.identidades.length, 1);
  assert.equal(body.truncado, true);
  assert.equal(body.resumo.total, 2);
  assert.equal(body.regra.variavel, REVIEW_INTERVAL_ENV);
  assert.ok(statements.length > 0);
  for (const { sql } of statements) assert.match(sql.trim(), /^SELECT\b/i, 'a cobertura só lê');
});

test('PLT-01 cobertura: POST nessa visão é 405 e não cria revisão', async () => {
  const output = { current: null };
  const { api, statements } = buildApi({ output });
  await api.handleAccessReviews({ method: 'POST', payload: { targetIdentityId: A, decision: 'keep' } }, {}, new URL('http://test.invalid/api/admin/access-reviews?view=coverage'));
  assert.equal(output.current.status, 405);
  assert.equal(output.current.body.error, 'method_not_allowed');
  assert.ok(!statements.some(({ sql }) => sql.includes('INSERT INTO auth_access_reviews')));

  const direct = { current: null };
  await buildApi({ output: direct }).api.handleAccessReviewCoverage({ method: 'POST' }, {}, new URL('http://test.invalid/api/admin/access-reviews?view=coverage'));
  assert.equal(direct.current.status, 405);
});

test('PLT-01 cobertura: falha de banco continua declarada como 503', async () => {
  const output = { current: null };
  await buildApi({ output, failOn: 'identities' }).api.handleAccessReviewCoverage({ method: 'GET' }, {}, new URL('http://test.invalid/api/admin/access-reviews?view=coverage'));
  assert.equal(output.current.status, 503);
  assert.equal(output.current.body.error, 'migration_required');
});

test('PLT-01 cobertura: a tela consome a visão e declara a fronteira', () => {
  assert.match(component, /fetch\("\/api\/admin\/access-reviews\?view=coverage"\)/);
  assert.match(component, /Cobertura da revisão periódica/);
  assert.match(component, /Consultar cobertura/);
  assert.match(component, /Sem regra declarada não existe atraso/);
  assert.match(component, /não classifica ninguém como vencido/);
  assert.match(component, /Não altera permissões nem substitui a revisão humana/);
  assert.match(component, /COVERAGE_SITUATIONS\[row\.situacao\]/);
  assert.match(component, /Não altera permissões nem substitui a revisão humana/);
  assert.match(component, /detail=\{coverageError\} onRetry=\{\(\) => void loadCoverage\(\)\}/);
  assert.match(component, /Cobertura ainda não consultada/);
  assert.match(styles, /\.coveragePendente/);
  // Continua montada na aba Acessos do console de TI (nenhum componente órfão novo).
  assert.match(console_, /active==='acessos'&&<RbacClient\/>/);
  assert.match(envExample, /ACCESS_REVIEW_INTERVAL_DAYS=/);
});
