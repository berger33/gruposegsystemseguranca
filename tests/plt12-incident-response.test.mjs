// PLT-12 — resposta a incidente: focal hermético no `test:unit`.
// Invariante provado aqui: a superfície `incidentes` já montada (TiConsole +
// src/server/incident-api.mjs) preserva o contrato existente — RBAC admin/ti,
// same_origin_required nas escritas, tipos/status/evidências/ações fechados,
// transição de status restrita pela matriz do banco, evidência como referência
// (checksum, sem upload), comunicação como registro interno (sem envio externo),
// leitura sem escrita (apenas SELECT, nenhum auth_access_audit) e validação de
// id canônico (E17). Não promove aba, não abre a borda legada de RH,
// não substitui superfície existente e não registra aceite humano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createIncidentApi } from '../src/server/incident-api.mjs';
import {
  INCIDENT_TYPES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  INCIDENT_EVIDENCE_TYPES,
  INCIDENT_ACTION_TYPES,
  INCIDENT_ACTION_STATUSES,
  INCIDENT_RECIPIENT_TYPES,
  INCIDENT_ALLOWED_TRANSITIONS,
  INCIDENT_READ_BOUNDARY,
  transitionRequiredFields,
  canTransition,
  uuidRe,
  sanitize,
  parseIncidentType,
  parseIncidentSeverity,
  parseIncidentStatus,
  parseEvidenceType,
  parseActionType,
  parseActionStatus,
  parseRecipientType,
} from '../src/server/incident-read-contract.mjs';

const apiSource = await readFile(new URL('../src/server/incident-api.mjs', import.meta.url), 'utf8');
const serverSource = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const consoleSource = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const componentSource = await readFile(new URL('../src/app/admin/ti/IncidentClient.tsx', import.meta.url), 'utf8');
const contractSource = await readFile(new URL('../src/server/incident-read-contract.mjs', import.meta.url), 'utf8');

const INCIDENT_PATHS = [
  '/api/admin/incidents',
  '/api/crm/incidents',
  '/api/security/incidents',
  '/api/admin/incidents/evidences',
  '/api/crm/incidents/evidences',
  '/api/security/incidents/evidences',
  '/api/admin/incidents/actions',
  '/api/crm/incidents/actions',
  '/api/security/incidents/actions',
  '/api/admin/incidents/communications',
  '/api/crm/incidents/communications',
  '/api/security/incidents/communications',
];
const AUDIT_ACTIONS = [
  'incident_create', 'incident_update', 'incident_contain', 'incident_close',
  'incident_evidence_add', 'incident_action_create', 'incident_action_complete', 'incident_communicate',
];

const INCIDENT_ID = '00000000-0000-4000-8000-000000000001';

function fakePoolFactory(behavior = {}) {
  const statements = [];
  const incidentRow = behavior.incidentRow ?? { id: INCIDENT_ID, status: 'aberto', root_cause: null, containment_lead_name: null };
  const rowsByPrefix = {
    'SELECT * FROM security_incidents WHERE id': [incidentRow],
    'SELECT * FROM incident_evidences': [],
    'SELECT * FROM incident_actions': [],
    'SELECT * FROM incident_communications': [],
    'SELECT * FROM incident_history': [],
  };
  const listRow = behavior.listRows ?? [];
  return {
    statements,
    async query(sql, values = []) {
      const s = String(sql).trim();
      statements.push({ sql: s, values });
      if (/^INSERT/i.test(s)) return { rows: [{ id: randomId() }] };
      if (/^UPDATE/i.test(s)) return { rows: [{ id: values[values.length - 1] }] };
      for (const [prefix, rows] of Object.entries(rowsByPrefix)) {
        if (s.startsWith(prefix)) return { rows };
      }
      if (/^SELECT \* FROM security_incidents\b/i.test(s)) return { rows: listRow };
      return { rows: [] };
    },
  };
}

function randomId() {
  return 'qa-' + [...Array(16)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
}

function fakeRes() {
  let status; const headers = []; let body = null;
  return {
    writeHead: (s, h) => { status = s; headers.push(h); },
    end: (data) => { body = data === undefined ? null : typeof data === 'string' ? data : JSON.stringify(data); },
    get: () => null,
    _captured: () => ({ status, headers, body }),
  };
}

function fakeReq(method, url, body, origin = true) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  stream.method = method;
  stream.url = url;
  stream.headers = { host: '127.0.0.1:3000', origin: origin ? 'http://127.0.0.1:3000' : 'https://example.invalid' };
  return stream;
}

