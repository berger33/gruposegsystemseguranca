// EXT-03 — jornada de licitações exercitada por HTTP REAL contra PostgreSQL
// REAL. Executado por scripts/qa-ext03-biddings-postgres.mjs, que sobe um
// cluster descartável, aplica 001–149 e injeta DATABASE_URL.
//
// Regra desta suíte: nenhum veredito vem de SQL que simule o que a API deveria
// fazer. Todo veredito funcional vem de uma resposta HTTP do servidor de
// verdade; o SQL só (a) semeia fixtures canônicos sintéticos, (b) confere o
// que ficou gravado e (c) prova as travas do banco (triggers de imutabilidade,
// CHECK do prazo e injeção de falha de auditoria).
//
// Critério do plano provado aqui: "Edital, prazos, documentos, responsáveis,
// proposta e resultado" — ver os testes marcados CRITÉRIO DO PLANO.
//
// CONDIÇÃO DECLARADA: o critério é condicional ("se mercado relevante"). A
// relevância está INDICADA (o site cita órgãos públicos) e NÃO CONFIRMADA pelo
// proprietário. Nenhum teste aqui afirma que a empresa participa de licitação;
// todos os dados são sintéticos.
//
// FRONTEIRA DECLARADA: não existe portal público integrado nem upload real de
// arquivo. Nenhum teste simula importação de edital ou envio de proposta a
// órgão algum.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { hashPassword } from '../src/lib/client-auth-core.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
// Quando executada PELO gate, esta suíte não pode passar por skip silencioso:
// um CI verde sem banco real não prova jornada nenhuma.
const REQUIRE_DB = process.env.QA_EXT03_REQUIRE_DB === '1';
const root = path.resolve(import.meta.dirname, '..');

test('EXT-03 gate: banco real presente — skip silencioso é proibido', () => {
  if (!REQUIRE_DB) return;
  assert.ok(RUN, 'o gate exige RUN_DATABASE_INTEGRATION=1 e DATABASE_URL reais; sem eles a suíte reprova em vez de pular');
});

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
      NEXT_DIST_DIR: '.next/integration-ext03',
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
  const email = `qa-ext03-${role}-${id.slice(0, 8)}@exemplo.invalid`;
  const password = 'Senha-Sintetica-9!';
  await pool.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status) VALUES ($1,'staff',$2,$3,'active')`,
    [id, email, `QA EXT-03 ${role}`],
  );
  await pool.query(`INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)`, [id, await hashPassword(password)]);
  await pool.query(
    `INSERT INTO auth_staff_profiles (identity_id, role, assigned_by) VALUES ($1,$2,'admin_system')`,
    [id, role],
  );
  return { id, email, password, role };
}

/** Identidade sem perfil de equipe: existe, mas não pode ser responsável. */
async function makeNonStaffIdentity(status = 'active') {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status) VALUES ($1,'client',$2,$3,$4)`,
    [id, `qa-ext03-cli-${id.slice(0, 8)}@exemplo.invalid`, 'Cliente Sintético EXT-03', status],
  );
  return id;
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
  return `ext03-${tag}-${randomUUID()}`;
}

/** Lê o corpo UMA vez: usar `await res.text()` como mensagem de assert
 *  consumiria o stream e quebraria o `res.json()` seguinte. */
async function readJson(res) {
  const text = await res.text();
  try { return { body: JSON.parse(text), text }; } catch { return { body: null, text }; }
}

/** Edital criado PELA API (nunca por SQL): a jornada é a fonte. */
async function createNotice(tag = 'Edital') {
  const res = await mutate('/api/ext/bidding/notices', {
    cookie: cookieTi,
    key: newKey('notice'),
    body: {
      title: `${tag} sintético ${randomUUID().slice(0, 8)}`,
      description: 'Edital sintético criado apenas para o gate EXT-03; nenhum dado real.',
      edital_number: `ED-QA-${randomUUID().slice(0, 8)}`,
      estimated_value_cents: 150000,
    },
  });
  const { body, text } = await readJson(res);
  assert.equal(res.status, 201, text);
  return body.notice;
}

/** Registra um prazo pela API. */
async function registerDeadline(biddingId, { kind = 'entrega_proposta', dueDate = todayIso(10), source = 'edital_publicado' } = {}) {
  const res = await mutate(`/api/ext/bidding/notices/${biddingId}/deadlines`, {
    cookie: cookieTi,
    key: newKey('deadline'),
    body: { deadline_kind: kind, due_date: dueDate, source, source_reference: 'Edital sintético, item 1', justification: 'prazo declarado no edital' },
  });
  const { body, text } = await readJson(res);
  assert.equal(res.status, 201, text);
  return body.deadline;
}

// ---------------------------------------------------------------------------
// Autorização
// ---------------------------------------------------------------------------

test('EXT-03 HTTP: anônimo recebe 401 na rota canônica', { skip: !RUN }, async () => {
  const res = await get('/api/ext/bidding/notices');
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'unauthorized');
});

