import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createExtBiddingApi,
  deriveDeadlineSituation,
  deriveProposalWindow,
  deriveChecklistStatus,
  summarizeChecklist,
  BIDDING_STATUS_TRANSITIONS,
  BIDDING_TERMINAL_STATUSES,
  BIDDING_SOURCES,
  MARKET_RELEVANCE,
  EXTERNAL_CHANNEL_BOUNDARY,
  EMPTY_STATE_TEXT,
  PROPOSAL_DEADLINE_KIND,
} from "../src/server/ext-bidding-api.mjs";

const identityId = "22222222-2222-4222-8222-222222222222";
const biddingId = "11111111-1111-4111-8111-111111111111";
const deadlineId = "33333333-3333-4333-8333-333333333333";
const proposalId = "44444444-4444-4444-8444-444444444444";
const documentId = "55555555-5555-4555-8555-555555555555";
const checklistId = "66666666-6666-4666-8666-666666666666";
const responsibleId = "77777777-7777-4777-8777-777777777777";
const forged = "99999999-9999-4999-8999-999999999999";

const noticeRow = {
  id: biddingId, protocol: "LIC-EXT-20260101-AB12", title: "Edital sintético de vigilância",
  description: "Descrição sintética suficientemente longa para o teste.", edital_number: "ED-SINT-001",
  status: "publicado", origin: "jornada_canonica", publication_date: null, deadline_date: null,
  responsible_name: null, estimated_value_cents: "150000", result: null, result_recorded_at: null,
  result_recorded_by_identity: null, result_justification: null, closed_at: null,
  responsible_identity: null, responsible_assigned_at: null, responsible_assigned_by_identity: null,
  created_by_identity: identityId, created_at: "now", updated_at: "now",
};

function responseCapture() {
  return {
    status: 0,
    payload: null,
    writeHead(status) { this.status = status; },
    end(body) { this.payload = JSON.parse(body); },
  };
}

function request({ method = "GET", url = "/api/ext/bidding/notices", body, key = "ext03-test-key-0001" } = {}) {
  const bytes = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const headers = { host: "admin.test", origin: "https://admin.test" };
  if (key !== null) headers["idempotency-key"] = key;
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() { yield* bytes; },
  };
}

function api(pool, { session = { identityId, role: "admin" }, origin = true } = {}) {
  return createExtBiddingApi({
    pool,
    sameOrigin: () => origin,
    requireSession: async () => session,
  });
}

function readPool(routes = []) {
  const statements = [];
  const pool = {
    async query(sql, params) {
      statements.push({ sql, params });
      const normalized = String(sql).replace(/\s+/g, " ");
      for (const [needle, rows] of routes) {
        if (normalized.includes(needle)) return { rows };
      }
      return { rows: [] };
    },
  };
  return { statements, pool };
}

