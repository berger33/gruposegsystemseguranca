// UX-PRO — jornada do RH em relatos explicitamente compartilhados.
//
// Esta guarda cobre a fatia aditiva que dá ao RH uma operação própria de
// atualização de situação em reclamações compartilhadas
// (`/api/admin/employee-complaint-hr-status`) e a aba correspondente em
// `/admin/funcionarios`. Ela NÃO promove o console de TI, não altera o PATCH
// legado (que continua devolvendo 500 ao RH por decisão pendente) e não
// altera o canal do cliente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEmployeeComplaintApi } from '../src/server/employee-complaint-api.mjs';

const readOptional = async (url) => readFile(new URL(url, import.meta.url), 'utf8').catch(() => '');

const component = await readOptional('../src/app/admin/funcionarios/SharedComplaints.tsx');
const componentStyles = await readOptional('../src/app/admin/funcionarios/SharedComplaints.module.css');
const workspace = await readOptional('../src/app/admin/funcionarios/RhWorkspace.tsx');
const page = await readOptional('../src/app/admin/funcionarios/page.tsx');
const server = (await readOptional('../server.mjs')).replace(/\\\//g, '/');
const apiSource = await readOptional('../src/server/employee-complaint-api.mjs');
const portalGate = await readOptional('./ux-portal-workspace.integration.test.mjs');
const packageJson = JSON.parse(await readOptional('../package.json') || '{}');

const STATUS_ENDPOINT = '/api/admin/employee-complaint-hr-status';

// ---------------------------------------------------------------------------
// 1. Aba aditiva no RH: sem tocar no console de TI e sem retirar abas.
// ---------------------------------------------------------------------------
test('RH compartilhado: aba aditiva em /admin/funcionarios sem montar a tela de TI', () => {
  assert.ok(workspace.length, 'RhWorkspace.tsx precisa existir');
  assert.match(workspace, /id: 'compartilhadas'/);
  assert.match(workspace, /label: 'Reclamações compartilhadas'/);
  assert.match(workspace, /tab === 'compartilhadas' \? <SharedComplaints \/> : null/);
  assert.match(workspace, /import SharedComplaints from '\.\/SharedComplaints';/);
  // Nenhuma aba do console de TI é montada aqui: a chave da aba de TI
  // (`reclamacoes_colaboradores`) não existe no workspace do RH.
  assert.ok(!workspace.includes('reclamacoes_colaboradores'), 'o RH não deve montar a aba do console de TI');
  // As nove abas anteriores continuam declaradas.
  for (const id of ['equipe', 'admissao', 'escala', 'ponto', 'solicitacoes', 'documentos', 'folha', 'desligamento', 'processos']) {
    assert.ok(workspace.includes(`id: '${id}'`), `preservar aba ${id}`);
  }
  // O gate da página não muda de papéis.
  assert.match(page, /allowedRoles=\{\['rh', 'marcelo', 'admin', 'ti'\]\}/);
});

// ---------------------------------------------------------------------------
// 2. Servidor: rota nova despachada; rota legada e consumidores preservados.
// ---------------------------------------------------------------------------
test('RH compartilhado: rota própria despachada e caminho legado intacto', () => {
  assert.ok(server.includes(`"/api/admin/employee-complaint-hr-status"`), 'server.mjs precisa despachar a rota nova');
  assert.match(server, /employeeComplaintApi\.handleHrStatus\(req, res\)/);
  // API_PATH_MATCH precisa reconhecer a rota, senão ela cai no handler do Next.
  assert.ok(server.includes(`|| pathname === "/api/admin/employee-complaint-hr-status"`),
    'API_PATH_MATCH precisa incluir a rota nova');
  // Fábrica devolve o novo handler.
  assert.match(apiSource, /handleHrShare, handleHrStatus/);
  // Os cinco despachos anteriores continuam existindo.
  for (const path of ['/api/admin/employee-complaints', '/api/admin/employee-complaint-messages',
    '/api/admin/employee-complaint-evidences', '/api/admin/employee-complaint-hr-shares']) {
    assert.ok(server.includes(path), `preservar despacho ${path}`);
  }
  // O PATCH legado do RH permanece com o parâmetro sem tipo (500 registrado),
  // sem ser "consertado" por esta fatia.
  assert.match(apiSource, /const statusParameter = isAdmin \? '\$2::cli_complaint_status' : '\$2';/);
  assert.match(apiSource, /RETURNING \*/);
});

function request(method, url, body) {
  let consumed = false;
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      if (!consumed && body !== undefined) { consumed = true; yield Buffer.from(JSON.stringify(body)); }
    },
  };
}