test('EXT-03 HTTP: papel rh recebe 403 distinto do 401 anônimo', { skip: !RUN }, async () => {
  const res = await get('/api/ext/bidding/notices', cookieRh);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'forbidden_role');

  const write = await mutate('/api/ext/bidding/notices', {
    cookie: cookieRh, key: newKey('rh'),
    body: { title: 'Edital que o rh não pode criar', description: 'descrição sintética suficiente', edital_number: `ED-RH-${randomUUID().slice(0, 8)}` },
  });
  assert.equal(write.status, 403);
});

test('EXT-03 HTTP: mutação sem same-origin é recusada', { skip: !RUN }, async () => {
  const res = await mutate('/api/ext/bidding/notices', {
    cookie: cookieTi, key: newKey('origin'), origin: 'https://atacante.invalid',
    body: { title: 'Edital de outra origem', description: 'descrição sintética suficiente', edital_number: `ED-ORI-${randomUUID().slice(0, 8)}` },
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'origin_forbidden');
});

test('EXT-03 HTTP: mutação sem Idempotency-Key é recusada com 400', { skip: !RUN }, async () => {
  const res = await mutate('/api/ext/bidding/notices', {
    cookie: cookieTi,
    body: { title: 'Edital sem chave', description: 'descrição sintética suficiente', edital_number: `ED-SK-${randomUUID().slice(0, 8)}` },
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'idempotency_key_required');
});

// ---------------------------------------------------------------------------
// Autoria e idempotência
// ---------------------------------------------------------------------------

test('EXT-03 HTTP+banco: protocolo e autoria vêm do servidor, não do corpo', { skip: !RUN }, async () => {
  const forgedIdentity = randomUUID();
  const editalNumber = `ED-FORJ-${randomUUID().slice(0, 8)}`;
  const res = await mutate('/api/ext/bidding/notices', {
    cookie: cookieTi, key: newKey('forged'),
    body: {
      id: randomUUID(), protocol: 'LIC-FORJADO-0000-XXXX', created_by_identity: forgedIdentity,
      origin: 'registro_legado', status: 'homologado', result: 'resultado forjado',
      title: 'Edital com corpo forjado', description: 'descrição sintética suficiente para o teste',
      edital_number: editalNumber,
    },
  });
  const { body, text } = await readJson(res);
  assert.equal(res.status, 201, text);
  assert.match(body.notice.protocol, /^LIC-EXT-\d{8}-[A-Z0-9]{4}$/);
  assert.equal(body.notice.status, 'rascunho', 'situação inicial não vem do corpo');
  assert.equal(body.notice.result, null, 'resultado não entra na criação');
  assert.equal(body.notice.origin, 'jornada_canonica');

  const row = await pool.query(`SELECT created_by_identity, origin FROM ext_bidding_notices WHERE edital_number=$1`, [editalNumber]);
  assert.equal(row.rows[0].created_by_identity, ti.id, 'a autoria gravada é a da sessão');
  assert.notEqual(row.rows[0].created_by_identity, forgedIdentity);
});

test('EXT-03 HTTP+banco: retry idêntico não duplica; chave reusada com outro conteúdo devolve 409', { skip: !RUN }, async () => {
  const key = newKey('replay');
  const editalNumber = `ED-IDEM-${randomUUID().slice(0, 8)}`;
  const body = { title: 'Edital idempotente', description: 'descrição sintética suficiente para o teste', edital_number: editalNumber };

  const first = await mutate('/api/ext/bidding/notices', { cookie: cookieTi, key, body });
  const firstBody = await readJson(first);
  assert.equal(first.status, 201, firstBody.text);

  const retry = await mutate('/api/ext/bidding/notices', { cookie: cookieTi, key, body });
  const retryBody = await readJson(retry);
  assert.equal(retry.status, 200, retryBody.text);
  assert.equal(retryBody.body.replayed, true);
  assert.equal(retryBody.body.notice.id, firstBody.body.notice.id);

  const count = await pool.query(`SELECT count(*)::int AS total FROM ext_bidding_notices WHERE edital_number=$1`, [editalNumber]);
  assert.equal(count.rows[0].total, 1, 'o retry idêntico não pode duplicar o edital');

  const reused = await mutate('/api/ext/bidding/notices', {
    cookie: cookieTi, key,
    body: { ...body, edital_number: `ED-OUTRO-${randomUUID().slice(0, 8)}`, title: 'Conteúdo diferente na mesma chave' },
  });
  assert.equal(reused.status, 409);
  assert.equal((await reused.json()).error, 'idempotency_key_reused');
});

test('EXT-03 HTTP: número de edital duplicado devolve 409', { skip: !RUN }, async () => {
  const editalNumber = `ED-DUP-${randomUUID().slice(0, 8)}`;
  const base = { title: 'Edital original', description: 'descrição sintética suficiente para o teste', edital_number: editalNumber };
  const first = await mutate('/api/ext/bidding/notices', { cookie: cookieTi, key: newKey('dup1'), body: base });
  assert.equal(first.status, 201);
  const second = await mutate('/api/ext/bidding/notices', { cookie: cookieTi, key: newKey('dup2'), body: { ...base, title: 'Edital repetido' } });
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error, 'duplicate_edital_number');
});

// ---------------------------------------------------------------------------
// CRITÉRIO DO PLANO — prazos e proposta
// ---------------------------------------------------------------------------

test('CRITÉRIO DO PLANO — proposta dentro do prazo registrado é aceita e copia o prazo-base', { skip: !RUN }, async () => {
  const notice = await createNotice('Edital prazo vigente');
  const deadline = await registerDeadline(notice.id, { dueDate: todayIso(7) });

  const res = await mutate(`/api/ext/bidding/notices/${notice.id}/proposals`, {
    cookie: cookieTi, key: newKey('prop'),
    body: { amount_cents: 123456, summary: 'Proposta sintética dentro do prazo registrado.' },
  });
  const { body, text } = await readJson(res);
  assert.equal(res.status, 201, text);
  assert.equal(body.proposal.version, 1, 'a versão é atribuída pelo servidor');
  assert.equal(body.proposal.deadline_date_at_submission, todayIso(7));
  assert.equal(body.proposal.deadline_source_at_submission, 'edital_publicado');
  assert.equal(body.proposal_window.decision, 'prazo_vigente');
  assert.ok(body.proposal_window.base_date, 'a data-base é declarada');

  const row = await pool.query(`SELECT deadline_id, submitted_by_identity FROM ext_bidding_proposals WHERE id=$1`, [body.proposal.id]);
  assert.equal(row.rows[0].deadline_id, deadline.id, 'o prazo que autorizou fica preso à proposta');
  assert.equal(row.rows[0].submitted_by_identity, ti.id);
});

test('CRITÉRIO DO PLANO — prazo encerrado recusa a proposta e NADA é gravado', { skip: !RUN }, async () => {
  const notice = await createNotice('Edital prazo encerrado');
  // O prazo já vencido é registrado PELA API (registrar um edital cujo prazo
  // já passou é legítimo); o gatilho do banco impede alterá-lo depois, então
  // não há como burlar a data — o que se prova aqui é a DERIVAÇÃO sobre o
  // prazo gravado.
  await registerDeadline(notice.id, { dueDate: todayIso(-2) });

  const res = await mutate(`/api/ext/bidding/notices/${notice.id}/proposals`, {
    cookie: cookieTi, key: newKey('late'),
    body: { amount_cents: 999, summary: 'Proposta sintética fora do prazo registrado.' },
  });
  const { body, text } = await readJson(res);
  assert.equal(res.status, 409, text);
  assert.equal(body.error, 'proposal_prazo_encerrado');
  assert.equal(body.proposal_window.accepts_proposal, false);
  assert.equal(body.proposal_window.due_date, todayIso(-2));
  assert.equal(body.proposal_window.days_overdue, 2);

  const count = await pool.query(`SELECT count(*)::int AS total FROM ext_bidding_proposals WHERE bidding_id=$1`, [notice.id]);
  assert.equal(count.rows[0].total, 0, 'proposta fora do prazo não pode ter sido gravada');
});

test('CRITÉRIO DO PLANO — o BANCO recusa proposta registrada depois do prazo', { skip: !RUN }, async () => {
  const notice = await createNotice('Edital trava de banco');
  const deadline = await registerDeadline(notice.id, { dueDate: todayIso(5) });
  await assert.rejects(
    pool.query(
      `INSERT INTO ext_bidding_proposals
         (bidding_id, version, amount_cents, summary, deadline_id,
          deadline_date_at_submission, deadline_source_at_submission, submitted_on, submitted_by_identity)
       VALUES ($1, 99, 1000, 'Proposta inserida direto no banco depois do prazo.', $2, $3::date, 'edital_publicado', $4::date, $5)`,
      [notice.id, deadline.id, todayIso(-1), todayIso(), ti.id],
    ),
    /ext_bidding_proposals_within_deadline_check/,
    'o CHECK do banco precisa recusar proposta posterior ao prazo, não só a aplicação',
  );
});

test('EXT-03 HTTP: sem prazo de entrega registrado a proposta é recusada', { skip: !RUN }, async () => {
  const notice = await createNotice('Edital sem prazo');
  const res = await mutate(`/api/ext/bidding/notices/${notice.id}/proposals`, {
    cookie: cookieTi, key: newKey('noprazo'),
    body: { amount_cents: 500, summary: 'Proposta sintética sem prazo registrado.' },
  });
  const { body } = await readJson(res);
  assert.equal(res.status, 409);
  assert.equal(body.error, 'proposal_sem_prazo_registrado');
  assert.match(body.proposal_window.missing, /não registrado/);
});

test('EXT-03 HTTP+banco: substituir prazo preserva o anterior; o banco recusa editar e apagar', { skip: !RUN }, async () => {
  const notice = await createNotice('Edital retificado');
  const original = await registerDeadline(notice.id, { dueDate: todayIso(10) });

  // O banco não deixa reescrever data, fonte ou autoria de um prazo.
  await assert.rejects(
    pool.query(`UPDATE ext_bidding_deadlines SET source='registro_interno' WHERE id=$1`, [original.id]),
    /ext_bidding_deadline_guard/,
  );
  await assert.rejects(
    pool.query(`DELETE FROM ext_bidding_deadlines WHERE id=$1`, [original.id]),
    /ext_bidding_deadline_guard/,
  );

  const res = await mutate(`/api/ext/bidding/deadlines/${original.id}/supersede`, {
    cookie: cookieTi, key: newKey('sup'),
    body: { due_date: todayIso(20), source: 'retificacao_publicada', source_reference: 'Retificação 1', reason: 'retificação publicada pelo órgão' },
  });
  const { body, text } = await readJson(res);
  assert.equal(res.status, 201, text);
  assert.equal(body.superseded_deadline_id, original.id);

  const rows = await pool.query(
    `SELECT id, due_date, superseded_at, supersede_reason FROM ext_bidding_deadlines WHERE bidding_id=$1 ORDER BY registered_at ASC`,
    [notice.id],
  );
  assert.equal(rows.rows.length, 2, 'o prazo anterior continua no histórico');
  assert.ok(rows.rows[0].superseded_at, 'o anterior fica marcado como substituído');
  assert.equal(rows.rows[0].supersede_reason, 'retificação publicada pelo órgão');
  assert.equal(rows.rows[1].superseded_at, null);

  // Um prazo substituído não autoriza mais nada.
  const again = await mutate(`/api/ext/bidding/deadlines/${original.id}/supersede`, {
    cookie: cookieTi, key: newKey('sup2'),
    body: { due_date: todayIso(30), source: 'retificacao_publicada', reason: 'segunda tentativa' },
  });
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error, 'deadline_already_superseded');
});

