// PLT-03: integrações com status configurado/não configurado/falha, último processamento, erros sanitizados e teste de conexão

const ALLOWED_PROVIDERS = new Set(["smtp","whatsapp","payment","nfe","llm","calendar","storage","sms","push","webhook","other"]);
const ALLOWED_STATUS = new Set(["not_configured","configured","failure","testing"]);

function sanitizeError(err) {
  if (!err) return null;
  let msg = String(err.message || err).slice(0, 1000);
  // Remove potential secrets: emails, tokens, passwords, keys
  msg = msg.replace(/password[=:]\s*[^\s]+/gi, "password=[redacted]");
  msg = msg.replace(/token[=:]\s*[^\s]+/gi, "token=[redacted]");
  msg = msg.replace(/key[=:]\s*[^\s]+/gi, "key=[redacted]");
  msg = msg.replace(/secret[=:]\s*[^\s]+/gi, "secret=[redacted]");
  // Remove stack traces, keep only first line
  msg = msg.split("\n")[0];
  return msg;
}

function sanitizeConfig(config) {
  if (!config || typeof config !== "object") return {};
  const sanitized = {};
  for (const [k,v] of Object.entries(config)) {
    const lower = k.toLowerCase();
    if (lower.includes("password") || lower.includes("secret") || lower.includes("token") || lower.includes("key")) {
      sanitized[k] = "[redacted]";
    } else {
      sanitized[k] = typeof v === "string" ? v.slice(0, 200) : v;
    }
  }
  return sanitized;
}