function response() {
  return {
    status: 0,
    payload: null,
    writeHead(status) { this.status = status; },
    end(body) { this.payload = body ? JSON.parse(body) : null; },
  };
}

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const sharedRow = {
  id: ID, protocol: 'CLI-COMP-20261029-AB12', category: 'outro', severity: 'media',
  status: 'pendente', is_restricted: true, minimal_share: true, is_shared_with_hr: true,
  shared_with_hr_at: '2026-10-29T10:00:00.000Z', created_at: '2026-10-29T09:00:00.000Z',
  // Colunas que o servidor não pode devolver ao RH por esta rota:
  title: 'Título sintético restrito', description: 'Descrição sintética restrita com mais de vinte caracteres.',
  employee_reference: 'REF-SINTETICA', employee_reference_hash: 'a'.repeat(64),
  client_account_id: OTHER_ID, contract_id: OTHER_ID, contact_id: OTHER_ID, employee_id: OTHER_ID,
};

function makeApi({ role = 'rh', selectRows = [sharedRow], updateRows = null, auditFails = false } = {}) {
  const statements = [];
  const state = { committed: false, rolledBack: 0, released: 0 };
  const client = {
    async query(sql, params) {
      statements.push({ sql: String(sql), params });
      if (sql === 'BEGIN') return { rows: [] };
      if (sql === 'COMMIT') { state.committed = true; return { rows: [] }; }
      if (sql === 'ROLLBACK') { state.rolledBack += 1; return { rows: [] }; }
      if (String(sql).includes('FOR UPDATE')) return { rows: selectRows };
      if (String(sql).includes('UPDATE cli_employee_complaints')) {
        if (updateRows === null) return { rows: [{ ...sharedRow, status: params[1] }] };
        return { rows: updateRows };
      }
      if (String(sql).includes('INSERT INTO cli_employee_complaint_history')) {
        return { rows: [{ previous_status: 'pendente', next_status: params[2], is_hr_share: false, created_at: '2026-10-29T11:00:00.000Z' }] };
      }
      if (String(sql).includes('INSERT INTO audit_log')) {
        if (auditFails) throw new Error('audit_log indisponível');
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() { state.released += 1; },
  };
  const pool = {
    connect: async () => client,
    query: async (sql, params) => { statements.push({ sql: String(sql), params, outsideTransaction: true }); return { rows: [] }; },
  };
  const api = createEmployeeComplaintApi({
    pool,
    sameOrigin: () => true,
    requireSession: async () => ({ role, identityId: ID }),
    requireRole: (session, roles) => roles.includes(session.role) || session.role === 'admin',
    auditLog: async () => {},
  });
  return { api, statements, state };
}

const validBody = { id: ID, status: 'em_analise', reason: 'Motivo sintético com mais de dez caracteres.' };

// ---------------------------------------------------------------------------
// 3. Autorização decidida no servidor.
// ---------------------------------------------------------------------------
test('RH compartilhado: mesma origem, sessão e papéis autorizados de fato', async () => {
  const noOrigin = createEmployeeComplaintApi({
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release() {} }) },
    sameOrigin: () => false,
    requireSession: async () => ({ role: 'rh', identityId: ID }),
    requireRole: () => true,
    auditLog: async () => {},
  });
  let res = response();
  await noOrigin.handleHrStatus(request('PATCH', STATUS_ENDPOINT, validBody), res);
  assert.equal(res.status, 403);
  assert.equal(res.payload.error, 'forbidden');

  const anonymous = createEmployeeComplaintApi({
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release() {} }) },
    sameOrigin: () => true,
    requireSession: async () => null,
    requireRole: () => false,
    auditLog: async () => {},
  });
  res = response();
  await anonymous.handleHrStatus(request('PATCH', STATUS_ENDPOINT, validBody), res);
  assert.equal(res.status, 401);
  assert.equal(res.payload.error, 'unauthorized');

  for (const role of ['comercial', 'marcelo', 'financeiro', 'operacao', 'supervisor', 'cliente']) {
    const { api, state } = makeApi({ role });
    res = response();
    await api.handleHrStatus(request('PATCH', STATUS_ENDPOINT, validBody), res);
    assert.equal(res.status, 403, `${role} não pode atualizar situação pelo canal do RH`);
    assert.equal(res.payload.error, 'forbidden_restricted_channel');
    assert.equal(state.committed, false);
  }

  for (const role of ['rh', 'admin', 'ti']) {
    const { api } = makeApi({ role });
    res = response();
    await api.handleHrStatus(request('PATCH', STATUS_ENDPOINT, validBody), res);
    assert.equal(res.status, 200, `${role} precisa ser aceito quando o relato está compartilhado`);
  }

  const { api } = makeApi();
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    res = response();
    await api.handleHrStatus(request(method, STATUS_ENDPOINT, undefined), res);
    assert.equal(res.status, 405, `${method} não é aceito nesta operação`);
    assert.equal(res.payload.error, 'method_not_allowed');
  }
});

