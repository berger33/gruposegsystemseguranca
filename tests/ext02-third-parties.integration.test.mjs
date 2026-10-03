// EXT-02 — jornada de terceiros exercitada por HTTP REAL contra PostgreSQL
// REAL. Executado por scripts/qa-ext02-third-parties-postgres.mjs, que sobe um
// cluster descartável, aplica 001–148 e injeta DATABASE_URL.
//
// Regra desta suíte: nenhum veredito vem de SQL que simule o que a API deveria
// fazer. Todo veredito funcional vem de uma resposta HTTP do servidor de
// verdade; o SQL só (a) semeia fixtures canônicos sintéticos, (b) confere o
// que ficou gravado e (c) prova as travas do banco (triggers de imutabilidade
// e injeção de falha de auditoria).
//
// Critério do plano provado aqui: "terceiro acessa só OS/contrato autorizado e
// perde acesso ao término" — ver os testes marcados CRITÉRIO DO PLANO.
//
// FRONTEIRA DECLARADA: não existe ator externo "terceiro" autenticado. Nenhum
// teste simula login de terceiro; o que se prova é a imposição da janela e do
// escopo nos registros canônicos e em toda consulta derivada do lado staff.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { hashPassword } from '../src/lib/client-auth-core.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');

let server, baseUrl, pool;
let ti, rh, cookieTi, cookieRh;

function todayIso(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/admin/session`, { headers: { accept: 'application/json' } });
      if (res.status === 401 || res.status === 200) return true;
    } catch { /* ainda subindo */ }
    await new Promise(r => setTimeout(r, 400));
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
      NEXT_DIST_DIR: '.next/integration-ext02',
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
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  ti = await makeStaff('ti');
  rh = await makeStaff('rh');
  cookieTi = await login(ti);
  cookieRh = await login(rh);
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 300));
    server.kill('SIGKILL');
  }
});

/** Identidade staff sintética (domínio .invalid, sem dado real). */
async function makeStaff(role) {
  const id = randomUUID();
  const email = `qa-ext02-${role}-${id.slice(0, 8)}@exemplo.invalid`;
  const password = 'Senha-Sintetica-9!';
  await pool.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status) VALUES ($1,'staff',$2,$3,'active')`,
    [id, email, `QA EXT-02 ${role}`],
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
  const cookie = (res.headers.getSetCookie?.() || []).find(c => c.startsWith('seg_admin_session='));
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
function mutate(pathname, { method = 'POST', body, cookie, key, origin = baseUrl } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
      ...(cookie ? { cookie } : {}),
      ...(key ? { 'idempotency-key': key } : {}),
    },
    body: JSON.stringify(body ?? {}),
    redirect: 'manual',
  });
}

function newKey(tag) {
  return `ext02-${tag}-${randomUUID()}`;
}

/** Contrato canônico sintético em crm_contracts (via proposta mínima). */
async function makeContract(status = 'ativo') {
  const proposal = await pool.query(
    `INSERT INTO crm_proposals (title) VALUES ($1) RETURNING id`,
    [`Proposta sintética EXT-02 ${randomUUID().slice(0, 8)}`],
  );
  const { rows } = await pool.query(
    `INSERT INTO crm_contracts (proposal_id, proposal_version, title, status, idempotency_key, created_by)
     VALUES ($1, 1, $2, $3::crm_contract_status, $4, 'qa_ext02') RETURNING id, title, status`,
    [proposal.rows[0].id, `Contrato sintético EXT-02 ${randomUUID().slice(0, 8)}`, status, randomUUID()],
  );
  return rows[0];
}

/** OS canônica sintética em ast_service_orders. */
async function makeServiceOrder({ contractId = null, status = 'aberta' } = {}) {
  const suffix = randomBytes(2).toString('hex').toUpperCase();
  const protocol = `OS-AST-${todayIso().replaceAll('-', '')}-${suffix}`;
  const { rows } = await pool.query(
    `INSERT INTO ast_service_orders (protocol, title, description, requester_name, contract_id, status)
     VALUES ($1,$2,$3,'Solicitante Sintético',$4,$5::ast_os_status) RETURNING id, protocol, status, contract_id`,
    [protocol, 'OS sintética para EXT-02', 'Ordem de serviço sintética criada apenas para o gate EXT-02.', contractId, status],
  );
  return rows[0];
}

/** Terceiro criado PELA API (nunca por SQL): a jornada é a fonte. */
async function createParty(nameTag = 'Fornecedor') {
  const res = await mutate('/api/ext/third-party/parties', {
    cookie: cookieTi,
    key: newKey('party'),
    body: { name: `${nameTag} Sintético ${randomUUID().slice(0, 8)}`, category: 'prestador', responsible_name: 'Responsável Sintético' },
  });
  const { body, text } = await readJson(res);
  assert.equal(res.status, 201, text);
  return body.third_party;
}

/** Lê o corpo UMA vez: usar `await res.text()` como mensagem de assert
 *  consumiria o stream e quebraria o `res.json()` seguinte. */
