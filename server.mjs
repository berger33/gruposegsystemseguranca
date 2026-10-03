// Delivery verification rerun: preserve real HTTP and Chromium gates.
import { createCrmTaskApi } from "./src/server/crm-task-api.mjs";
import { createCrmInteractionApi } from "./src/server/crm-interaction-api.mjs";
import { createCrmVisitApi } from "./src/server/crm-visit-api.mjs";
import { createCrmCadenceApi } from "./src/server/crm-cadence-api.mjs";
import { createCrmNoteApi } from "./src/server/crm-note-api.mjs";
import { createHmac, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import nextEnv from "@next/env";
import next from "next";
import pg from "pg";
import nodemailer from "nodemailer";
import { validateLeadInput } from "./src/lib/public-lead-validation.mjs";
import { decryptMfaSecret, verifyMfaCode, hashRecoveryCode, mfaKey } from "./src/lib/client-mfa.mjs";
import {
  createStaffSessionStore, evaluateStaffLogin, evaluateLegacyTokenPolicy, isUuid,
} from "./src/server/staff-session.mjs";
import { createEmployeeSessionStore } from "./src/server/employee-session.mjs";
import { createEmployeeApi } from "./src/server/employee-api.mjs";
import { hasPermission } from "./src/server/rbac.mjs";
import { createLocalOutbox, LOCAL_OUTBOX_LABEL, resolveDeliveryTarget } from "./src/server/local-outbox.mjs";
import { createClientAccessApi } from "./src/server/client-access-api.mjs";
import { createClientSpaceApi } from "./src/server/client-space-api.mjs";
import { createClientSecurityApi } from "./src/server/client-security-api.mjs";
import { createAdminRbacApi } from "./src/server/admin-rbac-api.mjs";
import { createAdminAuditApi } from "./src/server/admin-audit-api.mjs";
import { createNotificationQueue } from "./src/server/notification-queue.mjs";
import { createAdminNotificationsApi } from "./src/server/admin-notifications-api.mjs";
import { createIntegrationsApi } from "./src/server/integrations-api.mjs";
import { createServiceCatalogApi } from "./src/server/service-catalog-api.mjs";
import { createFaqApi } from "./src/server/faq-api.mjs";
import { createCrmApi } from "./src/server/crm-api.mjs";
import { createEquipmentApi } from "./src/server/equipment-api.mjs";
import { createInspectionApi } from "./src/server/inspection-api.mjs";
import { createLaborBudgetApi } from "./src/server/labor-budget-api.mjs";
import { createTechnicalBudgetApi } from "./src/server/technical-budget-api.mjs";
import { createCostParameterApi } from "./src/server/cost-parameter-api.mjs";
import { createPriceScenarioApi } from "./src/server/price-scenario-api.mjs";
import { createDiscountApi } from "./src/server/discount-api.mjs";
import { createProposalApi } from "./src/server/proposal-api.mjs";
import { createProposalDeliveryApi } from "./src/server/proposal-delivery-api.mjs";
import { createProposalAcceptanceApi } from "./src/server/proposal-acceptance-api.mjs";
import { createContractApi } from "./src/server/contract-api.mjs";
import { createContractDetailsApi } from "./src/server/contract-details-api.mjs";
import { createContractStatusApi } from "./src/server/contract-status-api.mjs";
import { createContractAmendmentApi } from "./src/server/contract-amendment-api.mjs";
import { createContractAlertApi } from "./src/server/contract-alert-api.mjs";
import { createContractDocObligationApi } from "./src/server/contract-doc-obligation-api.mjs";
import { createContractImplantationApi } from "./src/server/contract-implantation-api.mjs";
import { createContractClosureApi } from "./src/server/contract-closure-api.mjs";
import { createContractFiscalApi } from "./src/server/contract-fiscal-api.mjs";
import { createContractManagementDiaryApi } from "./src/server/contract-management-diary-api.mjs";
import { createContractL05Api } from "./src/server/contract-l05-api.mjs";
import { createNotificationPreferencesApi } from "./src/server/notification-preferences-api.mjs";
import { createObservability } from "./src/server/observability.mjs";
import { createObservabilityApi } from "./src/server/observability-api.mjs";
import { createHealthcheckApi } from "./src/server/healthcheck-api.mjs";
import { createBackupApi } from "./src/server/backup-api.mjs";
import { createPrivacyApi } from "./src/server/privacy-api.mjs";
import { createLgpdRequestApi } from "./src/server/lgpd-request-api.mjs";
import { createRetentionApi } from "./src/server/retention-api.mjs";
import { createIncidentApi } from "./src/server/incident-api.mjs";
import { createConfigApi } from "./src/server/config-api.mjs";
import { createDependencyApi } from "./src/server/dependency-api.mjs";
import { createIntegrationLogApi } from "./src/server/integration-log-api.mjs";
import { createBudgetApi } from "./src/server/budget-api.mjs";
import { createEnvApi } from "./src/server/env-api.mjs";
import { createMaintenanceDocApi } from "./src/server/maintenance-doc-api.mjs";
import { createHrApi } from "./src/server/hr-api.mjs";
import { createEmpProfileApi } from "./src/server/emp-profile-api.mjs";
import { createHrRecruitmentApi } from "./src/server/hr-recruitment-api.mjs";
import { createHrTerminationApi } from "./src/server/hr-termination-api.mjs";
import { createHrAbsenceApi } from "./src/server/hr-absence-api.mjs";
import { createHrBenefitsApi } from "./src/server/hr-benefits-api.mjs";
import { createHrTrainingApi } from "./src/server/hr-training-api.mjs";
import { createHrAdvancedApi } from "./src/server/hr-advanced-api.mjs";
import { createEmpPortalApi } from "./src/server/emp-portal-api.mjs";
import { createEmpOpsApi } from "./src/server/emp-ops-api.mjs";
import { createEmpSelfApi } from "./src/server/emp-self-api.mjs";
import { createEmpAdvanced2Api } from "./src/server/emp-advanced2-api.mjs";
import { createEmpPwaApi } from "./src/server/emp-pwa-api.mjs";
import { createOpsApi } from "./src/server/ops-api.mjs";
import { createOpsAdvancedApi } from "./src/server/ops-advanced-api.mjs";
import { createOpsAdvanced2Api } from "./src/server/ops-advanced2-api.mjs";
import { createOpsAdvanced3Api } from "./src/server/ops-advanced3-api.mjs";
import { createCliApi } from "./src/server/cli-api.mjs";
import { createCliAdvancedApi } from "./src/server/cli-advanced-api.mjs";
import { createCliFinanceApi } from "./src/server/cli-finance-api.mjs";
import { createFinApi } from "./src/server/fin-api.mjs";
import { createFinAdvancedApi } from "./src/server/fin-advanced-api.mjs";
import { createFinManagementApi } from "./src/server/fin-management-api.mjs";
import { createFinBudgetApi } from "./src/server/fin-budget-api.mjs";
import { createAdmApi } from "./src/server/adm-api.mjs";
import { createAdmAdvancedApi } from "./src/server/adm-advanced-api.mjs";
// ADM-01..12: painel funcional do Marcelo. Rotas canônicas /api/adm/panel/*,
// fora dos aliases históricos de RH, com auditoria fail-closed.
import { createAdmPanelApi } from "./src/server/adm-panel-api.mjs";
import { createAstApi } from "./src/server/ast-api.mjs";
import { createAstAdvancedApi } from "./src/server/ast-advanced-api.mjs";
import { createExtApi } from "./src/server/ext-api.mjs";
import { createExtFleetApi } from "./src/server/ext-fleet-api.mjs";
import { createExtThirdPartyApi } from "./src/server/ext-third-party-api.mjs";
import { createExtBiddingApi } from "./src/server/ext-bidding-api.mjs";
import { createExtSupplierApi } from "./src/server/ext-supplier-api.mjs";
import { createExtAdvancedApi } from "./src/server/ext-advanced-api.mjs";
import { createExtReportingApi } from "./src/server/ext-reporting-api.mjs";
import { createCommercialHistoryApi } from "./src/server/commercial-history-api.mjs";
import { createPortfolioApi } from "./src/server/portfolio-api.mjs";
import { createFaqAnswerApi } from "./src/server/faq-answer-api.mjs";
import { createCmsApi } from "./src/server/cms-api.mjs";
import { createThemeApi } from "./src/server/theme-api.mjs";
import { createSeoApi } from "./src/server/seo-api.mjs";
// PUB-08: robots/sitemap derivados do código e redirects que de fato
// redirecionam. Política em docs/PROMPT-CONTINUACAO-PUB08-SEO-TECNICO.md.
import { createSeoTechnicalApi } from "./src/server/seo-technical-api.mjs";
import { createPackageApi } from "./src/server/package-api.mjs";
import { createOriginMetricsApi } from "./src/server/origin-metrics-api.mjs";
import { createEmployeeComplaintApi } from "./src/server/employee-complaint-api.mjs";
import { createClientEmployeeComplaintApi } from "./src/server/client-employee-complaint-api.mjs";
import { createPubFaqAssistedApi } from "./src/server/pub-faq-assisted-api.mjs";
import { createAiRagApi } from "./src/server/ai-rag-api.mjs";
import { createReportApi } from "./src/server/report-api.mjs";
import { createCommissionApi } from "./src/server/commission-api.mjs";
import { createCommercialApi } from "./src/server/commercial-api.mjs";
import { createPartnershipApi } from "./src/server/partnership-api.mjs";
import { normalizeEmail, verifyPassword } from "./src/lib/client-auth-core.mjs";

const { loadEnvConfig } = nextEnv;
const { Pool } = pg;
loadEnvConfig(process.cwd());
const DEFAULT_VISUAL = "06";
const VISUAL_IDS = new Set(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]);
const SESSION_COOKIE = "seg_admin_session";
const EMPLOYEE_SESSION_COOKIE = "seg_employee_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_BODY_BYTES = 8 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
// Configurável para permitir suítes de integração que fazem muitos logins.
// O padrão de produção continua 8 por IP a cada 15 minutos.
const LOGIN_MAX_ATTEMPTS = Math.max(1, Number(process.env.ADMIN_LOGIN_MAX_ATTEMPTS || 8));
const LEAD_WINDOW_MS = 10 * 60 * 1000;
// Antispam de PUB-03: 5 envios por IP a cada 10 minutos. O teto é
// configurável apenas por variável de ambiente do próprio servidor (mesmo
// padrão de ADMIN_LOGIN_MAX_ATTEMPTS), para que o gate consiga exercitar
// várias jornadas públicas na mesma execução sem afrouxar o padrão de
// produção; valor inválido cai no padrão seguro.
const LEAD_MAX_ATTEMPTS = (() => {
  const configured = Number(process.env.LEAD_MAX_ATTEMPTS);
  return Number.isSafeInteger(configured) && configured >= 1 && configured <= 1000 ? configured : 5;
})();
const loginAttempts = new Map();
const employeeLoginAttempts = new Map();
const leadAttempts = new Map();
const leadStatuses = new Set(["new", "contacted", "closed", "solicitada", "em_agendamento", "confirmada", "realizada", "cancelada"]);
let pool;
let observabilityInstance;

const dev = process.argv.includes("--dev");
if (!dev && !process.env.NODE_ENV) process.env.NODE_ENV = "production";
const hostname = process.env.BIND_HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

let pglitePoolPromise = null;

async function getPGlitePoolLazy() {
  if (!pglitePoolPromise) {
    pglitePoolPromise = import('./src/server/pglite-pool.mjs').then(async (mod) => {
      const p = await mod.getPGlitePool();
      console.log('[DB] Using PGlite beta (schema mínimo; não equivale às migrações PostgreSQL 001–096)');
      return p;
    });
  }
  return pglitePoolPromise;
}

function getPool() {
  // BETA 1-clique: sem DATABASE_URL usa PGlite; QA_PGLITE_ONLY evita atingir banco externo por engano.
  if (process.env.QA_PGLITE_ONLY === 'true' || !process.env.DATABASE_URL) {
    if (!pool) {
      pool = {
        __isPGliteProxy: true,
        async query(text, params) {
          const real = await getPGlitePoolLazy();
          return real.query(text, params);
        },
        async connect() {
          const real = await getPGlitePoolLazy();
          return real.connect();
        }
      };
      try {
        if (observabilityInstance && observabilityInstance.wrapPool) observabilityInstance.wrapPool(pool);
      } catch {}
    }
    return pool;
  }
  if (!pool || pool.__isPGliteProxy) {
    // Se antes era PGlite proxy e agora tem DATABASE_URL, troca para pg
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_SIZE || 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "grupo-seg-system-site",
    });
    try {
      if (observabilityInstance && observabilityInstance.wrapPool) observabilityInstance.wrapPool(pool);
    } catch {}
  }
  try {
    if (observabilityInstance && observabilityInstance.wrapPool && !pool.__observabilityWrapped) observabilityInstance.wrapPool(pool);
  } catch {}
  return pool;
}

function getObservability() {
  if (!observabilityInstance) {
    observabilityInstance = createObservability({ getPool });
  }
  return observabilityInstance;
}

function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...extraHeaders,
  });
  res.end(body);
}

async function readJson(req, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function sameOrigin(req) {
  // Browsers do not consistently send Origin on safe same-origin GET/HEAD
  // fetches. CSRF validation is required on state-changing methods; reads are
  // still protected by the HttpOnly/SameSite session and server-side RBAC.
  if (["GET", "HEAD", "OPTIONS"].includes(req.method || "GET")) return true;
  const origin = req.headers.origin;
  const forwardedHost = process.env.TRUST_PROXY === "true" ? req.headers["x-forwarded-host"] : undefined;
  const expectedHost = String(forwardedHost || req.headers.host || "").split(",")[0].trim().toLowerCase();
  if (!origin || !expectedHost) return false;
  try {
    return new URL(origin).host.toLowerCase() === expectedHost;
  } catch {
    return false;
  }
}

function constantTimeTextMatch(received, expected) {
  if (!received || !expected) return false;
  const receivedDigest = createHash("sha256").update(String(received)).digest();
  const expectedDigest = createHash("sha256").update(String(expected)).digest();
  return timingSafeEqual(receivedDigest, expectedDigest);
}

function sessionSecret() {
  const value = process.env.SITE_ADMIN_SESSION_SECRET || "";
  return value.length >= 32 ? value : null;
}

function employeeSessionSecret() {
  const value = process.env.EMPLOYEE_SESSION_SECRET || "";
  return value.length >= 32 ? value : null;
}

function sign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

const staffSessionStore = createStaffSessionStore({ getPool, randomUUID });
const employeeSessionStore = createEmployeeSessionStore({ getPool, randomUUID });
// L02 — caixa de saída local; substitui SMTP nesta entrega.
const localOutbox = createLocalOutbox({ getPool, randomUUID });

// L01/SEC-04: a sessão de staff passa a ter estado no servidor. O cookie carrega
// apenas um identificador assinado; papel, status, epoch e revogação vêm do
// banco a cada requisição. Assinatura válida NÃO é mais suficiente.
async function createStaffSessionCookie({ identityId, role, epoch, mfaVerified, req }) {
  const secret = sessionSecret();
  if (!secret) throw new Error("SESSION_SECRET_NOT_CONFIGURED");
  const created = await staffSessionStore.create({
    identityId, role, epoch, mfaVerified,
    ipHash: createHash("sha256").update(clientIp(req)).digest("hex").slice(0, 32),
    userAgent: req.headers["user-agent"],
  });
  const payload = Buffer.from(JSON.stringify({ sid: created.id, exp: created.expiresAt })).toString("base64url");
  return { value: `${payload}.${sign(payload, secret)}`, expiresAt: created.expiresAt, ttlSeconds: created.ttlSeconds };
}

// Extrai e confere apenas a assinatura/expiração do cookie. Barato e sem banco;
// é um pré-filtro, nunca a decisão final.
function readSessionEnvelope(req) {
  const secret = sessionSecret();
  if (!secret) return null;
  const cookieHeader = String(req.headers.cookie || "");
  const cookie = cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return null;
  const value = cookie.slice(SESSION_COOKIE.length + 1);
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  if (!constantTimeTextMatch(signature, sign(payload, secret))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isFinite(parsed.exp) || parsed.exp <= Date.now()) return null;
    if (!isUuid(parsed.sid)) return null;
    return { sid: parsed.sid, exp: parsed.exp };
  } catch {
    return null;
  }
}

/**
 * Decisão autoritativa de sessão administrativa.
 * Fail-closed: erro de banco nega em vez de preservar acesso (SEC-02).
 */
async function readSession(req) {
  const envelope = readSessionEnvelope(req);
  if (!envelope) return null;
  let verdict;
  try {
    verdict = await staffSessionStore.validate(envelope.sid);
  } catch (error) {
    // Indisponibilidade do banco NÃO concede sessão administrativa.
    console.error("Staff session validation failed.", error?.message);
    return null;
  }
  if (!verdict.valid) return null;
  let permissions = [];
  try {
    const result = await getPool().query(
      `SELECT permission, scope_type, scope_id
         FROM auth_permissions
        WHERE identity_id = $1 AND revoked_at IS NULL`,
      [verdict.identityId],
    );
    permissions = result.rows;
  } catch (error) {
    // A lista vazia preserva negação por padrão se o diretório estiver indisponível.
    console.error("Staff permission lookup failed.", error?.message);
  }
  return {
    role: verdict.role,
    identityId: verdict.identityId,
    sessionId: verdict.sessionId,
    mfaVerified: Boolean(verdict.mfaVerifiedAt),
    expiresAt: verdict.expiresAt,
    permissions,
  };
}

function readEmployeeSessionEnvelope(req) {
  const secret = employeeSessionSecret();
  if (!secret) return null;
  const cookieHeader = String(req.headers.cookie || "");
  const cookie = cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith(`${EMPLOYEE_SESSION_COOKIE}=`));
  if (!cookie) return null;
  const value = cookie.slice(EMPLOYEE_SESSION_COOKIE.length + 1);
  const [payload, signature] = value.split(".");
  if (!payload || !signature || !constantTimeTextMatch(signature, sign(payload, secret))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isFinite(parsed.exp) || parsed.exp <= Date.now() || !isUuid(parsed.sid)) return null;
    return { sid: parsed.sid, exp: parsed.exp };
  } catch { return null; }
}

async function issueEmployeeSession({ identityId, employeeId, epoch, req }) {
  const secret = employeeSessionSecret();
  if (!secret) throw new Error("EMPLOYEE_SESSION_SECRET_NOT_CONFIGURED");
  const created = await employeeSessionStore.create({
    identityId, employeeId, epoch,
    ipHash: createHash("sha256").update(clientIp(req)).digest("hex").slice(0, 32),
    userAgent: req.headers["user-agent"],
  });
  const payload = Buffer.from(JSON.stringify({ sid: created.id, exp: created.expiresAt })).toString("base64url");
  return { value: `${payload}.${sign(payload, secret)}`, expiresAt: created.expiresAt, ttlSeconds: created.ttlSeconds };
}

async function readEmployeeSession(req) {
  const envelope = readEmployeeSessionEnvelope(req);
  if (!envelope) return null;
  try {
    const verdict = await employeeSessionStore.validate(envelope.sid);
    if (!verdict.valid) return null;
    employeeSessionStore.touch(envelope.sid).catch(() => {});
    return verdict;
  } catch (error) {
    console.error("Employee session validation failed.", error?.message);
    return null;
  }
}

function cookieSecure(req) {
  const forwardedProto = process.env.TRUST_PROXY === "true"
    ? String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase()
    : "";
  return process.env.NODE_ENV === "production" || forwardedProto === "https";
}

function sessionCookie(req, value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cookieSecure(req) ? "; Secure" : ""}`;
}

function employeeCookie(req, value, maxAge) {
  return `${EMPLOYEE_SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cookieSecure(req) ? "; Secure" : ""}`;
}

function clientIp(req) {
  const forwardedFor = process.env.TRUST_PROXY === "true" ? req.headers["x-forwarded-for"] : undefined;
  return String(forwardedFor || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}

function rateLimitAllows(bucket, req, windowMs, maxAttempts) {
  const ip = clientIp(req);
  const now = Date.now();
  const current = (bucket.get(ip) || []).filter(timestamp => now - timestamp < windowMs);
  if (current.length >= maxAttempts) {
    bucket.set(ip, current);
    return false;
  }
  current.push(now);
  bucket.set(ip, current);
  return true;
}

async function sendLeadEmail(lead, leadId) {
  const { MAIL_HOST, MAIL_FROM, LEADS_NOTIFY_EMAIL } = process.env;
  if (!MAIL_HOST || !MAIL_FROM || !LEADS_NOTIFY_EMAIL) return "not_configured";
  const port = Number(process.env.MAIL_PORT || 587);
  const auth = process.env.MAIL_USER && process.env.MAIL_PASSWORD
    ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASSWORD }
    : undefined;
  const transporter = nodemailer.createTransport({
    host: MAIL_HOST,
    port,
    secure: process.env.MAIL_SECURE === "true" || port === 465,
    auth,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
  });
  const label = lead.requestKind === "visit" ? "Visita técnica solicitada" : "Pedido de orçamento";
  const lines = [
    label,
    `Referência: ${leadId}`,
    `Nome: ${lead.name}`,
    `Telefone: ${lead.phone}`,
    `Cidade/bairro: ${lead.city}`,
    `Tipo de local: ${lead.propertyType}`,
    `Serviços de interesse: ${lead.services.length ? lead.services.join(", ") : "Gostaria de orientação"}`,
    ...(lead.visitPreference ? [`Preferência de visita: ${lead.visitPreference}`] : []),
    `Detalhes: ${lead.details || "Não informado"}`,
  ];
  await transporter.sendMail({
    from: MAIL_FROM,
    to: LEADS_NOTIFY_EMAIL,
    subject: `${label} — ${leadId.slice(0, 8)}`,
    text: lines.join("\n"),
  });
  return "sent";
}

async function handleCreateLead(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" }, { Allow: "POST" });
  if (!sameOrigin(req)) return json(res, 403, { error: "same_origin_required" });
  if (!rateLimitAllows(leadAttempts, req, LEAD_WINDOW_MS, LEAD_MAX_ATTEMPTS)) {
    return json(res, 429, { error: "too_many_requests" }, { "Retry-After": "600" });
  }
  let body;
  try {
    body = await readJson(req);
  } catch {
    return json(res, 400, { error: "invalid_request" });
  }
  if (typeof body?.website === "string" && body.website.trim()) return json(res, 202, { accepted: true, spamIgnored: true });
  const validated = validateLeadInput(body);
  if (validated.error) return json(res, 400, { error: validated.error });
  const lead = validated.value;
  const id = randomUUID();
  let database;
  try {
    database = getPool();
    // PUB-03: deduplicação controlada — a chave nunca vem do navegador (um
    // cliente malicioso poderia forjar a de outra pessoa para bloqueá-la ou
    // "roubar" um protocolo existente). O servidor deriva a chave do próprio
    // pedido dentro de uma janela curta, para que um refresh/duplo clique não
    // crie um segundo lead, sem impedir um pedido novo e legítimo depois.
    const DEDUP_WINDOW_MS = 30 * 60 * 1000;
    const dedupBucket = Math.floor(Date.now() / DEDUP_WINDOW_MS);
    const phoneDigits = lead.phone.replace(/\D/g, "");
    const dedupKey = createHash("sha256")
      .update([lead.requestKind, phoneDigits, lead.city.toLowerCase(), [...lead.services].sort().join(","), dedupBucket].join("|"))
      .digest("hex");
    const existing = await database.query("SELECT id, status FROM public_leads WHERE dedup_key = $1", [dedupKey]);
    if (existing.rows[0]) {
      return json(res, 200, { leadId: existing.rows[0].id, emailStatus: "dedup", recorded: true, dedup: true, status: existing.rows[0].status });
    }

    const ipHash = createHash("sha256").update(clientIp(req)).digest("hex");
    const userAgent = String(req.headers["user-agent"] || "").slice(0,200);

    await database.query(
      `INSERT INTO public_leads
        (id, request_kind, name, phone, city, property_type, services, visit_preference, details, consented_at, origin, campaign, email, channel, dedup_key, consent_version, ip_hash, user_agent, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10,$11,$12,$13,$14,'v1',$15,$16,'solicitada')`,
      [id, lead.requestKind, lead.name, lead.phone, lead.city, lead.propertyType, lead.services, lead.visitPreference, lead.details, lead.origin, lead.campaign, lead.email, lead.channel, dedupKey, ipHash, userAgent],
    );

    // Auditar criação de lead (PUB-03)
    try {
      await database.query(
        "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ('system', $1, 'lead_create', $2, 'allowed', 'none')",
        [ipHash.slice(0,16), id]
      );
    } catch {}
  } catch (error) {
    const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
    const migrationMissing = error && typeof error === "object" && error.code === "42P01";
    if (!unconfigured) console.error("Could not record the public lead.", error);
    return json(res, 503, { error: unconfigured ? "database_not_configured" : migrationMissing ? "migration_required" : "lead_storage_unavailable" });
  }

  let emailStatus = "not_configured";
  try {
    emailStatus = await sendLeadEmail(lead, id);
  } catch (error) {
    emailStatus = "failed";
    console.error("Lead notification email failed.", { leadId: id, message: error instanceof Error ? error.message : "unknown" });
  }
  if (emailStatus !== "not_configured") {
    await database.query("UPDATE public_leads SET email_status = $2, updated_at = NOW() WHERE id = $1", [id, emailStatus]).catch(error => {
      console.error("Could not update lead notification status.", { leadId: id, message: error instanceof Error ? error.message : "unknown" });
    });
  }
  return json(res, 201, { leadId: id, emailStatus, recorded: true });
}

// PUB-10: mensuração de origem e conversão. Painel DERIVADO e somente
// leitura — todo número vem de COUNT sobre registros que o sistema já grava
// (public_leads + crm_opportunities). Não existe escrita de métrica: um
// número de conversão digitado à mão não é mensuração, é invenção com cara
// de relatório. Política completa em
// docs/PROMPT-CONTINUACAO-PUB10-METRICAS-ORIGEM.md.
const LEAD_METRICS_MAX_WINDOW_DAYS = 366;
const LEAD_METRICS_DEFAULT_WINDOW_DAYS = 90;
const LEAD_METRICS_UNKNOWN_LABEL = "(não informado)";

function parseLeadMetricsDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Rejeita datas que o Date "conserta" sozinho (ex.: 2026-02-31 → 03-03).
  if (parsed.toISOString().slice(0, 10) !== value) return null;
  return parsed;
}

function leadMetricsRate(numerator, denominator) {
  // Denominador zero devolve null, nunca 0: "não há base para calcular" é
  // diferente de "a taxa é zero".
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 10000) / 100;
}

async function handleAdminLeadMetrics(req, res, url) {
  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "admin_session_required" });
  if (!['marcelo', 'ti', 'comercial', 'admin'].includes(session.role)) return json(res, 403, { error: "forbidden" });
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });

  const DAY_MS = 24 * 60 * 60 * 1000;
  const rawFrom = url.searchParams.get("from");
  const rawTo = url.searchParams.get("to");
  const todayUtc = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const to = rawTo === null ? todayUtc : parseLeadMetricsDay(rawTo);
  const from = rawFrom === null ? new Date(todayUtc.getTime() - (LEAD_METRICS_DEFAULT_WINDOW_DAYS - 1) * DAY_MS) : parseLeadMetricsDay(rawFrom);
  if (!from || !to) return json(res, 400, { error: "invalid_period" });
  if (from.getTime() > to.getTime()) return json(res, 400, { error: "invalid_period" });
  const windowDays = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (windowDays > LEAD_METRICS_MAX_WINDOW_DAYS) return json(res, 400, { error: "period_too_long" });
  // `to` é inclusivo: o corte real é o início do dia seguinte.
  const toExclusive = new Date(to.getTime() + DAY_MS);

  try {
    const result = await getPool().query(
      `WITH janela AS (
         SELECT l.id,
                COALESCE(NULLIF(btrim(l.origin), ''), $3) AS origem,
                COALESCE(NULLIF(btrim(l.campaign), ''), $3) AS campanha,
                COALESCE(NULLIF(btrim(l.channel), ''), $3) AS canal,
                l.status
           FROM public_leads l
          WHERE l.created_at >= $1 AND l.created_at < $2
       ),
       vinculo AS (
         SELECT j.id,
                j.origem, j.campanha, j.canal, j.status,
                EXISTS (SELECT 1 FROM crm_opportunities o WHERE o.public_lead_id = j.id) AS convertido,
                EXISTS (SELECT 1 FROM crm_opportunities o WHERE o.public_lead_id = j.id AND o.stage = 'ganho') AS ganho
           FROM janela j
       )
       SELECT origem, campanha, canal,
              COUNT(*)::int AS leads,
              COUNT(*) FILTER (WHERE status IN ('confirmada','realizada'))::int AS visitas_confirmadas,
              COUNT(*) FILTER (WHERE convertido)::int AS convertidos,
              COUNT(*) FILTER (WHERE ganho)::int AS ganhos
         FROM vinculo
        GROUP BY origem, campanha, canal
        ORDER BY leads DESC, origem ASC, campanha ASC, canal ASC`,
      [from.toISOString(), toExclusive.toISOString(), LEAD_METRICS_UNKNOWN_LABEL],
    );

    // Somente rótulos e inteiros saem daqui. Nenhuma coluna por-lead
    // (id, nome, telefone, e-mail, ip_hash, user_agent, dedup_key) é
    // projetada em nenhum ponto — e não há parâmetro que faça isso mudar.
    const rows = result.rows.map(row => ({
      origin: row.origem,
      campaign: row.campanha,
      channel: row.canal,
      leads: row.leads,
      visitsConfirmed: row.visitas_confirmadas,
      converted: row.convertidos,
      won: row.ganhos,
      conversionRate: leadMetricsRate(row.convertidos, row.leads),
      winRate: leadMetricsRate(row.ganhos, row.leads),
    }));
    const totals = rows.reduce((acc, row) => ({
      leads: acc.leads + row.leads,
      visitsConfirmed: acc.visitsConfirmed + row.visitsConfirmed,
      converted: acc.converted + row.converted,
      won: acc.won + row.won,
    }), { leads: 0, visitsConfirmed: 0, converted: 0, won: 0 });

    return json(res, 200, {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      windowDays,
      rows,
      totals: {
        ...totals,
        conversionRate: leadMetricsRate(totals.converted, totals.leads),
        winRate: leadMetricsRate(totals.won, totals.leads),
      },
      minimized: true,
      role: session.role,
    });
  } catch (error) {
    const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
    const migrationMissing = error && typeof error === "object" && error.code === "42P01";
    if (!unconfigured) console.error("Could not compute the lead origin metrics.", error);
    return json(res, 503, { error: unconfigured ? "database_not_configured" : migrationMissing ? "migration_required" : "lead_metrics_unavailable" });
  }
}

async function handleAdminLeads(req, res, url) {
  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "admin_session_required" });
  if (!['marcelo', 'ti', 'comercial', 'admin'].includes(session.role)) return json(res, 403, { error: "forbidden" });
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));
  const offset = Math.min(10_000, Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0));
  const status = url.searchParams.get("status");
  if (status && !leadStatuses.has(status)) return json(res, 400, { error: "invalid_status_filter" });
  try {
    const values = [];
    let where = "";
    if (status) {
      values.push(status);
      where = "WHERE status = $1";
    }
    const count = await getPool().query(`SELECT COUNT(*)::int AS total FROM public_leads ${where}`, values);
    const listValues = [...values, limit, offset];
    const limitPos = values.length + 1;
    const offsetPos = values.length + 2;
    const result = await getPool().query(
      `SELECT id, request_kind, name, phone, city, property_type, services, visit_preference, details, status, email_status, origin, campaign, email, channel, responsible, responsible_id, dedup_key, ip_hash, created_at, updated_at
       FROM public_leads ${where} ORDER BY created_at DESC LIMIT $${limitPos} OFFSET $${offsetPos}`,
      listValues,
    );
    return json(res, 200, { leads: result.rows, total: count.rows[0]?.total || 0, limit, offset, role: session.role });
  } catch (error) {
    const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
    const migrationMissing = error && typeof error === "object" && error.code === "42P01";
    if (!unconfigured) console.error("Could not load the admin lead inbox.", error);
    return json(res, 503, { error: unconfigured ? "database_not_configured" : migrationMissing ? "migration_required" : "leads_unavailable" });
  }
}

async function handleAdminLeadStatus(req, res, leadId) {
  if (req.method !== "PATCH") return json(res, 405, { error: "method_not_allowed" }, { Allow: "PATCH" });
  if (!sameOrigin(req)) return json(res, 403, { error: "same_origin_required" });
  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "admin_session_required" });
  if (!['marcelo', 'ti', 'comercial', 'admin'].includes(session.role)) return json(res, 403, { error: "forbidden" });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId)) return json(res, 400, { error: "invalid_lead_id" });
  let body;
  try {
    body = await readJson(req);
  } catch {
    return json(res, 400, { error: "invalid_request" });
  }
  const newStatus = body?.status;
  const responsible = body?.responsible ? String(body.responsible).trim().slice(0,100) : null;
  const responsibleId = body?.responsible_id || body?.responsibleId || null;

  if (newStatus && !leadStatuses.has(newStatus)) return json(res, 400, { error: "invalid_status" });
  if (responsibleId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(responsibleId)) return json(res, 400, { error: "invalid_responsible_id" });

  let client;
  try {
    client = await getPool().connect();
    await client.query("BEGIN");
    const current = await client.query("SELECT status, responsible FROM public_leads WHERE id = $1 FOR UPDATE", [leadId]);
    if (!current.rows[0]) {
      await client.query("ROLLBACK");
      return json(res, 404, { error: "lead_not_found" });
    }
    const previousStatus = current.rows[0].status;
    const previousResponsible = current.rows[0].responsible;

    let statusChanged = false;
    let responsibleChanged = false;

    if (newStatus && previousStatus !== newStatus) {
      await client.query("UPDATE public_leads SET status = $2, updated_at = NOW() WHERE id = $1", [leadId, newStatus]);
      await client.query(
        "INSERT INTO public_lead_status_audit (lead_id, previous_status, next_status, changed_by) VALUES ($1,$2,$3,$4)",
        [leadId, previousStatus, newStatus, session.role],
      );
      statusChanged = true;
      // PUB-04: a trilha distingue confirmação de cancelamento. Antes, QUALQUER
      // transição de visita — inclusive 'cancelada' — era auditada como
      // `lead_visit_confirm`, e a falha de auditoria era engolida: o status
      // mudava sem trilha. Agora o mapeamento é fiel e a falha reverte tudo.
      const auditAction = ["confirmada", "realizada"].includes(newStatus) ? "lead_visit_confirm"
        : newStatus === "cancelada" ? "lead_visit_cancel"
          : "lead_status_change";
      await client.query(
        "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')",
        [session.role, session.identityId || session.role, auditAction, `${leadId}:${previousStatus}->${newStatus}`]
      );
    }

    if (responsible !== null || responsibleId) {
      // Responsável de atendimento - pessoa responsável confirma (PUB-04)
      await client.query("UPDATE public_leads SET responsible = COALESCE($2, responsible), responsible_id = COALESCE($3, responsible_id), updated_at = NOW() WHERE id = $1", [leadId, responsible, responsibleId]);
      responsibleChanged = true;
      // Sem trilha durável na mesma transação, a atribuição não é confirmada.
      await client.query(
        "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')",
        [session.role, session.identityId || session.role, "lead_responsible_assign", `${leadId}:${responsible || responsibleId}`]
      );
    }

    await client.query("COMMIT");
    return json(res, 200, { leadId, status: newStatus || previousStatus, previousStatus, responsible: responsible || previousResponsible, statusChanged, responsibleChanged, updatedBy: session.role, identityId: session.identityId || null });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
    const migrationMissing = error && typeof error === "object" && error.code === "42P01";
    if (!unconfigured) console.error("Could not update lead status.", error);
    return json(res, 503, { error: unconfigured ? "database_not_configured" : migrationMissing ? "migration_required" : "lead_update_unavailable" });
  } finally {
    client?.release();
  }
}

async function handleSiteVisual(req, res, url) {
  const selectionEnabled = process.env.SITE_VISUAL_SELECTION_ENABLED === "true";
  if (req.method === "GET" && !selectionEnabled) {
    return json(res, 200, { visual: DEFAULT_VISUAL, updatedBy: null, updatedAt: null, source: "default", selectionEnabled: false });
  }
  if (req.method === "PUT" && !selectionEnabled) {
    return json(res, 409, { error: "visual_selection_paused" });
  }
  if (req.method === "GET") {
    try {
      const result = await getPool().query(
        "SELECT active_visual, updated_by, updated_at FROM site_visual_config WHERE singleton_id = 1",
      );
      const row = result.rows[0];
      return json(res, 200, {
        visual: row?.active_visual || DEFAULT_VISUAL,
        updatedBy: row?.updated_by || null,
        updatedAt: row?.updated_at || null,
        source: "postgres",
        selectionEnabled: true,
      });
    } catch (error) {
      const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
      if (!unconfigured) console.error("Could not load the site visual configuration.", error);
      return json(res, 503, { error: unconfigured ? "database_not_configured" : "database_unavailable" });
    }
  }

  if (req.method !== "PUT") return json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, PUT" });
  if (!sameOrigin(req)) return json(res, 403, { error: "same_origin_required" });
  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "admin_session_required" });

  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    return json(res, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, { error: "invalid_request" });
  }
  const visual = String(body?.visual || "");
  if (!VISUAL_IDS.has(visual)) return json(res, 400, { error: "invalid_visual_id" });

  let client;
  try {
    client = await getPool().connect();
    await client.query("BEGIN");
    const current = await client.query(
      "SELECT active_visual FROM site_visual_config WHERE singleton_id = 1 FOR UPDATE",
    );
    if (!current.rows[0]) throw new Error("SITE_VISUAL_MIGRATION_REQUIRED");
    const previousVisual = current.rows[0].active_visual;
    const updated = await client.query(
      "UPDATE site_visual_config SET active_visual = $1, updated_by = $2, updated_at = NOW() WHERE singleton_id = 1 RETURNING active_visual, updated_by, updated_at",
      [visual, session.role],
    );
    await client.query(
      "INSERT INTO site_visual_audit (previous_visual, next_visual, changed_by) VALUES ($1, $2, $3)",
      [previousVisual, visual, session.role],
    );
    await client.query("COMMIT");
    return json(res, 200, {
      visual: updated.rows[0].active_visual,
      updatedBy: updated.rows[0].updated_by,
      updatedAt: updated.rows[0].updated_at,
      source: "postgres",
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
    const migrationMissing = error instanceof Error && error.message === "SITE_VISUAL_MIGRATION_REQUIRED";
    if (!unconfigured) console.error("Could not save the site visual configuration.", error);
    return json(res, 503, { error: unconfigured ? "database_not_configured" : migrationMissing ? "migration_required" : "database_unavailable" });
  } finally {
    client?.release();
  }
}

async function handleAdminSession(req, res) {
  if (req.method === "GET") {
    const session = await readSession(req);
    return session
      ? json(res, 200, {
          role: session.role,
          identityId: session.identityId || null,
          mfaVerified: session.mfaVerified,
          expiresAt: session.expiresAt,
        })
      : json(res, 401, { error: "admin_session_required" });
  }

  if (req.method === "DELETE") {
    if (!sameOrigin(req)) return json(res, 403, { error: "same_origin_required" });
    // L01: logout revoga de verdade no servidor; apagar o cookie não bastava,
    // uma cópia do cookie continuaria válida até expirar.
    const envelope = readSessionEnvelope(req);
    if (envelope) {
      try { await staffSessionStore.revoke(envelope.sid, "logout"); } catch { /* cookie sai de qualquer forma */ }
    }
    return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
  }

  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST, DELETE" });
  if (!sameOrigin(req)) return json(res, 403, { error: "same_origin_required" });
  if (!rateLimitAllows(loginAttempts, req, LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS)) return json(res, 429, { error: "too_many_attempts" }, { "Retry-After": "900" });

  let body;
  try {
    body = await readJson(req);
  } catch {
    return json(res, 400, { error: "invalid_request" });
  }

  const secret = sessionSecret();
  if (!secret) return json(res, 503, { error: "admin_auth_not_configured" });

  // Staff login via email/password (SEC-04/SEC-05)
  const emailCandidate = body?.email;
  const passwordCandidate = body?.password;
  if (typeof emailCandidate === "string" && typeof passwordCandidate === "string") {
    const normalized = normalizeEmail(emailCandidate);
    if (normalized.error) return json(res, 400, { error: "invalid_email" });
    const email = normalized.value;
    const password = passwordCandidate;
    try {
      const db = getPool();
      const found = await db.query(
        `SELECT i.id, i.status, i.session_epoch, c.password_hash, p.role,
                (p.identity_id IS NOT NULL) AS has_profile,
                (m.activated_at IS NOT NULL) AS mfa_active, m.totp_secret_encrypted AS mfa_secret
         FROM auth_identities i
         LEFT JOIN auth_credentials c ON c.identity_id = i.id
         LEFT JOIN auth_staff_profiles p ON p.identity_id = i.id
         LEFT JOIN auth_mfa m ON m.identity_id = i.id
         WHERE i.kind = 'staff' AND i.email = $1`,
        [email]
      );
      const rec = found.rows[0];
      if (!rec || !rec.password_hash) {
        // Constant time dummy verification to avoid enumeration
        await verifyPassword(password, "$s1$16384$8$1$64$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA").catch(() => {});
        return json(res, 401, { error: "invalid_credentials" });
      }
      const ok = await verifyPassword(password, rec.password_hash);
      if (!ok) return json(res, 401, { error: "invalid_credentials" });

      // L01/SEC-04: sem fallback para "admin"; identidade inativa ou sem perfil
      // de staff não recebe papel algum.
      const verdict = evaluateStaffLogin({ status: rec.status, role: rec.role, hasProfile: rec.has_profile });
      if (!verdict.allowed) {
        await staffAudit(db, rec.id, verdict.reason === "staff_profile_missing" ? "staff_profile_missing" : "staff_login_denied", "denied");
        return json(res, verdict.status, { error: verdict.reason });
      }
      const role = verdict.role;

      // L01/SEC-06: senha sozinha não emite sessão privilegiada quando há MFA.
      if (rec.mfa_active) {
        try {
          decryptMfaSecret(rec.mfa_secret, rec.id);
          const challenge = randomBytes(32).toString("base64url");
          await db.query("UPDATE auth_mfa_challenges SET used_at = NOW() WHERE identity_id = $1 AND used_at IS NULL", [rec.id]);
          await db.query(
            `INSERT INTO auth_mfa_challenges (id, identity_id, token_hash, expires_at)
             VALUES ($1,$2,$3,NOW() + INTERVAL '5 minutes')`,
            [randomUUID(), rec.id, createHash("sha256").update(challenge).digest("hex")]
          );
          await staffAudit(db, rec.id, "staff_mfa_challenge_issue", "allowed");
          // 202 + desafio NÃO é sessão autenticada: nenhum cookie é emitido aqui.
          return json(res, 202, { mfaRequired: true, challenge });
        } catch {
          // Chave ausente/inválida nunca rebaixa para "senha somente".
          return json(res, 503, { error: "mfa_login_unavailable" });
        }
      }

      const session = await createStaffSessionCookie({
        identityId: rec.id, role, epoch: rec.session_epoch, mfaVerified: false, req,
      });
      await staffAudit(db, rec.id, "staff_login", "allowed");
      return json(res, 200, { role, identityId: rec.id, expiresAt: session.expiresAt, mfaEnabled: false }, {
        "Set-Cookie": sessionCookie(req, session.value, session.ttlSeconds),
      });
    } catch (error) {
      const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
      const migrationMissing = error && typeof error === "object" && error.code === "42P01";
      if (!unconfigured && !migrationMissing) console.error("Staff login failed.", error);
      return json(res, 503, { error: unconfigured ? "database_not_configured" : migrationMissing ? "migration_required" : "auth_unavailable" });
    }
  }

  // L01/SEC-05: tokens compartilhados só sobrevivem como bootstrap.
  // Recusados por padrão; e mesmo com a flag ligada, desligam-se sozinhos assim
  // que existir a primeira identidade de staff provisionada. Nunca emitem
  // sessão anônima: o bootstrap cria/usa uma identidade individual auditável.
  const token = String(body?.token || "");
  const credentials = [
    ["marcelo", process.env.SITE_ADMIN_TOKEN_MARCELO],
    ["ti", process.env.SITE_ADMIN_TOKEN_TI],
  ];
  const tokensConfigured = credentials.some(([, value]) => value && value.length >= 32);

  let provisionedStaffCount = 0;
  try {
    provisionedStaffCount = await staffSessionStore.countProvisionedStaff();
  } catch (error) {
    // Fail-closed: sem conseguir provar que ainda não há contas individuais,
    // o token compartilhado não vale.
    console.error("Could not count provisioned staff.", error?.message);
    return json(res, 503, { error: "auth_unavailable" });
  }

  const policy = evaluateLegacyTokenPolicy({
    enabledFlag: process.env.SITE_ADMIN_LEGACY_TOKENS,
    provisionedStaffCount,
    tokensConfigured,
  });
  if (!policy.allowed) {
    try {
      await getPool().query(
        `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
         VALUES ('system', NULL, 'staff_legacy_token_refused', $1, 'denied', 'none')`,
        [policy.reason]
      );
    } catch {}
    return json(res, policy.reason === "admin_auth_not_configured" ? 503 : 403, { error: policy.reason });
  }

  const match = credentials.find(([, value]) => value && value.length >= 32 && constantTimeTextMatch(token, value));
  if (!match) return json(res, 401, { error: "invalid_admin_credential" });

  // Mesmo no bootstrap a sessão recebe identidade individual e registro no
  // servidor, para que a auditoria identifique uma pessoa e a revogação funcione.
  let bootstrapIdentityId;
  try {
    bootstrapIdentityId = await ensureBootstrapStaffIdentity(match[0]);
  } catch (error) {
    console.error("Could not provision the bootstrap staff identity.", error?.message);
    return json(res, 503, { error: "auth_unavailable" });
  }

  const session = await createStaffSessionCookie({
    identityId: bootstrapIdentityId, role: match[0], epoch: 0, mfaVerified: false, req,
  });
  await staffAudit(getPool(), bootstrapIdentityId, "staff_legacy_token_login", "allowed");
  return json(res, 200, {
    role: match[0],
    identityId: bootstrapIdentityId,
    expiresAt: session.expiresAt,
    bootstrap: true,
    warning: "legacy_shared_token_bootstrap: crie uma conta individual; este acesso expira sozinho quando houver staff provisionado.",
  }, {
    "Set-Cookie": sessionCookie(req, session.value, session.ttlSeconds),
  });
}

/**
 * L01/SEC-06 — conclusão do desafio MFA de staff.
 * Só aqui a sessão privilegiada é emitida. O desafio é de uso único, expira em
 * 5 minutos, limita tentativas e protege contra reutilização de código TOTP
 * (last_used_step) e de código de recuperação (array_remove).
 */
async function handleAdminMfaComplete(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" }, { Allow: "POST" });
  if (!sameOrigin(req)) return json(res, 403, { error: "same_origin_required" });
  if (!rateLimitAllows(loginAttempts, req, LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS)) {
    return json(res, 429, { error: "too_many_attempts" }, { "Retry-After": "900" });
  }
  if (!sessionSecret()) return json(res, 503, { error: "admin_auth_not_configured" });

  let body;
  try { body = await readJson(req); } catch { return json(res, 400, { error: "invalid_request" }); }
  const challenge = typeof body?.challenge === "string" ? body.challenge : "";
  const code = typeof body?.code === "string" ? body.code.trim().toLowerCase() : "";
  if (!challenge || challenge.length > 200 || !(/^\d{6}$/.test(code) || hashRecoveryCode(code))) {
    return json(res, 400, { error: "invalid_request" });
  }

  let client;
  try {
    mfaKey();
    const db = getPool();
    client = await db.connect();
    await client.query("BEGIN");
    const { rows: [entry] } = await client.query(
      `SELECT c.id AS challenge_id, c.identity_id, c.expires_at, c.used_at, c.attempts,
              i.status, i.session_epoch,
              p.role AS profile_role, (p.identity_id IS NOT NULL) AS has_profile,
              m.totp_secret_encrypted, m.recovery_hashes, m.activated_at, m.last_used_step
         FROM auth_mfa_challenges c
         JOIN auth_identities i ON i.id = c.identity_id AND i.kind = 'staff'
         JOIN auth_mfa m ON m.identity_id = i.id
         LEFT JOIN auth_staff_profiles p ON p.identity_id = i.id
        WHERE c.token_hash = $1
        FOR UPDATE OF c, m`,
      [createHash("sha256").update(challenge).digest("hex")]
    );

    const verdict = entry
      ? evaluateStaffLogin({ status: entry.status, role: entry.profile_role, hasProfile: entry.has_profile })
      : { allowed: false };
    if (!entry || entry.used_at || entry.attempts >= 5 || new Date(entry.expires_at) <= new Date()
        || !entry.activated_at || !verdict.allowed) {
      await client.query("ROLLBACK");
      return json(res, 401, { error: "mfa_challenge_invalid" });
    }

    const recoveryHash = hashRecoveryCode(code);
    let valid = false;
    if (recoveryHash && (entry.recovery_hashes || []).includes(recoveryHash)) {
      // Código de recuperação é consumido: não serve duas vezes.
      await client.query(
        `UPDATE auth_mfa SET recovery_hashes = array_remove(recovery_hashes, $2),
                last_verified_at = NOW(), attempts_since_verified = 0
          WHERE identity_id = $1`,
        [entry.identity_id, recoveryHash]
      );
      valid = true;
    } else if (!recoveryHash) {
      const result = await verifyMfaCode(entry.totp_secret_encrypted, entry.identity_id, code, entry.last_used_step);
      if (result.valid) {
        // Só avança se o passo for estritamente maior: bloqueia replay do mesmo TOTP.
        const updated = await client.query(
          `UPDATE auth_mfa SET last_used_step = $2, last_verified_at = NOW(), attempts_since_verified = 0
            WHERE identity_id = $1 AND (last_used_step IS NULL OR last_used_step < $2)
            RETURNING identity_id`,
          [entry.identity_id, result.timeStep]
        );
        valid = updated.rowCount === 1;
      }
    }

    if (!valid) {
      await client.query("UPDATE auth_mfa_challenges SET attempts = attempts + 1 WHERE id = $1", [entry.challenge_id]);
      await client.query("COMMIT");
      await staffAudit(getPool(), entry.identity_id, "staff_mfa_challenge_denied", "denied");
      return json(res, 401, { error: "mfa_code_invalid" });
    }

    await client.query("UPDATE auth_mfa_challenges SET used_at = NOW() WHERE id = $1", [entry.challenge_id]);
    await client.query("COMMIT");

    const session = await createStaffSessionCookie({
      identityId: entry.identity_id, role: verdict.role, epoch: entry.session_epoch, mfaVerified: true, req,
    });
    await staffAudit(getPool(), entry.identity_id, "staff_mfa_challenge_verify", "allowed");
    return json(res, 200, {
      role: verdict.role, identityId: entry.identity_id, expiresAt: session.expiresAt, mfaEnabled: true,
    }, { "Set-Cookie": sessionCookie(req, session.value, session.ttlSeconds) });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (error instanceof Error && error.message === "MFA_KEY_NOT_CONFIGURED") {
      return json(res, 503, { error: "mfa_login_unavailable" });
    }
    console.error("Could not complete the staff MFA challenge.", error?.message);
    return json(res, 503, { error: "auth_unavailable" });
  } finally {
    client?.release();
  }
}

/** Auditoria de staff que nunca derruba o fluxo de autenticação. */
async function staffAudit(db, identityId, action, result) {
  try {
    await db.query(
      `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
       VALUES ('staff', $1, $2, $1, $3, 'none')`,
      [identityId, action, result]
    );
  } catch (error) {
    console.error("Could not record the staff audit entry.", error?.message);
  }
}

/**
 * Identidade individual mínima usada apenas pelo bootstrap por token
 * compartilhado. Sem credencial de senha: não é login alternativo, é só um
 * sujeito auditável enquanto o operador não cria a primeira conta real.
 */
async function ensureBootstrapStaffIdentity(role) {
  const db = getPool();
  const email = `bootstrap+${role}@local.invalid`;
  const existing = await db.query(
    "SELECT id FROM auth_identities WHERE kind = 'staff' AND email = $1",
    [email]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const id = randomUUID();
  await db.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status)
     VALUES ($1,'staff',$2,$3,'active')
     ON CONFLICT DO NOTHING`,
    [id, email, `Bootstrap ${role}`]
  );
  const row = await db.query("SELECT id FROM auth_identities WHERE kind = 'staff' AND email = $1", [email]);
  const identityId = row.rows[0].id;
  // O perfil é obrigatório: a validação de sessão exige papel vindo do banco.
  await db.query(
    `INSERT INTO auth_staff_profiles (identity_id, role, assigned_by, is_bootstrap)
     VALUES ($1,$2,'legacy_bootstrap',TRUE)
     ON CONFLICT (identity_id) DO UPDATE SET role = EXCLUDED.role`,
    [identityId, role]
  );
  return identityId;
}

const publicBaseUrl = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "") || `http://localhost:${port}`;

const clientAccessApi = createClientAccessApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
  cookieSecure,
  clientIp,
  baseUrl: publicBaseUrl,
  localOutbox,
});

const clientSpaceApi = createClientSpaceApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
  readClientSession: clientAccessApi.readClientSession,
  docsDir: (process.env.CLIENT_DOCS_DIR || "").trim() || path.join(process.cwd(), ".data", "documents"),
});
const clientSecurityApi = createClientSecurityApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readClientSession: clientAccessApi.readClientSession,
  cookieSecure,
  clientIp,
  baseUrl: publicBaseUrl,
  localOutbox,
});
const adminRbacApi = createAdminRbacApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
  staffSessionStore,
});
const employeeApi = createEmployeeApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readStaffSession: readSession,
  readEmployeeSession,
  readEmployeeEnvelope: readEmployeeSessionEnvelope,
  issueEmployeeSession,
  employeeSessionStore,
  employeeCookie,
  employeeLoginAllowed: req => rateLimitAllows(employeeLoginAttempts, req, LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS),
  employeeDocsDir: (process.env.EMPLOYEE_DOCS_DIR || "").trim() || path.join(process.cwd(), ".data", "employee-documents"),
});

const notificationQueue = createNotificationQueue({
  getPool,
  observability: getObservability(),
  localOutbox,
});

const adminAuditApi = createAdminAuditApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
  clientIp,
});

const adminNotificationsApi = createAdminNotificationsApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
  notificationQueue,
  mailer: null, // will be set if nodemailer configured; for now null, process will mark not_configured
});

const integrationsApi = createIntegrationsApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
  clientIp,
});

const serviceCatalogApi = createServiceCatalogApi({
  json,
  getPool,
  readAdminSession: readSession,
});

const faqApi = createFaqApi({
  json,
  getPool,
});

const crmTaskApi = createCrmTaskApi({ json, readJson, sameOrigin, getPool, readAdminSession: readSession });

const crmInteractionApi = createCrmInteractionApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
  // Reuse the L02 private local-file provider directory. CRM attachment
  // metadata has its own authorization boundary; blobs never receive a URL.
  docsDir: (process.env.CLIENT_DOCS_DIR || "").trim() || path.join(process.cwd(), ".data", "documents"),
});

// CRM-08: agenda de visitas/reuniões. Responsável gerencia; participante
// convidado apenas enxerga a própria agenda e responde por si.
const crmVisitApi = createCrmVisitApi({ json, readJson, sameOrigin, getPool, readAdminSession: readSession });

// CRM-09: modelos privados e aplicação manual em tarefas; nenhum envio automático.
const crmCadenceApi = createCrmCadenceApi({ json, readJson, sameOrigin, getPool, readAdminSession: readSession });

// CRM-07: notas internas dedicadas por oportunidade, dentro da borda pessoal.
const crmNoteApi = createCrmNoteApi({ json, readJson, sameOrigin, getPool, readAdminSession: readSession });

const crmApi = createCrmApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
  clientIp,
});

const equipmentApi = createEquipmentApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const inspectionApi = createInspectionApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const laborBudgetApi = createLaborBudgetApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const technicalBudgetApi = createTechnicalBudgetApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const costParameterApi = createCostParameterApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const priceScenarioApi = createPriceScenarioApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const discountApi = createDiscountApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
  hasPermission,
});

const proposalApi = createProposalApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const proposalDeliveryApi = createProposalDeliveryApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const proposalAcceptanceApi = createProposalAcceptanceApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
  clientIp,
});

const contractApi = createContractApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const contractDetailsApi = createContractDetailsApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const contractStatusApi = createContractStatusApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const contractAmendmentApi = createContractAmendmentApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const contractAlertApi = createContractAlertApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const contractDocObligationApi = createContractDocObligationApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const contractImplantationApi = createContractImplantationApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const contractClosureApi = createContractClosureApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const contractFiscalApi = createContractFiscalApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const contractManagementDiaryApi = createContractManagementDiaryApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const contractL05Api = createContractL05Api({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const notificationPreferencesApi = createNotificationPreferencesApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const observability = getObservability();

const observabilityApi = createObservabilityApi({
  json,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
  observability,
});

const healthcheckApi = createHealthcheckApi({
  json,
  getPool,
  readAdminSession: readSession,
  sameOrigin,
  observability,
});

const backupApi = createBackupApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const privacyApi = createPrivacyApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const lgpdRequestApi = createLgpdRequestApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const retentionApi = createRetentionApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const incidentApi = createIncidentApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const configApi = createConfigApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const dependencyApi = createDependencyApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const integrationLogApi = createIntegrationLogApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const budgetApi = createBudgetApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const envApi = createEnvApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const maintenanceDocApi = createMaintenanceDocApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

function staffSessionHasPermission(session, permission) {
  return Array.isArray(session?.permissions) && session.permissions.some(row =>
    row.permission === permission && ["global", "organization"].includes(row.scope_type)
  );
}

const COMPENSATION_HR_PATH = /\/(?:payroll-(?:sources|imports|documents)|dp-(?:variables|documents|exports))(?:\/|$)/;
const HEALTH_HR_PATH = /\/occupational-(?:requirements|agenda|documents)(?:\/|$)/;

function legacyHrPermission(method, pathname, roles = null) {
  const write = !["GET", "HEAD"].includes(method || "");
  if (COMPENSATION_HR_PATH.test(pathname || "") || (Array.isArray(roles) && !roles.includes("rh"))) {
    return write ? "employees.compensation.write" : "employees.compensation.read";
  }
  if (HEALTH_HR_PATH.test(pathname || "")) {
    return write ? "employees.health.write" : "employees.health.read";
  }
  return write ? "employees.write" : "employees.read";
}

// Adaptador temporário para módulos HR legados: a borda HTTP distingue
// leitura/escrita e também os domínios salarial e de saúde; aqui o antigo teste
// de papel consulta a mesma permissão granular, sem bypass pelo nome do papel.
function hrPermissionCompat(session, roles) {
  return staffSessionHasPermission(
    session,
    legacyHrPermission(session?.requestMethod, session?.requestPath, roles),
  );
}

async function readHrSession(req) {
  const session = await readSession(req);
  const requestPath = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  return session ? { ...session, requestMethod: req.method || "GET", requestPath } : null;
}

async function authorizeLegacyHrRequest(req, res, url) {
  const session = await readSession(req);
  if (!session) {
    json(res, 401, { error: "admin_session_required" });
    return false;
  }
  const permission = legacyHrPermission(req.method, url.pathname);
  let employeeId = url.searchParams.get("employee_id");
  const directEmployee = url.pathname.match(/^\/api\/hr\/employees\/([0-9a-f-]{36})$/i);
  if (directEmployee) employeeId = directEmployee[1];
  let unitId = null;
  let contractId = null;
  if (employeeId && isUuid(employeeId)) {
    const found = await getPool().query("SELECT unit_id, contract_id FROM hr_employees WHERE id=$1", [employeeId]);
    unitId = found.rows[0]?.unit_id || null;
    contractId = found.rows[0]?.contract_id || null;
  }
  const allowed = await hasPermission(getPool(), {
    identityId: session.identityId,
    permission,
    unitId,
    contractId,
  });
  if (!allowed) {
    json(res, 403, { error: "employee_permission_required", permission });
    return false;
  }
  return true;
}

const hrApi = createHrApi({
  pool: getPool(),
  employeeSessionStore,
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readHrSession,
  requireRole: hrPermissionCompat,
});

const empProfileApi = createEmpProfileApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readHrSession,
  requireRole: hrPermissionCompat,
});

const hrRecruitmentApi = createHrRecruitmentApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readHrSession,
  requireRole: hrPermissionCompat,
});

const hrTerminationApi = createHrTerminationApi({
  pool: getPool(),
  employeeSessionStore,
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readHrSession,
  requireRole: hrPermissionCompat,
});

const hrAbsenceApi = createHrAbsenceApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readHrSession,
  requireRole: hrPermissionCompat,
});

const hrBenefitsApi = createHrBenefitsApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readHrSession,
  requireRole: hrPermissionCompat,
});

const hrTrainingApi = createHrTrainingApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readHrSession,
  requireRole: hrPermissionCompat,
});

const hrAdvancedApi = createHrAdvancedApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readHrSession,
  requireRole: hrPermissionCompat,
});

const empPortalApi = createEmpPortalApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readHrSession,
  requireRole: hrPermissionCompat,
});

const empOpsApi = createEmpOpsApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readHrSession,
  requireRole: hrPermissionCompat,
});

const empSelfApi = createEmpSelfApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readHrSession,
  requireRole: hrPermissionCompat,
});

const empAdvanced2Api = createEmpAdvanced2Api({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readHrSession,
  requireRole: hrPermissionCompat,
});

const empPwaApi = createEmpPwaApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readHrSession,
  requireRole: hrPermissionCompat,
});

const opsApi = createOpsApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const opsAdvancedApi = createOpsAdvancedApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const opsAdvanced2Api = createOpsAdvanced2Api({
  pool: getPool(),
  // L06-E: propagate audit failures so the endpoint can roll back atomically.
  auditLog: async ({ action, actor, target, meta }) => {
    await getPool().query(
      `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
      [action, actor, target, meta ? JSON.stringify(meta) : null]
    );
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const opsAdvanced3Api = createOpsAdvanced3Api({
  pool: getPool(),
  // L06-E: propagate audit failures so the endpoint can roll back atomically.
  auditLog: async ({ action, actor, target, meta }) => {
    await getPool().query(
      `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
      [action, actor, target, meta ? JSON.stringify(meta) : null]
    );
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const cliApi = createCliApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const cliAdvancedApi = createCliAdvancedApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const cliFinanceApi = createCliFinanceApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireClientSession: clientAccessApi.readClientSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const finApi = createFinApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta, client }) => {
    await (client || getPool()).query(
      `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
      [action, actor, target, meta ? JSON.stringify(meta) : null]
    );
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const finAdvancedApi = createFinAdvancedApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta, client }) => {
    const query = () => (client || getPool()).query(
      `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
      [action, actor, target, meta ? JSON.stringify(meta) : null]
    );
    // FIN-05 passes the transaction client and is fail-closed. Keep the
    // pre-existing behavior of later, still-unverified handlers outside
    // this slice until their own transactional slice is started.
    if (client) return query();
    try { await query(); } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const finManagementApi = createFinManagementApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta, client }) => {
    await (client || getPool()).query(
      `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
      [action, actor, target, meta ? JSON.stringify(meta) : null]
    );
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const finBudgetApi = createFinBudgetApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta, client }) => {
    await (client || getPool()).query(
      `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
      [action, actor, target, meta ? JSON.stringify(meta) : null]
    );
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const admApi = createAdmApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const admAdvancedApi = createAdmAdvancedApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

// ADM-01..12 — painel do Marcelo. A auditoria NÃO engole erro: a falha sobe,
// a transação do handler reverte e a resposta é 503 (fail-closed).
const admPanelApi = createAdmPanelApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta, client }) => {
    await (client || getPool()).query(
      `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
      [action, actor, target, meta ? JSON.stringify(meta) : null]
    );
  },
  sameOrigin,
  requireSession: readSession,
});

const astApi = createAstApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const astAdvancedApi = createAstAdvancedApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const extApi = createExtApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

// EXT-01 frota canônica: a auditoria NÃO usa o auditLog tolerante a falha do
// restante do servidor — o módulo grava audit_log dentro da própria transação
// e devolve 503 com rollback quando a auditoria está indisponível.
const extFleetApi = createExtFleetApi({
  pool: getPool(),
  sameOrigin,
  requireSession: readSession,
});

// EXT-02 terceiros canônicos: mesma disciplina da frota — a auditoria NÃO usa
// o auditLog tolerante a falha do restante do servidor; o módulo grava
// audit_log dentro da própria transação e devolve 503 com rollback quando a
// auditoria está indisponível.
const extThirdPartyApi = createExtThirdPartyApi({
  pool: getPool(),
  sameOrigin,
  requireSession: readSession,
});

// EXT-03 licitações canônicas: mesma disciplina de frota e terceiros — a
// auditoria NÃO usa o auditLog tolerante a falha do restante do servidor; o
// módulo grava audit_log dentro da própria transação e devolve 503 com
// rollback quando a auditoria está indisponível.
const extBiddingApi = createExtBiddingApi({
  pool: getPool(),
  sameOrigin,
  requireSession: readSession,
});

// EXT-04 fornecedores canônicos: jornada exclusivamente interna de staff;
// transação única negócio + evento imutável + audit_log, sem auditLog legado.
const extSupplierApi = createExtSupplierApi({
  pool: getPool(),
  sameOrigin,
  requireSession: readSession,
});

const extAdvancedApi = createExtAdvancedApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const extReportingApi = createExtReportingApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const l04Context={pool:getPool(),sameOrigin,requireSession:readSession,requireRole:(s,roles)=>roles.includes(s.role)};
const portfolioApi=createPortfolioApi(l04Context);
const commercialHistoryApi=createCommercialHistoryApi(l04Context);
const faqAnswerApi=createFaqAnswerApi(l04Context);
const cmsApi = createCmsApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const themeApi = createThemeApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const seoApi = createSeoApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

// PUB-08 — SEO técnico servido de verdade: `/robots.txt` e `/sitemap.xml`
// derivados das rotas públicas reais (fail-closed fora de produção), prévia
// autorizada para revisão e redirects com trilha na mesma transação.
const seoTechnicalApi = createSeoTechnicalApi({ json, readJson, sameOrigin, getPool, readAdminSession: readSession });

const packageApi = createPackageApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const originMetricsApi = createOriginMetricsApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

// CLI-15: jornada do cliente em canal restrito, autorizada exclusivamente pela
// sessão de cliente canônica. Sem auditLog legado: a auditoria canônica
// (auth_access_audit) é escrita pelas próprias queries, na mesma transação.
const clientEmployeeComplaintApi = createClientEmployeeComplaintApi({
  pool: getPool(),
  sameOrigin,
  requireClientSession: clientAccessApi.readClientSession,
});

const employeeComplaintApi = createEmployeeComplaintApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const pubFaqAssistedApi = createPubFaqAssistedApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const aiRagApi = createAiRagApi({
  pool: getPool(),
  auditLog: async ({ action, actor, target, meta }) => {
    try {
      await getPool().query(
        `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
        [action, actor, target, meta ? JSON.stringify(meta) : null]
      );
    } catch {}
  },
  sameOrigin,
  requireSession: readSession,
  requireRole: (sess, roles) => {
    const r = (sess.role || sess.userRole || '').toLowerCase();
    return roles.includes(r) || r === 'admin';
  },
});

const reportApi = createReportApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const commissionApi = createCommissionApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const commercialApi = createCommercialApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

const partnershipApi = createPartnershipApi({
  json,
  readJson,
  sameOrigin,
  getPool,
  readAdminSession: readSession,
});

async function routeApi(req, res) {
  const obs = getObservability();
  const requestId = obs.generateRequestId();
  const correlationId = req.headers['x-correlation-id'] ? String(req.headers['x-correlation-id']).slice(0,100) : obs.generateCorrelationId(requestId);
  globalThis.__currentRequestId = requestId;
  globalThis.__currentCorrelationId = correlationId;
  const start = Date.now();
  try { res.setHeader('X-Request-Id', requestId); res.setHeader('X-Correlation-Id', correlationId); } catch {}
  let routeError = null;
  let statusForObs = 200;
  // Monkey-patch json to capture status
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = function(statusCode, ...args) {
    statusForObs = statusCode;
    return originalWriteHead(statusCode, ...args);
  };
  try {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/api/crm/commercial-versions") return commercialHistoryApi(req,res);
  if (url.pathname === "/api/crm/portfolio") return portfolioApi(req,res);
  if (["/api/faq-assisted","/api/public/faq-assisted"].includes(url.pathname)) return faqAnswerApi(req,res);
  // Historical FAQ sessions/messages/handoffs contain personal data. Only
  // staff administrators may access them; public support uses /api/leads.
  if (/^\/api\/(?:admin\/)?(?:public\/)?(?:faq-assisted|faq-handoff|human-handoff|pub-faq|pub\/(?:faq|handoff))/.test(url.pathname)) {
    const s=await readSession(req);
    if(!s?.identityId) return json(res,401,{error:"session_required"});
    if(!["admin","marcelo","ti"].includes(s.role)) return json(res,403,{error:"role_required"});
    if(req.method!=="GET"&&!sameOrigin(req)) return json(res,403,{error:"same_origin_required"});
  }
  if (url.pathname === "/api/site-visual") return handleSiteVisual(req, res, url);
  if (url.pathname === "/api/leads") return handleCreateLead(req, res);
  if (url.pathname === "/api/admin/session") return handleAdminSession(req, res);
  if (url.pathname === "/api/admin/session/mfa") return handleAdminMfaComplete(req, res);
  // L03 — fronteira própria do funcionário. Estes caminhos nunca reutilizam a
  // sessão de staff e toda propriedade é derivada do cookie employee.
  if (url.pathname === "/api/employee/session"
      || url.pathname === "/api/employee/session/password"
      || url.pathname === "/api/employee/me"
      || url.pathname === "/api/employee/home"
      || url.pathname === "/api/employee/profile-updates"
      || url.pathname === "/api/employee/documents"
      || url.pathname === "/api/employee/offline"
      || url.pathname.startsWith("/api/employee/schedule/")
      || url.pathname.startsWith("/api/employee/actions/")
      || url.pathname.startsWith("/api/employee/documents/")
      || /^\/api\/admin\/hr\/employees\/[0-9a-f-]{36}\/access$/i.test(url.pathname)
      || url.pathname.startsWith("/api/admin/hr/l03/")) {
    return await employeeApi.handle(req, res, url);
  }
  // Os módulos HR/EMP históricos ainda fazem validações de formato e negócio,
  // mas a autorização obrigatória acontece uma única vez nesta borda, com
  // permissão granular e negação por padrão. Escopos unit/contract só passam
  // quando o recurso funcionário está explicitamente identificado.
  //
  // OPS-01: recursos de OPERAÇÃO publicados sob os aliases históricos de RH
  // (/api/hr/ops-*, /api/admin/hr/ops-*, /api/crm/hr/ops-*) ficam fora desta
  // borda. Cada handler de operação autoriza a si mesmo — sessão de staff,
  // papel por método e same-origin — exatamente como nos caminhos canônicos
  // /api/ops/*, que nunca passaram por aqui. Exigir permissão de RH
  // (employees.read/write) para cargo/função, posto, escala ou ronda negava
  // admin/ti nos aliases usados pelos clientes embutidos da tela de operação,
  // enquanto o caminho canônico do MESMO recurso liberava: dois aliases, duas
  // autorizações conflitantes para um recurso que não é dado de funcionário.
  // A isenção vale só para o prefixo `ops-`; os paths de RH legados continuam
  // na borda. Um alias ops-* desconhecido não é despachado para handler algum
  // e termina em 404 no fim do roteador.
  const legacyOpsAlias = /^\/api\/(?:admin\/|crm\/)?hr\/(?:ops|fin|adm)-[a-z0-9-]+$/.test(url.pathname);
  if (!legacyOpsAlias
      && (url.pathname.startsWith("/api/hr/")
          || url.pathname.startsWith("/api/admin/hr/")
          || url.pathname.startsWith("/api/crm/hr/")
          || url.pathname.startsWith("/api/employee/")
          || url.pathname.startsWith("/api/admin/employee/")
          || url.pathname.startsWith("/api/crm/employee/"))) {
    if (!(await authorizeLegacyHrRequest(req, res, url))) return;
  }
  if (url.pathname === "/api/admin/leads") return handleAdminLeads(req, res, url);
  if (url.pathname === "/api/admin/leads/metrics") return handleAdminLeadMetrics(req, res, url);
  const leadMatch = url.pathname.match(/^\/api\/admin\/leads\/([0-9a-f-]{36})$/i);
  if (leadMatch) return handleAdminLeadStatus(req, res, leadMatch[1]);
  if (url.pathname.startsWith("/api/auth/")) return clientAccessApi.handleAuth(req, res, url);
  if (url.pathname === "/api/admin/invites") return clientAccessApi.handleAdminInvites(req, res, url);
  if (url.pathname === "/api/admin/client-verifications") return clientAccessApi.handleManualVerificationList(req, res);
  const approvalMatch = url.pathname.match(/^\/api\/admin\/client-verifications\/([0-9a-f-]{36})\/approve$/i);
  if (approvalMatch) return clientAccessApi.handleManualVerificationApprove(req, res, approvalMatch[1]);
  const inviteMatch = url.pathname.match(/^\/api\/admin\/invites\/([0-9a-f-]{36})$/i);
  if (inviteMatch) return clientAccessApi.handleInviteRevoke(req, res, inviteMatch[1]);
  if (url.pathname === "/api/client/accounts") return clientSpaceApi.handleClientAccounts(req, res);
  if (url.pathname === "/api/client/contracts") return clientSpaceApi.handleClientContracts(req, res, url);
  if (url.pathname === "/api/client/documents") return clientSpaceApi.handleClientDocuments(req, res, url);
  const clientDocMatch = url.pathname.match(/^\/api\/client\/documents\/([0-9a-f-]{36})\/download$/i);
  if (clientDocMatch) return clientSpaceApi.handleClientDocumentDownload(req, res, clientDocMatch[1]);
  if (url.pathname === "/api/client/tickets") return clientSpaceApi.handleClientTickets(req, res, url);
  const clientTicketReopenMatch = url.pathname.match(/^\/api\/client\/tickets\/([0-9a-f-]{36})\/reopen$/i);
  if (clientTicketReopenMatch) return clientSpaceApi.handleClientTicketReopen(req, res, clientTicketReopenMatch[1]);
  if (url.pathname === "/api/client/visits") return clientSpaceApi.handleClientVisits(req, res, url);
  const clientVisitMatch = url.pathname.match(/^\/api\/client\/visits\/([0-9a-f-]{36})$/i);
  if (clientVisitMatch) return clientSpaceApi.handleClientVisitUpdate(req, res, clientVisitMatch[1]);
  if (url.pathname === "/api/client/reports") return clientSpaceApi.handleClientReports(req, res, url);
  const clientReportAckMatch = url.pathname.match(/^\/api\/client\/reports\/([0-9a-f-]{36})\/acknowledge$/i);
  if (clientReportAckMatch) return clientSpaceApi.handleClientReportAcknowledge(req, res, clientReportAckMatch[1]);
  if (url.pathname === "/api/client/security/mfa/setup") return clientSecurityApi.handleMfaSetup(req, res);
  if (url.pathname === "/api/client/security/mfa/activate") return clientSecurityApi.handleMfaActivate(req, res);
  if (url.pathname === "/api/client/security/mfa/verify") return clientSecurityApi.handleMfaVerify(req, res);
  if (url.pathname === "/api/client/security/mfa/disable") return clientSecurityApi.handleMfaDisable(req, res);
  if (url.pathname === "/api/client/security/sessions") {
    if (req.method === "GET") return clientSecurityApi.handleSessions(req, res);
    if (req.method === "POST") return clientSecurityApi.handleSessionRevokeOthers(req, res);
    return json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }
  const clientSecuritySessionMatch = url.pathname.match(/^\/api\/client\/security\/sessions\/([0-9a-f-]{36})$/i);
  if (clientSecuritySessionMatch) return clientSecurityApi.handleSessionRevoke(req, res, clientSecuritySessionMatch[1]);
  if (url.pathname === "/api/client/security/email-change") {
    if (req.method === "POST") return clientSecurityApi.handleEmailChangeRequest(req, res);
    if (req.method === "PUT") return clientSecurityApi.handleEmailChangeConfirm(req, res);
    if (req.method === "DELETE") return clientSecurityApi.handleEmailChangeCancel(req, res);
    return json(res, 405, { error: "method_not_allowed" }, { Allow: "POST, PUT, DELETE" });
  }
  if (url.pathname === "/api/admin/identities") return clientSpaceApi.handleAdminIdentities(req, res, url);
  if (url.pathname === "/api/admin/client-accounts") return clientSpaceApi.handleAdminAccounts(req, res, url);
  const accountMatch = url.pathname.match(/^\/api\/admin\/client-accounts\/([0-9a-f-]{36})$/i);
  if (accountMatch) return clientSpaceApi.handleAdminAccountStatus(req, res, accountMatch[1]);
  if (url.pathname === "/api/admin/grants") return clientSpaceApi.handleAdminGrants(req, res, url);
  const grantMatch = url.pathname.match(/^\/api\/admin\/grants\/([0-9a-f-]{36})$/i);
  if (grantMatch) return clientSpaceApi.handleAdminGrantRevoke(req, res, grantMatch[1]);
  if (url.pathname === "/api/admin/contracts") return clientSpaceApi.handleAdminContracts(req, res, url);
  const contractMatch = url.pathname.match(/^\/api\/admin\/contracts\/([0-9a-f-]{36})$/i);
  if (contractMatch) return clientSpaceApi.handleAdminContractStatus(req, res, contractMatch[1]);
  if (url.pathname === "/api/admin/documents") return clientSpaceApi.handleAdminDocuments(req, res, url);
  const adminDocMatch = url.pathname.match(/^\/api\/admin\/documents\/([0-9a-f-]{36})\/download$/i);
  if (adminDocMatch) return clientSpaceApi.handleAdminDocumentDownload(req, res, adminDocMatch[1]);
  if (url.pathname === "/api/admin/tickets") return clientSpaceApi.handleAdminTickets(req, res, url);
  const ticketMatch = url.pathname.match(/^\/api\/admin\/tickets\/([0-9a-f-]{36})$/i);
  if (ticketMatch) return clientSpaceApi.handleAdminTicketUpdate(req, res, ticketMatch[1]);
  if (url.pathname === "/api/admin/client-visits") return clientSpaceApi.handleAdminVisits(req, res, url);
  const adminVisitMatch = url.pathname.match(/^\/api\/admin\/client-visits\/([0-9a-f-]{36})$/i);
  if (adminVisitMatch) return clientSpaceApi.handleAdminVisitUpdate(req, res, adminVisitMatch[1]);
  if (url.pathname === "/api/admin/client-reports") return clientSpaceApi.handleAdminReports(req, res, url);
  const adminReportMatch = url.pathname.match(/^\/api\/admin\/client-reports\/([0-9a-f-]{36})$/i);
  if (adminReportMatch) return clientSpaceApi.handleAdminReportUpdate(req, res, adminReportMatch[1]);
  if (url.pathname === "/api/admin/permissions") {
    if (req.method === "GET") return adminRbacApi.handleListPermissions(req, res, url);
    if (req.method === "POST") return adminRbacApi.handleGrantPermission(req, res);
    return json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }
    const permMatch = url.pathname.match(/^\/api\/admin\/permissions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  if (permMatch) return adminRbacApi.handleRevokePermission(req, res, permMatch[1]);
  if (url.pathname === "/api/admin/access-reviews") return adminRbacApi.handleAccessReviews(req, res, url);
  if (url.pathname === "/api/admin/audit") return adminAuditApi.handleAuditList(req, res, url);
  if (url.pathname === "/api/admin/audit/export") return adminAuditApi.handleAuditExport(req, res);
  if (url.pathname === "/api/admin/notifications") {
    if (req.method === "GET") return adminNotificationsApi.handleList(req, res, url);
    if (req.method === "POST") return adminNotificationsApi.handleEnqueue(req, res);
    return json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }
  const notifRetryMatch = url.pathname.match(/^\/api\/admin\/notifications\/([0-9a-f-]{36})\/retry$/i);
  if (notifRetryMatch) return adminNotificationsApi.handleRetry(req, res, notifRetryMatch[1]);
  if (url.pathname === "/api/admin/notifications/process") return adminNotificationsApi.handleProcess(req, res);
  // L02 — caixa de saída local (substitui SMTP). Somente sessão de staff.
  if (url.pathname === "/api/admin/outbox") {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
    const session = await readSession(req);
    if (!session) return json(res, 401, { error: "admin_session_required" });
    try {
      const page = await localOutbox.list({
        actorId: session.identityId,
        limit: Number(url.searchParams.get("limit") || 50),
        offset: Number(url.searchParams.get("offset") || 0),
        status: url.searchParams.get("status"),
        recipient: url.searchParams.get("recipient"),
      });
      return json(res, 200, { ...page, deliveryMode: resolveDeliveryTarget(), notice: LOCAL_OUTBOX_LABEL });
    } catch (error) {
      console.error("Local outbox list failed.", error);
      return json(res, 503, { error: "outbox_unavailable" });
    }
  }
  const outboxReadMatch = url.pathname.match(/^\/api\/admin\/outbox\/([0-9a-f-]{36})$/i);
  if (outboxReadMatch) {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
    const session = await readSession(req);
    if (!session) return json(res, 401, { error: "admin_session_required" });
    try {
      const message = await localOutbox.read({ id: outboxReadMatch[1], actorId: session.identityId });
      if (!message) return json(res, 404, { error: "outbox_message_not_found" });
      if (message.expired) return json(res, 410, { error: "outbox_message_expired" });
      return json(res, 200, { message, notice: LOCAL_OUTBOX_LABEL });
    } catch (error) {
      console.error("Local outbox read failed.", error);
      return json(res, 503, { error: "outbox_unavailable" });
    }
  }
  if (url.pathname === "/api/admin/integrations") return integrationsApi.handleList(req, res, url);
  const integrationTestMatch = url.pathname.match(/^\/api\/admin\/integrations\/([^\/]+)\/test$/i);
  if (integrationTestMatch) return integrationsApi.handleTest(req, res, integrationTestMatch[1]);
  const integrationMatch = url.pathname.match(/^\/api\/admin\/integrations\/([^\/]+)$/i);
  if (integrationMatch) return integrationsApi.handleUpdate(req, res, integrationMatch[1]);
  if (url.pathname === "/api/catalog" || url.pathname === "/api/services") return serviceCatalogApi.handleList(req, res, url);
  const catalogMatch = url.pathname.match(/^\/api\/catalog\/([^\/]+)$/i) || url.pathname.match(/^\/api\/services\/([^\/]+)$/i);
  if (catalogMatch) return serviceCatalogApi.handleGet(req, res, catalogMatch[1]);
  if (url.pathname === "/api/faq") return faqApi.handleList(req, res, url);
  if (url.pathname === "/api/cases") return faqApi.handleCases(req, res, url);
  if (url.pathname === "/api/crm/companies") return crmApi.handleCompanies(req, res, url);
  if (url.pathname === "/api/crm/companies/export") return crmApi.handleExportCompanies(req, res, url);
  const crmCompanyMatch = url.pathname.match(/^\/api\/crm\/companies\/([0-9a-f-]{36})$/i);
  if (crmCompanyMatch) return crmApi.handleCompanyById(req, res, crmCompanyMatch[1]);
  if (url.pathname === "/api/crm/contacts") return crmApi.handleContacts(req, res, url);
  const crmContactMatch = url.pathname.match(/^\/api\/crm\/contacts\/([0-9a-f-]{36})$/i);
  if (crmContactMatch) return crmApi.handleContactById(req, res, crmContactMatch[1]);
  if (url.pathname === "/api/crm/units") return crmApi.handleUnits(req, res, url);
  const crmUnitMatch = url.pathname.match(/^\/api\/crm\/units\/([0-9a-f-]{36})$/i);
  if (crmUnitMatch) return crmApi.handleUnitById(req, res, crmUnitMatch[1]);
  if (url.pathname === "/api/crm/cadences/templates") return crmCadenceApi.handleTemplates(req, res);
  const crmCadenceTemplateMatch = url.pathname.match(/^\/api\/crm\/cadences\/templates\/([0-9a-f-]{36})$/i);
  if (crmCadenceTemplateMatch) return crmCadenceApi.handleTemplate(req, res, crmCadenceTemplateMatch[1]);
  if (url.pathname === "/api/crm/opportunities") return crmApi.handleOpportunities(req, res, url);
  const crmCadenceOptOutMatch = url.pathname.match(/^\/api\/crm\/opportunities\/([0-9a-f-]{36})\/cadence-contact$/i);
  if (crmCadenceOptOutMatch) return crmCadenceApi.handleOptOut(req, res, crmCadenceOptOutMatch[1]);
  const crmCadenceOpportunityMatch = url.pathname.match(/^\/api\/crm\/opportunities\/([0-9a-f-]{36})\/cadences$/i);
  if (crmCadenceOpportunityMatch) return crmCadenceApi.handleOpportunity(req, res, crmCadenceOpportunityMatch[1]);
  const crmTaskDelegationMatch = url.pathname.match(/^\/api\/crm\/opportunities\/([0-9a-f-]{36})\/tasks\/([0-9a-f-]{36})\/delegation$/i);
  if (crmTaskDelegationMatch) return crmTaskApi.handleDelegation(req, res, crmTaskDelegationMatch[1], crmTaskDelegationMatch[2]);
  const crmTaskMatch = url.pathname.match(/^\/api\/crm\/opportunities\/([0-9a-f-]{36})\/tasks(?:\/([0-9a-f-]{36}))?$/i);
  if (crmTaskMatch) return crmTaskApi.handleTasks(req, res, crmTaskMatch[1], crmTaskMatch[2] || null, url);
  if (url.pathname === "/api/crm/tasks/delegated") return crmTaskApi.handleDelegatedList(req, res, url);
  const crmDelegatedResponseMatch = url.pathname.match(/^\/api\/crm\/tasks\/delegated\/([0-9a-f-]{36})\/response$/i);
  if (crmDelegatedResponseMatch) return crmTaskApi.handleDelegatedResponse(req, res, crmDelegatedResponseMatch[1]);
  const crmDelegatedItemMatch = url.pathname.match(/^\/api\/crm\/tasks\/delegated\/([0-9a-f-]{36})$/i);
  if (crmDelegatedItemMatch) return crmTaskApi.handleDelegatedItem(req, res, crmDelegatedItemMatch[1]);
  if (url.pathname === "/api/crm/visits/agenda") return crmVisitApi.handleAgenda(req, res, url);
  const crmVisitParticipantMatch = url.pathname.match(/^\/api\/crm\/opportunities\/([0-9a-f-]{36})\/visits\/([0-9a-f-]{36})\/participants\/([0-9a-f-]{36})$/i);
  if (crmVisitParticipantMatch) return crmVisitApi.handleVisits(req, res, crmVisitParticipantMatch[1], crmVisitParticipantMatch[2], 'participants', crmVisitParticipantMatch[3], url);
  const crmVisitParticipantsMatch = url.pathname.match(/^\/api\/crm\/opportunities\/([0-9a-f-]{36})\/visits\/([0-9a-f-]{36})\/participants$/i);
  if (crmVisitParticipantsMatch) return crmVisitApi.handleVisits(req, res, crmVisitParticipantsMatch[1], crmVisitParticipantsMatch[2], 'participants', null, url);
  const crmVisitResponseMatch = url.pathname.match(/^\/api\/crm\/opportunities\/([0-9a-f-]{36})\/visits\/([0-9a-f-]{36})\/response$/i);
  if (crmVisitResponseMatch) return crmVisitApi.handleVisits(req, res, crmVisitResponseMatch[1], crmVisitResponseMatch[2], 'response', null, url);
  const crmVisitItemMatch = url.pathname.match(/^\/api\/crm\/opportunities\/([0-9a-f-]{36})\/visits\/([0-9a-f-]{36})$/i);
  if (crmVisitItemMatch) return crmVisitApi.handleVisits(req, res, crmVisitItemMatch[1], crmVisitItemMatch[2], null, null, url);
  const crmVisitsMatch = url.pathname.match(/^\/api\/crm\/opportunities\/([0-9a-f-]{36})\/visits$/i);
  if (crmVisitsMatch) return crmVisitApi.handleVisits(req, res, crmVisitsMatch[1], null, null, null, url);
  const crmInteractionAttachmentDownloadMatch = url.pathname.match(/^\/api\/crm\/opportunities\/([0-9a-f-]{36})\/interactions\/([0-9a-f-]{36})\/attachments\/([0-9a-f-]{36})\/download$/i);
  if (crmInteractionAttachmentDownloadMatch) return crmInteractionApi(req, res, crmInteractionAttachmentDownloadMatch[1], crmInteractionAttachmentDownloadMatch[2], crmInteractionAttachmentDownloadMatch[3], 'download', url);
  const crmInteractionAttachmentsMatch = url.pathname.match(/^\/api\/crm\/opportunities\/([0-9a-f-]{36})\/interactions\/([0-9a-f-]{36})\/attachments$/i);
  if (crmInteractionAttachmentsMatch) return crmInteractionApi(req, res, crmInteractionAttachmentsMatch[1], crmInteractionAttachmentsMatch[2], null, 'attachments', url);
  const crmInteractionItemMatch = url.pathname.match(/^\/api\/crm\/opportunities\/([0-9a-f-]{36})\/interactions\/([0-9a-f-]{36})$/i);
  if (crmInteractionItemMatch) return crmInteractionApi(req, res, crmInteractionItemMatch[1], crmInteractionItemMatch[2], null, null, url);
  const crmInteractionMatch = url.pathname.match(/^\/api\/crm\/opportunities\/([0-9a-f-]{36})\/interactions$/i);
  if (crmInteractionMatch) return crmInteractionApi(req, res, crmInteractionMatch[1], null, null, null, url);
  const crmNoteMatch = url.pathname.match(/^\/api\/crm\/opportunities\/([0-9a-f-]{36})\/notes(?:\/([0-9a-f-]{36}))?$/i);
  if (crmNoteMatch) return crmNoteApi(req, res, crmNoteMatch[1], crmNoteMatch[2] || null, url);
  const crmOppMatch = url.pathname.match(/^\/api\/crm\/opportunities\/([0-9a-f-]{36})$/i);
  if (crmOppMatch) return crmApi.handleOpportunityById(req, res, crmOppMatch[1]);
  const crmLeadConvertMatch = url.pathname.match(/^\/api\/crm\/leads\/([0-9a-f-]{36})\/convert$/i);
  if (crmLeadConvertMatch) return crmApi.handleLeadConvert(req, res, crmLeadConvertMatch[1]);
  if (url.pathname === "/api/crm/imports") return crmApi.handleImportsList(req, res, url);
  if (url.pathname === "/api/crm/imports/preview") return crmApi.handleImportPreview(req, res);
  // CRM-03: superfície dedicada de revisão de deduplicação.
  const crmImportDuplicatesMatch = url.pathname.match(/^\/api\/crm\/imports\/([0-9a-f-]{36})\/duplicates$/i);
  if (crmImportDuplicatesMatch) return crmApi.handleImportDuplicates(req, res, crmImportDuplicatesMatch[1]);
  const crmImportRowMatch = url.pathname.match(/^\/api\/crm\/imports\/([0-9a-f-]{36})\/rows\/(\d{1,7})$/i);
  if (crmImportRowMatch) return crmApi.handleImportRowDecision(req, res, crmImportRowMatch[1], crmImportRowMatch[2]);
  const crmImportCommitMatch = url.pathname.match(/^\/api\/crm\/imports\/([0-9a-f-]{36})\/commit$/i);
  if (crmImportCommitMatch) return crmApi.handleImportById(req, res, crmImportCommitMatch[1], url);
  const crmImportMatch = url.pathname.match(/^\/api\/crm\/imports\/([0-9a-f-]{36})$/i);
  if (crmImportMatch) return crmApi.handleImportById(req, res, crmImportMatch[1], url);
  if (url.pathname === "/api/crm/equipment") {
    if (req.method === "GET") return equipmentApi.handleList(req, res, url);
    if (req.method === "POST") return equipmentApi.handleCreate(req, res);
    return json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }
  const equipmentMatch = url.pathname.match(/^\/api\/crm\/equipment\/([^\/]+)$/i);
  if (equipmentMatch) return equipmentApi.handleGet(req, res, equipmentMatch[1]);
  if (url.pathname === "/api/crm/inspection-templates") return inspectionApi.handleTemplates(req, res, url);
  if (url.pathname === "/api/crm/inspections") return inspectionApi.handleInspections(req, res, url);
  const inspectionAnswerMatch = url.pathname.match(/^\/api\/crm\/inspections\/([0-9a-f-]{36})\/answers$/i);
  if (inspectionAnswerMatch) return inspectionApi.handleAnswer(req, res, inspectionAnswerMatch[1]);
  const inspectionMatch = url.pathname.match(/^\/api\/crm\/inspections\/([0-9a-f-]{36})$/i);
  if (inspectionMatch) return inspectionApi.handleInspectionById(req, res, inspectionMatch[1]);
  if (url.pathname === "/api/crm/labor-budgets") return laborBudgetApi.handleBudgets(req, res, url);
  const laborBudgetItemsMatch = url.pathname.match(/^\/api\/crm\/labor-budgets\/([0-9a-f-]{36})\/items$/i);
  if (laborBudgetItemsMatch) return laborBudgetApi.handleItems(req, res, laborBudgetItemsMatch[1]);
  const laborBudgetMatch = url.pathname.match(/^\/api\/crm\/labor-budgets\/([0-9a-f-]{36})$/i);
  if (laborBudgetMatch) return laborBudgetApi.handleBudgetById(req, res, laborBudgetMatch[1]);
  if (url.pathname === "/api/crm/technical-budgets") return technicalBudgetApi.handleBudgets(req, res, url);
  const technicalBudgetItemsMatch = url.pathname.match(/^\/api\/crm\/technical-budgets\/([0-9a-f-]{36})\/items$/i);
  if (technicalBudgetItemsMatch) return technicalBudgetApi.handleItems(req, res, technicalBudgetItemsMatch[1]);
  const technicalBudgetMatch = url.pathname.match(/^\/api\/crm\/technical-budgets\/([0-9a-f-]{36})$/i);
  if (technicalBudgetMatch) return technicalBudgetApi.handleBudgetById(req, res, technicalBudgetMatch[1]);
  if (url.pathname === "/api/crm/cost-parameters/essential-check") return costParameterApi.handleEssentialCheck(req, res);
  if (url.pathname === "/api/crm/cost-parameters") return costParameterApi.handleParams(req, res, url);
  const costParamMatch = url.pathname.match(/^\/api\/crm\/cost-parameters\/([0-9a-f-]{36})$/i);
  if (costParamMatch) return costParameterApi.handleParamById(req, res, costParamMatch[1]);
  if (url.pathname === "/api/crm/price-scenarios") return priceScenarioApi.handleScenarios(req, res, url);
  const priceScenarioMatch = url.pathname.match(/^\/api\/crm\/price-scenarios\/([0-9a-f-]{36})$/i);
  if (priceScenarioMatch) return priceScenarioApi.handleScenarioById(req, res, priceScenarioMatch[1]);
  if (url.pathname === "/api/crm/discount-policies") return discountApi.handlePolicies(req, res, url);
  const discountPolicyMatch = url.pathname.match(/^\/api\/crm\/discount-policies\/([0-9a-f-]{36})$/i);
  if (discountPolicyMatch) return discountApi.handlePolicyById(req, res, discountPolicyMatch[1]);
  if (url.pathname === "/api/crm/discount-requests") return discountApi.handleRequests(req, res, url);
  const discountRequestMatch = url.pathname.match(/^\/api\/crm\/discount-requests\/([0-9a-f-]{36})$/i);
  if (discountRequestMatch) return discountApi.handleRequestById(req, res, discountRequestMatch[1]);
  if (url.pathname === "/api/crm/proposals") return proposalApi.handleProposals(req, res, url);
  const proposalPdfMatch = url.pathname.match(/^\/api\/crm\/proposals\/([0-9a-f-]{36})\/pdf$/i);
  if (proposalPdfMatch) return proposalApi.handlePdf(req, res, proposalPdfMatch[1]);
  const proposalVersionsMatch = url.pathname.match(/^\/api\/crm\/proposals\/([0-9a-f-]{36})\/versions$/i);
  if (proposalVersionsMatch) return proposalApi.handleVersions(req, res, proposalVersionsMatch[1]);
  const proposalVersionMatch = url.pathname.match(/^\/api\/crm\/proposals\/([0-9a-f-]{36})\/versions\/([0-9]+)$/i);
  if (proposalVersionMatch) return proposalApi.handleVersionByNumber(req, res, proposalVersionMatch[1], proposalVersionMatch[2]);
  const proposalItemsMatch = url.pathname.match(/^\/api\/crm\/proposals\/([0-9a-f-]{36})\/items$/i);
  if (proposalItemsMatch) return proposalApi.handleItems(req, res, proposalItemsMatch[1]);
  const proposalDeliveriesMatch = url.pathname.match(/^\/api\/crm\/proposal-deliveries$/i);
  if (proposalDeliveriesMatch) return proposalDeliveryApi.handleDeliveries(req, res, url);
  const proposalDeliveryMatch = url.pathname.match(/^\/api\/crm\/proposal-deliveries\/([0-9a-f-]{36})$/i);
  if (proposalDeliveryMatch) return proposalDeliveryApi.handleDeliveryById(req, res, proposalDeliveryMatch[1]);
  if (url.pathname === "/api/crm/proposal-acceptance-links") return proposalAcceptanceApi.handleLinks(req, res, url);
  const acceptanceLinkMatch = url.pathname.match(/^\/api\/crm\/proposal-acceptance-links\/([0-9a-f-]{36})$/i);
  if (acceptanceLinkMatch) return proposalAcceptanceApi.handleLinkById(req, res, acceptanceLinkMatch[1]);
  const acceptByTokenMatch = url.pathname.match(/^\/api\/crm\/proposals\/accept\/([^\/]+)$/i);
  if (acceptByTokenMatch) return proposalAcceptanceApi.handleAcceptByToken(req, res, acceptByTokenMatch[1]);
  if (url.pathname === "/api/crm/reports") return reportApi.handleAllReports(req, res, url);
  if (url.pathname === "/api/crm/reports/conversion") return reportApi.handleConversion(req, res, url);
  if (url.pathname === "/api/crm/reports/sales-cycle") return reportApi.handleSalesCycle(req, res, url);
  if (url.pathname === "/api/crm/reports/overdue-tasks") return reportApi.handleOverdueTasks(req, res, url);
  if (url.pathname === "/api/crm/reports/loss-reasons") return reportApi.handleLossReasons(req, res, url);
  if (url.pathname === "/api/crm/reports/pipeline") return reportApi.handlePipeline(req, res, url);
  if (url.pathname === "/api/crm/reports/weighted-forecast") return reportApi.handleWeightedForecast(req, res, url);
  if (url.pathname === "/api/crm/goals") return commissionApi.handleGoals(req, res, url);
  const goalMatch = url.pathname.match(/^\/api\/crm\/goals\/([0-9a-f-]{36})$/i);
  if (goalMatch) return commissionApi.handleGoalById(req, res, goalMatch[1]);
  if (url.pathname === "/api/crm/commission-rules") return commissionApi.handleRules(req, res, url);
  const ruleMatch = url.pathname.match(/^\/api\/crm\/commission-rules\/([0-9a-f-]{36})$/i);
  if (ruleMatch) return commissionApi.handleRuleById(req, res, ruleMatch[1]);
  if (url.pathname === "/api/crm/commissions") return commissionApi.handleCommissions(req, res, url);
  const commissionMatch = url.pathname.match(/^\/api\/crm\/commissions\/([0-9a-f-]{36})$/i);
  if (commissionMatch) return commissionApi.handleCommissionById(req, res, commissionMatch[1]);
  if (url.pathname === "/api/crm/commercial-library") return commercialApi.handleLibrary(req, res, url);
  const libraryMatch = url.pathname.match(/^\/api\/crm\/commercial-library\/([0-9a-f-]{36})$/i);
  if (libraryMatch) return commercialApi.handleLibraryById(req, res, libraryMatch[1]);
  if (url.pathname === "/api/crm/campaigns") return commercialApi.handleCampaigns(req, res, url);
  const campaignTargetsMatch = url.pathname.match(/^\/api\/crm\/campaigns\/([0-9a-f-]{36})\/targets$/i);
  if (campaignTargetsMatch) return commercialApi.handleCampaignTargets(req, res, campaignTargetsMatch[1]);
  const campaignMatch = url.pathname.match(/^\/api\/crm\/campaigns\/([0-9a-f-]{36})$/i);
  if (campaignMatch) return commercialApi.handleCampaignById(req, res, campaignMatch[1]);
  if (url.pathname === "/api/crm/proposal-comparisons") return commercialApi.handleComparisons(req, res, url);
  const comparisonMatch = url.pathname.match(/^\/api\/crm\/proposal-comparisons\/([0-9a-f-]{36})$/i);
  if (comparisonMatch) return commercialApi.handleComparisonById(req, res, comparisonMatch[1]);
  if (url.pathname === "/api/crm/partners") return partnershipApi.handlePartners(req, res, url);
  const partnerMatch = url.pathname.match(/^\/api\/crm\/partners\/([0-9a-f-]{36})$/i);
  if (partnerMatch) return partnershipApi.handlePartnerById(req, res, partnerMatch[1]);
  if (url.pathname === "/api/crm/referrals") return partnershipApi.handleReferrals(req, res, url);
  const referralMatch = url.pathname.match(/^\/api\/crm\/referrals\/([0-9a-f-]{36})$/i);
  if (referralMatch) return partnershipApi.handleReferralById(req, res, referralMatch[1]);
  if (url.pathname === "/api/crm/renewals") return partnershipApi.handleRenewals(req, res, url);
  const renewalMatch = url.pathname.match(/^\/api\/crm\/renewals\/([0-9a-f-]{36})$/i);
  if (renewalMatch) return partnershipApi.handleRenewalById(req, res, renewalMatch[1]);
  if (url.pathname === "/api/crm/partnership-metrics") return partnershipApi.handleMetrics(req, res, url);
  // L05 is the only public server boundary for the commercial contract domain.
  // Legacy contract handlers remain for historical code references but are not
  // reachable through HTTP, preventing bypasses of the L05 scope/audit rules.
  if (url.pathname === "/api/crm/contracts" || url.pathname.startsWith("/api/crm/contracts/")) {
    return contractL05Api.handle(req, res, url);
  }
  const contractPostsMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/posts$/i);
  if (contractPostsMatch) return contractDetailsApi.handlePosts(req, res, contractPostsMatch[1]);
  const contractSlaMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/sla$/i);
  if (contractSlaMatch) return contractDetailsApi.handleSla(req, res, contractSlaMatch[1]);
  const contractObligMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/obligations$/i);
  if (contractObligMatch) return contractDetailsApi.handleObligations(req, res, contractObligMatch[1]);
  const contractExclMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/exclusions$/i);
  if (contractExclMatch) return contractDetailsApi.handleExclusions(req, res, contractExclMatch[1]);
  const contractSchedMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/schedule$/i);
  if (contractSchedMatch) return contractDetailsApi.handleSchedule(req, res, contractSchedMatch[1]);
  const contractStatusHistoryMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/status-history$/i);
  if (contractStatusHistoryMatch) return contractStatusApi.handleStatusHistory(req, res, contractStatusHistoryMatch[1]);
  const contractStatusMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/status$/i);
  if (contractStatusMatch) return contractStatusApi.handleStatusTransition(req, res, contractStatusMatch[1]);
  const contractSignatureMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/signature$/i);
  if (contractSignatureMatch) return contractStatusApi.handleSignatureEvent(req, res, contractSignatureMatch[1]);
  const contractAmendmentDetailMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/amendments\/([0-9a-f-]{36})$/i);
  if (contractAmendmentDetailMatch) return contractAmendmentApi.handleAmendmentById(req, res, contractAmendmentDetailMatch[1], contractAmendmentDetailMatch[2]);
  const contractAmendmentsMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/amendments$/i);
  if (contractAmendmentsMatch) return contractAmendmentApi.handleAmendments(req, res, contractAmendmentsMatch[1]);
  const contractAlertRuleDetailMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/alert-rules\/([0-9a-f-]{36})$/i);
  if (contractAlertRuleDetailMatch) return contractAlertApi.handleAlertRuleById(req, res, contractAlertRuleDetailMatch[1], contractAlertRuleDetailMatch[2]);
  const contractAlertRulesMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/alert-rules$/i);
  if (contractAlertRulesMatch) return contractAlertApi.handleAlertRules(req, res, contractAlertRulesMatch[1]);
  const contractAlertDetailMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/alerts\/([0-9a-f-]{36})$/i);
  if (contractAlertDetailMatch) return contractAlertApi.handleAlertById(req, res, contractAlertDetailMatch[1], contractAlertDetailMatch[2]);
  const contractAlertsMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/alerts$/i);
  if (contractAlertsMatch) return contractAlertApi.handleAlerts(req, res, contractAlertsMatch[1]);
  const contractDocObligDetailMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/doc-obligations\/([0-9a-f-]{36})$/i);
  if (contractDocObligDetailMatch) return contractDocObligationApi.handleObligationById(req, res, contractDocObligDetailMatch[1], contractDocObligDetailMatch[2]);
  const contractDocObligMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/doc-obligations$/i);
  if (contractDocObligMatch) return contractDocObligationApi.handleObligations(req, res, contractDocObligMatch[1]);
  const companyDocObligMatch = url.pathname.match(/^\/api\/crm\/companies\/([0-9a-f-]{36})\/doc-obligations$/i);
  if (companyDocObligMatch) return contractDocObligationApi.handleByCompany(req, res, companyDocObligMatch[1]);
  const implantationStepMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/implantation\/steps\/([^\/]+)$/i);
  if (implantationStepMatch) return contractImplantationApi.handleStepById(req, res, implantationStepMatch[1], implantationStepMatch[2]);
  const implantationStepsMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/implantation\/steps$/i);
  if (implantationStepsMatch) return contractImplantationApi.handleSteps(req, res, implantationStepsMatch[1]);
  const implantationBlockResolveMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/implantation\/blocks\/([0-9a-f-]{36})\/resolve$/i);
  if (implantationBlockResolveMatch) return contractImplantationApi.handleBlockResolve(req, res, implantationBlockResolveMatch[1], implantationBlockResolveMatch[2]);
  const implantationBlocksMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/implantation\/blocks$/i);
  if (implantationBlocksMatch) return contractImplantationApi.handleBlocks(req, res, implantationBlocksMatch[1]);
  const implantationExceptionDetailMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/implantation\/exceptions\/([0-9a-f-]{36})$/i);
  if (implantationExceptionDetailMatch) return contractImplantationApi.handleExceptionById(req, res, implantationExceptionDetailMatch[1], implantationExceptionDetailMatch[2]);
  const implantationExceptionsMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/implantation\/exceptions$/i);
  if (implantationExceptionsMatch) return contractImplantationApi.handleExceptions(req, res, implantationExceptionsMatch[1]);
  const contractImplantMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/implantation$/i);
  if (contractImplantMatch) return contractImplantationApi.handleImplantation(req, res, contractImplantMatch[1]);
  const closureStepsMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/closure\/steps$/i);
  if (closureStepsMatch) return contractClosureApi.handleSteps(req, res, closureStepsMatch[1]);
  const closureRevocationsMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/closure\/revocations$/i);
  if (closureRevocationsMatch) return contractClosureApi.handleRevocations(req, res, closureRevocationsMatch[1]);
  const closureMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/closure$/i);
  if (closureMatch) return contractClosureApi.handleClosure(req, res, closureMatch[1]);
  // CON-10 fiscal dossier
  if (url.pathname === "/api/crm/management-diary/search" || url.pathname === "/api/crm/management-diary") {
    return contractManagementDiaryApi.handleSearch(req, res);
  }
  const fiscalEvidenceMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/fiscal-dossiers\/([0-9a-f-]{36})\/evidences$/i);
  if (fiscalEvidenceMatch) return contractFiscalApi.handleEvidences(req, res, fiscalEvidenceMatch[1], fiscalEvidenceMatch[2]);
  const fiscalMeasurementByIdMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/fiscal-dossiers\/([0-9a-f-]{36})\/measurements\/([0-9a-f-]{36})$/i);
  if (fiscalMeasurementByIdMatch) return contractFiscalApi.handleMeasurementById(req, res, fiscalMeasurementByIdMatch[1], fiscalMeasurementByIdMatch[2], fiscalMeasurementByIdMatch[3]);
  const fiscalMeasurementsMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/fiscal-dossiers\/([0-9a-f-]{36})\/measurements$/i);
  if (fiscalMeasurementsMatch) return contractFiscalApi.handleMeasurements(req, res, fiscalMeasurementsMatch[1], fiscalMeasurementsMatch[2]);
  const fiscalDossierByIdMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/fiscal-dossiers\/([0-9a-f-]{36})$/i);
  if (fiscalDossierByIdMatch) return contractFiscalApi.handleDossierById(req, res, fiscalDossierByIdMatch[1], fiscalDossierByIdMatch[2]);
  const fiscalDossiersMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/fiscal-dossiers$/i);
  if (fiscalDossiersMatch) return contractFiscalApi.handleDossiers(req, res, fiscalDossiersMatch[1]);
  // CON-11 management diary
  const diaryByIdMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/management-diary\/([0-9a-f-]{36})$/i);
  if (diaryByIdMatch) return contractManagementDiaryApi.handleDiaryById(req, res, diaryByIdMatch[1], diaryByIdMatch[2]);
  const diaryMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/management-diary$/i);
  if (diaryMatch) return contractManagementDiaryApi.handleDiary(req, res, diaryMatch[1]);
  // PLT-05 notification preferences/templates
  if (url.pathname === "/api/crm/notification-preferences" || url.pathname === "/api/admin/notification-preferences") {
    return notificationPreferencesApi.handlePreferences(req, res);
  }
  const notifTemplateByIdMatch = url.pathname.match(/^\/api\/crm\/notification-templates\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/admin\/notification-templates\/([0-9a-f-]{36})$/i);
  if (notifTemplateByIdMatch) return notificationPreferencesApi.handleTemplateById(req, res, notifTemplateByIdMatch[1]);
  if (url.pathname === "/api/crm/notification-templates" || url.pathname === "/api/admin/notification-templates") {
    return notificationPreferencesApi.handleTemplates(req, res);
  }
  if (url.pathname === "/api/crm/contracts/from-proposal") return contractApi.handleCreateFromProposal(req, res);
  const contractUnitsMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/units$/i);
  if (contractUnitsMatch) return contractApi.handleContractUnits(req, res, contractUnitsMatch[1]);
  const contractResponsiblesMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/responsibles$/i);
  if (contractResponsiblesMatch) return contractApi.handleContractResponsibles(req, res, contractResponsiblesMatch[1]);
  const contractDocsMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})\/documents$/i);
  if (contractDocsMatch) return contractApi.handleContractDocuments(req, res, contractDocsMatch[1]);
  const crmContractMatch = url.pathname.match(/^\/api\/crm\/contracts\/([0-9a-f-]{36})$/i);
  if (crmContractMatch) return contractApi.handleContractById(req, res, crmContractMatch[1]);
  if (url.pathname === "/api/crm/contracts") return contractApi.handleContracts(req, res, url);
  const proposalMatch = url.pathname.match(/^\/api\/crm\/proposals\/([0-9a-f-]{36})$/i);
  if (proposalMatch) return proposalApi.handleProposalById(req, res, proposalMatch[1]);
  // PLT-06 observability
  if (url.pathname === "/api/admin/observability" || url.pathname === "/api/crm/observability") {
    return observabilityApi.handleMetrics(req, res);
  }
  const obsAlertMatch = url.pathname.match(/^\/api\/admin\/observability\/alerts\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/crm\/observability\/alerts\/([0-9a-f-]{36})$/i);
  if (obsAlertMatch) return observabilityApi.handleAlertAction(req, res, obsAlertMatch[1]);
  if (url.pathname === "/api/admin/observability/metrics" || url.pathname === "/api/crm/observability/metrics") {
    return observabilityApi.handleMetrics(req, res);
  }
  // PLT-07 healthcheck/liveness/readiness
  if (url.pathname === "/api/health/live" || url.pathname === "/api/health/liveness" || url.pathname === "/health/live") {
    return healthcheckApi.handleLive(req, res);
  }
  if (url.pathname === "/api/health/ready" || url.pathname === "/api/health/readiness" || url.pathname === "/health/ready") {
    return healthcheckApi.handleReady(req, res);
  }
  if (url.pathname === "/api/health" || url.pathname === "/health" || url.pathname === "/api/healthcheck") {
    return healthcheckApi.handleHealth(req, res);
  }
  if (url.pathname === "/api/admin/operational" || url.pathname === "/api/admin/health" || url.pathname === "/api/crm/operational") {
    if (url.searchParams.get('history') === 'true' || url.searchParams.get('type') === 'history') {
      return healthcheckApi.handleOperationalHistory(req, res);
    }
    return healthcheckApi.handleHealth(req, res);
  }
  if (url.pathname === "/api/admin/operational/history" || url.pathname === "/api/crm/operational/history") {
    return healthcheckApi.handleOperationalHistory(req, res);
  }
  // PLT-08 backup
  if (url.pathname === "/api/admin/backups" || url.pathname === "/api/crm/backups") {
    return backupApi.handleBackupJobs(req, res);
  }
  const backupByIdMatch = url.pathname.match(/^\/api\/admin\/backups\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/crm\/backups\/([0-9a-f-]{36})$/i);
  if (backupByIdMatch) return backupApi.handleBackupById(req, res, backupByIdMatch[1]);
  if (url.pathname === "/api/admin/backups/restores" || url.pathname === "/api/crm/backups/restores" || url.pathname === "/api/admin/backups/restore" || url.pathname === "/api/crm/backups/restore") {
    return backupApi.handleRestore(req, res);
  }
  if (url.pathname === "/api/admin/backups/retention" || url.pathname === "/api/crm/backups/retention") {
    return backupApi.handleRetention(req, res);
  }
  // PLT-09 privacy
  if (url.pathname === "/api/admin/privacy/inventory" || url.pathname === "/api/crm/privacy/inventory" || url.pathname === "/api/privacy/inventory") {
    return privacyApi.handleInventory(req, res);
  }
  const privacyPolicyByIdMatch = url.pathname.match(/^\/api\/admin\/privacy\/policies\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/crm\/privacy\/policies\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/privacy\/policies\/([0-9a-f-]{36})$/i);
  if (privacyPolicyByIdMatch) return privacyApi.handlePolicyById(req, res, privacyPolicyByIdMatch[1]);
  if (url.pathname === "/api/admin/privacy/policies" || url.pathname === "/api/crm/privacy/policies" || url.pathname === "/api/privacy/policies" || url.pathname === "/api/privacy") {
    return privacyApi.handlePolicies(req, res);
  }
  // PLT-10 LGPD requests
  if (url.pathname === "/api/lgpd/requests" || url.pathname === "/api/privacy/requests" || url.pathname === "/api/public/lgpd" || url.pathname === "/api/admin/lgpd/requests" || url.pathname === "/api/crm/lgpd/requests" || url.pathname === "/api/admin/privacy/requests") {
    return lgpdRequestApi.handleRequests(req, res);
  }
  const lgpdByIdMatch = url.pathname.match(/^\/api\/admin\/lgpd\/requests\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/crm\/lgpd\/requests\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/admin\/privacy\/requests\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/lgpd\/requests\/([0-9a-f-]{36})$/i);
  if (lgpdByIdMatch) return lgpdRequestApi.handleRequestById(req, res, lgpdByIdMatch[1]);
  // PLT-11 retention
  if (url.pathname === "/api/admin/retention/policies" || url.pathname === "/api/crm/retention/policies" || url.pathname === "/api/privacy/retention/policies" || url.pathname === "/api/admin/privacy/retention") {
    return retentionApi.handlePolicies(req, res);
  }
  if (url.pathname === "/api/admin/retention/exceptions" || url.pathname === "/api/crm/retention/exceptions" || url.pathname === "/api/privacy/retention/exceptions") {
    return retentionApi.handleExceptions(req, res);
  }
  const retentionExcByIdMatch = url.pathname.match(/^\/api\/admin\/retention\/exceptions\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/crm\/retention\/exceptions\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/privacy\/retention\/exceptions\/([0-9a-f-]{36})$/i);
  if (retentionExcByIdMatch) return retentionApi.handleExceptionById(req, res, retentionExcByIdMatch[1]);
  if (url.pathname === "/api/admin/retention/disposal/jobs" || url.pathname === "/api/crm/retention/disposal/jobs" || url.pathname === "/api/admin/disposal/jobs" || url.pathname === "/api/privacy/disposal/jobs") {
    return retentionApi.handleJobs(req, res);
  }
  const disposalJobByIdMatch = url.pathname.match(/^\/api\/admin\/retention\/disposal\/jobs\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/crm\/retention\/disposal\/jobs\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/admin\/disposal\/jobs\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/privacy\/disposal\/jobs\/([0-9a-f-]{36})$/i);
  if (disposalJobByIdMatch) return retentionApi.handleJobById(req, res, disposalJobByIdMatch[1]);
  if (url.pathname === "/api/admin/retention/disposal/logs" || url.pathname === "/api/crm/retention/disposal/logs" || url.pathname === "/api/admin/disposal/logs" || url.pathname === "/api/privacy/disposal/logs") {
    return retentionApi.handleLogs(req, res);
  }
  // PLT-12 incident response
  if (url.pathname === "/api/admin/incidents" || url.pathname === "/api/crm/incidents" || url.pathname === "/api/security/incidents") {
    return incidentApi.handleIncidents(req, res);
  }
  const incidentByIdMatch = url.pathname.match(/^\/api\/admin\/incidents\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/crm\/incidents\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/security\/incidents\/([0-9a-f-]{36})$/i);
  if (incidentByIdMatch) return incidentApi.handleIncidentById(req, res, incidentByIdMatch[1]);
  if (url.pathname === "/api/admin/incidents/evidences" || url.pathname === "/api/crm/incidents/evidences" || url.pathname === "/api/security/incidents/evidences") {
    return incidentApi.handleEvidences(req, res);
  }
  if (url.pathname === "/api/admin/incidents/actions" || url.pathname === "/api/crm/incidents/actions" || url.pathname === "/api/security/incidents/actions") {
    return incidentApi.handleActions(req, res);
  }
  if (url.pathname === "/api/admin/incidents/communications" || url.pathname === "/api/crm/incidents/communications" || url.pathname === "/api/security/incidents/communications") {
    return incidentApi.handleCommunications(req, res);
  }
  // PLT-13 config flags maintenance rollout
  if (url.pathname === "/api/admin/config/flags" || url.pathname === "/api/crm/config/flags" || url.pathname === "/api/config/flags") {
    return configApi.handleFlags(req, res);
  }
  const configFlagByIdMatch = url.pathname.match(/^\/api\/admin\/config\/flags\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/crm\/config\/flags\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/config\/flags\/([0-9a-f-]{36})$/i);
  if (configFlagByIdMatch) return configApi.handleFlagById(req, res, configFlagByIdMatch[1]);
  if (url.pathname === "/api/admin/config/maintenance" || url.pathname === "/api/crm/config/maintenance" || url.pathname === "/api/config/maintenance") {
    return configApi.handleMaintenance(req, res);
  }
  if (url.pathname === "/api/admin/config/rollouts" || url.pathname === "/api/crm/config/rollouts" || url.pathname === "/api/config/rollouts") {
    return configApi.handleRollouts(req, res);
  }
  // PLT-14 dependencies
  if (url.pathname === "/api/admin/dependencies/audits" || url.pathname === "/api/crm/dependencies/audits" || url.pathname === "/api/dependencies/audits") {
    return dependencyApi.handleAudits(req, res);
  }
  if (url.pathname === "/api/admin/dependencies/vulnerabilities" || url.pathname === "/api/crm/dependencies/vulnerabilities" || url.pathname === "/api/dependencies/vulnerabilities") {
    return dependencyApi.handleVulns(req, res);
  }
  if (url.pathname === "/api/admin/dependencies/updates" || url.pathname === "/api/crm/dependencies/updates" || url.pathname === "/api/dependencies/updates") {
    return dependencyApi.handleUpdates(req, res);
  }
  if (url.pathname === "/api/admin/dependencies/lockfile" || url.pathname === "/api/crm/dependencies/lockfile" || url.pathname === "/api/dependencies/lockfile") {
    return dependencyApi.handleLockfile(req, res);
  }
  // PLT-15 integration logs webhooks reconciliation
  if (url.pathname === "/api/admin/integrations/jobs" || url.pathname === "/api/crm/integrations/jobs" || url.pathname === "/api/integrations/jobs") {
    return integrationLogApi.handleJobs(req, res);
  }
  if (url.pathname === "/api/admin/integrations/logs" || url.pathname === "/api/crm/integrations/logs" || url.pathname === "/api/integrations/logs") {
    return integrationLogApi.handleLogs(req, res);
  }
  if (url.pathname === "/api/admin/integrations/webhooks" || url.pathname === "/api/crm/integrations/webhooks" || url.pathname === "/api/integrations/webhooks") {
    return integrationLogApi.handleWebhooks(req, res);
  }
  if (url.pathname === "/api/admin/integrations/webhooks/deliveries" || url.pathname === "/api/crm/integrations/webhooks/deliveries" || url.pathname === "/api/integrations/webhooks/deliveries") {
    return integrationLogApi.handleWebhookDeliveries(req, res);
  }
  if (url.pathname === "/api/admin/integrations/reconciliation" || url.pathname === "/api/crm/integrations/reconciliation" || url.pathname === "/api/integrations/reconciliation") {
    return integrationLogApi.handleReconciliation(req, res);
  }
  // PLT-16 operational budget usage alerts
  if (url.pathname === "/api/admin/budgets" || url.pathname === "/api/crm/budgets" || url.pathname === "/api/budgets") {
    return budgetApi.handleBudgets(req, res);
  }
  if (url.pathname === "/api/admin/usage/metrics" || url.pathname === "/api/crm/usage/metrics" || url.pathname === "/api/usage/metrics") {
    return budgetApi.handleMetrics(req, res);
  }
  if (url.pathname === "/api/admin/usage/alerts" || url.pathname === "/api/crm/usage/alerts" || url.pathname === "/api/usage/alerts") {
    return budgetApi.handleAlerts(req, res);
  }
  // PLT-17 env isolation
  if (url.pathname === "/api/admin/environments" || url.pathname === "/api/crm/environments" || url.pathname === "/api/environments") {
    return envApi.handleEnvs(req, res);
  }
  if (url.pathname === "/api/admin/environments/checks" || url.pathname === "/api/crm/environments/checks" || url.pathname === "/api/environments/checks") {
    return envApi.handleChecks(req, res);
  }
  // PLT-18 maintenance docs
  if (url.pathname === "/api/admin/maintenance/docs" || url.pathname === "/api/crm/maintenance/docs" || url.pathname === "/api/maintenance/docs" || url.pathname === "/api/docs") {
    return maintenanceDocApi.handleDocs(req, res);
  }
  const maintDocByIdMatch = url.pathname.match(/^\/api\/admin\/maintenance\/docs\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/crm\/maintenance\/docs\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/maintenance\/docs\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/docs\/([0-9a-f-]{36})$/i);
  if (maintDocByIdMatch) return maintenanceDocApi.handleDocById(req, res, maintDocByIdMatch[1]);
  // HR-01 cadastro profissional separado de login
  if (url.pathname === "/api/admin/hr/employees" || url.pathname === "/api/crm/hr/employees" || url.pathname === "/api/hr/employees") {
    return hrApi.handleEmployees(req, res);
  }
  const hrEmpByIdMatch = url.pathname.match(/^\/api\/admin\/hr\/employees\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/crm\/hr\/employees\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/hr\/employees\/([0-9a-f-]{36})$/i);
  if (hrEmpByIdMatch) return hrApi.handleEmployeeById(req, res, hrEmpByIdMatch[1]);
  if (url.pathname === "/api/admin/hr/admissions" || url.pathname === "/api/crm/hr/admissions" || url.pathname === "/api/hr/admissions") {
    return hrApi.handleAdmissions(req, res);
  }
  const hrAdmissionByIdMatch = url.pathname.match(/^\/api\/admin\/hr\/admissions\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/crm\/hr\/admissions\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/hr\/admissions\/([0-9a-f-]{36})$/i);
  if (hrAdmissionByIdMatch) return hrApi.handleAdmissionById(req, res, hrAdmissionByIdMatch[1]);
  if (url.pathname === "/api/admin/hr/admission-progress" || url.pathname === "/api/crm/hr/admission-progress" || url.pathname === "/api/hr/admission-progress") {
    return hrApi.handleAdmissionProgress(req, res);
  }
  // EMP-01 perfil próprio
  if (url.pathname === "/api/employee/profile" || url.pathname === "/api/crm/employee/profile" || url.pathname === "/api/admin/employee/profile" || url.pathname === "/api/hr/my-profile" || url.pathname === "/api/admin/hr/my-profile") {
    return empProfileApi.handleMyProfile(req, res);
  }
  if (url.pathname === "/api/admin/hr/profile-updates" || url.pathname === "/api/crm/hr/profile-updates" || url.pathname === "/api/hr/profile-updates" || url.pathname === "/api/admin/employee/profile-updates") {
    return empProfileApi.handleUpdateRequests(req, res);
  }
  // HR-03 recrutamento
  if (url.pathname === "/api/admin/hr/vacancies" || url.pathname === "/api/crm/hr/vacancies" || url.pathname === "/api/hr/vacancies") {
    return hrRecruitmentApi.handleVacancies(req, res);
  }
  if (url.pathname === "/api/admin/hr/candidates" || url.pathname === "/api/crm/hr/candidates" || url.pathname === "/api/hr/candidates") {
    return hrRecruitmentApi.handleCandidates(req, res);
  }
  if (url.pathname === "/api/admin/hr/interviews" || url.pathname === "/api/crm/hr/interviews" || url.pathname === "/api/hr/interviews") {
    return hrRecruitmentApi.handleInterviews(req, res);
  }
  if (url.pathname === "/api/admin/hr/talent-pool" || url.pathname === "/api/crm/hr/talent-pool" || url.pathname === "/api/hr/talent-pool") {
    return hrRecruitmentApi.handleTalentPool(req, res);
  }
  if (url.pathname === "/api/admin/hr/dossiers" || url.pathname === "/api/crm/hr/dossiers" || url.pathname === "/api/hr/dossiers" || url.pathname === "/api/admin/hr/employee-dossiers") {
    return hrRecruitmentApi.handleDossiers(req, res);
  }
  // HR-07 desligamento
  if (url.pathname === "/api/admin/hr/terminations" || url.pathname === "/api/crm/hr/terminations" || url.pathname === "/api/hr/terminations") {
    return hrTerminationApi.handleTerminations(req, res);
  }
  const hrTerminationByIdMatch = url.pathname.match(/^\/api\/admin\/hr\/terminations\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/crm\/hr\/terminations\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/hr\/terminations\/([0-9a-f-]{36})$/i);
  if (hrTerminationByIdMatch) return hrTerminationApi.handleTerminationById(req, res, hrTerminationByIdMatch[1]);
  if (url.pathname === "/api/admin/hr/termination-progress" || url.pathname === "/api/crm/hr/termination-progress" || url.pathname === "/api/hr/termination-progress") {
    return hrTerminationApi.handleTerminationProgress(req, res);
  }
  if (url.pathname === "/api/admin/hr/status-policies" || url.pathname === "/api/crm/hr/status-policies" || url.pathname === "/api/hr/status-policies") {
    return hrTerminationApi.handleStatusPolicies(req, res);
  }
  if (url.pathname === "/api/admin/hr/vacation-periods" || url.pathname === "/api/crm/hr/vacation-periods" || url.pathname === "/api/hr/vacation-periods") {
    return hrTerminationApi.handleVacationPeriods(req, res);
  }
  if (url.pathname === "/api/admin/hr/vacation-requests" || url.pathname === "/api/crm/hr/vacation-requests" || url.pathname === "/api/hr/vacation-requests") {
    return hrTerminationApi.handleVacationRequests(req, res);
  }
  // HR-10 afastamentos
  if (url.pathname === "/api/admin/hr/absences" || url.pathname === "/api/crm/hr/absences" || url.pathname === "/api/hr/absences") {
    return hrAbsenceApi.handleAbsences(req, res);
  }
  if (url.pathname === "/api/admin/hr/time-entries" || url.pathname === "/api/crm/hr/time-entries" || url.pathname === "/api/hr/time-entries") {
    return hrAbsenceApi.handleTimeEntries(req, res);
  }
  if (url.pathname === "/api/admin/hr/time-corrections" || url.pathname === "/api/crm/hr/time-corrections" || url.pathname === "/api/hr/time-corrections") {
    return hrAbsenceApi.handleTimeCorrections(req, res);
  }
  if (url.pathname === "/api/admin/hr/competence-closures" || url.pathname === "/api/crm/hr/competence-closures" || url.pathname === "/api/hr/competence-closures") {
    return hrAbsenceApi.handleCompetenceClosures(req, res);
  }
  if (url.pathname === "/api/admin/hr/work-rules" || url.pathname === "/api/crm/hr/work-rules" || url.pathname === "/api/hr/work-rules") {
    return hrAbsenceApi.handleWorkRules(req, res);
  }
  if (url.pathname === "/api/admin/hr/hour-bank" || url.pathname === "/api/crm/hr/hour-bank" || url.pathname === "/api/hr/hour-bank") {
    return hrAbsenceApi.handleHourBank(req, res);
  }
  if (url.pathname === "/api/admin/hr/hour-movements" || url.pathname === "/api/crm/hr/hour-movements" || url.pathname === "/api/hr/hour-movements") {
    return hrAbsenceApi.handleHourMovements(req, res);
  }
  // HR-13 benefícios
  if (url.pathname === "/api/admin/hr/benefit-catalog" || url.pathname === "/api/crm/hr/benefit-catalog" || url.pathname === "/api/hr/benefit-catalog") {
    return hrBenefitsApi.handleBenefitCatalog(req, res);
  }
  if (url.pathname === "/api/admin/hr/benefit-enrollments" || url.pathname === "/api/crm/hr/benefit-enrollments" || url.pathname === "/api/hr/benefit-enrollments") {
    return hrBenefitsApi.handleBenefitEnrollments(req, res);
  }
  if (url.pathname === "/api/admin/hr/benefit-requests" || url.pathname === "/api/crm/hr/benefit-requests" || url.pathname === "/api/hr/benefit-requests") {
    return hrBenefitsApi.handleBenefitRequests(req, res);
  }
  if (url.pathname === "/api/admin/hr/benefit-conferences" || url.pathname === "/api/crm/hr/benefit-conferences" || url.pathname === "/api/hr/benefit-conferences") {
    return hrBenefitsApi.handleBenefitConferences(req, res);
  }
  if (url.pathname === "/api/admin/hr/benefit-exports" || url.pathname === "/api/crm/hr/benefit-exports" || url.pathname === "/api/hr/benefit-exports") {
    return hrBenefitsApi.handleBenefitExports(req, res);
  }
  // HR-14 adiantamentos/reembolsos
  if (url.pathname === "/api/admin/hr/advance-policies" || url.pathname === "/api/crm/hr/advance-policies" || url.pathname === "/api/hr/advance-policies") {
    return hrBenefitsApi.handleAdvancePolicies(req, res);
  }
  if (url.pathname === "/api/admin/hr/advance-requests" || url.pathname === "/api/crm/hr/advance-requests" || url.pathname === "/api/hr/advance-requests") {
    return hrBenefitsApi.handleAdvanceRequests(req, res);
  }
  // HR-15 saúde ocupacional
  if (url.pathname === "/api/admin/hr/occupational-requirements" || url.pathname === "/api/crm/hr/occupational-requirements" || url.pathname === "/api/hr/occupational-requirements") {
    return hrBenefitsApi.handleOccupationalRequirements(req, res);
  }
  if (url.pathname === "/api/admin/hr/occupational-agenda" || url.pathname === "/api/crm/hr/occupational-agenda" || url.pathname === "/api/hr/occupational-agenda") {
    return hrBenefitsApi.handleOccupationalAgenda(req, res);
  }
  if (url.pathname === "/api/admin/hr/occupational-documents" || url.pathname === "/api/crm/hr/occupational-documents" || url.pathname === "/api/hr/occupational-documents") {
    return hrBenefitsApi.handleOccupationalDocuments(req, res);
  }
  // HR-16 integração contabilidade/SST
  if (url.pathname === "/api/admin/hr/integration-exports" || url.pathname === "/api/crm/hr/integration-exports" || url.pathname === "/api/hr/integration-exports") {
    return hrBenefitsApi.handleIntegrationExports(req, res);
  }
  if (url.pathname === "/api/admin/hr/integration-receipts" || url.pathname === "/api/crm/hr/integration-receipts" || url.pathname === "/api/hr/integration-receipts") {
    return hrBenefitsApi.handleIntegrationReceipts(req, res);
  }
  if (url.pathname === "/api/admin/hr/integration-errors" || url.pathname === "/api/crm/hr/integration-errors" || url.pathname === "/api/hr/integration-errors") {
    return hrBenefitsApi.handleIntegrationErrors(req, res);
  }
  // HR-17 treinamento
  if (url.pathname === "/api/admin/hr/training-catalog" || url.pathname === "/api/crm/hr/training-catalog" || url.pathname === "/api/hr/training-catalog") {
    return hrTrainingApi.handleTrainingCatalog(req, res);
  }
  if (url.pathname === "/api/admin/hr/training-requirements" || url.pathname === "/api/crm/hr/training-requirements" || url.pathname === "/api/hr/training-requirements") {
    return hrTrainingApi.handleTrainingRequirements(req, res);
  }
  if (url.pathname === "/api/admin/hr/training-sessions" || url.pathname === "/api/crm/hr/training-sessions" || url.pathname === "/api/hr/training-sessions") {
    return hrTrainingApi.handleTrainingSessions(req, res);
  }
  if (url.pathname === "/api/admin/hr/training-enrollments" || url.pathname === "/api/crm/hr/training-enrollments" || url.pathname === "/api/hr/training-enrollments") {
    return hrTrainingApi.handleTrainingEnrollments(req, res);
  }
  // HR-18 competências
  if (url.pathname === "/api/admin/hr/competency-catalog" || url.pathname === "/api/crm/hr/competency-catalog" || url.pathname === "/api/hr/competency-catalog") {
    return hrTrainingApi.handleCompetencyCatalog(req, res);
  }
  if (url.pathname === "/api/admin/hr/competency-requirements" || url.pathname === "/api/crm/hr/competency-requirements" || url.pathname === "/api/hr/competency-requirements") {
    return hrTrainingApi.handleCompetencyRequirements(req, res);
  }
  if (url.pathname === "/api/admin/hr/employee-competencies" || url.pathname === "/api/crm/hr/employee-competencies" || url.pathname === "/api/hr/employee-competencies") {
    return hrTrainingApi.handleEmployeeCompetencies(req, res);
  }
  if (url.pathname === "/api/admin/hr/competency-evaluations" || url.pathname === "/api/crm/hr/competency-evaluations" || url.pathname === "/api/hr/competency-evaluations") {
    return hrTrainingApi.handleCompetencyEvaluations(req, res);
  }
  // HR-19 uniformes/EPI
  if (url.pathname === "/api/admin/hr/uniform-catalog" || url.pathname === "/api/crm/hr/uniform-catalog" || url.pathname === "/api/hr/uniform-catalog") {
    return hrTrainingApi.handleUniformCatalog(req, res);
  }
  if (url.pathname === "/api/admin/hr/uniform-deliveries" || url.pathname === "/api/crm/hr/uniform-deliveries" || url.pathname === "/api/hr/uniform-deliveries") {
    return hrTrainingApi.handleUniformDeliveries(req, res);
  }
  if (url.pathname === "/api/admin/hr/uniform-returns" || url.pathname === "/api/crm/hr/uniform-returns" || url.pathname === "/api/hr/uniform-returns") {
    return hrTrainingApi.handleUniformReturns(req, res);
  }
  if (url.pathname === "/api/admin/hr/uniform-requests" || url.pathname === "/api/crm/hr/uniform-requests" || url.pathname === "/api/hr/uniform-requests") {
    return hrTrainingApi.handleUniformRequests(req, res);
  }
  // HR-20 fechamento DP
  if (url.pathname === "/api/admin/hr/dp-closures" || url.pathname === "/api/crm/hr/dp-closures" || url.pathname === "/api/hr/dp-closures") {
    return hrTrainingApi.handleDpClosures(req, res);
  }
  if (url.pathname === "/api/admin/hr/dp-variables" || url.pathname === "/api/crm/hr/dp-variables" || url.pathname === "/api/hr/dp-variables") {
    return hrTrainingApi.handleDpVariables(req, res);
  }
  if (url.pathname === "/api/admin/hr/dp-documents" || url.pathname === "/api/crm/hr/dp-documents" || url.pathname === "/api/hr/dp-documents") {
    return hrTrainingApi.handleDpDocuments(req, res);
  }
  if (url.pathname === "/api/admin/hr/dp-exports" || url.pathname === "/api/crm/hr/dp-exports" || url.pathname === "/api/hr/dp-exports") {
    return hrTrainingApi.handleDpExports(req, res);
  }
  // HR-21 holerites/informes fonte autorizada
  if (url.pathname === "/api/admin/hr/payroll-sources" || url.pathname === "/api/crm/hr/payroll-sources" || url.pathname === "/api/hr/payroll-sources") {
    return hrAdvancedApi.handlePayrollSources(req, res);
  }
  if (url.pathname === "/api/admin/hr/payroll-imports" || url.pathname === "/api/crm/hr/payroll-imports" || url.pathname === "/api/hr/payroll-imports") {
    return hrAdvancedApi.handlePayrollImports(req, res);
  }
  if (url.pathname === "/api/admin/hr/payroll-documents" || url.pathname === "/api/crm/hr/payroll-documents" || url.pathname === "/api/hr/payroll-documents") {
    return hrAdvancedApi.handlePayrollDocuments(req, res);
  }
  // HR-22 avaliações planos desenvolvimento
  if (url.pathname === "/api/admin/hr/evaluation-criteria" || url.pathname === "/api/crm/hr/evaluation-criteria" || url.pathname === "/api/hr/evaluation-criteria") {
    return hrAdvancedApi.handleEvaluationCriteria(req, res);
  }
  if (url.pathname === "/api/admin/hr/evaluations" || url.pathname === "/api/crm/hr/evaluations" || url.pathname === "/api/hr/evaluations") {
    return hrAdvancedApi.handleEvaluations(req, res);
  }
  if (url.pathname === "/api/admin/hr/development-plans" || url.pathname === "/api/crm/hr/development-plans" || url.pathname === "/api/hr/development-plans") {
    return hrAdvancedApi.handleDevPlans(req, res);
  }
  if (url.pathname === "/api/admin/hr/development-actions" || url.pathname === "/api/crm/hr/development-actions" || url.pathname === "/api/hr/development-actions") {
    return hrAdvancedApi.handleDevActions(req, res);
  }
  // HR-23 atendimento interno
  if (url.pathname === "/api/admin/hr/support-tickets" || url.pathname === "/api/crm/hr/support-tickets" || url.pathname === "/api/hr/support-tickets") {
    return hrAdvancedApi.handleSupportTickets(req, res);
  }
  if (url.pathname === "/api/admin/hr/support-messages" || url.pathname === "/api/crm/hr/support-messages" || url.pathname === "/api/hr/support-messages") {
    return hrAdvancedApi.handleSupportMessages(req, res);
  }
  if (url.pathname === "/api/admin/hr/support-attachments" || url.pathname === "/api/crm/hr/support-attachments" || url.pathname === "/api/hr/support-attachments") {
    return hrAdvancedApi.handleSupportAttachments(req, res);
  }
  // HR-24 indicadores
  if (url.pathname === "/api/admin/hr/indicator-definitions" || url.pathname === "/api/crm/hr/indicator-definitions" || url.pathname === "/api/hr/indicator-definitions") {
    return hrAdvancedApi.handleIndicatorDefinitions(req, res);
  }
  if (url.pathname === "/api/admin/hr/indicator-snapshots" || url.pathname === "/api/crm/hr/indicator-snapshots" || url.pathname === "/api/hr/indicator-snapshots") {
    return hrAdvancedApi.handleIndicatorSnapshots(req, res);
  }
  // EMP-02 próximo plantão
  if (url.pathname === "/api/admin/hr/shift-assignments" || url.pathname === "/api/crm/hr/shift-assignments" || url.pathname === "/api/hr/shift-assignments") {
    return empPortalApi.handleShiftAssignments(req, res);
  }
  // EMP-03 escala
  if (url.pathname === "/api/admin/hr/schedule-versions" || url.pathname === "/api/crm/hr/schedule-versions" || url.pathname === "/api/hr/schedule-versions") {
    return empPortalApi.handleScheduleVersions(req, res);
  }
  if (url.pathname === "/api/admin/hr/schedule-entries" || url.pathname === "/api/crm/hr/schedule-entries" || url.pathname === "/api/hr/schedule-entries") {
    return empPortalApi.handleScheduleEntries(req, res);
  }
  // EMP-04 jornada individual
  if (url.pathname === "/api/admin/hr/journey-proofs" || url.pathname === "/api/crm/hr/journey-proofs" || url.pathname === "/api/hr/journey-proofs") {
    return empPortalApi.handleJourneyProofs(req, res);
  }
  if (url.pathname === "/api/admin/hr/journey-corrections" || url.pathname === "/api/crm/hr/journey-corrections" || url.pathname === "/api/hr/journey-corrections") {
    return empPortalApi.handleJourneyCorrections(req, res);
  }
  // EMP-05 aviso ausência/atraso
  if (url.pathname === "/api/admin/hr/absence-notices" || url.pathname === "/api/crm/hr/absence-notices" || url.pathname === "/api/hr/absence-notices") {
    return empPortalApi.handleAbsenceNotices(req, res);
  }
  if (url.pathname === "/api/admin/hr/absence-followups" || url.pathname === "/api/crm/hr/absence-followups" || url.pathname === "/api/hr/absence-followups") {
    return empPortalApi.handleAbsenceFollowups(req, res);
  }
  // EMP-06 troca plantão
  if (url.pathname === "/api/admin/hr/shift-swaps" || url.pathname === "/api/crm/hr/shift-swaps" || url.pathname === "/api/hr/shift-swaps") {
    return empOpsApi.handleShiftSwaps(req, res);
  }
  // EMP-07 passagem serviço
  if (url.pathname === "/api/admin/hr/handover-records" || url.pathname === "/api/crm/hr/handover-records" || url.pathname === "/api/hr/handover-records") {
    return empOpsApi.handleHandovers(req, res);
  }
  // EMP-08 ocorrência
  if (url.pathname === "/api/admin/hr/occurrences" || url.pathname === "/api/crm/hr/occurrences" || url.pathname === "/api/hr/occurrences") {
    return empOpsApi.handleOccurrences(req, res);
  }
  if (url.pathname === "/api/admin/hr/occurrence-attachments" || url.pathname === "/api/crm/hr/occurrence-attachments" || url.pathname === "/api/hr/occurrence-attachments") {
    return empOpsApi.handleOccurrenceAttachments(req, res);
  }
  if (url.pathname === "/api/admin/hr/occurrence-actions" || url.pathname === "/api/crm/hr/occurrence-actions" || url.pathname === "/api/hr/occurrence-actions") {
    return empOpsApi.handleOccurrenceActions(req, res);
  }
  // EMP-09 procedimentos posto
  if (url.pathname === "/api/admin/hr/post-procedures" || url.pathname === "/api/crm/hr/post-procedures" || url.pathname === "/api/hr/post-procedures") {
    return empOpsApi.handlePostProcedures(req, res);
  }
  if (url.pathname === "/api/admin/hr/procedure-acks" || url.pathname === "/api/crm/hr/procedure-acks" || url.pathname === "/api/hr/procedure-acks") {
    return empOpsApi.handleProcedureAcks(req, res);
  }
  if (url.pathname === "/api/admin/hr/support-contacts-ops" || url.pathname === "/api/crm/hr/support-contacts-ops" || url.pathname === "/api/hr/support-contacts-ops") {
    return empOpsApi.handleSupportContacts(req, res);
  }
  // EMP-10 documentos solicitados
  if (url.pathname === "/api/admin/hr/document-submissions" || url.pathname === "/api/crm/hr/document-submissions" || url.pathname === "/api/hr/document-submissions") {
    return empSelfApi.handleDocumentSubmissions(req, res);
  }
  // EMP-11 holerites próprios acesso privado histórico disponibilização fonte autorizada
  if (url.pathname === "/api/admin/hr/own-doc-access-logs" || url.pathname === "/api/crm/hr/own-doc-access-logs" || url.pathname === "/api/hr/own-doc-access-logs") {
    return empSelfApi.handleOwnDocAccessLogs(req, res);
  }
  if (url.pathname === "/api/admin/hr/doc-availability" || url.pathname === "/api/crm/hr/doc-availability" || url.pathname === "/api/hr/doc-availability") {
    return empSelfApi.handleDocAvailability(req, res);
  }
  // EMP-12 férias/afastamentos/benefícios/reembolsos
  if (url.pathname === "/api/admin/hr/self-requests" || url.pathname === "/api/crm/hr/self-requests" || url.pathname === "/api/hr/self-requests") {
    return empSelfApi.handleSelfRequests(req, res);
  }
  if (url.pathname === "/api/admin/hr/self-request-followups" || url.pathname === "/api/crm/hr/self-request-followups" || url.pathname === "/api/hr/self-request-followups") {
    return empSelfApi.handleSelfRequestFollowups(req, res);
  }
  // EMP-13 uniformes/EPI entrega recibo solicitação troca devolução
  if (url.pathname === "/api/admin/hr/uniform-self-requests" || url.pathname === "/api/crm/hr/uniform-self-requests" || url.pathname === "/api/hr/uniform-self-requests") {
    return empSelfApi.handleUniformSelfRequests(req, res);
  }
  if (url.pathname === "/api/admin/hr/uniform-receipts" || url.pathname === "/api/crm/hr/uniform-receipts" || url.pathname === "/api/hr/uniform-receipts") {
    return empSelfApi.handleUniformReceipts(req, res);
  }
  // EMP-14 cursos e reciclagens
  if (url.pathname === "/api/admin/hr/course-enrollments" || url.pathname === "/api/crm/hr/course-enrollments" || url.pathname === "/api/hr/course-enrollments") {
    return empAdvanced2Api.handleCourseEnrollments(req, res);
  }
  if (url.pathname === "/api/admin/hr/course-proofs" || url.pathname === "/api/crm/hr/course-proofs" || url.pathname === "/api/hr/course-proofs") {
    return empAdvanced2Api.handleCourseProofs(req, res);
  }
  if (url.pathname === "/api/admin/hr/course-alerts" || url.pathname === "/api/crm/hr/course-alerts" || url.pathname === "/api/hr/course-alerts" || url.pathname === "/api/admin/hr/course-expiry-alerts" || url.pathname === "/api/crm/hr/course-expiry-alerts" || url.pathname === "/api/hr/course-expiry-alerts") {
    return empAdvanced2Api.handleCourseAlerts(req, res);
  }
  // EMP-15 comunicados direcionados
  if (url.pathname === "/api/admin/hr/communications" || url.pathname === "/api/crm/hr/communications" || url.pathname === "/api/hr/communications") {
    return empAdvanced2Api.handleCommunications(req, res);
  }
  if (url.pathname === "/api/admin/hr/communication-reads" || url.pathname === "/api/crm/hr/communication-reads" || url.pathname === "/api/hr/communication-reads") {
    return empAdvanced2Api.handleCommunicationReads(req, res);
  }
  if (url.pathname === "/api/admin/hr/notifications-center" || url.pathname === "/api/crm/hr/notifications-center" || url.pathname === "/api/hr/notifications-center" || url.pathname === "/api/employee/notifications" || url.pathname === "/api/hr/my-notifications") {
    return empAdvanced2Api.handleNotificationsCenter(req, res);
  }
  // EMP-16 atendimento RH
  if (url.pathname === "/api/admin/hr/hr-tickets" || url.pathname === "/api/crm/hr/hr-tickets" || url.pathname === "/api/hr/hr-tickets" || url.pathname === "/api/admin/hr/employee-hr-tickets") {
    return empAdvanced2Api.handleHrTickets(req, res);
  }
  if (url.pathname === "/api/admin/hr/hr-messages" || url.pathname === "/api/crm/hr/hr-messages" || url.pathname === "/api/hr/hr-messages" || url.pathname === "/api/admin/hr/employee-hr-messages") {
    return empAdvanced2Api.handleHrMessages(req, res);
  }
  if (url.pathname === "/api/admin/hr/hr-attachments" || url.pathname === "/api/crm/hr/hr-attachments" || url.pathname === "/api/hr/hr-attachments" || url.pathname === "/api/admin/hr/employee-hr-attachments") {
    return empAdvanced2Api.handleHrAttachments(req, res);
  }
  // EMP-17 canal confidencial
  if (url.pathname === "/api/admin/hr/confidential-policies" || url.pathname === "/api/crm/hr/confidential-policies" || url.pathname === "/api/hr/confidential-policies") {
    return empAdvanced2Api.handleConfidentialPolicies(req, res);
  }
  if (url.pathname === "/api/admin/hr/confidential-reports" || url.pathname === "/api/crm/hr/confidential-reports" || url.pathname === "/api/hr/confidential-reports") {
    return empAdvanced2Api.handleConfidentialReports(req, res);
  }
  if (url.pathname === "/api/admin/hr/confidential-messages" || url.pathname === "/api/crm/hr/confidential-messages" || url.pathname === "/api/hr/confidential-messages") {
    return empAdvanced2Api.handleConfidentialMessages(req, res);
  }
  if (url.pathname === "/api/admin/hr/confidential-attachments" || url.pathname === "/api/crm/hr/confidential-attachments" || url.pathname === "/api/hr/confidential-attachments") {
    return empAdvanced2Api.handleConfidentialAttachments(req, res);
  }
  // EMP-18 PWA instalável e fila offline limitada
  if (url.pathname === "/api/pwa/manifest.json" || url.pathname === "/api/hr/pwa-manifest" || url.pathname === "/manifest.json") {
    return empPwaApi.handleManifest(req, res);
  }
  if (url.pathname === "/api/pwa/sw.js" || url.pathname === "/api/hr/pwa-sw" || url.pathname === "/sw.js") {
    return empPwaApi.handleServiceWorker(req, res);
  }
  if (url.pathname === "/api/pwa/offline" || url.pathname === "/offline.html") {
    return empPwaApi.handleOfflinePage(req, res);
  }
  if (url.pathname === "/api/admin/hr/pwa-configs" || url.pathname === "/api/crm/hr/pwa-configs" || url.pathname === "/api/hr/pwa-configs") {
    return empPwaApi.handlePwaConfigs(req, res);
  }
  if (url.pathname === "/api/admin/hr/offline-queue" || url.pathname === "/api/crm/hr/offline-queue" || url.pathname === "/api/hr/offline-queue") {
    return empPwaApi.handleOfflineQueue(req, res);
  }
  if (url.pathname === "/api/admin/hr/offline-conflicts" || url.pathname === "/api/crm/hr/offline-conflicts" || url.pathname === "/api/hr/offline-conflicts") {
    return empPwaApi.handleOfflineConflicts(req, res);
  }
  // EMP-19 FAQ interna acessível
  if (url.pathname === "/api/admin/hr/faq-internal" || url.pathname === "/api/crm/hr/faq-internal" || url.pathname === "/api/hr/faq-internal" || url.pathname === "/api/employee/faq") {
    return empPwaApi.handleFaqInternal(req, res);
  }
  if (url.pathname === "/api/admin/hr/faq-access-logs" || url.pathname === "/api/crm/hr/faq-access-logs" || url.pathname === "/api/hr/faq-access-logs") {
    return empPwaApi.handleFaqAccessLogs(req, res);
  }
  if (url.pathname === "/api/admin/hr/accessibility-preferences" || url.pathname === "/api/crm/hr/accessibility-preferences" || url.pathname === "/api/hr/accessibility-preferences" || url.pathname === "/api/employee/accessibility") {
    return empPwaApi.handleAccessibilityPreferences(req, res);
  }
  // OPS-01 estrutura cliente → unidade → posto físico → necessidade por turno → alocação; cargo/função entidade própria
  if (url.pathname === "/api/admin/hr/ops-job-roles" || url.pathname === "/api/crm/hr/ops-job-roles" || url.pathname === "/api/hr/ops-job-roles" || url.pathname === "/api/ops/job-roles") {
    return opsApi.handleJobRoles(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-posts" || url.pathname === "/api/crm/hr/ops-posts" || url.pathname === "/api/hr/ops-posts" || url.pathname === "/api/ops/posts") {
    return opsApi.handlePosts(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-shift-templates" || url.pathname === "/api/crm/hr/ops-shift-templates" || url.pathname === "/api/hr/ops-shift-templates" || url.pathname === "/api/ops/shift-templates") {
    return opsApi.handleShiftTemplates(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-post-shift-needs" || url.pathname === "/api/crm/hr/ops-post-shift-needs" || url.pathname === "/api/hr/ops-post-shift-needs" || url.pathname === "/api/ops/post-shift-needs") {
    return opsApi.handlePostShiftNeeds(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-allocations" || url.pathname === "/api/crm/hr/ops-allocations" || url.pathname === "/api/hr/ops-allocations" || url.pathname === "/api/ops/allocations") {
    return opsApi.handleAllocations(req, res);
  }
  // OPS-02 dimensionamento
  if (url.pathname === "/api/admin/hr/ops-dimensioning" || url.pathname === "/api/crm/hr/ops-dimensioning" || url.pathname === "/api/hr/ops-dimensioning" || url.pathname === "/api/ops/dimensioning") {
    return opsApi.handleDimensioning(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-coverage-gaps" || url.pathname === "/api/crm/hr/ops-coverage-gaps" || url.pathname === "/api/hr/ops-coverage-gaps" || url.pathname === "/api/ops/coverage-gaps") {
    return opsApi.handleCoverageGaps(req, res);
  }
  // OPS-03 escala rascunho/publicada/revisada
  if (url.pathname === "/api/admin/hr/ops-schedule-versions" || url.pathname === "/api/crm/hr/ops-schedule-versions" || url.pathname === "/api/hr/ops-schedule-versions" || url.pathname === "/api/ops/schedule-versions") {
    return opsApi.handleScheduleVersions(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-schedule-entries" || url.pathname === "/api/crm/hr/ops-schedule-entries" || url.pathname === "/api/hr/ops-schedule-entries" || url.pathname === "/api/ops/schedule-entries") {
    return opsApi.handleScheduleEntries(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-schedule-acks" || url.pathname === "/api/crm/hr/ops-schedule-acks" || url.pathname === "/api/hr/ops-schedule-acks" || url.pathname === "/api/ops/schedule-acks") {
    return opsApi.handleScheduleAcks(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-schedule-history" || url.pathname === "/api/crm/hr/ops-schedule-history" || url.pathname === "/api/hr/ops-schedule-history" || url.pathname === "/api/ops/schedule-history") {
    return opsApi.handleScheduleHistory(req, res);
  }
  // OPS-04 regras jornada/descanso + qualificações + validações
  if (url.pathname === "/api/admin/hr/ops-work-rules" || url.pathname === "/api/crm/hr/ops-work-rules" || url.pathname === "/api/hr/ops-work-rules" || url.pathname === "/api/ops/work-rules") {
    return opsApi.handleWorkRules(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-qualifications" || url.pathname === "/api/crm/hr/ops-qualifications" || url.pathname === "/api/hr/ops-qualifications" || url.pathname === "/api/ops/qualifications") {
    return opsApi.handleQualifications(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-validations" || url.pathname === "/api/crm/hr/ops-validations" || url.pathname === "/api/hr/ops-validations" || url.pathname === "/api/ops/validations") {
    return opsApi.handleValidations(req, res);
  }
  // OPS-05 cobertura ausências pendência aprovação decisão humana + candidatos disponibilidade/qualificação distância score + comunicação
  if (url.pathname === "/api/admin/hr/ops-coverage-requests" || url.pathname === "/api/crm/hr/ops-coverage-requests" || url.pathname === "/api/hr/ops-coverage-requests" || url.pathname === "/api/ops/coverage-requests") {
    return opsAdvancedApi.handleCoverageRequests(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-substitution-candidates" || url.pathname === "/api/crm/hr/ops-substitution-candidates" || url.pathname === "/api/hr/ops-substitution-candidates" || url.pathname === "/api/ops/substitution-candidates") {
    return opsAdvancedApi.handleSubstitutionCandidates(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-coverage-communications" || url.pathname === "/api/crm/hr/ops-coverage-communications" || url.pathname === "/api/hr/ops-coverage-communications" || url.pathname === "/api/ops/coverage-communications") {
    return opsAdvancedApi.handleCoverageCommunications(req, res);
  }
  // OPS-06 passagem posto origem/destino pendências chaves equipamentos ocorrências status aceite/escalonamento
  if (url.pathname === "/api/admin/hr/ops-handovers" || url.pathname === "/api/crm/hr/ops-handovers" || url.pathname === "/api/hr/ops-handovers" || url.pathname === "/api/ops/handovers") {
    return opsAdvancedApi.handleHandovers(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-handover-escalations" || url.pathname === "/api/crm/hr/ops-handover-escalations" || url.pathname === "/api/hr/ops-handover-escalations" || url.pathname === "/api/ops/handover-escalations") {
    return opsAdvancedApi.handleHandoverEscalations(req, res);
  }
  // OPS-07 livro ocorrências protocolo categoria/severidade privada retificação histórico imutável evidências proporcionais
  if (url.pathname === "/api/admin/hr/ops-occurrence-book" || url.pathname === "/api/crm/hr/ops-occurrence-book" || url.pathname === "/api/hr/ops-occurrence-book" || url.pathname === "/api/ops/occurrence-book") {
    return opsAdvancedApi.handleOccurrenceBook(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-occurrence-evidences" || url.pathname === "/api/crm/hr/ops-occurrence-evidences" || url.pathname === "/api/hr/ops-occurrence-evidences" || url.pathname === "/api/ops/occurrence-evidences") {
    return opsAdvancedApi.handleOccurrenceEvidences(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-occurrence-actions" || url.pathname === "/api/crm/hr/ops-occurrence-actions" || url.pathname === "/api/hr/ops-occurrence-actions" || url.pathname === "/api/ops/occurrence-actions") {
    return opsAdvancedApi.handleOccurrenceActions(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-occurrence-history" || url.pathname === "/api/crm/hr/ops-occurrence-history" || url.pathname === "/api/hr/ops-occurrence-history" || url.pathname === "/api/ops/occurrence-history") {
    return opsAdvancedApi.handleOccurrenceHistory(req, res);
  }
  // OPS-08 checklists versão frequência itens obrigatórios evidências proporcionais instâncias
  if (url.pathname === "/api/admin/hr/ops-checklist-templates" || url.pathname === "/api/crm/hr/ops-checklist-templates" || url.pathname === "/api/hr/ops-checklist-templates" || url.pathname === "/api/ops/checklist-templates") {
    return opsAdvancedApi.handleChecklistTemplates(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-checklist-instances" || url.pathname === "/api/crm/hr/ops-checklist-instances" || url.pathname === "/api/hr/ops-checklist-instances" || url.pathname === "/api/ops/checklist-instances") {
    return opsAdvancedApi.handleChecklistInstances(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-checklist-items" || url.pathname === "/api/crm/hr/ops-checklist-items" || url.pathname === "/api/hr/ops-checklist-items" || url.pathname === "/api/ops/checklist-items") {
    return opsAdvancedApi.handleChecklistItems(req, res);
  }
  // OPS-09 visitas supervisão, inspeções e planos ação prazo responsável verificação
  if (url.pathname === "/api/admin/hr/ops-supervision-visits" || url.pathname === "/api/crm/hr/ops-supervision-visits" || url.pathname === "/api/hr/ops-supervision-visits" || url.pathname === "/api/ops/supervision-visits") {
    return opsAdvanced2Api.handleSupervisionVisits(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-supervision-inspections" || url.pathname === "/api/crm/hr/ops-supervision-inspections" || url.pathname === "/api/hr/ops-supervision-inspections" || url.pathname === "/api/ops/supervision-inspections") {
    return opsAdvanced2Api.handleSupervisionInspections(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-supervision-action-plans" || url.pathname === "/api/crm/hr/ops-supervision-action-plans" || url.pathname === "/api/hr/ops-supervision-action-plans" || url.pathname === "/api/ops/supervision-action-plans") {
    return opsAdvanced2Api.handleSupervisionActionPlans(req, res);
  }
  // OPS-10 rondas pontos verificação prevenção replay localização indisponível evidência auditável GPS/QR isolado não prova execução
  if (url.pathname === "/api/admin/hr/ops-patrols" || url.pathname === "/api/crm/hr/ops-patrols" || url.pathname === "/api/hr/ops-patrols" || url.pathname === "/api/ops/patrols") {
    return opsAdvanced2Api.handlePatrols(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-patrol-points" || url.pathname === "/api/crm/hr/ops-patrol-points" || url.pathname === "/api/hr/ops-patrol-points" || url.pathname === "/api/ops/patrol-points" || url.pathname === "/api/ops/patrol-readings") {
    return opsAdvanced2Api.handlePatrolReadings(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-patrol-replay-logs" || url.pathname === "/api/crm/hr/ops-patrol-replay-logs" || url.pathname === "/api/hr/ops-patrol-replay-logs" || url.pathname === "/api/ops/patrol-replay-logs") {
    return opsAdvanced2Api.handlePatrolReplayLogs(req, res);
  }
  // OPS-11 chaves rádios materiais equipamentos guarda transferência devolução
  if (url.pathname === "/api/admin/hr/ops-keys" || url.pathname === "/api/crm/hr/ops-keys" || url.pathname === "/api/hr/ops-keys" || url.pathname === "/api/ops/keys") {
    return opsAdvanced2Api.handleKeys(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-key-movements" || url.pathname === "/api/crm/hr/ops-key-movements" || url.pathname === "/api/hr/ops-key-movements" || url.pathname === "/api/ops/key-movements") {
    return opsAdvanced2Api.handleKeyMovements(req, res);
  }
  // OPS-12 relatórios periódicos cliente revisão conteúdo privacidade
  if (url.pathname === "/api/admin/hr/ops-client-reports" || url.pathname === "/api/crm/hr/ops-client-reports" || url.pathname === "/api/hr/ops-client-reports" || url.pathname === "/api/ops/client-reports") {
    return opsAdvanced2Api.handleClientReports(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-client-report-attachments" || url.pathname === "/api/crm/hr/ops-client-report-attachments" || url.pathname === "/api/hr/ops-client-report-attachments" || url.pathname === "/api/ops/client-report-attachments") {
    return opsAdvanced2Api.handleClientReportAttachments(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-client-report-history" || url.pathname === "/api/crm/hr/ops-client-report-history" || url.pathname === "/api/hr/ops-client-report-history" || url.pathname === "/api/ops/client-report-history") {
    return opsAdvanced2Api.handleClientReportHistory(req, res);
  }
  // OPS-13 métricas cobertura tempo descoberto incidentes visitas reincidência fonte janela
  if (url.pathname === "/api/admin/hr/ops-metrics-definitions" || url.pathname === "/api/crm/hr/ops-metrics-definitions" || url.pathname === "/api/hr/ops-metrics-definitions" || url.pathname === "/api/ops/metrics-definitions") {
    return opsAdvanced3Api.handleMetricsDefinitions(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-metrics-snapshots" || url.pathname === "/api/crm/hr/ops-metrics-snapshots" || url.pathname === "/api/hr/ops-metrics-snapshots" || url.pathname === "/api/ops/metrics-snapshots") {
    return opsAdvanced3Api.handleMetricsSnapshots(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-metrics-reincidence" || url.pathname === "/api/crm/hr/ops-metrics-reincidence" || url.pathname === "/api/hr/ops-metrics-reincidence" || url.pathname === "/api/ops/metrics-reincidence") {
    return opsAdvanced3Api.handleMetricsReincidence(req, res);
  }
  // OPS-14 escalas assistidas/automáticas depois regras validadas conflitos motivos revisão humana antes publicar
  if (url.pathname === "/api/admin/hr/ops-assisted-proposals" || url.pathname === "/api/crm/hr/ops-assisted-proposals" || url.pathname === "/api/hr/ops-assisted-proposals" || url.pathname === "/api/ops/assisted-proposals" || url.pathname === "/api/ops/assisted-schedules") {
    return opsAdvanced3Api.handleAssistedSchedules(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-assisted-entries" || url.pathname === "/api/crm/hr/ops-assisted-entries" || url.pathname === "/api/hr/ops-assisted-entries" || url.pathname === "/api/ops/assisted-entries" || url.pathname === "/api/ops/assisted-schedule-entries") {
    return opsAdvanced3Api.handleAssistedScheduleEntries(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-assisted-conflicts" || url.pathname === "/api/crm/hr/ops-assisted-conflicts" || url.pathname === "/api/hr/ops-assisted-conflicts" || url.pathname === "/api/ops/assisted-conflicts") {
    return opsAdvanced3Api.handleAssistedConflicts(req, res);
  }
  // OPS-15 supervisão limpeza rotinas por ambiente consumo não conformidades
  if (url.pathname === "/api/admin/hr/ops-cleaning-environments" || url.pathname === "/api/crm/hr/ops-cleaning-environments" || url.pathname === "/api/hr/ops-cleaning-environments" || url.pathname === "/api/ops/cleaning-environments") {
    return opsAdvanced3Api.handleCleaningEnvironments(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-cleaning-routines" || url.pathname === "/api/crm/hr/ops-cleaning-routines" || url.pathname === "/api/hr/ops-cleaning-routines" || url.pathname === "/api/ops/cleaning-routines") {
    return opsAdvanced3Api.handleCleaningRoutines(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-cleaning-executions" || url.pathname === "/api/crm/hr/ops-cleaning-executions" || url.pathname === "/api/hr/ops-cleaning-executions" || url.pathname === "/api/ops/cleaning-executions") {
    return opsAdvanced3Api.handleCleaningExecutions(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-cleaning-nonconformities" || url.pathname === "/api/crm/hr/ops-cleaning-nonconformities" || url.pathname === "/api/hr/ops-cleaning-nonconformities" || url.pathname === "/api/ops/cleaning-nonconformities") {
    return opsAdvanced3Api.handleCleaningNonconformities(req, res);
  }
  // OPS-16 eventos monitoramento via conector fila reconhecimento escalonamento não é central 24h não armazena vídeo
  if (url.pathname === "/api/admin/hr/ops-monitoring-connectors" || url.pathname === "/api/crm/hr/ops-monitoring-connectors" || url.pathname === "/api/hr/ops-monitoring-connectors" || url.pathname === "/api/ops/monitoring-connectors") {
    return opsAdvanced3Api.handleMonitoringConnectors(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-monitoring-events" || url.pathname === "/api/crm/hr/ops-monitoring-events" || url.pathname === "/api/hr/ops-monitoring-events" || url.pathname === "/api/ops/monitoring-events") {
    return opsAdvanced3Api.handleMonitoringEvents(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-monitoring-event-history" || url.pathname === "/api/crm/hr/ops-monitoring-event-history" || url.pathname === "/api/hr/ops-monitoring-event-history" || url.pathname === "/api/ops/monitoring-event-history") {
    return opsAdvanced3Api.handleMonitoringEventHistory(req, res);
  }
  if (url.pathname === "/api/admin/hr/ops-monitoring-escalations" || url.pathname === "/api/crm/hr/ops-monitoring-escalations" || url.pathname === "/api/hr/ops-monitoring-escalations" || url.pathname === "/api/ops/monitoring-escalations") {
    return opsAdvanced3Api.handleMonitoringEscalations(req, res);
  }
  // CLI-01 entrada única e rotas antigas
  if (url.pathname === "/api/admin/hr/cli-entry-points" || url.pathname === "/api/crm/hr/cli-entry-points" || url.pathname === "/api/hr/cli-entry-points" || url.pathname === "/api/cli/entry-points") {
    return cliApi.handleEntryPoints(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-old-routes" || url.pathname === "/api/crm/hr/cli-old-routes" || url.pathname === "/api/hr/cli-old-routes" || url.pathname === "/api/cli/old-routes") {
    return cliApi.handleOldRoutes(req, res);
  }
  // CLI-02 contatos e papéis por conta/unidade/contrato delegação autorizada sem ampliação escopo
  if (url.pathname === "/api/admin/hr/cli-client-contacts" || url.pathname === "/api/crm/hr/cli-client-contacts" || url.pathname === "/api/hr/cli-client-contacts" || url.pathname === "/api/cli/client-contacts") {
    return cliApi.handleClientContacts(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-contact-scopes" || url.pathname === "/api/crm/hr/cli-contact-scopes" || url.pathname === "/api/hr/cli-contact-scopes" || url.pathname === "/api/cli/contact-scopes") {
    return cliApi.handleContactScopes(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-contact-delegate" || url.pathname === "/api/crm/hr/cli-contact-delegate" || url.pathname === "/api/hr/cli-contact-delegate" || url.pathname === "/api/cli/contact-delegate") {
    return cliApi.handleDelegateContact(req, res);
  }
  // CLI-03 contratos itens vigência escopo claro conteúdo interno não publicado auto
  if (url.pathname === "/api/admin/hr/cli-contract-items" || url.pathname === "/api/crm/hr/cli-contract-items" || url.pathname === "/api/hr/cli-contract-items" || url.pathname === "/api/cli/contract-items") {
    return cliApi.handleContractItems(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-contract-scopes" || url.pathname === "/api/crm/hr/cli-contract-scopes" || url.pathname === "/api/hr/cli-contract-scopes" || url.pathname === "/api/cli/contract-scopes") {
    return cliApi.handleContractScopes(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-contract-vigencia" || url.pathname === "/api/crm/hr/cli-contract-vigencia" || url.pathname === "/api/hr/cli-contract-vigencia" || url.pathname === "/api/cli/contract-vigencia") {
    return cliApi.handleContractVigencia(req, res);
  }
  // CLI-04 documentos categoria validade versão busca download privado autorização testada todos caminhos
  if (url.pathname === "/api/admin/hr/cli-document-categories" || url.pathname === "/api/crm/hr/cli-document-categories" || url.pathname === "/api/hr/cli-document-categories" || url.pathname === "/api/cli/document-categories") {
    return cliApi.handleDocumentCategories(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-client-documents-v2" || url.pathname === "/api/crm/hr/cli-client-documents-v2" || url.pathname === "/api/hr/cli-client-documents-v2" || url.pathname === "/api/cli/client-documents-v2" || url.pathname === "/api/client/documents-v2") {
    return cliApi.handleClientDocumentsV2(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-document-versions" || url.pathname === "/api/crm/hr/cli-document-versions" || url.pathname === "/api/hr/cli-document-versions" || url.pathname === "/api/cli/document-versions") {
    return cliApi.handleDocumentVersions(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-document-download" || url.pathname === "/api/crm/hr/cli-document-download" || url.pathname === "/api/hr/cli-document-download" || url.pathname === "/api/cli/document-download" || url.pathname === "/api/client/document-download") {
    return cliApi.handleDocumentDownload(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-document-access-logs" || url.pathname === "/api/crm/hr/cli-document-access-logs" || url.pathname === "/api/hr/cli-document-access-logs" || url.pathname === "/api/cli/document-access-logs") {
    return cliApi.handleDocumentAccessLogs(req, res);
  }
  // CLI-05/06 chamados protocolo categoria prioridade responsável mensagens anexos SLA histórico estados reabertura motivo pausas SLA explicitamente definidas
  if (url.pathname === "/api/admin/hr/cli-tickets-v2" || url.pathname === "/api/crm/hr/cli-tickets-v2" || url.pathname === "/api/hr/cli-tickets-v2" || url.pathname === "/api/cli/tickets-v2" || url.pathname === "/api/client/tickets-v2") {
    return cliAdvancedApi.handleTicketsV2(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-ticket-messages" || url.pathname === "/api/crm/hr/cli-ticket-messages" || url.pathname === "/api/hr/cli-ticket-messages" || url.pathname === "/api/cli/ticket-messages") {
    return cliAdvancedApi.handleTicketMessages(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-ticket-attachments" || url.pathname === "/api/crm/hr/cli-ticket-attachments" || url.pathname === "/api/hr/cli-ticket-attachments" || url.pathname === "/api/cli/ticket-attachments") {
    return cliAdvancedApi.handleTicketAttachments(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-ticket-history" || url.pathname === "/api/crm/hr/cli-ticket-history" || url.pathname === "/api/hr/cli-ticket-history" || url.pathname === "/api/cli/ticket-history") {
    return cliAdvancedApi.handleTicketHistory(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-ticket-sla-pauses" || url.pathname === "/api/crm/hr/cli-ticket-sla-pauses" || url.pathname === "/api/hr/cli-ticket-sla-pauses" || url.pathname === "/api/cli/ticket-sla-pauses") {
    return cliAdvancedApi.handleTicketSlaPauses(req, res);
  }
  // CLI-07 agenda visita/manutenção confirmação reagendamento histórico
  if (url.pathname === "/api/admin/hr/cli-visits" || url.pathname === "/api/crm/hr/cli-visits" || url.pathname === "/api/hr/cli-visits" || url.pathname === "/api/cli/visits" || url.pathname === "/api/client/visits") {
    return cliAdvancedApi.handleVisits(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-visit-history" || url.pathname === "/api/crm/hr/cli-visit-history" || url.pathname === "/api/hr/cli-visit-history" || url.pathname === "/api/cli/visit-history") {
    return cliAdvancedApi.handleVisitHistory(req, res);
  }
  // CLI-08 relatórios execução medição/aceite revisão
  if (url.pathname === "/api/admin/hr/cli-reports-v2" || url.pathname === "/api/crm/hr/cli-reports-v2" || url.pathname === "/api/hr/cli-reports-v2" || url.pathname === "/api/cli/reports-v2" || url.pathname === "/api/client/reports-v2") {
    return cliAdvancedApi.handleReportsV2(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-report-history-v2" || url.pathname === "/api/crm/hr/cli-report-history-v2" || url.pathname === "/api/hr/cli-report-history-v2" || url.pathname === "/api/cli/report-history-v2") {
    return cliAdvancedApi.handleReportHistoryV2(req, res);
  }
  // CLI-09 cobranças fiscais comprovantes somente quando financeiro integrado dados própria conta
  if (url.pathname === "/api/admin/hr/cli-charges-v2" || url.pathname === "/api/crm/hr/cli-charges-v2" || url.pathname === "/api/hr/cli-charges-v2" || url.pathname === "/api/cli/charges-v2" || url.pathname === "/api/client/charges-v2") {
    return cliFinanceApi.handleChargesV2(req, res);
  }
  // CLI-10 solicitação serviço adicional gera oportunidade CRM origem responsável
  if (url.pathname === "/api/admin/hr/cli-service-requests" || url.pathname === "/api/crm/hr/cli-service-requests" || url.pathname === "/api/hr/cli-service-requests" || url.pathname === "/api/cli/service-requests" || url.pathname === "/api/client/service-requests") {
    return cliFinanceApi.handleServiceRequests(req, res);
  }
  // CLI-11 satisfação pós-atendimento periódica plano ação risco renovação baseado em fatos
  if (url.pathname === "/api/admin/hr/cli-satisfaction-surveys" || url.pathname === "/api/crm/hr/cli-satisfaction-surveys" || url.pathname === "/api/hr/cli-satisfaction-surveys" || url.pathname === "/api/cli/satisfaction-surveys" || url.pathname === "/api/client/satisfaction-surveys") {
    return cliFinanceApi.handleSatisfactionSurveys(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-satisfaction-action-plans" || url.pathname === "/api/crm/hr/cli-satisfaction-action-plans" || url.pathname === "/api/hr/cli-satisfaction-action-plans" || url.pathname === "/api/cli/satisfaction-action-plans") {
    return cliFinanceApi.handleSatisfactionActionPlans(req, res);
  }
  // CLI-12 renovação comunicação contratual registro sem bloquear indiscriminadamente portal por inadimplência
  if (url.pathname === "/api/admin/hr/cli-renewal-communications" || url.pathname === "/api/crm/hr/cli-renewal-communications" || url.pathname === "/api/hr/cli-renewal-communications" || url.pathname === "/api/cli/renewal-communications" || url.pathname === "/api/client/renewal-communications") {
    return cliFinanceApi.handleRenewalCommunications(req, res);
  }
  // CLI-13 modos convite solicitação com aprovação autocadastro configuráveis vínculo verificado servidor autocadastro nunca libera contratos sozinho
  if (url.pathname === "/api/admin/hr/cli-portal-mode-configs" || url.pathname === "/api/crm/hr/cli-portal-mode-configs" || url.pathname === "/api/hr/cli-portal-mode-configs" || url.pathname === "/api/cli/portal-mode-configs") {
    return cliFinanceApi.handlePortalModeConfigs(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-portal-access-requests" || url.pathname === "/api/crm/hr/cli-portal-access-requests" || url.pathname === "/api/hr/cli-portal-access-requests" || url.pathname === "/api/cli/portal-access-requests" || url.pathname === "/api/client/portal-access-requests" || url.pathname === "/api/public/portal-access-requests") {
    return cliFinanceApi.handlePortalAccessRequests(req, res);
  }
  // CLI-14 segurança conta MFA opcional gestão sessões troca e-mail concluída fluxos backend real
  if (url.pathname === "/api/admin/hr/cli-security-events" || url.pathname === "/api/crm/hr/cli-security-events" || url.pathname === "/api/hr/cli-security-events" || url.pathname === "/api/cli/security-events") {
    return cliFinanceApi.handleSecurityEvents(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-email-change-requests" || url.pathname === "/api/crm/hr/cli-email-change-requests" || url.pathname === "/api/hr/cli-email-change-requests" || url.pathname === "/api/cli/email-change-requests" || url.pathname === "/api/client/email-change-requests") {
    return cliFinanceApi.handleEmailChangeRequests(req, res);
  }
  if (url.pathname === "/api/admin/hr/cli-sessions" || url.pathname === "/api/crm/hr/cli-sessions" || url.pathname === "/api/hr/cli-sessions" || url.pathname === "/api/cli/sessions") {
    return cliFinanceApi.handleSessions(req, res);
  }
  // FIN-01/02/03/04 contas receber/pagar fornecedores centro custo recorrência idempotente pagamento parcial estorno baixa auditada nunca apagar saldo silenciosa
  if (url.pathname === "/api/admin/hr/fin-suppliers" || url.pathname === "/api/crm/hr/fin-suppliers" || url.pathname === "/api/hr/fin-suppliers" || url.pathname === "/api/fin/suppliers") {
    return finApi.handleSuppliers(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-cost-centers" || url.pathname === "/api/crm/hr/fin-cost-centers" || url.pathname === "/api/hr/fin-cost-centers" || url.pathname === "/api/fin/cost-centers") {
    return finApi.handleCostCenters(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-recurrence-rules" || url.pathname === "/api/crm/hr/fin-recurrence-rules" || url.pathname === "/api/hr/fin-recurrence-rules" || url.pathname === "/api/fin/recurrence-rules") {
    return finApi.handleRecurrenceRules(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-receivables" || url.pathname === "/api/crm/hr/fin-receivables" || url.pathname === "/api/hr/fin-receivables" || url.pathname === "/api/fin/receivables") {
    return finApi.handleReceivables(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-payables" || url.pathname === "/api/crm/hr/fin-payables" || url.pathname === "/api/hr/fin-payables" || url.pathname === "/api/fin/payables") {
    return finApi.handlePayables(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-payments" || url.pathname === "/api/crm/hr/fin-payments" || url.pathname === "/api/hr/fin-payments" || url.pathname === "/api/fin/payments") {
    return finApi.handlePayments(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-payment-history" || url.pathname === "/api/crm/hr/fin-payment-history" || url.pathname === "/api/hr/fin-payment-history" || url.pathname === "/api/fin/payment-history") {
    return finApi.handlePaymentHistory(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-attachments" || url.pathname === "/api/crm/hr/fin-attachments" || url.pathname === "/api/hr/fin-attachments" || url.pathname === "/api/fin/attachments") {
    return finApi.handleAttachments(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-generate-recurring" || url.pathname === "/api/crm/hr/fin-generate-recurring" || url.pathname === "/api/hr/fin-generate-recurring" || url.pathname === "/api/fin/generate-recurring") {
    return finApi.handleGenerateRecurring(req, res);
  }
  // FIN-05 conciliação bancária importação/extrato/provedor sugestão/confirmação evitar duplicar UNIQUE(receivable,bank) e bank_ref
  if (url.pathname === "/api/admin/hr/fin-bank-statements" || url.pathname === "/api/crm/hr/fin-bank-statements" || url.pathname === "/api/hr/fin-bank-statements" || url.pathname === "/api/fin/bank-statements") {
    return finAdvancedApi.handleBankStatements(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-bank-transactions" || url.pathname === "/api/crm/hr/fin-bank-transactions" || url.pathname === "/api/hr/fin-bank-transactions" || url.pathname === "/api/fin/bank-transactions") {
    return finAdvancedApi.handleBankTransactions(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-conciliations" || url.pathname === "/api/crm/hr/fin-conciliations" || url.pathname === "/api/hr/fin-conciliations" || url.pathname === "/api/fin/conciliations") {
    return finAdvancedApi.handleConciliations(req, res);
  }
  // FIN-06 política cobrança responsável lembretes sem mensagens reais sem bloqueio automático histórico imutável
  if (url.pathname === "/api/admin/hr/fin-collection-policies" || url.pathname === "/api/crm/hr/fin-collection-policies" || url.pathname === "/api/hr/fin-collection-policies" || url.pathname === "/api/fin/collection-policies") {
    return finAdvancedApi.handleCollectionPolicies(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-collection-reminders" || url.pathname === "/api/crm/hr/fin-collection-reminders" || url.pathname === "/api/hr/fin-collection-reminders" || url.pathname === "/api/fin/collection-reminders") {
    return finAdvancedApi.handleCollectionReminders(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-collection-history" || url.pathname === "/api/crm/hr/fin-collection-history" || url.pathname === "/api/hr/fin-collection-history" || url.pathname === "/api/fin/collection-history") {
    return finAdvancedApi.handleCollectionHistory(req, res);
  }
  // FIN-07 fluxo caixa previsto/realizado saldo vencidos próximos aging bucket
  if (url.pathname === "/api/admin/hr/fin-cashflow-snapshots" || url.pathname === "/api/crm/hr/fin-cashflow-snapshots" || url.pathname === "/api/hr/fin-cashflow-snapshots" || url.pathname === "/api/fin/cashflow-snapshots") {
    return finAdvancedApi.handleCashflowSnapshots(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-aging-receivables" || url.pathname === "/api/crm/hr/fin-aging-receivables" || url.pathname === "/api/hr/fin-aging-receivables" || url.pathname === "/api/fin/aging-receivables") {
    return finAdvancedApi.handleAgingReceivables(req, res);
  }
  // FIN-08 custo por cliente/contrato/posto importação custos pessoal/equipamento/material/supervisão rateio documentado
  if (url.pathname === "/api/admin/hr/fin-cost-imports" || url.pathname === "/api/crm/hr/fin-cost-imports" || url.pathname === "/api/hr/fin-cost-imports" || url.pathname === "/api/fin/cost-imports") {
    return finAdvancedApi.handleCostImports(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-costs" || url.pathname === "/api/crm/hr/fin-costs" || url.pathname === "/api/hr/fin-costs" || url.pathname === "/api/fin/costs") {
    return finAdvancedApi.handleCosts(req, res);
  }
  // FIN-09 resultado gerencial por contrato receita contratada faturada recebida custos caixa margem sem dados completos exibida como incompleta
  if (url.pathname === "/api/admin/hr/fin-management-results" || url.pathname === "/api/crm/hr/fin-management-results" || url.pathname === "/api/hr/fin-management-results" || url.pathname === "/api/fin/management-results") {
    return finManagementApi.handleManagementResults(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-result-history" || url.pathname === "/api/crm/hr/fin-result-history" || url.pathname === "/api/hr/fin-result-history" || url.pathname === "/api/fin/result-history") {
    return finManagementApi.handleResultHistory(req, res);
  }
  // FIN-10 despesas/reembolsos compras alçada evidência segregação solicitar/aprovar
  if (url.pathname === "/api/admin/hr/fin-expenses" || url.pathname === "/api/crm/hr/fin-expenses" || url.pathname === "/api/hr/fin-expenses" || url.pathname === "/api/fin/expenses") {
    return finManagementApi.handleExpenses(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-expense-history" || url.pathname === "/api/crm/hr/fin-expense-history" || url.pathname === "/api/hr/fin-expense-history" || url.pathname === "/api/fin/expense-history") {
    return finManagementApi.handleExpenseHistory(req, res);
  }
  // Alçada da própria identidade (somente leitura): a interface declara se
  // existe política ativa, sem nunca prometer aprovação.
  if (url.pathname === "/api/fin/expense-authorities") {
    return finManagementApi.handleExpenseAuthorities(req, res);
  }
  // FIN-11 integração contábil/fiscal provedor determinar NFS-e/NF-e ou outra obrigação conforme atividade sem assumir uma nota para tudo
  if (url.pathname === "/api/admin/hr/fin-fiscal-activity-rules" || url.pathname === "/api/crm/hr/fin-fiscal-activity-rules" || url.pathname === "/api/hr/fin-fiscal-activity-rules" || url.pathname === "/api/fin/fiscal-activity-rules") {
    return finManagementApi.handleFiscalActivityRules(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-fiscal-history" || url.pathname === "/api/crm/hr/fin-fiscal-history" || url.pathname === "/api/hr/fin-fiscal-history" || url.pathname === "/api/fin/fiscal-history") {
    return finManagementApi.handleFiscalHistory(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-fiscal-providers" || url.pathname === "/api/crm/hr/fin-fiscal-providers" || url.pathname === "/api/hr/fin-fiscal-providers" || url.pathname === "/api/fin/fiscal-providers") {
    return finManagementApi.handleFiscalProviders(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-fiscal-obligations" || url.pathname === "/api/crm/hr/fin-fiscal-obligations" || url.pathname === "/api/hr/fin-fiscal-obligations" || url.pathname === "/api/fin/fiscal-obligations") {
    return finManagementApi.handleFiscalObligations(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-fiscal-documents" || url.pathname === "/api/crm/hr/fin-fiscal-documents" || url.pathname === "/api/hr/fin-fiscal-documents" || url.pathname === "/api/fin/fiscal-documents") {
    return finManagementApi.handleFiscalDocuments(req, res);
  }
  // FIN-12 boletos/Pix/gateway somente após seleção e sandbox validar assinatura webhook replay idempotência conciliação sem cobrança real em testes
  if (url.pathname === "/api/admin/hr/fin-payment-gateways" || url.pathname === "/api/crm/hr/fin-payment-gateways" || url.pathname === "/api/hr/fin-payment-gateways" || url.pathname === "/api/fin/payment-gateways") {
    return finManagementApi.handleGateways(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-gateway-webhooks" || url.pathname === "/api/crm/hr/fin-gateway-webhooks" || url.pathname === "/api/hr/fin-gateway-webhooks" || url.pathname === "/api/fin/gateway-webhooks") {
    return finManagementApi.handleWebhooks(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-gateway-charges" || url.pathname === "/api/crm/hr/fin-gateway-charges" || url.pathname === "/api/hr/fin-gateway-charges" || url.pathname === "/api/fin/gateway-charges") {
    return finManagementApi.handleCharges(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-gateway-history" || url.pathname === "/api/crm/hr/fin-gateway-history" || url.pathname === "/api/hr/fin-gateway-history" || url.pathname === "/api/fin/gateway-history") {
    return finManagementApi.handleGatewayHistory(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-gateway-webhook-sign" || url.pathname === "/api/crm/hr/fin-gateway-webhook-sign" || url.pathname === "/api/hr/fin-gateway-webhook-sign" || url.pathname === "/api/fin/gateway-webhook-sign") {
    return finManagementApi.handleWebhookSign(req, res);
  }
  // FIN-13 orçamento gerencial e cenários de expansão com premissas explícitas não prometer resultado
  if (url.pathname === "/api/admin/hr/fin-budgets" || url.pathname === "/api/crm/hr/fin-budgets" || url.pathname === "/api/hr/fin-budgets" || url.pathname === "/api/fin/budgets") {
    return finBudgetApi.handleBudgets(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-budget-scenarios" || url.pathname === "/api/crm/hr/fin-budget-scenarios" || url.pathname === "/api/hr/fin-budget-scenarios" || url.pathname === "/api/fin/budget-scenarios") {
    return finBudgetApi.handleBudgetScenarios(req, res);
  }
  // FIN-13 histórico imutável do orçamento: criação, edição, revisão e decisão
  if (url.pathname === "/api/admin/hr/fin-budget-history" || url.pathname === "/api/crm/hr/fin-budget-history" || url.pathname === "/api/hr/fin-budget-history" || url.pathname === "/api/fin/budget-history") {
    return finBudgetApi.handleBudgetHistory(req, res);
  }
  // FIN-14 exportação do período com trilha filtros totais conciliáveis e acesso limitado do contador
  if (url.pathname === "/api/admin/hr/fin-exports" || url.pathname === "/api/crm/hr/fin-exports" || url.pathname === "/api/hr/fin-exports" || url.pathname === "/api/fin/exports") {
    return finBudgetApi.handleExports(req, res);
  }
  if (url.pathname === "/api/fin/export-download") {
    return finBudgetApi.handleExportDownload(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-export-logs" || url.pathname === "/api/crm/hr/fin-export-logs" || url.pathname === "/api/hr/fin-export-logs" || url.pathname === "/api/fin/export-logs") {
    return finBudgetApi.handleExportLogs(req, res);
  }
  // FIN-15 fechamento de competência e reabertura autorizada preservar versões de relatório
  if (url.pathname === "/api/admin/hr/fin-competence-closures" || url.pathname === "/api/crm/hr/fin-competence-closures" || url.pathname === "/api/hr/fin-competence-closures" || url.pathname === "/api/fin/competence-closures") {
    return finBudgetApi.handleClosures(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-report-versions" || url.pathname === "/api/crm/hr/fin-report-versions" || url.pathname === "/api/hr/fin-report-versions" || url.pathname === "/api/fin/report-versions") {
    return finBudgetApi.handleReportVersions(req, res);
  }
  // FIN-16 comissões ligadas à regra CRM-25 provisão e revisão não pagar automaticamente
  if (url.pathname === "/api/admin/hr/fin-commission-provisions" || url.pathname === "/api/crm/hr/fin-commission-provisions" || url.pathname === "/api/hr/fin-commission-provisions" || url.pathname === "/api/fin/commission-provisions") {
    return finBudgetApi.handleCommissionProvisions(req, res);
  }
  if (url.pathname === "/api/admin/hr/fin-commission-provision-history" || url.pathname === "/api/crm/hr/fin-commission-provision-history" || url.pathname === "/api/hr/fin-commission-provision-history" || url.pathname === "/api/fin/commission-provision-history") {
    return finBudgetApi.handleCommissionProvisionHistory(req, res);
  }
  // ADM-01 painel meu dia com pendências reais prioridade responsável e ação
  if (url.pathname === "/api/admin/hr/adm-my-day" || url.pathname === "/api/crm/hr/adm-my-day" || url.pathname === "/api/hr/adm-my-day" || url.pathname === "/api/adm/my-day") {
    return admApi.handleMyDay(req, res);
  }
  // ADM-02 visão comercial leads novos oportunidades paradas propostas próximas ações
  if (url.pathname === "/api/admin/hr/adm-commercial-snapshots" || url.pathname === "/api/crm/hr/adm-commercial-snapshots" || url.pathname === "/api/hr/adm-commercial-snapshots" || url.pathname === "/api/adm/commercial-snapshots") {
    return admApi.handleCommercialSnapshots(req, res);
  }
  // ADM-03 visão operacional cobertura ocorrências críticas SLA implantação
  if (url.pathname === "/api/admin/hr/adm-operational-snapshots" || url.pathname === "/api/crm/hr/adm-operational-snapshots" || url.pathname === "/api/hr/adm-operational-snapshots" || url.pathname === "/api/adm/operational-snapshots") {
    return admApi.handleOperationalSnapshots(req, res);
  }
  // ADM-04 visão financeira fonte competência saldo vencimentos margem por contrato
  if (url.pathname === "/api/admin/hr/adm-financial-snapshots" || url.pathname === "/api/crm/hr/adm-financial-snapshots" || url.pathname === "/api/hr/adm-financial-snapshots" || url.pathname === "/api/adm/financial-snapshots") {
    return admApi.handleFinancialSnapshots(req, res);
  }
  // ADM-05 contratos próximos de renovar reclamações reincidentes risco de perda justificado
  if (url.pathname === "/api/admin/hr/adm-renewal-risks" || url.pathname === "/api/crm/hr/adm-renewal-risks" || url.pathname === "/api/hr/adm-renewal-risks" || url.pathname === "/api/adm/renewal-risks") {
    return admApi.handleRenewalRisks(req, res);
  }
  // ADM-06 aprovação unificada descontos compras despesas exceções alçadas por valor/escopo
  if (url.pathname === "/api/admin/hr/adm-approvals" || url.pathname === "/api/crm/hr/adm-approvals" || url.pathname === "/api/hr/adm-approvals" || url.pathname === "/api/adm/approvals") {
    return admApi.handleApprovals(req, res);
  }
  if (url.pathname === "/api/admin/hr/adm-approval-history" || url.pathname === "/api/crm/hr/adm-approval-history" || url.pathname === "/api/hr/adm-approval-history" || url.pathname === "/api/adm/approval-history") {
    return admApi.handleApprovalHistory(req, res);
  }
  // ADM-07 busca autorizada favoritos filtros salvos atalhos com contexto
  if (url.pathname === "/api/admin/hr/adm-search-favorites" || url.pathname === "/api/crm/hr/adm-search-favorites" || url.pathname === "/api/hr/adm-search-favorites" || url.pathname === "/api/adm/search-favorites") {
    return admAdvancedApi.handleSearchFavorites(req, res);
  }
  if (url.pathname === "/api/admin/hr/adm-saved-filters" || url.pathname === "/api/crm/hr/adm-saved-filters" || url.pathname === "/api/hr/adm-saved-filters" || url.pathname === "/api/adm/saved-filters") {
    return admAdvancedApi.handleSavedFilters(req, res);
  }
  if (url.pathname === "/api/admin/hr/adm-shortcuts" || url.pathname === "/api/crm/hr/adm-shortcuts" || url.pathname === "/api/hr/adm-shortcuts" || url.pathname === "/api/adm/shortcuts") {
    return admAdvancedApi.handleShortcuts(req, res);
  }
  // ADM-08 relatórios exportáveis e agendados destinatários autorizados registrar geração/envio limitar dados
  if (url.pathname === "/api/admin/hr/adm-reports" || url.pathname === "/api/crm/hr/adm-reports" || url.pathname === "/api/hr/adm-reports" || url.pathname === "/api/adm/reports") {
    return admAdvancedApi.handleReports(req, res);
  }
  if (url.pathname === "/api/admin/hr/adm-report-logs" || url.pathname === "/api/crm/hr/adm-report-logs" || url.pathname === "/api/hr/adm-report-logs" || url.pathname === "/api/adm/report-logs") {
    return admAdvancedApi.handleReportLogs(req, res);
  }
  // ADM-09 configurações de negócio versionadas catálogo preços alçadas conteúdo SLA preferências
  if (url.pathname === "/api/admin/hr/adm-business-configs" || url.pathname === "/api/crm/hr/adm-business-configs" || url.pathname === "/api/hr/adm-business-configs" || url.pathname === "/api/adm/business-configs") {
    return admAdvancedApi.handleBusinessConfigs(req, res);
  }
  // ADM-10 metas e cenários comparação prevista/realizada sem confundir estimativa com resultado
  if (url.pathname === "/api/admin/hr/adm-goals-comparison" || url.pathname === "/api/crm/hr/adm-goals-comparison" || url.pathname === "/api/hr/adm-goals-comparison" || url.pathname === "/api/adm/goals-comparison") {
    return admAdvancedApi.handleGoalsComparison(req, res);
  }
  // ADM-11 trilha e diário de decisões CON-11 acessíveis conforme permissão
  if (url.pathname === "/api/admin/hr/adm-management-diary-access" || url.pathname === "/api/crm/hr/adm-management-diary-access" || url.pathname === "/api/hr/adm-management-diary-access" || url.pathname === "/api/adm/management-diary-access") {
    return admAdvancedApi.handleDiaryAccess(req, res);
  }
  // ADM-12 análises de expansão qualidade e oportunidades adicionais alimentadas pelos módulos reais
  if (url.pathname === "/api/admin/hr/adm-expansion-analyses" || url.pathname === "/api/crm/hr/adm-expansion-analyses" || url.pathname === "/api/hr/adm-expansion-analyses" || url.pathname === "/api/adm/expansion-analyses") {
    return admAdvancedApi.handleExpansionAnalyses(req, res);
  }
  // ADM-01..12 — painel funcional do Marcelo em rotas canônicas próprias,
  // fora dos aliases históricos de RH. Indicadores calculados de registro
  // canônico, detalhamento, registro real, decisão unificada, escopo por
  // identidade, relatório limitado, configuração versionada, meta x realizado,
  // diário CON-11 por permissão e análises alimentadas pelos módulos reais.
  if (url.pathname === "/api/adm/panel/indicators") return admPanelApi.handleIndicators(req, res);
  if (url.pathname === "/api/adm/panel/drilldown") return admPanelApi.handleDrilldown(req, res);
  if (url.pathname === "/api/adm/panel/record") return admPanelApi.handleRecord(req, res);
  if (url.pathname === "/api/adm/panel/decisions") return admPanelApi.handleDecisions(req, res);
  if (url.pathname === "/api/adm/panel/workspace") return admPanelApi.handleWorkspace(req, res);
  if (url.pathname === "/api/adm/panel/reports") return admPanelApi.handleReports(req, res);
  if (url.pathname === "/api/adm/panel/report-download") return admPanelApi.handleReportDownload(req, res);
  if (url.pathname === "/api/adm/panel/business-configs") return admPanelApi.handleBusinessConfigs(req, res);
  if (url.pathname === "/api/adm/panel/goals") return admPanelApi.handleGoals(req, res);
  if (url.pathname === "/api/adm/panel/decision-diary") return admPanelApi.handleDecisionDiary(req, res);
  if (url.pathname === "/api/adm/panel/expansion") return admPanelApi.handleExpansion(req, res);
  // AST-01 produtos/SKU fornecedores unidade medida custo local estoque mínimo
  if (url.pathname === "/api/admin/hr/ast-suppliers" || url.pathname === "/api/crm/hr/ast-suppliers" || url.pathname === "/api/hr/ast-suppliers" || url.pathname === "/api/ast/suppliers") {
    return astApi.handleSuppliers(req, res);
  }
  if (url.pathname === "/api/admin/hr/ast-products" || url.pathname === "/api/crm/hr/ast-products" || url.pathname === "/api/hr/ast-products" || url.pathname === "/api/ast/products") {
    return astApi.handleProducts(req, res);
  }
  // AST-02 entradas/saídas/transferências/ajustes histórico saldo derivado movimentos consistentes
  if (url.pathname === "/api/admin/hr/ast-stock-movements" || url.pathname === "/api/crm/hr/ast-stock-movements" || url.pathname === "/api/hr/ast-stock-movements" || url.pathname === "/api/ast/stock-movements") {
    return astApi.handleStockMovements(req, res);
  }
  // AST-03 reserva para proposta/implantação sem confundir reserva com saída liberação cancelamento
  if (url.pathname === "/api/admin/hr/ast-reservations" || url.pathname === "/api/crm/hr/ast-reservations" || url.pathname === "/api/hr/ast-reservations" || url.pathname === "/api/ast/reservations") {
    return astApi.handleReservations(req, res);
  }
  // AST-04 equipamentos serializados por cliente/posto/colaborador proprietário garantia manutenção termo guarda
  if (url.pathname === "/api/admin/hr/ast-serialized-assets" || url.pathname === "/api/crm/hr/ast-serialized-assets" || url.pathname === "/api/hr/ast-serialized-assets" || url.pathname === "/api/ast/serialized-assets") {
    return astApi.handleSerializedAssets(req, res);
  }
  // AST-05 entrega/devolução avaria/perda fotos pertinentes conferência
  if (url.pathname === "/api/admin/hr/ast-deliveries" || url.pathname === "/api/crm/hr/ast-deliveries" || url.pathname === "/api/hr/ast-deliveries" || url.pathname === "/api/ast/deliveries") {
    return astApi.handleDeliveries(req, res);
  }
  // AST-06 requisição cotação seleção aprovação pedido recebimento vínculo conta a pagar
  if (url.pathname === "/api/admin/hr/ast-requisitions" || url.pathname === "/api/crm/hr/ast-requisitions" || url.pathname === "/api/hr/ast-requisitions" || url.pathname === "/api/ast/requisitions") {
    return astApi.handleRequisitions(req, res);
  }
  if (url.pathname === "/api/admin/hr/ast-quotations" || url.pathname === "/api/crm/hr/ast-quotations" || url.pathname === "/api/hr/ast-quotations" || url.pathname === "/api/ast/quotations") {
    return astApi.handleQuotations(req, res);
  }
  if (url.pathname === "/api/admin/hr/ast-purchase-orders" || url.pathname === "/api/crm/hr/ast-purchase-orders" || url.pathname === "/api/hr/ast-purchase-orders" || url.pathname === "/api/ast/purchase-orders") {
    return astApi.handlePurchaseOrders(req, res);
  }
  if (url.pathname === "/api/admin/hr/ast-requisition-history" || url.pathname === "/api/crm/hr/ast-requisition-history" || url.pathname === "/api/hr/ast-requisition-history" || url.pathname === "/api/ast/requisition-history") {
    return astApi.handleRequisitionHistory(req, res);
  }
  if (url.pathname === "/api/admin/hr/ast-order-history" || url.pathname === "/api/crm/hr/ast-order-history" || url.pathname === "/api/hr/ast-order-history" || url.pathname === "/api/ast/order-history") {
    return astApi.handleOrderHistory(req, res);
  }
  // AST-07 inventário físico divergências ajuste aprovado
  if (url.pathname === "/api/admin/hr/ast-inventories" || url.pathname === "/api/crm/hr/ast-inventories" || url.pathname === "/api/hr/ast-inventories" || url.pathname === "/api/ast/inventories") {
    return astAdvancedApi.handleInventories(req, res);
  }
  if (url.pathname === "/api/admin/hr/ast-inventory-items" || url.pathname === "/api/crm/hr/ast-inventory-items" || url.pathname === "/api/hr/ast-inventory-items" || url.pathname === "/api/ast/inventory-items") {
    return astAdvancedApi.handleInventoryItems(req, res);
  }
  // AST-08 ordem serviço solicitante contrato técnico agenda diagnóstico checklist peças execução
  if (url.pathname === "/api/admin/hr/ast-service-orders" || url.pathname === "/api/crm/hr/ast-service-orders" || url.pathname === "/api/hr/ast-service-orders" || url.pathname === "/api/ast/service-orders") {
    return astAdvancedApi.handleServiceOrders(req, res);
  }
  // AST-09 evidências antes/depois aceite garantia retorno custo acesso cliente somente aprovado
  if (url.pathname === "/api/admin/hr/ast-service-order-evidences" || url.pathname === "/api/crm/hr/ast-service-order-evidences" || url.pathname === "/api/hr/ast-service-order-evidences" || url.pathname === "/api/ast/service-order-evidences") {
    return astAdvancedApi.handleServiceOrderEvidences(req, res);
  }
  // AST-10 manutenção preventiva/corretiva periodicidade alerta próxima visita histórico por ativo
  if (url.pathname === "/api/admin/hr/ast-maintenance-plans" || url.pathname === "/api/crm/hr/ast-maintenance-plans" || url.pathname === "/api/hr/ast-maintenance-plans" || url.pathname === "/api/ast/maintenance-plans") {
    return astAdvancedApi.handleMaintenancePlans(req, res);
  }
  if (url.pathname === "/api/admin/hr/ast-maintenance-executions" || url.pathname === "/api/crm/hr/ast-maintenance-executions" || url.pathname === "/api/hr/ast-maintenance-executions" || url.pathname === "/api/ast/maintenance-executions") {
    return astAdvancedApi.handleMaintenanceExecutions(req, res);
  }
  // AST-11 dossiê técnico CFTV modelos localização autorizada garantia documentação senhas fora cadastro/log comum
  if (url.pathname === "/api/admin/hr/ast-cftv-dossiers" || url.pathname === "/api/crm/hr/ast-cftv-dossiers" || url.pathname === "/api/hr/ast-cftv-dossiers" || url.pathname === "/api/ast/cftv-dossiers") {
    return astAdvancedApi.handleCftvDossiers(req, res);
  }
  // AST-12 materiais limpeza consumo por local reposição comparação previsto
  if (url.pathname === "/api/admin/hr/ast-cleaning-materials" || url.pathname === "/api/crm/hr/ast-cleaning-materials" || url.pathname === "/api/hr/ast-cleaning-materials" || url.pathname === "/api/ast/cleaning-materials") {
    return astAdvancedApi.handleCleaningMaterials(req, res);
  }
  // EXT-01 frota canônica (migração 147): histórico/custo por veículo e alerta
  // de manutenção por regra explícita, com transação única e idempotência.
  if (url.pathname === "/api/ext/fleet/vehicles") {
    return extFleetApi.handleVehicles(req, res);
  }
  const fleetVehicleMatch = url.pathname.match(/^\/api\/ext\/fleet\/vehicles\/([0-9a-f-]{36})$/i);
  if (fleetVehicleMatch) return extFleetApi.handleVehicleById(req, res, fleetVehicleMatch[1]);
  const fleetResponsibleMatch = url.pathname.match(/^\/api\/ext\/fleet\/vehicles\/([0-9a-f-]{36})\/responsible$/i);
  if (fleetResponsibleMatch) return extFleetApi.handleVehicleResponsible(req, res, fleetResponsibleMatch[1]);
  const fleetFuelMatch = url.pathname.match(/^\/api\/ext\/fleet\/vehicles\/([0-9a-f-]{36})\/fuel-logs$/i);
  if (fleetFuelMatch) return extFleetApi.handleVehicleFuelLogs(req, res, fleetFuelMatch[1]);
  const fleetMaintenanceMatch = url.pathname.match(/^\/api\/ext\/fleet\/vehicles\/([0-9a-f-]{36})\/maintenance-logs$/i);
  if (fleetMaintenanceMatch) return extFleetApi.handleVehicleMaintenanceLogs(req, res, fleetMaintenanceMatch[1]);
  const fleetVehicleDocumentsMatch = url.pathname.match(/^\/api\/ext\/fleet\/vehicles\/([0-9a-f-]{36})\/documents$/i);
  if (fleetVehicleDocumentsMatch) return extFleetApi.handleVehicleDocuments(req, res, fleetVehicleDocumentsMatch[1]);
  const fleetRulesMatch = url.pathname.match(/^\/api\/ext\/fleet\/vehicles\/([0-9a-f-]{36})\/maintenance-rules$/i);
  if (fleetRulesMatch) return extFleetApi.handleVehicleMaintenanceRules(req, res, fleetRulesMatch[1]);
  const fleetDocumentMatch = url.pathname.match(/^\/api\/ext\/fleet\/documents\/([0-9a-f-]{36})$/i);
  if (fleetDocumentMatch) return extFleetApi.handleDocumentById(req, res, fleetDocumentMatch[1]);
  // Rotas legadas de frota: leitura pela mesma autorização; mutação aposentada
  // (410) — a rota antiga não é atalho sem transação/idempotência.
  if (url.pathname === "/api/admin/hr/ext-fleet-vehicles" || url.pathname === "/api/crm/hr/ext-fleet-vehicles" || url.pathname === "/api/hr/ext-fleet-vehicles" || url.pathname === "/api/ext/fleet-vehicles") {
    return extFleetApi.handleLegacyVehicles(req, res);
  }
  if (url.pathname === "/api/admin/hr/ext-fleet-fuel-logs" || url.pathname === "/api/crm/hr/ext-fleet-fuel-logs" || url.pathname === "/api/hr/ext-fleet-fuel-logs" || url.pathname === "/api/ext/fleet-fuel-logs") {
    return extFleetApi.handleLegacyFuelLogs(req, res);
  }
  if (url.pathname === "/api/admin/hr/ext-fleet-maintenance-logs" || url.pathname === "/api/crm/hr/ext-fleet-maintenance-logs" || url.pathname === "/api/hr/ext-fleet-maintenance-logs" || url.pathname === "/api/ext/fleet-maintenance-logs") {
    return extFleetApi.handleLegacyMaintenanceLogs(req, res);
  }
  if (url.pathname === "/api/admin/hr/ext-fleet-documents" || url.pathname === "/api/crm/hr/ext-fleet-documents" || url.pathname === "/api/hr/ext-fleet-documents" || url.pathname === "/api/ext/fleet-documents") {
    return extFleetApi.handleLegacyDocuments(req, res);
  }
  // EXT-02 terceiros canônicos (migração 148): cadastro, contrato validado,
  // documentos com vencimento, janela de acesso temporário presa a OS/contrato
  // autorizado e avaliação com autor/data/justificativa. Transação única,
  // idempotência por identidade e derivação determinística da vigência.
  if (url.pathname === "/api/ext/third-party/parties") {
    return extThirdPartyApi.handleParties(req, res);
  }
  const thirdPartyMatch = url.pathname.match(/^\/api\/ext\/third-party\/parties\/([0-9a-f-]{36})$/i);
  if (thirdPartyMatch) return extThirdPartyApi.handlePartyById(req, res, thirdPartyMatch[1]);
  const thirdPartyContractMatch = url.pathname.match(/^\/api\/ext\/third-party\/parties\/([0-9a-f-]{36})\/contract$/i);
  if (thirdPartyContractMatch) return extThirdPartyApi.handlePartyContract(req, res, thirdPartyContractMatch[1]);
  const thirdPartyGrantsMatch = url.pathname.match(/^\/api\/ext\/third-party\/parties\/([0-9a-f-]{36})\/access-grants$/i);
  if (thirdPartyGrantsMatch) return extThirdPartyApi.handlePartyAccessGrants(req, res, thirdPartyGrantsMatch[1]);
  const thirdPartyAuthorizationMatch = url.pathname.match(/^\/api\/ext\/third-party\/parties\/([0-9a-f-]{36})\/authorization$/i);
  if (thirdPartyAuthorizationMatch) return extThirdPartyApi.handlePartyAuthorization(req, res, thirdPartyAuthorizationMatch[1]);
  const thirdPartyDocumentsMatch = url.pathname.match(/^\/api\/ext\/third-party\/parties\/([0-9a-f-]{36})\/documents$/i);
  if (thirdPartyDocumentsMatch) return extThirdPartyApi.handlePartyDocuments(req, res, thirdPartyDocumentsMatch[1]);
  const thirdPartyDocumentRulesMatch = url.pathname.match(/^\/api\/ext\/third-party\/parties\/([0-9a-f-]{36})\/document-rules$/i);
  if (thirdPartyDocumentRulesMatch) return extThirdPartyApi.handlePartyDocumentRules(req, res, thirdPartyDocumentRulesMatch[1]);
  const thirdPartyEvaluationsMatch = url.pathname.match(/^\/api\/ext\/third-party\/parties\/([0-9a-f-]{36})\/evaluations$/i);
  if (thirdPartyEvaluationsMatch) return extThirdPartyApi.handlePartyEvaluations(req, res, thirdPartyEvaluationsMatch[1]);
  const thirdPartyGrantRevokeMatch = url.pathname.match(/^\/api\/ext\/third-party\/access-grants\/([0-9a-f-]{36})\/revoke$/i);
  if (thirdPartyGrantRevokeMatch) return extThirdPartyApi.handleAccessGrantRevoke(req, res, thirdPartyGrantRevokeMatch[1]);
  const thirdPartyDocumentDeactivateMatch = url.pathname.match(/^\/api\/ext\/third-party\/documents\/([0-9a-f-]{36})\/deactivate$/i);
  if (thirdPartyDocumentDeactivateMatch) return extThirdPartyApi.handleDocumentDeactivate(req, res, thirdPartyDocumentDeactivateMatch[1]);
  // Rotas legadas de terceiros: leitura pela mesma autorização, com fonte e
  // derivação declaradas; mutação aposentada (410) — a rota antiga não é
  // atalho sem transação, idempotência nem validação canônica de contrato.
  if (url.pathname === "/api/admin/hr/ext-third-parties" || url.pathname === "/api/crm/hr/ext-third-parties" || url.pathname === "/api/hr/ext-third-parties" || url.pathname === "/api/ext/third-parties") {
    return extThirdPartyApi.handleLegacyThirdParties(req, res);
  }
  if (url.pathname === "/api/admin/hr/ext-third-party-documents" || url.pathname === "/api/crm/hr/ext-third-party-documents" || url.pathname === "/api/hr/ext-third-party-documents" || url.pathname === "/api/ext/third-party-documents") {
    return extThirdPartyApi.handleLegacyThirdPartyDocuments(req, res);
  }
  // EXT-03 licitações canônicas (migração 149): edital com situação terminal
  // final, prazos com fonte declarada e substituição explícita, proposta
  // versionada presa ao prazo de entrega registrado, resultado só com edital
  // encerrado e imutável, checklist derivado do dossiê e alerta só com regra
  // explícita. Transação única, idempotência por identidade.
  if (url.pathname === "/api/ext/bidding/notices") {
    return extBiddingApi.handleNotices(req, res);
  }
  const biddingMatch = url.pathname.match(/^\/api\/ext\/bidding\/notices\/([0-9a-f-]{36})$/i);
  if (biddingMatch) return extBiddingApi.handleNoticeById(req, res, biddingMatch[1]);
  const biddingResponsibleMatch = url.pathname.match(/^\/api\/ext\/bidding\/notices\/([0-9a-f-]{36})\/responsible$/i);
  if (biddingResponsibleMatch) return extBiddingApi.handleNoticeResponsible(req, res, biddingResponsibleMatch[1]);
  const biddingDeadlinesMatch = url.pathname.match(/^\/api\/ext\/bidding\/notices\/([0-9a-f-]{36})\/deadlines$/i);
  if (biddingDeadlinesMatch) return extBiddingApi.handleNoticeDeadlines(req, res, biddingDeadlinesMatch[1]);
  const biddingDeadlineSupersedeMatch = url.pathname.match(/^\/api\/ext\/bidding\/deadlines\/([0-9a-f-]{36})\/supersede$/i);
  if (biddingDeadlineSupersedeMatch) return extBiddingApi.handleDeadlineSupersede(req, res, biddingDeadlineSupersedeMatch[1]);
  const biddingProposalsMatch = url.pathname.match(/^\/api\/ext\/bidding\/notices\/([0-9a-f-]{36})\/proposals$/i);
  if (biddingProposalsMatch) return extBiddingApi.handleNoticeProposals(req, res, biddingProposalsMatch[1]);
  const biddingProposalWithdrawMatch = url.pathname.match(/^\/api\/ext\/bidding\/proposals\/([0-9a-f-]{36})\/withdraw$/i);
  if (biddingProposalWithdrawMatch) return extBiddingApi.handleProposalWithdraw(req, res, biddingProposalWithdrawMatch[1]);
  const biddingResultMatch = url.pathname.match(/^\/api\/ext\/bidding\/notices\/([0-9a-f-]{36})\/result$/i);
  if (biddingResultMatch) return extBiddingApi.handleNoticeResult(req, res, biddingResultMatch[1]);
  const biddingDocumentsMatch = url.pathname.match(/^\/api\/ext\/bidding\/notices\/([0-9a-f-]{36})\/documents$/i);
  if (biddingDocumentsMatch) return extBiddingApi.handleNoticeDocuments(req, res, biddingDocumentsMatch[1]);
  const biddingDocumentDeactivateMatch = url.pathname.match(/^\/api\/ext\/bidding\/documents\/([0-9a-f-]{36})\/deactivate$/i);
  if (biddingDocumentDeactivateMatch) return extBiddingApi.handleDocumentDeactivate(req, res, biddingDocumentDeactivateMatch[1]);
  const biddingChecklistMatch = url.pathname.match(/^\/api\/ext\/bidding\/notices\/([0-9a-f-]{36})\/checklist$/i);
  if (biddingChecklistMatch) return extBiddingApi.handleNoticeChecklist(req, res, biddingChecklistMatch[1]);
  const biddingChecklistDeactivateMatch = url.pathname.match(/^\/api\/ext\/bidding\/checklist\/([0-9a-f-]{36})\/deactivate$/i);
  if (biddingChecklistDeactivateMatch) return extBiddingApi.handleChecklistDeactivate(req, res, biddingChecklistDeactivateMatch[1]);
  const biddingAlertRulesMatch = url.pathname.match(/^\/api\/ext\/bidding\/notices\/([0-9a-f-]{36})\/alert-rules$/i);
  if (biddingAlertRulesMatch) return extBiddingApi.handleNoticeAlertRules(req, res, biddingAlertRulesMatch[1]);
  // Rotas legadas de licitações: leitura pela mesma autorização, com fonte e
  // derivação declaradas; mutação aposentada (410) — a rota antiga não é
  // atalho sem transação, idempotência nem máquina de estados.
  if (url.pathname === "/api/admin/hr/ext-bidding-notices" || url.pathname === "/api/crm/hr/ext-bidding-notices" || url.pathname === "/api/hr/ext-bidding-notices" || url.pathname === "/api/ext/bidding-notices") {
    return extBiddingApi.handleLegacyBiddingNotices(req, res);
  }
  if (url.pathname === "/api/admin/hr/ext-bidding-documents" || url.pathname === "/api/crm/hr/ext-bidding-documents" || url.pathname === "/api/hr/ext-bidding-documents" || url.pathname === "/api/ext/bidding-documents") {
    return extBiddingApi.handleLegacyBiddingDocuments(req, res);
  }
  // EXT-04 fornecedores canônicos (migração 150): jornada INTERNA de staff.
  // Não existe sessão/canal/upload/aceite do fornecedor; a fronteira externa e
  // a condição "se volume justificar" são declaradas pela API e pela tela.
  if (url.pathname === "/api/ext/supplier/references") return extSupplierApi.handleReferences(req, res);
  if (url.pathname === "/api/ext/supplier/quotations") return extSupplierApi.handleQuotations(req, res);
  if (url.pathname === "/api/ext/supplier/orders") return extSupplierApi.handleOrders(req, res);
  const supplierQuotationCreateMatch = url.pathname.match(/^\/api\/ext\/supplier\/suppliers\/([0-9a-f-]{36})\/products\/([0-9a-f-]{36})\/quotations$/i);
  if (supplierQuotationCreateMatch) return extSupplierApi.handleCreateQuotation(req, res, supplierQuotationCreateMatch[1], supplierQuotationCreateMatch[2]);
  const supplierQuotationMatch = url.pathname.match(/^\/api\/ext\/supplier\/quotations\/([0-9a-f-]{36})$/i);
  if (supplierQuotationMatch) return extSupplierApi.handleQuotationById(req, res, supplierQuotationMatch[1]);
  const supplierQuotationStatusMatch = url.pathname.match(/^\/api\/ext\/supplier\/quotations\/([0-9a-f-]{36})\/status$/i);
  if (supplierQuotationStatusMatch) return extSupplierApi.handleQuotationStatus(req, res, supplierQuotationStatusMatch[1]);
  const supplierQuotationDecisionMatch = url.pathname.match(/^\/api\/ext\/supplier\/quotations\/([0-9a-f-]{36})\/decision$/i);
  if (supplierQuotationDecisionMatch) return extSupplierApi.handleQuotationDecision(req, res, supplierQuotationDecisionMatch[1]);
  const supplierValidityMatch = url.pathname.match(/^\/api\/ext\/supplier\/quotations\/([0-9a-f-]{36})\/validities$/i);
  if (supplierValidityMatch) return extSupplierApi.handleQuotationValidities(req, res, supplierValidityMatch[1]);
  const supplierValiditySupersedeMatch = url.pathname.match(/^\/api\/ext\/supplier\/validities\/([0-9a-f-]{36})\/supersede$/i);
  if (supplierValiditySupersedeMatch) return extSupplierApi.handleValiditySupersede(req, res, supplierValiditySupersedeMatch[1]);
  const supplierAlertRulesMatch = url.pathname.match(/^\/api\/ext\/supplier\/quotations\/([0-9a-f-]{36})\/alert-rules$/i);
  if (supplierAlertRulesMatch) return extSupplierApi.handleAlertRules(req, res, supplierAlertRulesMatch[1]);
  const supplierDocumentsMatch = url.pathname.match(/^\/api\/ext\/supplier\/quotations\/([0-9a-f-]{36})\/documents$/i);
  if (supplierDocumentsMatch) return extSupplierApi.handleDocuments(req, res, supplierDocumentsMatch[1]);
  const supplierDocumentVersionMatch = url.pathname.match(/^\/api\/ext\/supplier\/documents\/([0-9a-f-]{36})\/versions$/i);
  if (supplierDocumentVersionMatch) return extSupplierApi.handleDocumentVersion(req, res, supplierDocumentVersionMatch[1]);
  const supplierDocumentDeactivateMatch = url.pathname.match(/^\/api\/ext\/supplier\/documents\/([0-9a-f-]{36})\/deactivate$/i);
  if (supplierDocumentDeactivateMatch) return extSupplierApi.handleDocumentDeactivate(req, res, supplierDocumentDeactivateMatch[1]);
  const supplierOrderCreateMatch = url.pathname.match(/^\/api\/ext\/supplier\/quotations\/([0-9a-f-]{36})\/orders$/i);
  if (supplierOrderCreateMatch) return extSupplierApi.handleCreateOrder(req, res, supplierOrderCreateMatch[1]);
  const supplierOrderStatusMatch = url.pathname.match(/^\/api\/ext\/supplier\/orders\/([0-9a-f-]{36})\/status$/i);
  if (supplierOrderStatusMatch) return extSupplierApi.handleOrderStatus(req, res, supplierOrderStatusMatch[1]);
  const supplierOrderDeadlinesMatch = url.pathname.match(/^\/api\/ext\/supplier\/orders\/([0-9a-f-]{36})\/deadlines$/i);
  if (supplierOrderDeadlinesMatch) return extSupplierApi.handleOrderDeadlines(req, res, supplierOrderDeadlinesMatch[1]);
  const supplierOrderDeadlineSupersedeMatch = url.pathname.match(/^\/api\/ext\/supplier\/order-deadlines\/([0-9a-f-]{36})\/supersede$/i);
  if (supplierOrderDeadlineSupersedeMatch) return extSupplierApi.handleOrderDeadlineSupersede(req, res, supplierOrderDeadlineSupersedeMatch[1]);
  // Legado: leitura autorizada preserva `items`; mutação retorna 410 somente
  // depois de 401/403/same-origin/identidade, sem atalho inseguro.
  if (url.pathname === "/api/admin/hr/ext-supplier-portal-quotations" || url.pathname === "/api/crm/hr/ext-supplier-portal-quotations" || url.pathname === "/api/hr/ext-supplier-portal-quotations" || url.pathname === "/api/ext/supplier-portal-quotations") {
    return extSupplierApi.handleLegacyQuotations(req, res);
  }
  // EXT-05 qualidade encerrar apenas com evidência e responsável
  if (url.pathname === "/api/admin/hr/ext-quality-nonconformities" || url.pathname === "/api/crm/hr/ext-quality-nonconformities" || url.pathname === "/api/hr/ext-quality-nonconformities" || url.pathname === "/api/ext/quality-nonconformities") {
    return extApi.handleQualityNonconformities(req, res);
  }
  if (url.pathname === "/api/admin/hr/ext-quality-actions" || url.pathname === "/api/crm/hr/ext-quality-actions" || url.pathname === "/api/hr/ext-quality-actions" || url.pathname === "/api/ext/quality-actions") {
    return extApi.handleQualityActions(req, res);
  }
  // EXT-06 satisfação resposta gera acompanhamento sem expor funcionário
  if (url.pathname === "/api/admin/hr/ext-satisfaction-surveys" || url.pathname === "/api/crm/hr/ext-satisfaction-surveys" || url.pathname === "/api/hr/ext-satisfaction-surveys" || url.pathname === "/api/ext/satisfaction-surveys") {
    return extApi.handleSatisfactionSurveys(req, res);
  }
  // EXT-07 compliance vencimento gera tarefa documento privado
  if (url.pathname === "/api/admin/hr/ext-compliance-documents" || url.pathname === "/api/crm/hr/ext-compliance-documents" || url.pathname === "/api/hr/ext-compliance-documents" || url.pathname === "/api/ext/compliance-documents") {
    return extAdvancedApi.handleComplianceDocuments(req, res);
  }
  // EXT-08 base conhecimento procedimentos versionados busca acesso ciência usuário encontra apenas conteúdo de seu escopo
  if (url.pathname === "/api/admin/hr/ext-knowledge-base" || url.pathname === "/api/crm/hr/ext-knowledge-base" || url.pathname === "/api/hr/ext-knowledge-base" || url.pathname === "/api/ext/knowledge-base") {
    return extAdvancedApi.handleKnowledgeBase(req, res);
  }
  // EXT-09 expansão premissas e fonte visíveis sem projeção vendida como certeza
  if (url.pathname === "/api/admin/hr/ext-expansion-plans" || url.pathname === "/api/crm/hr/ext-expansion-plans" || url.pathname === "/api/hr/ext-expansion-plans" || url.pathname === "/api/ext/expansion-plans") {
    return extAdvancedApi.handleExpansionPlans(req, res);
  }
  if (url.pathname === "/api/admin/hr/ext-expansion-scenarios" || url.pathname === "/api/crm/hr/ext-expansion-scenarios" || url.pathname === "/api/hr/ext-expansion-scenarios" || url.pathname === "/api/ext/expansion-scenarios") {
    return extAdvancedApi.handleExpansionScenarios(req, res);
  }
  // EXT-10 continuidade operacional simulado documentado com responsáveis
  if (url.pathname === "/api/admin/hr/ext-continuity-plans" || url.pathname === "/api/crm/hr/ext-continuity-plans" || url.pathname === "/api/hr/ext-continuity-plans" || url.pathname === "/api/ext/continuity-plans") {
    return extAdvancedApi.handleContinuityPlans(req, res);
  }
  // EXT-11 analytics A/B experimento reversível resultado sem dados inventados
  if (url.pathname === "/api/admin/hr/ext-analytics-experiments" || url.pathname === "/api/crm/hr/ext-analytics-experiments" || url.pathname === "/api/hr/ext-analytics-experiments" || url.pathname === "/api/ext/analytics-experiments") {
    return extAdvancedApi.handleAnalyticsExperiments(req, res);
  }
  // EXT-12 editor visual avançado permissão real recarga consistente e rollback
  if (url.pathname === "/api/admin/hr/ext-visual-tokens" || url.pathname === "/api/crm/hr/ext-visual-tokens" || url.pathname === "/api/hr/ext-visual-tokens" || url.pathname === "/api/ext/visual-tokens") {
    return extAdvancedApi.handleVisualTokens(req, res);
  }
  if (url.pathname === "/api/admin/hr/ext-visual-layouts" || url.pathname === "/api/crm/hr/ext-visual-layouts" || url.pathname === "/api/hr/ext-visual-layouts" || url.pathname === "/api/ext/visual-layouts") {
    return extAdvancedApi.handleVisualLayouts(req, res);
  }
  // EXT-13 relatório programado gerado apenas de dados reais escopo cliente autorizado sem dado inventado sem dado não autorizado
  if (url.pathname === "/api/admin/hr/ext-periodic-reports" || url.pathname === "/api/crm/hr/ext-periodic-reports" || url.pathname === "/api/hr/ext-periodic-reports" || url.pathname === "/api/ext/periodic-reports") {
    return extReportingApi.handlePeriodicReports(req, res);
  }
  // EXT-14 inteligência comercial justificativa obrigatória uso bloqueado sem aprovação humana
  if (url.pathname === "/api/admin/hr/ext-commercial-intelligence" || url.pathname === "/api/crm/hr/ext-commercial-intelligence" || url.pathname === "/api/hr/ext-commercial-intelligence" || url.pathname === "/api/ext/commercial-intelligence") {
    return extReportingApi.handleCommercialIntelligence(req, res);
  }
  // EXT-15 emergencial apoio testar recebimento e atendimento antes disponibilizar
  if (url.pathname === "/api/admin/hr/ext-emergency-channels" || url.pathname === "/api/crm/hr/ext-emergency-channels" || url.pathname === "/api/hr/ext-emergency-channels" || url.pathname === "/api/ext/emergency-channels") {
    return extReportingApi.handleEmergencyChannels(req, res);
  }
  if (url.pathname === "/api/admin/hr/ext-emergency-tests" || url.pathname === "/api/crm/hr/ext-emergency-tests" || url.pathname === "/api/hr/ext-emergency-tests" || url.pathname === "/api/ext/emergency-tests") {
    return extReportingApi.handleEmergencyTests(req, res);
  }
  // EXT-16 central monitoramento/vídeo projeto separado privacidade aprovada antes implantação
  if (url.pathname === "/api/admin/hr/ext-central-projects" || url.pathname === "/api/crm/hr/ext-central-projects" || url.pathname === "/api/hr/ext-central-projects" || url.pathname === "/api/ext/central-projects") {
    return extReportingApi.handleCentralProjects(req, res);
  }
  // EXT-17 biometria facial projeto separado privacidade aprovada não coletar por padrão
  if (url.pathname === "/api/admin/hr/ext-biometry-projects" || url.pathname === "/api/crm/hr/ext-biometry-projects" || url.pathname === "/api/hr/ext-biometry-projects" || url.pathname === "/api/ext/biometry-projects") {
    return extReportingApi.handleBiometryProjects(req, res);
  }
  // AI-10 automação determinística vencimentos distribuição tarefas cobrança interna antes agentes autônomos AI-01..09 desligado
  if (url.pathname === "/api/admin/hr/ext-ai-automations" || url.pathname === "/api/crm/hr/ext-ai-automations" || url.pathname === "/api/hr/ext-ai-automations" || url.pathname === "/api/ext/ai-automations" || url.pathname === "/api/ai/automations") {
    return extReportingApi.handleAiAutomations(req, res);
  }
  if (url.pathname === "/api/admin/hr/ext-ai-automation-logs" || url.pathname === "/api/crm/hr/ext-ai-automation-logs" || url.pathname === "/api/hr/ext-ai-automation-logs" || url.pathname === "/api/ext/ai-automation-logs" || url.pathname === "/api/ai/automation-logs") {
    return extReportingApi.handleAiAutomationLogs(req, res);
  }
  // PUB-06 CMS páginas FAQ cases blog vagas rascunho/revisão/publicação histórico reversão
  if (url.pathname === "/api/admin/cms-contents" || url.pathname === "/api/cms-contents" || url.pathname === "/api/public/cms-contents") {
    return cmsApi.handleContents(req, res);
  }
  const cmsContentByIdMatch = url.pathname.match(/^\/api\/admin\/cms-contents\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/cms-contents\/([0-9a-f-]{36})$/i);
  if (cmsContentByIdMatch) return cmsApi.handleContentById(req, res, cmsContentByIdMatch[1]);
  if (url.pathname === "/api/admin/cms-contents/revert" || url.pathname === "/api/cms-contents/revert") {
    return cmsApi.handleRevert(req, res);
  }
  // public CMS published only
  if (url.pathname === "/api/cms" || url.pathname === "/api/public/cms" || url.pathname === "/api/seo/cms") {
    return cmsApi.handleContents(req, res);
  }
  // PUB-07 temas preview publicação autorizada rollback preferência dia/noite separada
  if (url.pathname === "/api/admin/themes" || url.pathname === "/api/themes" || url.pathname === "/api/public/themes") {
    return themeApi.handleThemes(req, res);
  }
  const themeByIdMatch = url.pathname.match(/^\/api\/admin\/themes\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/themes\/([0-9a-f-]{36})$/i);
  if (themeByIdMatch) return themeApi.handleThemeById(req, res, themeByIdMatch[1]);
  if (url.pathname === "/api/admin/theme-previews" || url.pathname === "/api/themes/preview" || url.pathname === "/api/public/theme-previews" || url.pathname.startsWith("/api/theme-previews")) {
    return themeApi.handlePreview(req, res);
  }
  if (url.pathname === "/api/admin/theme-preferences" || url.pathname === "/api/theme-preferences" || url.pathname === "/api/public/theme-preferences") {
    return themeApi.handlePreferences(req, res);
  }
  if (url.pathname === "/api/admin/themes/rollback" || url.pathname === "/api/themes/rollback") {
    return themeApi.handleRollback(req, res);
  }
  // PUB-08 SEO técnico títulos sitemap redirects verificação domínio noindex preservado
  // `/robots.txt` e `/sitemap.xml` são derivados do código e fail-closed fora
  // de produção; nenhum dos dois lê tabela editável.
  if (url.pathname === "/robots.txt") return seoTechnicalApi.handleRobotsTxt(req, res);
  if (url.pathname === "/sitemap.xml") return seoTechnicalApi.handleSitemapXml(req, res);
  if (url.pathname === "/api/admin/seo-configs" || url.pathname === "/api/seo-configs" || url.pathname === "/api/seo") {
    return seoApi.handleConfigs(req, res);
  }
  if (url.pathname === "/api/admin/seo-redirects" || url.pathname === "/api/seo-redirects") {
    return seoTechnicalApi.handleRedirects(req, res);
  }
  // O sitemap deixou de ter loja de linhas digitadas: toda leitura
  // administrativa é a prévia derivada do que seria publicado.
  if (url.pathname === "/api/admin/seo/sitemap-preview" || url.pathname === "/api/admin/seo-sitemap"
    || url.pathname === "/api/seo-sitemap" || url.pathname === "/api/sitemap") {
    return seoTechnicalApi.handleSitemapPreview(req, res);
  }
  if (url.pathname === "/api/admin/domain-verifications" || url.pathname === "/api/domain-verifications" || url.pathname === "/api/seo/domain-verifications") {
    return seoApi.handleDomainVerification(req, res);
  }
  // PUB-09 montador pacote comparador serviços e planos somente catálogo e regras aprovadas
  if (url.pathname === "/api/admin/package-rules" || url.pathname === "/api/package-rules") {
    return packageApi.handleRules(req, res);
  }
  if (url.pathname === "/api/admin/service-packages" || url.pathname === "/api/service-packages" || url.pathname === "/api/packages" || url.pathname === "/api/public/packages") {
    return packageApi.handlePackages(req, res);
  }
  if (url.pathname === "/api/admin/package-comparisons" || url.pathname === "/api/package-comparisons") {
    return packageApi.handleComparisons(req, res);
  }
  // PUB-10 mensuração origem conversão A/B testes minimização dados
  if (url.pathname === "/api/admin/origin-metrics" || url.pathname === "/api/origin-metrics" || url.pathname === "/api/public/origin-metrics") {
    return originMetricsApi.handleOriginMetrics(req, res);
  }
  if (url.pathname === "/api/admin/conversion-events" || url.pathname === "/api/conversion-events") {
    return originMetricsApi.handleConversionEvents(req, res);
  }
  if (url.pathname === "/api/admin/ab-tests" || url.pathname === "/api/ab-tests" || url.pathname === "/api/public/ab-tests") {
    return originMetricsApi.handleAbTests(req, res);
  }
  // CLI-15 reclamação colaborador canal restrito RH mínimo
  // CLI-15: canal restrito do cliente, somente sessão de cliente canônica.
  if (url.pathname === "/api/client/employee-complaints") {
    return clientEmployeeComplaintApi.handleComplaints(req, res);
  }
  const clientEmpComplaintMatch = url.pathname.match(/^\/api\/client\/employee-complaints\/([0-9a-f-]{36})$/i);
  if (clientEmpComplaintMatch) return clientEmployeeComplaintApi.handleComplaintById(req, res, clientEmpComplaintMatch[1]);
  if (url.pathname === "/api/admin/employee-complaints" || url.pathname === "/api/employee-complaints" || url.pathname === "/api/cli/employee-complaints") {
    return employeeComplaintApi.handleComplaints(req, res);
  }
  const empComplaintByIdMatch = url.pathname.match(/^\/api\/admin\/employee-complaints\/([0-9a-f-]{36})$/i) || url.pathname.match(/^\/api\/employee-complaints\/([0-9a-f-]{36})$/i);
  if (empComplaintByIdMatch) return employeeComplaintApi.handleComplaintById(req, res, empComplaintByIdMatch[1]);
  if (url.pathname === "/api/admin/employee-complaint-messages" || url.pathname === "/api/employee-complaint-messages") {
    return employeeComplaintApi.handleMessages(req, res);
  }
  if (url.pathname === "/api/admin/employee-complaint-evidences" || url.pathname === "/api/employee-complaint-evidences") {
    return employeeComplaintApi.handleEvidences(req, res);
  }
  if (url.pathname === "/api/admin/employee-complaint-hr-shares" || url.pathname === "/api/employee-complaint-hr-shares") {
    return employeeComplaintApi.handleHrShare(req, res);
  }
  // PUB-02 páginas por serviço e segmento contato claro FAQ revisada cases autorizados acessibilidade navegação desempenho
  if (url.pathname === "/api/admin/pub-segments" || url.pathname === "/api/pub-segments" || url.pathname === "/api/segments" || url.pathname === "/api/public/segments" || url.pathname === "/api/pub/segments") {
    return pubFaqAssistedApi.handleSegments(req, res);
  }
  if (url.pathname === "/api/admin/pub-performance" || url.pathname === "/api/pub-performance" || url.pathname === "/api/performance-metrics") {
    return pubFaqAssistedApi.handlePerformance(req, res);
  }
  if (url.pathname === "/api/admin/pub-accessibility" || url.pathname === "/api/pub-accessibility" || url.pathname === "/api/accessibility-checks") {
    return pubFaqAssistedApi.handleAccessibility(req, res);
  }
  // PUB-05 FAQ assistida e transferência humana bot não inventa preço/cobertura/licença/prazo
  if (url.pathname === "/api/admin/faq-assisted-rules" || url.pathname === "/api/faq-assisted-rules" || url.pathname === "/api/pub/faq-rules") {
    return pubFaqAssistedApi.handleRules(req, res);
  }
  if (url.pathname === "/api/faq-assisted" || url.pathname === "/api/public/faq-assisted" || url.pathname === "/api/pub/faq-sessions" || url.pathname === "/api/admin/faq-assisted-sessions" || url.pathname === "/api/admin/pub-faq-sessions") {
    return pubFaqAssistedApi.handleSessions(req, res);
  }
  if (url.pathname === "/api/faq-assisted-messages" || url.pathname === "/api/pub/faq-messages" || url.pathname === "/api/admin/faq-assisted-messages") {
    return pubFaqAssistedApi.handleMessages(req, res);
  }
  if (url.pathname === "/api/faq-assisted-handoff" || url.pathname === "/api/pub/handoff-requests" || url.pathname === "/api/admin/faq-handoff" || url.pathname === "/api/admin/human-handoff") {
    return pubFaqAssistedApi.handleHandoff(req, res);
  }
  // AI RAG 3 separados cliente/RH/Marcelo Ollama Qwen3 1.7B fila + bot modes sem_ia/com_ia/whatsapp + feedback + custo/token
  if (url.pathname === "/api/admin/ai-rag-indexes" || url.pathname === "/api/ai-rag-indexes" || url.pathname === "/api/ai/rag-indexes") {
    return aiRagApi.handleIndexes(req, res);
  }
  if (url.pathname === "/api/admin/ai-rag-documents" || url.pathname === "/api/ai-rag-documents" || url.pathname === "/api/ai/rag-documents") {
    return aiRagApi.handleDocuments(req, res);
  }
  if (url.pathname === "/api/admin/ai-rag-queries" || url.pathname === "/api/ai-rag-queries" || url.pathname === "/api/ai/rag" || url.pathname === "/api/public/ai/rag" || url.pathname === "/api/ai/rag/queries") {
    return aiRagApi.handleQueries(req, res);
  }
  if (url.pathname === "/api/ai/rag/feedback" || url.pathname === "/api/public/ai/rag/feedback" || url.pathname === "/api/admin/ai-rag-feedback") {
    return aiRagApi.handleFeedback(req, res);
  }
  if (url.pathname === "/api/admin/ai-rag-cost" || url.pathname === "/api/ai/rag/cost" || url.pathname === "/api/ai-rag-cost-tracking") {
    return aiRagApi.handleCostTracking(req, res);
  }
  if (url.pathname === "/api/admin/ai-bot-config" || url.pathname === "/api/ai-bot-config" || url.pathname === "/api/ai/bot-config") {
    return aiRagApi.handleBotConfig(req, res);
  }
  if (url.pathname === "/api/ai/bot" || url.pathname === "/api/public/ai/bot" || url.pathname === "/api/bot" || url.pathname === "/api/admin/ai-bot-sessions" || url.pathname === "/api/ai/bot-sessions") {
    return aiRagApi.handleBotSessions(req, res);
  }
  if (url.pathname === "/api/admin/ai-rag-chunks" || url.pathname === "/api/ai-rag-chunks" || url.pathname === "/api/ai/rag-chunks") {
    return aiRagApi.handleChunks(req, res);
  }
  return json(res, 404, { error: "not_found" });
  } catch (e) {
    routeError = e;
    statusForObs = 500;
    console.error(`[${requestId}] routeApi error`, e?.message);
    try { return json(res, 500, { error: "internal_error", request_id: requestId }); } catch { res.statusCode = 500; res.end(); }
  } finally {
    const duration = Date.now() - start;
    try {
      const session = await readSession(req);
      const userKind = session?.role || null;
      const userId = session?.identityId || null;
      const ip = req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket?.remoteAddress || null;
      const ua = req.headers['user-agent'] || null;
      const urlForLog = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      obs.recordHttp({
        request_id: requestId,
        correlation_id: correlationId,
        method: req.method,
        path: urlForLog.pathname,
        status_code: statusForObs,
        duration_ms: duration,
        user_kind: userKind,
        user_id: userId,
        ip,
        user_agent: ua,
        error: routeError,
      });
    } catch {}
    // Clear globals
    try { globalThis.__currentRequestId = null; globalThis.__currentCorrelationId = null; } catch {}
  }
}

const API_PATH_MATCH = pathname =>
  pathname === "/api/site-visual"
  || pathname === "/api/leads"
  || pathname === "/api/admin/session"
  || pathname === "/api/admin/session/mfa"
  || pathname.startsWith("/api/employee/")
  || pathname.startsWith("/api/admin/hr/l03/")
  || pathname === "/api/admin/leads"
  || pathname.startsWith("/api/admin/leads/")
  || pathname.startsWith("/api/auth/")
  || pathname === "/api/admin/invites"
  || pathname.startsWith("/api/admin/invites/")
  || pathname === "/api/admin/client-verifications"
  || pathname.startsWith("/api/admin/client-verifications/")
  || pathname.startsWith("/api/client/")
  || pathname === "/api/admin/identities"
  || pathname === "/api/admin/client-accounts"
  || pathname.startsWith("/api/admin/client-accounts/")
  || pathname === "/api/admin/grants"
  || pathname.startsWith("/api/admin/grants/")
  || pathname === "/api/admin/contracts"
  || pathname.startsWith("/api/admin/contracts/")
  || pathname === "/api/admin/documents"
  || pathname.startsWith("/api/admin/documents/")
  || pathname === "/api/admin/tickets"
  || pathname.startsWith("/api/admin/tickets/")
  || pathname === "/api/admin/client-visits"
  || pathname.startsWith("/api/admin/client-visits/")
  || pathname === "/api/admin/client-reports"
  || pathname.startsWith("/api/admin/client-reports/")
  || pathname === "/api/admin/permissions"
  || pathname.startsWith("/api/admin/permissions/")
  || pathname === "/api/admin/access-reviews"
  || pathname === "/api/admin/audit"
  || pathname === "/api/admin/audit/export"
  || pathname === "/api/admin/notifications"
  || pathname.startsWith("/api/admin/notifications/")
  || pathname === "/api/admin/outbox"
  || pathname.startsWith("/api/admin/outbox/")
  || pathname === "/api/admin/integrations"
  || pathname.startsWith("/api/admin/integrations/")
  || pathname === "/api/catalog"
  || pathname === "/api/services"
  || pathname.startsWith("/api/catalog/")
  || pathname.startsWith("/api/services/")
  || pathname === "/api/faq"
  || pathname === "/api/cases"
  || pathname === "/api/crm/companies"
  || pathname.startsWith("/api/crm/companies/")
  || pathname === "/api/crm/contacts"
  || pathname.startsWith("/api/crm/contacts/")
  || pathname === "/api/crm/units"
  || pathname.startsWith("/api/crm/units/")
  || pathname === "/api/crm/cadences/templates"
  || pathname.startsWith("/api/crm/cadences/templates/")
  || pathname === "/api/crm/opportunities"
  || pathname.startsWith("/api/crm/opportunities/")
  || pathname === "/api/crm/visits/agenda"
  || pathname === "/api/crm/tasks/delegated"
  || pathname.startsWith("/api/crm/tasks/delegated/")
  || pathname.startsWith("/api/crm/leads/")
  || pathname === "/api/crm/imports"
  || pathname === "/api/crm/imports/preview"
  || pathname.startsWith("/api/crm/imports/")
  || pathname === "/api/crm/equipment"
  || pathname.startsWith("/api/crm/equipment/")
  || pathname === "/api/crm/inspection-templates"
  || pathname === "/api/crm/inspections"
  || pathname.startsWith("/api/crm/inspections/")
  || pathname === "/api/crm/labor-budgets"
  || pathname.startsWith("/api/crm/labor-budgets/")
  || pathname === "/api/crm/technical-budgets"
  || pathname.startsWith("/api/crm/technical-budgets/")
  || pathname === "/api/crm/cost-parameters"
  || pathname.startsWith("/api/crm/cost-parameters/")
  || pathname === "/api/crm/price-scenarios"
  || pathname.startsWith("/api/crm/price-scenarios/")
  || pathname === "/api/crm/discount-policies"
  || pathname.startsWith("/api/crm/discount-policies/")
  || pathname === "/api/crm/discount-requests"
  || pathname.startsWith("/api/crm/discount-requests/")
  || pathname === "/api/crm/proposals"
  || pathname.startsWith("/api/crm/proposals/")
  || pathname === "/api/crm/proposal-deliveries"
  || pathname.startsWith("/api/crm/proposal-deliveries/")
  || pathname === "/api/crm/proposal-acceptance-links"
  || pathname.startsWith("/api/crm/proposal-acceptance-links/")
  || pathname.startsWith("/api/crm/proposals/accept/")
  || pathname === "/api/crm/contracts"
  || pathname.startsWith("/api/crm/contracts/")
  || pathname === "/api/crm/contracts/from-proposal"
  || pathname === "/api/crm/reports"
  || pathname.startsWith("/api/crm/reports/")
  || pathname === "/api/crm/goals"
  || pathname.startsWith("/api/crm/goals/")
  || pathname === "/api/crm/commission-rules"
  || pathname.startsWith("/api/crm/commission-rules/")
  || pathname === "/api/crm/commissions"
  || pathname.startsWith("/api/crm/commissions/")
  || pathname === "/api/crm/commercial-library"
  || pathname.startsWith("/api/crm/commercial-library/")
  || pathname === "/api/crm/campaigns"
  || pathname.startsWith("/api/crm/campaigns/")
  || pathname === "/api/crm/proposal-comparisons"
  || pathname.startsWith("/api/crm/proposal-comparisons/")
  || pathname === "/api/crm/portfolio"
  || pathname === "/api/crm/commercial-versions"
  || pathname === "/api/crm/partners"
  || pathname.startsWith("/api/crm/partners/")
  || pathname === "/api/crm/referrals"
  || pathname.startsWith("/api/crm/referrals/")
  || pathname === "/api/crm/renewals"
  || pathname.startsWith("/api/crm/renewals/")
  || pathname === "/api/crm/partnership-metrics"
  || pathname === "/api/crm/notification-preferences"
  || pathname === "/api/admin/notification-preferences"
  || pathname === "/api/crm/notification-templates"
  || pathname.startsWith("/api/crm/notification-templates/")
  || pathname === "/api/admin/notification-templates"
  || pathname.startsWith("/api/admin/notification-templates/")
  || pathname === "/api/crm/observability"
  || pathname === "/api/admin/observability"
  || pathname.startsWith("/api/crm/observability/")
  || pathname.startsWith("/api/admin/observability/")
  || pathname === "/api/health"
  || pathname === "/health"
  || pathname === "/api/healthcheck"
  || pathname === "/api/health/live"
  || pathname === "/api/health/liveness"
  || pathname === "/health/live"
  || pathname === "/api/health/ready"
  || pathname === "/api/health/readiness"
  || pathname === "/health/ready"
  || pathname === "/api/admin/operational"
  || pathname === "/api/admin/health"
  || pathname === "/api/crm/operational"
  || pathname.startsWith("/api/admin/operational/")
  || pathname.startsWith("/api/crm/operational/")
  || pathname === "/api/admin/backups"
  || pathname === "/api/crm/backups"
  || pathname.startsWith("/api/admin/backups/")
  || pathname.startsWith("/api/crm/backups/")
  || pathname === "/api/admin/privacy/inventory"
  || pathname === "/api/crm/privacy/inventory"
  || pathname === "/api/privacy/inventory"
  || pathname === "/api/admin/privacy/policies"
  || pathname === "/api/crm/privacy/policies"
  || pathname === "/api/privacy/policies"
  || pathname === "/api/privacy"
  || pathname.startsWith("/api/admin/privacy/policies/")
  || pathname.startsWith("/api/crm/privacy/policies/")
  || pathname.startsWith("/api/privacy/policies/")
  || pathname === "/api/lgpd/requests"
  || pathname === "/api/privacy/requests"
  || pathname === "/api/public/lgpd"
  || pathname === "/api/admin/lgpd/requests"
  || pathname === "/api/crm/lgpd/requests"
  || pathname === "/api/admin/privacy/requests"
  || pathname.startsWith("/api/admin/lgpd/requests/")
  || pathname.startsWith("/api/crm/lgpd/requests/")
  || pathname.startsWith("/api/admin/privacy/requests/")
  || pathname.startsWith("/api/lgpd/requests/")
  || pathname === "/api/admin/retention/policies"
  || pathname === "/api/crm/retention/policies"
  || pathname === "/api/privacy/retention/policies"
  || pathname === "/api/admin/privacy/retention"
  || pathname === "/api/admin/retention/exceptions"
  || pathname === "/api/crm/retention/exceptions"
  || pathname === "/api/privacy/retention/exceptions"
  || pathname.startsWith("/api/admin/retention/exceptions/")
  || pathname.startsWith("/api/crm/retention/exceptions/")
  || pathname.startsWith("/api/privacy/retention/exceptions/")
  || pathname === "/api/admin/retention/disposal/jobs"
  || pathname === "/api/crm/retention/disposal/jobs"
  || pathname === "/api/admin/disposal/jobs"
  || pathname === "/api/privacy/disposal/jobs"
  || pathname.startsWith("/api/admin/retention/disposal/jobs/")
  || pathname.startsWith("/api/crm/retention/disposal/jobs/")
  || pathname.startsWith("/api/admin/disposal/jobs/")
  || pathname.startsWith("/api/privacy/disposal/jobs/")
  || pathname === "/api/admin/retention/disposal/logs"
  || pathname === "/api/crm/retention/disposal/logs"
  || pathname === "/api/admin/disposal/logs"
  || pathname === "/api/privacy/disposal/logs"
  || pathname === "/api/admin/incidents"
  || pathname === "/api/crm/incidents"
  || pathname === "/api/security/incidents"
  || pathname.startsWith("/api/admin/incidents/")
  || pathname.startsWith("/api/crm/incidents/")
  || pathname.startsWith("/api/security/incidents/")
  || pathname === "/api/admin/config/flags"
  || pathname === "/api/crm/config/flags"
  || pathname === "/api/config/flags"
  || pathname.startsWith("/api/admin/config/flags/")
  || pathname.startsWith("/api/crm/config/flags/")
  || pathname.startsWith("/api/config/flags/")
  || pathname === "/api/admin/config/maintenance"
  || pathname === "/api/crm/config/maintenance"
  || pathname === "/api/config/maintenance"
  || pathname === "/api/admin/config/rollouts"
  || pathname === "/api/crm/config/rollouts"
  || pathname === "/api/config/rollouts"
  || pathname === "/api/admin/dependencies/audits"
  || pathname === "/api/crm/dependencies/audits"
  || pathname === "/api/dependencies/audits"
  || pathname === "/api/admin/dependencies/vulnerabilities"
  || pathname === "/api/crm/dependencies/vulnerabilities"
  || pathname === "/api/dependencies/vulnerabilities"
  || pathname === "/api/admin/dependencies/updates"
  || pathname === "/api/crm/dependencies/updates"
  || pathname === "/api/dependencies/updates"
  || pathname === "/api/admin/dependencies/lockfile"
  || pathname === "/api/crm/dependencies/lockfile"
  || pathname === "/api/dependencies/lockfile"
  || pathname === "/api/admin/integrations/jobs"
  || pathname === "/api/crm/integrations/jobs"
  || pathname === "/api/integrations/jobs"
  || pathname === "/api/admin/integrations/logs"
  || pathname === "/api/crm/integrations/logs"
  || pathname === "/api/integrations/logs"
  || pathname === "/api/admin/integrations/webhooks"
  || pathname === "/api/crm/integrations/webhooks"
  || pathname === "/api/integrations/webhooks"
  || pathname === "/api/admin/integrations/webhooks/deliveries"
  || pathname === "/api/crm/integrations/webhooks/deliveries"
  || pathname === "/api/integrations/webhooks/deliveries"
  || pathname === "/api/admin/integrations/reconciliation"
  || pathname === "/api/crm/integrations/reconciliation"
  || pathname === "/api/integrations/reconciliation"
  || pathname === "/api/admin/budgets"
  || pathname === "/api/crm/budgets"
  || pathname === "/api/budgets"
  || pathname === "/api/admin/usage/metrics"
  || pathname === "/api/crm/usage/metrics"
  || pathname === "/api/usage/metrics"
  || pathname === "/api/admin/usage/alerts"
  || pathname === "/api/crm/usage/alerts"
  || pathname === "/api/usage/alerts"
  || pathname === "/api/admin/environments"
  || pathname === "/api/crm/environments"
  || pathname === "/api/environments"
  || pathname === "/api/admin/environments/checks"
  || pathname === "/api/crm/environments/checks"
  || pathname === "/api/environments/checks"
  || pathname === "/api/admin/maintenance/docs"
  || pathname === "/api/crm/maintenance/docs"
  || pathname === "/api/maintenance/docs"
  || pathname === "/api/docs"
  || pathname.startsWith("/api/admin/maintenance/docs/")
  || pathname.startsWith("/api/crm/maintenance/docs/")
  || pathname.startsWith("/api/maintenance/docs/")
  || pathname.startsWith("/api/docs/")
  || pathname === "/api/admin/hr/employees"
  || pathname === "/api/crm/hr/employees"
  || pathname === "/api/hr/employees"
  || pathname.startsWith("/api/admin/hr/employees/")
  || pathname.startsWith("/api/crm/hr/employees/")
  || pathname.startsWith("/api/hr/employees/")
  || pathname === "/api/admin/hr/admissions"
  || pathname === "/api/crm/hr/admissions"
  || pathname === "/api/hr/admissions"
  || pathname.startsWith("/api/admin/hr/admissions/")
  || pathname.startsWith("/api/crm/hr/admissions/")
  || pathname.startsWith("/api/hr/admissions/")
  || pathname === "/api/admin/hr/admission-progress"
  || pathname === "/api/crm/hr/admission-progress"
  || pathname === "/api/hr/admission-progress"
  || pathname === "/api/employee/profile"
  || pathname === "/api/crm/employee/profile"
  || pathname === "/api/admin/employee/profile"
  || pathname === "/api/hr/my-profile"
  || pathname === "/api/admin/hr/my-profile"
  || pathname === "/api/admin/hr/profile-updates"
  || pathname === "/api/crm/hr/profile-updates"
  || pathname === "/api/hr/profile-updates"
  || pathname === "/api/admin/employee/profile-updates"
  || pathname === "/api/admin/hr/vacancies"
  || pathname === "/api/crm/hr/vacancies"
  || pathname === "/api/hr/vacancies"
  || pathname === "/api/admin/hr/candidates"
  || pathname === "/api/crm/hr/candidates"
  || pathname === "/api/hr/candidates"
  || pathname === "/api/admin/hr/interviews"
  || pathname === "/api/crm/hr/interviews"
  || pathname === "/api/hr/interviews"
  || pathname === "/api/admin/hr/talent-pool"
  || pathname === "/api/crm/hr/talent-pool"
  || pathname === "/api/hr/talent-pool"
  || pathname === "/api/admin/hr/dossiers"
  || pathname === "/api/crm/hr/dossiers"
  || pathname === "/api/hr/dossiers"
  || pathname === "/api/admin/hr/employee-dossiers"
  || pathname === "/api/admin/hr/terminations"
  || pathname === "/api/crm/hr/terminations"
  || pathname === "/api/hr/terminations"
  || pathname.startsWith("/api/admin/hr/terminations/")
  || pathname.startsWith("/api/crm/hr/terminations/")
  || pathname.startsWith("/api/hr/terminations/")
  || pathname === "/api/admin/hr/termination-progress"
  || pathname === "/api/crm/hr/termination-progress"
  || pathname === "/api/hr/termination-progress"
  || pathname === "/api/admin/hr/status-policies"
  || pathname === "/api/crm/hr/status-policies"
  || pathname === "/api/hr/status-policies"
  || pathname === "/api/admin/hr/vacation-periods"
  || pathname === "/api/crm/hr/vacation-periods"
  || pathname === "/api/hr/vacation-periods"
  || pathname === "/api/admin/hr/vacation-requests"
  || pathname === "/api/crm/hr/vacation-requests"
  || pathname === "/api/hr/vacation-requests"
  || pathname === "/api/admin/hr/absences"
  || pathname === "/api/crm/hr/absences"
  || pathname === "/api/hr/absences"
  || pathname === "/api/admin/hr/time-entries"
  || pathname === "/api/crm/hr/time-entries"
  || pathname === "/api/hr/time-entries"
  || pathname === "/api/admin/hr/time-corrections"
  || pathname === "/api/crm/hr/time-corrections"
  || pathname === "/api/hr/time-corrections"
  || pathname === "/api/admin/hr/competence-closures"
  || pathname === "/api/crm/hr/competence-closures"
  || pathname === "/api/hr/competence-closures"
  || pathname === "/api/admin/hr/work-rules"
  || pathname === "/api/crm/hr/work-rules"
  || pathname === "/api/hr/work-rules"
  || pathname === "/api/admin/hr/hour-bank"
  || pathname === "/api/crm/hr/hour-bank"
  || pathname === "/api/hr/hour-bank"
  || pathname === "/api/admin/hr/hour-movements"
  || pathname === "/api/crm/hr/hour-movements"
  || pathname === "/api/hr/hour-movements"
  || pathname === "/api/admin/hr/benefit-catalog"
  || pathname === "/api/crm/hr/benefit-catalog"
  || pathname === "/api/hr/benefit-catalog"
  || pathname === "/api/admin/hr/benefit-enrollments"
  || pathname === "/api/crm/hr/benefit-enrollments"
  || pathname === "/api/hr/benefit-enrollments"
  || pathname === "/api/admin/hr/benefit-requests"
  || pathname === "/api/crm/hr/benefit-requests"
  || pathname === "/api/hr/benefit-requests"
  || pathname === "/api/admin/hr/benefit-conferences"
  || pathname === "/api/crm/hr/benefit-conferences"
  || pathname === "/api/hr/benefit-conferences"
  || pathname === "/api/admin/hr/benefit-exports"
  || pathname === "/api/crm/hr/benefit-exports"
  || pathname === "/api/hr/benefit-exports"
  || pathname === "/api/admin/hr/advance-policies"
  || pathname === "/api/crm/hr/advance-policies"
  || pathname === "/api/hr/advance-policies"
  || pathname === "/api/admin/hr/advance-requests"
  || pathname === "/api/crm/hr/advance-requests"
  || pathname === "/api/hr/advance-requests"
  || pathname === "/api/admin/hr/occupational-requirements"
  || pathname === "/api/crm/hr/occupational-requirements"
  || pathname === "/api/hr/occupational-requirements"
  || pathname === "/api/admin/hr/occupational-agenda"
  || pathname === "/api/crm/hr/occupational-agenda"
  || pathname === "/api/hr/occupational-agenda"
  || pathname === "/api/admin/hr/occupational-documents"
  || pathname === "/api/crm/hr/occupational-documents"
  || pathname === "/api/hr/occupational-documents"
  || pathname === "/api/admin/hr/integration-exports"
  || pathname === "/api/crm/hr/integration-exports"
  || pathname === "/api/hr/integration-exports"
  || pathname === "/api/admin/hr/integration-receipts"
  || pathname === "/api/crm/hr/integration-receipts"
  || pathname === "/api/hr/integration-receipts"
  || pathname === "/api/admin/hr/integration-errors"
  || pathname === "/api/crm/hr/integration-errors"
  || pathname === "/api/hr/integration-errors"
  || pathname === "/api/admin/hr/training-catalog"
  || pathname === "/api/crm/hr/training-catalog"
  || pathname === "/api/hr/training-catalog"
  || pathname === "/api/admin/hr/training-requirements"
  || pathname === "/api/crm/hr/training-requirements"
  || pathname === "/api/hr/training-requirements"
  || pathname === "/api/admin/hr/training-sessions"
  || pathname === "/api/crm/hr/training-sessions"
  || pathname === "/api/hr/training-sessions"
  || pathname === "/api/admin/hr/training-enrollments"
  || pathname === "/api/crm/hr/training-enrollments"
  || pathname === "/api/hr/training-enrollments"
  || pathname === "/api/admin/hr/competency-catalog"
  || pathname === "/api/crm/hr/competency-catalog"
  || pathname === "/api/hr/competency-catalog"
  || pathname === "/api/admin/hr/competency-requirements"
  || pathname === "/api/crm/hr/competency-requirements"
  || pathname === "/api/hr/competency-requirements"
  || pathname === "/api/admin/hr/employee-competencies"
  || pathname === "/api/crm/hr/employee-competencies"
  || pathname === "/api/hr/employee-competencies"
  || pathname === "/api/admin/hr/competency-evaluations"
  || pathname === "/api/crm/hr/competency-evaluations"
  || pathname === "/api/hr/competency-evaluations"
  || pathname === "/api/admin/hr/uniform-catalog"
  || pathname === "/api/crm/hr/uniform-catalog"
  || pathname === "/api/hr/uniform-catalog"
  || pathname === "/api/admin/hr/uniform-deliveries"
  || pathname === "/api/crm/hr/uniform-deliveries"
  || pathname === "/api/hr/uniform-deliveries"
  || pathname === "/api/admin/hr/uniform-returns"
  || pathname === "/api/crm/hr/uniform-returns"
  || pathname === "/api/hr/uniform-returns"
  || pathname === "/api/admin/hr/uniform-requests"
  || pathname === "/api/crm/hr/uniform-requests"
  || pathname === "/api/hr/uniform-requests"
  || pathname === "/api/admin/hr/dp-closures"
  || pathname === "/api/crm/hr/dp-closures"
  || pathname === "/api/hr/dp-closures"
  || pathname === "/api/admin/hr/dp-variables"
  || pathname === "/api/crm/hr/dp-variables"
  || pathname === "/api/hr/dp-variables"
  || pathname === "/api/admin/hr/dp-documents"
  || pathname === "/api/crm/hr/dp-documents"
  || pathname === "/api/hr/dp-documents"
  || pathname === "/api/admin/hr/dp-exports"
  || pathname === "/api/crm/hr/dp-exports"
  || pathname === "/api/hr/dp-exports"
  || pathname === "/api/admin/hr/payroll-sources"
  || pathname === "/api/crm/hr/payroll-sources"
  || pathname === "/api/hr/payroll-sources"
  || pathname === "/api/admin/hr/payroll-imports"
  || pathname === "/api/crm/hr/payroll-imports"
  || pathname === "/api/hr/payroll-imports"
  || pathname === "/api/admin/hr/payroll-documents"
  || pathname === "/api/crm/hr/payroll-documents"
  || pathname === "/api/hr/payroll-documents"
  || pathname === "/api/admin/hr/evaluation-criteria"
  || pathname === "/api/crm/hr/evaluation-criteria"
  || pathname === "/api/hr/evaluation-criteria"
  || pathname === "/api/admin/hr/evaluations"
  || pathname === "/api/crm/hr/evaluations"
  || pathname === "/api/hr/evaluations"
  || pathname === "/api/admin/hr/development-plans"
  || pathname === "/api/crm/hr/development-plans"
  || pathname === "/api/hr/development-plans"
  || pathname === "/api/admin/hr/development-actions"
  || pathname === "/api/crm/hr/development-actions"
  || pathname === "/api/hr/development-actions"
  || pathname === "/api/admin/hr/support-tickets"
  || pathname === "/api/crm/hr/support-tickets"
  || pathname === "/api/hr/support-tickets"
  || pathname === "/api/admin/hr/support-messages"
  || pathname === "/api/crm/hr/support-messages"
  || pathname === "/api/hr/support-messages"
  || pathname === "/api/admin/hr/support-attachments"
  || pathname === "/api/crm/hr/support-attachments"
  || pathname === "/api/hr/support-attachments"
  || pathname === "/api/admin/hr/indicator-definitions"
  || pathname === "/api/crm/hr/indicator-definitions"
  || pathname === "/api/hr/indicator-definitions"
  || pathname === "/api/admin/hr/indicator-snapshots"
  || pathname === "/api/crm/hr/indicator-snapshots"
  || pathname === "/api/hr/indicator-snapshots"
  || pathname === "/api/admin/hr/shift-assignments"
  || pathname === "/api/crm/hr/shift-assignments"
  || pathname === "/api/hr/shift-assignments"
  || pathname === "/api/admin/hr/schedule-versions"
  || pathname === "/api/crm/hr/schedule-versions"
  || pathname === "/api/hr/schedule-versions"
  || pathname === "/api/admin/hr/schedule-entries"
  || pathname === "/api/crm/hr/schedule-entries"
  || pathname === "/api/hr/schedule-entries"
  || pathname === "/api/admin/hr/journey-proofs"
  || pathname === "/api/crm/hr/journey-proofs"
  || pathname === "/api/hr/journey-proofs"
  || pathname === "/api/admin/hr/journey-corrections"
  || pathname === "/api/crm/hr/journey-corrections"
  || pathname === "/api/hr/journey-corrections"
  || pathname === "/api/admin/hr/absence-notices"
  || pathname === "/api/crm/hr/absence-notices"
  || pathname === "/api/hr/absence-notices"
  || pathname === "/api/admin/hr/absence-followups"
  || pathname === "/api/crm/hr/absence-followups"
  || pathname === "/api/hr/absence-followups"
  || pathname === "/api/admin/hr/shift-swaps"
  || pathname === "/api/crm/hr/shift-swaps"
  || pathname === "/api/hr/shift-swaps"
  || pathname === "/api/admin/hr/handover-records"
  || pathname === "/api/crm/hr/handover-records"
  || pathname === "/api/hr/handover-records"
  || pathname === "/api/admin/hr/occurrences"
  || pathname === "/api/crm/hr/occurrences"
  || pathname === "/api/hr/occurrences"
  || pathname === "/api/admin/hr/occurrence-attachments"
  || pathname === "/api/crm/hr/occurrence-attachments"
  || pathname === "/api/hr/occurrence-attachments"
  || pathname === "/api/admin/hr/occurrence-actions"
  || pathname === "/api/crm/hr/occurrence-actions"
  || pathname === "/api/hr/occurrence-actions"
  || pathname === "/api/admin/hr/post-procedures"
  || pathname === "/api/crm/hr/post-procedures"
  || pathname === "/api/hr/post-procedures"
  || pathname === "/api/admin/hr/procedure-acks"
  || pathname === "/api/crm/hr/procedure-acks"
  || pathname === "/api/hr/procedure-acks"
  || pathname === "/api/admin/hr/support-contacts-ops"
  || pathname === "/api/crm/hr/support-contacts-ops"
  || pathname === "/api/hr/support-contacts-ops"
  || pathname === "/api/admin/hr/document-submissions"
  || pathname === "/api/crm/hr/document-submissions"
  || pathname === "/api/hr/document-submissions"
  || pathname === "/api/admin/hr/own-doc-access-logs"
  || pathname === "/api/crm/hr/own-doc-access-logs"
  || pathname === "/api/hr/own-doc-access-logs"
  || pathname === "/api/admin/hr/doc-availability"
  || pathname === "/api/crm/hr/doc-availability"
  || pathname === "/api/hr/doc-availability"
  || pathname === "/api/admin/hr/self-requests"
  || pathname === "/api/crm/hr/self-requests"
  || pathname === "/api/hr/self-requests"
  || pathname === "/api/admin/hr/self-request-followups"
  || pathname === "/api/crm/hr/self-request-followups"
  || pathname === "/api/hr/self-request-followups"
  || pathname === "/api/admin/hr/uniform-self-requests"
  || pathname === "/api/crm/hr/uniform-self-requests"
  || pathname === "/api/hr/uniform-self-requests"
  || pathname === "/api/admin/hr/uniform-receipts"
  || pathname === "/api/crm/hr/uniform-receipts"
  || pathname === "/api/hr/uniform-receipts"
  || pathname === "/api/admin/hr/course-enrollments"
  || pathname === "/api/crm/hr/course-enrollments"
  || pathname === "/api/hr/course-enrollments"
  || pathname === "/api/admin/hr/course-proofs"
  || pathname === "/api/crm/hr/course-proofs"
  || pathname === "/api/hr/course-proofs"
  || pathname === "/api/admin/hr/course-alerts"
  || pathname === "/api/crm/hr/course-alerts"
  || pathname === "/api/hr/course-alerts"
  || pathname === "/api/admin/hr/course-expiry-alerts"
  || pathname === "/api/crm/hr/course-expiry-alerts"
  || pathname === "/api/hr/course-expiry-alerts"
  || pathname === "/api/admin/hr/communications"
  || pathname === "/api/crm/hr/communications"
  || pathname === "/api/hr/communications"
  || pathname === "/api/admin/hr/communication-reads"
  || pathname === "/api/crm/hr/communication-reads"
  || pathname === "/api/hr/communication-reads"
  || pathname === "/api/admin/hr/notifications-center"
  || pathname === "/api/crm/hr/notifications-center"
  || pathname === "/api/hr/notifications-center"
  || pathname === "/api/employee/notifications"
  || pathname === "/api/hr/my-notifications"
  || pathname === "/api/admin/hr/hr-tickets"
  || pathname === "/api/crm/hr/hr-tickets"
  || pathname === "/api/hr/hr-tickets"
  || pathname === "/api/admin/hr/employee-hr-tickets"
  || pathname === "/api/admin/hr/hr-messages"
  || pathname === "/api/crm/hr/hr-messages"
  || pathname === "/api/hr/hr-messages"
  || pathname === "/api/admin/hr/employee-hr-messages"
  || pathname === "/api/admin/hr/hr-attachments"
  || pathname === "/api/crm/hr/hr-attachments"
  || pathname === "/api/hr/hr-attachments"
  || pathname === "/api/admin/hr/employee-hr-attachments"
  || pathname === "/api/admin/hr/confidential-policies"
  || pathname === "/api/crm/hr/confidential-policies"
  || pathname === "/api/hr/confidential-policies"
  || pathname === "/api/admin/hr/confidential-reports"
  || pathname === "/api/crm/hr/confidential-reports"
  || pathname === "/api/hr/confidential-reports"
  || pathname === "/api/admin/hr/confidential-messages"
  || pathname === "/api/crm/hr/confidential-messages"
  || pathname === "/api/hr/confidential-messages"
  || pathname === "/api/admin/hr/confidential-attachments"
  || pathname === "/api/crm/hr/confidential-attachments"
  || pathname === "/api/hr/confidential-attachments"
  || pathname === "/api/pwa/manifest.json"
  || pathname === "/api/hr/pwa-manifest"
  || pathname === "/manifest.json"
  || pathname === "/api/pwa/sw.js"
  || pathname === "/api/hr/pwa-sw"
  || pathname === "/sw.js"
  || pathname === "/api/pwa/offline"
  || pathname === "/offline.html"
  || pathname === "/api/admin/hr/pwa-configs"
  || pathname === "/api/crm/hr/pwa-configs"
  || pathname === "/api/hr/pwa-configs"
  || pathname === "/api/admin/hr/offline-queue"
  || pathname === "/api/crm/hr/offline-queue"
  || pathname === "/api/hr/offline-queue"
  || pathname === "/api/admin/hr/offline-conflicts"
  || pathname === "/api/crm/hr/offline-conflicts"
  || pathname === "/api/hr/offline-conflicts"
  || pathname === "/api/admin/hr/faq-internal"
  || pathname === "/api/crm/hr/faq-internal"
  || pathname === "/api/hr/faq-internal"
  || pathname === "/api/employee/faq"
  || pathname === "/api/admin/hr/faq-access-logs"
  || pathname === "/api/crm/hr/faq-access-logs"
  || pathname === "/api/hr/faq-access-logs"
  || pathname === "/api/admin/hr/accessibility-preferences"
  || pathname === "/api/crm/hr/accessibility-preferences"
  || pathname === "/api/hr/accessibility-preferences"
  || pathname === "/api/employee/accessibility"
  || pathname === "/api/admin/hr/ops-job-roles"
  || pathname === "/api/crm/hr/ops-job-roles"
  || pathname === "/api/hr/ops-job-roles"
  || pathname === "/api/ops/job-roles"
  || pathname === "/api/admin/hr/ops-posts"
  || pathname === "/api/crm/hr/ops-posts"
  || pathname === "/api/hr/ops-posts"
  || pathname === "/api/ops/posts"
  || pathname === "/api/admin/hr/ops-shift-templates"
  || pathname === "/api/crm/hr/ops-shift-templates"
  || pathname === "/api/hr/ops-shift-templates"
  || pathname === "/api/ops/shift-templates"
  || pathname === "/api/admin/hr/ops-post-shift-needs"
  || pathname === "/api/crm/hr/ops-post-shift-needs"
  || pathname === "/api/hr/ops-post-shift-needs"
  || pathname === "/api/ops/post-shift-needs"
  || pathname === "/api/admin/hr/ops-allocations"
  || pathname === "/api/crm/hr/ops-allocations"
  || pathname === "/api/hr/ops-allocations"
  || pathname === "/api/ops/allocations"
  || pathname === "/api/admin/hr/ops-dimensioning"
  || pathname === "/api/crm/hr/ops-dimensioning"
  || pathname === "/api/hr/ops-dimensioning"
  || pathname === "/api/ops/dimensioning"
  || pathname === "/api/admin/hr/ops-coverage-gaps"
  || pathname === "/api/crm/hr/ops-coverage-gaps"
  || pathname === "/api/hr/ops-coverage-gaps"
  || pathname === "/api/ops/coverage-gaps"
  || pathname === "/api/admin/hr/ops-schedule-versions"
  || pathname === "/api/crm/hr/ops-schedule-versions"
  || pathname === "/api/hr/ops-schedule-versions"
  || pathname === "/api/ops/schedule-versions"
  || pathname === "/api/admin/hr/ops-schedule-entries"
  || pathname === "/api/crm/hr/ops-schedule-entries"
  || pathname === "/api/hr/ops-schedule-entries"
  || pathname === "/api/ops/schedule-entries"
  || pathname === "/api/admin/hr/ops-schedule-acks"
  || pathname === "/api/crm/hr/ops-schedule-acks"
  || pathname === "/api/hr/ops-schedule-acks"
  || pathname === "/api/ops/schedule-acks"
  || pathname === "/api/admin/hr/ops-schedule-history"
  || pathname === "/api/crm/hr/ops-schedule-history"
  || pathname === "/api/hr/ops-schedule-history"
  || pathname === "/api/ops/schedule-history"
  || pathname === "/api/admin/hr/ops-work-rules"
  || pathname === "/api/crm/hr/ops-work-rules"
  || pathname === "/api/hr/ops-work-rules"
  || pathname === "/api/ops/work-rules"
  || pathname === "/api/admin/hr/ops-qualifications"
  || pathname === "/api/crm/hr/ops-qualifications"
  || pathname === "/api/hr/ops-qualifications"
  || pathname === "/api/ops/qualifications"
  || pathname === "/api/admin/hr/ops-validations"
  || pathname === "/api/crm/hr/ops-validations"
  || pathname === "/api/hr/ops-validations"
  || pathname === "/api/ops/validations"
  || pathname === "/api/admin/hr/ops-coverage-requests"
  || pathname === "/api/crm/hr/ops-coverage-requests"
  || pathname === "/api/hr/ops-coverage-requests"
  || pathname === "/api/ops/coverage-requests"
  || pathname === "/api/admin/hr/ops-substitution-candidates"
  || pathname === "/api/crm/hr/ops-substitution-candidates"
  || pathname === "/api/hr/ops-substitution-candidates"
  || pathname === "/api/ops/substitution-candidates"
  || pathname === "/api/admin/hr/ops-coverage-communications"
  || pathname === "/api/crm/hr/ops-coverage-communications"
  || pathname === "/api/hr/ops-coverage-communications"
  || pathname === "/api/ops/coverage-communications"
  || pathname === "/api/admin/hr/ops-handovers"
  || pathname === "/api/crm/hr/ops-handovers"
  || pathname === "/api/hr/ops-handovers"
  || pathname === "/api/ops/handovers"
  || pathname === "/api/admin/hr/ops-handover-escalations"
  || pathname === "/api/crm/hr/ops-handover-escalations"
  || pathname === "/api/hr/ops-handover-escalations"
  || pathname === "/api/ops/handover-escalations"
  || pathname === "/api/admin/hr/ops-occurrence-book"
  || pathname === "/api/crm/hr/ops-occurrence-book"
  || pathname === "/api/hr/ops-occurrence-book"
  || pathname === "/api/ops/occurrence-book"
  || pathname === "/api/admin/hr/ops-occurrence-evidences"
  || pathname === "/api/crm/hr/ops-occurrence-evidences"
  || pathname === "/api/hr/ops-occurrence-evidences"
  || pathname === "/api/ops/occurrence-evidences"
  || pathname === "/api/admin/hr/ops-occurrence-actions"
  || pathname === "/api/crm/hr/ops-occurrence-actions"
  || pathname === "/api/hr/ops-occurrence-actions"
  || pathname === "/api/ops/occurrence-actions"
  || pathname === "/api/admin/hr/ops-occurrence-history"
  || pathname === "/api/crm/hr/ops-occurrence-history"
  || pathname === "/api/hr/ops-occurrence-history"
  || pathname === "/api/ops/occurrence-history"
  || pathname === "/api/admin/hr/ops-checklist-templates"
  || pathname === "/api/crm/hr/ops-checklist-templates"
  || pathname === "/api/hr/ops-checklist-templates"
  || pathname === "/api/ops/checklist-templates"
  || pathname === "/api/admin/hr/ops-checklist-instances"
  || pathname === "/api/crm/hr/ops-checklist-instances"
  || pathname === "/api/hr/ops-checklist-instances"
  || pathname === "/api/ops/checklist-instances"
  || pathname === "/api/admin/hr/ops-checklist-items"
  || pathname === "/api/crm/hr/ops-checklist-items"
  || pathname === "/api/hr/ops-checklist-items"
  || pathname === "/api/ops/checklist-items"
  || pathname === "/api/admin/hr/ops-supervision-visits"
  || pathname === "/api/crm/hr/ops-supervision-visits"
  || pathname === "/api/hr/ops-supervision-visits"
  || pathname === "/api/ops/supervision-visits"
  || pathname === "/api/admin/hr/ops-supervision-inspections"
  || pathname === "/api/crm/hr/ops-supervision-inspections"
  || pathname === "/api/hr/ops-supervision-inspections"
  || pathname === "/api/ops/supervision-inspections"
  || pathname === "/api/admin/hr/ops-supervision-action-plans"
  || pathname === "/api/crm/hr/ops-supervision-action-plans"
  || pathname === "/api/hr/ops-supervision-action-plans"
  || pathname === "/api/ops/supervision-action-plans"
  || pathname === "/api/admin/hr/ops-patrols"
  || pathname === "/api/crm/hr/ops-patrols"
  || pathname === "/api/hr/ops-patrols"
  || pathname === "/api/ops/patrols"
  || pathname === "/api/admin/hr/ops-patrol-points"
  || pathname === "/api/crm/hr/ops-patrol-points"
  || pathname === "/api/hr/ops-patrol-points"
  || pathname === "/api/ops/patrol-points"
  || pathname === "/api/ops/patrol-readings"
  || pathname === "/api/admin/hr/ops-patrol-replay-logs"
  || pathname === "/api/crm/hr/ops-patrol-replay-logs"
  || pathname === "/api/hr/ops-patrol-replay-logs"
  || pathname === "/api/ops/patrol-replay-logs"
  || pathname === "/api/admin/hr/ops-keys"
  || pathname === "/api/crm/hr/ops-keys"
  || pathname === "/api/hr/ops-keys"
  || pathname === "/api/ops/keys"
  || pathname === "/api/admin/hr/ops-key-movements"
  || pathname === "/api/crm/hr/ops-key-movements"
  || pathname === "/api/hr/ops-key-movements"
  || pathname === "/api/ops/key-movements"
  || pathname === "/api/admin/hr/ops-client-reports"
  || pathname === "/api/crm/hr/ops-client-reports"
  || pathname === "/api/hr/ops-client-reports"
  || pathname === "/api/ops/client-reports"
  || pathname === "/api/admin/hr/ops-client-report-attachments"
  || pathname === "/api/crm/hr/ops-client-report-attachments"
  || pathname === "/api/hr/ops-client-report-attachments"
  || pathname === "/api/ops/client-report-attachments"
  || pathname === "/api/admin/hr/ops-client-report-history"
  || pathname === "/api/crm/hr/ops-client-report-history"
  || pathname === "/api/hr/ops-client-report-history"
  || pathname === "/api/ops/client-report-history"
  || pathname === "/api/admin/hr/ops-metrics-definitions"
  || pathname === "/api/crm/hr/ops-metrics-definitions"
  || pathname === "/api/hr/ops-metrics-definitions"
  || pathname === "/api/ops/metrics-definitions"
  || pathname === "/api/admin/hr/ops-metrics-snapshots"
  || pathname === "/api/crm/hr/ops-metrics-snapshots"
  || pathname === "/api/hr/ops-metrics-snapshots"
  || pathname === "/api/ops/metrics-snapshots"
  || pathname === "/api/admin/hr/ops-metrics-reincidence"
  || pathname === "/api/crm/hr/ops-metrics-reincidence"
  || pathname === "/api/hr/ops-metrics-reincidence"
  || pathname === "/api/ops/metrics-reincidence"
  || pathname === "/api/admin/hr/ops-assisted-proposals"
  || pathname === "/api/crm/hr/ops-assisted-proposals"
  || pathname === "/api/hr/ops-assisted-proposals"
  || pathname === "/api/ops/assisted-proposals"
  || pathname === "/api/ops/assisted-schedules"
  || pathname === "/api/admin/hr/ops-assisted-entries"
  || pathname === "/api/crm/hr/ops-assisted-entries"
  || pathname === "/api/hr/ops-assisted-entries"
  || pathname === "/api/ops/assisted-entries"
  || pathname === "/api/ops/assisted-schedule-entries"
  || pathname === "/api/admin/hr/ops-assisted-conflicts"
  || pathname === "/api/crm/hr/ops-assisted-conflicts"
  || pathname === "/api/hr/ops-assisted-conflicts"
  || pathname === "/api/ops/assisted-conflicts"
  || pathname === "/api/admin/hr/ops-cleaning-environments"
  || pathname === "/api/crm/hr/ops-cleaning-environments"
  || pathname === "/api/hr/ops-cleaning-environments"
  || pathname === "/api/ops/cleaning-environments"
  || pathname === "/api/admin/hr/ops-cleaning-routines"
  || pathname === "/api/crm/hr/ops-cleaning-routines"
  || pathname === "/api/hr/ops-cleaning-routines"
  || pathname === "/api/ops/cleaning-routines"
  || pathname === "/api/admin/hr/ops-cleaning-executions"
  || pathname === "/api/crm/hr/ops-cleaning-executions"
  || pathname === "/api/hr/ops-cleaning-executions"
  || pathname === "/api/ops/cleaning-executions"
  || pathname === "/api/admin/hr/ops-cleaning-nonconformities"
  || pathname === "/api/crm/hr/ops-cleaning-nonconformities"
  || pathname === "/api/hr/ops-cleaning-nonconformities"
  || pathname === "/api/ops/cleaning-nonconformities"
  || pathname === "/api/admin/hr/ops-monitoring-connectors"
  || pathname === "/api/crm/hr/ops-monitoring-connectors"
  || pathname === "/api/hr/ops-monitoring-connectors"
  || pathname === "/api/ops/monitoring-connectors"
  || pathname === "/api/admin/hr/ops-monitoring-events"
  || pathname === "/api/crm/hr/ops-monitoring-events"
  || pathname === "/api/hr/ops-monitoring-events"
  || pathname === "/api/ops/monitoring-events"
  || pathname === "/api/admin/hr/ops-monitoring-event-history"
  || pathname === "/api/crm/hr/ops-monitoring-event-history"
  || pathname === "/api/hr/ops-monitoring-event-history"
  || pathname === "/api/ops/monitoring-event-history"
  || pathname === "/api/admin/hr/ops-monitoring-escalations"
  || pathname === "/api/crm/hr/ops-monitoring-escalations"
  || pathname === "/api/hr/ops-monitoring-escalations"
  || pathname === "/api/ops/monitoring-escalations"
  || pathname === "/api/admin/hr/cli-entry-points"
  || pathname === "/api/crm/hr/cli-entry-points"
  || pathname === "/api/hr/cli-entry-points"
  || pathname === "/api/cli/entry-points"
  || pathname === "/api/admin/hr/cli-old-routes"
  || pathname === "/api/crm/hr/cli-old-routes"
  || pathname === "/api/hr/cli-old-routes"
  || pathname === "/api/cli/old-routes"
  || pathname === "/api/admin/hr/cli-client-contacts"
  || pathname === "/api/crm/hr/cli-client-contacts"
  || pathname === "/api/hr/cli-client-contacts"
  || pathname === "/api/cli/client-contacts"
  || pathname === "/api/admin/hr/cli-contact-scopes"
  || pathname === "/api/crm/hr/cli-contact-scopes"
  || pathname === "/api/hr/cli-contact-scopes"
  || pathname === "/api/cli/contact-scopes"
  || pathname === "/api/admin/hr/cli-contact-delegate"
  || pathname === "/api/crm/hr/cli-contact-delegate"
  || pathname === "/api/hr/cli-contact-delegate"
  || pathname === "/api/cli/contact-delegate"
  || pathname === "/api/admin/hr/cli-contract-items"
  || pathname === "/api/crm/hr/cli-contract-items"
  || pathname === "/api/hr/cli-contract-items"
  || pathname === "/api/cli/contract-items"
  || pathname === "/api/admin/hr/cli-contract-scopes"
  || pathname === "/api/crm/hr/cli-contract-scopes"
  || pathname === "/api/hr/cli-contract-scopes"
  || pathname === "/api/cli/contract-scopes"
  || pathname === "/api/admin/hr/cli-contract-vigencia"
  || pathname === "/api/crm/hr/cli-contract-vigencia"
  || pathname === "/api/hr/cli-contract-vigencia"
  || pathname === "/api/cli/contract-vigencia"
  || pathname === "/api/admin/hr/cli-document-categories"
  || pathname === "/api/crm/hr/cli-document-categories"
  || pathname === "/api/hr/cli-document-categories"
  || pathname === "/api/cli/document-categories"
  || pathname === "/api/admin/hr/cli-client-documents-v2"
  || pathname === "/api/crm/hr/cli-client-documents-v2"
  || pathname === "/api/hr/cli-client-documents-v2"
  || pathname === "/api/cli/client-documents-v2"
  || pathname === "/api/client/documents-v2"
  || pathname === "/api/admin/hr/cli-document-versions"
  || pathname === "/api/crm/hr/cli-document-versions"
  || pathname === "/api/hr/cli-document-versions"
  || pathname === "/api/cli/document-versions"
  || pathname === "/api/admin/hr/cli-document-download"
  || pathname === "/api/crm/hr/cli-document-download"
  || pathname === "/api/hr/cli-document-download"
  || pathname === "/api/cli/document-download"
  || pathname === "/api/client/document-download"
  || pathname === "/api/admin/hr/cli-document-access-logs"
  || pathname === "/api/crm/hr/cli-document-access-logs"
  || pathname === "/api/hr/cli-document-access-logs"
  || pathname === "/api/cli/document-access-logs"
  || pathname === "/api/admin/hr/cli-tickets-v2"
  || pathname === "/api/crm/hr/cli-tickets-v2"
  || pathname === "/api/hr/cli-tickets-v2"
  || pathname === "/api/cli/tickets-v2"
  || pathname === "/api/client/tickets-v2"
  || pathname === "/api/admin/hr/cli-ticket-messages"
  || pathname === "/api/crm/hr/cli-ticket-messages"
  || pathname === "/api/hr/cli-ticket-messages"
  || pathname === "/api/cli/ticket-messages"
  || pathname === "/api/admin/hr/cli-ticket-attachments"
  || pathname === "/api/crm/hr/cli-ticket-attachments"
  || pathname === "/api/hr/cli-ticket-attachments"
  || pathname === "/api/cli/ticket-attachments"
  || pathname === "/api/admin/hr/cli-ticket-history"
  || pathname === "/api/crm/hr/cli-ticket-history"
  || pathname === "/api/hr/cli-ticket-history"
  || pathname === "/api/cli/ticket-history"
  || pathname === "/api/admin/hr/cli-ticket-sla-pauses"
  || pathname === "/api/crm/hr/cli-ticket-sla-pauses"
  || pathname === "/api/hr/cli-ticket-sla-pauses"
  || pathname === "/api/cli/ticket-sla-pauses"
  || pathname === "/api/admin/hr/cli-visits"
  || pathname === "/api/crm/hr/cli-visits"
  || pathname === "/api/hr/cli-visits"
  || pathname === "/api/cli/visits"
  || pathname === "/api/client/visits"
  || pathname === "/api/admin/hr/cli-visit-history"
  || pathname === "/api/crm/hr/cli-visit-history"
  || pathname === "/api/hr/cli-visit-history"
  || pathname === "/api/cli/visit-history"
  || pathname === "/api/admin/hr/cli-reports-v2"
  || pathname === "/api/crm/hr/cli-reports-v2"
  || pathname === "/api/hr/cli-reports-v2"
  || pathname === "/api/cli/reports-v2"
  || pathname === "/api/client/reports-v2"
  || pathname === "/api/admin/hr/cli-report-history-v2"
  || pathname === "/api/crm/hr/cli-report-history-v2"
  || pathname === "/api/hr/cli-report-history-v2"
  || pathname === "/api/cli/report-history-v2"
  || pathname === "/api/admin/hr/cli-charges-v2"
  || pathname === "/api/crm/hr/cli-charges-v2"
  || pathname === "/api/hr/cli-charges-v2"
  || pathname === "/api/cli/charges-v2"
  || pathname === "/api/client/charges-v2"
  || pathname === "/api/admin/hr/cli-service-requests"
  || pathname === "/api/crm/hr/cli-service-requests"
  || pathname === "/api/hr/cli-service-requests"
  || pathname === "/api/cli/service-requests"
  || pathname === "/api/client/service-requests"
  || pathname === "/api/admin/hr/cli-satisfaction-surveys"
  || pathname === "/api/crm/hr/cli-satisfaction-surveys"
  || pathname === "/api/hr/cli-satisfaction-surveys"
  || pathname === "/api/cli/satisfaction-surveys"
  || pathname === "/api/client/satisfaction-surveys"
  || pathname === "/api/admin/hr/cli-satisfaction-action-plans"
  || pathname === "/api/crm/hr/cli-satisfaction-action-plans"
  || pathname === "/api/hr/cli-satisfaction-action-plans"
  || pathname === "/api/cli/satisfaction-action-plans"
  || pathname === "/api/admin/hr/cli-renewal-communications"
  || pathname === "/api/crm/hr/cli-renewal-communications"
  || pathname === "/api/hr/cli-renewal-communications"
  || pathname === "/api/cli/renewal-communications"
  || pathname === "/api/admin/hr/cli-portal-mode-configs"
  || pathname === "/api/crm/hr/cli-portal-mode-configs"
  || pathname === "/api/hr/cli-portal-mode-configs"
  || pathname === "/api/cli/portal-mode-configs"
  || pathname === "/api/admin/hr/cli-portal-access-requests"
  || pathname === "/api/crm/hr/cli-portal-access-requests"
  || pathname === "/api/hr/cli-portal-access-requests"
  || pathname === "/api/cli/portal-access-requests"
  || pathname === "/api/client/portal-access-requests"
  || pathname === "/api/admin/hr/cli-security-events"
  || pathname === "/api/crm/hr/cli-security-events"
  || pathname === "/api/hr/cli-security-events"
  || pathname === "/api/cli/security-events"
  || pathname === "/api/admin/hr/cli-email-change-requests"
  || pathname === "/api/crm/hr/cli-email-change-requests"
  || pathname === "/api/hr/cli-email-change-requests"
  || pathname === "/api/cli/email-change-requests"
  || pathname === "/api/client/email-change-requests"
  || pathname === "/api/admin/hr/cli-sessions"
  || pathname === "/api/crm/hr/cli-sessions"
  || pathname === "/api/hr/cli-sessions"
  || pathname === "/api/cli/sessions"
  || pathname === "/api/admin/hr/fin-suppliers"
  || pathname === "/api/crm/hr/fin-suppliers"
  || pathname === "/api/hr/fin-suppliers"
  || pathname === "/api/fin/suppliers"
  || pathname === "/api/admin/hr/fin-cost-centers"
  || pathname === "/api/crm/hr/fin-cost-centers"
  || pathname === "/api/hr/fin-cost-centers"
  || pathname === "/api/fin/cost-centers"
  || pathname === "/api/admin/hr/fin-recurrence-rules"
  || pathname === "/api/crm/hr/fin-recurrence-rules"
  || pathname === "/api/hr/fin-recurrence-rules"
  || pathname === "/api/fin/recurrence-rules"
  || pathname === "/api/admin/hr/fin-receivables"
  || pathname === "/api/crm/hr/fin-receivables"
  || pathname === "/api/hr/fin-receivables"
  || pathname === "/api/fin/receivables"
  || pathname === "/api/admin/hr/fin-payables"
  || pathname === "/api/crm/hr/fin-payables"
  || pathname === "/api/hr/fin-payables"
  || pathname === "/api/fin/payables"
  || pathname === "/api/admin/hr/fin-payments"
  || pathname === "/api/crm/hr/fin-payments"
  || pathname === "/api/hr/fin-payments"
  || pathname === "/api/fin/payments"
  || pathname === "/api/admin/hr/fin-payment-history"
  || pathname === "/api/crm/hr/fin-payment-history"
  || pathname === "/api/hr/fin-payment-history"
  || pathname === "/api/fin/payment-history"
  || pathname === "/api/admin/hr/fin-attachments"
  || pathname === "/api/crm/hr/fin-attachments"
  || pathname === "/api/hr/fin-attachments"
  || pathname === "/api/fin/attachments"
  || pathname === "/api/admin/hr/fin-generate-recurring"
  || pathname === "/api/crm/hr/fin-generate-recurring"
  || pathname === "/api/hr/fin-generate-recurring"
  || pathname === "/api/fin/generate-recurring"
  || pathname === "/api/admin/hr/fin-bank-statements"
  || pathname === "/api/crm/hr/fin-bank-statements"
  || pathname === "/api/hr/fin-bank-statements"
  || pathname === "/api/fin/bank-statements"
  || pathname === "/api/admin/hr/fin-bank-transactions"
  || pathname === "/api/crm/hr/fin-bank-transactions"
  || pathname === "/api/hr/fin-bank-transactions"
  || pathname === "/api/fin/bank-transactions"
  || pathname === "/api/admin/hr/fin-conciliations"
  || pathname === "/api/crm/hr/fin-conciliations"
  || pathname === "/api/hr/fin-conciliations"
  || pathname === "/api/fin/conciliations"
  || pathname === "/api/admin/hr/fin-collection-policies"
  || pathname === "/api/crm/hr/fin-collection-policies"
  || pathname === "/api/hr/fin-collection-policies"
  || pathname === "/api/fin/collection-policies"
  || pathname === "/api/admin/hr/fin-collection-reminders"
  || pathname === "/api/crm/hr/fin-collection-reminders"
  || pathname === "/api/hr/fin-collection-reminders"
  || pathname === "/api/fin/collection-reminders"
  || pathname === "/api/admin/hr/fin-collection-history"
  || pathname === "/api/crm/hr/fin-collection-history"
  || pathname === "/api/hr/fin-collection-history"
  || pathname === "/api/fin/collection-history"
  || pathname === "/api/admin/hr/fin-cashflow-snapshots"
  || pathname === "/api/crm/hr/fin-cashflow-snapshots"
  || pathname === "/api/hr/fin-cashflow-snapshots"
  || pathname === "/api/fin/cashflow-snapshots"
  || pathname === "/api/admin/hr/fin-aging-receivables"
  || pathname === "/api/crm/hr/fin-aging-receivables"
  || pathname === "/api/hr/fin-aging-receivables"
  || pathname === "/api/fin/aging-receivables"
  || pathname === "/api/admin/hr/fin-cost-imports"
  || pathname === "/api/crm/hr/fin-cost-imports"
  || pathname === "/api/hr/fin-cost-imports"
  || pathname === "/api/fin/cost-imports"
  || pathname === "/api/admin/hr/fin-costs"
  || pathname === "/api/crm/hr/fin-costs"
  || pathname === "/api/hr/fin-costs"
  || pathname === "/api/fin/costs"
  || pathname === "/api/admin/hr/fin-management-results"
  || pathname === "/api/crm/hr/fin-management-results"
  || pathname === "/api/hr/fin-management-results"
  || pathname === "/api/fin/management-results"
  || pathname === "/api/admin/hr/fin-result-history"
  || pathname === "/api/crm/hr/fin-result-history"
  || pathname === "/api/hr/fin-result-history"
  || pathname === "/api/fin/result-history"
  || pathname === "/api/admin/hr/fin-expenses"
  || pathname === "/api/crm/hr/fin-expenses"
  || pathname === "/api/hr/fin-expenses"
  || pathname === "/api/fin/expenses"
  || pathname === "/api/admin/hr/fin-expense-history"
  || pathname === "/api/crm/hr/fin-expense-history"
  || pathname === "/api/hr/fin-expense-history"
  || pathname === "/api/fin/expense-history"
  || pathname === "/api/fin/expense-authorities"
  || pathname === "/api/admin/hr/fin-fiscal-activity-rules"
  || pathname === "/api/crm/hr/fin-fiscal-activity-rules"
  || pathname === "/api/hr/fin-fiscal-activity-rules"
  || pathname === "/api/fin/fiscal-activity-rules"
  || pathname === "/api/admin/hr/fin-fiscal-history"
  || pathname === "/api/crm/hr/fin-fiscal-history"
  || pathname === "/api/hr/fin-fiscal-history"
  || pathname === "/api/fin/fiscal-history"
  || pathname === "/api/admin/hr/fin-fiscal-providers"
  || pathname === "/api/crm/hr/fin-fiscal-providers"
  || pathname === "/api/hr/fin-fiscal-providers"
  || pathname === "/api/fin/fiscal-providers"
  || pathname === "/api/admin/hr/fin-fiscal-obligations"
  || pathname === "/api/crm/hr/fin-fiscal-obligations"
  || pathname === "/api/hr/fin-fiscal-obligations"
  || pathname === "/api/fin/fiscal-obligations"
  || pathname === "/api/admin/hr/fin-fiscal-documents"
  || pathname === "/api/crm/hr/fin-fiscal-documents"
  || pathname === "/api/hr/fin-fiscal-documents"
  || pathname === "/api/fin/fiscal-documents"
  || pathname === "/api/admin/hr/fin-payment-gateways"
  || pathname === "/api/crm/hr/fin-payment-gateways"
  || pathname === "/api/hr/fin-payment-gateways"
  || pathname === "/api/fin/payment-gateways"
  || pathname === "/api/admin/hr/fin-gateway-webhooks"
  || pathname === "/api/crm/hr/fin-gateway-webhooks"
  || pathname === "/api/hr/fin-gateway-webhooks"
  || pathname === "/api/fin/gateway-webhooks"
  || pathname === "/api/admin/hr/fin-gateway-charges"
  || pathname === "/api/crm/hr/fin-gateway-charges"
  || pathname === "/api/hr/fin-gateway-charges"
  || pathname === "/api/fin/gateway-charges"
  || pathname === "/api/admin/hr/fin-gateway-history"
  || pathname === "/api/crm/hr/fin-gateway-history"
  || pathname === "/api/hr/fin-gateway-history"
  || pathname === "/api/fin/gateway-history"
  || pathname === "/api/admin/hr/fin-gateway-webhook-sign"
  || pathname === "/api/crm/hr/fin-gateway-webhook-sign"
  || pathname === "/api/hr/fin-gateway-webhook-sign"
  || pathname === "/api/fin/gateway-webhook-sign"
  || pathname === "/api/admin/hr/fin-budgets"
  || pathname === "/api/crm/hr/fin-budgets"
  || pathname === "/api/hr/fin-budgets"
  || pathname === "/api/fin/budgets"
  || pathname === "/api/admin/hr/fin-budget-scenarios"
  || pathname === "/api/crm/hr/fin-budget-scenarios"
  || pathname === "/api/hr/fin-budget-scenarios"
  || pathname === "/api/fin/budget-scenarios"
  || pathname === "/api/admin/hr/fin-budget-history"
  || pathname === "/api/crm/hr/fin-budget-history"
  || pathname === "/api/hr/fin-budget-history"
  || pathname === "/api/fin/budget-history"
  || pathname === "/api/admin/hr/fin-exports"
  || pathname === "/api/crm/hr/fin-exports"
  || pathname === "/api/hr/fin-exports"
  || pathname === "/api/fin/exports"
  || pathname === "/api/fin/export-download"
  || pathname === "/api/admin/hr/fin-export-logs"
  || pathname === "/api/crm/hr/fin-export-logs"
  || pathname === "/api/hr/fin-export-logs"
  || pathname === "/api/fin/export-logs"
  || pathname === "/api/admin/hr/fin-competence-closures"
  || pathname === "/api/crm/hr/fin-competence-closures"
  || pathname === "/api/hr/fin-competence-closures"
  || pathname === "/api/fin/competence-closures"
  || pathname === "/api/admin/hr/fin-report-versions"
  || pathname === "/api/crm/hr/fin-report-versions"
  || pathname === "/api/hr/fin-report-versions"
  || pathname === "/api/fin/report-versions"
  || pathname === "/api/admin/hr/fin-commission-provisions"
  || pathname === "/api/crm/hr/fin-commission-provisions"
  || pathname === "/api/hr/fin-commission-provisions"
  || pathname === "/api/fin/commission-provisions"
  || pathname === "/api/admin/hr/fin-commission-provision-history"
  || pathname === "/api/crm/hr/fin-commission-provision-history"
  || pathname === "/api/hr/fin-commission-provision-history"
  || pathname === "/api/fin/commission-provision-history"
  || pathname.startsWith("/api/adm/panel/")
  || pathname === "/api/admin/hr/adm-my-day"
  || pathname === "/api/crm/hr/adm-my-day"
  || pathname === "/api/hr/adm-my-day"
  || pathname === "/api/adm/my-day"
  || pathname === "/api/admin/hr/adm-commercial-snapshots"
  || pathname === "/api/crm/hr/adm-commercial-snapshots"
  || pathname === "/api/hr/adm-commercial-snapshots"
  || pathname === "/api/adm/commercial-snapshots"
  || pathname === "/api/admin/hr/adm-operational-snapshots"
  || pathname === "/api/crm/hr/adm-operational-snapshots"
  || pathname === "/api/hr/adm-operational-snapshots"
  || pathname === "/api/adm/operational-snapshots"
  || pathname === "/api/admin/hr/adm-financial-snapshots"
  || pathname === "/api/crm/hr/adm-financial-snapshots"
  || pathname === "/api/hr/adm-financial-snapshots"
  || pathname === "/api/adm/financial-snapshots"
  || pathname === "/api/admin/hr/adm-renewal-risks"
  || pathname === "/api/crm/hr/adm-renewal-risks"
  || pathname === "/api/hr/adm-renewal-risks"
  || pathname === "/api/adm/renewal-risks"
  || pathname === "/api/admin/hr/adm-approvals"
  || pathname === "/api/crm/hr/adm-approvals"
  || pathname === "/api/hr/adm-approvals"
  || pathname === "/api/adm/approvals"
  || pathname === "/api/admin/hr/adm-approval-history"
  || pathname === "/api/crm/hr/adm-approval-history"
  || pathname === "/api/hr/adm-approval-history"
  || pathname === "/api/adm/approval-history"
  || pathname === "/api/admin/hr/adm-search-favorites"
  || pathname === "/api/crm/hr/adm-search-favorites"
  || pathname === "/api/hr/adm-search-favorites"
  || pathname === "/api/adm/search-favorites"
  || pathname === "/api/admin/hr/adm-saved-filters"
  || pathname === "/api/crm/hr/adm-saved-filters"
  || pathname === "/api/hr/adm-saved-filters"
  || pathname === "/api/adm/saved-filters"
  || pathname === "/api/admin/hr/adm-shortcuts"
  || pathname === "/api/crm/hr/adm-shortcuts"
  || pathname === "/api/hr/adm-shortcuts"
  || pathname === "/api/adm/shortcuts"
  || pathname === "/api/admin/hr/adm-reports"
  || pathname === "/api/crm/hr/adm-reports"
  || pathname === "/api/hr/adm-reports"
  || pathname === "/api/adm/reports"
  || pathname === "/api/admin/hr/adm-report-logs"
  || pathname === "/api/crm/hr/adm-report-logs"
  || pathname === "/api/hr/adm-report-logs"
  || pathname === "/api/adm/report-logs"
  || pathname === "/api/admin/hr/adm-business-configs"
  || pathname === "/api/crm/hr/adm-business-configs"
  || pathname === "/api/hr/adm-business-configs"
  || pathname === "/api/adm/business-configs"
  || pathname === "/api/admin/hr/adm-goals-comparison"
  || pathname === "/api/crm/hr/adm-goals-comparison"
  || pathname === "/api/hr/adm-goals-comparison"
  || pathname === "/api/adm/goals-comparison"
  || pathname === "/api/admin/hr/adm-management-diary-access"
  || pathname === "/api/crm/hr/adm-management-diary-access"
  || pathname === "/api/hr/adm-management-diary-access"
  || pathname === "/api/adm/management-diary-access"
  || pathname === "/api/admin/hr/adm-expansion-analyses"
  || pathname === "/api/crm/hr/adm-expansion-analyses"
  || pathname === "/api/hr/adm-expansion-analyses"
  || pathname === "/api/adm/expansion-analyses"
  || pathname === "/api/admin/hr/ast-suppliers"
  || pathname === "/api/crm/hr/ast-suppliers"
  || pathname === "/api/hr/ast-suppliers"
  || pathname === "/api/ast/suppliers"
  || pathname === "/api/admin/hr/ast-products"
  || pathname === "/api/crm/hr/ast-products"
  || pathname === "/api/hr/ast-products"
  || pathname === "/api/ast/products"
  || pathname === "/api/admin/hr/ast-stock-movements"
  || pathname === "/api/crm/hr/ast-stock-movements"
  || pathname === "/api/hr/ast-stock-movements"
  || pathname === "/api/ast/stock-movements"
  || pathname === "/api/admin/hr/ast-reservations"
  || pathname === "/api/crm/hr/ast-reservations"
  || pathname === "/api/hr/ast-reservations"
  || pathname === "/api/ast/reservations"
  || pathname === "/api/admin/hr/ast-serialized-assets"
  || pathname === "/api/crm/hr/ast-serialized-assets"
  || pathname === "/api/hr/ast-serialized-assets"
  || pathname === "/api/ast/serialized-assets"
  || pathname === "/api/admin/hr/ast-deliveries"
  || pathname === "/api/crm/hr/ast-deliveries"
  || pathname === "/api/hr/ast-deliveries"
  || pathname === "/api/ast/deliveries"
  || pathname === "/api/admin/hr/ast-requisitions"
  || pathname === "/api/crm/hr/ast-requisitions"
  || pathname === "/api/hr/ast-requisitions"
  || pathname === "/api/ast/requisitions"
  || pathname === "/api/admin/hr/ast-quotations"
  || pathname === "/api/crm/hr/ast-quotations"
  || pathname === "/api/hr/ast-quotations"
  || pathname === "/api/ast/quotations"
  || pathname === "/api/admin/hr/ast-purchase-orders"
  || pathname === "/api/crm/hr/ast-purchase-orders"
  || pathname === "/api/hr/ast-purchase-orders"
  || pathname === "/api/ast/purchase-orders"
  || pathname === "/api/admin/hr/ast-requisition-history"
  || pathname === "/api/crm/hr/ast-requisition-history"
  || pathname === "/api/hr/ast-requisition-history"
  || pathname === "/api/ast/requisition-history"
  || pathname === "/api/admin/hr/ast-order-history"
  || pathname === "/api/crm/hr/ast-order-history"
  || pathname === "/api/hr/ast-order-history"
  || pathname === "/api/ast/order-history"
  || pathname === "/api/admin/hr/ast-inventories"
  || pathname === "/api/crm/hr/ast-inventories"
  || pathname === "/api/hr/ast-inventories"
  || pathname === "/api/ast/inventories"
  || pathname === "/api/admin/hr/ast-inventory-items"
  || pathname === "/api/crm/hr/ast-inventory-items"
  || pathname === "/api/hr/ast-inventory-items"
  || pathname === "/api/ast/inventory-items"
  || pathname === "/api/admin/hr/ast-service-orders"
  || pathname === "/api/crm/hr/ast-service-orders"
  || pathname === "/api/hr/ast-service-orders"
  || pathname === "/api/ast/service-orders"
  || pathname === "/api/admin/hr/ast-service-order-evidences"
  || pathname === "/api/crm/hr/ast-service-order-evidences"
  || pathname === "/api/hr/ast-service-order-evidences"
  || pathname === "/api/ast/service-order-evidences"
  || pathname === "/api/admin/hr/ast-maintenance-plans"
  || pathname === "/api/crm/hr/ast-maintenance-plans"
  || pathname === "/api/hr/ast-maintenance-plans"
  || pathname === "/api/ast/maintenance-plans"
  || pathname === "/api/admin/hr/ast-maintenance-executions"
  || pathname === "/api/crm/hr/ast-maintenance-executions"
  || pathname === "/api/hr/ast-maintenance-executions"
  || pathname === "/api/ast/maintenance-executions"
  || pathname === "/api/admin/hr/ast-cftv-dossiers"
  || pathname === "/api/crm/hr/ast-cftv-dossiers"
  || pathname === "/api/hr/ast-cftv-dossiers"
  || pathname === "/api/ast/cftv-dossiers"
  || pathname === "/api/admin/hr/ast-cleaning-materials"
  || pathname === "/api/crm/hr/ast-cleaning-materials"
  || pathname === "/api/hr/ast-cleaning-materials"
  || pathname === "/api/ast/cleaning-materials"
  || pathname === "/api/admin/hr/ext-fleet-vehicles"
  || pathname === "/api/crm/hr/ext-fleet-vehicles"
  || pathname === "/api/hr/ext-fleet-vehicles"
  || pathname === "/api/ext/fleet-vehicles"
  || pathname.startsWith("/api/ext/fleet/")
  || pathname === "/api/admin/hr/ext-fleet-fuel-logs"
  || pathname === "/api/crm/hr/ext-fleet-fuel-logs"
  || pathname === "/api/hr/ext-fleet-fuel-logs"
  || pathname === "/api/ext/fleet-fuel-logs"
  || pathname === "/api/admin/hr/ext-fleet-maintenance-logs"
  || pathname === "/api/crm/hr/ext-fleet-maintenance-logs"
  || pathname === "/api/hr/ext-fleet-maintenance-logs"
  || pathname === "/api/ext/fleet-maintenance-logs"
  || pathname === "/api/admin/hr/ext-fleet-documents"
  || pathname === "/api/crm/hr/ext-fleet-documents"
  || pathname === "/api/hr/ext-fleet-documents"
  || pathname === "/api/ext/fleet-documents"
  || pathname === "/api/admin/hr/ext-third-parties"
  || pathname === "/api/crm/hr/ext-third-parties"
  || pathname === "/api/hr/ext-third-parties"
  || pathname === "/api/ext/third-parties"
  || pathname.startsWith("/api/ext/third-party/")
  || pathname === "/api/admin/hr/ext-third-party-documents"
  || pathname === "/api/crm/hr/ext-third-party-documents"
  || pathname === "/api/hr/ext-third-party-documents"
  || pathname === "/api/ext/third-party-documents"
  || pathname === "/api/admin/hr/ext-bidding-notices"
  || pathname === "/api/crm/hr/ext-bidding-notices"
  || pathname === "/api/hr/ext-bidding-notices"
  || pathname === "/api/ext/bidding-notices"
  || pathname.startsWith("/api/ext/bidding/")
  || pathname.startsWith("/api/ext/supplier/")
  || pathname === "/api/admin/hr/ext-bidding-documents"
  || pathname === "/api/crm/hr/ext-bidding-documents"
  || pathname === "/api/hr/ext-bidding-documents"
  || pathname === "/api/ext/bidding-documents"
  || pathname === "/api/admin/hr/ext-supplier-portal-quotations"
  || pathname === "/api/crm/hr/ext-supplier-portal-quotations"
  || pathname === "/api/hr/ext-supplier-portal-quotations"
  || pathname === "/api/ext/supplier-portal-quotations"
  || pathname === "/api/admin/hr/ext-quality-nonconformities"
  || pathname === "/api/crm/hr/ext-quality-nonconformities"
  || pathname === "/api/hr/ext-quality-nonconformities"
  || pathname === "/api/ext/quality-nonconformities"
  || pathname === "/api/admin/hr/ext-quality-actions"
  || pathname === "/api/crm/hr/ext-quality-actions"
  || pathname === "/api/hr/ext-quality-actions"
  || pathname === "/api/ext/quality-actions"
  || pathname === "/api/admin/hr/ext-satisfaction-surveys"
  || pathname === "/api/crm/hr/ext-satisfaction-surveys"
  || pathname === "/api/hr/ext-satisfaction-surveys"
  || pathname === "/api/ext/satisfaction-surveys"
  || pathname === "/api/admin/hr/ext-compliance-documents"
  || pathname === "/api/crm/hr/ext-compliance-documents"
  || pathname === "/api/hr/ext-compliance-documents"
  || pathname === "/api/ext/compliance-documents"
  || pathname === "/api/admin/hr/ext-knowledge-base"
  || pathname === "/api/crm/hr/ext-knowledge-base"
  || pathname === "/api/hr/ext-knowledge-base"
  || pathname === "/api/ext/knowledge-base"
  || pathname === "/api/admin/hr/ext-expansion-plans"
  || pathname === "/api/crm/hr/ext-expansion-plans"
  || pathname === "/api/hr/ext-expansion-plans"
  || pathname === "/api/ext/expansion-plans"
  || pathname === "/api/admin/hr/ext-expansion-scenarios"
  || pathname === "/api/crm/hr/ext-expansion-scenarios"
  || pathname === "/api/hr/ext-expansion-scenarios"
  || pathname === "/api/ext/expansion-scenarios"
  || pathname === "/api/admin/hr/ext-continuity-plans"
  || pathname === "/api/crm/hr/ext-continuity-plans"
  || pathname === "/api/hr/ext-continuity-plans"
  || pathname === "/api/ext/continuity-plans"
  || pathname === "/api/admin/hr/ext-analytics-experiments"
  || pathname === "/api/crm/hr/ext-analytics-experiments"
  || pathname === "/api/hr/ext-analytics-experiments"
  || pathname === "/api/ext/analytics-experiments"
  || pathname === "/api/admin/hr/ext-visual-tokens"
  || pathname === "/api/crm/hr/ext-visual-tokens"
  || pathname === "/api/hr/ext-visual-tokens"
  || pathname === "/api/ext/visual-tokens"
  || pathname === "/api/admin/hr/ext-visual-layouts"
  || pathname === "/api/crm/hr/ext-visual-layouts"
  || pathname === "/api/hr/ext-visual-layouts"
  || pathname === "/api/ext/visual-layouts"
  || pathname === "/api/admin/hr/ext-periodic-reports"
  || pathname === "/api/crm/hr/ext-periodic-reports"
  || pathname === "/api/hr/ext-periodic-reports"
  || pathname === "/api/ext/periodic-reports"
  || pathname === "/api/admin/hr/ext-commercial-intelligence"
  || pathname === "/api/crm/hr/ext-commercial-intelligence"
  || pathname === "/api/hr/ext-commercial-intelligence"
  || pathname === "/api/ext/commercial-intelligence"
  || pathname === "/api/admin/hr/ext-emergency-channels"
  || pathname === "/api/crm/hr/ext-emergency-channels"
  || pathname === "/api/hr/ext-emergency-channels"
  || pathname === "/api/ext/emergency-channels"
  || pathname === "/api/admin/hr/ext-emergency-tests"
  || pathname === "/api/crm/hr/ext-emergency-tests"
  || pathname === "/api/hr/ext-emergency-tests"
  || pathname === "/api/ext/emergency-tests"
  || pathname === "/api/admin/hr/ext-central-projects"
  || pathname === "/api/crm/hr/ext-central-projects"
  || pathname === "/api/hr/ext-central-projects"
  || pathname === "/api/ext/central-projects"
  || pathname === "/api/admin/hr/ext-biometry-projects"
  || pathname === "/api/crm/hr/ext-biometry-projects"
  || pathname === "/api/hr/ext-biometry-projects"
  || pathname === "/api/ext/biometry-projects"
  || pathname === "/api/admin/hr/ext-ai-automations"
  || pathname === "/api/crm/hr/ext-ai-automations"
  || pathname === "/api/hr/ext-ai-automations"
  || pathname === "/api/ext/ai-automations"
  || pathname === "/api/ai/automations"
  || pathname === "/api/admin/hr/ext-ai-automation-logs"
  || pathname === "/api/crm/hr/ext-ai-automation-logs"
  || pathname === "/api/hr/ext-ai-automation-logs"
  || pathname === "/api/ext/ai-automation-logs"
  || pathname === "/api/ai/automation-logs"
  || pathname === "/api/admin/cms-contents"
  || pathname === "/api/cms-contents"
  || pathname === "/api/public/cms-contents"
  || pathname.startsWith("/api/admin/cms-contents/")
  || pathname.startsWith("/api/cms-contents/")
  || pathname === "/api/cms"
  || pathname === "/api/public/cms"
  || pathname === "/api/seo/cms"
  || pathname === "/api/admin/themes"
  || pathname === "/api/themes"
  || pathname === "/api/public/themes"
  || pathname.startsWith("/api/admin/themes/")
  || pathname.startsWith("/api/themes/")
  || pathname === "/api/admin/theme-previews"
  || pathname === "/api/themes/preview"
  || pathname === "/api/public/theme-previews"
  || pathname.startsWith("/api/theme-previews")
  || pathname === "/api/admin/theme-preferences"
  || pathname === "/api/theme-preferences"
  || pathname === "/api/public/theme-preferences"
  || pathname === "/api/admin/themes/rollback"
  || pathname === "/api/themes/rollback"
  || pathname === "/api/admin/seo-configs"
  || pathname === "/api/seo-configs"
  || pathname === "/api/seo"
  || pathname === "/api/admin/seo-redirects"
  || pathname === "/api/seo-redirects"
  || pathname === "/api/admin/seo/sitemap-preview"
  || pathname === "/api/admin/seo-sitemap"
  || pathname === "/api/seo-sitemap"
  || pathname === "/api/sitemap"
  // PUB-08: exatamente estes dois caminhos, nunca `.../sitemap.xml` em
  // qualquer profundidade, que o `endsWith` anterior capturava por engano.
  || pathname === "/sitemap.xml"
  || pathname === "/robots.txt"
  || pathname === "/api/admin/domain-verifications"
  || pathname === "/api/domain-verifications"
  || pathname === "/api/seo/domain-verifications"
  || pathname === "/api/admin/package-rules"
  || pathname === "/api/package-rules"
  || pathname === "/api/admin/service-packages"
  || pathname === "/api/service-packages"
  || pathname === "/api/packages"
  || pathname === "/api/public/packages"
  || pathname === "/api/admin/package-comparisons"
  || pathname === "/api/package-comparisons"
  || pathname === "/api/admin/origin-metrics"
  || pathname === "/api/origin-metrics"
  || pathname === "/api/public/origin-metrics"
  || pathname === "/api/admin/conversion-events"
  || pathname === "/api/conversion-events"
  || pathname === "/api/admin/ab-tests"
  || pathname === "/api/ab-tests"
  || pathname === "/api/public/ab-tests"
  || pathname === "/api/admin/employee-complaints"
  || pathname === "/api/employee-complaints"
  || pathname === "/api/cli/employee-complaints"
  || pathname === "/api/client/employee-complaints"
  || pathname.startsWith("/api/client/employee-complaints/")
  || pathname.startsWith("/api/admin/employee-complaints/")
  || pathname.startsWith("/api/employee-complaints/")
  || pathname === "/api/admin/employee-complaint-messages"
  || pathname === "/api/employee-complaint-messages"
  || pathname === "/api/admin/employee-complaint-evidences"
  || pathname === "/api/employee-complaint-evidences"
  || pathname === "/api/admin/employee-complaint-hr-shares"
  || pathname === "/api/employee-complaint-hr-shares"
  || pathname === "/api/admin/pub-segments"
  || pathname === "/api/pub-segments"
  || pathname === "/api/segments"
  || pathname === "/api/public/segments"
  || pathname === "/api/pub/segments"
  || pathname === "/api/admin/pub-performance"
  || pathname === "/api/pub-performance"
  || pathname === "/api/performance-metrics"
  || pathname === "/api/admin/pub-accessibility"
  || pathname === "/api/pub-accessibility"
  || pathname === "/api/accessibility-checks"
  || pathname === "/api/admin/faq-assisted-rules"
  || pathname === "/api/faq-assisted-rules"
  || pathname === "/api/pub/faq-rules"
  || pathname === "/api/faq-assisted"
  || pathname === "/api/public/faq-assisted"
  || pathname === "/api/pub/faq-sessions"
  || pathname === "/api/admin/faq-assisted-sessions"
  || pathname === "/api/admin/pub-faq-sessions"
  || pathname === "/api/faq-assisted-messages"
  || pathname === "/api/pub/faq-messages"
  || pathname === "/api/admin/faq-assisted-messages"
  || pathname === "/api/faq-assisted-handoff"
  || pathname === "/api/pub/handoff-requests"
  || pathname === "/api/admin/faq-handoff"
  || pathname === "/api/admin/human-handoff"
  || pathname === "/api/admin/ai-rag-indexes"
  || pathname === "/api/ai-rag-indexes"
  || pathname === "/api/ai/rag-indexes"
  || pathname === "/api/admin/ai-rag-documents"
  || pathname === "/api/ai-rag-documents"
  || pathname === "/api/ai/rag-documents"
  || pathname === "/api/admin/ai-rag-queries"
  || pathname === "/api/ai-rag-queries"
  || pathname === "/api/ai/rag"
  || pathname === "/api/public/ai/rag"
  || pathname === "/api/ai/rag/queries"
  || pathname === "/api/ai/rag/feedback"
  || pathname === "/api/public/ai/rag/feedback"
  || pathname === "/api/admin/ai-rag-feedback"
  || pathname === "/api/admin/ai-rag-cost"
  || pathname === "/api/ai/rag/cost"
  || pathname === "/api/ai-rag-cost-tracking"
  || pathname === "/api/admin/ai-bot-config"
  || pathname === "/api/ai-bot-config"
  || pathname === "/api/ai/bot-config"
  || pathname === "/api/ai/bot"
  || pathname === "/api/public/ai/bot"
  || pathname === "/api/bot"
  || pathname === "/api/admin/ai-bot-sessions"
  || pathname === "/api/ai/bot-sessions"
  || pathname === "/api/admin/ai-rag-chunks"
  || pathname === "/api/ai-rag-chunks"
  || pathname === "/api/ai/rag-chunks";

// Keep the custom development server on an explicit bundler. Next 16's
// automatic selection can look for a missing dev/required-server-files.json
// before serving pages; API-only readiness does not detect that failure.
// Production continues to use the bundler chosen by `next build`.
const app = next({ dev, hostname, port, ...(dev ? { webpack: true } : {}) });
const handle = app.getRequestHandler();
await app.prepare();

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  if (API_PATH_MATCH(pathname)) {
    await routeApi(req, res);
    return;
  }
  // PUB-08: antes de entregar ao Next, um único salto de redirect cadastrado.
  // Só GET/HEAD, `Location` sempre interno, query preservada. Falha de banco
  // não redireciona (a página é servida normalmente) — redirect não é controle
  // de autorização e não pode derrubar o site público.
  const redirect = await seoTechnicalApi.resolveRedirect(req, pathname);
  if (redirect) {
    res.writeHead(redirect.status, {
      Location: redirect.location,
      "Cache-Control": "no-store, max-age=0",
      "Content-Length": 0,
    });
    res.end();
    return;
  }
  await handle(req, res);
});

const upgradeHandler = app.getUpgradeHandler();
server.on("upgrade", (req, socket, head) => upgradeHandler(req, socket, head));
server.listen(port, hostname, () => {
  console.log(`Grupo SEG System ${dev ? "dev" : "server"} listening on http://${hostname}:${port}`);
});