function mutationPool({
  replayRow = null,
  notice = noticeRow,
  failAudit = false,
  deadline = null,
  proposal = null,
  document = null,
  checklistItem = null,
  alertRule = null,
  identity = { id: responsibleId, status: "active", display_name: "Equipe Sintética", role: "ti" },
  maxVersion = 0,
  activeAssignment = null,
} = {}) {
  const statements = [];
  const client = {
    async query(rawSql, params) {
      statements.push({ sql: rawSql, params });
      // O SQL real é multilinha: o mock casa sobre a forma normalizada e as
      // agulhas de INSERT são ancoradas no parêntese para não colidirem entre
      // tabelas de prefixo comum (ext_bidding_document* / ext_bidding_deadlines).
      const sql = String(rawSql).replace(/\s+/g, " ");
      if (sql.includes("INSERT INTO audit_log")) {
        if (failAudit) throw new Error("audit offline");
        return { rows: [] };
      }
      if (sql.includes("idempotency_key=$2 FOR UPDATE")) return { rows: replayRow ? [replayRow] : [] };
      if (sql.includes("FROM ext_bidding_notices WHERE id=$1 FOR UPDATE")) return { rows: notice ? [{ ...notice }] : [] };
      if (sql.includes("FROM ext_bidding_notices WHERE id=$1")) return { rows: notice ? [{ ...notice }] : [] };
      if (sql.includes("FROM auth_identities i")) return { rows: identity ? [{ ...identity }] : [] };
      if (sql.includes("FROM ext_bidding_responsible_assignments WHERE bidding_id=$1 AND released_at IS NULL FOR UPDATE")) {
        return { rows: activeAssignment ? [{ ...activeAssignment }] : [] };
      }
      if (sql.includes("FROM ext_bidding_deadlines WHERE id=$1 FOR UPDATE")) return { rows: deadline ? [{ ...deadline }] : [] };
      if (sql.includes("FROM ext_bidding_deadlines WHERE bidding_id=$1 AND deadline_kind=$2 AND superseded_at IS NULL")) {
        return { rows: deadline && !deadline.superseded_at ? [{ ...deadline }] : [] };
      }
      if (sql.includes("FROM ext_bidding_proposals WHERE id=$1 FOR UPDATE")) return { rows: proposal ? [{ ...proposal }] : [] };
      if (sql.includes("MAX(version),0)::int AS max_version FROM ext_bidding_proposals")) return { rows: [{ max_version: maxVersion }] };
      if (sql.includes("MAX(version),0)::int AS max_version FROM ext_bidding_documents")) return { rows: [{ max_version: maxVersion }] };
      if (sql.includes("FROM ext_bidding_documents WHERE id=$1 FOR UPDATE")) return { rows: document ? [{ ...document }] : [] };
      if (sql.includes("FROM ext_bidding_checklist_items WHERE id=$1 FOR UPDATE")) return { rows: checklistItem ? [{ ...checklistItem }] : [] };
      if (sql.includes("FROM ext_bidding_checklist_items WHERE bidding_id=$1 AND document_type=$2 AND deactivated_at IS NULL")) {
        return { rows: checklistItem && !checklistItem.deactivated_at ? [{ ...checklistItem }] : [] };
      }
      if (sql.includes("FROM ext_bidding_alert_rules WHERE bidding_id=$1 AND deactivated_at IS NULL")) {
        return { rows: alertRule ? [{ ...alertRule }] : [] };
      }
      if (sql.includes("INSERT INTO ext_bidding_notices (")) {
        return { rows: [{ ...noticeRow, protocol: params[0], title: params[1], description: params[2], edital_number: params[3], estimated_value_cents: params[4], created_by_identity: params[5], status: "rascunho" }] };
      }
      if (sql.includes("INSERT INTO ext_bidding_deadlines (")) {
        return { rows: [{ id: deadlineId, bidding_id: params[0], deadline_kind: params[1], due_date: params[2], source: params[3], source_reference: params[4], justification: params[5], registered_by_identity: params[6], superseded_at: null }] };
      }
      if (sql.includes("INSERT INTO ext_bidding_proposals (")) {
        return { rows: [{ id: proposalId, bidding_id: params[0], version: params[1], amount_cents: params[2], summary: params[3], deadline_id: params[4], deadline_date_at_submission: params[5], deadline_source_at_submission: params[6], submitted_by_identity: params[7], submitted_on: "2026-10-03", withdrawn_at: null }] };
      }
      if (sql.includes("INSERT INTO ext_bidding_documents (")) {
        return { rows: [{ id: documentId, bidding_id: params[0], document_type: params[1], file_name: params[2], file_url: params[3], storage_key: params[4], version: params[5], checklist_item_id: params[6], supersedes_document_id: params[7], created_by_identity: params[8] }] };
      }
      if (sql.includes("INSERT INTO ext_bidding_checklist_items (")) {
        return { rows: [{ id: checklistId, bidding_id: params[0], document_type: params[1], label: params[2], required: params[3], created_by_identity: params[4], deactivated_at: null }] };
      }
      if (sql.includes("INSERT INTO ext_bidding_alert_rules (")) {
        return { rows: [{ id: "rule-1", bidding_id: params[0], days_before: params[1], justification: params[2], created_by_identity: params[3] }] };
      }
      if (sql.includes("INSERT INTO ext_bidding_responsible_assignments (")) {
        return { rows: [{ id: "assign-1", bidding_id: params[0], responsible_identity: params[1], responsible_role: params[2], justification: params[3], assigned_by_identity: params[4], released_at: null }] };
      }
      if (sql.includes("UPDATE ext_bidding_notices SET status")) return { rows: [{ ...noticeRow, status: params[1] }] };
      if (sql.includes("UPDATE ext_bidding_notices SET responsible_identity")) {
        return { rows: [{ ...noticeRow, responsible_identity: params[1], responsible_assigned_by_identity: params[2] }] };
      }
      if (sql.includes("UPDATE ext_bidding_notices SET result")) {
        return { rows: [{ ...noticeRow, result: params[1], result_justification: params[2], result_recorded_by_identity: params[3], result_recorded_at: "2026-10-03T00:00:00.000Z" }] };
      }
      if (sql.includes("UPDATE ext_bidding_proposals")) {
        return { rows: [{ ...(proposal || {}), id: params[0], withdrawn_at: "2026-10-03T00:00:00.000Z", withdrawn_by_identity: params[1], withdraw_reason: params[2], amount_cents: proposal?.amount_cents ?? 1000 }] };
      }
      if (sql.includes("UPDATE ext_bidding_documents SET deactivated_at")) {
        return { rows: [{ ...(document || {}), id: params[0], deactivated_at: "2026-10-03T00:00:00.000Z", deactivate_reason: params[2] }] };
      }
      if (sql.includes("UPDATE ext_bidding_checklist_items")) {
        return { rows: [{ ...(checklistItem || {}), id: params[0], deactivated_at: "2026-10-03T00:00:00.000Z", deactivate_reason: params[2] }] };
      }
      return { rows: [], rowCount: 0 };
    },
    release() { statements.push({ sql: "RELEASE", params: [] }); },
  };
  return { statements, pool: { connect: async () => client, query: async () => ({ rows: [] }) } };
}

function sqlIndex(statements, needle) {
  return statements.findIndex(s => String(s.sql).replace(/\s+/g, " ").includes(needle));
}

function hasSql(statements, needle) {
  return sqlIndex(statements, needle) !== -1;
}

// ---------------------------------------------------------------------------
// Derivação de prazo — a situação nunca é um campo gravado à mão.
// ---------------------------------------------------------------------------

test("EXT-03: prazo com data passada é derivado como vencido", () => {
  const derived = deriveDeadlineSituation({
    deadline: { id: deadlineId, deadline_kind: "entrega_proposta", due_date: "2026-01-10", source: "edital_publicado" },
    today: "2026-02-10",
  });
  assert.equal(derived.situation, "vencido");
  assert.equal(derived.days_overdue, 31);
  assert.equal(derived.base_date, "2026-02-10");
  assert.equal(derived.source, BIDDING_SOURCES.deadlines);
  assert.equal(derived.declared_source, "edital_publicado");
});

test("EXT-03: sem regra de antecedência não existe \"a vencer\" — a ausência é declarada", () => {
  const derived = deriveDeadlineSituation({
    deadline: { id: deadlineId, deadline_kind: "entrega_proposta", due_date: "2026-02-11", source: "edital_publicado" },
    rule: null,
    today: "2026-02-10",
  });
  assert.equal(derived.situation, "vigente");
  assert.equal(derived.alert, null);
  assert.equal(derived.alert_rule_absence, "sem_regra_de_antecedencia");
  assert.match(derived.alert_rule_note, /não estima/);
});

test("EXT-03: \"a vencer\" só aparece com regra explícita registrada", () => {
  const deadline = { id: deadlineId, deadline_kind: "entrega_proposta", due_date: "2026-02-15", source: "edital_publicado" };
  const semRegra = deriveDeadlineSituation({ deadline, rule: null, today: "2026-02-10" });
  const comRegra = deriveDeadlineSituation({ deadline, rule: { id: "r1", days_before: 10 }, today: "2026-02-10" });
  assert.equal(semRegra.situation, "vigente");
  assert.equal(comRegra.situation, "a_vencer");
  assert.equal(comRegra.alert.days_before, 10);
  assert.equal(comRegra.alert.threshold_date, "2026-02-20");
  assert.equal(comRegra.days_remaining, 5);
});

test("EXT-03: prazo além da antecedência continua apenas vigente", () => {
  const derived = deriveDeadlineSituation({
    deadline: { id: deadlineId, deadline_kind: "recurso", due_date: "2026-05-01", source: "registro_interno" },
    rule: { id: "r1", days_before: 10 },
    today: "2026-02-10",
  });
  assert.equal(derived.situation, "vigente");
  assert.equal(derived.alert.days_before, 10);
  assert.equal(derived.alert_rule_absence, undefined);
});