async function readJson(res) {
  const text = await res.text();
  try { return { body: JSON.parse(text), text }; } catch { return { body: null, text }; }
}

async function bindContract(partyId, contractId) {
  const res = await mutate(`/api/ext/third-party/parties/${partyId}/contract`, {
    cookie: cookieTi,
    key: newKey('bind'),
    body: { contract_id: contractId, justification: 'Vínculo sintético verificado para o gate EXT-02.' },
  });
  const { text } = await readJson(res);
  assert.equal(res.status, 201, text);
  return res;
}

// ---------------------------------------------------------------------------
// Autorização: anônimo, papel sem direito, papel autorizado.
// ---------------------------------------------------------------------------

test('EXT-02 HTTP: anônimo não lê nem escreve na jornada canônica', { skip: !RUN }, async () => {
  const list = await get('/api/ext/third-party/parties');
  assert.equal(list.status, 401);
  assert.equal((await list.json()).error, 'unauthorized');

  const write = await mutate('/api/ext/third-party/parties', { key: newKey('anon'), body: { name: 'Terceiro Anônimo' } });
  assert.equal(write.status, 401);

  const { rows } = await pool.query(`SELECT count(*)::int AS total FROM ext_third_parties WHERE name = 'Terceiro Anônimo'`);
  assert.equal(rows[0].total, 0, 'anônimo não pode ter gravado nada');
});

test('EXT-02 HTTP: papel staff sem direito recebe 403 (não 401) e não grava', { skip: !RUN }, async () => {
  const list = await get('/api/ext/third-party/parties', cookieRh);
  assert.equal(list.status, 403, 'rh autenticado precisa ser negado por PAPEL');
  assert.equal((await list.json()).error, 'forbidden_role');

  const write = await mutate('/api/ext/third-party/parties', {
    cookie: cookieRh, key: newKey('rh'), body: { name: 'Terceiro Papel Errado' },
  });
  assert.equal(write.status, 403);

  const { rows } = await pool.query(`SELECT count(*)::int AS total FROM ext_third_parties WHERE name = 'Terceiro Papel Errado'`);
  assert.equal(rows[0].total, 0);
});

test('EXT-02 HTTP: mutação sem same-origin é recusada mesmo com sessão válida', { skip: !RUN }, async () => {
  const res = await mutate('/api/ext/third-party/parties', {
    cookie: cookieTi, key: newKey('origin'), origin: 'http://atacante.invalid',
    body: { name: 'Terceiro Origem Estranha' },
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'origin_forbidden');
  const { rows } = await pool.query(`SELECT count(*)::int AS total FROM ext_third_parties WHERE name = 'Terceiro Origem Estranha'`);
  assert.equal(rows[0].total, 0);
});

// ---------------------------------------------------------------------------
// Cadastro: autoria derivada da sessão; corpo do navegador não manda em id,
// autoria, origem, vínculo, janela nem nota.
// ---------------------------------------------------------------------------

test('EXT-02 HTTP: cadastro deriva autoria da sessão e ignora id/autoria/vínculo/janela/nota do corpo', { skip: !RUN }, async () => {
  const forgedId = randomUUID();
  const forgedContract = randomUUID();
  const name = `Terceiro Corpo Forjado ${randomUUID().slice(0, 8)}`;
  const res = await mutate('/api/ext/third-party/parties', {
    cookie: cookieTi,
    key: newKey('forged'),
    body: {
      id: forgedId,
      name,
      created_by_identity: rh.id,
      origin: 'registro_legado',
      contract_id: forgedContract,
      contract_verified_at: '2020-01-01T00:00:00Z',
      access_start: '2020-01-01',
      access_end: '2039-12-31',
      evaluation_score: 10,
      status: 'ativo',
    },
  });
  const { body: createdBody, text: createdText } = await readJson(res);
  assert.equal(res.status, 201, createdText);
  const created = createdBody.third_party;
  assert.notEqual(created.id, forgedId, 'o id do corpo não pode virar o id do registro');

  const { rows } = await pool.query(`SELECT * FROM ext_third_parties WHERE id=$1`, [created.id]);
  const row = rows[0];
  assert.equal(row.created_by_identity, ti.id, 'autoria vem da sessão, não do corpo');
  assert.equal(row.origin, 'jornada_terceiros', 'origem é imposta pelo servidor');
  assert.equal(row.contract_id, null, 'vínculo de contrato não é aceito pelo corpo do cadastro');
  assert.equal(row.contract_verified_at, null);
  assert.equal(row.access_start, null, 'janela não é campo livre do cadastro');
  assert.equal(row.access_end, null);
  assert.equal(row.evaluation_score, null, 'nota não é aceita pelo corpo do cadastro');

  const events = await pool.query(
    `SELECT event_type, created_by_identity FROM ext_third_party_events WHERE third_party_id=$1`, [created.id]);
  assert.equal(events.rows.length, 1, 'a criação grava exatamente um evento imutável');
  assert.equal(events.rows[0].event_type, 'terceiro_criado');
  assert.equal(events.rows[0].created_by_identity, ti.id);

  const audit = await pool.query(
    `SELECT count(*)::int AS total FROM audit_log WHERE action='ext_third_party_create' AND target=$1`, [created.id]);
  assert.equal(audit.rows[0].total, 1, 'auditoria gravada na mesma transação');
});

// ---------------------------------------------------------------------------
// Idempotência real sobre o ledger de eventos.
// ---------------------------------------------------------------------------

test('EXT-02 HTTP: retry idêntico não duplica; chave reusada com conteúdo diferente responde 409', { skip: !RUN }, async () => {
  const key = newKey('retry');
  const name = `Terceiro Retry ${randomUUID().slice(0, 8)}`;
  const body = { name, category: 'prestador' };

  const first = await mutate('/api/ext/third-party/parties', { cookie: cookieTi, key, body });
  assert.equal(first.status, 201);
  const firstId = (await first.json()).third_party.id;

  const retry = await mutate('/api/ext/third-party/parties', { cookie: cookieTi, key, body });
  assert.equal(retry.status, 200, 'replay idêntico devolve o registro, não cria outro');
  const replayed = await retry.json();
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.third_party.id, firstId);

  const divergent = await mutate('/api/ext/third-party/parties', {
    cookie: cookieTi, key, body: { name: `${name} alterado`, category: 'prestador' },
  });
  assert.equal(divergent.status, 409);
  assert.equal((await divergent.json()).error, 'idempotency_key_reused');

  const { rows } = await pool.query(`SELECT count(*)::int AS total FROM ext_third_parties WHERE name LIKE $1`, [`${name}%`]);
  assert.equal(rows[0].total, 1, 'nenhuma duplicata no banco após retry e reuso divergente');

  const noKey = await mutate('/api/ext/third-party/parties', { cookie: cookieTi, body });
  assert.equal(noKey.status, 400);
  assert.equal((await noKey.json()).error, 'idempotency_key_required');
});

