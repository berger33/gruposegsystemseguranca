// PLT-09 — privacidade: focal hermético no `test:unit`.
//
// Invariante provado aqui: as três superfícies vivas (`abas privacidade`,
// `retencao`, `lgpd`) preservam o contrato que já existia — inventário e
// política com vocabulário fechado, aprovação de admin antes de publicar,
// `is_published` derivado do estado, pedido LGPD com transição e verificação de
// identidade, retenção/descarte declarativos — e recusam em 400/405 o que o
// banco derrubaria em 503 ou o que era aceito em silêncio.
//
// RED medido em 02/11 (sonda descartável, sem editar o repositório):
//   • escrita de inventário respondia 403 para `admin` E `ti` (bug de
//     precedência `await readAdminSession(req)?.role`);
//   • id torto nos seis detalhes caía no 404 do roteador;
//   • POST/DELETE nos logs de descarte e DELETE no detalhe do job respondiam 200;
//   • filtro fora do enum era ignorado e a lista inteira voltava como filtrada;
//   • `contact_email` curto e e-mail do titular `a@b` viravam 503;
//   • política publicada continuava `is_published=true` ao ser arquivada/rejeitada;
//   • `total_scanned` era "políticas × 10" e `total_expired` era sempre 0.
//
// Não promove aba, não publica política de verdade, não abre a borda legada de
// RH, não substitui superfície e não registra aceite humano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createPrivacyApi } from '../src/server/privacy-api.mjs';
import { createLgpdRequestApi } from '../src/server/lgpd-request-api.mjs';
import { createRetentionApi } from '../src/server/retention-api.mjs';
import {
  PRIVACY_DATA_CATEGORIES,
  PRIVACY_LEGAL_BASES,
  PRIVACY_POLICY_STATUSES,
  PRIVACY_READ_BOUNDARY,
  LGPD_REQUEST_TYPES,
  LGPD_REQUEST_STATUSES,
  LGPD_VERIFICATION_METHODS,
  LGPD_DECLARED_DUE_DAYS,
  LGPD_DUE_DAYS_LEGALLY_VALIDATED,
  RETENTION_EXCEPTION_STATUSES,
  RETENTION_DISPOSAL_METHODS,
  RETENTION_JOB_STATUSES,
  RETENTION_ALLOWED_TRANSITIONS,
  LGPD_ALLOWED_TRANSITIONS,
  isPrivacyReadMethod,
  isPublishedStatus,
  policyPublishProblem,
  contactEmailProblem,
  requesterEmailProblem,
  disposalCounters,
  parseDataCategory,
  parseLegalBasis,
  parsePolicyStatus,
  parseLgpdRequestType,
  parseLgpdRequestStatus,
  parseLgpdVerificationMethod,
  parseRetentionExceptionStatus,
  parseRetentionDisposalMethod,
  canTransitionLgpd,
  canTransitionRetentionException,
  uuidRe,
  sanitizePrivacyText,
} from '../src/server/privacy-read-contract.mjs';

const privacySource = await readFile(new URL('../src/server/privacy-api.mjs', import.meta.url), 'utf8');
const retentionSource = await readFile(new URL('../src/server/retention-api.mjs', import.meta.url), 'utf8');
const lgpdSource = await readFile(new URL('../src/server/lgpd-request-api.mjs', import.meta.url), 'utf8');
const serverSource = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const consoleSource = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const migration047 = await readFile(new URL('../db/migrations/047-plt09-privacy.sql', import.meta.url), 'utf8');
const migration048 = await readFile(new URL('../db/migrations/048-plt10-lgpd-requests.sql', import.meta.url), 'utf8');
const migration049 = await readFile(new URL('../db/migrations/049-plt11-retention.sql', import.meta.url), 'utf8');

const POLICY_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const JOB_ID = '33333333-3333-4333-8333-333333333333';
const EXCEPTION_ID = '44444444-4444-4444-8444-444444444444';