test("EXT-03: regra desativada volta a declarar ausência de antecedência", () => {
  const derived = deriveDeadlineSituation({
    deadline: { id: deadlineId, deadline_kind: "entrega_proposta", due_date: "2026-02-12", source: "edital_publicado" },
    rule: { id: "r1", days_before: 10, deactivated_at: "2026-02-01T00:00:00.000Z" },
    today: "2026-02-10",
  });
  assert.equal(derived.situation, "vigente");
  assert.equal(derived.alert_rule_absence, "sem_regra_de_antecedencia");
});

test("EXT-03: prazo substituído é declarado como substituído, não apagado", () => {
  const derived = deriveDeadlineSituation({
    deadline: { id: deadlineId, deadline_kind: "entrega_proposta", due_date: "2026-01-01", source: "edital_publicado", superseded_at: "2026-01-05T00:00:00.000Z" },
    today: "2026-02-10",
  });
  assert.equal(derived.situation, "substituido");
  assert.equal(derived.superseded_at, "2026-01-05T00:00:00.000Z");
});

// ---------------------------------------------------------------------------
// CRITÉRIO EXT-03: proposta só dentro do prazo de entrega registrado.
// ---------------------------------------------------------------------------

test("CRITÉRIO EXT-03: prazo de entrega vigente aceita proposta", () => {
  const window = deriveProposalWindow({
    notice: { status: "publicado" },
    deadline: { id: deadlineId, due_date: "2026-02-20", source: "edital_publicado" },
    today: "2026-02-10",
  });
  assert.equal(window.decision, "prazo_vigente");
  assert.equal(window.accepts_proposal, true);
  assert.equal(window.days_remaining, 10);
  assert.equal(window.deadline_kind, PROPOSAL_DEADLINE_KIND);
  assert.equal(window.base_date, "2026-02-10");
});

test("CRITÉRIO EXT-03: prazo encerrado recusa a proposta por derivação", () => {
  const window = deriveProposalWindow({
    notice: { status: "publicado" },
    deadline: { id: deadlineId, due_date: "2026-02-09", source: "edital_publicado" },
    today: "2026-02-10",
  });
  assert.equal(window.decision, "prazo_encerrado");
  assert.equal(window.accepts_proposal, false);
  assert.equal(window.days_overdue, 1);
  assert.equal(window.due_date, "2026-02-09");
});

test("CRITÉRIO EXT-03: o próprio dia do prazo ainda aceita proposta", () => {
  const window = deriveProposalWindow({
    notice: { status: "publicado" },
    deadline: { id: deadlineId, due_date: "2026-02-10", source: "edital_publicado" },
    today: "2026-02-10",
  });
  assert.equal(window.decision, "prazo_vigente");
  assert.equal(window.accepts_proposal, true);
  assert.equal(window.days_remaining, 0);
});

test("EXT-03: sem prazo registrado a proposta é recusada com ausência declarada", () => {
  const window = deriveProposalWindow({ notice: { status: "publicado" }, deadline: null, today: "2026-02-10" });
  assert.equal(window.decision, "sem_prazo_registrado");
  assert.equal(window.accepts_proposal, false);
  assert.match(window.missing, /não registrado/);
});

test("EXT-03: prazo substituído não autoriza proposta", () => {
  const window = deriveProposalWindow({
    notice: { status: "publicado" },
    deadline: { id: deadlineId, due_date: "2026-12-31", source: "edital_publicado", superseded_at: "2026-02-01T00:00:00.000Z" },
    today: "2026-02-10",
  });
  assert.equal(window.decision, "sem_prazo_registrado");
  assert.equal(window.accepts_proposal, false);
});

test("EXT-03: edital encerrado recusa proposta mesmo com prazo futuro", () => {
  for (const status of BIDDING_TERMINAL_STATUSES) {
    const window = deriveProposalWindow({
      notice: { status },
      deadline: { id: deadlineId, due_date: "2099-01-01", source: "edital_publicado" },
      today: "2026-02-10",
    });
    assert.equal(window.decision, "edital_encerrado", `status ${status}`);
    assert.equal(window.accepts_proposal, false);
  }
});

// ---------------------------------------------------------------------------
// Checklist derivado do dossiê.
// ---------------------------------------------------------------------------

test("EXT-03: item sem documento ativo fica pendente", () => {
  const entry = deriveChecklistStatus({ item: { id: checklistId, document_type: "Habilitação", label: "Certidão", required: true }, documents: [] });
  assert.equal(entry.status, "pendente");
  assert.equal(entry.satisfied_by, null);
  assert.equal(entry.derived_from, BIDDING_SOURCES.documents);
});

test("EXT-03: item é atendido pela versão mais recente do documento", () => {
  const entry = deriveChecklistStatus({
    item: { id: checklistId, document_type: "Habilitação", label: "Certidão", required: true },
    documents: [
      { id: "d1", document_type: "Habilitação", version: 1, superseded_at: "2026-01-01", deactivated_at: null },
      { id: "d2", document_type: "Habilitação", version: 2, superseded_at: null, deactivated_at: null },
    ],
  });
  assert.equal(entry.status, "atendido");
  assert.equal(entry.satisfied_by.document_id, "d2");
  assert.equal(entry.satisfied_by.version, 2);
});

test("EXT-03: documento desativado não atende o checklist", () => {
  const entry = deriveChecklistStatus({
    item: { id: checklistId, document_type: "Habilitação", label: "Certidão", required: true },
    documents: [{ id: "d1", document_type: "Habilitação", version: 1, deactivated_at: "2026-01-01", superseded_at: null }],
  });
  assert.equal(entry.status, "pendente");
});

test("EXT-03: item desativado declara motivo e sai da contagem", () => {
  const entry = deriveChecklistStatus({
    item: { id: checklistId, document_type: "Habilitação", label: "Certidão", required: true, deactivated_at: "2026-01-01", deactivate_reason: "exigência retirada" },
    documents: [],
  });
  assert.equal(entry.status, "desativado");
  assert.equal(entry.deactivate_reason, "exigência retirada");
  const resumo = summarizeChecklist([entry]);
  assert.equal(resumo.total, 0);
  assert.equal(resumo.checklist_absence, "sem_checklist_registrado");
});