// ---------------------------------------------------------------------------
// Vínculo de contrato só após validação canônica no servidor.
// ---------------------------------------------------------------------------

test('EXT-02 HTTP: contrato inexistente é recusado (404) e nada é gravado', { skip: !RUN }, async () => {
  const party = await createParty();
  const res = await mutate(`/api/ext/third-party/parties/${party.id}/contract`, {
    cookie: cookieTi, key: newKey('bindghost'),
    body: { contract_id: randomUUID(), justification: 'Tentativa de vínculo com contrato inexistente.' },
  });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'contract_not_found');

  const { rows } = await pool.query(`SELECT contract_id, contract_verified_at FROM ext_third_parties WHERE id=$1`, [party.id]);
  assert.equal(rows[0].contract_id, null, 'id de contrato vindo do corpo não é persistido sem validação canônica');
  assert.equal(rows[0].contract_verified_at, null);
});

test('EXT-02 HTTP: vínculo aceito registra quem verificou, quando e a situação canônica observada', { skip: !RUN }, async () => {
  const party = await createParty();
  const contract = await makeContract('ativo');
  await bindContract(party.id, contract.id);

  const { rows } = await pool.query(
    `SELECT contract_id, contract_verified_at, contract_verified_by_identity, contract_verified_status
       FROM ext_third_parties WHERE id=$1`, [party.id]);
  assert.equal(rows[0].contract_id, contract.id);
  assert.ok(rows[0].contract_verified_at, 'a verificação canônica precisa ficar registrada');
  assert.equal(rows[0].contract_verified_by_identity, ti.id, 'quem verificou vem da sessão');
  assert.equal(rows[0].contract_verified_status, 'ativo', 'a situação observada é gravada como fato');
});

// ---------------------------------------------------------------------------
// CRITÉRIO DO PLANO — escopo autorizado.
// ---------------------------------------------------------------------------

test('EXT-02 HTTP: janela só é concedida sobre escopo canonicamente vinculado', { skip: !RUN }, async () => {
  const party = await createParty();
  const bound = await makeContract('ativo');
  const other = await makeContract('ativo');
  await bindContract(party.id, bound.id);

  const alheio = await mutate(`/api/ext/third-party/parties/${party.id}/access-grants`, {
    cookie: cookieTi, key: newKey('grantother'),
    body: {
      scope_kind: 'contrato', scope_id: other.id,
      access_start: todayIso(), access_end: todayIso(30),
      justification: 'Tentativa de conceder acesso a contrato não vinculado.',
    },
  });
  assert.equal(alheio.status, 409);
  assert.equal((await alheio.json()).error, 'contract_not_bound_to_third_party');

  const encerrado = await makeContract('encerrado');
  const partyB = await createParty();
  await bindContract(partyB.id, encerrado.id);
  const bloqueado = await mutate(`/api/ext/third-party/parties/${partyB.id}/access-grants`, {
    cookie: cookieTi, key: newKey('grantclosed'),
    body: {
      scope_kind: 'contrato', scope_id: encerrado.id,
      access_start: todayIso(), access_end: todayIso(10),
      justification: 'Tentativa de conceder acesso sobre contrato encerrado.',
    },
  });
  assert.equal(bloqueado.status, 409);
  assert.equal((await bloqueado.json()).error, 'contract_not_grantable');

  const { rows } = await pool.query(
    `SELECT count(*)::int AS total FROM ext_third_party_access_grants WHERE third_party_id = ANY($1::uuid[])`,
    [[party.id, partyB.id]]);
  assert.equal(rows[0].total, 0, 'nenhuma janela gravada quando o escopo não autoriza');
});

