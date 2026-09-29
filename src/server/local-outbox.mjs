// L02 — Caixa de saída LOCAL (substitui SMTP nesta entrega).
//
// Não é um provedor de e-mail. Nada sai da máquina. O objetivo é fechar as
// jornadas que dependem de comunicação (convite, confirmação, recuperação,
// notificação) sem inventar envio.
//
// Regras que este módulo impõe:
//   * o estado devolvido é "local_outbox", nunca "sent"/"delivered";
//   * o conteúdo é sensível (carrega tokens de uso único), então a leitura é
//     auditada e restrita a papéis administrativos pelo chamador;
//   * a listagem NÃO devolve corpo nem assunto por padrão — só metadados —
//     para que abrir um token seja um ato deliberado e registrado;
//   * mensagem expirada não é legível.

export const LOCAL_OUTBOX_STATUS = "local_outbox";

/**
 * Rótulo honesto para a interface. Usado em respostas de API para impedir que
 * a tela escreva "e-mail enviado".
 */
export const LOCAL_OUTBOX_LABEL = "disponível na caixa local (sem SMTP; não houve envio)";

/** Um endereço só é aceitável como destino local se for plausível. */
export function isDeliverableAddress(value) {
  return typeof value === "string"
    && value.length >= 3 && value.length <= 320
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Decide o destino de uma comunicação.
 * Enquanto não houver SMTP configurado, tudo vai para a caixa local.
 * Se um dia houver, o adapter troca aqui — sem espalhar condicionais.
 */
export function resolveDeliveryTarget(env = process.env) {
  const hasSmtp = Boolean(String(env.MAIL_HOST || "").trim()) && Boolean(String(env.MAIL_FROM || "").trim());
  return hasSmtp ? "smtp" : "local_outbox";
}

export function createLocalOutbox({ getPool, randomUUID }) {
  /**
   * Grava a mensagem. Devolve sempre o estado local_outbox: este módulo não
   * tem como afirmar entrega, e não deve fingir que tem.
   */
  async function deliver({
    recipientKind = "client",
    recipientId = null,
    recipientAddress,
    channel = "email",
    template,
    subject,
    body,
    notificationId = null,
    expiresAt = null,
    isSensitive = true,
  }) {
    if (!isDeliverableAddress(recipientAddress)) throw new Error("invalid_recipient_address");
    if (typeof template !== "string" || !template || template.length > 100) throw new Error("invalid_template");
    if (typeof subject !== "string" || !subject || subject.length > 300) throw new Error("invalid_subject");
    if (typeof body !== "string" || !body || body.length > 20000) throw new Error("invalid_body");

    const db = getPool();
    const id = randomUUID();
    await db.query(
      `INSERT INTO local_outbox_messages
         (id, notification_id, channel, recipient_kind, recipient_id, recipient_address,
          template, subject, body, is_sensitive, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, notificationId, channel, recipientKind, recipientId, recipientAddress,
       template, subject, body, isSensitive, expiresAt],
    );
    await audit(db, { action: "local_outbox_write", target: id, result: "allowed" });
    return { id, status: LOCAL_OUTBOX_STATUS, label: LOCAL_OUTBOX_LABEL };
  }

  /**
   * Metadados apenas. Nunca devolve corpo/assunto: quem lista não precisa ver
   * o token, e listar não pode virar um vazamento em massa.
   */
  async function list({ limit = 50, offset = 0, recipient = null, status = null, actorId = null } = {}) {
    const db = getPool();
    const lim = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 50));
    const off = Math.max(0, Number.parseInt(offset, 10) || 0);
    const filters = [];
    const values = [];
    if (recipient) {
      values.push(String(recipient).slice(0, 320));
      filters.push(`recipient_address = $${values.length}`);
    }
    if (status === "expired") {
      filters.push("expires_at IS NOT NULL AND expires_at <= NOW()");
    } else if (status === "active") {
      filters.push("(expires_at IS NULL OR expires_at > NOW())");
    } else if (status === "unread") {
      filters.push("read_count = 0");
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    values.push(lim, off);
    const { rows } = await db.query(
      `SELECT id, notification_id, channel, recipient_kind, recipient_address, template,
              subject, delivery_mode, is_sensitive, expires_at, created_at,
              first_read_at, read_count,
              (expires_at IS NOT NULL AND expires_at <= NOW()) AS expired
         FROM local_outbox_messages ${where}
        ORDER BY created_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    const { rows: counted } = await db.query(
      `SELECT COUNT(*)::int AS total FROM local_outbox_messages ${where}`,
      values.slice(0, values.length - 2),
    );
    await audit(db, { action: "local_outbox_list", target: `${rows.length}`, actorKind: "staff", actorId, result: "allowed" });
    return {
      messages: rows.map(row => ({ ...row, body: undefined, status: LOCAL_OUTBOX_STATUS })),
      total: counted[0]?.total ?? 0,
      limit: lim,
      offset: off,
      notice: LOCAL_OUTBOX_LABEL,
    };
  }

  /** Abre uma mensagem. Registra a leitura porque o corpo contém token. */
  async function read({ id, actorKind = "staff", actorId = null }) {
    const db = getPool();
    // Primeiro descobre se existe, para separar 404 de 410: uma mensagem
    // vencida existiu e o operador precisa saber disso.
    const { rows: found } = await db.query(
      `SELECT id, (expires_at IS NOT NULL AND expires_at <= NOW()) AS expired
         FROM local_outbox_messages WHERE id = $1`,
      [id],
    );
    if (!found[0]) return null;
    if (found[0].expired) {
      await audit(db, { action: "local_outbox_read", target: id, actorKind, actorId, result: "denied" });
      return { id, expired: true, status: LOCAL_OUTBOX_STATUS };
    }
    const { rows } = await db.query(
      `UPDATE local_outbox_messages
          SET read_count = read_count + 1,
              first_read_at = COALESCE(first_read_at, NOW())
        WHERE id = $1 AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING *`,
      [id],
    );
    const message = rows[0];
    if (!message) return null;
    await audit(db, { action: "local_outbox_read", target: id, actorKind, actorId, result: "allowed" });
    return { ...message, expired: false, status: LOCAL_OUTBOX_STATUS, notice: LOCAL_OUTBOX_LABEL };
  }

  /** Remove mensagens vencidas. Higiene local, não retenção regulatória. */
  async function purgeExpired() {
    const db = getPool();
    const { rowCount } = await db.query(
      "DELETE FROM local_outbox_messages WHERE expires_at IS NOT NULL AND expires_at <= NOW()",
    );
    if (rowCount > 0) await audit(db, { action: "local_outbox_purge", target: String(rowCount), result: "allowed" });
    return rowCount;
  }

  async function audit(db, { action, target, result, actorKind = "system", actorId = null }) {
    try {
      await db.query(
        `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
         VALUES ($1,$2,$3,$4,$5,'none')`,
        [actorKind, actorId, action, target ? String(target).slice(0, 200) : null, result],
      );
    } catch (error) {
      // A auditoria não pode derrubar a entrega local, mas precisa aparecer.
      console.error("local outbox audit failed", error?.message);
    }
  }

  return { deliver, list, read, purgeExpired };
}