test('EXT-03 HTTP: prazo do mesmo tipo já registrado aponta a rota de substituição', { skip: !RUN }, async () => {
  const notice = await createNotice('Edital prazo repetido');
  const first = await registerDeadline(notice.id, { dueDate: todayIso(8) });
  const res = await mutate(`/api/ext/bidding/notices/${notice.id}/deadlines`, {
    cookie: cookieTi, key: newKey('dupprz'),
    body: { deadline_kind: 'entrega_proposta', due_date: todayIso(9), source: 'edital_publicado', justification: 'tentativa de duplicar' },
  });
  const { body } = await readJson(res);
  assert.equal(res.status, 409);
  assert.equal(body.error, 'deadline_already_registered');
  assert.equal(body.canonical, `/api/ext/bidding/deadlines/${first.id}/supersede`);
});

test('EXT-03 HTTP: proposta retirada permanece no histórico', { skip: !RUN }, async () => {
  const notice = await createNotice('Edital proposta retirada');
  await registerDeadline(notice.id, { dueDate: todayIso(6) });
  const created = await mutate(`/api/ext/bidding/notices/${notice.id}/proposals`, {
    cookie: cookieTi, key: newKey('prop2'),
    body: { amount_cents: 7777, summary: 'Proposta sintética que será retirada.' },
  });
  const { body: createdBody } = await readJson(created);
  assert.equal(created.status, 201);

  const res = await mutate(`/api/ext/bidding/proposals/${createdBody.proposal.id}/withdraw`, {
    cookie: cookieTi, key: newKey('wd'), body: { reason: 'erro de valor identificado' },
  });
  const { body, text } = await readJson(res);
  assert.equal(res.status, 200, text);
  assert.equal(body.proposal.situation, 'retirada');

  const row = await pool.query(`SELECT withdrawn_by_identity, withdraw_reason FROM ext_bidding_proposals WHERE id=$1`, [createdBody.proposal.id]);
  assert.equal(row.rows[0].withdrawn_by_identity, ti.id);
  assert.equal(row.rows[0].withdraw_reason, 'erro de valor identificado');

  await assert.rejects(
    pool.query(`DELETE FROM ext_bidding_proposals WHERE id=$1`, [createdBody.proposal.id]),
    /ext_bidding_proposal_guard/,
    'proposta retirada não pode ser apagada',
  );
});

