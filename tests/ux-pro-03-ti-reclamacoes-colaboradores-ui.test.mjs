import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createEmployeeComplaintApi } from '../src/server/employee-complaint-api.mjs';

// Promoção por área: EmployeeComplaintClient. O canal de cliente é outra
// jornada; esta guarda cobre somente o console restrito de TI e o servidor
// administrativo. O papel de RH na API não é alterado nem equiparado à UI.
const component = await readFile(new URL('../src/app/admin/ti/EmployeeComplaintClient.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/EmployeeComplaintClient.module.css', import.meta.url), 'utf8').catch(() => '');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const server = (await readFile(new URL('../server.mjs', import.meta.url), 'utf8')).replace(/\\\//g, '/');
const apiSource = await readFile(new URL('../src/server/employee-complaint-api.mjs', import.meta.url), 'utf8');
const endpoints = ['/api/admin/employee-complaints', '/api/admin/employee-complaints/', '/api/admin/employee-complaint-messages', '/api/admin/employee-complaint-evidences', '/api/admin/employee-complaint-hr-shares'];

test('reclamações de colaboradores: aba real sem remover abas nem ampliar gate de TI', () => {
  assert.match(consoleClient, /const EmployeeComplaintClient=dynamic\(\(\)=>import\('\.\/EmployeeComplaintClient'\)\)/);
  assert.match(consoleClient, /\['reclamacoes_colaboradores','Reclamações de colaboradores'\]/);
  assert.match(consoleClient, /active==='reclamacoes_colaboradores'&&<EmployeeComplaintClient\/>/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
  for (const key of ['bases', 'saude', 'cliente', 'lgpd', 'monitoramento_ext', 'financeiro_cadastros']) {
    assert.ok(consoleClient.includes(`['${key}',`), `preservar aba ${key}`);
  }
});

test('reclamações de colaboradores: cinco despachos, papéis nomeados e ações preservadas', () => {
  assert.match(component, /const ENDPOINTS\s*=/);
  for (const path of endpoints) {
    assert.ok(component.includes(path), `a interface precisa usar ${path}`);
    assert.ok(server.includes(path), `servidor precisa despachar ${path}`);
  }
  assert.ok((apiSource.match(/requireRole\(sess,\s*\['admin','ti'\]\)/g) || []).length >= 5);
  assert.ok((apiSource.match(/requireRole\(sess,\s*\['rh'\]\)/g) || []).length >= 4);
  for (const field of ['client_account_id', 'contract_id', 'contact_id', 'employee_id', 'employee_reference', 'category', 'severity', 'title', 'description', 'is_anonymous', 'sender_type', 'is_internal', 'is_hr_visible', 'file_name', 'file_url', 'storage_key', 'shared_field', 'shared_value', 'justification']) {
    assert.ok(component.includes(field), `preservar campo ${field}`);
  }
  for (const action of ['"POST"', '"PATCH"', 'em_analise', 'resolvida']) assert.ok(component.includes(action));
});

test('reclamações de colaboradores: leitura e detalhe têm estados honestos e sequência independente', () => {
  assert.match(component, /listSequence/);
  assert.match(component, /detailSequence/);
  assert.match(component, /Array\.isArray/);
  assert.match(component, /payload inválido|payload_invalido|invalid_payload/i);
  for (const state of ['loading', 'empty', 'error', 'denied']) assert.ok(component.includes(`variant="${state}"`), `falta ${state}`);
  assert.match(component, /onRetry=\{\(\)/);
  assert.match(component, /aria-busy=/);
  assert.match(component, /role="status"/);
  assert.match(component, /role="alert"/);
});

test('reclamações de colaboradores: datas, rótulos, tradução e tratamento seguro', () => {
  assert.match(component, /function parseDateOnly/);
  assert.match(component, /aria-describedby/);
  assert.match(component, /htmlFor=/);
  assert.match(component, /ERROR_LABELS/);
  for (const reason of ['invalid_title', 'invalid_description', 'invalid_message', 'duplicate_storage_key', 'invalid_justification', 'field_not_allowed_minimal_share', 'forbidden_restricted_channel']) assert.ok(component.includes(reason), `tradução ausente: ${reason}`);
  assert.doesNotMatch(component, /\b(?:alert|prompt|confirm)\(/);
  assert.doesNotMatch(component, /style=\{\{/);
  assert.doesNotMatch(component, /:\s*any\b/);
});

test('reclamações de colaboradores: limites explícitos e layout por tokens', () => {
  assert.match(component, /Fonte:/);
  assert.match(component, /Data-base:/);
  assert.match(component, /não (?:faz|realiza) upload/i);
  assert.match(component, /referência.*texto claro/i);
  assert.match(component, /RH.*(?:não acessa|não vê|não tem acesso)/i);
  assert.match(component, /NO-GO/);
  assert.match(component, /aceite humano/i);
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted', '--ux-color-border', '--ux-color-focus', '--ux-color-error']) assert.ok(styles.includes(token), `falta token ${token}`);
  assert.match(styles, /:focus-visible/);
  for (const breakpoint of ['@media(max-width:900px)', '@media(max-width:650px)']) assert.ok(styles.includes(breakpoint));
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});

const id = '11111111-1111-4111-8111-111111111111';
function request(method, url, body) {
  let consumed = false;
  return {
    method, url,
    async *[Symbol.asyncIterator]() {
      if (!consumed && body !== undefined) { consumed = true; yield Buffer.from(JSON.stringify(body)); }
    },
  };
}
function response() {
  return { status: 0, payload: null, writeHead(status) { this.status = status; }, end(body) { this.payload = JSON.parse(body); } };
}
function handler(pool) {
  return createEmployeeComplaintApi({
    pool, sameOrigin: () => true, requireSession: async () => ({ role: 'ti', identityId: id }),
    requireRole: (session, roles) => roles.includes(session.role), auditLog: async () => {},
  });
}

test('reclamações de colaboradores: referência recebe SHA-256 real no servidor', async () => {
  let inserted;
  const pool = { async query(sql, params) {
    if (sql.includes('INSERT INTO cli_employee_complaints')) { inserted = params; return { rows: [{ id, protocol: 'sintetico' }] }; }
    return { rows: [] };
  } };
  const res = response();
  const ref = 'referencia-sintetica';
  await handler(pool).handleComplaints(request('POST', '/api/admin/employee-complaints', { title: 'Teste sintético', description: 'Descrição sintética com mais de vinte caracteres.', employee_reference: ref }), res);
  assert.equal(res.status, 201);
  assert.equal(inserted[6], createHash('sha256').update(ref).digest('hex'));
});

test('reclamações de colaboradores: transição usa enum explícito no PostgreSQL', async () => {
  let update;
  const pool = { async query(sql) {
    if (sql.includes('SELECT * FROM cli_employee_complaints')) return { rows: [{ id, status: 'pendente' }] };
    if (sql.includes('UPDATE cli_employee_complaints')) { update = sql; return { rows: [{ id, status: 'em_analise' }] }; }
    return { rows: [] };
  } };
  const res = response();
  await handler(pool).handleComplaints(request('PATCH', '/api/admin/employee-complaints', { id, status: 'em_analise', reason: 'Motivo sintético da transição.' }), res);
  assert.equal(res.status, 200);
  assert.match(update, /\$2::cli_complaint_status/);
});

test('reclamações de colaboradores: mensagem aceita corpo original e query legada sem consumir JSON duas vezes', async () => {
  const pool = { async query(sql, params) {
    if (sql.includes('FROM cli_employee_complaints')) return { rows: [{ id }] };
    if (sql.includes('INSERT INTO cli_employee_complaint_messages')) return { rows: [{ id, complaint_id: params[0], message: params[4] }] };
    return { rows: [] };
  } };
  for (const url of ['/api/admin/employee-complaint-messages', `/api/admin/employee-complaint-messages?complaint_id=${id}`]) {
    const res = response();
    await handler(pool).handleMessages(request('POST', url, { complaint_id: id, message: 'Mensagem sintética suficientemente longa.', sender_type: 'rh' }), res);
    assert.equal(res.status, 201, `enviar mensagem por ${url} deve funcionar`);
    assert.equal(res.payload.complaint_id, id);
    assert.equal(res.payload.message, 'Mensagem sintética suficientemente longa.');
  }
});
