// L02 — Provedor local de arquivos, fila durável de notificações e caixa de
// saída local, exercitados por HTTP REAL contra PostgreSQL REAL.
//
// Executado por scripts/qa-l02-delivery-postgres.mjs, que sobe um cluster
// descartável, aplica 001–101 e injeta DATABASE_URL.
//
// Regra da suíte: nenhum veredito vem de SQL simulando o que a API deveria
// fazer. O que prova o comportamento é a resposta HTTP do servidor. O banco só
// é consultado para (a) provisionar dados e (b) conferir efeitos colaterais
// que a API deliberadamente NÃO expõe (ex.: corpo do arquivo em disco).

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { provisionAndLoginStaff } from './helpers/staff-login.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');

let server, baseUrl, pool, docsDir, workDir;

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

/** Requisição HTTP com Origin correto; devolve status, corpo e cookies. */
async function api(pathname, { method = 'GET', body, cookie, raw = false } = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { origin: baseUrl } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  if (raw) return { status: res.status, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()), setCookie };
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed, headers: res.headers, setCookie };
}

before(async () => {
  if (!RUN) return;
  workDir = await mkdtemp(path.join(tmpdir(), 'seg-l02-'));
  docsDir = path.join(workDir, 'documentos-privados');
  const port = 3000 + Math.floor(Math.random() * 2000);
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: '127.0.0.1',
      NODE_ENV: 'development',
      NEXT_DIST_DIR: '.next/integration-l02',
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      CLIENT_DOCS_DIR: docsDir,
      ADMIN_LOGIN_MAX_ATTEMPTS: '200',
      // Sem SMTP: é exatamente a condição da entrega. A caixa local precisa
      // assumir, e nenhuma resposta pode afirmar envio.
      MAIL_HOST: '',
      MAIL_FROM: '',
      SITE_ADMIN_LEGACY_TOKENS: '',
      QA_PGLITE_ONLY: '',
      OLLAMA_ENABLED: 'false',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});
  await waitForServer(baseUrl);
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 300));
    server.kill('SIGKILL');
  }
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