test("EXT-03: resumo do checklist conta obrigatórios pendentes", () => {
  const resumo = summarizeChecklist([
    { status: "atendido", required: true },
    { status: "pendente", required: true },
    { status: "pendente", required: false },
    { status: "desativado", required: true },
  ]);
  assert.deepEqual(resumo, { total: 3, atendidos: 1, pendentes: 2, pendentes_obrigatorios: 1, checklist_absence: null });
});

test("EXT-03: situação terminal não tem transição de saída", () => {
  for (const terminal of BIDDING_TERMINAL_STATUSES) {
    assert.deepEqual(BIDDING_STATUS_TRANSITIONS[terminal], [], `${terminal} deveria ser final`);
  }
  assert.ok(BIDDING_STATUS_TRANSITIONS.rascunho.includes("publicado"));
  assert.ok(!BIDDING_STATUS_TRANSITIONS.rascunho.includes("homologado"));
});

test("EXT-03: a relevância de mercado é declarada como indicada e não confirmada", () => {
  assert.equal(MARKET_RELEVANCE.condicao, "se mercado relevante");
  assert.equal(MARKET_RELEVANCE.situacao, "indicada_nao_confirmada");
  assert.match(MARKET_RELEVANCE.evidencia, /referencias-marca/);
  assert.match(MARKET_RELEVANCE.pendencia, /[Cc]onfirmação/);
});

test("EXT-03: a fronteira externa nega portal público e upload real", () => {
  assert.equal(EXTERNAL_CHANNEL_BOUNDARY.portal_publico_integrado, false);
  assert.equal(EXTERNAL_CHANNEL_BOUNDARY.importacao_automatica_de_edital, false);
  assert.equal(EXTERNAL_CHANNEL_BOUNDARY.envio_de_proposta_a_orgao, false);
  assert.equal(EXTERNAL_CHANNEL_BOUNDARY.upload_real_de_arquivo, false);
});

// ---------------------------------------------------------------------------
// Autorização: anônimo 401, papel sem direito 403, antes de qualquer query.
// ---------------------------------------------------------------------------

test("EXT-03: anônimo recebe 401 sem tocar o banco", async () => {
  const { statements, pool } = readPool();
  const res = responseCapture();
  await api(pool, { session: null }).handleNotices(request({}), res);
  assert.equal(res.status, 401);
  assert.deepEqual(res.payload, { error: "unauthorized" });
  assert.equal(statements.length, 0);
});

test("EXT-03: papel sem direito recebe 403 distinto de 401", async () => {
  const { statements, pool } = readPool();
  const res = responseCapture();
  await api(pool, { session: { identityId, role: "rh" } }).handleNotices(request({}), res);
  assert.equal(res.status, 403);
  assert.deepEqual(res.payload, { error: "forbidden_role" });
  assert.equal(statements.length, 0);
});

test("EXT-03: mutação fora da mesma origem é recusada com 403 origin_forbidden", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool, { origin: false }).handleNotices(
    request({ method: "POST", body: { title: "Edital sintético", description: "descrição sintética longa", edital_number: "ED-1" } }), res);
  assert.equal(res.status, 403);
  assert.deepEqual(res.payload, { error: "origin_forbidden" });
  assert.equal(statements.length, 0);
});

test("EXT-03: identidade não-UUID na sessão não grava nada", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool, { session: { identityId: "admin", role: "admin" } }).handleNotices(
    request({ method: "POST", body: { title: "Edital sintético", description: "descrição sintética longa", edital_number: "ED-1" } }), res);
  assert.equal(res.status, 401);
  assert.equal(statements.length, 0);
});

test("EXT-03: mutação sem Idempotency-Key válida é recusada com 400", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handleNotices(
    request({ method: "POST", key: null, body: { title: "Edital sintético", description: "descrição sintética longa", edital_number: "ED-1" } }), res);
  assert.equal(res.status, 400);
  assert.deepEqual(res.payload, { error: "idempotency_key_required" });
  assert.equal(statements.length, 0);
});

test("EXT-03: método não suportado devolve 405", async () => {
  const { pool } = readPool();
  const res = responseCapture();
  await api(pool).handleNotices(request({ method: "DELETE" }), res);
  assert.equal(res.status, 405);
});

// ---------------------------------------------------------------------------
// Autoria e vínculos derivados do servidor, nunca do navegador.
// ---------------------------------------------------------------------------

test("EXT-03: id, protocolo e autoria forjados no corpo são ignorados", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handleNotices(request({
    method: "POST",
    body: {
      id: forged, protocol: "LIC-FORJADO", created_by_identity: forged, origin: "registro_legado",
      status: "homologado", result: "resultado forjado",
      title: "Edital sintético", description: "descrição sintética longa o suficiente", edital_number: "ED-2",
    },
  }), res);
  assert.equal(res.status, 201);
  const insert = statements.find(s => String(s.sql).replace(/\s+/g, " ").includes("INSERT INTO ext_bidding_notices ("));
  assert.ok(insert, "o INSERT canônico deve existir");
  assert.ok(!insert.params.includes(forged), "nenhum valor forjado pode chegar ao INSERT");
  assert.equal(insert.params[5], identityId, "a autoria vem da sessão");
  assert.match(insert.params[0], /^LIC-EXT-\d{8}-[A-Z0-9]{4}$/, "o protocolo é gerado pelo servidor");
  assert.equal(res.payload.notice.origin, "jornada_canonica");
});

test("EXT-03: a versão da proposta é atribuída pelo servidor sob lock do edital", async () => {
  const futuro = new Date(Date.now() + 86_400_000 * 10).toISOString().slice(0, 10);
  const { statements, pool } = mutationPool({
    deadline: { id: deadlineId, deadline_kind: PROPOSAL_DEADLINE_KIND, due_date: futuro, source: "edital_publicado", superseded_at: null },
    maxVersion: 4,
  });
  const res = responseCapture();
  await api(pool).handleNoticeProposals(request({
    method: "POST", body: { version: 99, amount_cents: 123456, summary: "proposta sintética com resumo suficiente" },
  }), res, biddingId);
  assert.equal(res.status, 201);
  const lockIdx = sqlIndex(statements, "FROM ext_bidding_notices WHERE id=$1 FOR UPDATE");
  const maxIdx = sqlIndex(statements, "MAX(version),0)::int AS max_version FROM ext_bidding_proposals");
  assert.ok(lockIdx !== -1 && maxIdx > lockIdx, "a numeração ocorre depois do lock do edital");
  const insert = statements.find(s => String(s.sql).replace(/\s+/g, " ").includes("INSERT INTO ext_bidding_proposals ("));
  assert.equal(insert.params[1], 5, "a versão é MAX+1 do servidor, não a do corpo");
  assert.equal(insert.params[7], identityId);
});