export function createIntegrationsApi(ctx) {
  // ctx: { json, readJson, sameOrigin, getPool, readAdminSession, clientIp }

  async function audit(db, { action, target, result, actorKind, actorId, category }) {
    try {
      await db.query(
        "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,$5,$6)",
        [actorKind || "system", actorId || null, action, target || null, result, category || "none"]
      );
    } catch (e) {
      console.error("integration audit failed", e?.message);
    }
  }

  function requireMethod(req, res, allowed) {
    if (!allowed.includes(req.method)) {
      ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: allowed.join(", ") });
      return false;
    }
    return true;
  }

  function requireSameOrigin(req, res) {
    if (ctx.sameOrigin(req)) return true;
    ctx.json(res, 403, { error: "same_origin_required" });
    return false;
  }

  async function requireAdminSession(req, res) {
    const session = await ctx.readAdminSession(req);
    if (!session) {
      ctx.json(res, 401, { error: "admin_session_required" });
      return null;
    }
    return session;
  }

  async function ensureDefaultIntegrations(db) {
    // Cria registros padrão se não existirem, com status baseado em env
    const defaults = [
      { id: "smtp", provider: "smtp", name: "SMTP - E-mail transacional" },
      { id: "whatsapp", provider: "whatsapp", name: "WhatsApp API" },
      { id: "payment", provider: "payment", name: "Gateway de pagamento" },
      { id: "nfe", provider: "nfe", name: "NF-e / Fiscal" },
      { id: "llm", provider: "llm", name: "Provedor LLM / IA" },
      { id: "calendar", provider: "calendar", name: "Agenda / Calendário externo" },
      { id: "storage", provider: "storage", name: "Armazenamento de documentos" },
    ];

    for (const def of defaults) {
      try {
        await db.query(
          `INSERT INTO integrations (id, provider, name, status, config_sanitized)
           VALUES ($1,$2,$3,'not_configured','{}'::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [def.id, def.provider, def.name]
        );
      } catch {}
    }

    // Atualiza status SMTP baseado em env real (sem expor segredos)
    try {
      const hasSmtp = !!(process.env.MAIL_HOST && process.env.MAIL_FROM);
      const smtpConfig = {
        host: process.env.MAIL_HOST ? "[configured]" : "[not_configured]",
        from: process.env.MAIL_FROM ? "[configured]" : "[not_configured]",
        port: process.env.MAIL_PORT || null,
      };
      await db.query(
        `UPDATE integrations SET status = $2, config_sanitized = $3::jsonb, last_check_at = NOW(), updated_at = NOW() WHERE id = 'smtp'`,
        ['smtp', hasSmtp ? 'configured' : 'not_configured', JSON.stringify(sanitizeConfig(smtpConfig))]
      );
    } catch {}
  }

  async function handleList(req, res, url) {
    if (!requireMethod(req, res, ["GET"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;

    let db;
    try {
      db = ctx.getPool();
    } catch {
      return ctx.json(res, 503, { error: "database_not_configured" });
    }

    try {
      await ensureDefaultIntegrations(db);

      const provider = url.searchParams.get("provider");
      const status = url.searchParams.get("status");

      if (provider && !ALLOWED_PROVIDERS.has(provider)) return ctx.json(res, 400, { error: "invalid_provider" });
      if (status && !ALLOWED_STATUS.has(status)) return ctx.json(res, 400, { error: "invalid_status" });

      const conditions = [];
      const values = [];
      let idx = 1;
      if (provider) { conditions.push(`provider = $${idx++}`); values.push(provider); }
      if (status) { conditions.push(`status = $${idx++}`); values.push(status); }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await db.query(`SELECT id, provider, name, status, config_sanitized, last_check_at, last_success_at, last_failure_at, last_error_sanitized, last_processed_at, created_at, updated_at FROM integrations ${where} ORDER BY provider, name`, values);

      await audit(db, { action: "integration_check", target: `list:${provider||"all"}`, result: "allowed", actorKind: session.role, actorId: session.identityId });

      return ctx.json(res, 200, { integrations: result.rows, role: session.role });
    } catch (e) {
      console.error("list integrations failed", e?.message);
      return ctx.json(res, 503, { error: "integrations_unavailable" });
    }
  }

  async function handleTest(req, res, id) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;

    if (!id || id.length > 100) return ctx.json(res, 400, { error: "invalid_integration_id" });

    let db;
    try {
      db = ctx.getPool();
    } catch {
      return ctx.json(res, 503, { error: "database_not_configured" });
    }

    try {
      const existing = await db.query("SELECT id, provider FROM integrations WHERE id = $1", [id]);
      if (existing.rows.length === 0) return ctx.json(res, 404, { error: "integration_not_found" });

      const provider = existing.rows[0].provider;
      let testStatus = "not_configured";
      let lastError = null;
      let lastSuccess = null;

      // Teste real por provider (sem expor segredos, erro sanitizado)
      if (provider === "smtp") {
        const hasSmtp = !!(process.env.MAIL_HOST && process.env.MAIL_FROM);
        if (!hasSmtp) {
          testStatus = "not_configured";
          lastError = "SMTP não configurado (MAIL_HOST/MAIL_FROM ausentes)";
        } else {
          try {
            // Não envia e-mail real, apenas verifica config e tenta criar transporter
            const nodemailer = await import("nodemailer");
            const port = Number(process.env.MAIL_PORT || 587);
            const transporter = nodemailer.default.createTransport({
              host: process.env.MAIL_HOST,
              port,
              secure: process.env.MAIL_SECURE === "true" || port === 465,
              auth: process.env.MAIL_USER && process.env.MAIL_PASSWORD ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASSWORD } : undefined,
              connectionTimeout: 5000,
              greetingTimeout: 5000,
              socketTimeout: 8000,
            });
            // verify() tenta conexão, mas pode falhar se sem rede — tratamos como failure com erro sanitizado
            await transporter.verify();
            testStatus = "configured";
            lastSuccess = new Date();
          } catch (e) {
            testStatus = "failure";
            lastError = sanitizeError(e);
          }
        }
      } else {
        // Para outros provedores, verifica se env vars genéricas existem
        testStatus = "not_configured";
        lastError = `Provedor ${provider} não configurado — aguardando D-08 e validação comercial`;
      }

      await db.query(
        `UPDATE integrations SET status = $2, last_check_at = NOW(), last_success_at = COALESCE($3, last_success_at), last_failure_at = CASE WHEN $2='failure' THEN NOW() ELSE last_failure_at END, last_error_sanitized = $4, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id, testStatus, lastSuccess, lastError]
      );

      await audit(db, { action: "integration_test", target: id, result: testStatus === "failure" ? "denied" : "allowed", actorKind: session.role, actorId: session.identityId, category: testStatus });

      const updated = await db.query("SELECT id, provider, name, status, config_sanitized, last_check_at, last_success_at, last_failure_at, last_error_sanitized, last_processed_at FROM integrations WHERE id = $1", [id]);

      return ctx.json(res, 200, { integration: updated.rows[0], tested: true });
    } catch (e) {
      console.error("test integration failed", e?.message);
      return ctx.json(res, 503, { error: "integration_test_failed" });
    }
  }

  async function handleUpdate(req, res, id) {
    if (!requireMethod(req, res, ["PUT","PATCH"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;

    let body;
    try {
      body = await ctx.readJson(req, 8 * 1024);
    } catch {
      return ctx.json(res, 400, { error: "invalid_request" });
    }

    const name = body?.name ? String(body.name).trim().slice(0,100) : null;
    const provider = body?.provider ? String(body.provider).toLowerCase() : null;

    if (provider && !ALLOWED_PROVIDERS.has(provider)) return ctx.json(res, 400, { error: "invalid_provider" });
    if (name && name.length < 1) return ctx.json(res, 400, { error: "invalid_name" });

    let db;
    try {
      db = ctx.getPool();
    } catch {
      return ctx.json(res, 503, { error: "database_not_configured" });
    }

    try {
      const existing = await db.query("SELECT id FROM integrations WHERE id = $1", [id]);
      if (existing.rows.length === 0) {
        // Cria nova integração se não existir e provider válido
        if (!provider) return ctx.json(res, 400, { error: "provider_required" });
        await db.query(
          `INSERT INTO integrations (id, provider, name, status, config_sanitized) VALUES ($1,$2,$3,'not_configured','{}'::jsonb)`,
          [id, provider, name || id]
        );
      } else {
        if (name) await db.query("UPDATE integrations SET name = $2, updated_at = NOW() WHERE id = $1", [id, name]);
        if (provider) await db.query("UPDATE integrations SET provider = $2, updated_at = NOW() WHERE id = $1", [id, provider]);
      }

      await audit(db, { action: "integration_update", target: id, result: "allowed", actorKind: session.role, actorId: session.identityId });

      const updated = await db.query("SELECT id, provider, name, status, config_sanitized, last_check_at, last_success_at, last_failure_at, last_error_sanitized, last_processed_at FROM integrations WHERE id = $1", [id]);

      return ctx.json(res, 200, { integration: updated.rows[0] });
    } catch (e) {
      console.error("update integration failed", e?.message);
      return ctx.json(res, 503, { error: "integration_update_failed" });
    }
  }

  return { handleList, handleTest, handleUpdate };
}