// ---------------------------------------------------------------------------
// CRITÉRIO DO PLANO — situação terminal e resultado
// ---------------------------------------------------------------------------

test('CRITÉRIO DO PLANO — edital encerrado não reabre, nem pela API nem pelo banco', { skip: !RUN }, async () => {
  const notice = await createNotice('Edital encerrado');
  for (const [from, to] of [['rascunho', 'publicado'], ['publicado', 'em_analise'], ['em_analise', 'homologado']]) {
    const step = await mutate(`/api/ext/bidding/notices/${notice.id}`, {
      method: 'PATCH', cookie: cookieTi, key: newKey(`st-${to}`),
      body: { status: to, justification: `transição sintética ${from}->${to}` },
    });
    const { body, text } = await readJson(step);
    assert.equal(step.status, 200, text);
    assert.deepEqual(body.transition, { from, to });
  }

  const reopen = await mutate(`/api/ext/bidding/notices/${notice.id}`, {
    method: 'PATCH', cookie: cookieTi, key: newKey('reopen'),
    body: { status: 'rascunho', justification: 'tentativa de reabrir edital encerrado' },
  });
  const { body: reopenBody } = await readJson(reopen);
  assert.equal(reopen.status, 409);
  assert.equal(reopenBody.error, 'invalid_status_transition');
  assert.equal(reopenBody.terminal, true);

  await assert.rejects(
    pool.query(`UPDATE ext_bidding_notices SET status='rascunho' WHERE id=$1`, [notice.id]),
    /ext_bidding_notice_guard/,
    'o banco também precisa recusar a reabertura',
  );
  await assert.rejects(
    pool.query(`DELETE FROM ext_bidding_notices WHERE id=$1`, [notice.id]),
    /ext_bidding_notice_guard/,
  );
});