/** Conta cliente sintética. */
async function makeAccount(name = 'Conta QA L02') {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO client_accounts (id, display_name, status, created_by) VALUES ($1,$2,'active','ti')`,
    [id, `${name} ${id.slice(0, 8)}`],
  );
  return id;
}

// ---------------------------------------------------------------------------
// 1. Provedor local de arquivos privados
// ---------------------------------------------------------------------------

test('L02/arquivo: upload grava bytes reais em disco, com chave gerada pelo servidor e hash conferível', { skip: !RUN }, async () => {
  const { cookie } = await provisionAndLoginStaff(pool, api, { role: 'ti' });
  const accountId = await makeAccount();
  const content = Buffer.from(`contrato sintético ${randomUUID()}\n${'x'.repeat(2048)}`, 'utf8');
  const expectedHash = createHash('sha256').update(content).digest('hex');

  const created = await api('/api/admin/documents', {
    method: 'POST', cookie,
    body: {
      accountId, title: 'Contrato QA', category: 'contrato',
      filename: 'contrato.txt',
      contentBase64: content.toString('base64'),
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.sizeBytes, content.length);
  assert.equal(created.body.contentSha256, expectedHash, 'o hash devolvido precisa ser o do conteúdo enviado');

  // Bytes REAIS no disco privado, não uma linha no banco.
  const { rows } = await pool.query('SELECT storage_key, content_sha256, uploaded_by_identity FROM client_documents WHERE id = $1', [created.body.documentId]);
  assert.match(rows[0].storage_key, /^[0-9a-f]{48}$/, 'chave de 24 bytes gerada pelo servidor');
  assert.equal(rows[0].content_sha256, expectedHash);
  assert.ok(rows[0].uploaded_by_identity, 'o autor precisa ser a identidade, não o papel');
  const onDisk = await readFile(path.join(docsDir, rows[0].storage_key));
  assert.ok(onDisk.equals(content), 'o arquivo em disco precisa ser byte a byte o enviado');
});

test('L02/arquivo: o nome enviado pelo cliente nunca vira caminho (sem travessia)', { skip: !RUN }, async () => {
  const { cookie } = await provisionAndLoginStaff(pool, api, { role: 'ti' });
  const accountId = await makeAccount();
  const marker = Buffer.from('conteudo-travessia', 'utf8');

  const created = await api('/api/admin/documents', {
    method: 'POST', cookie,
    body: {
      accountId, title: 'Travessia', category: 'contrato',
      filename: '../../../../etc/passwd',
      contentBase64: marker.toString('base64'),
    },
  });
  // Ou o nome é rejeitado, ou é aceito como rótulo inerte — jamais usado como caminho.
  if (created.status === 201) {
    const { rows } = await pool.query('SELECT storage_key FROM client_documents WHERE id = $1', [created.body.documentId]);
    assert.match(rows[0].storage_key, /^[0-9a-f]{48}$/);
    assert.ok(!rows[0].storage_key.includes('..'), 'a chave não pode conter travessia');
    // Nada foi escrito fora do diretório privado.
    const entries = await readdir(docsDir);
    assert.ok(entries.every(e => /^[0-9a-f]{48}$/.test(e)), `arquivos inesperados em docsDir: ${entries.join(',')}`);
  } else {
    assert.equal(created.status, 400);
  }
});

test('L02/arquivo: download autenticado devolve os bytes; sem sessão é recusado', { skip: !RUN }, async () => {
  const { cookie } = await provisionAndLoginStaff(pool, api, { role: 'ti' });
  const accountId = await makeAccount();
  const content = Buffer.from(`anexo ${randomUUID()}`, 'utf8');
  const created = await api('/api/admin/documents', {
    method: 'POST', cookie,
    body: {
      accountId, title: 'Anexo QA', category: 'contrato',
      filename: 'anexo.txt',
      contentBase64: content.toString('base64'),
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const anon = await api(`/api/admin/documents/${created.body.documentId}/download`, { raw: true });
  assert.equal(anon.status, 401, 'download sem sessão precisa ser recusado');

  const ok = await api(`/api/admin/documents/${created.body.documentId}/download`, { cookie, raw: true });
  assert.equal(ok.status, 200);
  assert.ok(ok.buffer.equals(content), 'o download precisa devolver exatamente os bytes gravados');
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  assert.match(ok.headers.get('cache-control') || '', /no-store/);
});

test('L02/arquivo: adulteração em disco é detectada pelo hash e o download é negado', { skip: !RUN }, async () => {
  const { cookie } = await provisionAndLoginStaff(pool, api, { role: 'ti' });
  const accountId = await makeAccount();
  const content = Buffer.from('conteudo-original-integro', 'utf8');
  const created = await api('/api/admin/documents', {
    method: 'POST', cookie,
    body: {
      accountId, title: 'Integridade', category: 'contrato',
      filename: 'integro.txt',
      contentBase64: content.toString('base64'),
    },
  });
  assert.equal(created.status, 201);
  const { rows } = await pool.query('SELECT storage_key FROM client_documents WHERE id = $1', [created.body.documentId]);

  // Troca o arquivo por fora do sistema, preservando o tamanho: só o hash pega.
  await writeFile(path.join(docsDir, rows[0].storage_key), Buffer.from('conteudo-ADULTERADO-fora!', 'utf8'));

  const tampered = await api(`/api/admin/documents/${created.body.documentId}/download`, { cookie, raw: true });
  assert.equal(tampered.status, 409, 'arquivo adulterado não pode ser servido');
  assert.match(tampered.buffer.toString('utf8'), /document_integrity_failed/);
});

test('L02/arquivo: documento de outra conta não é acessível por sessão de cliente', { skip: !RUN }, async () => {
  const { cookie } = await provisionAndLoginStaff(pool, api, { role: 'ti' });
  const accountA = await makeAccount('Conta A');
  const accountB = await makeAccount('Conta B');
  const created = await api('/api/admin/documents', {
    method: 'POST', cookie,
    body: {
      accountId: accountA, title: 'Sigiloso A', category: 'contrato',
      filename: 'a.txt',
      contentBase64: Buffer.from('segredo da conta A').toString('base64'),
    },
  });
  assert.equal(created.status, 201);

  // Identidade de cliente com acesso APENAS à conta B.
  const identityId = randomUUID();
  await pool.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status)
     VALUES ($1,'client',$2,'Cliente B','active')`,
    [identityId, `cliente-b-${identityId.slice(0, 8)}@exemplo.invalid`],
  );
  await pool.query(
    `INSERT INTO client_access_grants (id, identity_id, client_account_id, scope_note, reason, granted_by)
     VALUES ($1,$2,$3,'qa','qa','ti')`,
    [randomUUID(), identityId, accountB],
  );

  // Sem sessão de cliente válida, a rota do cliente precisa recusar.
  const denied = await api(`/api/client/documents/${created.body.documentId}/download`, { raw: true });
  assert.ok([401, 403, 404].includes(denied.status), `esperado 401/403/404, veio ${denied.status}`);
});

