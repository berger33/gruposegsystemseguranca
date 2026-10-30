import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAdmApi } from '../src/server/adm-api.mjs';

// UX-PRO-03 — 11ª promoção "com prova" do TiConsole: `AdmClient` deixa de ser
// órfão e passa a montar ADM-01..06 (pauta do dia, retratos comercial,
// operacional e financeiro, risco de renovação e aprovação unificada).
//
// A escolha da família veio de auditoria antes do código: `AdmAdvancedClient`
// (ADM-07..12) está DESCARTADO porque a API `/api/adm/panel/*`, já montada em
// `/admin/marcelo`, escreve exatamente as mesmas tabelas (adm_search_favorites,
// adm_saved_filters, adm_shortcuts, adm_reports, adm_report_logs,
// adm_business_configs, adm_management_diary_access e adm_expansion_analyses);
// montá-lo criaria duas telas concorrentes sobre os mesmos dados — a mesma
// objeção que tirou a família `Fin*` da fila em 29/10. As tabelas de
// ADM-01..06 não são tocadas por nenhuma rota viva.
//
// Executado antes da implementação: na base falha pelo motivo certo (RED).
const component = await readFile(new URL('../src/app/admin/ti/AdmClient.tsx', import.meta.url), 'utf8').catch(() => '');
const styles = await readFile(new URL('../src/app/admin/ti/AdmClient.module.css', import.meta.url), 'utf8').catch(() => '');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const server = (await readFile(new URL('../server.mjs', import.meta.url), 'utf8')).replace(/\\\//g, '/');
const apiSource = await readFile(new URL('../src/server/adm-api.mjs', import.meta.url), 'utf8');
const panelApi = await readFile(new URL('../src/server/adm-panel-api.mjs', import.meta.url), 'utf8');

const ENDPOINTS = [
  '/api/adm/my-day',
  '/api/adm/commercial-snapshots',
  '/api/adm/operational-snapshots',
  '/api/adm/financial-snapshots',
  '/api/adm/renewal-risks',
  '/api/adm/approvals',
  '/api/adm/approval-history',
];
const codeOnly = (source) => source.replace(/^\s*\/\/.*$/gm, '');

test('ADM-01..06: aba real no console, sem remover abas nem ampliar o gate de TI', () => {
  assert.ok(component.length > 0, 'o componente AdmClient precisa existir');
  assert.match(consoleClient, /const AdmClient=dynamic\(\(\)=>import\('\.\/AdmClient'\)\)/);
  assert.match(consoleClient, /\['adm','Pauta, retratos e aprovações'\]/);
  assert.match(consoleClient, /active==='adm'&&<AdmClient\/>/);
  // Sem grupo, a aba existe mas não é alcançável pela navegação.
  assert.match(consoleClient, /name:'Gestão e aprovações',keys:\['adm'\]/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
  for (const key of ['bases', 'saude', 'cliente', 'lgpd', 'monitoramento_ext', 'financeiro_cadastros', 'reclamacoes_colaboradores']) {
    assert.ok(consoleClient.includes(`['${key}',`), `preservar aba ${key}`);
  }
});

test('ADM-01..06: sete despachos preservados, papéis nomeados e campos do protótipo mantidos', () => {
  assert.match(component, /const ENDPOINTS/);
  for (const path of ENDPOINTS) {
    assert.ok(component.includes(path), `a interface precisa usar ${path}`);
    assert.ok(server.includes(path), `o servidor precisa despachar ${path}`);
  }
  // Papel e origem continuam decididos no servidor.
  for (const role of ['admin', 'ti', 'marcelo', 'financeiro']) {
    assert.ok(apiSource.includes(`'${role}'`), `o handler precisa nomear o papel ${role}`);
  }
  assert.match(apiSource, /if \(!sameOrigin\(req\)\)/);
  const writes = ['"POST"', '"PATCH"'];
  for (const method of writes) assert.ok(component.includes(method), `a tela preserva a escrita ${method}`);
  for (const field of ['title', 'description', 'priority', 'responsible_name', 'action_type', 'due_date', 'source_module', 'is_real_pending',
    'new_leads_count', 'stalled_opportunities_count', 'proposals_count', 'total_value_cents', 'next_actions',
    'coverage_required_hours', 'coverage_covered_hours', 'coverage_percent', 'critical_occurrences_count', 'sla_breach_count', 'implantation_pending_count',
    'competence_date', 'total_receivables_cents', 'total_payables_cents', 'balance_cents', 'overdue_cents', 'upcoming_cents', 'margin_by_contract',
    'contract_id', 'client_account_id', 'renewal_date', 'risk_level', 'risk_score', 'justification', 'reincidence_count', 'is_justified', 'facts_json',
    'protocol', 'approval_type', 'amount_cents', 'threshold_cents', 'requester_name', 'approver_name', 'approver_identity', 'scope', 'reason',
    'previous_status', 'next_status']) {
    assert.ok(component.includes(field), `preservar campo ${field}`);
  }
});

test('ADM-01..06: a aba não duplica /admin/marcelo nem toca as tabelas do painel', () => {
  // A família descartada (ADM-07..12) escreve as tabelas abaixo pela rota
  // `/api/adm/panel/*`, já montada em /admin/marcelo.
  for (const table of ['adm_search_favorites', 'adm_saved_filters', 'adm_shortcuts', 'adm_reports',
    'adm_report_logs', 'adm_business_configs', 'adm_management_diary_access', 'adm_expansion_analyses']) {
    assert.ok(panelApi.includes(table), `a rota real do Marcelo continua escrevendo ${table}`);
    assert.ok(!component.includes(table), `${table} já tem tela em /admin/marcelo; a aba não pode duplicá-la`);
  }
  // As tabelas desta aba não aparecem em nenhuma rota montada fora do console.
  for (const table of ['adm_my_day_items', 'adm_commercial_snapshots', 'adm_operational_snapshots',
    'adm_financial_snapshots', 'adm_renewal_risks', 'adm_approvals', 'adm_approval_history']) {
    assert.ok(component.includes(table), `a tela declara a fonte ${table}`);
  }
});

test('ADM-01..06: quatro estados, retry, sequência, payload validado e sem any', () => {
  for (const variant of ['loading', 'empty', 'error', 'denied']) {
    assert.ok(component.includes(`variant="${variant}"`), `estado ${variant} precisa ser distinto`);
  }
  assert.match(component, /onRetry=/);
  assert.match(component, /aria-busy=/);
  assert.match(component, /sequences/);
  assert.match(component, /historySequence/);
  assert.match(component, /function records\(/);
  assert.match(component, /Array\.isArray/);
  const code = codeOnly(component);
  assert.doesNotMatch(code, /\balert\(/);
  assert.doesNotMatch(code, /\bprompt\(/);
  assert.doesNotMatch(code, /style=\{\{/);
  assert.doesNotMatch(code, /:\s*any\b/);
  assert.doesNotMatch(code, /catch\s*\{\s*\}/, 'falha silenciosa engolida não é estado honesto');
});

test('ADM-01..06: datas, rótulos, tradução dos motivos e limites na tela', () => {
  assert.match(component, /function parseDateOnly/);
  assert.match(component, /htmlFor=/);
  // O `Field` injeta `aria-describedby` por cloneElement no controle do filho.
  assert.match(component, /aria-describedby/);
  assert.match(component, /aria-labelledby="adm-/);
  assert.match(component, /Fonte:/);
  assert.match(component, /Data-base:/);
  assert.match(component, /role="status"/);
  assert.match(component, /role="alert"/);
  for (const reason of ['invalid_status', 'invalid_priority', 'invalid_risk_level', 'risk_score_0_100',
    'approver_required_above_threshold_alcada', 'requester_approver_must_differ_segregacao',
    'duplicate_snapshot_date', 'duplicate_competence_source', 'reason_10_1000_required']) {
    assert.ok(component.includes(reason), `tradução ausente: ${reason}`);
  }
  assert.match(component, /não envia e-mail/i);
  assert.match(component, /NO-GO/);
  assert.match(component, /0\/222/);
  // Ausência nunca vira zero nem 01/01/1970.
  assert.match(component, /Não informad/);
  assert.doesNotMatch(codeOnly(component), /<label[^>]*>[^<]*<small/);
});

test('ADM-01..06: CSS por token, sem hex, foco visível e responsivo', () => {
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted',
    '--ux-color-border', '--ux-color-focus', '--ux-color-error', '--ux-color-success', '--ux-color-warning']) {
    assert.ok(styles.includes(token), `o CSS module precisa usar ${token}`);
  }
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
  for (const breakpoint of ['@media(max-width:900px)', '@media(max-width:650px)']) {
    assert.ok(styles.includes(breakpoint), `o CSS precisa cobrir ${breakpoint}`);
  }
  assert.match(component, /<summary/);
  assert.doesNotMatch(component, /<summary>\s*Criar/i);
});

// --- servidor: os defeitos medidos em PostgreSQL 17 descartável -------------
const identity = '11111111-1111-4111-8111-111111111111';
const approver = '22222222-2222-4222-8222-222222222222';
// O handler do ADM lê o corpo por eventos (`req.on('data')` / `req.on('end')`),
// exatamente como um `IncomingMessage`. Os eventos são emitidos uma única vez e
// na ordem em que o handler os registra.
function request(method, url, body) {
  return {
    method, url,
    on(event, listener) {
      if (event === 'data') { if (body !== undefined) setImmediate(() => listener(Buffer.from(JSON.stringify(body)))); }
      else if (event === 'end') { setImmediate(() => listener()); }
      return this;
    },
  };
}
function response() {
  return { status: 0, payload: null, writeHead(status) { this.status = status; }, end(body) { this.payload = JSON.parse(body); } };
}
function handler(log) {
  return createAdmApi({
    pool: { async query(sql, params) { log.push({ sql, params }); return { rows: [] }; } },
    sameOrigin: () => true,
    requireSession: async () => ({ role: 'admin', identityId: identity }),
    requireRole: (session, roles) => roles.includes(session.role),
    auditLog: async () => {},
  });
}

test('ADM-06: a decisão da aprovação molda o enum e não volta mais 500', async () => {
  const log = [];
  const pool = {
    async query(sql, params) {
      log.push({ sql, params });
      if (sql.includes('SELECT * FROM adm_approvals WHERE id=$1')) {
        return { rows: [{ id: identity, status: 'pendente', amount_cents: 5000, threshold_cents: 20000, requester_identity: identity }] };
      }
      if (sql.includes('UPDATE adm_approvals')) return { rows: [{ id: identity, status: 'rejeitado', approver_identity: approver }] };
      return { rows: [] };
    },
  };
  const api = createAdmApi({
    pool, sameOrigin: () => true,
    requireSession: async () => ({ role: 'admin', identityId: identity }),
    requireRole: (session, roles) => roles.includes(session.role),
    auditLog: async () => {},
  });
  const res = response();
  await api.handleApprovals(request('PATCH', '/api/adm/approvals',
    { id: identity, status: 'rejeitado', reason: 'Motivo sintético da rejeição registrada.', approver_identity: approver, approver_name: 'Aprovador sintético' }), res);
  assert.equal(res.status, 200, `a decisão precisa sair; veio ${res.status} ${JSON.stringify(res.payload)}`);
  const update = log.find(entry => entry.sql.includes('UPDATE adm_approvals'));
  assert.ok(update, 'a escrita precisa acontecer');
  assert.match(update.sql, /\$1::adm_approval_status/, 'sem o molde explícito o PostgreSQL não deduce o tipo e devolve 500');
  const history = log.find(entry => entry.sql.includes('INSERT INTO adm_approval_history'));
  assert.match(history.sql, /\$3::adm_approval_status/);
});

test('ADM-06: situação fora do enum é recusa explícita, sem escrita nem mensagem SQL', async () => {
  const log = [];
  const res = response();
  await handler(log).handleApprovals(request('PATCH', '/api/adm/approvals',
    { id: identity, status: 'deferido', reason: 'Motivo sintético da tentativa inválida.' }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, 'invalid_status');
  assert.ok(!('details' in res.payload), 'a resposta não pode vazar a mensagem SQL');
  assert.equal(log.length, 0, 'nenhuma escrita pode acontecer antes da validação');
});

test('ADM-06: criar acima da alçada é recusado antes do INSERT (a constraint exige aprovador)', async () => {
  const log = [];
  const res = response();
  await handler(log).handleApprovals(request('POST', '/api/adm/approvals',
    { approval_type: 'despesa', amount_cents: 90000, threshold_cents: 10000, requester_name: 'Solicitante sintético' }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, 'approver_required_above_threshold_alcada');
  assert.ok(!('details' in res.payload));
  assert.equal(log.length, 0);
});

test('ADM-01: a pauta recusa situação e prioridade fora do enum em vez de devolver 500', async () => {
  for (const body of [{ id: identity, status: 'concluido' }, { id: identity, priority: 'urgente' }]) {
    const log = [];
    const res = response();
    await handler(log).handleMyDay(request('PATCH', '/api/adm/my-day', body), res);
    assert.equal(res.status, 400, JSON.stringify(res.payload));
    assert.ok(['invalid_status', 'invalid_priority'].includes(res.payload.error));
    assert.equal(log.length, 0, 'a validação precisa vir antes do UPDATE');
  }
  // O UPDATE continua moldando os enums para o caminho válido.
  const log = [];
  const pool = { async query(sql) { log.push(sql); return { rows: [{ id: identity, status: 'concluida', priority: 'baixa' }] }; } };
  const api = createAdmApi({ pool, sameOrigin: () => true, requireSession: async () => ({ role: 'admin', identityId: identity }), requireRole: () => true, auditLog: async () => {} });
  const res = response();
  await api.handleMyDay(request('PATCH', '/api/adm/my-day', { id: identity, status: 'concluida' }), res);
  assert.equal(res.status, 200);
  assert.match(log.find(sql => sql.includes('UPDATE adm_my_day_items')), /\$1::adm_task_status/);
});

test('ADM-05: o risco recusa nível fora do enum e pontuação fora da faixa', async () => {
  for (const [body, error] of [[{ id: identity, risk_level: 'enorme' }, 'invalid_risk_level'], [{ id: identity, risk_score: 500 }, 'risk_score_0_100']]) {
    const log = [];
    const res = response();
    await handler(log).handleRenewalRisks(request('PATCH', '/api/adm/renewal-risks', body), res);
    assert.equal(res.status, 400, JSON.stringify(res.payload));
    assert.equal(res.payload.error, error);
    assert.equal(log.length, 0);
  }
});
