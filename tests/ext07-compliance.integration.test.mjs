// EXT-07 — jornada de compliance corporativo exercitada por HTTP REAL contra
// PostgreSQL REAL. Executada por scripts/qa-ext07-compliance-postgres.mjs, que
// sobe cluster descartável, aplica 001–154 e injeta DATABASE_URL.
//
// Regra desta suíte: nenhum veredito funcional vem de SQL que simule o que a
// API deveria fazer. Todo veredito funcional vem de uma resposta HTTP do
// servidor de verdade; o SQL só (a) semeia fixtures sintéticos, (b) confere o
// que ficou gravado e (c) prova as travas do banco (triggers de imutabilidade,
// CHECK de validade e injeção de falha de auditoria).
//
// Critério do plano provado aqui: "Vencimento gera tarefa e documento privado"
// — ver os testes marcados CRITÉRIO DO PLANO.
//
// FRONTEIRA DECLARADA: não existe ator externo, portal público, integração
// regulatória, upload, bytes, checksum, malware scan, armazenamento verificado
// ou download. Todos os dados são sintéticos e usam domínio .invalid.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { hashPassword } from '../src/lib/client-auth-core.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
// Quando executada PELO gate, esta suíte não pode passar por skip silencioso.
const REQUIRE_DB = process.env.QA_EXT07_REQUIRE_DB === '1';
const root = path.resolve(import.meta.dirname, '..');

test('EXT-07 gate: banco real presente — skip silencioso é proibido', () => {
  if (!REQUIRE_DB) return;
  assert.ok(RUN, 'o gate exige RUN_DATABASE_INTEGRATION=1 e DATABASE_URL reais; sem eles a suíte reprova em vez de pular');
});

let server, baseUrl, pool;
let ti, rh, owner, cookieTi, cookieRh;

function isoOffset(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function waitForServer(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/admin/session`, { headers: { accept: 'application/json' } });
      if (res.status === 401 || res.status === 200) return true;
    } catch { /* ainda subindo */ }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error('server_did_not_start');
}

before(async () => {
  if (!RUN) return;
  const port = 3000 + Math.floor(Math.random() * 2000);
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: '127.0.0.1',
      NODE_ENV: 'development',
      NEXT_DIST_DIR: '.next/integration-ext07',
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
      SITE_ADMIN_TOKEN_MARCELO: '',
      SITE_ADMIN_TOKEN_TI: '',
      SITE_ADMIN_LEGACY_TOKENS: '',
      QA_PGLITE_ONLY: '',
      OLLAMA_ENABLED: 'false',
      MAIL_HOST: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});
  await waitForServer(baseUrl);
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
  ti = await makeStaff('ti');
  rh = await makeStaff('rh');
  owner = await makeStaff('admin');
  cookieTi = await login(ti);
  cookieRh = await login(rh);
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 300));
    server.kill('SIGKILL');
  }
});

/** Identidade staff sintética (domínio .invalid, sem dado real). */
async function makeStaff(role) {
  const id = randomUUID();
  const email = `qa-ext07-${role}-${id.slice(0, 8)}@exemplo.invalid`;
  const password = 'Senha-Sintetica-9!';
  await pool.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status) VALUES ($1,'staff',$2,$3,'active')`,
    [id, email, `QA EXT-07 ${role}`],
  );
  await pool.query(`INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)`, [id, await hashPassword(password)]);
  await pool.query(
    `INSERT INTO auth_staff_profiles (identity_id, role, assigned_by) VALUES ($1,$2,'admin_system')`,
    [id, role],
  );
  return { id, email, password, role };
}