// ---------------------------------------------------------------------------
// 2. Fila durável de notificações: dedupe, retentativa e reivindicação atômica
// ---------------------------------------------------------------------------

test('L02/fila: destinatário com UUID canônico é aceito (regressão do regex de UUID)', { skip: !RUN }, async () => {
  const { cookie } = await provisionAndLoginStaff(pool, api, { role: 'admin' });
  const recipientId = randomUUID();
  const res = await api('/api/admin/notifications', {
    method: 'POST', cookie,
    body: {
      channel: 'email', template: 'lead_new', recipientKind: 'client',
      recipientId, recipientEmail: 'destino@exemplo.invalid',
      payload: { assunto: 'teste' },
    },
  });
  // O regex anterior tinha 4 grupos em vez de 5, então TODO UUID válido era
  // recusado com invalid_recipient_id_uuid_format.
  assert.notEqual(res.status, 500, JSON.stringify(res.body));
  assert.ok([200, 201, 202].includes(res.status), `esperado 2xx, veio ${res.status}: ${JSON.stringify(res.body)}`);
});

test('L02/fila: dedup_key impede duplicata no reenvio da mesma requisição', { skip: !RUN }, async () => {
  const { cookie } = await provisionAndLoginStaff(pool, api, { role: 'admin' });
  const dedupKey = `qa-dedupe-${randomUUID()}`;
  const payload = {
    channel: 'email', template: 'lead_new', recipientKind: 'lead',
    recipientEmail: 'dedupe@exemplo.invalid',
    dedupKey, payload: { n: 1 },
  };
  const first = await api('/api/admin/notifications', { method: 'POST', cookie, body: payload });
  const second = await api('/api/admin/notifications', { method: 'POST', cookie, body: payload });
  assert.ok([200, 201, 202].includes(first.status), JSON.stringify(first.body));
  assert.ok([200, 201, 202, 409].includes(second.status), JSON.stringify(second.body));

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM notification_queue WHERE dedup_key = $1', [dedupKey]);
  assert.equal(rows[0].n, 1, 'a mesma dedup_key não pode gerar duas linhas na fila');
});

test('L02/fila: dois processamentos concorrentes não entregam a mesma notificação duas vezes', { skip: !RUN }, async () => {
  const { cookie } = await provisionAndLoginStaff(pool, api, { role: 'admin' });
  const marker = `concorrencia-${randomUUID()}`;
  for (let i = 0; i < 8; i += 1) {
    await api('/api/admin/notifications', {
      method: 'POST', cookie,
      body: {
        channel: 'email', template: 'lead_new', recipientKind: 'lead',
        recipientEmail: `${marker}-${i}@exemplo.invalid`,
        payload: { i },
      },
    });
  }
  // Dois trabalhadores ao mesmo tempo. Antes da correção o SELECT ... FOR UPDATE
  // SKIP LOCKED rodava fora de transação, o bloqueio caía no fim do SELECT e as
  // duas chamadas reivindicavam as MESMAS linhas.
  await Promise.all([
    api('/api/admin/notifications/process', { method: 'POST', cookie, body: { batchSize: 8 } }),
    api('/api/admin/notifications/process', { method: 'POST', cookie, body: { batchSize: 8 } }),
  ]);

  const { rows } = await pool.query(
    `SELECT n.id, n.attempts, n.recipient_email,
            (SELECT COUNT(*)::int FROM local_outbox_messages o WHERE o.notification_id = n.id) AS entregas
       FROM notification_queue n
      WHERE n.recipient_email LIKE $1`,
    [`${marker}-%`],
  );
  assert.equal(rows.length, 8, 'as 8 notificações precisam existir');
  for (const row of rows) {
    assert.ok(row.entregas <= 1, `notificação ${row.id} foi entregue ${row.entregas} vezes`);
    assert.ok(row.attempts <= 1, `notificação ${row.id} teve attempts=${row.attempts}; houve reivindicação dupla`);
  }
});

