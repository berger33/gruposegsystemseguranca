import { createHash, randomUUID } from "node:crypto";

// CLI-15: reclamação sobre colaborador aberta pelo cliente em canal restrito,
// com compartilhamento mínimo e justificado com RH.
//
// Regras desta jornada:
// - somente sessão de cliente canônica (auth_sessions) autoriza; nenhuma rota
//   administrativa é atalho e nenhuma sessão staff é aceita aqui;
// - autoria, identidade, conta, IDs e protocolo são derivados/validados no
//   servidor; o corpo do navegador nunca é fonte de vínculo;
// - cliente A não lista, consulta nem infere reclamações de B: fora do escopo
//   responde 403 genérico idêntico ao inexistente, com auditoria de negação;
// - o RH recebe somente o envelope mínimo justificado (protocolo, categoria,
//   severidade e situação), registrado campo a campo em
//   cli_employee_complaint_hr_shares na mesma transação da abertura;
// - escrita, histórico e auth_access_audit ocorrem na mesma transação; falha
//   da auditoria devolve 503 com rollback;
// - retry idêntico não duplica (replay devolve a mesma reclamação) e reuso da
//   chave com conteúdo divergente responde 409.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

export const COMPLAINT_CATEGORIES = ["atendimento", "comportamento", "seguranca", "assédio", "discriminacao", "outro"];
export const COMPLAINT_SEVERITIES = ["baixa", "media", "alta", "critica"];

// Compartilhamento mínimo com RH: somente estes campos, cada um com a sua
// justificativa registrada. Nunca descrição, identidade do cliente, conta,
// mensagens ou referência do colaborador.
export const HR_MINIMAL_SHARE_FIELDS = Object.freeze([
  { field: "protocol", justification: "Protocolo é necessário para o RH referenciar a apuração sem acesso ao conteúdo restrito." },
  { field: "category", justification: "Categoria é necessária para o RH direcionar a triagem da conduta relatada." },
  { field: "severity", justification: "Severidade é necessária para o RH priorizar a apuração." },
  { field: "status", justification: "Situação é necessária para o RH acompanhar o andamento sem acesso ao relato." },
]);

function requestFingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashReference(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function generateProtocol() {
  const d = new Date();
  const y = d.getFullYear().toString();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `CLI-COMP-${y}${m}${day}-${rand}`;
}

// Projeção segura para o cliente: nunca expõe employee_id, contato, vínculos
// internos de RH, responsável interno ou identidades de terceiros.
function clientProjection(row) {
  return {
    id: row.id,
    protocol: row.protocol,
    client_account_id: row.client_account_id,
    category: row.category,
    severity: row.severity,
    title: row.title,
    description: row.description,
    status: row.status,
    is_anonymous: row.is_anonymous,
    is_restricted: row.is_restricted,
    minimal_share: row.minimal_share,
    is_shared_with_hr: row.is_shared_with_hr,
    shared_with_hr_at: row.shared_with_hr_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createClientEmployeeComplaintApi({ pool, sameOrigin, requireClientSession }) {
  function json(res, code, obj) {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  }

  async function guard(req, res, methods) {
    const session = await requireClientSession?.(req);
    if (!session?.identityId) { json(res, 401, { error: "client_session_required" }); return null; }
    if (!sameOrigin(req)) { json(res, 403, { error: "origin_forbidden" }); return null; }
    if (!methods.includes(req.method)) { json(res, 405, { error: "method_not_allowed" }); return null; }
    return session;
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

  async function handleComplaints(req, res) {
    const session = await guard(req, res, ["GET", "POST"]);
    if (!session) return;
    if (req.method === "GET") return listComplaints(req, res, session);
    return openComplaint(req, res, session);
  }

  async function listComplaints(req, res, session) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const accountId = String(url.searchParams.get("account") || "");
    if (!UUID_PATTERN.test(accountId)) return json(res, 400, { error: "invalid_account_id" });
    try {
      const scoped = await pool.query(
        `SELECT 1 FROM client_access_grants grant_row
           JOIN client_accounts account ON account.id = grant_row.client_account_id
          WHERE grant_row.identity_id=$1 AND grant_row.client_account_id=$2
            AND grant_row.revoked_at IS NULL AND account.status='active'`,
        [session.identityId, accountId],
      );
      if (!scoped.rows[0]) {
        await pool.query(
          `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
           VALUES ('client',$1,'employee_complaint_list',$2,'denied','authorization_denied')`,
          [session.identityId, accountId],
        );
        return json(res, 403, { error: "forbidden" });
      }
      // Canal restrito: somente reclamações abertas pela própria identidade
      // nesta conta, pela jornada do portal. Linhas legadas/staff ficam fora.
      const complaints = await pool.query(
        `SELECT id, protocol, client_account_id, category, severity, title, description, status,
                is_anonymous, is_restricted, minimal_share, is_shared_with_hr, shared_with_hr_at,
                created_at, updated_at
           FROM cli_employee_complaints
          WHERE origin='portal_cliente' AND created_by_identity=$1 AND client_account_id=$2
          ORDER BY created_at DESC LIMIT 100`,
        [session.identityId, accountId],
      );
      await pool.query(
        `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
         VALUES ('client',$1,'employee_complaint_list',$2,'allowed','none')`,
        [session.identityId, accountId],
      );
      return json(res, 200, {
        complaints: complaints.rows.map(clientProjection),
        hrMinimalShare: HR_MINIMAL_SHARE_FIELDS,
        note: "Canal restrito: somente as reclamações abertas por você nesta conta. O RH recebe apenas protocolo, categoria, severidade e situação, com justificativa registrada.",
      });
    } catch (error) {
      console.error("CLI-15 client list failed", error instanceof Error ? error.message : error);
      return json(res, 503, { error: "employee_complaints_unavailable" });
    }
  }

  async function handleComplaintById(req, res, id) {
    const session = await guard(req, res, ["GET"]);
    if (!session) return;
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });
    try {
      // Escopo exclusivamente pela sessão: reclamação de terceiro e reclamação
      // inexistente respondem o mesmo 403 genérico, sem diferença inferível.
      const scoped = await pool.query(
        `SELECT complaint.*
           FROM cli_employee_complaints complaint
           JOIN client_access_grants grant_row
             ON grant_row.client_account_id = complaint.client_account_id
            AND grant_row.identity_id = $1
            AND grant_row.revoked_at IS NULL
           JOIN client_accounts account
             ON account.id = complaint.client_account_id AND account.status='active'
          WHERE complaint.id=$2 AND complaint.origin='portal_cliente'
            AND complaint.created_by_identity=$1`,
        [session.identityId, id],
      );
      const complaint = scoped.rows[0];
      if (!complaint) {
        await pool.query(
          `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
           VALUES ('client',$1,'employee_complaint_view',$2,'denied','authorization_denied')`,
          [session.identityId, id],
        );
        return json(res, 403, { error: "forbidden" });
      }
      // Histórico sem detalhes internos de RH: apenas situações e datas.
      const history = await pool.query(
        `SELECT previous_status, next_status, is_hr_share, created_at
           FROM cli_employee_complaint_history
          WHERE complaint_id=$1 ORDER BY created_at ASC LIMIT 200`,
        [id],
      );
      // Transparência do compartilhamento mínimo: campo e justificativa,
      // nunca anotações internas do RH.
      const hrShares = await pool.query(
        `SELECT shared_field, justification, shared_at
           FROM cli_employee_complaint_hr_shares
          WHERE complaint_id=$1 ORDER BY shared_at ASC LIMIT 100`,
        [id],
      );
      await pool.query(
        `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
         VALUES ('client',$1,'employee_complaint_view',$2,'allowed','none')`,
        [session.identityId, id],
      );
      return json(res, 200, {
        complaint: clientProjection(complaint),
        history: history.rows,
        hrShares: hrShares.rows,
        note: "Canal restrito: o RH recebeu somente os campos mínimos listados, cada um com justificativa registrada.",
      });
    } catch (error) {
      console.error("CLI-15 client view failed", error instanceof Error ? error.message : error);
      return json(res, 503, { error: "employee_complaints_unavailable" });
    }
  }

  async function openComplaint(req, res, session) {
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });

    // Somente o conteúdo da reclamação vem do corpo. Identidade, conta (após
    // validação de grant), protocolo, IDs e vínculos são derivados no servidor;
    // campos como created_by_identity, employee_id ou is_shared_with_hr
    // enviados pelo navegador são ignorados.
    const accountId = String(body.client_account_id || "");
    const category = String(body.category || "");
    const severity = String(body.severity || "");
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const rawReference = typeof body.employee_reference === "string" ? body.employee_reference.trim() : "";
    const employeeReference = rawReference.length > 0 ? rawReference : null;
    const isAnonymous = body.is_anonymous === true;
    const key = String(req.headers["idempotency-key"] || "").trim();

    if (!UUID_PATTERN.test(accountId)) return json(res, 400, { error: "invalid_account_id" });
    if (!COMPLAINT_CATEGORIES.includes(category)) return json(res, 400, { error: "invalid_category" });
    if (!COMPLAINT_SEVERITIES.includes(severity)) return json(res, 400, { error: "invalid_severity" });
    if (title.length < 5 || title.length > 200) return json(res, 400, { error: "title_5_200" });
    if (description.length < 20 || description.length > 5000) return json(res, 400, { error: "description_20_5000" });
    if (employeeReference !== null && (employeeReference.length < 3 || employeeReference.length > 200)) {
      return json(res, 400, { error: "employee_reference_3_200" });
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) return json(res, 400, { error: "idempotency_key_required" });

    const fingerprint = requestFingerprint({ accountId, category, severity, title, description, employeeReference, isAnonymous });
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const replay = await client.query(
        `SELECT * FROM cli_employee_complaints WHERE created_by_identity=$1 AND idempotency_key=$2 FOR UPDATE`,
        [session.identityId, key],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_key_reused" });
        }
        await client.query("COMMIT");
        return json(res, 200, { complaint: clientProjection(replay.rows[0]), replayed: true });
      }

      // Grant não revogado e conta ativa revalidados dentro da transação.
      const scoped = await client.query(
        `SELECT 1 FROM client_access_grants grant_row
           JOIN client_accounts account ON account.id = grant_row.client_account_id
          WHERE grant_row.identity_id=$1 AND grant_row.client_account_id=$2
            AND grant_row.revoked_at IS NULL AND account.status='active'`,
        [session.identityId, accountId],
      );
      if (!scoped.rows[0]) {
        await client.query(
          `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
           VALUES ('client',$1,'employee_complaint_open',$2,'denied','authorization_denied')`,
          [session.identityId, accountId],
        );
        await client.query("COMMIT");
        return json(res, 403, { error: "forbidden" });
      }

      const complaintId = randomUUID();
      const protocol = generateProtocol();
      const sharedReason = "Compartilhamento mínimo com RH: somente protocolo, categoria, severidade e situação para triagem da conduta relatada.";
      const created = await client.query(
        `INSERT INTO cli_employee_complaints
           (id, protocol, client_account_id, category, severity, title, description,
            is_anonymous, is_restricted, minimal_share, employee_reference, employee_reference_hash,
            is_shared_with_hr, shared_with_hr_at, shared_with_hr_by_identity, shared_reason,
            created_by_identity, origin, idempotency_key, request_fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,true,$9,$10,true,NOW(),$11,$12,$11,'portal_cliente',$13,$14)
         RETURNING *`,
        [complaintId, protocol, accountId, category, severity, title, description,
          isAnonymous, employeeReference, employeeReference ? hashReference(employeeReference) : null,
          session.identityId, sharedReason, key, fingerprint],
      );

      // Histórico imutável da abertura, na mesma transação.
      await client.query(
        `INSERT INTO cli_employee_complaint_history
           (complaint_id, previous_status, next_status, reason, changed_by_identity, is_hr_share)
         VALUES ($1,NULL,'pendente',$2,$3,false)`,
        [complaintId, "Abertura pelo cliente em canal restrito, autoria derivada da sessão do portal.", session.identityId],
      );

      // Envelope mínimo para o RH, campo a campo e com justificativa; a
      // descrição, a conta e a identidade do cliente ficam fora.
      for (const share of HR_MINIMAL_SHARE_FIELDS) {
        const value = share.field === "protocol" ? protocol
          : share.field === "category" ? category
          : share.field === "severity" ? severity
          : "pendente";
        await client.query(
          `INSERT INTO cli_employee_complaint_hr_shares
             (complaint_id, shared_field, shared_value, shared_by_identity, justification)
           VALUES ($1,$2,$3,$4,$5)`,
          [complaintId, share.field, value, session.identityId, share.justification],
        );
      }
      await client.query(
        `INSERT INTO cli_employee_complaint_history
           (complaint_id, previous_status, next_status, reason, changed_by_identity, is_hr_share)
         VALUES ($1,'pendente','pendente',$2,$3,true)`,
        [complaintId, "Compartilhamento mínimo com RH registrado: protocolo, categoria, severidade e situação, com justificativa por campo.", session.identityId],
      );

      await client.query(
        `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
         VALUES ('client',$1,'employee_complaint_open',$2,'allowed','none')`,
        [session.identityId, complaintId],
      );
      await client.query("COMMIT");
      return json(res, 201, {
        complaint: clientProjection(created.rows[0]),
        hrShares: HR_MINIMAL_SHARE_FIELDS.map(item => ({ shared_field: item.field, justification: item.justification })),
        note: "Reclamação registrada em canal restrito. O RH recebeu somente protocolo, categoria, severidade e situação, com justificativa registrada.",
      });
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      if (error && typeof error === "object" && error.code === "23505") {
        try {
          const replay = await client.query(
            `SELECT * FROM cli_employee_complaints WHERE created_by_identity=$1 AND idempotency_key=$2`,
            [session.identityId, key],
          );
          if (replay.rows[0]?.request_fingerprint === fingerprint) {
            return json(res, 200, { complaint: clientProjection(replay.rows[0]), replayed: true });
          }
          if (replay.rows[0]) return json(res, 409, { error: "idempotency_key_reused" });
        } catch {}
      }
      console.error("CLI-15 client open failed", error instanceof Error ? error.message : error);
      return json(res, 503, { error: "employee_complaint_unavailable" });
    } finally {
      client?.release();
    }
  }

  return { handleComplaints, handleComplaintById };
}