async function login(staff) {
  const res = await fetch(`${baseUrl}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseUrl },
    body: JSON.stringify({ email: staff.email, password: staff.password }),
    redirect: 'manual',
  });
  assert.equal(res.status, 200, 'login de staff sintético precisa funcionar');
  const cookie = (res.headers.getSetCookie?.() || []).find(value => value.startsWith('seg_admin_session='));
  assert.ok(cookie, 'login precisa emitir cookie de sessão staff');
  return cookie.split(';')[0];
}

function get(pathname, cookie) {
  return fetch(`${baseUrl}${pathname}`, {
    headers: { accept: 'application/json', ...(cookie ? { cookie } : {}) },
    redirect: 'manual',
  });
}

/** Mutação com Origin correto e Idempotency-Key, como a UI faz. */
function mutate(pathname, { method = 'POST', body, cookie, key, origin = baseUrl, raw } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
      ...(cookie ? { cookie } : {}),
      ...(key ? { 'idempotency-key': key } : {}),
    },
    body: raw ?? JSON.stringify(body ?? {}),
    redirect: 'manual',
  });
}

function newKey(tag) {
  return `ext07-${tag}-${randomUUID()}`;
}

async function body(res) {
  const raw = await res.text();
  try { return JSON.parse(raw); } catch { return { raw: raw.slice(0, 200) }; }
}

function obligationPayload(responsibleId, overrides = {}) {
  return {
    obligation_type: 'licenca',
    title: `Licenca sintetica ${randomUUID().slice(0, 8)}`,
    description: 'Obrigacao sintetica declarada pela equipe interna para QA.',
    declared_source: 'Fonte declarada sintetica em dominio .invalid',
    applicability_scope: 'matriz sintetica EXT-07',
    applicability_justification: 'Justificativa sintetica de aplicabilidade para QA.',
    validity_rule: 'anual_com_renovacao_declarada',
    criticality: 'alta',
    renewal_lead_days: 30,
    responsible_identity: responsibleId,
    ...overrides,
  };
}

function documentPayload(obligationId, overrides = {}) {
  return {
    obligation_id: obligationId,
    title: `Documento sintetico ${randomUUID().slice(0, 8)}`,
    description: 'Referencia documental sintetica declarada pela equipe.',
    compliance_type: 'licenca',
    issue_date: isoOffset(-400),
    expiry_date: isoOffset(-10),
    reference_type: 'referencia_declarada',
    declared_reference: `REF-SINTETICA-${randomUUID().slice(0, 8)}`,
    reference_source: 'registro interno sintetico',
    document_number: 'ABC-987654321',
    issuer: 'Orgao Sintetico Invalid',
    ...overrides,
  };
}

/** Cria obrigação canônica via HTTP e devolve o id. */
async function createObligation(overrides = {}, responsible = ti) {
  const res = await mutate('/api/ext/compliance/obligations', {
    cookie: cookieTi, key: newKey('ob'), body: obligationPayload(responsible.id, overrides),
  });
  // O corpo da resposta é lido UMA vez: ler duas vezes quebra o harness.
  const parsed = await body(res);
  assert.equal(res.status, 201, `obrigação deveria ser criada: ${JSON.stringify(parsed)}`);
  return parsed.obligation.id;
}

/** Cria documento canônico via HTTP e devolve o corpo. */
async function createDocument(obligationId, overrides = {}) {
  const res = await mutate('/api/ext/compliance/documents', {
    cookie: cookieTi, key: newKey('doc'), body: documentPayload(obligationId, overrides),
  });
  const parsed = await body(res);
  assert.equal(res.status, 201, `documento deveria ser criado: ${JSON.stringify(parsed)}`);
  return parsed.document;
}

// ---------------------------------------------------------------------------
// Fronteira de ator: 401 x 403, same-origin e ausência de rota pública
// ---------------------------------------------------------------------------
test('EXT-07 anônimo recebe 401 em toda rota canônica, nunca 404 do Next', { skip: !RUN }, async () => {
  for (const pathname of [
    '/api/ext/compliance/obligations', '/api/ext/compliance/documents',
    '/api/ext/compliance/tasks', '/api/ext/compliance/evaluate',
  ]) {
    const res = await get(pathname);
    assert.equal(res.status, 401, `${pathname} deveria exigir sessão`);
    assert.equal((await body(res)).error, 'admin_session_required');
  }
});

test('EXT-07 papel staff autenticado sem direito recebe 403, distinto do 401', { skip: !RUN }, async () => {
  const res = await get('/api/ext/compliance/obligations', cookieRh);
  assert.equal(res.status, 403);
  const parsed = await body(res);
  assert.equal(parsed.error, 'compliance_role_required');
  assert.deepEqual(parsed.required_roles, ['admin', 'ti']);
});

test('EXT-07 não existe rota pública de compliance', { skip: !RUN }, async () => {
  for (const pathname of [
    '/api/public/compliance', '/api/public/compliance-documents',
    '/api/compliance', '/api/ext/compliance/public',
  ]) {
    const res = await get(pathname);
    assert.ok([401, 404].includes(res.status), `${pathname} não pode responder conteúdo a anônimo (${res.status})`);
    if (res.status === 200) assert.fail('rota pública não deve existir');
  }
});

test('EXT-07 mutação cross-origin é recusada com 403', { skip: !RUN }, async () => {
  const res = await mutate('/api/ext/compliance/obligations', {
    cookie: cookieTi, key: newKey('xo'), origin: 'https://atacante.invalid', body: obligationPayload(ti.id),
  });
  assert.equal(res.status, 403);
  assert.equal((await body(res)).error, 'cross_origin_rejected');
});

test('EXT-07 mutação sem Origin é recusada', { skip: !RUN }, async () => {
  const res = await mutate('/api/ext/compliance/obligations', {
    cookie: cookieTi, key: newKey('no-origin'), origin: null, body: obligationPayload(ti.id),
  });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// Corpo, chave e campos de servidor
// ---------------------------------------------------------------------------
test('EXT-07 JSON inválido devolve 400', { skip: !RUN }, async () => {
  const res = await mutate('/api/ext/compliance/obligations', {
    cookie: cookieTi, key: newKey('json'), raw: '{nao-e-json',
  });
  assert.equal(res.status, 400);
  assert.equal((await body(res)).error, 'invalid_json');
});

test('EXT-07 corpo acima do limite devolve 413', { skip: !RUN }, async () => {
  const res = await mutate('/api/ext/compliance/obligations', {
    cookie: cookieTi, key: newKey('big'), raw: JSON.stringify({ title: 'x'.repeat(300_000) }),
  });
  assert.equal(res.status, 413);
  assert.equal((await body(res)).error, 'payload_too_large');
});

test('EXT-07 mutação sem Idempotency-Key devolve 400', { skip: !RUN }, async () => {
  const res = await mutate('/api/ext/compliance/obligations', { cookie: cookieTi, body: obligationPayload(ti.id) });
  assert.equal(res.status, 400);
  assert.equal((await body(res)).error, 'idempotency_key_required');
});

test('EXT-07 recusa id, autoria, estado e versão forjados', { skip: !RUN }, async () => {
  const res = await mutate('/api/ext/compliance/obligations', {
    cookie: cookieTi,
    key: newKey('forge'),
    body: { ...obligationPayload(ti.id), id: randomUUID(), created_by_identity: rh.id, status: 'vigente', version_no: 7 },
  });
  assert.equal(res.status, 400);
  const parsed = await body(res);
  assert.equal(parsed.error, 'server_owned_field_rejected');
  assert.deepEqual(parsed.fields.sort(), ['created_by_identity', 'id', 'status', 'version_no']);
});

test('EXT-07 autoria gravada no banco é a da sessão', { skip: !RUN }, async () => {
  const id = await createObligation();
  const stored = await pool.query('SELECT created_by_identity, status, created_at FROM ext_compliance_obligations WHERE id=$1', [id]);
  assert.equal(stored.rows[0].created_by_identity, ti.id);
  assert.equal(stored.rows[0].status, 'pendente');
  assert.ok(stored.rows[0].created_at instanceof Date);
});

test('EXT-07 UUID inválido em rota de tarefa devolve 400', { skip: !RUN }, async () => {
  const res = await mutate('/api/ext/compliance/tasks/nao-e-uuid/start', { cookie: cookieTi, key: newKey('uuid') });
  assert.equal(res.status, 400);
  assert.equal((await body(res)).error, 'invalid_task_id');
});

test('EXT-07 UUID inválido no detalhe de documento devolve 400', { skip: !RUN }, async () => {
  const res = await get('/api/ext/compliance/documents/nao-e-uuid', cookieTi);
  assert.equal(res.status, 400);
  assert.equal((await body(res)).error, 'invalid_document_id');
});

// ---------------------------------------------------------------------------
// Obrigação: tipo, fonte, aplicabilidade e responsável staff
// ---------------------------------------------------------------------------
test('EXT-07 recusa tipo de obrigação fora do catálogo', { skip: !RUN }, async () => {
  const res = await mutate('/api/ext/compliance/obligations', {
    cookie: cookieTi, key: newKey('type'), body: obligationPayload(ti.id, { obligation_type: 'tipo_inventado' }),
  });
  assert.equal(res.status, 400);
  assert.equal((await body(res)).error, 'invalid_obligation_type');
});

test('EXT-07 exige fonte declarada e justificativa de aplicabilidade', { skip: !RUN }, async () => {
  for (const field of ['declared_source', 'applicability_scope', 'applicability_justification', 'validity_rule']) {
    const payload = obligationPayload(ti.id);
    delete payload[field];
    const res = await mutate('/api/ext/compliance/obligations', { cookie: cookieTi, key: newKey(`miss-${field}`), body: payload });
    assert.equal(res.status, 400, `${field} deveria ser obrigatório`);
    assert.equal((await body(res)).error, 'invalid_obligation_payload');
  }
});

test('EXT-07 recusa responsável que não é staff autorizado', { skip: !RUN }, async () => {
  // Identidade recém-criada só para esta asserção negativa: papel rh não pode
  // ser responsável canônico de compliance.
  const res = await mutate('/api/ext/compliance/obligations', {
    cookie: cookieTi, key: newKey('resp-rh'), body: obligationPayload(rh.id),
  });
  assert.equal(res.status, 409);
  assert.equal((await body(res)).error, 'responsible_staff_required');
});

test('EXT-07 recusa responsável inexistente e responsável não-UUID', { skip: !RUN }, async () => {
  const ghost = await mutate('/api/ext/compliance/obligations', {
    cookie: cookieTi, key: newKey('ghost'), body: obligationPayload(randomUUID()),
  });
  assert.equal(ghost.status, 409);
  const broken = await mutate('/api/ext/compliance/obligations', {
    cookie: cookieTi, key: newKey('broken'), body: obligationPayload('equipe-compliance'),
  });
  assert.equal(broken.status, 400);
  assert.equal((await body(broken)).error, 'invalid_responsible_identity');
});

test('EXT-07 não apresenta obrigação como validação jurídica', { skip: !RUN }, async () => {
  const res = await get('/api/ext/compliance/obligations', cookieTi);
  const parsed = await body(res);
  assert.equal(parsed.legal_validation, 'nao_realizada');
  assert.match(parsed.legal_validation_note, /sem validacao juridica/);
  assert.match(parsed.legal_validation_note, /sem confirmacao por orgao publico/);
});

// ---------------------------------------------------------------------------
// Validade: datas, ordem e estado temporal do servidor
// ---------------------------------------------------------------------------
test('EXT-07 recusa datas inválidas e vencimento fora de ordem', { skip: !RUN }, async () => {
  const obligationId = await createObligation();
  const cases = [
    [{ issue_date: '03/10/2026' }, 'invalid_dates'],
    [{ issue_date: '2026-02-31' }, 'invalid_dates'],
    [{ issue_date: isoOffset(-10), expiry_date: isoOffset(-400) }, 'expiry_before_issue_or_start'],
    [{ issue_date: isoOffset(-400), effective_start_date: isoOffset(-500), expiry_date: isoOffset(10) }, 'effective_start_before_issue'],
  ];
  for (const [overrides, expected] of cases) {
    const res = await mutate('/api/ext/compliance/documents', {
      cookie: cookieTi, key: newKey('date'), body: documentPayload(obligationId, overrides),
    });
    assert.equal(res.status, 400, JSON.stringify(overrides));
    assert.equal((await body(res)).error, expected);
  }
});

test('EXT-07 estado temporal vem do relógio do PostgreSQL, em ISO', { skip: !RUN }, async () => {
  const today = (await pool.query('SELECT CURRENT_DATE::text AS today')).rows[0].today;
  const expired = await createDocument(await createObligation());
  assert.equal(expired.status, 'vencida');
  assert.equal(expired.expiry_date, isoOffset(-10));

  const soon = await createDocument(await createObligation(), { issue_date: isoOffset(-100), expiry_date: isoOffset(10) });
  assert.equal(soon.status, 'a_vencer', 'dentro da antecedência declarada de 30 dias');

  const valid = await createDocument(await createObligation(), { issue_date: isoOffset(-100), expiry_date: isoOffset(300) });
  assert.equal(valid.status, 'vigente');
  assert.equal(valid.evaluation_date, today);
});

test('EXT-07 banco impede estado vigente com validade vencida', { skip: !RUN }, async () => {
  const document = await createDocument(await createObligation());
  await assert.rejects(
    () => pool.query(`UPDATE ext_compliance_documents SET status='vigente'::ext_compliance_status WHERE id=$1`, [document.id]),
    /vigente with expired validity/,
  );
});

test('EXT-07 banco impede vencimento anterior ao início de vigência', { skip: !RUN }, async () => {
  const obligationId = await createObligation();
  await assert.rejects(() => pool.query(
    `INSERT INTO ext_compliance_documents
       (protocol,title,description,compliance_type,status,responsible_identity,issue_date,effective_start_date,expiry_date,validity_rule,reference_type,declared_reference,is_private,created_by_identity,obligation_id,origin)
     VALUES ($1,'Documento invalido QA','Insercao direta sintetica para QA negativo.','licenca','vigente',$2,CURRENT_DATE-10,CURRENT_DATE-10,CURRENT_DATE-400,'anual','referencia_declarada','REF-NEG',true,$2,$3,'ext07_canonica')`,
    [`COMP-EXT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-NEG1`, ti.id, obligationId],
  ), /ext_compliance_dates_check|expiry_date/);
});

// ---------------------------------------------------------------------------
// Privacidade, projeção e fronteira documental
// ---------------------------------------------------------------------------
test('EXT-07 CRITÉRIO DO PLANO: documento canônico é privado por estrutura', { skip: !RUN }, async () => {
  const document = await createDocument(await createObligation());
  assert.equal(document.is_private, true);
  const stored = await pool.query('SELECT is_private, origin, storage_key, file_url FROM ext_compliance_documents WHERE id=$1', [document.id]);
  assert.equal(stored.rows[0].is_private, true);
  assert.equal(stored.rows[0].origin, 'ext07_canonica');
  assert.equal(stored.rows[0].storage_key, null, 'referência declarada não aponta armazenamento');
  assert.equal(stored.rows[0].file_url, null, 'referência declarada não é download');
  await assert.rejects(
    () => pool.query('UPDATE ext_compliance_documents SET is_private=false WHERE id=$1', [document.id]),
    /immutable|canonical_private/,
  );
});

test('EXT-07 banco recusa linha canônica que alegue arquivo armazenado', { skip: !RUN }, async () => {
  const obligationId = await createObligation();
  await assert.rejects(() => pool.query(
    `INSERT INTO ext_compliance_documents
       (protocol,title,description,compliance_type,status,responsible_identity,issue_date,effective_start_date,expiry_date,validity_rule,reference_type,declared_reference,storage_key,is_private,created_by_identity,obligation_id,origin)
     VALUES ($1,'Documento com storage QA','Insercao direta sintetica para QA negativo.','licenca','vencida',$2,CURRENT_DATE-400,CURRENT_DATE-400,CURRENT_DATE-10,'anual','referencia_declarada','REF-STOR','chave-de-armazenamento-sintetica',true,$2,$3,'ext07_canonica')`,
    [`COMP-EXT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-STO1`, ti.id, obligationId],
  ), /ext_compliance_canonical_reference_only/);
});

test('EXT-07 listagem é minimizada e não vaza referência nem número completo', { skip: !RUN }, async () => {
  await createDocument(await createObligation());
  const res = await get('/api/ext/compliance/documents', cookieTi);
  assert.equal(res.status, 200);
  const parsed = await body(res);
  assert.ok(parsed.items.length > 0);
  for (const item of parsed.items) {
    for (const forbidden of ['storage_key', 'file_url', 'declared_reference', 'document_number', 'reference_source']) {
      assert.ok(!(forbidden in item), `${forbidden} não pode aparecer na listagem`);
    }
    assert.equal(item.is_private, true);
    if (item.document_number_masked) assert.match(item.document_number_masked, /^\*{4}/);
  }
  assert.equal(parsed.projection, 'minimizada');
  assert.match(parsed.file_boundary, /referencia_declarada_nao_arquivo_verificado/);
  assert.match(parsed.file_boundary, /sem upload, bytes, checksum, malware scan, armazenamento verificado ou download/);
});

test('EXT-07 detalhe autorizado usa allowlist e ainda esconde armazenamento', { skip: !RUN }, async () => {
  const document = await createDocument(await createObligation());
  const res = await get(`/api/ext/compliance/documents/${document.id}`, cookieTi);
  assert.equal(res.status, 200);
  const parsed = await body(res);
  assert.equal(parsed.document.id, document.id);
  assert.ok('declared_reference' in parsed.document, 'detalhe autorizado mostra a referência declarada');
  assert.ok('document_number' in parsed.document, 'detalhe autorizado mostra o número completo');
  assert.ok(!('storage_key' in parsed.document));
  assert.ok(!('file_url' in parsed.document));
  assert.equal(parsed.projection, 'detalhe_autorizado_allowlist');
  assert.ok(Array.isArray(parsed.history));
});

test('EXT-07 detalhe não expõe linha legada pela rota canônica', { skip: !RUN }, async () => {
  const legacy = await pool.query(
    `INSERT INTO ext_compliance_documents (protocol,title,description,compliance_type,status,is_private)
     VALUES ($1,'Documento legado QA','Linha legada sintetica anterior a 153 para QA.','outro','vigente',true) RETURNING id`,
    [`COMP-EXT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-LEG1`],
  );
  const stored = await pool.query('SELECT origin FROM ext_compliance_documents WHERE id=$1', [legacy.rows[0].id]);
  assert.equal(stored.rows[0].origin, 'registro_legado', 'linha anterior permanece registro_legado');
  const res = await get(`/api/ext/compliance/documents/${legacy.rows[0].id}`, cookieTi);
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// Idempotência, concorrência e auditoria
// ---------------------------------------------------------------------------
test('EXT-07 retry idêntico não duplica e devolve replay', { skip: !RUN }, async () => {
  const key = newKey('retry');
  const payload = obligationPayload(ti.id);
  const first = await mutate('/api/ext/compliance/obligations', { cookie: cookieTi, key, body: payload });
  assert.equal(first.status, 201);
  const second = await mutate('/api/ext/compliance/obligations', { cookie: cookieTi, key, body: payload });
  assert.equal(second.status, 200);
  assert.equal((await body(second)).replayed, true);
  const count = await pool.query('SELECT count(*)::int AS total FROM ext_compliance_obligations WHERE title=$1', [payload.title]);
  assert.equal(count.rows[0].total, 1);
});

test('EXT-07 mesma chave com corpo divergente devolve 409', { skip: !RUN }, async () => {
  const key = newKey('diverge');
  const payload = obligationPayload(ti.id);
  assert.equal((await mutate('/api/ext/compliance/obligations', { cookie: cookieTi, key, body: payload })).status, 201);
  const res = await mutate('/api/ext/compliance/obligations', {
    cookie: cookieTi, key, body: { ...payload, title: `Divergente ${randomUUID().slice(0, 8)}` },
  });
  assert.equal(res.status, 409);
  assert.equal((await body(res)).error, 'idempotency_key_reused_with_different_payload');
});

test('EXT-07 concorrência real com a mesma chave cria um único registro', { skip: !RUN }, async () => {
  const key = newKey('conc');
  const payload = obligationPayload(ti.id);
  const results = await Promise.all([0, 1, 2, 3, 4].map(() =>
    mutate('/api/ext/compliance/obligations', { cookie: cookieTi, key, body: payload })));
  const statuses = results.map(res => res.status).sort();
  assert.ok(statuses.includes(201), `uma requisição precisa criar: ${statuses}`);
  assert.ok(statuses.every(status => [200, 201].includes(status)), `nenhuma pode falhar: ${statuses}`);
  const count = await pool.query('SELECT count(*)::int AS total FROM ext_compliance_obligations WHERE title=$1', [payload.title]);
  assert.equal(count.rows[0].total, 1, 'concorrência não pode duplicar a obrigação');
  const events = await pool.query('SELECT count(*)::int AS total FROM ext_compliance_events WHERE idempotency_key=$1', [key]);
  assert.equal(events.rows[0].total, 1, 'o evento imutável também é único');
});

test('EXT-07 falha de audit_log faz rollback completo e devolve 503', { skip: !RUN }, async () => {
  await pool.query(`ALTER TABLE audit_log ADD CONSTRAINT qa_ext07_audit_block CHECK (action <> 'ext07_obligation_create') NOT VALID`);
  try {
    const payload = obligationPayload(ti.id);
    const key = newKey('audit');
    const before = await pool.query('SELECT count(*)::int AS total FROM ext_compliance_obligations');
    const res = await mutate('/api/ext/compliance/obligations', { cookie: cookieTi, key, body: payload });
    assert.equal(res.status, 503);
    assert.equal((await body(res)).error, 'audit_log_unavailable');
    const after = await pool.query('SELECT count(*)::int AS total FROM ext_compliance_obligations');
    assert.equal(after.rows[0].total, before.rows[0].total, 'nenhuma obrigação pode sobrar');
    const named = await pool.query('SELECT count(*)::int AS total FROM ext_compliance_obligations WHERE title=$1', [payload.title]);
    assert.equal(named.rows[0].total, 0);
    const events = await pool.query('SELECT count(*)::int AS total FROM ext_compliance_events WHERE idempotency_key=$1', [key]);
    assert.equal(events.rows[0].total, 0, 'o evento imutável também precisa sumir no rollback');
  } finally {
    await pool.query('ALTER TABLE audit_log DROP CONSTRAINT qa_ext07_audit_block');
  }
});

test('EXT-07 auditoria canônica é gravada no audit_log quando tudo dá certo', { skip: !RUN }, async () => {
  const id = await createObligation();
  const audit = await pool.query(`SELECT action, actor, target FROM audit_log WHERE target=$1 AND action='ext07_obligation_create'`, [id]);
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].actor, ti.id);
});

test('EXT-07 evento histórico é imutável no banco', { skip: !RUN }, async () => {
  const id = await createObligation();
  const event = await pool.query('SELECT id FROM ext_compliance_events WHERE obligation_id=$1', [id]);
  assert.equal(event.rowCount, 1);
  await assert.rejects(() => pool.query(`UPDATE ext_compliance_events SET event_type='forjado' WHERE id=$1`, [event.rows[0].id]), /immutable/);
  await assert.rejects(() => pool.query('DELETE FROM ext_compliance_events WHERE id=$1', [event.rows[0].id]), /immutable/);
});

// ---------------------------------------------------------------------------
// CRITÉRIO DO PLANO: vencimento gera tarefa
// ---------------------------------------------------------------------------
test('EXT-07 CRITÉRIO DO PLANO: vencimento gera tarefa com regra, data-base e fatos', { skip: !RUN }, async () => {
  const obligationId = await createObligation();
  const document = await createDocument(obligationId);
  const res = await mutate('/api/ext/compliance/evaluate', { cookie: cookieTi, key: newKey('eval') });
  const parsed = await body(res);
  assert.equal(res.status, 200, JSON.stringify(parsed));
  const today = (await pool.query('SELECT CURRENT_DATE::text AS today')).rows[0].today;
  assert.equal(parsed.base_date, today);
  assert.equal(parsed.base_date_source, 'postgres_current_date');
  assert.equal(parsed.task_source, 'ext_compliance_tasks');
  assert.ok(parsed.tasks_created >= 1);

  const task = await pool.query('SELECT * FROM ext_compliance_tasks WHERE document_id=$1', [document.id]);
  assert.equal(task.rowCount, 1, 'uma tarefa por documento/período/regra');
  const row = task.rows[0];
  assert.equal(row.rule, 'vencimento_na_data_base_do_servidor');
  assert.equal(row.obligation_id, obligationId);
  assert.equal(row.responsible_identity, ti.id, 'responsável staff canônico da obrigação');
  assert.equal(row.created_by_identity, ti.id);
  assert.equal(row.evaluation_date.toISOString().slice(0, 10), today);
  assert.equal(row.due_date.toISOString().slice(0, 10), document.expiry_date);
  assert.equal(row.validity_period, `${document.effective_start_date}:${document.expiry_date}`);
  assert.equal(row.facts.base_date, today);
  assert.equal(row.facts.expiry_date, document.expiry_date);
  assert.ok(row.facts.days_overdue > 0);
  assert.equal(row.status, 'aberta');

  const stored = await pool.query('SELECT status FROM ext_compliance_documents WHERE id=$1', [document.id]);
  assert.equal(stored.rows[0].status, 'vencida');
});

test('EXT-07 reavaliação não duplica a tarefa do mesmo período e regra', { skip: !RUN }, async () => {
  const document = await createDocument(await createObligation());
  await mutate('/api/ext/compliance/evaluate', { cookie: cookieTi, key: newKey('eval-a') });
  await mutate('/api/ext/compliance/evaluate', { cookie: cookieTi, key: newKey('eval-b') });
  const task = await pool.query('SELECT count(*)::int AS total FROM ext_compliance_tasks WHERE document_id=$1', [document.id]);
  assert.equal(task.rows[0].total, 1);
});

test('EXT-07 avaliação recusa data-base enviada pelo cliente', { skip: !RUN }, async () => {
  const res = await mutate('/api/ext/compliance/evaluate', {
    cookie: cookieTi, key: newKey('eval-clock'), body: { evaluation_date: '1999-01-01' },
  });
  assert.equal(res.status, 400);
  assert.ok((await body(res)).fields.includes('evaluation_date'));
});

test('EXT-07 avaliação falha fechada quando o responsável deixa de ser staff ativo', { skip: !RUN }, async () => {
  // Identidade dedicada: suspender o responsável não pode afetar outros casos.
  const orphanOwner = await makeStaff('ti');
  const obligationId = await createObligation({}, orphanOwner);
  const document = await createDocument(obligationId);
  await pool.query(`UPDATE auth_identities SET status='suspended' WHERE id=$1`, [orphanOwner.id]);
  try {
    const res = await mutate('/api/ext/compliance/evaluate', { cookie: cookieTi, key: newKey('eval-closed') });
    assert.equal(res.status, 409);
    const parsed = await body(res);
    assert.equal(parsed.error, 'responsible_staff_missing');
    assert.equal(parsed.fail_closed, true);
    const task = await pool.query('SELECT count(*)::int AS total FROM ext_compliance_tasks WHERE document_id=$1', [document.id]);
    assert.equal(task.rows[0].total, 0, 'sem responsável não existe tarefa');
  } finally {
    await pool.query(`UPDATE auth_identities SET status='active' WHERE id=$1`, [orphanOwner.id]);
  }
  const retry = await mutate('/api/ext/compliance/evaluate', { cookie: cookieTi, key: newKey('eval-reopen') });
  assert.equal(retry.status, 200);
  const task = await pool.query('SELECT count(*)::int AS total FROM ext_compliance_tasks WHERE document_id=$1', [document.id]);
  assert.equal(task.rows[0].total, 1);
});

test('EXT-07 banco recusa tarefa sem responsável canônico', { skip: !RUN }, async () => {
  const document = await createDocument(await createObligation());
  await assert.rejects(() => pool.query(
    `INSERT INTO ext_compliance_tasks (obligation_id,document_id,validity_period,rule,evaluation_date,due_date,facts,created_by_identity)
     VALUES ($1,$2,'2026-01-01:2026-12-31','regra sintetica QA',CURRENT_DATE,CURRENT_DATE,'{"rule":"qa"}'::jsonb,$3)`,
    [document.obligation_id, document.id, ti.id],
  ), /ext_compliance_tasks_responsible_required/);
});

test('EXT-07 banco recusa tarefa sem fatos registrados', { skip: !RUN }, async () => {
  const document = await createDocument(await createObligation());
  await assert.rejects(() => pool.query(
    `INSERT INTO ext_compliance_tasks (obligation_id,document_id,validity_period,rule,evaluation_date,due_date,facts,responsible_identity,created_by_identity)
     VALUES ($1,$2,'2026-01-01:2026-12-31','regra sintetica QA',CURRENT_DATE,CURRENT_DATE,'{}'::jsonb,$3,$3)`,
    [document.obligation_id, document.id, ti.id],
  ), /ext_compliance_tasks_facts_shape/);
});

// ---------------------------------------------------------------------------
// Máquina de estados da tarefa
// ---------------------------------------------------------------------------
async function taskForFreshDocument() {
  const document = await createDocument(await createObligation());
  await mutate('/api/ext/compliance/evaluate', { cookie: cookieTi, key: newKey('eval-task') });
  const found = await pool.query('SELECT id FROM ext_compliance_tasks WHERE document_id=$1', [document.id]);
  assert.equal(found.rowCount, 1);
  return found.rows[0].id;
}

test('EXT-07 tarefa aparece na listagem canônica com regra e data-base', { skip: !RUN }, async () => {
  const taskId = await taskForFreshDocument();
  const res = await get('/api/ext/compliance/tasks', cookieTi);
  assert.equal(res.status, 200);
  const parsed = await body(res);
  const item = parsed.items.find(entry => entry.id === taskId);
  assert.ok(item, 'a tarefa criada precisa aparecer na listagem');
  assert.equal(item.rule, 'vencimento_na_data_base_do_servidor');
  assert.ok(item.evaluation_date);
  assert.deepEqual(parsed.rule_catalog, ['vencimento_na_data_base_do_servidor']);
  assert.match(parsed.continuous_monitoring, /agendamento futuro/);
});

test('EXT-07 conclusão sem resultado é recusada e conclusão válida registra autoria', { skip: !RUN }, async () => {
  const taskId = await taskForFreshDocument();
  const missing = await mutate(`/api/ext/compliance/tasks/${taskId}/complete`, { cookie: cookieTi, key: newKey('done-0') });
  assert.equal(missing.status, 400);
  assert.equal((await body(missing)).error, 'completion_result_required');

  const done = await mutate(`/api/ext/compliance/tasks/${taskId}/complete`, {
    cookie: cookieTi, key: newKey('done-1'), body: { result: 'Renovacao sintetica protocolada internamente.' },
  });
  assert.equal(done.status, 200);
  const stored = await pool.query('SELECT status, completed_by_identity, completed_at, completion_result FROM ext_compliance_tasks WHERE id=$1', [taskId]);
  assert.equal(stored.rows[0].status, 'concluida');
  assert.equal(stored.rows[0].completed_by_identity, ti.id);
  assert.ok(stored.rows[0].completed_at);
});

test('EXT-07 tarefa terminal não reabre por API nem por banco', { skip: !RUN }, async () => {
  const taskId = await taskForFreshDocument();
  await mutate(`/api/ext/compliance/tasks/${taskId}/complete`, {
    cookie: cookieTi, key: newKey('done-2'), body: { result: 'Conclusao sintetica para teste terminal.' },
  });
  const reopen = await mutate(`/api/ext/compliance/tasks/${taskId}/start`, { cookie: cookieTi, key: newKey('reopen') });
  assert.equal(reopen.status, 409);
  assert.equal((await body(reopen)).error, 'terminal_task_cannot_reopen');
  await assert.rejects(() => pool.query(`UPDATE ext_compliance_tasks SET status='aberta' WHERE id=$1`, [taskId]), /terminal compliance task is immutable/);
});

test('EXT-07 início e cancelamento seguem a máquina de estados', { skip: !RUN }, async () => {
  const taskId = await taskForFreshDocument();
  const started = await mutate(`/api/ext/compliance/tasks/${taskId}/start`, { cookie: cookieTi, key: newKey('start') });
  assert.equal(started.status, 200);
  const again = await mutate(`/api/ext/compliance/tasks/${taskId}/start`, { cookie: cookieTi, key: newKey('start-2') });
  assert.equal(again.status, 409);
  assert.equal((await body(again)).error, 'invalid_transition');

  const shortJustification = await mutate(`/api/ext/compliance/tasks/${taskId}/cancel`, {
    cookie: cookieTi, key: newKey('cancel-0'), body: { justification: 'curto' },
  });
  assert.equal(shortJustification.status, 400);

  const cancelled = await mutate(`/api/ext/compliance/tasks/${taskId}/cancel`, {
    cookie: cookieTi, key: newKey('cancel-1'), body: { justification: 'Cancelamento sintetico justificado para QA.' },
  });
  assert.equal(cancelled.status, 200);
  const stored = await pool.query('SELECT status, cancelled_by_identity, cancellation_justification FROM ext_compliance_tasks WHERE id=$1', [taskId]);
  assert.equal(stored.rows[0].status, 'cancelada');
  assert.equal(stored.rows[0].cancelled_by_identity, ti.id);
});

test('EXT-07 banco recusa alteração da procedência da tarefa', { skip: !RUN }, async () => {
  const taskId = await taskForFreshDocument();
  await assert.rejects(() => pool.query(`UPDATE ext_compliance_tasks SET rule='regra_trocada' WHERE id=$1`, [taskId]), /provenance is immutable/);
  await assert.rejects(() => pool.query(`UPDATE ext_compliance_tasks SET facts='{"forjado":true}'::jsonb WHERE id=$1`, [taskId]), /provenance is immutable/);
  await assert.rejects(() => pool.query('DELETE FROM ext_compliance_tasks WHERE id=$1', [taskId]), /history is immutable/);
});

// ---------------------------------------------------------------------------
// Renovação, versionamento e histórico
// ---------------------------------------------------------------------------
test('EXT-07 renovação cria nova versão e preserva o registro anterior', { skip: !RUN }, async () => {
  const obligationId = await createObligation();
  const first = await createDocument(obligationId);
  const res = await mutate(`/api/ext/compliance/documents/${first.id}/renew`, {
    cookie: cookieTi,
    key: newKey('renew'),
    body: {
      issue_date: isoOffset(-5), expiry_date: isoOffset(360),
      renewal_justification: 'Renovacao sintetica declarada pela equipe interna.',
      declared_reference: `REF-RENOVADA-${randomUUID().slice(0, 8)}`,
    },
  });
  const parsed = await body(res);
  assert.equal(res.status, 201, JSON.stringify(parsed));
  assert.equal(parsed.document.version_no, 2);
  assert.equal(parsed.document.replacement_of, first.id);
  assert.equal(parsed.previous_version.preserved, true);

  const previous = await pool.query('SELECT title, expiry_date, declared_reference, superseded_by, superseded_by_identity, status FROM ext_compliance_documents WHERE id=$1', [first.id]);
  assert.equal(previous.rows[0].title, first.title, 'conteúdo anterior intacto');
  assert.equal(previous.rows[0].expiry_date.toISOString().slice(0, 10), first.expiry_date);
  assert.equal(previous.rows[0].declared_reference, first.declared_reference);
  assert.equal(previous.rows[0].superseded_by, parsed.document.id);
  assert.equal(previous.rows[0].superseded_by_identity, ti.id);

  const current = await pool.query(
    `SELECT count(*)::int AS total FROM ext_compliance_documents
      WHERE obligation_id=$1 AND origin='ext07_canonica' AND superseded_by IS NULL AND status::text <> 'cancelada'`,
    [obligationId],
  );
  assert.equal(current.rows[0].total, 1, 'no máximo uma versão atual por obrigação');

  const detail = await get(`/api/ext/compliance/documents/${parsed.document.id}`, cookieTi);
  const history = (await body(detail)).history;
  assert.equal(history.length, 2, 'histórico preserva as duas versões');
  assert.deepEqual(history.map(entry => entry.version_no), [1, 2]);
});

test('EXT-07 renovação exige justificativa e precisa avançar a validade', { skip: !RUN }, async () => {
  const document = await createDocument(await createObligation());
  const noJustification = await mutate(`/api/ext/compliance/documents/${document.id}/renew`, {
    cookie: cookieTi, key: newKey('renew-0'), body: { issue_date: isoOffset(-5), expiry_date: isoOffset(360) },
  });
  assert.equal(noJustification.status, 400);
  assert.equal((await body(noJustification)).error, 'renewal_justification_required');

  const noProgress = await mutate(`/api/ext/compliance/documents/${document.id}/renew`, {
    cookie: cookieTi,
    key: newKey('renew-1'),
    body: { issue_date: isoOffset(-400), expiry_date: document.expiry_date, renewal_justification: 'Tentativa sintetica sem avanco de validade.' },
  });
  assert.equal(noProgress.status, 409);
  assert.equal((await body(noProgress)).error, 'renewal_must_extend_validity');
});

test('EXT-07 documento já substituído não renova duas vezes', { skip: !RUN }, async () => {
  const first = await createDocument(await createObligation());
  const renew = { issue_date: isoOffset(-5), expiry_date: isoOffset(360), renewal_justification: 'Renovacao sintetica unica para QA.' };
  assert.equal((await mutate(`/api/ext/compliance/documents/${first.id}/renew`, { cookie: cookieTi, key: newKey('r1'), body: renew })).status, 201);
  const second = await mutate(`/api/ext/compliance/documents/${first.id}/renew`, {
    cookie: cookieTi, key: newKey('r2'), body: { ...renew, expiry_date: isoOffset(400) },
  });
  assert.equal(second.status, 409);
  assert.equal((await body(second)).error, 'document_already_superseded');
});

test('EXT-07 banco impede sobrescrita destrutiva e ciclo de substituição', { skip: !RUN }, async () => {
  const document = await createDocument(await createObligation());
  await assert.rejects(() => pool.query(`UPDATE ext_compliance_documents SET title='sobrescrito' WHERE id=$1`, [document.id]), /immutable; create a renewal/);
  await assert.rejects(() => pool.query(`UPDATE ext_compliance_documents SET expiry_date=CURRENT_DATE+900 WHERE id=$1`, [document.id]), /immutable; create a renewal/);
  await assert.rejects(() => pool.query(`UPDATE ext_compliance_documents SET declared_reference='forjada' WHERE id=$1`, [document.id]), /immutable; create a renewal/);
  // A guarda de cadeia dispara antes do CHECK (ordem alfabética das triggers):
  // qualquer uma das três mensagens prova que o autociclo foi barrado.
  await assert.rejects(
    () => pool.query('UPDATE ext_compliance_documents SET replacement_of=id WHERE id=$1', [document.id]),
    /no_self_replacement|immutable|cannot form a cycle/,
  );
  await assert.rejects(() => pool.query('UPDATE ext_compliance_documents SET superseded_by=id WHERE id=$1', [document.id]), /no_self_supersede/);
});

// ---------------------------------------------------------------------------
// Legado EXT-07 e não regressão EXT-08..12
// ---------------------------------------------------------------------------
test('EXT-07 legado preserva leitura autorizada, alias items e 401/403', { skip: !RUN }, async () => {
  const anonymous = await get('/api/ext/compliance-documents');
  assert.equal(anonymous.status, 401, 'autenticação vem antes de qualquer 410');
  const forbidden = await get('/api/ext/compliance-documents', cookieRh);
  assert.equal(forbidden.status, 403);
  const allowed = await get('/api/ext/compliance-documents', cookieTi);
  assert.equal(allowed.status, 200);
  const parsed = await body(allowed);
  assert.ok(Array.isArray(parsed.items), 'o alias items do legado precisa continuar existindo');
});

test('EXT-07 escritor legado recebe 410 só depois dos guardas', { skip: !RUN }, async () => {
  const anonymous = await mutate('/api/ext/compliance-documents', { key: newKey('leg-anon') });
  assert.equal(anonymous.status, 401);
  const forbidden = await mutate('/api/ext/compliance-documents', { cookie: cookieRh, key: newKey('leg-rh') });
  assert.equal(forbidden.status, 403);
  const crossOrigin = await mutate('/api/ext/compliance-documents', { cookie: cookieTi, key: newKey('leg-xo'), origin: 'https://atacante.invalid' });
  assert.equal(crossOrigin.status, 403, 'same-origin é verificado antes do 410');
  const retired = await mutate('/api/ext/compliance-documents', { cookie: cookieTi, key: newKey('leg-w') });
  assert.equal(retired.status, 410);
  const parsed = await body(retired);
  assert.equal(parsed.error, 'legacy_writer_retired');
  assert.equal(parsed.canonical, '/api/ext/compliance/*');
});

test('EXT-07 não introduz segundo escritor na mesma entidade', { skip: !RUN }, async () => {
  const before = await pool.query(`SELECT count(*)::int AS total FROM ext_compliance_documents WHERE origin='ext07_canonica'`);
  for (const legacy of ['/api/admin/hr/ext-compliance-documents', '/api/crm/hr/ext-compliance-documents', '/api/hr/ext-compliance-documents', '/api/ext/compliance-documents']) {
    const res = await mutate(legacy, { cookie: cookieTi, key: newKey('leg-write'), body: documentPayload(randomUUID()) });
    assert.ok([403, 410].includes(res.status), `${legacy} não pode escrever (${res.status})`);
  }
  const after = await pool.query(`SELECT count(*)::int AS total FROM ext_compliance_documents WHERE origin='ext07_canonica'`);
  assert.equal(after.rows[0].total, before.rows[0].total);
});

test('EXT-07 não regride EXT-08..12', { skip: !RUN }, async () => {
  for (const pathname of [
    '/api/ext/knowledge-base', '/api/ext/expansion-plans',
    '/api/ext/expansion-scenarios', '/api/ext/analytics-experiments',
  ]) {
    const anonymous = await get(pathname);
    assert.equal(anonymous.status, 401, `${pathname} deveria exigir sessão`);
    const authorized = await get(pathname, cookieTi);
    assert.equal(authorized.status, 200, `${pathname} deveria continuar respondendo para staff`);
    const parsed = await body(authorized);
    assert.ok(Array.isArray(parsed.items), `${pathname} deveria preservar o alias items`);
  }
  // EXT-10: a fronteira de sessão continua valendo (ver o caso seguinte sobre
  // o defeito pré-existente da leitura autorizada).
  const continuity = await get('/api/ext/continuity-plans');
  assert.equal(continuity.status, 401, '/api/ext/continuity-plans deveria exigir sessão');
});

test('EXT-07 registra defeito PRÉ-EXISTENTE de EXT-10 sem mascarar nem corrigir fora de escopo', { skip: !RUN }, async () => {
  // /api/ext/continuity-plans seleciona `ca.name`, coluna que NÃO existe em
  // client_accounts (migração 004 criou `display_name`). A consulta rejeita e
  // a requisição autorizada fica sem resposta.
  //
  // Isto foi REPRODUZIDO no commit base eff0bbd, antes de qualquer alteração
  // da EXT-07: não é regressão desta entrega e está FORA DO ESCOPO declarado.
  // O caso é determinístico: aceita tanto o defeito atual quanto uma correção
  // futura, e não serve de desculpa para a EXT-07.
  const columns = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'client_accounts' AND column_name IN ('name','display_name')
      ORDER BY column_name`,
  );
  assert.deepEqual(columns.rows.map(row => row.column_name), ['display_name'],
    'client_accounts tem display_name e não name');

  let outcome = 'sem_resposta';
  try {
    const res = await fetch(`${baseUrl}/api/ext/continuity-plans`, {
      headers: { accept: 'application/json', cookie: cookieTi },
      signal: AbortSignal.timeout(5000),
      redirect: 'manual',
    });
    outcome = `http_${res.status}`;
    await res.text();
  } catch {
    outcome = 'sem_resposta';
  }
  assert.ok(['sem_resposta', 'http_200', 'http_500', 'http_503'].includes(outcome),
    `estado de EXT-10 registrado: ${outcome}`);
  console.log(`EXT07_EXT10_PREEXISTING_DEFECT: /api/ext/continuity-plans autorizado -> ${outcome} (fora do escopo da EXT-07)`);
});

// ---------------------------------------------------------------------------
// Tela interna
// ---------------------------------------------------------------------------
test('EXT-07 tela /admin/compliance responde e declara as fronteiras', { skip: !RUN }, async () => {
  const res = await fetch(`${baseUrl}/admin/compliance`, { redirect: 'manual' });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Compliance corporativo/);
  assert.match(html, /vencimento gera tarefa e documento privado/i);
  assert.match(html, /não representa upload, bytes, checksum, malware scan, armazenamento verificado ou download/);
  assert.doesNotMatch(html, /storage_key/);
});

test('EXT-07 agregados informam fonte, denominador e ausência distinta de zero', { skip: !RUN }, async () => {
  const res = await get('/api/ext/compliance/obligations', cookieTi);
  const parsed = await body(res);
  assert.equal(parsed.source, 'ext_compliance_obligations');
  assert.equal(parsed.base_date_source, 'postgres_current_date');
  assert.equal(typeof parsed.denominator, 'number');
  assert.equal(parsed.absence_is_not_zero, parsed.denominator === 0);
  assert.match(parsed.absence_note, /nao ausencia de obrigacao ou de risco/);
});