// ---------------------------------------------------------------------------
// 4. Validação de entrada antes de qualquer SQL de escrita.
// ---------------------------------------------------------------------------
test('RH compartilhado: validação recusa entrada inválida sem tocar no banco', async () => {
  const cases = [
    [{ status: 'em_analise', reason: 'Motivo sintético com mais de dez caracteres.' }, 'invalid_id'],
    [{ id: 'nao-e-uuid', status: 'em_analise', reason: 'Motivo sintético com mais de dez caracteres.' }, 'invalid_id'],
    [{ id: ID, status: 'inventada', reason: 'Motivo sintético com mais de dez caracteres.' }, 'invalid_status'],
    [{ id: ID, reason: 'Motivo sintético com mais de dez caracteres.' }, 'invalid_status'],
    [{ id: ID, status: 'em_analise', reason: 'curto' }, 'invalid_reason'],
    [{ id: ID, status: 'em_analise', reason: 'x'.repeat(1001) }, 'invalid_reason'],
    [{ id: ID, status: 'em_analise', reason: 'Motivo sintético com mais de dez caracteres.', expected_status: 'inventada' }, 'invalid_expected_status'],
  ];
  for (const [body, code] of cases) {
    const { api, statements, state } = makeApi();
    const res = response();
    await api.handleHrStatus(request('PATCH', STATUS_ENDPOINT, body), res);
    assert.equal(res.status, 400, `esperado 400 para ${JSON.stringify(body).slice(0, 60)}`);
    assert.equal(res.payload.error, code);
    assert.equal(statements.length, 0, 'entrada inválida não pode abrir transação');
    assert.equal(state.connected, undefined);
  }
});

