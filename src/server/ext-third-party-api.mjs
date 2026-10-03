import { createHash, randomUUID } from "node:crypto";

// EXT-02: terceiros ligados ao backend canônico real — cadastro, contrato,
// documentos, vencimentos, acesso temporário e avaliação.
//
// Critério do plano: "terceiro acessa só OS/contrato autorizado e perde acesso
// ao término".
//
// FRONTEIRA DECLARADA (não inventada): não existe hoje ator externo "terceiro"
// autenticado neste sistema. As sessões canônicas existentes são de staff
// (auth_staff_sessions), de cliente (auth_sessions) e de colaborador
// (auth_employee_sessions); nenhuma delas pertence a um terceiro. Esta jornada
// NÃO cria sessão, login ou canal externo fictício. O que ela faz é impor a
// janela de acesso e o escopo autorizado nos registros canônicos e em TODA
// consulta derivada do lado staff, e declarar o acesso do próprio terceiro
// como pendente — ver EXTERNAL_ACTOR_BOUNDARY abaixo, devolvido nas respostas.
//
// Regras desta jornada (todas decididas no servidor, nunca no navegador):
// - somente sessão staff canônica autoriza; anônimo recebe 401 e papel não
//   autorizado recebe 403 antes de qualquer consulta;
// - autoria e vínculos são derivados da sessão e da URL; id,
//   created_by_identity, responsible_identity, third_party_id e contract_id
//   vindos do corpo são ignorados;
// - contrato só é vinculado após validação canônica em crm_contracts, com
//   quem verificou e quando registrados;
// - vigência e vencimento são derivados exclusivamente de registros canônicos
//   e datas registradas, com fonte e data-base declaradas; ausência de dado é
//   declarada, nunca estimada;
// - "perde acesso ao término" é derivação determinística de access_end em
//   ext_third_party_access_grants, nunca um campo livre;
// - avaliação exige autor (sessão), data e justificativa; nenhuma nota é
//   inventada;
// - escrita, evento imutável e audit_log acontecem na MESMA transação; falha
//   da auditoria devolve 503 audit_unavailable com rollback;
// - toda mutação exige same-origin e Idempotency-Key: retry idêntico não
//   duplica (replay devolve o mesmo registro) e reuso divergente responde 409.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

export const THIRD_PARTY_READ_ROLES = Object.freeze(["admin", "marcelo", "ti"]);
export const THIRD_PARTY_WRITE_ROLES = Object.freeze(["admin", "marcelo", "ti"]);
export const THIRD_PARTY_STATUSES = Object.freeze(["ativo", "inativo", "suspenso", "encerrado"]);
export const ACCESS_SCOPE_KINDS = Object.freeze(["contrato", "ordem_servico"]);

// Situações canônicas que NÃO podem autorizar acesso novo. São constantes
// declaradas (não inferidas) e aparecem na resposta quando bloqueiam.
export const CONTRACT_STATUSES_NOT_GRANTABLE = Object.freeze(["cancelado", "encerrado"]);
export const SERVICE_ORDER_STATUSES_NOT_GRANTABLE = Object.freeze(["cancelada", "concluida"]);

export const THIRD_PARTY_SOURCES = Object.freeze({
  parties: "ext_third_parties (migração 085, jornada 148)",
  documents: "ext_third_party_documents (migração 085, desativação 148)",
  grants: "ext_third_party_access_grants (migração 148)",
  evaluations: "ext_third_party_evaluations (migração 148)",
  events: "ext_third_party_events (migração 148)",
  documentRules: "ext_third_party_document_rules (migração 148)",
  contracts: "crm_contracts (migração 027)",
  serviceOrders: "ast_service_orders (migração 084)",
  legacyAccessLogs: "ext_third_party_access_logs (migração 085, legado — não decide acesso)",
});

// Fronteira externa declarada, devolvida nas respostas de autorização e no
// dossiê. Nada aqui é sintetizado como se existisse.
export const EXTERNAL_ACTOR_BOUNDARY = Object.freeze({
  authenticated_third_party_channel: false,
  status: "pendente",
  note:
    "Não existe hoje ator externo 'terceiro' autenticado: nenhuma sessão, login ou canal externo de terceiro foi criado. "
    + "A janela de acesso e o escopo autorizado são impostos nos registros canônicos e em toda consulta derivada do lado staff. "
    + "O acesso do próprio terceiro permanece PENDENTE e não é simulado.",
  canonical_sessions_today: ["auth_staff_sessions (staff)", "auth_sessions (cliente)", "auth_employee_sessions (colaborador)"],
  enforcement_point: "GET /api/ext/third-party/parties/<id>/authorization (decisão determinística sobre a janela canônica)",
});