test('CRITÉRIO DO PLANO — resultado só com edital encerrado, com autoria, e imutável depois', { skip: !RUN }, async () => {
  const notice = await createNotice('Edital resultado');

  const cedo = await mutate(`/api/ext/bidding/notices/${notice.id}/result`, {
    cookie: cookieTi, key: newKey('res-cedo'),
    body: { result: 'resultado antecipado sintético', justification: 'tentativa antes do encerramento' },
  });
  const { body: cedoBody } = await readJson(cedo);
  assert.equal(cedo.status, 409);
  assert.equal(cedoBody.error, 'bidding_not_closed');

  const vazio = await pool.query(`SELECT result, result_recorded_at FROM ext_bidding_notices WHERE id=$1`, [notice.id]);
  assert.equal(vazio.rows[0].result, null, 'nada pode ter sido gravado');

  for (const to of ['publicado', 'em_analise', 'deserto']) {
    const step = await mutate(`/api/ext/bidding/notices/${notice.id}`, {
      method: 'PATCH', cookie: cookieTi, key: newKey(`res-st-${to}`),
      body: { status: to, justification: `transição sintética para ${to}` },
    });
    assert.equal(step.status, 200);
  }

  const ok = await mutate(`/api/ext/bidding/notices/${notice.id}/result`, {
    cookie: cookieTi, key: newKey('res-ok'),
    body: { result: 'Licitação deserta: nenhuma proposta registrada no prazo.', justification: 'ata sintética da sessão' },
  });
  const { body: okBody, text } = await readJson(ok);
  assert.equal(ok.status, 201, text);
  assert.ok(okBody.notice.result_recorded_at, 'a data do resultado é registrada');
  assert.equal(okBody.notice.result_recorded_by_identity, ti.id);
  assert.equal(okBody.notice.result_justification, 'ata sintética da sessão');

  const denovo = await mutate(`/api/ext/bidding/notices/${notice.id}/result`, {
    cookie: cookieTi, key: newKey('res-2'),
    body: { result: 'resultado trocado depois do registro', justification: 'tentativa de sobrescrever' },
  });
  assert.equal(denovo.status, 409);
  assert.equal((await denovo.json()).error, 'result_already_recorded');

  await assert.rejects(
    pool.query(`UPDATE ext_bidding_notices SET result='reescrito direto no banco' WHERE id=$1`, [notice.id]),
    /ext_bidding_notice_guard/,
    'o banco também precisa recusar a sobrescrita do resultado',
  );
});

// ---------------------------------------------------------------------------
// CRITÉRIO DO PLANO — responsáveis
// ---------------------------------------------------------------------------

test('CRITÉRIO DO PLANO — responsável é identidade canônica validada, com papel copiado e histórico', { skip: !RUN }, async () => {
  const notice = await createNotice('Edital responsável');

  const inexistente = await mutate(`/api/ext/bidding/notices/${notice.id}/responsible`, {
    cookie: cookieTi, key: newKey('resp-404'),
    body: { responsible_identity: randomUUID(), justification: 'identidade que não existe' },
  });
  assert.equal(inexistente.status, 404);
  assert.equal((await inexistente.json()).error, 'responsible_identity_not_found');

  const semPerfil = await makeNonStaffIdentity('active');
  const naoEquipe = await mutate(`/api/ext/bidding/notices/${notice.id}/responsible`, {
    cookie: cookieTi, key: newKey('resp-409'),
    body: { responsible_identity: semPerfil, justification: 'identidade sem perfil de equipe' },
  });
  assert.equal(naoEquipe.status, 409);
  assert.equal((await naoEquipe.json()).error, 'responsible_not_staff');

  const ok = await mutate(`/api/ext/bidding/notices/${notice.id}/responsible`, {
    cookie: cookieTi, key: newKey('resp-ok'),
    body: { responsible_identity: rh.id, justification: 'designação sintética inicial' },
  });
  const { body, text } = await readJson(ok);
  assert.equal(ok.status, 201, text);
  assert.equal(body.assignment.responsible_role, 'rh', 'o papel é copiado do perfil no ato');
  assert.equal(body.notice.responsible_identity, rh.id);

  const troca = await mutate(`/api/ext/bidding/notices/${notice.id}/responsible`, {
    cookie: cookieTi, key: newKey('resp-troca'),
    body: { responsible_identity: ti.id, justification: 'passagem sintética de responsabilidade' },
  });
  const { body: trocaBody } = await readJson(troca);
  assert.equal(troca.status, 201);
  assert.equal(trocaBody.replaced_assignment_id, body.assignment.id);

  const history = await pool.query(
    `SELECT responsible_identity, released_at FROM ext_bidding_responsible_assignments WHERE bidding_id=$1 ORDER BY assigned_at ASC`,
    [notice.id],
  );
  assert.equal(history.rows.length, 2, 'a passagem fica no histórico');
  assert.ok(history.rows[0].released_at, 'a designação anterior é encerrada, não apagada');
  assert.equal(history.rows[1].released_at, null);

  await assert.rejects(
    pool.query(`DELETE FROM ext_bidding_responsible_assignments WHERE bidding_id=$1`, [notice.id]),
    /ext_bidding_responsible_guard/,
  );
});