function buildApi({
  pool = fakePoolFactory(),
  sameOrigin = true,
  session = { role: 'ti', identityId: 'qa-1', username: 'qa-ti', userId: 'qa-1' },
  requireRole = (sess, roles) => roles.includes(sess.role),
  auditLog = async () => {},
} = {}) {
  const output = [];
  const api = createIncidentApi({
    pool,
    auditLog,
    sameOrigin: typeof sameOrigin === 'function' ? sameOrigin : () => sameOrigin,
    requireSession: async () => session,
    requireRole,
    json: (_res, status, body, headers = {}) => {
      output.push({ status, body, headers });
      return { status, body, headers };
    },
  });
  // O handler real escreve no objeto `res`; o falso espelha para `output`.
  const realHandle = { handleIncidents: api.handleIncidents, handleIncidentById: api.handleIncidentById,
    handleEvidences: api.handleEvidences, handleActions: api.handleActions, handleCommunications: api.handleCommunications };
  return { api: realHandle, output, pool, last: () => output.at(-1), res: () => {
    const res = fakeRes();
    return res;
  } };
}

async function call(handler, req, res, id) {
  await handler(req, res, id);
  return res._captured();
}

test('PLT-12 contrato puro: vocabulários fechados (tipos, severidades, statuses, evidências, ações, destinatários)', () => {
  assert.deepEqual([...INCIDENT_TYPES], [
    'vazamento_dados', 'acesso_nao_autorizado', 'perda_dados', 'indisponibilidade', 'malware', 'phishing', 'violacao_privacidade', 'outro',
  ]);
  assert.deepEqual([...INCIDENT_SEVERITIES], ['baixa', 'media', 'alta', 'critica']);
  assert.deepEqual([...INCIDENT_STATUSES], [
    'aberto', 'em_contencao', 'em_analise', 'em_remediacao', 'aguardando_comunicacao', 'comunicado', 'encerrado', 'reaberto',
  ]);
  assert.deepEqual([...INCIDENT_EVIDENCE_TYPES], ['log', 'print', 'relatorio', 'depoimento', 'arquivo', 'outro']);
  assert.deepEqual([...INCIDENT_ACTION_TYPES], ['contencao', 'erradicacao', 'recuperacao', 'comunicacao', 'analise', 'prevencao', 'outro']);
  assert.deepEqual([...INCIDENT_ACTION_STATUSES], ['pendente', 'em_execucao', 'concluida', 'cancelada']);
  assert.deepEqual([...INCIDENT_RECIPIENT_TYPES], ['dpo', 'autoridade', 'titular', 'interno', 'cliente', 'outro']);
});

test('PLT-12 contrato puro: fronteira de superfície (somente leitura de estado, sem borda RH, sem upload, sem envio externo, sem promoção)', () => {
  assert.deepEqual(INCIDENT_READ_BOUNDARY, {
    leitura_grava_auditoria: false,
    leitura_altera_incidente: false,
    leitura_altera_permissoes: false,
    abre_borda_rh_legada: false,
    substitui_superficie_existente: false,
    promocao_de_tela: false,
    evidencia_nao_eh_upload: true,
    comunicacao_so_registro_interno: true,
  });
  assert.equal(contractSource.includes('employees.read'), false, 'não referencia a borda legada de RH');
  assert.equal(contractSource.includes('authorizeLegacyHrRequest'), false, 'não referencia authorizeLegacyHrRequest');
});

test('PLT-12 contrato puro: matriz de transição de status', () => {
  assert.equal(canTransition('aberto', 'em_contencao'), true);
  assert.equal(canTransition('aberto', 'em_analise'), true);
  assert.equal(canTransition('aberto', 'encerrado'), true);
  assert.equal(canTransition('aberto', 'comunicado'), false, 'não salta etapas');
  assert.equal(canTransition('encerrado', 'reaberto'), true);
  assert.equal(canTransition('reaberto', 'aberto'), false, 'reaberto não volta direto para aberto');
  assert.equal(canTransition('inexistente', 'aberto'), false);
  assert.equal(Object.keys(INCIDENT_ALLOWED_TRANSITIONS).length, 8);
});