// ---------------------------------------------------------------------------
// Transação única: negócio + evento + auditoria; 503 com rollback.
// ---------------------------------------------------------------------------

test("EXT-03: a ordem é BEGIN, replay, negócio, evento, auditoria, COMMIT", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handleNotices(request({
    method: "POST", body: { title: "Edital sintético", description: "descrição sintética longa", edital_number: "ED-3" },
  }), res);
  assert.equal(res.status, 201);
  const begin = sqlIndex(statements, "BEGIN");
  const replay = sqlIndex(statements, "idempotency_key=$2 FOR UPDATE");
  const insert = sqlIndex(statements, "INSERT INTO ext_bidding_notices (");
  const event = sqlIndex(statements, "INSERT INTO ext_bidding_events");
  const audit = sqlIndex(statements, "INSERT INTO audit_log");
  const commit = sqlIndex(statements, "COMMIT");
  assert.ok(begin === 0, "BEGIN é a primeira instrução");
  assert.ok(replay > begin && insert > replay && event > insert && audit > event && commit > audit,
    `ordem inesperada: ${JSON.stringify({ begin, replay, insert, event, audit, commit })}`);
});

test("EXT-03: auditoria indisponível devolve 503 e não deixa nada gravado", async () => {
  const { statements, pool } = mutationPool({ failAudit: true });
  const res = responseCapture();
  await api(pool).handleNotices(request({
    method: "POST", body: { title: "Edital sintético", description: "descrição sintética longa", edital_number: "ED-4" },
  }), res);
  assert.equal(res.status, 503);
  assert.deepEqual(res.payload, { error: "audit_unavailable" });
  assert.ok(hasSql(statements, "ROLLBACK"), "a transação precisa ser revertida");
  assert.ok(!hasSql(statements, "COMMIT"), "nada pode ser confirmado quando a auditoria falha");
});

test("EXT-03: auditoria indisponível também reverte o registro de prazo", async () => {
  const { statements, pool } = mutationPool({ failAudit: true });
  const res = responseCapture();
  await api(pool).handleNoticeDeadlines(request({
    method: "POST",
    body: { deadline_kind: "entrega_proposta", due_date: "2026-12-01", source: "edital_publicado", justification: "prazo do edital" },
  }), res, biddingId);
  assert.equal(res.status, 503);
  assert.ok(hasSql(statements, "ROLLBACK"));
  assert.ok(!hasSql(statements, "COMMIT"));
});

// ---------------------------------------------------------------------------
// Idempotência.
// ---------------------------------------------------------------------------

test("EXT-03: retry idêntico devolve o mesmo resultado sem duplicar", async () => {
  const fingerprint = "a".repeat(64);
  const { statements, pool } = mutationPool({
    replayRow: { bidding_id: biddingId, request_fingerprint: fingerprint, idempotency_key: "ext03-test-key-0001" },
  });
  // Primeiro calcula a impressão real da requisição.
  const probe = mutationPool();
  const probeRes = responseCapture();
  await api(probe.pool).handleNotices(request({
    method: "POST", body: { title: "Edital sintético", description: "descrição sintética longa", edital_number: "ED-5" },
  }), probeRes);
  const eventInsert = probe.statements.find(s => String(s.sql).includes("INSERT INTO ext_bidding_events"));
  const realFingerprint = eventInsert.params[5];

  const replayPool = mutationPool({
    replayRow: { bidding_id: biddingId, request_fingerprint: realFingerprint, idempotency_key: "ext03-test-key-0001" },
  });
  const res = responseCapture();
  await api(replayPool.pool).handleNotices(request({
    method: "POST", body: { title: "Edital sintético", description: "descrição sintética longa", edital_number: "ED-5" },
  }), res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.replayed, true);
  assert.ok(!hasSql(replayPool.statements, "INSERT INTO ext_bidding_notices ("), "o retry não insere de novo");
  assert.ok(hasSql(replayPool.statements, "COMMIT"));
  assert.ok(statements.length >= 0);
});

test("EXT-03: mesma chave com conteúdo diferente devolve 409", async () => {
  const { statements, pool } = mutationPool({
    replayRow: { bidding_id: biddingId, request_fingerprint: "b".repeat(64), idempotency_key: "ext03-test-key-0001" },
  });
  const res = responseCapture();
  await api(pool).handleNotices(request({
    method: "POST", body: { title: "Outro edital sintético", description: "descrição diferente da original", edital_number: "ED-6" },
  }), res);
  assert.equal(res.status, 409);
  assert.deepEqual(res.payload, { error: "idempotency_key_reused" });
  assert.ok(hasSql(statements, "ROLLBACK"));
  assert.ok(!hasSql(statements, "INSERT INTO ext_bidding_notices ("));
});

// ---------------------------------------------------------------------------
// Máquina de estados, resultado e proposta: as regras do critério.
// ---------------------------------------------------------------------------

test("EXT-03: edital encerrado não reabre", async () => {
  const { statements, pool } = mutationPool({ notice: { ...noticeRow, status: "homologado" } });
  const res = responseCapture();
  await api(pool).handleNoticeById(request({ method: "PATCH", body: { status: "rascunho", justification: "tentativa de reabrir" } }), res, biddingId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "invalid_status_transition");
  assert.equal(res.payload.terminal, true);
  assert.deepEqual(res.payload.allowed, []);
  assert.ok(!hasSql(statements, "UPDATE ext_bidding_notices SET status"));
  assert.ok(hasSql(statements, "ROLLBACK"));
});

test("EXT-03: transição válida é registrada com evento e fecha o edital", async () => {
  const { statements, pool } = mutationPool({ notice: { ...noticeRow, status: "em_analise" } });
  const res = responseCapture();
  await api(pool).handleNoticeById(request({ method: "PATCH", body: { status: "homologado", justification: "sessão concluída" } }), res, biddingId);
  assert.equal(res.status, 200);
  assert.deepEqual(res.payload.transition, { from: "em_analise", to: "homologado" });
  const update = statements.find(s => String(s.sql).replace(/\s+/g, " ").includes("UPDATE ext_bidding_notices SET status"));
  assert.equal(update.params[2], true, "entrar em estado terminal grava closed_at");
  assert.ok(hasSql(statements, "INSERT INTO ext_bidding_events"));
});