// ---------------------------------------------------------------------------
// 3. Caixa de saída local (substitui SMTP)
// ---------------------------------------------------------------------------

test('L02/caixa local: sem SMTP a notificação vai para a caixa local e NUNCA é marcada como enviada', { skip: !RUN }, async () => {
  const { cookie } = await provisionAndLoginStaff(pool, api, { role: 'admin' });
  const address = `caixa-${randomUUID().slice(0, 8)}@exemplo.invalid`;
  const enqueued = await api('/api/admin/notifications', {
    method: 'POST', cookie,
    body: { channel: 'email', template: 'lead_new', recipientKind: 'lead', recipientEmail: address, payload: { assunto: 'convite' } },
  });
  assert.ok([200, 201, 202].includes(enqueued.status), JSON.stringify(enqueued.body));

  const processed = await api('/api/admin/notifications/process', { method: 'POST', cookie, body: { batchSize: 25 } });
  assert.equal(processed.status, 200, JSON.stringify(processed.body));

  const { rows } = await pool.query(
    'SELECT status, sent_at FROM notification_queue WHERE recipient_email = $1', [address],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'local_outbox', `estado precisa ser local_outbox, veio ${rows[0].status}`);
  assert.equal(rows[0].sent_at, null, 'sent_at precisa continuar nulo: não houve envio');

  const { rows: box } = await pool.query(
    'SELECT delivery_mode, subject, body FROM local_outbox_messages WHERE recipient_address = $1', [address],
  );
  assert.equal(box.length, 1, 'a mensagem precisa estar na caixa local');
  assert.equal(box[0].delivery_mode, 'local_outbox');
  assert.ok(box[0].body.length > 0);
});

test('L02/caixa local: nenhuma resposta da API afirma que houve envio de e-mail', { skip: !RUN }, async () => {
  const { cookie } = await provisionAndLoginStaff(pool, api, { role: 'admin' });
  const address = `honestidade-${randomUUID().slice(0, 8)}@exemplo.invalid`;
  await api('/api/admin/notifications', {
    method: 'POST', cookie,
    body: { channel: 'email', template: 'lead_new', recipientKind: 'lead', recipientEmail: address, payload: {} },
  });
  const processed = await api('/api/admin/notifications/process', { method: 'POST', cookie, body: { batchSize: 25 } });
  const listed = await api(`/api/admin/outbox?recipient=${encodeURIComponent(address)}`, { cookie });
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.messages.length, 1, 'sem mensagem o teste seria vacuoso');

  const texts = [JSON.stringify(processed.body), JSON.stringify(listed.body)].join(' ').toLowerCase();
  // O gate do L02 é explícito: sem SMTP, nada pode dizer "enviado"/"entregue".
  for (const forbidden of ['"enviado', 'e-mail enviado', 'email enviado', '"entregue', '"delivered"', '"sent"']) {
    assert.ok(!texts.includes(forbidden), `a resposta afirma entrega (${forbidden}): ${texts.slice(0, 400)}`);
  }
  assert.match(texts, /local_outbox/, 'a resposta precisa declarar o modo de entrega local');
});

test('L02/caixa local: listagem exige sessão de staff e não vaza o corpo da mensagem', { skip: !RUN }, async () => {
  const { cookie } = await provisionAndLoginStaff(pool, api, { role: 'admin' });
  const address = `sigilo-${randomUUID().slice(0, 8)}@exemplo.invalid`;
  await api('/api/admin/notifications', {
    method: 'POST', cookie,
    body: { channel: 'email', template: 'lead_new', recipientKind: 'lead', recipientEmail: address, payload: { token: 'SEGREDO-NAO-VAZAR' } },
  });
  await api('/api/admin/notifications/process', { method: 'POST', cookie, body: { batchSize: 25 } });

  const anon = await api('/api/admin/outbox');
  assert.equal(anon.status, 401, 'a caixa local não pode ser pública');

  const listed = await api(`/api/admin/outbox?recipient=${encodeURIComponent(address)}`, { cookie });
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.messages.length, 1);
  assert.equal(listed.body.messages[0].body, undefined, 'a listagem não pode trazer o corpo');
  assert.ok(!JSON.stringify(listed.body).includes('SEGREDO-NAO-VAZAR'), 'a listagem vazou o conteúdo sensível');
  assert.equal(listed.body.deliveryMode, 'local_outbox');
});