test('PLT-12 contrato puro: campos exigidos por transição (contenção e encerramento)', () => {
  assert.deepEqual(transitionRequiredFields('em_contencao', {}), ['containment_lead_name']);
  assert.deepEqual(transitionRequiredFields('em_contencao', { containment_lead_name: 'Líder' }), []);
  assert.deepEqual(transitionRequiredFields('encerrado', {}), ['root_cause']);
  assert.deepEqual(transitionRequiredFields('encerrado', { root_cause: 'causa' }), []);
  assert.deepEqual(transitionRequiredFields('em_analise', {}), []);
});

test('PLT-12 contrato puro: parsers aceitam valores válidos e recusam valores inventados', () => {
  assert.equal(parseIncidentType('vazamento_dados'), 'vazamento_dados');
  assert.equal(parseIncidentType('VAZAMENTO_DADOS'), 'vazamento_dados');
  assert.equal(parseIncidentType(null), null);
  assert.equal(parseIncidentType(''), null);
  assert.equal(parseIncidentType("outro' OR 1=1 --"), null, 'não aceita injeção de tipo');
  assert.equal(parseIncidentSeverity('critica'), 'critica');
  assert.equal(parseIncidentSeverity('urgente'), null);
  assert.equal(parseIncidentStatus('reaberto'), 'reaberto');
  assert.equal(parseIncidentStatus('encerrado_na_forca'), null);
  assert.equal(parseEvidenceType('print'), 'print');
  assert.equal(parseEvidenceType('anexo'), null);
  assert.equal(parseActionType('contencao'), 'contencao');
  assert.equal(parseActionType('mitigacao'), null);
  assert.equal(parseActionStatus('concluida'), 'concluida');
  assert.equal(parseActionStatus('feito'), null);
  assert.equal(parseRecipientType('dpo'), 'dpo');
  assert.equal(parseRecipientType('juizado'), null);
});

test('PLT-12 contrato puro: sanitize e UUID canônico (E17)', () => {
  assert.equal(sanitize('  x  ', 10), 'x');
  assert.equal(sanitize(null), '');
  assert.equal(sanitize('a'.repeat(10000), 5000).length, 5000);
  assert.equal(uuidRe().test('00000000-0000-4000-8000-000000000000'), true);
  assert.equal(uuidRe().test('nao-e-uuid'), false);
  assert.equal(uuidRe().test('00000000-0000-4000-8000-00000000000'), false);
});

test('PLT-12 API: criar incidente grava linha, histórico de abertura e auditoria', async () => {
  const pool = fakePoolFactory();
  const auditCalls = [];
  const { api, res, last } = buildApi({ pool, auditLog: async (call) => { auditCalls.push(call); } });
  const captured = await call(api.handleIncidents, fakeReq('POST', '/api/admin/incidents', {
    incident_type: 'vazamento_dados', severity: 'alta', title: 'Incidente sintético de prober PLT-12',
    description: 'Descrição com mais de vinte caracteres do prober.', affected_data_categories: ['identificacao'],
    affected_records_estimate: 3, affected_systems: ['sistema-a'], responsible_name: 'QA', responsible_id: 'resp-1',
  }), res());
  assert.equal(captured.status, 201, `esperado 201, obteve ${captured.status} ${captured.body}`);
  const inserts = pool.statements.filter(s => /^INSERT/i.test(s.sql));
  assert.equal(inserts.length, 2, `esperados 2 INSERT (incidente + histórico), obteve ${inserts.length}`);
  assert.ok(inserts[0].sql.includes('security_incidents'), 'INSERT em security_incidents');
  assert.ok(inserts[1].sql.includes('incident_history'), 'INSERT em incident_history');
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].action, 'incident_create');
  assert.equal(auditCalls[0].actor, 'qa-ti');
});

test('PLT-12 API: leitura de estado emite apenas SELECT (não grava auditoria nem altera incidente)', async () => {
  const pool = fakePoolFactory({ listRows: [{ id: INCIDENT_ID, status: 'aberto' }] });
  const { api, res } = buildApi({ pool });
  await call(api.handleIncidents, fakeReq('GET', '/api/admin/incidents?type=vazamento_dados&status=aberto'), res());
  await call(api.handleIncidentById, fakeReq('GET', `/api/admin/incidents/${INCIDENT_ID}`, undefined), res(), INCIDENT_ID);
  const writes = pool.statements.filter(s => /^(INSERT|UPDATE|DELETE)/i.test(s.sql));
  assert.equal(writes.length, 0, `leitura não escreve: obteve ${writes.length} escrita(s)`);
  const selects = pool.statements.filter(s => /^SELECT/i.test(s.sql));
  assert.ok(selects.some(s => s.sql.includes('incident_type')), 'listagem consulta security_incidents');
  assert.ok(selects.some(s => s.sql.includes('incident_history')), 'detalhe consulta histórico');
});