// ---------------------------------------------------------------------------
// CRITÉRIO DO PLANO — documentos, checklist e alerta
// ---------------------------------------------------------------------------

test('CRITÉRIO DO PLANO — checklist é derivado do dossiê e nunca marcado à mão', { skip: !RUN }, async () => {
  const notice = await createNotice('Edital checklist');

  const item = await mutate(`/api/ext/bidding/notices/${notice.id}/checklist`, {
    cookie: cookieTi, key: newKey('chk'),
    body: { document_type: 'Habilitação jurídica', label: 'Certidão de habilitação jurídica', required: true },
  });
  const { body: itemBody, text } = await readJson(item);
  assert.equal(item.status, 201, text);
  assert.equal(itemBody.derived.status, 'pendente', 'sem documento o item nasce pendente');

  const antes = await get(`/api/ext/bidding/notices/${notice.id}/checklist`, cookieTi);
  const antesBody = (await readJson(antes)).body;
  assert.equal(antesBody.summary.pendentes_obrigatorios, 1);
  assert.equal(antesBody.summary.atendidos, 0);

  const doc = await mutate(`/api/ext/bidding/notices/${notice.id}/documents`, {
    cookie: cookieTi, key: newKey('doc'),
    body: {
      document_type: 'Habilitação jurídica', file_name: 'habilitacao.pdf',
      file_url: 'https://exemplo.invalid/habilitacao.pdf', storage_key: `qa-ext03-${randomUUID()}`,
    },
  });
  const { body: docBody, text: docText } = await readJson(doc);
  assert.equal(doc.status, 201, docText);
  assert.equal(docBody.checklist_item_id, itemBody.checklist_item.id, 'o documento é amarrado ao item exigido');

  const depois = await get(`/api/ext/bidding/notices/${notice.id}/checklist`, cookieTi);
  const depoisBody = (await readJson(depois)).body;
  assert.equal(depoisBody.summary.atendidos, 1, 'o atendimento é derivado do documento ativo');
  assert.equal(depoisBody.summary.pendentes_obrigatorios, 0);
  assert.equal(depoisBody.checklist[0].satisfied_by.document_id, docBody.document.id);

  // Desativar o documento devolve o item para pendente: nada é marcado à mão.
  const off = await mutate(`/api/ext/bidding/documents/${docBody.document.id}/deactivate`, {
    cookie: cookieTi, key: newKey('docoff'), body: { reason: 'documento substituído por versão incorreta' },
  });
  assert.equal(off.status, 200);
  const final = await get(`/api/ext/bidding/notices/${notice.id}/checklist`, cookieTi);
  const finalBody = (await readJson(final)).body;
  assert.equal(finalBody.summary.atendidos, 0, 'documento desativado não atende o checklist');

  const kept = await pool.query(`SELECT deactivated_by_identity, deactivate_reason FROM ext_bidding_documents WHERE id=$1`, [docBody.document.id]);
  assert.equal(kept.rows[0].deactivated_by_identity, ti.id, 'o documento é desativado com autor, não apagado');
  assert.equal(kept.rows[0].deactivate_reason, 'documento substituído por versão incorreta');
});

test('EXT-03 HTTP+banco: dossiê é versionado — a versão nova substitui a anterior de forma declarada', { skip: !RUN }, async () => {
  const notice = await createNotice('Edital dossiê');
  const first = await mutate(`/api/ext/bidding/notices/${notice.id}/documents`, {
    cookie: cookieTi, key: newKey('v1'),
    body: { document_type: 'Proposta comercial', file_name: 'proposta-v1.pdf', file_url: 'https://exemplo.invalid/v1.pdf', storage_key: `qa-ext03-${randomUUID()}` },
  });
  const firstBody = (await readJson(first)).body;
  assert.equal(first.status, 201);
  assert.equal(firstBody.document.version, 1);

  const second = await mutate(`/api/ext/bidding/notices/${notice.id}/documents`, {
    cookie: cookieTi, key: newKey('v2'),
    body: {
      document_type: 'Proposta comercial', file_name: 'proposta-v2.pdf', file_url: 'https://exemplo.invalid/v2.pdf',
      storage_key: `qa-ext03-${randomUUID()}`, supersedes_document_id: firstBody.document.id,
    },
  });
  const secondBody = (await readJson(second)).body;
  assert.equal(second.status, 201);
  assert.equal(secondBody.document.version, 2);
  assert.equal(secondBody.superseded_document_id, firstBody.document.id);
  assert.equal(secondBody.external_channel_boundary.upload_real_de_arquivo, false);

  const rows = await pool.query(`SELECT id, version, superseded_at FROM ext_bidding_documents WHERE bidding_id=$1 ORDER BY version ASC`, [notice.id]);
  assert.equal(rows.rows.length, 2, 'nenhuma versão é apagada');
  assert.ok(rows.rows[0].superseded_at, 'a v1 fica declarada como substituída');

  // Documento de outro edital não pode ser substituído por este.
  const outro = await createNotice('Edital alheio');
  const alheio = await mutate(`/api/ext/bidding/notices/${outro.id}/documents`, {
    cookie: cookieTi, key: newKey('alheio'),
    body: {
      document_type: 'Proposta comercial', file_name: 'x.pdf', file_url: 'https://exemplo.invalid/x.pdf',
      storage_key: `qa-ext03-${randomUUID()}`, supersedes_document_id: secondBody.document.id,
    },
  });
  assert.equal(alheio.status, 409);
  assert.equal((await alheio.json()).error, 'document_not_in_bidding');
});