function enumValues(sql, typeName) {
  const match = sql.match(new RegExp(`CREATE TYPE ${typeName} AS ENUM \\(([^)]*)\\)`));
  assert.ok(match, `a migração precisa declarar ${typeName}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
}

function fakePool({ rows = {}, truthy = [], onQuery } = {}) {
  const statements = [];
  return {
    statements,
    async query(sql, values = []) {
      const text = String(sql).trim();
      statements.push({ sql: text, values });
      if (onQuery) {
        const forced = onQuery(text, values);
        if (forced !== undefined) return forced;
      }
      if (truthy.some(fragment => text.includes(fragment))) return { rows: [], rowCount: 0 };
      for (const [fragment, result] of Object.entries(rows)) {
        if (text.includes(fragment)) return typeof result === 'function' ? result(values) : result;
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

function privacyApiWith({ pool, role = 'ti', session = true, body = {} } = {}) {
  const output = [];
  const api = createPrivacyApi({
    json: (_res, status, payload, headers = {}) => {
      output.push({ status, payload, headers });
      return { status, payload, headers };
    },
    readJson: async () => body,
    sameOrigin: () => true,
    getPool: () => pool,
    readAdminSession: async () => (session ? { role, identityId: null } : null),
  });
  return { api, output, last: () => output.at(-1) };
}

function lgpdApiWith({ pool, role = 'ti', session = true, body = {} } = {}) {
  const output = [];
  const api = createLgpdRequestApi({
    json: (_res, status, payload, headers = {}) => {
      output.push({ status, payload, headers });
      return { status, payload, headers };
    },
    readJson: async () => body,
    sameOrigin: () => true,
    getPool: () => pool,
    readAdminSession: async () => (session ? { role, identityId: null } : null),
  });
  return { api, output, last: () => output.at(-1) };
}

function retentionApiWith({ pool, role = 'ti', session = true, body = {} } = {}) {
  const output = [];
  const api = createRetentionApi({
    pool,
    auditLog: async () => {},
    sameOrigin: () => true,
    requireSession: async () => (session ? { role, username: `qa-${role}` } : null),
    requireRole: (sess, roles) => roles.includes(sess.role),
  });
  const res = {
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; return this; },
    end(raw) { output.push({ status: this.status, headers: this.headers, body: raw ? JSON.parse(raw) : null }); },
  };
  const request = (method, url, payload) => {
    const stream = Readable.from(payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))]);
    stream.method = method;
    stream.url = url;
    stream.headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' };
    return stream;
  };
  return { api, res, output, request, last: () => output.at(-1), body };
}

const getRequest = url => ({ method: 'GET', url, headers: { host: '127.0.0.1:3000' } });

// ---------------------------------------------------------------- contrato ---

test('PLT-09 contrato: os vocabulários fechados são exatamente os enums das migrações 047–049', () => {
  assert.deepEqual([...PRIVACY_DATA_CATEGORIES], enumValues(migration047, 'crm_privacy_data_category'));
  assert.deepEqual([...PRIVACY_LEGAL_BASES], enumValues(migration047, 'crm_privacy_legal_basis'));
  assert.deepEqual([...PRIVACY_POLICY_STATUSES], enumValues(migration047, 'crm_privacy_policy_status'));
  assert.deepEqual([...LGPD_REQUEST_TYPES], enumValues(migration048, 'crm_lgpd_request_type'));
  assert.deepEqual([...LGPD_REQUEST_STATUSES], enumValues(migration048, 'crm_lgpd_request_status'));
  assert.deepEqual([...LGPD_VERIFICATION_METHODS], enumValues(migration048, 'crm_lgpd_verification_method'));
  assert.deepEqual([...RETENTION_EXCEPTION_STATUSES], enumValues(migration049, 'retention_exception_status'));
  assert.deepEqual([...RETENTION_DISPOSAL_METHODS], enumValues(migration049, 'disposal_method'));
  assert.deepEqual([...RETENTION_JOB_STATUSES], enumValues(migration049, 'disposal_job_status'));
  assert.ok(Object.isFrozen(PRIVACY_DATA_CATEGORIES) && Object.isFrozen(RETENTION_ALLOWED_TRANSITIONS));
});

test('PLT-09 contrato: parsers recusam valor inventado e nunca traduzem por conta própria', () => {
  for (const value of PRIVACY_DATA_CATEGORIES) assert.equal(parseDataCategory(value.toUpperCase()), value);
  for (const value of PRIVACY_LEGAL_BASES) assert.equal(parseLegalBasis(value), value);
  for (const value of PRIVACY_POLICY_STATUSES) assert.equal(parsePolicyStatus(value), value);
  for (const value of LGPD_REQUEST_TYPES) assert.equal(parseLgpdRequestType(value), value);
  for (const value of LGPD_REQUEST_STATUSES) assert.equal(parseLgpdRequestStatus(value), value);
  for (const value of LGPD_VERIFICATION_METHODS) assert.equal(parseLgpdVerificationMethod(value), value);
  for (const value of RETENTION_EXCEPTION_STATUSES) assert.equal(parseRetentionExceptionStatus(value), value);
  for (const value of RETENTION_DISPOSAL_METHODS) assert.equal(parseRetentionDisposalMethod(value), value);
  for (const invented of ['dado_pessoal', 'consentimento_expresso', 'publicada', 'excluido', '', null, undefined, 7]) {
    assert.equal(parseDataCategory(invented), null, `categoria ${invented}`);
    assert.equal(parseLegalBasis(invented), null, `base ${invented}`);
    assert.equal(parsePolicyStatus(invented), null, `status de política ${invented}`);
    assert.equal(parseLgpdRequestType(invented), null, `tipo LGPD ${invented}`);
    assert.equal(parseLgpdRequestStatus(invented), null, `status LGPD ${invented}`);
    assert.equal(parseRetentionExceptionStatus(invented), null, `status de exceção ${invented}`);
    assert.equal(parseRetentionDisposalMethod(invented), null, `método ${invented}`);
  }
  assert.equal(parseDataCategory(' sensivel '), null, 'espaço não é normalizado em silêncio');
});

test('PLT-09 contrato: uuid canônico (E17), sanitização e fronteira declarada', () => {
  assert.ok(uuidRe().test('00000000-0000-4000-8000-000000000001'));
  assert.ok(uuidRe().test('ABCDEF00-0000-4000-8000-00000000000A'));
  for (const invalid of ['nao-e-uuid', '00000000-0000-4000-8000-00000000000', '1', '../etc/passwd', '']) {
    assert.equal(uuidRe().test(invalid), false, invalid);
  }
  assert.equal(sanitizePrivacyText('  texto  ', 10), 'texto');
  assert.equal(sanitizePrivacyText('   ', 10), null);
  assert.equal(sanitizePrivacyText('12345678901', 10), null);
  assert.equal(sanitizePrivacyText(42, 10), null);
  assert.deepEqual(PRIVACY_READ_BOUNDARY, {
    leitura_grava_auditoria: false,
    leitura_altera_politica: false,
    leitura_altera_inventario: false,
    leitura_altera_pedido: false,
    abre_borda_rh_legada: false,
    substitui_superficie_existente: false,
    promocao_de_tela: false,
    publica_politica_de_verdade: false,
    exige_aprovacao_admin_antes_de_publicar: true,
    envio_externo: false,
    documento_do_titular_vira_hash: true,
    upload_de_arquivo: false,
    retencao_executa_descarte_real: false,
    prazo_legal_inferido: false,
    aceite_humano: false,
    reauditoria_integral: false,
  });
  assert.equal(isPrivacyReadMethod('GET'), true);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'get', '']) {
    assert.equal(isPrivacyReadMethod(method), false, `${method} não é leitura`);
  }
});

test('PLT-09 contrato: publicação é derivada do estado e exige aprovação de admin', () => {
  assert.equal(isPublishedStatus('publicado'), true);
  for (const status of PRIVACY_POLICY_STATUSES.filter(value => value !== 'publicado')) {
    assert.equal(isPublishedStatus(status), false, `${status} não pode aparecer publicada`);
  }
  assert.equal(policyPublishProblem('aprovado', 'publicado'), null);
  assert.equal(policyPublishProblem('rascunho', 'publicado'), 'must_be_approved_before_publish');
  assert.equal(policyPublishProblem('arquivado', 'publicado'), 'must_be_approved_before_publish');
  assert.equal(policyPublishProblem('rascunho', 'arquivado'), null, 'só publicar exige aprovação');
});

test('PLT-09 contrato: faixas de contato e e-mail do titular casam com o CHECK das migrações', () => {
  assert.equal(contactEmailProblem(null), null, 'contato é opcional');
  assert.equal(contactEmailProblem(''), null, 'limpar contato continua permitido');
  assert.equal(contactEmailProblem('contato@exemplo.invalid'), null);
  assert.equal(contactEmailProblem('a'), 'invalid_contact_email', '1 caractere o CHECK 047 recusaria');
  assert.equal(contactEmailProblem('sem-arroba'), 'invalid_contact_email');
  assert.equal(contactEmailProblem(`${'a'.repeat(320)}@exemplo.invalid`), 'invalid_contact_email');
  assert.equal(requesterEmailProblem('a@b'), 'invalid_requester_email', '3 caracteres o CHECK 048 recusaria');
  assert.equal(requesterEmailProblem('sem-arroba'), 'invalid_requester_email');
  assert.equal(requesterEmailProblem('a@@b.com'), 'invalid_requester_email');
  assert.equal(requesterEmailProblem('titular@exemplo.invalid'), null);
  assert.equal(LGPD_DECLARED_DUE_DAYS, 15);
  assert.equal(LGPD_DUE_DAYS_LEGALLY_VALIDATED, false, 'prazo declarado não é parecer jurídico');
});

test('PLT-09 contrato: matrizes de transição são as mesmas que os handlers aplicam', () => {
  assert.deepEqual(Object.keys(LGPD_ALLOWED_TRANSITIONS), [...LGPD_REQUEST_STATUSES]);
  assert.deepEqual(Object.keys(RETENTION_ALLOWED_TRANSITIONS), [...RETENTION_EXCEPTION_STATUSES]);
  assert.equal(canTransitionLgpd('recebido', 'em_verificacao'), true);
  assert.equal(canTransitionLgpd('recebido', 'atendido'), false);
  assert.equal(canTransitionLgpd('atendido', 'rejeitado'), false, 'estado terminal não volta');
  assert.equal(canTransitionRetentionException('solicitado', 'aprovado'), true);
  assert.equal(canTransitionRetentionException('rejeitado', 'aprovado'), false);
  assert.match(lgpdSource, /LGPD_ALLOWED_TRANSITIONS/);
  assert.match(retentionSource, /RETENTION_ALLOWED_TRANSITIONS/);
});

test('PLT-09 contrato: contadores do descarte não fabricam cobertura', () => {
  assert.deepEqual(disposalCounters({ policiesEvaluated: 1, exceptionsEvaluated: 0, exceptionsExpired: 0, disposed: 0 }),
    { total_scanned: 1, total_expired: 0, total_disposed: 0 });
  assert.deepEqual(disposalCounters({ policiesEvaluated: 3, exceptionsEvaluated: 2, exceptionsExpired: 1, disposed: 1 }),
    { total_scanned: 5, total_expired: 1, total_disposed: 1 });
  assert.deepEqual(disposalCounters(), { total_scanned: 0, total_expired: 0, total_disposed: 0 });
  assert.deepEqual(disposalCounters({ policiesEvaluated: -3, exceptionsEvaluated: NaN, exceptionsExpired: 'x', disposed: null }),
    { total_scanned: 0, total_expired: 0, total_disposed: 0 });
  assert.match(retentionSource, /disposalCounters/);
  assert.doesNotMatch(retentionSource, /\*\s*10\b/, 'nenhuma multiplicação sintética de cobertura');
});

// ---------------------------------------------------------------- privacidade ---

test('PLT-09 HTTP: escrita de inventário funciona para admin e ti (RED: 403 para os dois)', async () => {
  const pool = fakePool({ rows: { 'INSERT INTO privacy_data_inventory': { rows: [{ id: POLICY_ID }] } } });
  for (const role of ['admin', 'ti']) {
    const { api, last } = privacyApiWith({
      pool, role,
      body: { data_category: 'contato', data_field: 'email', description: 'd', purpose: 'p', legal_basis: 'consentimento' },
    });
    await api.handleInventory({ method: 'POST', url: '/api/admin/privacy/inventory', headers: { host: 'x' } }, {});
    assert.equal(last().status, 200, `${role} precisa conseguir gravar o inventário`);
    assert.ok(last().payload.item);
  }
  const rh = privacyApiWith({ pool, role: 'rh', body: { data_category: 'contato', data_field: 'x', description: 'd', purpose: 'p', legal_basis: 'outro' } });
  await rh.api.handleInventory({ method: 'POST', url: '/api/admin/privacy/inventory', headers: { host: 'x' } }, {});
  assert.equal(rh.last().status, 403);
  assert.equal(rh.last().payload.error, 'privacy_inventory_restricted_admin_ti');
  assert.doesNotMatch(privacySource, /await readAdminSession\(req\)\?\.role/, 'a precedência que zerava o papel não pode voltar');
});

test('PLT-09 HTTP: inventário anônimo 401, método não suportado 405 com Allow e enum inválido 400', async () => {
  const anonymous = privacyApiWith({ pool: fakePool(), session: false });
  await anonymous.api.handleInventory({ method: 'GET', url: '/api/admin/privacy/inventory', headers: { host: 'x' } }, {});
  assert.equal(anonymous.last().status, 401);
  const deleteMethod = privacyApiWith({ pool: fakePool() });
  await deleteMethod.api.handleInventory({ method: 'DELETE', url: '/api/admin/privacy/inventory', headers: { host: 'x' } }, {});
  assert.equal(deleteMethod.last().status, 405);
  assert.equal(deleteMethod.last().headers.Allow, 'GET, POST, PUT');
  const badCategory = privacyApiWith({ pool: fakePool() });
  await badCategory.api.handleInventory(getRequest('/api/admin/privacy/inventory?category=inventado'), {});
  assert.equal(badCategory.last().status, 400);
  assert.equal(badCategory.last().payload.error, 'invalid_category');
});

test('PLT-09 HTTP: leitura de inventário não escreve (nenhum INSERT/UPDATE disparado)', async () => {
  const pool = fakePool({ rows: { 'SELECT * FROM privacy_data_inventory': { rows: [{ data_field: 'email' }] } } });
  const { api, last } = privacyApiWith({ pool });
  await api.handleInventory(getRequest('/api/admin/privacy/inventory'), {});
  assert.equal(last().status, 200);
  assert.equal(pool.statements.filter(item => /^(INSERT|UPDATE|DELETE)/i.test(item.sql)).length, 0);
});

test('PLT-09 HTTP: filtro de política fora do contrato é 400 em vez de silenciosamente ignorado', async () => {
  const invalid = privacyApiWith({ pool: fakePool() });
  await invalid.api.handlePolicies(getRequest('/api/admin/privacy/policies?published=talvez'), {});
  assert.equal(invalid.last().status, 400);
  assert.equal(invalid.last().payload.error, 'invalid_published');
  const invalidStatus = privacyApiWith({ pool: fakePool() });
  await invalidStatus.api.handlePolicies(getRequest('/api/admin/privacy/policies?status=publicada'), {});
  assert.equal(invalidStatus.last().status, 400);
  assert.equal(invalidStatus.last().payload.error, 'invalid_status');
  const pool = fakePool({ rows: { 'SELECT * FROM privacy_policies': { rows: [{ id: POLICY_ID, status: 'publicado' }] } } });
  const valid = privacyApiWith({ pool });
  await valid.api.handlePolicies(getRequest('/api/admin/privacy/policies?published=true'), {});
  assert.equal(valid.last().status, 200);
  assert.ok(pool.statements.some(item => item.sql.includes('is_published = true')));
});

test('PLT-09 HTTP: contato com 1 caractere é 400 antes de tocar o banco (RED: 503 do CHECK)', async () => {
  const pool = fakePool({ onQuery: () => { throw new Error('CHECK constraint failed: contact_email'); } });
  const { api, last } = privacyApiWith({ pool, body: { title: 'Minuta', content: 'Conteúdo', contact_email: 'a' } });
  await api.handlePolicies({ method: 'POST', url: '/api/admin/privacy/policies', headers: { host: 'x' } }, {});
  assert.equal(last().status, 400);
  assert.equal(last().payload.error, 'invalid_contact_email');
  assert.equal(pool.statements.length, 0, 'nenhuma consulta pode ser disparada antes de validar');
  const valid = fakePool({ rows: { 'SELECT COALESCE(MAX(version),0)': { rows: [{ maxv: 1 }] }, 'INSERT INTO privacy_policies': { rows: [{ id: POLICY_ID, version: 2 }] } } });
  const ok = privacyApiWith({ pool: valid, body: { title: 'Minuta', content: 'Conteúdo', contact_email: 'contato@exemplo.invalid' } });
  await ok.api.handlePolicies({ method: 'POST', url: '/api/admin/privacy/policies', headers: { host: 'x' } }, {});
  assert.equal(ok.last().status, 201);
});

test('PLT-09 HTTP: política fora do contrato de id responde 400 no handler', async () => {
  const { api, last } = privacyApiWith({ pool: fakePool() });
  await api.handlePolicyById({ method: 'GET', url: '/api/admin/privacy/policies/nao-e-uuid', headers: { host: 'x' } }, {}, 'nao-e-uuid');
  assert.equal(last().status, 400);
  assert.equal(last().payload.error, 'invalid_policy_id');
});

test('PLT-09 HTTP: publicar exige aprovado, e arquivar/rejeitar deixa de publicar', async () => {
  const notApproved = fakePool({ rows: { 'SELECT status FROM privacy_policies': { rows: [{ status: 'rascunho' }] } } });
  const blocked = privacyApiWith({ pool: notApproved, role: 'admin', body: { status: 'publicado' } });
  await blocked.api.handlePolicyById({ method: 'PATCH', url: `/api/admin/privacy/policies/${POLICY_ID}`, headers: { host: 'x' } }, {}, POLICY_ID);
  assert.equal(blocked.last().status, 400);
  assert.equal(blocked.last().payload.error, 'must_be_approved_before_publish');
  assert.equal(notApproved.statements.filter(item => /^UPDATE/i.test(item.sql)).length, 0);

  const publish = fakePool({
    rows: {
      'SELECT status FROM privacy_policies': { rows: [{ status: 'aprovado' }] },
      'UPDATE privacy_policies': { rows: [{ id: POLICY_ID, status: 'publicado', is_published: true }] },
    },
  });
  const published = privacyApiWith({ pool: publish, role: 'admin', body: { status: 'publicado' } });
  await published.api.handlePolicyById({ method: 'PATCH', url: `/api/admin/privacy/policies/${POLICY_ID}`, headers: { host: 'x' } }, {}, POLICY_ID);
  assert.equal(published.last().status, 200);
  const publishUpdate = publish.statements.find(item => /^UPDATE privacy_policies/i.test(item.sql));
  assert.ok(publishUpdate.values.includes(true), 'publicar grava is_published=true');

  for (const status of ['arquivado', 'rejeitado']) {
    const pool = fakePool({
      rows: {
        'SELECT status FROM privacy_policies': { rows: [{ status: 'publicado' }] },
        'UPDATE privacy_policies': { rows: [{ id: POLICY_ID, status, is_published: false }] },
      },
    });
    const { api, last } = privacyApiWith({
      pool, role: 'admin',
      body: status === 'rejeitado' ? { status, rejection_reason: 'revisão encerrada' } : { status },
    });
    await api.handlePolicyById({ method: 'PATCH', url: `/api/admin/privacy/policies/${POLICY_ID}`, headers: { host: 'x' } }, {}, POLICY_ID);
    assert.equal(last().status, 200, status);
    const update = pool.statements.find(item => /^UPDATE privacy_policies/i.test(item.sql));
    assert.ok(update, `${'status '+status} precisa atualizar`);
    assert.ok(update.values.includes(false), `${status} precisa gravar is_published=false`);
  }
});

test('PLT-09 HTTP: falha ao ler o estado da política é fail-closed (não publica)', async () => {
  const pool = fakePool({ onQuery: text => { if (text.startsWith('SELECT status FROM privacy_policies')) throw new Error('pool indisponível'); } });
  const { api, last } = privacyApiWith({ pool, role: 'admin', body: { status: 'publicado' } });
  await api.handlePolicyById({ method: 'PATCH', url: `/api/admin/privacy/policies/${POLICY_ID}`, headers: { host: 'x' } }, {}, POLICY_ID);
  assert.equal(last().status, 503);
  assert.equal(last().payload.error, 'policy_unavailable');
  assert.equal(pool.statements.filter(item => /^UPDATE/i.test(item.sql)).length, 0, 'sem estado lido, nenhum UPDATE');
});

// --------------------------------------------------------------------- LGPD ---

test('PLT-09 HTTP: e-mail do titular fora da faixa é 400 antes do banco (RED: 503 do CHECK)', async () => {
  const pool = fakePool({ onQuery: () => { throw new Error('CHECK constraint failed: requester_email'); } });
  const { api, last } = lgpdApiWith({
    pool, session: false,
    body: { request_type: 'acesso', requester_name: 'Titular', requester_email: 'a@b', description: 'pedido com mais de dez' },
  });
  await api.handleRequests({ method: 'POST', url: '/api/public/lgpd', headers: { host: 'x' } }, {});
  assert.equal(last().status, 400);
  assert.equal(last().payload.error, 'invalid_requester_email');
  assert.equal(pool.statements.length, 0);
});

test('PLT-09 HTTP: pedido público válido grava com o prazo DECLARADO e sem sessão', async () => {
  const pool = fakePool({ rows: { 'INSERT INTO lgpd_requests': { rows: [{ id: REQUEST_ID, status: 'recebido' }] } } });
  const { api, last } = lgpdApiWith({
    pool, session: false,
    body: { request_type: 'acesso', requester_name: 'Titular', requester_email: 'titular@exemplo.invalid', description: 'pedido com mais de dez' },
  });
  await api.handleRequests({ method: 'POST', url: '/api/public/lgpd', headers: { host: 'x' } }, {});
  assert.equal(last().status, 201);
  const insert = pool.statements.find(item => item.sql.startsWith('INSERT INTO lgpd_requests'));
  const dueDate = insert.values.at(-1);
  const expected = new Date(Date.now() + LGPD_DECLARED_DUE_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.equal(dueDate, expected, 'o prazo é o declarado de 15 dias');
});

test('PLT-09 HTTP: pedido LGPD mantém transição, verificação de identidade e id canônico', async () => {
  const invalidId = lgpdApiWith({ pool: fakePool() });
  await invalidId.api.handleRequestById({ method: 'GET', url: '/api/admin/lgpd/requests/nao-e-uuid', headers: { host: 'x' } }, {}, 'nao-e-uuid');
  assert.equal(invalidId.last().status, 400);
  assert.equal(invalidId.last().payload.error, 'invalid_request_id');

  const pool = fakePool({ rows: { 'SELECT * FROM lgpd_requests WHERE id': { rows: [{ id: REQUEST_ID, status: 'recebido', is_identity_verified: false }] } } });
  const { api, last } = lgpdApiWith({ pool, body: { next_status: 'atendido' } });
  await api.handleRequestById({ method: 'PATCH', url: `/api/admin/lgpd/requests/${REQUEST_ID}`, headers: { host: 'x' } }, {}, REQUEST_ID);
  assert.equal(last().status, 400);
  assert.equal(last().payload.error, 'invalid_transition');

  const verifyPool = fakePool({ rows: { 'SELECT * FROM lgpd_requests WHERE id': { rows: [{ id: REQUEST_ID, status: 'em_analise', is_identity_verified: false }] } } });
  const needsIdentity = lgpdApiWith({ pool: verifyPool, body: { next_status: 'aprovado' } });
  await needsIdentity.api.handleRequestById({ method: 'PATCH', url: `/api/admin/lgpd/requests/${REQUEST_ID}`, headers: { host: 'x' } }, {}, REQUEST_ID);
  assert.equal(needsIdentity.last().payload.error, 'identity_verification_required');
});

// ---------------------------------------------------------------- retenção ---

test('PLT-09 HTTP: logs de descarte são leitura — POST/DELETE 405 com Allow (RED: 200)', async () => {
  for (const method of ['POST', 'DELETE']) {
    const { api, res, last } = retentionApiWith({ pool: fakePool() });
    await api.handleLogs({ method, url: '/api/admin/retention/disposal/logs', headers: { host: 'x' } }, res);
    assert.equal(last().status, 405, `${method} em rota de leitura`);
    assert.equal(last().body.error, 'method_not_allowed');
    assert.equal(last().headers.Allow, 'GET');
  }
  const pool = fakePool({ rows: { 'SELECT * FROM disposal_logs': { rows: [{ id: JOB_ID }] } } });
  const { api, res, last } = retentionApiWith({ pool });
  await api.handleLogs({ method: 'GET', url: '/api/admin/retention/disposal/logs', headers: { host: 'x' } }, res);
  assert.equal(last().status, 200);
  assert.equal(pool.statements.filter(item => /^(INSERT|UPDATE|DELETE)/i.test(item.sql)).length, 0);
});

test('PLT-09 HTTP: detalhe do job é leitura — DELETE 405 com Allow (RED: 200)', async () => {
  const { api, res, last } = retentionApiWith({ pool: fakePool() });
  await api.handleJobById({ method: 'DELETE', url: `/api/admin/retention/disposal/jobs/${JOB_ID}`, headers: { host: 'x' } }, res, JOB_ID);
  assert.equal(last().status, 405);
  assert.equal(last().headers.Allow, 'GET');
  const invalid = retentionApiWith({ pool: fakePool() });
  await invalid.api.handleJobById({ method: 'GET', url: '/api/admin/retention/disposal/jobs/nao-e-uuid', headers: { host: 'x' } }, invalid.res, 'nao-e-uuid');
  assert.equal(invalid.last().status, 400);
  assert.equal(invalid.last().body.error, 'invalid_id');
});

test('PLT-09 HTTP: filtros de retenção fora do enum são 400 (RED: lista inteira em 200)', async () => {
  const cases = [
    ['/api/admin/retention/policies?category=inventado', 'handlePolicies', 'invalid_category'],
    ['/api/admin/retention/policies?is_active=talvez', 'handlePolicies', 'invalid_is_active'],
    ['/api/admin/retention/exceptions?status=inventado', 'handleExceptions', 'invalid_status'],
    ['/api/admin/retention/exceptions?category=inventado', 'handleExceptions', 'invalid_category'],
    ['/api/admin/retention/disposal/logs?category=inventado', 'handleLogs', 'invalid_category'],
  ];
  for (const [url, handler, error] of cases) {
    const { api, res, last } = retentionApiWith({ pool: fakePool() });
    await api[handler]({ method: 'GET', url, headers: { host: 'x' } }, res);
    assert.equal(last().status, 400, url);
    assert.equal(last().body.error, error, url);
  }
});

test('PLT-09 HTTP: job de descarte grava os contadores medidos, não cobertura fabricada', async () => {
  const pool = fakePool({
    rows: {
      'INSERT INTO disposal_jobs': { rows: [{ id: JOB_ID, status: 'pendente' }] },
      "UPDATE retention_exceptions SET status='expirado'": { rows: [{ id: EXCEPTION_ID }], rowCount: 1 },
      'FROM data_retention_policies WHERE is_active=true': { rows: [{ c: 1 }] },
      'SELECT COUNT(*)::int as c FROM retention_exceptions': { rows: [{ c: 2 }] },
      'SELECT * FROM retention_exceptions': { rows: [] },
      'SELECT * FROM disposal_jobs': { rows: [{ id: JOB_ID, status: 'concluido' }] },
    },
  });
  const { api, res, request, last } = retentionApiWith({ pool });
  await api.handleJobs(request('POST', '/api/admin/retention/disposal/jobs', { notes: 'probe' }), res);
  assert.equal(last().status, 201);
  const finalUpdate = pool.statements.find(item => item.sql.startsWith('UPDATE disposal_jobs SET status=$1'));
  assert.ok(finalUpdate, 'o job precisa fechar com os contadores');
  assert.equal(finalUpdate.values[1], 3, 'total_scanned = 1 política + 2 exceções avaliadas');
  assert.equal(finalUpdate.values[2], 1, 'total_expired vem do RETURNING do UPDATE');
  assert.equal(finalUpdate.values[3], 0, 'nenhum descarte real');
});

// ------------------------------------------------------------------ fronteira ---

test('PLT-09 fronteira: rotas de detalhe recebem o id no handler, sem 404 do roteador', () => {
  const widened = [
    'privacyPolicyByIdMatch', 'lgpdByIdMatch', 'retentionExcByIdMatch', 'disposalJobByIdMatch',
  ];
  for (const name of widened) {
    const line = serverSource.split('\n').find(item => item.trim().startsWith(`const ${name} =`));
    assert.ok(line, `${name} precisa existir`);
    assert.match(line, /\(\[\^\/\]\+\)/, `${name} precisa casar o segmento para o handler responder 400`);
    assert.doesNotMatch(line, /\(\[0-9a-f-\]\{36\}\)/, `${name} não pode barrar id torto no roteador`);
  }
  for (const api of [privacySource, lgpdSource, retentionSource]) {
    assert.match(api, /invalid_(id|policy_id|request_id)/);
  }
});

test('PLT-09 fronteira: a fatia não promove aba, não abre a borda de RH e não publica política real', () => {
  assert.match(consoleSource, /active==='privacidade'&&<PrivacyClient\/>/);
  assert.match(consoleSource, /active==='retencao'&&<RetentionClient\/>/);
  assert.match(consoleSource, /active==='lgpd'&&<LgpdRequestClient\/>/);
  for (const source of [privacySource, lgpdSource, retentionSource]) {
    assert.doesNotMatch(source, /authorizeLegacyHrRequest/);
    assert.doesNotMatch(source, /employees\.read/);
    assert.doesNotMatch(source, /nodemailer|sendMail|sendLeadEmail/);
  }
  assert.doesNotMatch(privacySource, /is_published = true`\);\s*\n\s*fields\.push\(`published_at/, 'publicação não é bandeira fixa');
  assert.match(privacySource, /isPublishedStatus/);
});