test("EXT-03: situação repetida é recusada em vez de gerar evento vazio", async () => {
  const { pool } = mutationPool({ notice: { ...noticeRow, status: "publicado" } });
  const res = responseCapture();
  await api(pool).handleNoticeById(request({ method: "PATCH", body: { status: "publicado", justification: "sem mudança" } }), res, biddingId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "status_unchanged");
});

test("CRITÉRIO EXT-03: resultado em edital não encerrado é recusado", async () => {
  const { statements, pool } = mutationPool({ notice: { ...noticeRow, status: "em_analise" } });
  const res = responseCapture();
  await api(pool).handleNoticeResult(request({
    method: "POST", body: { result: "resultado antecipado", justification: "justificativa suficiente" },
  }), res, biddingId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "bidding_not_closed");
  assert.deepEqual(res.payload.terminal_statuses, [...BIDDING_TERMINAL_STATUSES]);
  assert.ok(!hasSql(statements, "UPDATE ext_bidding_notices SET result"));
});

test("CRITÉRIO EXT-03: resultado já registrado não é sobrescrito", async () => {
  const { statements, pool } = mutationPool({
    notice: { ...noticeRow, status: "homologado", result: "resultado original", result_recorded_at: "2026-01-01T00:00:00.000Z" },
  });
  const res = responseCapture();
  await api(pool).handleNoticeResult(request({
    method: "POST", body: { result: "resultado trocado", justification: "tentativa de sobrescrever" },
  }), res, biddingId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "result_already_recorded");
  assert.ok(!hasSql(statements, "UPDATE ext_bidding_notices SET result"));
});

test("CRITÉRIO EXT-03: resultado em edital encerrado grava autor, data e justificativa", async () => {
  const { statements, pool } = mutationPool({ notice: { ...noticeRow, status: "homologado" } });
  const res = responseCapture();
  await api(pool).handleNoticeResult(request({
    method: "POST", body: { result: "homologado em favor da proposta v1", justification: "ata da sessão de homologação" },
  }), res, biddingId);
  assert.equal(res.status, 201);
  const update = statements.find(s => String(s.sql).replace(/\s+/g, " ").includes("UPDATE ext_bidding_notices SET result"));
  assert.equal(update.params[3], identityId, "o autor vem da sessão");
  assert.equal(update.params[2], "ata da sessão de homologação");
});

test("CRITÉRIO EXT-03: proposta depois do prazo é recusada com a janela declarada", async () => {
  const passado = new Date(Date.now() - 86_400_000 * 3).toISOString().slice(0, 10);
  const { statements, pool } = mutationPool({
    deadline: { id: deadlineId, deadline_kind: PROPOSAL_DEADLINE_KIND, due_date: passado, source: "edital_publicado", superseded_at: null },
  });
  const res = responseCapture();
  await api(pool).handleNoticeProposals(request({
    method: "POST", body: { amount_cents: 1000, summary: "proposta fora do prazo registrado" },
  }), res, biddingId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "proposal_prazo_encerrado");
  assert.equal(res.payload.proposal_window.accepts_proposal, false);
  assert.equal(res.payload.proposal_window.due_date, passado);
  assert.ok(res.payload.proposal_window.base_date, "a data-base é declarada");
  assert.ok(!hasSql(statements, "INSERT INTO ext_bidding_proposals ("));
  assert.ok(hasSql(statements, "ROLLBACK"));
});

test("CRITÉRIO EXT-03: proposta sem prazo registrado é recusada", async () => {
  const { statements, pool } = mutationPool({ deadline: null });
  const res = responseCapture();
  await api(pool).handleNoticeProposals(request({
    method: "POST", body: { amount_cents: 1000, summary: "proposta sem prazo registrado" },
  }), res, biddingId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "proposal_sem_prazo_registrado");
  assert.ok(!hasSql(statements, "INSERT INTO ext_bidding_proposals ("));
});

test("EXT-03: a proposta copia o prazo-base e a fonte do momento do registro", async () => {
  const futuro = new Date(Date.now() + 86_400_000 * 5).toISOString().slice(0, 10);
  const { statements, pool } = mutationPool({
    deadline: { id: deadlineId, deadline_kind: PROPOSAL_DEADLINE_KIND, due_date: futuro, source: "retificacao_publicada", superseded_at: null },
  });
  const res = responseCapture();
  await api(pool).handleNoticeProposals(request({
    method: "POST", body: { amount_cents: 9900, summary: "proposta dentro do prazo registrado" },
  }), res, biddingId);
  assert.equal(res.status, 201);
  const insert = statements.find(s => String(s.sql).replace(/\s+/g, " ").includes("INSERT INTO ext_bidding_proposals ("));
  assert.equal(insert.params[4], deadlineId, "o prazo que autorizou fica preso à proposta");
  assert.equal(insert.params[5], futuro);
  assert.equal(insert.params[6], "retificacao_publicada");
});

// ---------------------------------------------------------------------------
// Responsável canônico.
// ---------------------------------------------------------------------------

test("EXT-03: responsável inexistente devolve 404 e nada é gravado", async () => {
  const { statements, pool } = mutationPool({ identity: null });
  const res = responseCapture();
  await api(pool).handleNoticeResponsible(request({
    method: "POST", body: { responsible_identity: responsibleId, justification: "designação" },
  }), res, biddingId);
  assert.equal(res.status, 404);
  assert.equal(res.payload.error, "responsible_identity_not_found");
  assert.ok(!hasSql(statements, "INSERT INTO ext_bidding_responsible_assignments ("));
  assert.ok(hasSql(statements, "ROLLBACK"));
});

test("EXT-03: identidade sem perfil de equipe não vira responsável", async () => {
  const { statements, pool } = mutationPool({ identity: { id: responsibleId, status: "active", role: null } });
  const res = responseCapture();
  await api(pool).handleNoticeResponsible(request({
    method: "POST", body: { responsible_identity: responsibleId, justification: "designação" },
  }), res, biddingId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "responsible_not_staff");
  assert.ok(!hasSql(statements, "INSERT INTO ext_bidding_responsible_assignments ("));
});