function fingerprintOf(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isIsoDate(value) {
  return typeof value === "string" && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function addDaysIso(dateIso, days) {
  const base = new Date(`${dateIso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function dateOnly(value) {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function partyProjection(row) {
  return {
    id: row.id,
    name: row.name,
    document: row.document,
    category: row.category,
    status: row.status,
    contract_id: row.contract_id,
    contract_verified_at: row.contract_verified_at ?? null,
    contract_verified_status: row.contract_verified_status ?? null,
    responsible_name: row.responsible_name,
    evaluation_score: row.evaluation_score,
    evaluation_source_id: row.evaluation_source_id ?? null,
    notes: row.notes,
    origin: row.origin,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Derivações determinísticas. Nenhuma delas estima: ausência de dado vira um
// estado declarado ('sem_janela_registrada', 'sem_data_declarada', ...).
// ---------------------------------------------------------------------------

// Situação de UMA janela registrada, a partir das datas canônicas e da
// revogação declarada. "Perde acesso ao término" nasce aqui: today > access_end
// ⇒ 'expirado', sem nenhuma marcação manual.
export function deriveGrantWindow(grant, today = todayIso()) {
  const start = dateOnly(grant.access_start);
  const end = dateOnly(grant.access_end);
  if (grant.revoked_at) {
    return {
      status: "revogado",
      access_start: start,
      access_end: end,
      revoked_at: grant.revoked_at,
      revoke_reason: grant.revoke_reason ?? null,
      derivation: "revogação declarada em ext_third_party_access_grants.revoked_at",
      base_date: today,
    };
  }
  if (today < start) {
    return {
      status: "nao_iniciado",
      access_start: start,
      access_end: end,
      days_to_start: Math.round((Date.parse(`${start}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000),
      derivation: `data-base ${today} < access_start ${start}`,
      base_date: today,
    };
  }
  if (today > end) {
    return {
      status: "expirado",
      access_start: start,
      access_end: end,
      days_since_end: Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${end}T00:00:00Z`)) / 86_400_000),
      derivation: `data-base ${today} > access_end ${end} — acesso perdido ao término, por derivação`,
      base_date: today,
    };
  }
  return {
    status: "vigente",
    access_start: start,
    access_end: end,
    days_to_end: Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000),
    derivation: `access_start ${start} <= data-base ${today} <= access_end ${end}`,
    base_date: today,
  };
}

// Situação de acesso do terceiro: resumo determinístico de todas as janelas
// canônicas. Sem janela registrada, a ausência é declarada — nunca "liberado".
export function deriveAccessSituation({ party, grants = [], today = todayIso() }) {
  const evaluated = grants.map(grant => ({ grant_id: grant.id, scope_kind: grant.scope_kind, contract_id: grant.contract_id ?? null, service_order_id: grant.service_order_id ?? null, window: deriveGrantWindow(grant, today) }));
  const active = evaluated.filter(item => item.window.status === "vigente");
  const partyActive = party?.status === "ativo";
  let status;
  if (grants.length === 0) status = "sem_janela_registrada";
  else if (!partyActive) status = "bloqueado_por_situacao_do_terceiro";
  else if (active.length > 0) status = "com_acesso_vigente";
  else if (evaluated.some(item => item.window.status === "nao_iniciado")) status = "janela_futura";
  else if (evaluated.every(item => item.window.status === "revogado")) status = "revogado";
  else status = "sem_acesso_vigente";
  return {
    status,
    third_party_status: party?.status ?? null,
    grants_registered: grants.length,
    active_windows: active.length,
    windows: evaluated,
    note: grants.length === 0
      ? "Nenhuma janela de acesso canônica registrada para este terceiro; nenhum acesso é presumido."
      : "Situação derivada exclusivamente das janelas canônicas registradas e da data-base.",
    source: THIRD_PARTY_SOURCES.grants,
    base_date: today,
  };
}

// Decisão de acesso a UM escopo (contrato ou OS). É o ponto de imposição:
// terceiro só "acessa" o que tem janela canônica vigente para aquele escopo.
export function deriveAccessDecision({ party, grants = [], scope, today = todayIso() }) {
  const base = {
    scope: { kind: scope?.kind ?? null, id: scope?.id ?? null },
    source: [THIRD_PARTY_SOURCES.parties, THIRD_PARTY_SOURCES.grants],
    base_date: today,
    external_actor_boundary: EXTERNAL_ACTOR_BOUNDARY,
  };
  if (!party) {
    return { ...base, authorized: false, reason: "terceiro_inexistente", derivation: "nenhum registro canônico de terceiro com esse identificador" };
  }
  if (party.status !== "ativo") {
    return { ...base, authorized: false, reason: "terceiro_nao_ativo", derivation: `ext_third_parties.status = '${party.status}'; somente 'ativo' pode acessar` };
  }
  if (grants.length === 0) {
    return { ...base, authorized: false, reason: "sem_janela_registrada", derivation: "nenhuma janela canônica registrada; ausência declarada, acesso não presumido" };
  }
  const matching = grants.filter(grant =>
    grant.scope_kind === scope?.kind
    && String(grant.scope_kind === "contrato" ? grant.contract_id : grant.service_order_id) === String(scope?.id));
  if (matching.length === 0) {
    return { ...base, authorized: false, reason: "escopo_nao_autorizado", derivation: "nenhuma janela canônica vincula este terceiro ao escopo pedido" };
  }
  const evaluated = matching.map(grant => ({ grant, window: deriveGrantWindow(grant, today) }));
  const valid = evaluated.find(item => item.window.status === "vigente");
  if (valid) {
    return {
      ...base,
      authorized: true,
      reason: "janela_vigente",
      derivation: valid.window.derivation,
      grant: { id: valid.grant.id, scope_kind: valid.grant.scope_kind, contract_id: valid.grant.contract_id ?? null, service_order_id: valid.grant.service_order_id ?? null, justification: valid.grant.justification },
      window: valid.window,
    };
  }
  const closest = evaluated[0];
  const reasonByStatus = { expirado: "janela_encerrada", nao_iniciado: "janela_nao_iniciada", revogado: "janela_revogada" };
  return {
    ...base,
    authorized: false,
    reason: reasonByStatus[closest.window.status] || "sem_janela_vigente",
    derivation: closest.window.derivation,
    grant: { id: closest.grant.id, scope_kind: closest.grant.scope_kind, contract_id: closest.grant.contract_id ?? null, service_order_id: closest.grant.service_order_id ?? null },
    window: closest.window,
  };
}

// Vencimento de documento: vigente/vencido saem só da data registrada;
// 'a_vencer' exige regra explícita de antecedência. Sem data, a ausência é
// declarada e nada é estimado.
export function deriveDocumentExpiry({ document, rule = null, today = todayIso() }) {
  const expiry = dateOnly(document.expiry_date);
  if (!document.is_active) {
    return {
      status: "desativado",
      expiry_date: expiry,
      derivation: "documento desativado com autor e motivo declarados; não participa do controle de vencimento",
      source: THIRD_PARTY_SOURCES.documents,
      base_date: today,
    };
  }
  if (!expiry) {
    return {
      status: "sem_data_declarada",
      expiry_date: null,
      derivation: "nenhuma data de validade registrada neste documento canônico; ausência declarada, nunca estimada",
      source: THIRD_PARTY_SOURCES.documents,
      base_date: today,
    };
  }
  if (today > expiry) {
    return {
      status: "vencido",
      expiry_date: expiry,
      days_overdue: Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${expiry}T00:00:00Z`)) / 86_400_000),
      derivation: `data-base ${today} > expiry_date ${expiry}`,
      source: THIRD_PARTY_SOURCES.documents,
      base_date: today,
    };
  }
  if (!rule) {
    return {
      status: "vigente",
      expiry_date: expiry,
      alert_rule: null,
      derivation: `data-base ${today} <= expiry_date ${expiry}; sem regra de antecedência registrada, nenhum 'a vencer' é inferido`,
      alert_rule_absence: "sem_regra_de_antecedencia",
      source: THIRD_PARTY_SOURCES.documents,
      base_date: today,
    };
  }
  const alertFrom = addDaysIso(expiry, -rule.alert_before_days);
  const status = today >= alertFrom ? "a_vencer" : "vigente";
  return {
    status,
    expiry_date: expiry,
    alert_from: alertFrom,
    days_to_expiry: Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000),
    alert_rule: { id: rule.id, alert_before_days: rule.alert_before_days, justification: rule.justification },
    derivation: `regra registrada de ${rule.alert_before_days} dias ⇒ alerta a partir de ${alertFrom}; data-base ${today}`,
    source: [THIRD_PARTY_SOURCES.documents, THIRD_PARTY_SOURCES.documentRules],
    base_date: today,
  };
}