test('EXT-02 HTTP: CRITÉRIO DO PLANO — acesso vale só para o escopo autorizado', { skip: !RUN }, async () => {
  const party = await createParty();
  const contract = await makeContract('ativo');
  await bindContract(party.id, contract.id);
  const outroContrato = await makeContract('ativo');
  const osDoContrato = await makeServiceOrder({ contractId: contract.id });

  const grant = await mutate(`/api/ext/third-party/parties/${party.id}/access-grants`, {
    cookie: cookieTi, key: newKey('grant'),
    body: {
      scope_kind: 'contrato', scope_id: contract.id,
      access_start: todayIso(-1), access_end: todayIso(30),
      justification: 'Janela sintética de acesso para o contrato vinculado.',
    },
  });
  const { body: grantBody, text: grantText } = await readJson(grant);
  assert.equal(grant.status, 201, grantText);
  assert.equal(grantBody.access_grant.window.status, 'vigente');
  assert.equal(grantBody.external_actor_boundary.authenticated_third_party_channel, false);
  assert.equal(grantBody.external_actor_boundary.status, 'pendente');

  const autorizado = await get(
    `/api/ext/third-party/parties/${party.id}/authorization?scope_kind=contrato&scope_id=${contract.id}`, cookieTi);
  assert.equal(autorizado.status, 200);
  const decisao = await autorizado.json();
  assert.equal(decisao.authorized, true);
  assert.equal(decisao.reason, 'janela_vigente');
  assert.ok(decisao.base_date, 'a decisão declara a data-base');
  assert.ok(Array.isArray(decisao.source) && decisao.source.length >= 2, 'a decisão declara as fontes canônicas');

  const negadoOutroContrato = await get(
    `/api/ext/third-party/parties/${party.id}/authorization?scope_kind=contrato&scope_id=${outroContrato.id}`, cookieTi);
  assert.equal((await negadoOutroContrato.json()).reason, 'escopo_nao_autorizado');

  const negadoOs = await get(
    `/api/ext/third-party/parties/${party.id}/authorization?scope_kind=ordem_servico&scope_id=${osDoContrato.id}`, cookieTi);
  const negadoOsBody = await negadoOs.json();
  assert.equal(negadoOsBody.authorized, false, 'janela de contrato não estende acesso a OS não concedida');
  assert.equal(negadoOsBody.reason, 'escopo_nao_autorizado');
});

// ---------------------------------------------------------------------------
// CRITÉRIO DO PLANO — perde acesso ao término.
// ---------------------------------------------------------------------------

test('EXT-02 HTTP: CRITÉRIO DO PLANO — janela encerrada perde acesso por derivação da data registrada', { skip: !RUN }, async () => {
  const party = await createParty();
  const contract = await makeContract('ativo');
  await bindContract(party.id, contract.id);
  const os = await makeServiceOrder({ contractId: contract.id });

  // Fixture: janela registrada no passado (concedida antes e já terminada).
  // A API recusa CRIAR janela já encerrada; aqui semeia-se o fato histórico
  // para provar que a DERIVAÇÃO da perda de acesso vem da data gravada.
  const seeded = await pool.query(
    `INSERT INTO ext_third_party_access_grants
       (third_party_id, scope_kind, service_order_id, access_start, access_end, justification, granted_by_identity)
     VALUES ($1,'ordem_servico',$2,$3,$4,$5,$6) RETURNING id`,
    [party.id, os.id, todayIso(-40), todayIso(-10), 'Janela histórica sintética já encerrada.', ti.id],
  );

  const decisao = await get(
    `/api/ext/third-party/parties/${party.id}/authorization?scope_kind=ordem_servico&scope_id=${os.id}`, cookieTi);
  const body = await decisao.json();
  assert.equal(body.authorized, false, 'terminada a janela, o acesso cai sozinho');
  assert.equal(body.reason, 'janela_encerrada');
  assert.equal(body.window.status, 'expirado');
  assert.match(body.derivation, /\d{4}-\d{2}-\d{2}/, 'a derivação cita as datas que a sustentam');

  const lista = await get(`/api/ext/third-party/parties/${party.id}/access-grants`, cookieTi);
  const listaBody = await lista.json();
  const encontrada = listaBody.access_grants.find(g => g.id === seeded.rows[0].id);
  assert.equal(encontrada.window.status, 'expirado');
  assert.ok(listaBody.base_date, 'a listagem declara a data-base');
  assert.ok(listaBody.source, 'a listagem declara a fonte');

  // A API nunca cria uma janela que já nasce vencida.
  const recusa = await mutate(`/api/ext/third-party/parties/${party.id}/access-grants`, {
    cookie: cookieTi, key: newKey('past'),
    body: {
      scope_kind: 'contrato', scope_id: contract.id,
      access_start: todayIso(-20), access_end: todayIso(-5),
      justification: 'Tentativa de registrar janela retroativa já encerrada.',
    },
  });
  assert.equal(recusa.status, 400);
  assert.equal((await recusa.json()).error, 'access_window_already_ended');
});