test('PLT-12 API: RBAC — sessão ausente 401, papel rh 403, ti/admin 200 na leitura', async () => {
  const pool = fakePoolFactory();
  const base = { pool };
  const sessRole = async role => buildApi({ ...base, session: { role, identityId: 'qa', username: 'qa', userId: 'qa' } });
  const anonimous = buildApi({ ...base, session: null });
  const { res: resAnon } = anonimous;
  const captured = await call(anonimous.api.handleIncidents, fakeReq('GET', '/api/admin/incidents'), resAnon());
  assert.equal(captured.status, 401, `anon 401 (obteve ${captured.status})`);
  assert.equal(JSON.parse(captured.body).error, 'unauthorized');
  const { res: resRh } = await sessRole('rh');
  const capturedRh = await call((await sessRole('rh')).api.handleIncidents, fakeReq('GET', '/api/admin/incidents'), resRh());
  assert.equal(capturedRh.status, 403, `rh 403 (obteve ${capturedRh.status})`);
  assert.equal(JSON.parse(capturedRh.body).error, 'forbidden');
  for (const role of ['ti', 'admin']) {
    const { api: roleApi, res: roleRes } = await sessRole(role);
    const capturedRole = await call(roleApi.handleIncidents, fakeReq('GET', '/api/admin/incidents'), roleRes());
    assert.equal(capturedRole.status, 200, `${role} 200 (obteve ${capturedRole.status})`);
  }
});

test('PLT-12 API: same_origin_required na escrita (contrato da superfície: 403 forbidden)', async () => {
  const pool = fakePoolFactory();
  const { api: crossApi, res: crossRes } = buildApi({ pool, sameOrigin: false });
  const captured = await call(crossApi.handleIncidents, fakeReq('POST', '/api/admin/incidents', { incident_type: 'phishing', title: 'x', description: 'y' }), crossRes());
  assert.equal(captured.status, 403, `escrita cross-origin 403 (obteve ${captured.status})`);
  assert.equal(JSON.parse(captured.body).error, 'forbidden');
  // Leitura segura não exige Origin (sessão/RBAC bastam): mesma origem simulada com sessão => 200
  const { api: sameApi, res: sameRes } = buildApi({ pool, sameOrigin: true, session: { role: 'ti', identityId: 'qa', username: 'qa', userId: 'qa' } });
  const capturedSame = await call(sameApi.handleIncidents, fakeReq('GET', '/api/admin/incidents', undefined, true), sameRes());
  assert.equal(capturedSame.status, 200);
});

test('PLT-12 API: validações de criação (400 com códigos do contrato)', async () => {
  const pool = fakePoolFactory();
  const { api, res } = buildApi({ pool });
  const invalid = (body, expectedCode) => call(api.handleIncidents, fakeReq('POST', '/api/admin/incidents', body), res())
    .then(c => { assert.equal(c.status, 400); assert.equal(JSON.parse(c.body).error, expectedCode); });
  await invalid({}, 'invalid_type');
  await invalid({ incident_type: 'vazamento_dados', severity: 'alta', title: 'curto', description: 'desc curta' }, 'title_min_10');
  await invalid({ incident_type: 'vazamento_dados', severity: 'alta', title: 'Título válido do prober com mais de dez', description: 'curto' }, 'description_min_20');
  await invalid({ incident_type: 'inventado', severity: 'alta', title: 'Título válido do prober com mais de dez', description: 'Descrição com mais de vinte caracteres.' }, 'invalid_type');
  await invalid({ incident_type: 'vazamento_dados', severity: 'inexistente', title: 'Título válido do prober com mais de dez', description: 'Descrição com mais de vinte caracteres.' }, 'invalid_severity');
  // Body não JSON vira objeto vazio e ainda assim falha de contrato, não de servidor
  const broken = await call(api.handleIncidents, fakeReq('POST', '/api/admin/incidents', undefined, true), res());
  assert.equal(broken.status, 400);
  assert.equal(JSON.parse(broken.body).error, 'invalid_type');
});