test('L02/caixa local: abrir a mensagem exige sessão, registra a leitura e é auditado', { skip: !RUN }, async () => {
  const { cookie } = await provisionAndLoginStaff(pool, api, { role: 'admin' });
  const address = `leitura-${randomUUID().slice(0, 8)}@exemplo.invalid`;
  await api('/api/admin/notifications', {
    method: 'POST', cookie,
    body: { channel: 'email', template: 'lead_new', recipientKind: 'lead', recipientEmail: address, payload: { token: 'TOKEN-VISIVEL-SO-NA-LEITURA' } },
  });
  await api('/api/admin/notifications/process', { method: 'POST', cookie, body: { batchSize: 25 } });
  const listed = await api(`/api/admin/outbox?recipient=${encodeURIComponent(address)}`, { cookie });
  const messageId = listed.body.messages[0].id;

  const anon = await api(`/api/admin/outbox/${messageId}`);
  assert.equal(anon.status, 401);

  const opened = await api(`/api/admin/outbox/${messageId}`, { cookie });
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  assert.match(opened.body.message.body, /TOKEN-VISIVEL-SO-NA-LEITURA/, 'a leitura deliberada precisa entregar o conteúdo');
  assert.equal(opened.body.message.read_count, 1);

  const again = await api(`/api/admin/outbox/${messageId}`, { cookie });
  assert.equal(again.body.message.read_count, 2, 'cada abertura precisa ser contada');

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM auth_access_audit WHERE action = 'local_outbox_read' AND target = $1`,
    [messageId],
  );
  assert.equal(rows[0].n, 2, 'toda leitura de conteúdo sensível precisa estar auditada');
});

test('L02/caixa local: mensagem vencida não é legível', { skip: !RUN }, async () => {
  const { cookie } = await provisionAndLoginStaff(pool, api, { role: 'admin' });
  const address = `vencida-${randomUUID().slice(0, 8)}@exemplo.invalid`;
  await api('/api/admin/notifications', {
    method: 'POST', cookie,
    body: { channel: 'email', template: 'lead_new', recipientKind: 'lead', recipientEmail: address, payload: { token: 'JA-VENCIDO' } },
  });
  await api('/api/admin/notifications/process', { method: 'POST', cookie, body: { batchSize: 25 } });
  const listed = await api(`/api/admin/outbox?recipient=${encodeURIComponent(address)}`, { cookie });
  const messageId = listed.body.messages[0].id;

  await pool.query(`UPDATE local_outbox_messages SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [messageId]);

  const expired = await api(`/api/admin/outbox/${messageId}`, { cookie });
  assert.equal(expired.status, 410, 'mensagem vencida precisa ser recusada');
  assert.ok(!JSON.stringify(expired.body).includes('JA-VENCIDO'), 'o conteúdo vencido não pode vazar');
});

test('L02/caixa local: convite de cliente é guardado localmente e o token não volta na resposta', { skip: !RUN }, async () => {
  const { cookie } = await provisionAndLoginStaff(pool, api, { role: 'ti' });
  const accountId = await makeAccount('Conta Convite');
  const address = `convidado-${randomUUID().slice(0, 8)}@exemplo.invalid`;

  const invited = await api('/api/admin/invites', {
    method: 'POST', cookie,
    body: { email: address, displayName: 'Convidado QA', scopeNote: 'QA L02' },
  });
  assert.equal(invited.status, 201, JSON.stringify(invited.body));
  assert.equal(invited.body.emailStatus, 'local_outbox', 'sem SMTP o convite vai para a caixa local');
  assert.equal(invited.body.inviteUrl, undefined, 'com a caixa local o token não precisa voltar na resposta');

  const { rows } = await pool.query(
    `SELECT body, template FROM local_outbox_messages WHERE recipient_address = $1`, [address],
  );
  assert.equal(rows.length, 1, 'o convite precisa estar na caixa local');
  assert.match(rows[0].body, /\/cliente\/convite\?token=/, 'o convite guardado precisa conter o link utilizável');
});