test('EXT-02 banco: a janela não é campo livre — escopo, datas e autoria são imutáveis', { skip: !RUN }, async () => {
  const party = await createParty();
  const contract = await makeContract('ativo');
  await bindContract(party.id, contract.id);
  const grant = await mutate(`/api/ext/third-party/parties/${party.id}/access-grants`, {
    cookie: cookieTi, key: newKey('immutable'),
    body: {
      scope_kind: 'contrato', scope_id: contract.id,
      access_start: todayIso(), access_end: todayIso(5),
      justification: 'Janela sintética para provar imutabilidade do escopo.',
    },
  });
  assert.equal(grant.status, 201);
  const grantId = (await grant.json()).access_grant.id;

  await assert.rejects(
    pool.query(`UPDATE ext_third_party_access_grants SET access_end=$2 WHERE id=$1`, [grantId, todayIso(999)]),
    /access_grant_guard/, 'esticar o término precisa ser recusado pelo banco');
  await assert.rejects(
    pool.query(`UPDATE ext_third_party_access_grants SET contract_id=NULL, service_order_id=NULL WHERE id=$1`, [grantId]),
    /access_grant_guard|scope_check/, 'trocar o escopo precisa ser recusado pelo banco');
  await assert.rejects(
    pool.query(`DELETE FROM ext_third_party_access_grants WHERE id=$1`, [grantId]),
    /access_grant_guard/, 'apagar a janela precisa ser recusado pelo banco');
});

test('EXT-02 HTTP: revogação declarada corta o acesso e preserva o histórico', { skip: !RUN }, async () => {
  const party = await createParty();
  const contract = await makeContract('ativo');
  await bindContract(party.id, contract.id);
  const criada = await mutate(`/api/ext/third-party/parties/${party.id}/access-grants`, {
    cookie: cookieTi, key: newKey('revgrant'),
    body: {
      scope_kind: 'contrato', scope_id: contract.id,
      access_start: todayIso(), access_end: todayIso(60),
      justification: 'Janela sintética que será revogada no gate.',
    },
  });
  const grantId = (await criada.json()).access_grant.id;

  const revoke = await mutate(`/api/ext/third-party/access-grants/${grantId}/revoke`, {
    cookie: cookieTi, key: newKey('revoke'), body: { reason: 'Encerramento antecipado sintético.' },
  });
  assert.equal(revoke.status, 200, (await readJson(revoke)).text);

  const { rows } = await pool.query(`SELECT * FROM ext_third_party_access_grants WHERE id=$1`, [grantId]);
  assert.ok(rows[0].revoked_at, 'a revogação fica registrada');
  assert.equal(rows[0].revoked_by_identity, ti.id, 'autor da revogação vem da sessão');
  assert.equal(rows[0].revoke_reason, 'Encerramento antecipado sintético.');
  assert.equal(new Date(rows[0].access_end).toISOString().slice(0, 10), todayIso(60),
    'a janela original permanece intacta no histórico: revogar não reescreve o término');
  assert.equal(new Date(rows[0].access_start).toISOString().slice(0, 10), todayIso(),
    'o início registrado também permanece intacto');

  const decisao = await get(
    `/api/ext/third-party/parties/${party.id}/authorization?scope_kind=contrato&scope_id=${contract.id}`, cookieTi);
  const body = await decisao.json();
  assert.equal(body.authorized, false);
  assert.equal(body.reason, 'janela_revogada');

  const outra = await mutate(`/api/ext/third-party/access-grants/${grantId}/revoke`, {
    cookie: cookieTi, key: newKey('revoke2'), body: { reason: 'Segunda tentativa de revogação.' },
  });
  assert.equal(outra.status, 409);
  assert.equal((await outra.json()).error, 'access_grant_already_revoked');
});

test('EXT-02 HTTP: encerrar o terceiro revoga as janelas vivas na mesma transação', { skip: !RUN }, async () => {
  const party = await createParty();
  const contract = await makeContract('ativo');
  await bindContract(party.id, contract.id);
  await mutate(`/api/ext/third-party/parties/${party.id}/access-grants`, {
    cookie: cookieTi, key: newKey('cascade'),
    body: {
      scope_kind: 'contrato', scope_id: contract.id,
      access_start: todayIso(), access_end: todayIso(90),
      justification: 'Janela viva que deve cair ao encerrar o terceiro.',
    },
  });

  const patch = await mutate(`/api/ext/third-party/parties/${party.id}`, {
    method: 'PATCH', cookie: cookieTi, key: newKey('close'),
    body: { status: 'encerrado', reason: 'Encerramento sintético do terceiro.' },
  });
  const { body: patchBody, text: patchText } = await readJson(patch);
  assert.equal(patch.status, 200, patchText);
  assert.equal(patchBody.revoked_grants, 1, 'a resposta declara quantas janelas caíram');

  const { rows } = await pool.query(
    `SELECT count(*)::int AS vivas FROM ext_third_party_access_grants WHERE third_party_id=$1 AND revoked_at IS NULL`,
    [party.id]);
  assert.equal(rows[0].vivas, 0, 'nenhuma janela sobrevive ao encerramento');

  const decisao = await get(
    `/api/ext/third-party/parties/${party.id}/authorization?scope_kind=contrato&scope_id=${contract.id}`, cookieTi);
  assert.equal((await decisao.json()).reason, 'terceiro_nao_ativo');
});