test('CRITÉRIO DO PLANO — "a vencer" só existe com regra de antecedência registrada', { skip: !RUN }, async () => {
  const notice = await createNotice('Edital alerta');
  await registerDeadline(notice.id, { kind: 'sessao_abertura', dueDate: todayIso(5) });

  const sem = await get(`/api/ext/bidding/notices/${notice.id}/deadlines`, cookieTi);
  const semBody = (await readJson(sem)).body;
  assert.equal(semBody.alert_rule_absence, 'sem_regra_de_antecedencia');
  assert.equal(semBody.deadlines[0].derived.situation, 'vigente');
  assert.equal(semBody.deadlines[0].derived.alert, null);
  assert.equal(semBody.deadlines[0].derived.alert_rule_absence, 'sem_regra_de_antecedencia');

  const regra = await mutate(`/api/ext/bidding/notices/${notice.id}/alert-rules`, {
    cookie: cookieTi, key: newKey('rule'),
    body: { days_before: 10, justification: 'antecedência definida pela equipe' },
  });
  const { text: regraText } = await readJson(regra);
  assert.equal(regra.status, 201, regraText);

  const com = await get(`/api/ext/bidding/notices/${notice.id}/deadlines`, cookieTi);
  const comBody = (await readJson(com)).body;
  assert.equal(comBody.deadlines[0].derived.situation, 'a_vencer', 'com regra explícita o alerta passa a existir');
  assert.equal(comBody.deadlines[0].derived.alert.days_before, 10);

  const dupla = await mutate(`/api/ext/bidding/notices/${notice.id}/alert-rules`, {
    cookie: cookieTi, key: newKey('rule2'), body: { days_before: 20, justification: 'segunda regra' },
  });
  assert.equal(dupla.status, 409);
  assert.equal((await dupla.json()).error, 'alert_rule_already_registered');
});

// ---------------------------------------------------------------------------
// Transação, auditoria e histórico
// ---------------------------------------------------------------------------