export function createExtThirdPartyApi({ pool, sameOrigin, requireSession }) {
  function json(res, code, obj) {
    res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(obj));
  }

  const roleOf = sess => String(sess?.role || sess?.userRole || "").toLowerCase();

  // Autorização: anônimo 401; papel não autorizado 403; mutação exige
  // same-origin e identidade UUID real derivada da sessão.
  async function guard(req, res, { write = false } = {}) {
    let sess = null;
    try { sess = await requireSession(req); } catch { sess = null; }
    if (!sess) { json(res, 401, { error: "unauthorized" }); return null; }
    const role = roleOf(sess);
    const allowed = write ? THIRD_PARTY_WRITE_ROLES : THIRD_PARTY_READ_ROLES;
    if (!allowed.includes(role)) { json(res, 403, { error: "forbidden_role" }); return null; }
    if (write) {
      if (!sameOrigin(req)) { json(res, 403, { error: "origin_forbidden" }); return null; }
      if (!UUID_PATTERN.test(String(sess.identityId || ""))) { json(res, 401, { error: "unauthorized" }); return null; }
    }
    return sess;
  }

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 32_768) return { tooLarge: true };
      chunks.push(chunk);
    }
    try {
      return { body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") };
    } catch {
      return { invalid: true };
    }
  }

  function idempotencyKeyOf(req, res) {
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) { json(res, 400, { error: "idempotency_key_required" }); return null; }
    return key;
  }

  // Toda mutação passa por aqui: BEGIN → replay por (identidade, chave) no
  // ledger de eventos → trabalho (negócio + evento imutável) → audit_log →
  // COMMIT. Falha da auditoria reverte tudo e devolve 503.
  async function runMutation(res, { session, key, fingerprint, audit, work, onReplay, onConflict }) {
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const replay = await client.query(
        `SELECT * FROM ext_third_party_events WHERE created_by_identity=$1 AND idempotency_key=$2 FOR UPDATE`,
        [session.identityId, key],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_key_reused" });
        }
        const replayed = await onReplay(client, replay.rows[0]);
        await client.query("COMMIT");
        return json(res, 200, { ...replayed, replayed: true });
      }

      const outcome = await work(client);
      if (outcome.deny) {
        await client.query("ROLLBACK");
        return json(res, outcome.deny.code, outcome.deny.body);
      }

      try {
        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          [audit.action, session.identityId, outcome.auditTarget, JSON.stringify(outcome.auditMeta ?? {})],
        );
      } catch (auditError) {
        // Auditoria é obrigatória: indisponível → nada é persistido.
        await client.query("ROLLBACK");
        console.error("EXT-02 audit unavailable", auditError instanceof Error ? auditError.message : auditError);
        return json(res, 503, { error: "audit_unavailable" });
      }

      await client.query("COMMIT");
      return json(res, outcome.code, outcome.body);
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      if (error && typeof error === "object" && error.code === "23505") {
        // Corrida entre retries simultâneos da MESMA chave: devolve o replay.
        if (/idempotency/i.test(String(error.constraint || error.detail || ""))) {
          try {
            const raced = await client.query(
              `SELECT * FROM ext_third_party_events WHERE created_by_identity=$1 AND idempotency_key=$2`,
              [session.identityId, key],
            );
            if (raced.rows[0]) {
              if (raced.rows[0].request_fingerprint !== fingerprint) return json(res, 409, { error: "idempotency_key_reused" });
              const replayed = await onReplay(client, raced.rows[0]);
              return json(res, 200, { ...replayed, replayed: true });
            }
          } catch {}
        }
        const handled = onConflict ? onConflict(error) : null;
        if (handled) return json(res, handled.code, handled.body);
      }
      console.error("EXT-02 mutation failed", error instanceof Error ? error.message : error);
      return json(res, 503, { error: "third_party_unavailable" });
    } finally {
      client?.release();
    }
  }

  async function insertEvent(client, { thirdPartyId, eventType, summary, payload, key, fingerprint, identityId }) {
    await client.query(
      `INSERT INTO ext_third_party_events
         (third_party_id, event_type, summary, payload, idempotency_key, request_fingerprint, created_by_identity)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [thirdPartyId, eventType, summary, JSON.stringify(payload ?? {}), key, fingerprint, identityId],
    );
  }

  // -------------------------------------------------------------------------
  // GET/POST /api/ext/third-party/parties
  // -------------------------------------------------------------------------
  async function handleParties(req, res, { legacyAlias = false } = {}) {
    if (req.method === "GET") {
      const session = await guard(req, res, { write: false });
      if (!session) return;
      try {
        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        // Escopo explícito: filtros validados no servidor, nunca interpolados.
        const statusFilter = url.searchParams.get("status");
        const contractFilter = url.searchParams.get("contract_id");
        if (statusFilter !== null && !THIRD_PARTY_STATUSES.includes(statusFilter)) return json(res, 400, { error: "invalid_status" });
        if (contractFilter !== null && !UUID_PATTERN.test(contractFilter)) return json(res, 400, { error: "invalid_contract_id" });
        const params = [];
        const where = [];
        if (statusFilter) { params.push(statusFilter); where.push(`tp.status=$${params.length}`); }
        if (contractFilter) { params.push(contractFilter); where.push(`tp.contract_id=$${params.length}`); }
        const { rows } = await pool.query(
          `SELECT tp.*, c.title AS contract_title, c.status AS contract_status
             FROM ext_third_parties tp
             LEFT JOIN crm_contracts c ON c.id = tp.contract_id
            ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
            ORDER BY tp.name ASC LIMIT 200`,
          params,
        );
        const today = todayIso();
        const ids = rows.map(row => row.id);
        const grantsByParty = new Map();
        if (ids.length) {
          const grants = await pool.query(
            `SELECT * FROM ext_third_party_access_grants WHERE third_party_id = ANY($1::uuid[]) ORDER BY granted_at DESC`,
            [ids],
          );
          for (const grant of grants.rows) {
            if (!grantsByParty.has(grant.third_party_id)) grantsByParty.set(grant.third_party_id, []);
            grantsByParty.get(grant.third_party_id).push(grant);
          }
        }
        const items = rows.map(row => ({
          ...partyProjection(row),
          contract_title: row.contract_title ?? null,
          contract_status: row.contract_status ?? null,
          access_situation: deriveAccessSituation({ party: row, grants: grantsByParty.get(row.id) || [], today }),
        }));
        return json(res, 200, {
          third_parties: items,
          // A rota legada respondia em `items`. A leitura legada continua
          // autorizada e NÃO pode quebrar por renomeação de chave: o alias é
          // devolvido só para ela, apontando a rota canônica.
          ...(legacyAlias ? { items, canonical: "/api/ext/third-party/parties" } : {}),
          third_parties_registered: rows.length > 0,
          scope: {
            kind: "staff_autorizado",
            roles: THIRD_PARTY_READ_ROLES,
            filters_applied: { status: statusFilter, contract_id: contractFilter },
            note: "Listagem restrita aos papéis autorizados; filtros validados no servidor e limite fixo de 200 registros.",
          },
          source: [THIRD_PARTY_SOURCES.parties, THIRD_PARTY_SOURCES.grants, THIRD_PARTY_SOURCES.contracts],
          base_date: new Date().toISOString(),
          external_actor_boundary: EXTERNAL_ACTOR_BOUNDARY,
          note: rows.length > 0
            ? "Terceiros do backend canônico; vigência de acesso derivada apenas das janelas registradas."
            : "Nenhum terceiro registrado no backend canônico. Nenhum cadastro, janela ou avaliação é inventado.",
        });
      } catch (error) {
        console.error("EXT-02 parties list failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "third_party_unavailable" });
      }
    }
    if (req.method === "POST") {
      const session = await guard(req, res, { write: true });
      if (!session) return;
      const { body, tooLarge, invalid } = await readBody(req);
      if (tooLarge) return json(res, 413, { error: "body_too_large" });
      if (invalid) return json(res, 400, { error: "invalid_request" });

      // Só o conteúdo do cadastro vem do corpo. ID, autoria, origem, contrato,
      // janela e nota NÃO são aceitos aqui: cada um tem rota canônica própria.
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const document = typeof body.document === "string" && body.document.trim() ? body.document.trim() : null;
      const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : null;
      const responsibleName = typeof body.responsible_name === "string" && body.responsible_name.trim() ? body.responsible_name.trim() : null;
      const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

      if (name.length < 3 || name.length > 200) return json(res, 400, { error: "invalid_name" });
      if (document !== null && (document.length < 3 || document.length > 30)) return json(res, 400, { error: "invalid_document" });
      if (category !== null && (category.length < 3 || category.length > 100)) return json(res, 400, { error: "invalid_category" });
      if (responsibleName !== null && (responsibleName.length < 2 || responsibleName.length > 200)) return json(res, 400, { error: "invalid_responsible_name" });
      if (notes !== null && (notes.length < 10 || notes.length > 1000)) return json(res, 400, { error: "invalid_notes" });

      const key = idempotencyKeyOf(req, res);
      if (!key) return;
      const fingerprint = fingerprintOf({ op: "party_create", name, document, category, responsibleName, notes });

      return runMutation(res, {
        session, key, fingerprint,
        audit: { action: "ext_third_party_create" },
        onReplay: async (client, event) => {
          const { rows } = await client.query(`SELECT * FROM ext_third_parties WHERE id=$1`, [event.third_party_id]);
          return { third_party: rows[0] ? partyProjection(rows[0]) : null };
        },
        work: async client => {
          const thirdPartyId = randomUUID();
          const { rows } = await client.query(
            `INSERT INTO ext_third_parties
               (id, name, document, category, responsible_name, notes, origin, created_by_identity)
             VALUES ($1,$2,$3,$4,$5,$6,'jornada_terceiros',$7)
             RETURNING *`,
            [thirdPartyId, name, document, category, responsibleName, notes, session.identityId],
          );
          await insertEvent(client, {
            thirdPartyId, eventType: "terceiro_criado",
            summary: `Terceiro ${name} cadastrado pela jornada canônica.`,
            payload: { name, category }, key, fingerprint, identityId: session.identityId,
          });
          return {
            code: 201,
            body: {
              third_party: partyProjection(rows[0]),
              note: "Terceiro registrado no backend canônico; autoria derivada da sessão. Contrato, janela de acesso e avaliação exigem rotas canônicas próprias.",
            },
            auditTarget: thirdPartyId,
            auditMeta: { name },
          };
        },
      });
    }
    return json(res, 405, { error: "method_not_allowed" });
  }

  // -------------------------------------------------------------------------
  // GET /api/ext/third-party/parties/<uuid> — dossiê completo derivado
  // PATCH — situação do terceiro (encerrar revoga janelas vigentes)
  // -------------------------------------------------------------------------
  async function handlePartyById(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method === "GET") {
      const session = await guard(req, res, { write: false });
      if (!session) return;
      try {
        const party = await pool.query(
          `SELECT tp.*, c.title AS contract_title, c.status AS contract_status
             FROM ext_third_parties tp
             LEFT JOIN crm_contracts c ON c.id = tp.contract_id
            WHERE tp.id=$1`,
          [id],
        );
        if (!party.rows[0]) return json(res, 404, { error: "third_party_not_found" });
        const [grants, documents, evaluations, events, ruleRows] = await Promise.all([
          pool.query(
            `SELECT g.*, c.title AS contract_title, c.status AS contract_status, so.protocol AS service_order_protocol, so.status AS service_order_status
               FROM ext_third_party_access_grants g
               LEFT JOIN crm_contracts c ON c.id = g.contract_id
               LEFT JOIN ast_service_orders so ON so.id = g.service_order_id
              WHERE g.third_party_id=$1 ORDER BY g.granted_at DESC LIMIT 200`, [id]),
          pool.query(`SELECT id, document_type, document_number, file_name, expiry_date, is_active, deactivated_at, deactivate_reason, created_at FROM ext_third_party_documents WHERE third_party_id=$1 ORDER BY created_at DESC LIMIT 200`, [id]),
          pool.query(`SELECT id, score, justification, evaluated_on, evaluated_by_identity, created_at FROM ext_third_party_evaluations WHERE third_party_id=$1 ORDER BY evaluated_on DESC, created_at DESC LIMIT 200`, [id]),
          pool.query(`SELECT id, event_type, summary, payload, created_by_identity, created_at FROM ext_third_party_events WHERE third_party_id=$1 ORDER BY created_at DESC LIMIT 200`, [id]),
          pool.query(`SELECT * FROM ext_third_party_document_rules WHERE third_party_id=$1 AND is_active LIMIT 1`, [id]),
        ]);
        const today = todayIso();
        const rule = ruleRows.rows[0] || null;
        const baseDate = new Date().toISOString();
        return json(res, 200, {
          third_party: {
            ...partyProjection(party.rows[0]),
            contract_title: party.rows[0].contract_title ?? null,
            contract_status: party.rows[0].contract_status ?? null,
          },
          contract_link: party.rows[0].contract_id
            ? {
              contract_id: party.rows[0].contract_id,
              title: party.rows[0].contract_title ?? null,
              status_now: party.rows[0].contract_status ?? null,
              verified_at: party.rows[0].contract_verified_at ?? null,
              verified_status: party.rows[0].contract_verified_status ?? null,
              note: "Vínculo aceito somente após validação canônica no servidor; a situação verificada é registrada como fato na data da verificação.",
              source: THIRD_PARTY_SOURCES.contracts,
            }
            : { contract_id: null, note: "Nenhum contrato canônico vinculado a este terceiro; a ausência é declarada, não presumida.", source: THIRD_PARTY_SOURCES.contracts },
          access_grants: grants.rows.map(grant => ({
            id: grant.id,
            scope_kind: grant.scope_kind,
            contract_id: grant.contract_id,
            contract_title: grant.contract_title ?? null,
            service_order_id: grant.service_order_id,
            service_order_protocol: grant.service_order_protocol ?? null,
            justification: grant.justification,
            granted_at: grant.granted_at,
            granted_by_identity: grant.granted_by_identity,
            revoked_at: grant.revoked_at,
            revoke_reason: grant.revoke_reason,
            window: deriveGrantWindow(grant, today),
          })),
          access_situation: deriveAccessSituation({ party: party.rows[0], grants: grants.rows, today }),
          documents: documents.rows.map(document => ({ ...document, expiry: deriveDocumentExpiry({ document, rule, today }) })),
          document_rule: rule,
          document_rule_absence: rule ? null : "sem_regra_de_antecedencia: nenhum alerta 'a vencer' é inferido; vigente/vencido continuam derivados da data registrada.",
          evaluations: evaluations.rows,
          evaluation_summary: evaluations.rows.length > 0
            ? {
              latest: evaluations.rows[0],
              registered: evaluations.rows.length,
              note: "Nota exibida vem da avaliação canônica mais recente, com autor, data e justificativa.",
              source: THIRD_PARTY_SOURCES.evaluations,
              base_date: baseDate,
            }
            : {
              latest: null,
              registered: 0,
              note: "Nenhuma avaliação canônica registrada; nenhuma nota é inventada ou estimada.",
              source: THIRD_PARTY_SOURCES.evaluations,
              base_date: baseDate,
            },
          events: events.rows,
          external_actor_boundary: EXTERNAL_ACTOR_BOUNDARY,
          source: {
            third_party: THIRD_PARTY_SOURCES.parties,
            access_grants: THIRD_PARTY_SOURCES.grants,
            documents: THIRD_PARTY_SOURCES.documents,
            document_rule: THIRD_PARTY_SOURCES.documentRules,
            evaluations: THIRD_PARTY_SOURCES.evaluations,
            events: THIRD_PARTY_SOURCES.events,
            legacy_access_logs: THIRD_PARTY_SOURCES.legacyAccessLogs,
          },
          base_date: baseDate,
        });
      } catch (error) {
        console.error("EXT-02 party dossier failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "third_party_unavailable" });
      }
    }
    if (req.method === "PATCH") {
      const session = await guard(req, res, { write: true });
      if (!session) return;
      const { body, tooLarge, invalid } = await readBody(req);
      if (tooLarge) return json(res, 413, { error: "body_too_large" });
      if (invalid) return json(res, 400, { error: "invalid_request" });
      const status = typeof body.status === "string" ? body.status : "";
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!THIRD_PARTY_STATUSES.includes(status)) return json(res, 400, { error: "invalid_status" });
      if (reason.length < 5 || reason.length > 500) return json(res, 400, { error: "invalid_reason" });

      const key = idempotencyKeyOf(req, res);
      if (!key) return;
      const fingerprint = fingerprintOf({ op: "party_status", id, status, reason });

      return runMutation(res, {
        session, key, fingerprint,
        audit: { action: "ext_third_party_status_update" },
        onReplay: async (client, event) => {
          const { rows } = await client.query(`SELECT * FROM ext_third_parties WHERE id=$1`, [event.third_party_id]);
          return { third_party: rows[0] ? partyProjection(rows[0]) : null };
        },
        work: async client => {
          const existing = await client.query(`SELECT * FROM ext_third_parties WHERE id=$1 FOR UPDATE`, [id]);
          if (!existing.rows[0]) return { deny: { code: 404, body: { error: "third_party_not_found" } } };
          const { rows } = await client.query(
            `UPDATE ext_third_parties SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,
            [id, status],
          );
          // Encerrar o terceiro revoga, na MESMA transação, toda janela ainda
          // não revogada: a perda de acesso é consequência registrada, com
          // autor e motivo — nunca um campo livre.
          let revoked = 0;
          if (status === "encerrado") {
            const result = await client.query(
              `UPDATE ext_third_party_access_grants
                  SET revoked_at=NOW(), revoked_by_identity=$2, revoke_reason=$3
                WHERE third_party_id=$1 AND revoked_at IS NULL
                RETURNING id`,
              [id, session.identityId, `Terceiro encerrado: ${reason}`.slice(0, 500)],
            );
            revoked = result.rowCount ?? result.rows.length;
          }
          await insertEvent(client, {
            thirdPartyId: id, eventType: "situacao_atualizada",
            summary: `Situação do terceiro: ${existing.rows[0].status}→${status}. ${reason}`,
            payload: { previous_status: existing.rows[0].status, status, reason, revoked_grants: revoked },
            key, fingerprint, identityId: session.identityId,
          });
          return {
            code: 200,
            body: {
              third_party: partyProjection(rows[0]),
              revoked_grants: revoked,
              note: status === "encerrado"
                ? "Terceiro encerrado: janelas ainda vigentes foram revogadas na mesma transação, com autor e motivo registrados."
                : "Situação atualizada; janelas de acesso seguem decididas por derivação das datas canônicas.",
            },
            auditTarget: id,
            auditMeta: { status, revoked_grants: revoked },
          };
        },
      });
    }
    return json(res, 405, { error: "method_not_allowed" });
  }

  // -------------------------------------------------------------------------
  // POST /api/ext/third-party/parties/<uuid>/contract — vínculo com
  // crm_contracts SOMENTE após validação canônica no servidor.
  // -------------------------------------------------------------------------
  async function handlePartyContract(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });
    const contractId = typeof body.contract_id === "string" ? body.contract_id.trim() : "";
    const justification = typeof body.justification === "string" ? body.justification.trim() : "";
    if (!UUID_PATTERN.test(contractId)) return json(res, 400, { error: "invalid_contract_id" });
    if (justification.length < 5 || justification.length > 500) return json(res, 400, { error: "invalid_justification" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "contract_bind", id, contractId, justification });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_third_party_contract_bind" },
      onReplay: async (client, event) => {
        const { rows } = await client.query(`SELECT * FROM ext_third_parties WHERE id=$1`, [event.third_party_id]);
        return { third_party: rows[0] ? partyProjection(rows[0]) : null };
      },
      work: async client => {
        const existing = await client.query(`SELECT * FROM ext_third_parties WHERE id=$1 FOR UPDATE`, [id]);
        if (!existing.rows[0]) return { deny: { code: 404, body: { error: "third_party_not_found" } } };
        // Validação canônica: o contrato precisa existir de fato.
        const contract = await client.query(`SELECT id, title, status FROM crm_contracts WHERE id=$1`, [contractId]);
        if (!contract.rows[0]) return { deny: { code: 404, body: { error: "contract_not_found" } } };
        // Trocar de contrato com janela viva deixaria acesso autorizado por um
        // vínculo que não existe mais: recusado de forma declarada.
        if (existing.rows[0].contract_id && existing.rows[0].contract_id !== contractId) {
          const live = await client.query(
            `SELECT id FROM ext_third_party_access_grants WHERE third_party_id=$1 AND revoked_at IS NULL LIMIT 1`,
            [id],
          );
          if (live.rows[0]) {
            return { deny: { code: 409, body: { error: "contract_rebind_blocked_by_active_grant", grant_id: live.rows[0].id } } };
          }
        }
        const { rows } = await client.query(
          `UPDATE ext_third_parties
              SET contract_id=$2, contract_verified_at=NOW(), contract_verified_by_identity=$3,
                  contract_verified_status=$4, updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [id, contractId, session.identityId, contract.rows[0].status],
        );
        await insertEvent(client, {
          thirdPartyId: id, eventType: "contrato_vinculado",
          summary: `Contrato ${contract.rows[0].title} vinculado após validação canônica.`,
          payload: { contract_id: contractId, contract_status: contract.rows[0].status, justification },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 201,
          body: {
            third_party: partyProjection(rows[0]),
            contract: { id: contract.rows[0].id, title: contract.rows[0].title, status: contract.rows[0].status },
            note: "Vínculo gravado somente após validar o contrato em crm_contracts; quem verificou e quando ficaram registrados.",
            source: THIRD_PARTY_SOURCES.contracts,
          },
          auditTarget: id,
          auditMeta: { contract_id: contractId, contract_status: contract.rows[0].status },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // GET/POST /api/ext/third-party/parties/<uuid>/access-grants — janela de
  // acesso temporário presa a UM escopo autorizado (contrato ou OS).
  // -------------------------------------------------------------------------
  async function handlePartyAccessGrants(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method === "GET") {
      const session = await guard(req, res, { write: false });
      if (!session) return;
      try {
        const party = await pool.query(`SELECT * FROM ext_third_parties WHERE id=$1`, [id]);
        if (!party.rows[0]) return json(res, 404, { error: "third_party_not_found" });
        const { rows } = await pool.query(
          `SELECT * FROM ext_third_party_access_grants WHERE third_party_id=$1 ORDER BY granted_at DESC LIMIT 200`,
          [id],
        );
        const today = todayIso();
        return json(res, 200, {
          access_grants: rows.map(grant => ({ ...grant, window: deriveGrantWindow(grant, today) })),
          access_situation: deriveAccessSituation({ party: party.rows[0], grants: rows, today }),
          external_actor_boundary: EXTERNAL_ACTOR_BOUNDARY,
          source: THIRD_PARTY_SOURCES.grants,
          base_date: new Date().toISOString(),
        });
      } catch (error) {
        console.error("EXT-02 grants list failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "third_party_unavailable" });
      }
    }
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });
    const scopeKind = typeof body.scope_kind === "string" ? body.scope_kind : "";
    const scopeId = typeof body.scope_id === "string" ? body.scope_id.trim() : "";
    const accessStart = typeof body.access_start === "string" ? body.access_start : "";
    const accessEnd = typeof body.access_end === "string" ? body.access_end : "";
    const justification = typeof body.justification === "string" ? body.justification.trim() : "";
    if (!ACCESS_SCOPE_KINDS.includes(scopeKind)) return json(res, 400, { error: "invalid_scope_kind" });
    if (!UUID_PATTERN.test(scopeId)) return json(res, 400, { error: "invalid_scope_id" });
    if (!isIsoDate(accessStart)) return json(res, 400, { error: "invalid_access_start" });
    if (!isIsoDate(accessEnd)) return json(res, 400, { error: "invalid_access_end" });
    // Janela com término obrigatório: sem fim não há "perde acesso ao término".
    if (accessEnd < accessStart) return json(res, 400, { error: "invalid_access_window" });
    if (accessEnd < todayIso()) return json(res, 400, { error: "access_window_already_ended" });
    if (justification.length < 10 || justification.length > 1000) return json(res, 400, { error: "invalid_justification" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "grant_create", id, scopeKind, scopeId, accessStart, accessEnd, justification });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_third_party_access_grant" },
      onReplay: async (client, event) => {
        const recordId = event.payload?.record_id ?? null;
        const { rows } = recordId
          ? await client.query(`SELECT * FROM ext_third_party_access_grants WHERE id=$1`, [recordId])
          : { rows: [] };
        return { access_grant: rows[0] ? { ...rows[0], window: deriveGrantWindow(rows[0]) } : null };
      },
      work: async client => {
        const party = await client.query(`SELECT * FROM ext_third_parties WHERE id=$1 FOR UPDATE`, [id]);
        if (!party.rows[0]) return { deny: { code: 404, body: { error: "third_party_not_found" } } };
        if (party.rows[0].status !== "ativo") {
          return { deny: { code: 409, body: { error: "third_party_not_active", status: party.rows[0].status } } };
        }

        if (scopeKind === "contrato") {
          const contract = await client.query(`SELECT id, title, status FROM crm_contracts WHERE id=$1`, [scopeId]);
          if (!contract.rows[0]) return { deny: { code: 404, body: { error: "contract_not_found" } } };
          // Só o contrato canonicamente vinculado e verificado autoriza.
          if (party.rows[0].contract_id !== scopeId) {
            return { deny: { code: 409, body: { error: "contract_not_bound_to_third_party", note: "Vincule o contrato pela rota canônica antes de conceder acesso." } } };
          }
          if (CONTRACT_STATUSES_NOT_GRANTABLE.includes(contract.rows[0].status)) {
            return { deny: { code: 409, body: { error: "contract_not_grantable", contract_status: contract.rows[0].status, blocking_statuses: CONTRACT_STATUSES_NOT_GRANTABLE } } };
          }
        } else {
          const order = await client.query(`SELECT id, protocol, status, contract_id FROM ast_service_orders WHERE id=$1`, [scopeId]);
          if (!order.rows[0]) return { deny: { code: 404, body: { error: "service_order_not_found" } } };
          if (SERVICE_ORDER_STATUSES_NOT_GRANTABLE.includes(order.rows[0].status)) {
            return { deny: { code: 409, body: { error: "service_order_not_grantable", service_order_status: order.rows[0].status, blocking_statuses: SERVICE_ORDER_STATUSES_NOT_GRANTABLE } } };
          }
          // Terceiro com contrato vinculado só recebe OS do próprio contrato.
          if (party.rows[0].contract_id && order.rows[0].contract_id !== party.rows[0].contract_id) {
            return { deny: { code: 409, body: { error: "service_order_outside_contract", note: "A OS não pertence ao contrato canonicamente vinculado a este terceiro." } } };
          }
        }

        const { rows } = await client.query(
          `INSERT INTO ext_third_party_access_grants
             (third_party_id, scope_kind, contract_id, service_order_id, access_start, access_end, justification, granted_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [
            id, scopeKind,
            scopeKind === "contrato" ? scopeId : null,
            scopeKind === "ordem_servico" ? scopeId : null,
            accessStart, accessEnd, justification, session.identityId,
          ],
        );
        await insertEvent(client, {
          thirdPartyId: id, eventType: "acesso_concedido",
          summary: `Acesso temporário concedido (${scopeKind}) de ${accessStart} a ${accessEnd}.`,
          payload: { record_id: rows[0].id, scope_kind: scopeKind, scope_id: scopeId, access_start: accessStart, access_end: accessEnd },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 201,
          body: {
            access_grant: { ...rows[0], window: deriveGrantWindow(rows[0]) },
            note: "Janela registrada com escopo autorizado e término obrigatório; a perda de acesso ao término é derivada desta data, não marcada à mão.",
            external_actor_boundary: EXTERNAL_ACTOR_BOUNDARY,
          },
          auditTarget: rows[0].id,
          auditMeta: { third_party_id: id, scope_kind: scopeKind, scope_id: scopeId, access_end: accessEnd },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // POST /api/ext/third-party/access-grants/<uuid>/revoke — revogação
  // declarada; a janela nunca é apagada nem editada.
  // -------------------------------------------------------------------------
  async function handleAccessGrantRevoke(req, res, grantId) {
    if (!UUID_PATTERN.test(String(grantId || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 500) return json(res, 400, { error: "invalid_reason" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "grant_revoke", grantId, reason });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_third_party_access_revoke" },
      onReplay: async (client, event) => {
        const recordId = event.payload?.record_id ?? null;
        const { rows } = recordId
          ? await client.query(`SELECT * FROM ext_third_party_access_grants WHERE id=$1`, [recordId])
          : { rows: [] };
        return { access_grant: rows[0] ? { ...rows[0], window: deriveGrantWindow(rows[0]) } : null };
      },
      work: async client => {
        const existing = await client.query(`SELECT * FROM ext_third_party_access_grants WHERE id=$1 FOR UPDATE`, [grantId]);
        if (!existing.rows[0]) return { deny: { code: 404, body: { error: "access_grant_not_found" } } };
        if (existing.rows[0].revoked_at) return { deny: { code: 409, body: { error: "access_grant_already_revoked" } } };
        const { rows } = await client.query(
          `UPDATE ext_third_party_access_grants
              SET revoked_at=NOW(), revoked_by_identity=$2, revoke_reason=$3
            WHERE id=$1 RETURNING *`,
          [grantId, session.identityId, reason],
        );
        await insertEvent(client, {
          thirdPartyId: existing.rows[0].third_party_id, eventType: "acesso_revogado",
          summary: `Acesso temporário revogado: ${reason}`,
          payload: { record_id: grantId, reason },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 200,
          body: {
            access_grant: { ...rows[0], window: deriveGrantWindow(rows[0]) },
            note: "Revogação declarada com autor e motivo; a janela permanece no histórico imutável.",
          },
          auditTarget: grantId,
          auditMeta: { third_party_id: existing.rows[0].third_party_id },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // GET /api/ext/third-party/parties/<uuid>/authorization?scope_kind&scope_id
  // Ponto de imposição: decisão determinística sobre a janela canônica.
  // -------------------------------------------------------------------------
  async function handlePartyAuthorization(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: false });
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const scopeKind = url.searchParams.get("scope_kind") || "";
    const scopeId = url.searchParams.get("scope_id") || "";
    if (!ACCESS_SCOPE_KINDS.includes(scopeKind)) return json(res, 400, { error: "invalid_scope_kind" });
    if (!UUID_PATTERN.test(scopeId)) return json(res, 400, { error: "invalid_scope_id" });
    try {
      const party = await pool.query(`SELECT * FROM ext_third_parties WHERE id=$1`, [id]);
      const grants = party.rows[0]
        ? await pool.query(`SELECT * FROM ext_third_party_access_grants WHERE third_party_id=$1 ORDER BY granted_at DESC LIMIT 200`, [id])
        : { rows: [] };
      const decision = deriveAccessDecision({
        party: party.rows[0] || null,
        grants: grants.rows,
        scope: { kind: scopeKind, id: scopeId },
      });
      return json(res, 200, { ...decision, third_party_id: id });
    } catch (error) {
      console.error("EXT-02 authorization failed", error instanceof Error ? error.message : error);
      return json(res, 503, { error: "third_party_unavailable" });
    }
  }

  // -------------------------------------------------------------------------
  // GET/POST /api/ext/third-party/parties/<uuid>/documents — metadados
  // sintéticos de documento (sem upload real nesta fatia; declarado).
  // -------------------------------------------------------------------------
  async function handlePartyDocuments(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method === "GET") {
      const session = await guard(req, res, { write: false });
      if (!session) return;
      try {
        const party = await pool.query(`SELECT id FROM ext_third_parties WHERE id=$1`, [id]);
        if (!party.rows[0]) return json(res, 404, { error: "third_party_not_found" });
        const [documents, ruleRows] = await Promise.all([
          pool.query(`SELECT id, document_type, document_number, file_name, expiry_date, is_active, deactivated_at, deactivate_reason, created_at FROM ext_third_party_documents WHERE third_party_id=$1 ORDER BY created_at DESC LIMIT 200`, [id]),
          pool.query(`SELECT * FROM ext_third_party_document_rules WHERE third_party_id=$1 AND is_active LIMIT 1`, [id]),
        ]);
        const today = todayIso();
        const rule = ruleRows.rows[0] || null;
        return json(res, 200, {
          documents: documents.rows.map(document => ({ ...document, expiry: deriveDocumentExpiry({ document, rule, today }) })),
          document_rule: rule,
          document_rule_absence: rule ? null : "sem_regra_de_antecedencia: nenhum alerta 'a vencer' é inferido.",
          source: [THIRD_PARTY_SOURCES.documents, THIRD_PARTY_SOURCES.documentRules],
          base_date: new Date().toISOString(),
          note: documents.rows.length === 0
            ? "Nenhum documento canônico registrado para este terceiro; a ausência é declarada."
            : "Situação de vencimento derivada apenas das datas registradas e da regra explícita, quando houver.",
        });
      } catch (error) {
        console.error("EXT-02 documents list failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "third_party_unavailable" });
      }
    }
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });
    const documentType = typeof body.document_type === "string" ? body.document_type.trim() : "";
    const documentNumber = typeof body.document_number === "string" && body.document_number.trim() ? body.document_number.trim() : null;
    const expiryDate = typeof body.expiry_date === "string" && body.expiry_date ? body.expiry_date : null;
    const fileName = typeof body.file_name === "string" && body.file_name.trim() ? body.file_name.trim() : null;
    if (documentType.length < 3 || documentType.length > 100) return json(res, 400, { error: "invalid_document_type" });
    if (documentNumber !== null && (documentNumber.length < 3 || documentNumber.length > 200)) return json(res, 400, { error: "invalid_document_number" });
    if (expiryDate !== null && !isIsoDate(expiryDate)) return json(res, 400, { error: "invalid_expiry_date" });
    if (fileName !== null && (fileName.length < 1 || fileName.length > 500)) return json(res, 400, { error: "invalid_file_name" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "document_create", id, documentType, documentNumber, expiryDate, fileName });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_third_party_document_create" },
      onReplay: async (client, event) => {
        const recordId = event.payload?.record_id ?? null;
        const { rows } = recordId
          ? await client.query(`SELECT * FROM ext_third_party_documents WHERE id=$1`, [recordId])
          : { rows: [] };
        return { document: rows[0] ?? null };
      },
      work: async client => {
        const party = await client.query(`SELECT id FROM ext_third_parties WHERE id=$1 FOR UPDATE`, [id]);
        if (!party.rows[0]) return { deny: { code: 404, body: { error: "third_party_not_found" } } };
        const { rows } = await client.query(
          `INSERT INTO ext_third_party_documents
             (third_party_id, document_type, document_number, file_name, expiry_date, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [id, documentType, documentNumber, fileName, expiryDate, session.identityId],
        );
        await insertEvent(client, {
          thirdPartyId: id, eventType: "documento_registrado",
          summary: `Documento '${documentType}' registrado${expiryDate ? ` com validade ${expiryDate}` : " sem data de validade declarada"}.`,
          payload: { record_id: rows[0].id, document_type: documentType, expiry_date: expiryDate },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 201,
          body: {
            document: rows[0],
            note: "Metadados de documento registrados no backend canônico. Esta fatia não faz upload de arquivo real; a ausência de bytes é declarada.",
          },
          auditTarget: rows[0].id,
          auditMeta: { third_party_id: id, document_type: documentType },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // POST /api/ext/third-party/documents/<uuid>/deactivate — desativação
  // declarada com autor e motivo; o registro permanece.
  // -------------------------------------------------------------------------
  async function handleDocumentDeactivate(req, res, docId) {
    if (!UUID_PATTERN.test(String(docId || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 500) return json(res, 400, { error: "invalid_reason" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "document_deactivate", docId, reason });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_third_party_document_deactivate" },
      onReplay: async (client, event) => {
        const recordId = event.payload?.record_id ?? null;
        const { rows } = recordId
          ? await client.query(`SELECT * FROM ext_third_party_documents WHERE id=$1`, [recordId])
          : { rows: [] };
        return { document: rows[0] ?? null };
      },
      work: async client => {
        const existing = await client.query(`SELECT * FROM ext_third_party_documents WHERE id=$1 FOR UPDATE`, [docId]);
        if (!existing.rows[0]) return { deny: { code: 404, body: { error: "document_not_found" } } };
        if (!existing.rows[0].is_active) return { deny: { code: 409, body: { error: "document_already_inactive" } } };
        const { rows } = await client.query(
          `UPDATE ext_third_party_documents
              SET is_active=false, deactivated_at=NOW(), deactivated_by_identity=$2, deactivate_reason=$3
            WHERE id=$1 RETURNING *`,
          [docId, session.identityId, reason],
        );
        await insertEvent(client, {
          thirdPartyId: existing.rows[0].third_party_id, eventType: "documento_desativado",
          summary: `Documento '${existing.rows[0].document_type}' desativado: ${reason}`,
          payload: { record_id: docId, reason },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 200,
          body: { document: rows[0], note: "Documento desativado com autor e motivo; o registro permanece para histórico." },
          auditTarget: docId,
          auditMeta: { third_party_id: existing.rows[0].third_party_id },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // GET/POST /api/ext/third-party/parties/<uuid>/document-rules — regra
  // explícita de antecedência; registrar nova desativa a anterior.
  // -------------------------------------------------------------------------
  async function handlePartyDocumentRules(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method === "GET") {
      const session = await guard(req, res, { write: false });
      if (!session) return;
      try {
        const party = await pool.query(`SELECT id FROM ext_third_parties WHERE id=$1`, [id]);
        if (!party.rows[0]) return json(res, 404, { error: "third_party_not_found" });
        const { rows } = await pool.query(
          `SELECT * FROM ext_third_party_document_rules WHERE third_party_id=$1 ORDER BY created_at DESC LIMIT 100`,
          [id],
        );
        return json(res, 200, { rules: rows, source: THIRD_PARTY_SOURCES.documentRules, base_date: new Date().toISOString() });
      } catch (error) {
        console.error("EXT-02 document rules list failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "third_party_unavailable" });
      }
    }
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });
    const alertBeforeDays = body.alert_before_days == null || body.alert_before_days === "" ? null : Number(body.alert_before_days);
    const justification = typeof body.justification === "string" ? body.justification.trim() : "";
    if (alertBeforeDays === null || !Number.isInteger(alertBeforeDays) || alertBeforeDays < 1 || alertBeforeDays > 365) {
      return json(res, 400, { error: "invalid_alert_before_days" });
    }
    if (justification.length < 5 || justification.length > 500) return json(res, 400, { error: "invalid_justification" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "document_rule_create", id, alertBeforeDays, justification });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_third_party_document_rule_create" },
      onReplay: async (client, event) => {
        const recordId = event.payload?.record_id ?? null;
        const { rows } = recordId
          ? await client.query(`SELECT * FROM ext_third_party_document_rules WHERE id=$1`, [recordId])
          : { rows: [] };
        return { rule: rows[0] ?? null };
      },
      work: async client => {
        const party = await client.query(`SELECT id FROM ext_third_parties WHERE id=$1 FOR UPDATE`, [id]);
        if (!party.rows[0]) return { deny: { code: 404, body: { error: "third_party_not_found" } } };
        await client.query(
          `UPDATE ext_third_party_document_rules
              SET is_active=false, deactivated_at=NOW(), deactivated_by_identity=$2
            WHERE third_party_id=$1 AND is_active`,
          [id, session.identityId],
        );
        const { rows } = await client.query(
          `INSERT INTO ext_third_party_document_rules
             (third_party_id, alert_before_days, justification, created_by_identity)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [id, alertBeforeDays, justification, session.identityId],
        );
        await insertEvent(client, {
          thirdPartyId: id, eventType: "regra_documento_registrada",
          summary: `Regra de antecedência de vencimento registrada: ${alertBeforeDays} dias.`,
          payload: { record_id: rows[0].id, alert_before_days: alertBeforeDays },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 201,
          body: { rule: rows[0], note: "Regra explícita registrada; o alerta 'a vencer' deriva somente dela e da data registrada." },
          auditTarget: rows[0].id,
          auditMeta: { third_party_id: id, alert_before_days: alertBeforeDays },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // GET/POST /api/ext/third-party/parties/<uuid>/evaluations — avaliação com
  // autor derivado da sessão, data e justificativa. Nada inventado.
  // -------------------------------------------------------------------------
  async function handlePartyEvaluations(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method === "GET") {
      const session = await guard(req, res, { write: false });
      if (!session) return;
      try {
        const party = await pool.query(`SELECT id FROM ext_third_parties WHERE id=$1`, [id]);
        if (!party.rows[0]) return json(res, 404, { error: "third_party_not_found" });
        const { rows } = await pool.query(
          `SELECT id, score, justification, evaluated_on, evaluated_by_identity, created_at
             FROM ext_third_party_evaluations WHERE third_party_id=$1
            ORDER BY evaluated_on DESC, created_at DESC LIMIT 200`,
          [id],
        );
        return json(res, 200, {
          evaluations: rows,
          registered: rows.length,
          note: rows.length === 0
            ? "Nenhuma avaliação canônica registrada; nenhuma nota é inventada ou estimada."
            : "Avaliações canônicas com autor, data e justificativa registrados.",
          source: THIRD_PARTY_SOURCES.evaluations,
          base_date: new Date().toISOString(),
        });
      } catch (error) {
        console.error("EXT-02 evaluations list failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "third_party_unavailable" });
      }
    }
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });
    // Nota é obrigatória e explícita: não existe default silencioso.
    const score = body.score == null || body.score === "" ? null : Number(body.score);
    const justification = typeof body.justification === "string" ? body.justification.trim() : "";
    const evaluatedOn = typeof body.evaluated_on === "string" ? body.evaluated_on : "";
    if (score === null || !Number.isInteger(score) || score < 0 || score > 10) return json(res, 400, { error: "invalid_score" });
    if (justification.length < 10 || justification.length > 1000) return json(res, 400, { error: "invalid_justification" });
    if (!isIsoDate(evaluatedOn)) return json(res, 400, { error: "invalid_evaluated_on" });
    if (evaluatedOn > todayIso()) return json(res, 400, { error: "evaluated_on_in_future" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "evaluation_create", id, score, justification, evaluatedOn });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_third_party_evaluation_create" },
      onReplay: async (client, event) => {
        const recordId = event.payload?.record_id ?? null;
        const { rows } = recordId
          ? await client.query(`SELECT * FROM ext_third_party_evaluations WHERE id=$1`, [recordId])
          : { rows: [] };
        return { evaluation: rows[0] ?? null };
      },
      work: async client => {
        const party = await client.query(`SELECT * FROM ext_third_parties WHERE id=$1 FOR UPDATE`, [id]);
        if (!party.rows[0]) return { deny: { code: 404, body: { error: "third_party_not_found" } } };
        const { rows } = await client.query(
          `INSERT INTO ext_third_party_evaluations
             (third_party_id, score, justification, evaluated_on, evaluated_by_identity)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [id, score, justification, evaluatedOn, session.identityId],
        );
        // A nota do cadastro só pode apontar para a avaliação canônica recém
        // registrada: nunca é escrita direto pelo corpo do navegador.
        await client.query(
          `UPDATE ext_third_parties SET evaluation_score=$2, evaluation_source_id=$3, updated_at=NOW() WHERE id=$1`,
          [id, score, rows[0].id],
        );
        await insertEvent(client, {
          thirdPartyId: id, eventType: "avaliacao_registrada",
          summary: `Avaliação ${score}/10 registrada em ${evaluatedOn} com justificativa.`,
          payload: { record_id: rows[0].id, score, evaluated_on: evaluatedOn },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 201,
          body: {
            evaluation: rows[0],
            note: "Avaliação registrada com autor derivado da sessão, data e justificativa; a nota do cadastro passa a apontar para ela.",
            source: THIRD_PARTY_SOURCES.evaluations,
          },
          auditTarget: rows[0].id,
          auditMeta: { third_party_id: id, score },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // Rotas legadas (/api/ext/third-parties, /api/ext/third-party-documents e
  // aliases): leitura com a mesma autorização e fontes/derivações declaradas;
  // mutações aposentadas — a rota antiga não é atalho sem transação,
  // idempotência, validação canônica de contrato e janela de acesso.
  // -------------------------------------------------------------------------
  async function handleLegacyThirdParties(req, res) {
    if (req.method !== "GET") {
      return json(res, 410, { error: "legacy_route_retired", use: "/api/ext/third-party/parties" });
    }
    return handleParties(req, res, { legacyAlias: true });
  }

  async function handleLegacyThirdPartyDocuments(req, res) {
    if (req.method !== "GET") {
      return json(res, 410, { error: "legacy_route_retired", use: "/api/ext/third-party/parties/<id>/documents" });
    }
    const session = await guard(req, res, { write: false });
    if (!session) return;
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const thirdPartyId = url.searchParams.get("third_party_id");
      if (thirdPartyId !== null && !UUID_PATTERN.test(thirdPartyId)) return json(res, 400, { error: "invalid_third_party_id" });
      const params = [];
      let sql = `SELECT d.id, d.third_party_id, d.document_type, d.document_number, d.file_name, d.expiry_date,
                        d.is_active, d.deactivated_at, d.deactivate_reason, d.created_at, tp.name AS third_party_name
                   FROM ext_third_party_documents d
                   JOIN ext_third_parties tp ON tp.id = d.third_party_id`;
      if (thirdPartyId) { params.push(thirdPartyId); sql += ` WHERE d.third_party_id=$1`; }
      sql += ` ORDER BY d.expiry_date ASC NULLS LAST, d.created_at DESC LIMIT 200`;
      const { rows } = await pool.query(sql, params);
      const today = todayIso();
      const rulesByParty = new Map();
      const partyIds = [...new Set(rows.map(row => row.third_party_id))];
      if (partyIds.length) {
        const rules = await pool.query(
          `SELECT * FROM ext_third_party_document_rules WHERE third_party_id = ANY($1::uuid[]) AND is_active`,
          [partyIds],
        );
        for (const rule of rules.rows) rulesByParty.set(rule.third_party_id, rule);
      }
      return json(res, 200, {
        items: rows.map(document => ({ ...document, expiry: deriveDocumentExpiry({ document, rule: rulesByParty.get(document.third_party_id) || null, today }) })),
        source: [THIRD_PARTY_SOURCES.documents, THIRD_PARTY_SOURCES.documentRules],
        base_date: new Date().toISOString(),
        canonical: "/api/ext/third-party/parties/<id>/documents",
      });
    } catch (error) {
      console.error("EXT-02 legacy documents list failed", error instanceof Error ? error.message : error);
      return json(res, 503, { error: "third_party_unavailable" });
    }
  }

  return {
    handleParties,
    handlePartyById,
    handlePartyContract,
    handlePartyAccessGrants,
    handleAccessGrantRevoke,
    handlePartyAuthorization,
    handlePartyDocuments,
    handleDocumentDeactivate,
    handlePartyDocumentRules,
    handlePartyEvaluations,
    handleLegacyThirdParties,
    handleLegacyThirdPartyDocuments,
  };
}