test("EXT-03: identidade suspensa não vira responsável", async () => {
  const { pool } = mutationPool({ identity: { id: responsibleId, status: "suspended", role: "ti" } });
  const res = responseCapture();
  await api(pool).handleNoticeResponsible(request({
    method: "POST", body: { responsible_identity: responsibleId, justification: "designação" },
  }), res, biddingId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "responsible_not_active");
  assert.equal(res.payload.identity_status, "suspended");
});

test("EXT-03: designar responsável copia o papel do ato e encerra a designação anterior", async () => {
  const { statements, pool } = mutationPool({
    activeAssignment: { id: "assign-0", bidding_id: biddingId, responsible_identity: forged, released_at: null },
  });
  const res = responseCapture();
  await api(pool).handleNoticeResponsible(request({
    method: "POST", body: { responsible_identity: responsibleId, justification: "troca de responsável" },
  }), res, biddingId);
  assert.equal(res.status, 201);
  assert.equal(res.payload.replaced_assignment_id, "assign-0");
  const release = statements.find(s => String(s.sql).replace(/\s+/g, " ").includes("UPDATE ext_bidding_responsible_assignments SET released_at"));
  assert.ok(release, "a designação anterior precisa ser encerrada");
  const insert = statements.find(s => String(s.sql).replace(/\s+/g, " ").includes("INSERT INTO ext_bidding_responsible_assignments ("));
  assert.equal(insert.params[2], "ti", "o papel é copiado no ato da designação");
  assert.equal(insert.params[4], identityId, "quem designou vem da sessão");
});

// ---------------------------------------------------------------------------
// Prazos, documentos, checklist e alerta.
// ---------------------------------------------------------------------------

test("EXT-03: prazo já registrado aponta a rota canônica de substituição", async () => {
  const { statements, pool } = mutationPool({
    deadline: { id: deadlineId, deadline_kind: "entrega_proposta", due_date: "2026-12-01", source: "edital_publicado", superseded_at: null },
  });
  const res = responseCapture();
  await api(pool).handleNoticeDeadlines(request({
    method: "POST", body: { deadline_kind: "entrega_proposta", due_date: "2026-12-10", source: "edital_publicado", justification: "nova data" },
  }), res, biddingId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "deadline_already_registered");
  assert.equal(res.payload.canonical, `/api/ext/bidding/deadlines/${deadlineId}/supersede`);
  assert.ok(!hasSql(statements, "INSERT INTO ext_bidding_deadlines ("));
});

test("EXT-03: prazo exige fonte declarada entre as aceitas", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handleNoticeDeadlines(request({
    method: "POST", body: { deadline_kind: "entrega_proposta", due_date: "2026-12-10", source: "achismo", justification: "sem fonte" },
  }), res, biddingId);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "invalid_source");
  assert.equal(statements.length, 0);
});

test("EXT-03: data de prazo inválida é recusada antes de abrir transação", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handleNoticeDeadlines(request({
    method: "POST", body: { deadline_kind: "entrega_proposta", due_date: "2026-02-30", source: "edital_publicado", justification: "data impossível" },
  }), res, biddingId);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "invalid_due_date");
  assert.equal(statements.length, 0);
});

test("EXT-03: substituir prazo preserva o anterior e registra o novo", async () => {
  const { statements, pool } = mutationPool({
    deadline: { id: deadlineId, bidding_id: biddingId, deadline_kind: "entrega_proposta", due_date: "2026-12-01", source: "edital_publicado", superseded_at: null },
  });
  const res = responseCapture();
  await api(pool).handleDeadlineSupersede(request({
    method: "POST", body: { due_date: "2026-12-20", source: "retificacao_publicada", reason: "retificação publicada" },
  }), res, deadlineId);
  assert.equal(res.status, 201);
  assert.equal(res.payload.superseded_deadline_id, deadlineId);
  const supersede = statements.find(s => String(s.sql).replace(/\s+/g, " ").includes("UPDATE ext_bidding_deadlines SET superseded_at"));
  assert.ok(supersede, "o prazo anterior é marcado como substituído, não apagado");
  assert.equal(supersede.params[1], identityId);
  assert.ok(hasSql(statements, "INSERT INTO ext_bidding_deadlines ("));
});

test("EXT-03: prazo já substituído não é substituído de novo", async () => {
  const { pool } = mutationPool({
    deadline: { id: deadlineId, bidding_id: biddingId, deadline_kind: "entrega_proposta", due_date: "2026-12-01", source: "edital_publicado", superseded_at: "2026-01-01T00:00:00.000Z" },
  });
  const res = responseCapture();
  await api(pool).handleDeadlineSupersede(request({
    method: "POST", body: { due_date: "2026-12-20", source: "retificacao_publicada", reason: "outra retificação" },
  }), res, deadlineId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "deadline_already_superseded");
});

test("EXT-03: documento substituído precisa pertencer ao mesmo edital", async () => {
  const { statements, pool } = mutationPool({
    document: { id: documentId, bidding_id: forged, superseded_at: null, deactivated_at: null },
  });
  const res = responseCapture();
  await api(pool).handleNoticeDocuments(request({
    method: "POST",
    body: { document_type: "Habilitação", file_name: "cert.pdf", file_url: "https://x/cert.pdf", storage_key: "chave-sintetica-1", supersedes_document_id: documentId },
  }), res, biddingId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "document_not_in_bidding");
  assert.ok(!hasSql(statements, "INSERT INTO ext_bidding_documents ("));
});

test("EXT-03: documento registrado declara a fronteira de armazenamento", async () => {
  const { statements, pool } = mutationPool({ maxVersion: 2 });
  const res = responseCapture();
  await api(pool).handleNoticeDocuments(request({
    method: "POST",
    body: { document_type: "Habilitação", file_name: "cert.pdf", file_url: "https://x/cert.pdf", storage_key: "chave-sintetica-2" },
  }), res, biddingId);
  assert.equal(res.status, 201);
  assert.equal(res.payload.external_channel_boundary.upload_real_de_arquivo, false);
  const insert = statements.find(s => String(s.sql).replace(/\s+/g, " ").includes("INSERT INTO ext_bidding_documents ("));
  assert.equal(insert.params[5], 3, "a versão do dossiê é MAX+1");
  assert.equal(insert.params[8], identityId);
});