test('PLT-12 API: PATCH de incidente — transições, causas exigidas, id canônico e sem alteração', async () => {
  const pool = fakePoolFactory();
  const auditCalls = [];
  const { api, res } = buildApi({ pool, auditLog: async (call) => { auditCalls.push(call); } });
  const patch = (body) => call(api.handleIncidentById, fakeReq('PATCH', `/api/admin/incidents/${INCIDENT_ID}`, body), res(), INCIDENT_ID);
  // Transição inválida: aberto -> comunicado não é direto
  let captured = await patch({ next_status: 'comunicado', reason: 'x' });
  assert.equal(captured.status, 400, `transição inválida 400 (obteve ${captured.status})`);
  assert.equal(JSON.parse(captured.body).error, 'invalid_transition');
  assert.ok(JSON.parse(captured.body).allowed.includes('em_contencao'), 'informa transições permitidas');
  // Encerrado exige causa raiz
  captured = await patch({ next_status: 'encerrado', reason: 'x' });
  assert.equal(captured.status, 400);
  assert.equal(JSON.parse(captured.body).error, 'root_cause_required_for_close');
  // Conteção exige lead
  captured = await patch({ next_status: 'em_contencao', reason: 'contendo' });
  assert.equal(captured.status, 400);
  assert.equal(JSON.parse(captured.body).error, 'containment_lead_required');
  // Válida: aberto -> em_contencao com lead
  captured = await patch({ next_status: 'em_contencao', reason: 'contendo', containment_lead_name: 'Líder QA', containment_lead_id: 'lead-1' });
  assert.equal(captured.status, 200, `transição válida 200 (obteve ${captured.status})`);
  // Encerrado com causa
  captured = await patch({ next_status: 'encerrado', root_cause: 'causa raiz sintetica do prober', reason: 'encerrando' });
  assert.equal(captured.status, 200);
  const historyInserts = pool.statements.filter(s => /^INSERT.*incident_history/i.test(s.sql));
  assert.ok(historyInserts.length >= 1, 'histórico de transição gravado');
  const updateAudits = auditCalls.filter(c => c.action === 'incident_update' || c.action === 'incident_close');
  assert.ok(updateAudits.length >= 1, 'auditoria da transição gravada');
  // Body vazio => atualiza apenas carimbo de atualização (sem no_changes ativo): 200
  captured = await patch({});
  assert.equal(captured.status, 200);
  assert.equal(JSON.parse(captured.body).incident.id, INCIDENT_ID);
  // Id não canônico nunca chega a ser 200: contrato de superfície exige id UUID (o roteador agora o entrega ao handler)
  captured = await call(api.handleIncidentById, fakeReq('PATCH', '/api/admin/incidents/nao-e-uuid', { next_status: 'encerrado', root_cause: 'causa' }), res());
  assert.equal(captured.status, 400, `id não canônico 400 (obteve ${captured.status})`);
  assert.equal(JSON.parse(captured.body).error, 'invalid_id');
});

test('PLT-12 API: evidência é referência com checksum, sem upload', async () => {
  const pool = fakePoolFactory();
  const auditCalls = [];
  const { api, res } = buildApi({ pool, auditLog: async (call) => { auditCalls.push(call); } });
  const captured = await call(api.handleEvidences, fakeReq('POST', '/api/admin/incidents/evidences', {
    incident_id: INCIDENT_ID, evidence_type: 'log', title: 'Log do prober', description: 'd', file_reference: '/sintetico/log.txt',
  }), res());
  assert.equal(captured.status, 201, `evidência 201 (obteve ${captured.status})`);
  const insert = pool.statements.find(s => /^INSERT.*incident_evidences/i.test(s.sql));
  assert.ok(insert, 'INSERT em incident_evidences');
  const checksum = insert.values[5];
  assert.equal(typeof checksum, 'string');
  assert.equal(checksum.length, 32);
  assert.equal(/^[0-9a-f]{32}$/.test(checksum), true, 'checksum = sha256(referência).slice(0,32)');
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].action, 'incident_evidence_add');
  // Só POST é aceito
  const naoAceita = await call(api.handleEvidences, fakeReq('GET', '/api/admin/incidents/evidences', undefined), res());
  assert.equal(naoAceita.status, 405);
  assert.equal(JSON.parse(naoAceita.body).error, 'method_not_allowed');
});