// ---------------------------------------------------------------------------
// Auditoria obrigatória: falha ⇒ 503 com rollback (prova de transação real).
// ---------------------------------------------------------------------------

test('EXT-02 HTTP+banco: auditoria indisponível devolve 503 e NADA é persistido', { skip: !RUN }, async () => {
  await pool.query(`
    CREATE OR REPLACE FUNCTION qa_ext02_audit_outage() RETURNS trigger AS $fn$
    BEGIN
      IF NEW.action LIKE 'ext_third_party%' THEN
        RAISE EXCEPTION 'qa_ext02_audit_outage: auditoria indisponível (injeção de falha do gate)';
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS qa_ext02_audit_outage_trigger ON audit_log;
    CREATE TRIGGER qa_ext02_audit_outage_trigger BEFORE INSERT ON audit_log
      FOR EACH ROW EXECUTE FUNCTION qa_ext02_audit_outage();
  `);
  try {
    const name = `Terceiro Auditoria Offline ${randomUUID().slice(0, 8)}`;
    const res = await mutate('/api/ext/third-party/parties', {
      cookie: cookieTi, key: newKey('audit'), body: { name, category: 'prestador' },
    });
    assert.equal(res.status, 503, 'auditoria obrigatória: sem ela a mutação não pode ser aceita');
    assert.equal((await res.json()).error, 'audit_unavailable');

    const party = await pool.query(`SELECT count(*)::int AS total FROM ext_third_parties WHERE name=$1`, [name]);
    assert.equal(party.rows[0].total, 0, 'rollback: o cadastro não pode ter sobrado');
    const events = await pool.query(
      `SELECT count(*)::int AS total FROM ext_third_party_events WHERE summary LIKE $1`, [`%${name}%`]);
    assert.equal(events.rows[0].total, 0, 'rollback: o evento não pode ter sobrado');
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS qa_ext02_audit_outage_trigger ON audit_log;`);
    await pool.query(`DROP FUNCTION IF EXISTS qa_ext02_audit_outage();`);
  }

  // Restaurada a auditoria, a mesma jornada volta a funcionar.
  const ok = await mutate('/api/ext/third-party/parties', {
    cookie: cookieTi, key: newKey('auditok'), body: { name: `Terceiro Auditoria Restaurada ${randomUUID().slice(0, 8)}` },
  });
  assert.equal(ok.status, 201);
});

// ---------------------------------------------------------------------------
// Documentos, vencimento e regra explícita.
// ---------------------------------------------------------------------------

test('EXT-02 HTTP: vencimento é derivado da data registrada; "a vencer" exige regra explícita', { skip: !RUN }, async () => {
  const party = await createParty();

  await mutate(`/api/ext/third-party/parties/${party.id}/documents`, {
    cookie: cookieTi, key: newKey('docv'),
    body: { document_type: 'Certidão Sintética Vencida', expiry_date: todayIso(-3) },
  });
  await mutate(`/api/ext/third-party/parties/${party.id}/documents`, {
    cookie: cookieTi, key: newKey('docp'),
    body: { document_type: 'Certidão Sintética Próxima', expiry_date: todayIso(10) },
  });
  await mutate(`/api/ext/third-party/parties/${party.id}/documents`, {
    cookie: cookieTi, key: newKey('docs'),
    body: { document_type: 'Certidão Sintética Sem Data' },
  });

  const semRegra = await get(`/api/ext/third-party/parties/${party.id}/documents`, cookieTi);
  const semRegraBody = await semRegra.json();
  const byType = t => semRegraBody.documents.find(d => d.document_type === t);
  assert.equal(byType('Certidão Sintética Vencida').expiry.status, 'vencido');
  assert.equal(byType('Certidão Sintética Sem Data').expiry.status, 'sem_data_declarada');
  assert.equal(byType('Certidão Sintética Próxima').expiry.status, 'vigente',
    'sem regra registrada nenhum "a vencer" é inferido');
  assert.equal(byType('Certidão Sintética Próxima').expiry.alert_rule_absence, 'sem_regra_de_antecedencia');
  assert.ok(semRegraBody.document_rule_absence, 'a ausência de regra é declarada na listagem');

  const regra = await mutate(`/api/ext/third-party/parties/${party.id}/document-rules`, {
    cookie: cookieTi, key: newKey('rule'),
    body: { alert_before_days: 30, justification: 'Antecedência sintética declarada para o gate.' },
  });
  assert.equal(regra.status, 201, (await readJson(regra)).text);

  const comRegra = await get(`/api/ext/third-party/parties/${party.id}/documents`, cookieTi);
  const comRegraBody = await comRegra.json();
  const proxima = comRegraBody.documents.find(d => d.document_type === 'Certidão Sintética Próxima');
  assert.equal(proxima.expiry.status, 'a_vencer', 'com regra explícita o alerta passa a existir');
  assert.equal(proxima.expiry.alert_rule.alert_before_days, 30);
  assert.ok(proxima.expiry.derivation.includes('30'), 'a derivação cita a regra que a sustenta');
  assert.ok(proxima.expiry.base_date, 'a data-base é declarada');
});

test('EXT-02 HTTP: documento é desativado com autor e motivo, nunca apagado', { skip: !RUN }, async () => {
  const party = await createParty();
  const criado = await mutate(`/api/ext/third-party/parties/${party.id}/documents`, {
    cookie: cookieTi, key: newKey('docd'),
    body: { document_type: 'Certidão Sintética a Desativar', expiry_date: todayIso(20) },
  });
  const documentId = (await criado.json()).document.id;

  const off = await mutate(`/api/ext/third-party/documents/${documentId}/deactivate`, {
    cookie: cookieTi, key: newKey('deact'), body: { reason: 'Substituída por versão sintética mais recente.' },
  });
  assert.equal(off.status, 200, (await readJson(off)).text);

  const { rows } = await pool.query(`SELECT * FROM ext_third_party_documents WHERE id=$1`, [documentId]);
  assert.equal(rows[0].is_active, false);
  assert.equal(rows[0].deactivated_by_identity, ti.id);
  assert.ok(rows[0].deactivate_reason);

  const lista = await get(`/api/ext/third-party/parties/${party.id}/documents`, cookieTi);
  const doc = (await lista.json()).documents.find(d => d.id === documentId);
  assert.equal(doc.expiry.status, 'desativado', 'documento desativado sai do controle de vencimento, mas continua visível');
});

// ---------------------------------------------------------------------------
// Avaliação com autor, data e justificativa; histórico imutável.
// ---------------------------------------------------------------------------

test('EXT-02 HTTP: avaliação exige autor, data e justificativa e vira a fonte da nota', { skip: !RUN }, async () => {
  const party = await createParty();

  const semJustificativa = await mutate(`/api/ext/third-party/parties/${party.id}/evaluations`, {
    cookie: cookieTi, key: newKey('evalbad'), body: { score: 9, evaluated_on: todayIso() },
  });
  assert.equal(semJustificativa.status, 400);
  assert.equal((await semJustificativa.json()).error, 'invalid_justification');

  const futura = await mutate(`/api/ext/third-party/parties/${party.id}/evaluations`, {
    cookie: cookieTi, key: newKey('evalfut'),
    body: { score: 9, evaluated_on: todayIso(5), justification: 'Avaliação com data no futuro.' },
  });
  assert.equal(futura.status, 400);
  assert.equal((await futura.json()).error, 'evaluated_on_in_future');

  const ok = await mutate(`/api/ext/third-party/parties/${party.id}/evaluations`, {
    cookie: cookieTi, key: newKey('eval'),
    body: { score: 8, evaluated_on: todayIso(), justification: 'Desempenho sintético avaliado para o gate EXT-02.' },
  });
  const { body: okBody, text: okText } = await readJson(ok);
  assert.equal(ok.status, 201, okText);
  const evaluation = okBody.evaluation;

  const { rows } = await pool.query(`SELECT * FROM ext_third_party_evaluations WHERE id=$1`, [evaluation.id]);
  assert.equal(rows[0].evaluated_by_identity, ti.id, 'autor da avaliação vem da sessão');
  assert.equal(rows[0].score, 8);

  const party2 = await pool.query(
    `SELECT evaluation_score, evaluation_source_id FROM ext_third_parties WHERE id=$1`, [party.id]);
  assert.equal(party2.rows[0].evaluation_score, 8);
  assert.equal(party2.rows[0].evaluation_source_id, evaluation.id,
    'a nota do cadastro aponta para a avaliação canônica que a originou');

  await assert.rejects(
    pool.query(`UPDATE ext_third_party_evaluations SET score=10 WHERE id=$1`, [evaluation.id]),
    /history_immutable/, 'avaliação não aceita UPDATE');
  await assert.rejects(
    pool.query(`DELETE FROM ext_third_party_evaluations WHERE id=$1`, [evaluation.id]),
    /history_immutable/, 'avaliação não aceita DELETE');
});

test('EXT-02 banco: o histórico de eventos é apenas-acréscimo', { skip: !RUN }, async () => {
  const party = await createParty();
  const { rows } = await pool.query(`SELECT id FROM ext_third_party_events WHERE third_party_id=$1`, [party.id]);
  await assert.rejects(
    pool.query(`UPDATE ext_third_party_events SET summary='reescrito' WHERE id=$1`, [rows[0].id]),
    /history_immutable/);
  await assert.rejects(
    pool.query(`DELETE FROM ext_third_party_events WHERE id=$1`, [rows[0].id]),
    /history_immutable/);
});

// ---------------------------------------------------------------------------
// Dossiê derivado e rotas legadas.
// ---------------------------------------------------------------------------

test('EXT-02 HTTP: dossiê declara fonte, data-base e a fronteira externa pendente', { skip: !RUN }, async () => {
  const party = await createParty();
  const contract = await makeContract('ativo');
  await bindContract(party.id, contract.id);

  const res = await get(`/api/ext/third-party/parties/${party.id}`, cookieTi);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.third_party.id, party.id);
  assert.ok(body.source, 'o dossiê declara as fontes canônicas');
  assert.ok(body.base_date, 'o dossiê declara a data-base');
  assert.equal(body.external_actor_boundary.authenticated_third_party_channel, false);
  assert.equal(body.external_actor_boundary.status, 'pendente');
  assert.ok(Array.isArray(body.events) && body.events.length >= 1, 'o dossiê traz o histórico canônico');
});

test('EXT-02 HTTP: rota legada mantém leitura autorizada e aposenta mutação com 410', { skip: !RUN }, async () => {
  const anon = await get('/api/ext/third-parties');
  assert.equal(anon.status, 401);

  const semPapel = await get('/api/ext/third-parties', cookieRh);
  assert.equal(semPapel.status, 403);

  const leitura = await get('/api/ext/third-parties', cookieTi);
  assert.equal(leitura.status, 200);
  const body = await leitura.json();
  assert.ok(Array.isArray(body.items), 'a leitura legada continua respondendo na chave `items` que ela sempre usou');
  assert.ok(Array.isArray(body.third_parties), 'o payload canônico também é oferecido');
  assert.equal(body.canonical, '/api/ext/third-party/parties', 'a resposta legada aponta a rota canônica');
  assert.ok(body.source, 'a leitura legada declara a fonte');

  for (const method of ['POST', 'PATCH']) {
    const res = await mutate('/api/ext/third-parties', {
      method, cookie: cookieTi, key: newKey('legacy'), body: { name: 'Terceiro Rota Legada' },
    });
    assert.equal(res.status, 410, `${method} legado precisa estar aposentado`);
    const payload = await res.json();
    assert.equal(payload.error, 'legacy_route_retired');
    assert.equal(payload.use, '/api/ext/third-party/parties');
  }

  const { rows } = await pool.query(`SELECT count(*)::int AS total FROM ext_third_parties WHERE name='Terceiro Rota Legada'`);
  assert.equal(rows[0].total, 0, 'a rota legada aposentada não grava nada');

  const docsLegado = await get('/api/ext/third-party-documents', cookieTi);
  assert.equal(docsLegado.status, 200);
  const docsBody = await docsLegado.json();
  assert.equal(docsBody.canonical, '/api/ext/third-party/parties/<id>/documents');
  const docsMutacao = await mutate('/api/ext/third-party-documents', {
    method: 'POST', cookie: cookieTi, key: newKey('legacydoc'), body: {},
  });
  assert.equal(docsMutacao.status, 410);
});

test('EXT-02 HTTP: listagem canônica é escopada, declara ausência e não inventa canal externo', { skip: !RUN }, async () => {
  // Contrato recém-criado, sem nenhum terceiro vinculado: a ausência é um
  // fato determinístico, não um efeito da ordem dos testes.
  const vazio = await makeContract('ativo');
  const res = await get(`/api/ext/third-party/parties?contract_id=${vazio.id}`, cookieTi);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.third_parties), 'a listagem canônica responde em `third_parties`');
  assert.equal(body.items, undefined, 'o alias legado não vaza para a rota canônica');
  assert.equal(body.third_parties_registered, false, 'ausência declarada, nunca inventada');
  assert.match(body.note, /Nenhum terceiro registrado no backend canônico/);
  assert.ok(body.scope, 'a listagem declara o escopo de quem pode ler');
  assert.ok(body.source, 'a listagem declara a fonte');
  assert.ok(body.base_date, 'a listagem declara a data-base');
  assert.equal(body.external_actor_boundary.authenticated_third_party_channel, false);

  assert.equal(body.scope.filters_applied.contract_id, vazio.id, 'o filtro aplicado é declarado na resposta');

  const filtroInvalido = await get('/api/ext/third-party/parties?status=qualquer-coisa', cookieTi);
  assert.equal(filtroInvalido.status, 400, 'filtro é validado no servidor');
  assert.equal((await filtroInvalido.json()).error, 'invalid_status');

  const contratoInvalido = await get('/api/ext/third-party/parties?contract_id=nao-e-uuid', cookieTi);
  assert.equal(contratoInvalido.status, 400, 'referência fora do formato canônico não chega ao banco');
  assert.equal((await contratoInvalido.json()).error, 'invalid_contract_id');
});