test("EXT-03: documento desativado mantém o registro com autor e motivo", async () => {
  const { statements, pool } = mutationPool({
    document: { id: documentId, bidding_id: biddingId, document_type: "Habilitação", version: 1, deactivated_at: null },
  });
  const res = responseCapture();
  await api(pool).handleDocumentDeactivate(request({ method: "POST", body: { reason: "documento vencido" } }), res, documentId);
  assert.equal(res.status, 200);
  assert.ok(!hasSql(statements, "DELETE FROM ext_bidding_documents"), "nenhum documento é apagado");
  const update = statements.find(s => String(s.sql).replace(/\s+/g, " ").includes("UPDATE ext_bidding_documents SET deactivated_at"));
  assert.equal(update.params[1], identityId);
  assert.equal(update.params[2], "documento vencido");
});

test("EXT-03: item de checklist duplicado é recusado", async () => {
  const { statements, pool } = mutationPool({
    checklistItem: { id: checklistId, bidding_id: biddingId, document_type: "Habilitação", label: "Certidão", deactivated_at: null },
  });
  const res = responseCapture();
  await api(pool).handleNoticeChecklist(request({
    method: "POST", body: { document_type: "Habilitação", label: "Certidão repetida" },
  }), res, biddingId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "checklist_item_already_registered");
  assert.ok(!hasSql(statements, "INSERT INTO ext_bidding_checklist_items ("));
});

test("EXT-03: regra de alerta duplicada é recusada", async () => {
  const { statements, pool } = mutationPool({ alertRule: { id: "rule-1", bidding_id: biddingId, days_before: 10 } });
  const res = responseCapture();
  await api(pool).handleNoticeAlertRules(request({
    method: "POST", body: { days_before: 20, justification: "outra antecedência" },
  }), res, biddingId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "alert_rule_already_registered");
  assert.ok(!hasSql(statements, "INSERT INTO ext_bidding_alert_rules ("));
});

test("EXT-03: antecedência fora da faixa é recusada sem tocar o banco", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handleNoticeAlertRules(request({
    method: "POST", body: { days_before: 0, justification: "antecedência inválida" },
  }), res, biddingId);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "invalid_days_before");
  assert.equal(statements.length, 0);
});

// ---------------------------------------------------------------------------
// Listagem com escopo e rotas legadas.
// ---------------------------------------------------------------------------

test("EXT-03: filtro de situação inválido é recusado antes da consulta", async () => {
  const { statements, pool } = readPool();
  const res = responseCapture();
  await api(pool).handleNotices(request({ url: "/api/ext/bidding/notices?status=inventado" }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "invalid_status");
  assert.equal(statements.length, 0);
});

test("EXT-03: filtro de responsável precisa ser UUID", async () => {
  const { statements, pool } = readPool();
  const res = responseCapture();
  await api(pool).handleNotices(request({ url: "/api/ext/bidding/notices?responsible_identity=qualquer" }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "invalid_responsible_identity");
  assert.equal(statements.length, 0);
});

test("EXT-03: listagem vazia declara a ausência em vez de inventar registro", async () => {
  const { pool } = readPool();
  const res = responseCapture();
  await api(pool).handleNotices(request({}), res);
  assert.equal(res.status, 200);
  assert.deepEqual(res.payload.notices, []);
  assert.equal(res.payload.empty_state, EMPTY_STATE_TEXT);
  assert.equal(res.payload.source, BIDDING_SOURCES.notices);
  assert.ok(res.payload.base_date, "a data-base é declarada");
  assert.equal(res.payload.market_relevance.situacao, "indicada_nao_confirmada");
});

test("EXT-03: a rota canônica não devolve o alias legado \"items\"", async () => {
  const { pool } = readPool([["FROM ext_bidding_notices", [noticeRow]]]);
  const res = responseCapture();
  await api(pool).handleNotices(request({}), res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.items, undefined, "o alias legado não vaza para a rota canônica");
  assert.equal(res.payload.notices.length, 1);
});

test("EXT-03: a rota legada mantém leitura autorizada com alias e aponta a canônica", async () => {
  const { pool } = readPool([["FROM ext_bidding_notices", [noticeRow]]]);
  const res = responseCapture();
  await api(pool).handleLegacyBiddingNotices(request({ url: "/api/ext/bidding-notices" }), res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.items.length, 1);
  assert.equal(res.payload.notices.length, 1);
  assert.equal(res.payload.canonical, "/api/ext/bidding/notices");
});

test("EXT-03: mutação na rota legada é aposentada com 410 depois das guardas", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handleLegacyBiddingNotices(request({
    method: "POST", url: "/api/ext/bidding-notices", body: { title: "Edital sintético", description: "descrição sintética longa", edital_number: "ED-7" },
  }), res);
  assert.equal(res.status, 410);
  assert.equal(res.payload.canonical, "/api/ext/bidding/notices");
  assert.equal(statements.length, 0, "a rota aposentada não abre transação");
});

test("EXT-03: anônimo na rota legada continua recebendo 401, não 410", async () => {
  const { pool } = mutationPool();
  const res = responseCapture();
  await api(pool, { session: null }).handleLegacyBiddingNotices(request({
    method: "POST", url: "/api/ext/bidding-notices", body: { title: "x" },
  }), res);
  assert.equal(res.status, 401);
});

test("EXT-03: documentos legados recusam bidding_id fora de formato", async () => {
  const { statements, pool } = readPool();
  const res = responseCapture();
  await api(pool).handleLegacyBiddingDocuments(request({ url: "/api/ext/bidding-documents?bidding_id=qualquer" }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "invalid_bidding_id");
  assert.equal(statements.length, 0);
});

test("EXT-03: referência fora do formato UUID é recusada em qualquer sub-rota", async () => {
  const { statements, pool } = mutationPool();
  for (const handler of ["handleNoticeById", "handleNoticeResponsible", "handleNoticeDeadlines", "handleNoticeProposals", "handleNoticeResult", "handleNoticeDocuments", "handleNoticeChecklist", "handleNoticeAlertRules"]) {
    const res = responseCapture();
    await api(pool)[handler](request({ method: "GET" }), res, "nao-e-uuid");
    assert.equal(res.status, 400, `${handler} deveria recusar referência inválida`);
    assert.equal(res.payload.error, "invalid_reference");
  }
  assert.equal(statements.length, 0);
});

test("EXT-03: leitura do dossiê de edital inexistente devolve 404", async () => {
  const { pool } = readPool();
  const res = responseCapture();
  await api(pool).handleNoticeById(request({ method: "GET" }), res, biddingId);
  assert.equal(res.status, 404);
  assert.equal(res.payload.error, "bidding_not_found");
});