test('PLT-12 API: ação de resposta e conclusão com auditoria', async () => {
  const pool = fakePoolFactory();
  const auditCalls = [];
  const { api, res } = buildApi({ pool, auditLog: async (call) => { auditCalls.push(call); } });
  const created = await call(api.handleActions, fakeReq('POST', '/api/admin/incidents/actions', {
    incident_id: INCIDENT_ID, action_type: 'contencao', title: 'Ação do prober',
    description: 'Descrição da ação com mais de dez caracteres.', assigned_to_name: 'A', due_at: '2027-01-01T00:00:00Z',
  }), res());
  assert.equal(created.status, 201, `ação 201 (obteve ${created.status})`);
  const actionId = '00000000-0000-4000-8000-000000000002';
  const concluida = await call(api.handleActions, fakeReq('PATCH', '/api/admin/incidents/actions', { id: actionId, status: 'concluida' }), res());
  assert.equal(concluida.status, 200, `conclusão 200 (obteve ${concluida.status})`);
  const update = pool.statements.find(s => /^UPDATE.*incident_actions/i.test(s.sql));
  assert.ok(update && String(update.values[0]) === 'concluida', 'status concluida gravado');
  const completeAudit = auditCalls.find(c => c.action === 'incident_action_complete');
  assert.ok(completeAudit, 'audit_log incident_action_complete');
  const invalida = await call(api.handleActions, fakeReq('PATCH', '/api/admin/incidents/actions', { id: actionId, status: 'finalizada' }), res());
  assert.equal(invalida.status, 400);
  assert.equal(JSON.parse(invalida.body).error, 'invalid_status');
  const naoAceita = await call(api.handleActions, fakeReq('GET', '/api/admin/incidents/actions', undefined), res());
  assert.equal(naoAceita.status, 405);
});

test('PLT-12 API: comunicação é registro interno, sem envio externo', async () => {
  const pool = fakePoolFactory();
  const auditCalls = [];
  const { api, res } = buildApi({ pool, auditLog: async (call) => { auditCalls.push(call); } });
  const captured = await call(api.handleCommunications, fakeReq('POST', '/api/admin/incidents/communications', {
    incident_id: INCIDENT_ID, recipient_type: 'dpo', recipient_contact: 'dpo@exemplo.invalid',
    subject: 'Comunicação do prober', content: 'Conteúdo da comunicação sintética com mais de vinte caracteres.',
  }), res());
  assert.equal(captured.status, 201, `comunicação 201 (obteve ${captured.status})`);
  const insert = pool.statements.find(s => /^INSERT.*incident_communications/i.test(s.sql));
  assert.ok(insert, 'INSERT em incident_communications');
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].action, 'incident_communicate');
  const naoAceita = await call(api.handleCommunications, fakeReq('PATCH', '/api/admin/incidents/communications', {}), res());
  assert.equal(naoAceita.status, 405);
});

test('PLT-12 API: métodos não suportados na coleção respondem 405', async () => {
  const pool = fakePoolFactory();
  const { api, res } = buildApi({ pool });
  for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const captured = await call(api.handleIncidents, fakeReq(method, '/api/admin/incidents', {}, true), res());
    assert.equal(captured.status, 405, `${method} 405 (obteve ${captured.status})`);
    assert.equal(JSON.parse(captured.body).error, 'method_not_allowed');
  }
});

test('PLT-12 guarda de superfície: rotas, papéis, alias, montagem da aba e mensagens preservadas', () => {
  for (const path of INCIDENT_PATHS) assert.ok(serverSource.includes(path), `servidor expõe ${path}`);
  assert.ok(apiSource.includes("requireRole(sess,['admin','ti'])"), 'RBAC admin/ti no handler');
  assert.ok(apiSource.includes('if(!sameOrigin(req))'), 'mesma origem nas escritas');
  for (const action of ['incident_create', 'incident_update', 'incident_evidence_add', 'incident_action_create', 'incident_action_complete', 'incident_communicate']) {
    assert.ok(apiSource.includes(`action:'${action}'`), `auditoria ${action}`);
  }
  assert.ok(apiSource.includes("'incident_contain'") && apiSource.includes("'incident_close'"), 'auditoria de contenção e encerramento');
  assert.ok(consoleSource.includes("active==='incidentes'&&<IncidentClient/>"), 'aba incidentes montada');
  assert.ok(consoleSource.includes("['incidentes','Incidentes']"), 'registro da aba no console');
  assert.ok(componentSource.includes('não faz upload nem verifica arquivos'), 'evidência declarada como referência');
  assert.ok(componentSource.includes('não envia e-mail, SMS ou notificação externa'), 'comunicação declarada como interna');
  assert.equal((uuidRe().toString().match(/\{[0-9]+\}-/g) || []).length, 4, 'UUID canônico E17 (8-4-4-4-12) na validação');
});