test('EXT-03 HTTP+banco: auditoria indisponível devolve 503 e NADA é persistido', { skip: !RUN }, async () => {
  await pool.query(`
    CREATE OR REPLACE FUNCTION qa_ext03_audit_outage() RETURNS trigger AS $fn$
    BEGIN
      IF NEW.action LIKE 'ext_bidding%' THEN
        RAISE EXCEPTION 'qa_ext03_audit_outage: auditoria indisponível (injeção de falha do gate)';
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS qa_ext03_audit_outage_trigger ON audit_log;
    CREATE TRIGGER qa_ext03_audit_outage_trigger BEFORE INSERT ON audit_log
      FOR EACH ROW EXECUTE FUNCTION qa_ext03_audit_outage();
  `);
  const editalNumber = `ED-AUD-${randomUUID().slice(0, 8)}`;
  try {
    const res = await mutate('/api/ext/bidding/notices', {
      cookie: cookieTi, key: newKey('audit'),
      body: { title: 'Edital com auditoria offline', description: 'descrição sintética suficiente', edital_number: editalNumber },
    });
    assert.equal(res.status, 503, 'auditoria obrigatória: sem ela a mutação não pode ser aceita');
    assert.equal((await res.json()).error, 'audit_unavailable');

    const notices = await pool.query(`SELECT count(*)::int AS total FROM ext_bidding_notices WHERE edital_number=$1`, [editalNumber]);
    assert.equal(notices.rows[0].total, 0, 'rollback: o edital não pode ter sobrado');
    const events = await pool.query(`SELECT count(*)::int AS total FROM ext_bidding_events WHERE payload->>'edital_number' = $1`, [editalNumber]);
    assert.equal(events.rows[0].total, 0, 'rollback: o evento não pode ter sobrado');
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS qa_ext03_audit_outage_trigger ON audit_log;`);
    await pool.query(`DROP FUNCTION IF EXISTS qa_ext03_audit_outage();`);
  }

  const ok = await mutate('/api/ext/bidding/notices', {
    cookie: cookieTi, key: newKey('auditok'),
    body: { title: 'Edital com auditoria restaurada', description: 'descrição sintética suficiente', edital_number: `ED-AUDOK-${randomUUID().slice(0, 8)}` },
  });
  assert.equal(ok.status, 201);
});

test('EXT-03 banco: o histórico de eventos é apenas-acréscimo', { skip: !RUN }, async () => {
  const notice = await createNotice('Edital histórico');
  const event = await pool.query(`SELECT id FROM ext_bidding_events WHERE bidding_id=$1 LIMIT 1`, [notice.id]);
  assert.ok(event.rows[0], 'a criação precisa ter gerado evento');
  await assert.rejects(
    pool.query(`UPDATE ext_bidding_events SET summary='reescrito' WHERE id=$1`, [event.rows[0].id]),
    /ext_bidding_history_immutable/,
  );
  await assert.rejects(
    pool.query(`DELETE FROM ext_bidding_events WHERE id=$1`, [event.rows[0].id]),
    /ext_bidding_history_immutable/,
  );
});

// ---------------------------------------------------------------------------
// Dossiê, escopo da listagem e rotas legadas
// ---------------------------------------------------------------------------

test('EXT-03 HTTP: o dossiê declara fonte, data-base, condição de mercado e fronteira', { skip: !RUN }, async () => {
  const notice = await createNotice('Edital dossiê completo');
  await registerDeadline(notice.id, { dueDate: todayIso(12) });
  const res = await get(`/api/ext/bidding/notices/${notice.id}`, cookieTi);
  const { body, text } = await readJson(res);
  assert.equal(res.status, 200, text);
  assert.equal(body.source.notices, 'ext_bidding_notices');
  assert.match(body.base_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(body.market_relevance.situacao, 'indicada_nao_confirmada');
  assert.equal(body.external_channel_boundary.portal_publico_integrado, false);
  assert.equal(body.proposal_window.decision, 'prazo_vigente');
  assert.equal(body.alert_rule_absence, 'sem_regra_de_antecedencia');
  assert.ok(Array.isArray(body.events) && body.events.length >= 1);
});

test('EXT-03 HTTP: a listagem canônica é escopada e só aceita filtros declarados', { skip: !RUN }, async () => {
  const invalido = await get('/api/ext/bidding/notices?status=inventado', cookieTi);
  assert.equal(invalido.status, 400);
  assert.equal((await invalido.json()).error, 'invalid_status');

  const etapa = await get('/api/ext/bidding/notices?stage=qualquer', cookieTi);
  assert.equal(etapa.status, 400);
  assert.equal((await etapa.json()).error, 'invalid_stage');

  const ok = await get('/api/ext/bidding/notices?status=rascunho', cookieTi);
  const { body } = await readJson(ok);
  assert.equal(ok.status, 200);
  assert.equal(body.filters.status, 'rascunho');
  assert.ok(body.notices.every(n => n.status === 'rascunho'), 'o filtro precisa ser aplicado no servidor');
  assert.equal(body.items, undefined, 'a rota canônica não expõe o alias legado');

  // O filtro por etapa compara um enum com texto: exercitado de verdade nos
  // dois sentidos para que o cast não volte a quebrar sem ninguém perceber.
  const andamento = await get('/api/ext/bidding/notices?stage=em_andamento', cookieTi);
  const andamentoBody = (await readJson(andamento)).body;
  assert.equal(andamento.status, 200);
  assert.ok(andamentoBody.notices.length > 0, 'o gate já criou editais em andamento');
  assert.ok(andamentoBody.notices.every(n => n.stage === 'em_andamento'));

  const encerrado = await get('/api/ext/bidding/notices?stage=encerrado', cookieTi);
  const encerradoBody = (await readJson(encerrado)).body;
  assert.equal(encerrado.status, 200);
  assert.ok(encerradoBody.notices.length > 0, 'o gate já encerrou editais');
  assert.ok(encerradoBody.notices.every(n => n.stage === 'encerrado'));
  assert.ok(
    encerradoBody.notices.every(n => ['homologado', 'vencido', 'cancelado', 'deserto'].includes(n.status)),
    'etapa encerrada só pode conter situações terminais',
  );
});

test('EXT-03 HTTP: rota legada mantém leitura autorizada e aposenta a mutação com 410', { skip: !RUN }, async () => {
  const anon = await get('/api/ext/bidding-notices');
  assert.equal(anon.status, 401, 'a rota legada não é atalho sem sessão');

  const leitura = await get('/api/ext/bidding-notices', cookieTi);
  const { body } = await readJson(leitura);
  assert.equal(leitura.status, 200);
  assert.ok(Array.isArray(body.items), 'o alias legado é preservado para quem já consumia');
  assert.ok(Array.isArray(body.notices));
  assert.equal(body.canonical, '/api/ext/bidding/notices');

  const mutacao = await mutate('/api/ext/bidding-notices', {
    cookie: cookieTi, key: newKey('legacy'),
    body: { title: 'Edital pela rota legada', description: 'descrição sintética suficiente', edital_number: `ED-LEG-${randomUUID().slice(0, 8)}` },
  });
  assert.equal(mutacao.status, 410);
  assert.equal((await mutacao.json()).canonical, '/api/ext/bidding/notices');

  const docs = await get('/api/ext/bidding-documents', cookieTi);
  assert.equal(docs.status, 200);
  const docsBody = (await readJson(docs)).body;
  assert.ok(Array.isArray(docsBody.items));
  assert.equal(docsBody.canonical, '/api/ext/bidding/notices/<id>/documents');
});