// ---------------------------------------------------------------------------
// 5. Checagem de compartilhamento e concorrência.
// ---------------------------------------------------------------------------
test('RH compartilhado: relato não compartilhado é negado e concorrência é explícita', async () => {
  // Não compartilhado: a seleção com trava não devolve linha.
  let { api, statements, state } = makeApi({ selectRows: [] });
  let res = response();
  await api.handleHrStatus(request('PATCH', STATUS_ENDPOINT, validBody), res);
  assert.equal(res.status, 404);
  assert.equal(res.payload.error, 'not_found');
  assert.equal(state.committed, false);
  assert.equal(state.rolledBack, 1);
  assert.ok(!statements.some(item => item.sql.includes('UPDATE cli_employee_complaints')), 'nada é atualizado sem compartilhamento');
  const select = statements.find(item => item.sql.includes('FOR UPDATE'));
  assert.ok(select, 'a leitura precisa travar a linha');
  assert.match(select.sql, /is_shared_with_hr=true/);
  assert.match(select.sql, /is_restricted=true/);
  assert.deepEqual(select.params, [ID]);

  // Concorrência: a situação corrente divergiu da esperada.
  ({ api, state } = makeApi());
  res = response();
  await api.handleHrStatus(request('PATCH', STATUS_ENDPOINT, { ...validBody, expected_status: 'em_apuracao' }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, 'status_conflict');
  assert.equal(res.payload.current_status, 'pendente');
  assert.equal(state.committed, false);
  assert.equal(state.rolledBack, 1);

  // Sem mudança real: nada de histórico fabricado.
  ({ api, statements, state } = makeApi());
  res = response();
  await api.handleHrStatus(request('PATCH', STATUS_ENDPOINT, { ...validBody, status: 'pendente' }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, 'status_unchanged');
  assert.equal(state.committed, false);
  assert.ok(!statements.some(item => item.sql.includes('INSERT INTO cli_employee_complaint_history')));

  // Corrida perdida no UPDATE (relato deixou de estar compartilhado).
  ({ api, state } = makeApi({ updateRows: [] }));
  res = response();
  await api.handleHrStatus(request('PATCH', STATUS_ENDPOINT, validBody), res);
  assert.equal(res.status, 404);
  assert.equal(state.committed, false);
  assert.equal(state.rolledBack, 1);
});

// ---------------------------------------------------------------------------
// 6. Escrita real: projeção mínima, histórico e auditoria na mesma transação.
// ---------------------------------------------------------------------------
test('RH compartilhado: escrita usa enum explícito, projeção mínima e transação', async () => {
  const { api, statements, state } = makeApi();
  const res = response();
  await api.handleHrStatus(request('PATCH', STATUS_ENDPOINT, { ...validBody, expected_status: 'pendente' }), res);
  assert.equal(res.status, 200);
  assert.equal(state.committed, true);
  assert.equal(state.rolledBack, 0);
  assert.equal(state.released, 1);

  // Projeção mínima, sem descrição, título, referência, conta ou hash.
  assert.deepEqual(Object.keys(res.payload.complaint).sort(), [
    'category', 'created_at', 'id', 'is_restricted', 'is_shared_with_hr', 'minimal_share',
    'protocol', 'severity', 'shared_with_hr_at', 'status',
  ]);
  for (const forbidden of ['description', 'title', 'employee_reference', 'employee_reference_hash',
    'client_account_id', 'contract_id', 'contact_id', 'employee_id', 'request_fingerprint', 'responsible_id']) {
    assert.ok(!(forbidden in res.payload.complaint), `a resposta não pode conter ${forbidden}`);
  }
  assert.equal(res.payload.complaint.status, 'em_analise');
  assert.ok(res.payload.history, 'a resposta precisa informar o histórico criado');

  const update = statements.find(item => item.sql.includes('UPDATE cli_employee_complaints'));
  assert.ok(update, 'a escrita precisa acontecer');
  assert.match(update.sql, /\$2::cli_complaint_status/, 'o enum precisa ser tipado explicitamente (42P08)');
  assert.match(update.sql, /is_shared_with_hr=true/, 'a escrita repete a guarda de compartilhamento');
  assert.match(update.sql, /RETURNING id, protocol/);
  assert.doesNotMatch(update.sql, /RETURNING \*/);
  assert.deepEqual(update.params, [ID, 'em_analise']);

  const history = statements.find(item => item.sql.includes('INSERT INTO cli_employee_complaint_history'));
  assert.ok(history, 'toda transição precisa de histórico');
  assert.equal(history.params[1], 'pendente');
  assert.equal(history.params[2], 'em_analise');
  assert.equal(history.params[3], validBody.reason);

  const audit = statements.find(item => item.sql.includes('INSERT INTO audit_log'));
  assert.ok(audit, 'a auditoria precisa participar da transação');
  assert.equal(audit.params[0], 'cli_complaint_hr_status');
  assert.doesNotMatch(audit.params[3] || '', /Descrição sintética|REF-SINTETICA/);

  // BEGIN … COMMIT na mesma conexão; nenhuma escrita fora da transação.
  const ordered = statements.map(item => item.sql === 'BEGIN' ? 'BEGIN' : item.sql === 'COMMIT' ? 'COMMIT' : 'other');
  assert.equal(ordered[0], 'BEGIN');
  assert.equal(ordered[ordered.length - 1], 'COMMIT');
  assert.ok(!statements.some(item => item.outsideTransaction), 'nenhuma escrita pode escapar da transação');
});

test('RH compartilhado: falha da auditoria desfaz a escrita e responde 503', async () => {
  const { api, statements, state } = makeApi({ auditFails: true });
  const res = response();
  await api.handleHrStatus(request('PATCH', STATUS_ENDPOINT, validBody), res);
  assert.equal(res.status, 503);
  assert.equal(res.payload.error, 'complaint_status_unavailable');
  assert.equal(state.committed, false);
  assert.equal(state.rolledBack, 1);
  assert.equal(state.released, 1);
  assert.ok(!statements.some(item => item.sql === 'COMMIT'), 'falha da auditoria não pode confirmar a transação');
});

// ---------------------------------------------------------------------------
// 7. Interface: estados honestos, sequência e validação de arrays.
// ---------------------------------------------------------------------------
test('RH compartilhado: lista, detalhe e retry com estados distintos e sequência', () => {
  assert.ok(component.length, 'SharedComplaints.tsx precisa existir');
  for (const marker of ["const LIST_ENDPOINT = '/api/admin/employee-complaints'", "const HR_STATUS_ENDPOINT = '/api/admin/employee-complaint-hr-status'"]) {
    assert.ok(component.includes(marker), `falta ${marker}`);
  }
  assert.match(component, /listSequence/);
  assert.match(component, /detailSequence/);
  assert.match(component, /Array\.isArray/);
  assert.match(component, /payload inválido/i);
  for (const state of ['loading', 'empty', 'error', 'denied']) {
    assert.ok(component.includes(`variant="${state}"`), `falta ${state}`);
  }
  assert.match(component, /onRetry=\{\(\)/);
  assert.match(component, /aria-busy=/);
  assert.match(component, /role="status"/);
  assert.match(component, /role="alert"/);
  assert.match(component, /function parseDateOnly/);
});

test('RH compartilhado: campos adicionais só quando explicitamente compartilhados', () => {
  assert.match(component, /shared_field/);
  assert.match(component, /minimal_description/);
  // Nenhum dado restrito é renderizado ou sequer lido pela jornada do RH.
  for (const forbidden of ['employee_reference', 'employee_reference_hash', 'client_account_id',
    'contract_id', 'contact_id', 'request_fingerprint', 'storage_key', 'file_url',
    'sender_identity', 'uploaded_by_identity']) {
    assert.ok(!component.includes(forbidden), `a jornada não pode tocar em ${forbidden}`);
  }
  // A descrição integral do relato não é lida nem renderizada (só o campo
  // eventualmente compartilhado como `minimal_description`).
  assert.doesNotMatch(component, /\.description\b/);
  // O envelope lido do servidor não carrega título: só o campo compartilhado.
  assert.match(component, /function parseComplaint\(value: unknown\)[\s\S]{0,900}?created_at: typeof value\.created_at === 'string' \? value\.created_at : ''/);
  // Título/descrição mínima aparecem só por leitura dos campos compartilhados.
  assert.match(component, /SHARED_EXTRA_LABELS/);
  assert.match(component, /title:/);
  assert.match(component, /minimal_description:/);
});

test('RH compartilhado: rótulos, traduções, foco visível e responsividade', () => {
  assert.match(component, /htmlFor=/);
  assert.match(component, /aria-describedby/);
  assert.match(component, /ERROR_LABELS/);
  for (const code of ['invalid_status', 'invalid_reason', 'invalid_expected_status', 'status_conflict',
    'status_unchanged', 'not_found', 'forbidden_restricted_channel', 'complaint_status_unavailable']) {
    assert.ok(component.includes(code), `tradução ausente: ${code}`);
  }
  assert.doesNotMatch(component, /\b(?:alert|prompt|confirm)\(/);
  assert.doesNotMatch(component, /style=\{\{/);
  assert.doesNotMatch(component, /:\s*any\b/);
  // Uma única escrita: a rota nova. O PATCH legado não é usado pela jornada.
  assert.equal((component.match(/method: 'PATCH'/g) || []).length, 1);

  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted',
    '--ux-color-border', '--ux-color-focus', '--ux-color-error']) {
    assert.ok(componentStyles.includes(token), `falta token ${token}`);
  }
  assert.match(componentStyles, /:focus-visible/);
  for (const breakpoint of ['@media(max-width:900px)', '@media(max-width:650px)']) {
    assert.ok(componentStyles.includes(breakpoint), `falta breakpoint ${breakpoint}`);
  }
  assert.doesNotMatch(componentStyles, /#[0-9a-f]{3,8}\b/i);
});

// ---------------------------------------------------------------------------
// 8. Registro: gate do portal mantém a dívida e ganha o cenário novo.
// ---------------------------------------------------------------------------
test('RH compartilhado: dívida legada preservada e cenário novo registrado no gate', () => {
  assert.ok(portalGate.length, 'o gate do portal precisa existir');
  // A asserção do 500 legado continua exatamente como estava.
  assert.match(portalGate, /assert\.equal\(rhPatch\.status, 500\)/);
  assert.match(portalGate, /assert\.equal\(rhPatch\.body\.error, 'internal_error'\)/);
  // Cenário novo desta fatia.
  assert.match(portalGate, /HR_STATUS_ENDPOINT|employee-complaint-hr-status/);
  assert.ok(packageJson.scripts?.['test:unit']?.includes('tests/ux-pro-rh-reclamacoes-compartilhadas-ui.test.mjs'),
    'o teste focal precisa estar explícito no test:unit');
});
