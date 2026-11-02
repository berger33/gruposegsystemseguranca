import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const source = await read('src/app/admin/leads/page.tsx');
const css = await read('src/app/admin/leads/LeadAdmin.module.css');
const gate = await read('tests/ux-crm-workspace.integration.test.mjs');
const pkg = JSON.parse(await read('package.json'));

async function helpers() {
  const ts = await read('src/app/admin/leads/lead-queue-state.ts');
  const js = stripTypeScriptTypes(ts);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const lead = {
  id: '11111111-1111-4111-8111-111111111111', request_kind: 'visit',
  name: 'Pedido sintético', phone: '(11) 90000-0000', city: 'Barueri',
  property_type: 'Condomínio', services: ['Monitoramento'], visit_preference: 'Manhã',
  details: null, status: 'solicitada', email_status: 'not_configured',
  created_at: '2026-10-31T10:00:00.000Z', updated_at: null,
  origin: null, campaign: null, channel: 'site', responsible: null,
};

test('FILA DE PEDIDOS: parser preserva registros legados e atuais sem projetar campos novos', async () => {
  const { parseLeadQueue } = await helpers();
  for (const status of ['new', 'contacted', 'closed', 'solicitada', 'em_agendamento', 'confirmada', 'realizada', 'cancelada']) {
    const input = { leads: [{ ...lead, status, extra_contract_field: 'preservado' }], total: 1, limit: 100, offset: 0 };
    const before = structuredClone(input);
    const result = parseLeadQueue(input);
    assert.equal(result.leads[0].status, status);
    assert.equal(result.leads[0].extra_contract_field, 'preservado');
    assert.deepEqual(input, before, 'o parser não pode modificar o payload');
  }
  assert.deepEqual(parseLeadQueue({ leads: [], total: 0 }).leads, []);
});

test('FILA DE PEDIDOS: payload malformado nunca vira ausência real de pedidos', async () => {
  const { parseLeadQueue } = await helpers();
  const invalid = [null, {}, { leads: {}, total: 0 }, { leads: [], total: '0' },
    { leads: [], total: -1 }, { leads: [], total: 1.5 },
    ...[{}, { ...lead, services: 'Monitoramento' }, { ...lead, services: [2] },
      { ...lead, id: '' }, { ...lead, name: null }, { ...lead, phone: {} },
      { ...lead, created_at: 'não é data' }, { ...lead, updated_at: 'não é data' },
      { ...lead, request_kind: 'unknown' }, { ...lead, status: null },
      { ...lead, origin: 4 }, { ...lead, details: {} }].map(item => ({ leads: [lead, item], total: 2 }))];
  for (const payload of invalid) assert.throws(() => parseLeadQueue(payload), /invalid_response/);
});

test('FILA DE PEDIDOS: negativa, sessão, indisponibilidade e resposta inválida têm mensagens distintas', async () => {
  const { describeLeadError } = await helpers();
  assert.equal(describeLeadError(401, 'admin_session_required').kind, 'auth');
  assert.equal(describeLeadError(403, 'forbidden').kind, 'denied');
  assert.equal(describeLeadError(403, 'forbidden').canRetry, false);
  assert.equal(describeLeadError(503, 'leads_unavailable').kind, 'retry');
  assert.equal(describeLeadError(503, 'leads_unavailable').canRetry, true);
  assert.equal(describeLeadError(0, undefined).kind, 'retry');
  assert.equal(describeLeadError(200, 'invalid_response').kind, 'invalid');
  assert.match(describeLeadError(503, 'lead_update_unavailable', 'update').detail, /situação/);
  assert.match(describeLeadError(503, 'convert_failed', 'convert').detail, /oportunidade/);
  assert.doesNotMatch(describeLeadError(503, 'lead_update_unavailable', 'update').detail, /carregar os pedidos/);
});

test('FILA DE PEDIDOS: somente a leitura mais recente publica dados ou encerra carregamento', () => {
  assert.match(source, /readSequence\s*=\s*useRef\(0\)/);
  assert.match(source, /const sequence\s*=\s*\+\+readSequence\.current/);
  const load = source.slice(source.indexOf('const loadLeads ='), source.indexOf('async function login'));
  assert.ok(load.indexOf('if (sequence !== readSequence.current) return') < load.indexOf('setRole('), 'a sessão também precisa passar pela guarda');
  assert.ok((load.match(/if \(sequence !== readSequence\.current\) return/g) || []).length >= 2);
  assert.match(load, /finally\s*\{\s*if \(sequence === readSequence\.current\) setLoading\(false\)/);
  assert.match(source, /readSequence\.current \+= 1/, 'logout precisa invalidar leituras em voo');
});

test('FILA DE PEDIDOS: falha inicial, negativa, retry e dado preservado são estados distintos', () => {
  assert.match(source, /parseLeadQueue\(data\)/);
  assert.doesNotMatch(source, /Array\.isArray\(data\.leads\) \? data\.leads : \[\]/);
  assert.match(source, /data-testid=\{[^}]*"lead-queue-denied"/);
  assert.match(source, /"lead-queue-read-error"/);
  assert.match(source, /data-testid="lead-queue-retry"/);
  assert.match(source, /Tentar novamente/);
  assert.match(source, /setLoadedAt\(null\)/);
  assert.match(source, /hasLoadedRef\.current = false/);
  assert.match(source, /stale && readError/);
  assert.match(source, /loadedAt !== null && \(/, 'contagens não podem anunciar zero antes da primeira leitura');
  assert.match(css, /\.readFailure/);
  assert.match(css, /\.retry/);
  assert.match(css, /:focus-visible/);
});

test('FILA DE PEDIDOS: ações, papéis, endpoints e corpos permanecem; resposta antiga não reabre a sessão', () => {
  assert.match(source, /allowedRoles=\{\["comercial", "marcelo", "admin", "ti"\]\}/);
  for (const endpoint of ['/api/admin/session', '/api/admin/leads?limit=100', '/api/admin/leads/${lead.id}', '/api/crm/leads/${lead.id}/convert']) assert.ok(source.includes(endpoint));
  assert.match(source, /JSON\.stringify\(\{ status \}\)/);
  assert.match(source, /JSON\.stringify\(\{ create_company: true, company_name: lead\.name \}\)/);
  assert.match(source, /<OriginMetricsPanel \/>/);
  assert.match(source, /pendingWritesRef/);
  assert.match(source, /const writeToken\s*=\s*beginLeadPending\(lead\.id\)/);
  assert.match(source, /if \(writeToken === null\) return/);
  assert.match(source, /const writeSequence = useRef\(0\)/);
  assert.match(source, /const sequence = writeSequence\.current/);
  assert.match(source, /if \(sequence !== writeSequence\.current\) return/, 'escrita antiga não pode publicar sucesso nem reler filtro antigo');
  const select = source.slice(source.indexOf('function setSelectedFilter'), source.indexOf('const queue ='));
  assert.match(select, /writeSequence\.current \+= 1/);
  assert.match(source, /setEmail\(""\);\s*setPassword\(""\);\s*setNotice\(""\);\s*setError\(""\)/);
});

test('FILA DE PEDIDOS: teste focal é explícito e o gate cobre escrita, papéis, A/B, sequência, 503 e quatro larguras', () => {
  assert.ok(pkg.scripts['test:unit'].split(/\s+/).includes('tests/ux-pro-06-fila-pedidos-estados.test.mjs'));
  assert.match(gate, /UX-PRO-06 fila: papéis e escritas reais/);
  assert.match(gate, /UX-PRO-06 fila: leitura fora de ordem/);
  assert.match(gate, /UX-PRO-06 fila: A\/B sem resíduos/);
  assert.match(gate, /\[320, 390, 768, 1440\]/);
  assert.match(gate, /public_lead_status_audit/);
  assert.match(gate, /auth_access_audit/);
  assert.match(gate, /crm_lead_convert/);
  assert.match(gate, /lead-queue-denied/);
  assert.match(gate, /lead-queue-retry/);
});
