// EXT-06: servidor HTTP real + PostgreSQL real, somente dados sintéticos .invalid.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE = process.env.QA_EXT06_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");

test("EXT-06 gate exige banco real e não aceita skip silencioso", () => { if (REQUIRE) assert.ok(RUN); });

let server, base, pool, ti, rh, cookieTi, cookieRh;
let accountId, targetIdentityId, clientCookie, clientEmail;
const clientPassword = "Senha-Sintetica-Cliente-9!";
const idem = tag => `ext06-${tag}-${randomUUID()}`;

async function wait() {
  for (let i = 0; i < 150; i++) {
    try { const r = await fetch(`${base}/api/admin/session`); if ([200, 401].includes(r.status)) return; } catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error("server_did_not_start");
}
async function staff(role) {
  const id = randomUUID(), email = `qa-ext06-${role}-${id.slice(0, 8)}@example.invalid`, password = "Senha-Sintetica-9!";
  await pool.query(`INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,$3,'active')`, [id, email, `QA EXT06 ${role}`]);
  await pool.query(`INSERT INTO auth_credentials(identity_id,password_hash) VALUES($1,$2)`, [id, await hashPassword(password)]);
  await pool.query(`INSERT INTO auth_staff_profiles(identity_id,role,assigned_by) VALUES($1,$2,'admin_system')`, [id, role]);
  return { id, email, password };
}
async function login(s) {
  const r = await fetch(`${base}/api/admin/session`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email: s.email, password: s.password }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().find(x => x.startsWith("seg_admin_session=")).split(";")[0];
}
const get = (url, cookie = cookieTi) => fetch(`${base}${url}`, { headers: { accept: "application/json", ...(cookie ? { cookie } : {}) } });
const post = (url, body = {}, options = {}) => fetch(`${base}${url}`, {
  method: options.method || "POST",
  headers: {
    "content-type": "application/json",
    origin: options.origin === undefined ? base : options.origin,
    ...(options.cookie === undefined ? { cookie: cookieTi } : options.cookie ? { cookie: options.cookie } : {}),
    ...(options.key === null ? {} : { "idempotency-key": options.key || idem("post") }),
  },
  body: JSON.stringify(body),
});
async function data(r) { const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = null; } return { r, b, t }; }

async function createAccountWithResponsible({ withResponsible = true } = {}) {
  const id = randomUUID();
  await pool.query(`INSERT INTO client_accounts(id,display_name,status,created_by) VALUES($1,$2,'active','ti')`, [id, `Conta sintética ${id.slice(0, 8)}`]);
  let companyId = null;
  if (withResponsible) {
    companyId = randomUUID();
    await pool.query(`INSERT INTO crm_companies(id,display_name,status,responsible_id,responsible_name,created_by) VALUES($1,$2,'active',$3,$4,'ti')`, [companyId, `Empresa sintética ${id.slice(0, 8)}`, ti.id, "Responsável Comercial Sintético"]);
    await pool.query(`UPDATE client_accounts SET crm_company_id=$2 WHERE id=$1`, [id, companyId]);
  }
  return id;
}
async function createClientTarget(forAccountId) {
  const identityId = randomUUID();
  const email = `qa-ext06-client-${identityId.slice(0, 8)}@example.invalid`;
  await pool.query(`INSERT INTO auth_identities(id,kind,email,display_name,status,verification_method,verified_at) VALUES($1,'client',$2,$3,'active','email_link',NOW())`, [identityId, email, "Cliente Sintético EXT-06"]);
  await pool.query(`INSERT INTO auth_credentials(identity_id,password_hash) VALUES($1,$2)`, [identityId, await hashPassword(clientPassword)]);
  const grantId = randomUUID();
  await pool.query(`INSERT INTO client_access_grants(id,identity_id,client_account_id,reason,granted_by) VALUES($1,$2,$3,'vínculo sintético de teste','ti')`, [grantId, identityId, forAccountId]);
  return { identityId, email };
}
async function loginClient(email) {
  const r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email, password: clientPassword }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
}

async function createSurvey(tag, overrides = {}) {
  const body = {
    client_account_id: accountId, target_identity_id: targetIdentityId,
    survey_type: "pos_atendimento", methodology: "none", scale_min: 0, scale_max: 10,
    recovery_rule: { trigger: "none" },
    ...overrides,
  };
  const x = await data(await post("/api/ext/satisfaction/surveys", body, { key: idem(`create-${tag}`) }));
  return x;
}

before(async () => {
  if (!RUN) return;
  const port = 3300 + Math.floor(Math.random() * 1200);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: {
      ...process.env, PORT: String(port), BIND_HOST: "127.0.0.1", NODE_ENV: "development",
      NEXT_DIST_DIR: ".next/integration-ext06", SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64url"), SITE_ADMIN_LEGACY_TOKENS: "",
      OLLAMA_ENABLED: "false", MAIL_HOST: "", NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  server.stdout.on("data", c => logs += c);
  server.stderr.on("data", c => logs += c);
  try { await wait(); } catch (e) { throw new Error(`${e.message}\n${logs.slice(-3000)}`); }
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  ti = await staff("ti");
  rh = await staff("rh");
  // Rota legada /api/admin/hr/cli-satisfaction-surveys consulta a permissão
  // granular employees.read/write (domínio HR), não apenas o papel; conceder
  // aqui apenas o necessário para exercitar leitura funcionando e mutação
  // aposentada (410) nesse caso de teste específico.
  await pool.query(
    `INSERT INTO auth_permissions(id,identity_id,permission,scope_type,reason,granted_by_role)
     VALUES ($1,$2,'employees.read','global','QA EXT06 leitura legada sintética','ti'),
            ($3,$2,'employees.write','global','QA EXT06 leitura legada sintética','ti')`,
    [randomUUID(), ti.id, randomUUID()],
  );
  cookieTi = await login(ti);
  cookieRh = await login(rh);
  accountId = await createAccountWithResponsible({ withResponsible: true });
  const target = await createClientTarget(accountId);
  targetIdentityId = target.identityId;
  clientEmail = target.email;
  clientCookie = await loginClient(clientEmail);
});
after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) { server.kill("SIGTERM"); await new Promise(r => setTimeout(r, 300)); server.kill("SIGKILL"); }
});

const opt = { skip: !RUN };

test("EXT-06 HTTP: anônimo recebe 401", opt, async () => assert.equal((await get("/api/ext/satisfaction/surveys", null)).status, 401));
test("EXT-06 HTTP: papel não autorizado recebe 403", opt, async () => assert.equal((await get("/api/ext/satisfaction/surveys", cookieRh)).status, 403));
test("EXT-06 HTTP: mutação cross-origin recebe 403", opt, async () => assert.equal((await post("/api/ext/satisfaction/surveys", {}, { origin: "https://attacker.invalid" })).status, 403));
test("EXT-06 HTTP: idempotency key é obrigatória", opt, async () => assert.equal((await post("/api/ext/satisfaction/surveys", {}, { key: null })).status, 400));
test("EXT-06 UI: /admin/satisfacao é rota real", opt, async () => { const r = await fetch(`${base}/admin/satisfacao`), t = await r.text(); assert.equal(r.status, 200); assert.match(t, /[Ss]atisfa/); });
test("EXT-06 DB: cluster limpo não recebeu seed operacional", opt, async () => { const r = await pool.query(`SELECT count(*)::int n FROM cli_satisfaction_surveys WHERE origin='jornada_canonica'`); assert.equal(r.rows[0].n, 0); });
test("EXT-06 HTTP: lista declara fonte/critério/vazio sem inventar presença", opt, async () => {
  const b = await (await get("/api/ext/satisfaction/surveys")).json();
  assert.equal(b.source, "cli_satisfaction_surveys");
  assert.equal(b.criterion, "Resposta gera acompanhamento sem expor funcionário");
});
test("EXT-06 HTTP: referências retornam conta e destinatário com vínculo ativo", opt, async () => {
  const b = await (await get(`/api/ext/satisfaction/references?account_id=${accountId}`)).json();
  assert.ok(b.accounts.some(a => a.id === accountId));
  assert.ok(b.targets.some(t => t.id === targetIdentityId));
});
test("EXT-06 HTTP: UUID inválido no padrão de rota não casa e devolve 404", opt, async () => assert.equal((await get("/api/ext/satisfaction/surveys/not-uuid")).status, 404));
test("EXT-06 HTTP: metodologia incompleta é recusada com detalhes", opt, async () => {
  const x = await createSurvey("bad-methodology", { methodology: "csat", classification_rule: null });
  assert.equal(x.r.status, 400);
  assert.ok(x.b.details.includes("methodology_source_required") || x.b.details.includes("classification_rule_required"));
});
test("EXT-06 HTTP: NPS exige escala fixa 0-10", opt, async () => {
  const x = await createSurvey("bad-nps-scale", { methodology: "nps", scale_min: 0, scale_max: 5, methodology_source: "Pesquisa NPS trimestral declarada", classification_rule: { detractor_max: 6, passive_max: 8 }, recovery_rule: { trigger: "nps_detractor" } });
  assert.equal(x.r.status, 400);
  assert.ok(x.b.details.includes("nps_requires_0_10_scale"));
});
test("EXT-06 HTTP: destinatário sem vínculo ativo é recusado", opt, async () => {
  const x = await createSurvey("bad-target", { target_identity_id: randomUUID() });
  assert.equal(x.r.status, 400);
  assert.equal(x.b.error, "invalid_target_identity");
});
test("EXT-06 HTTP+DB: criação deriva autoria e ignora origem/status forjados", opt, async () => {
  const x = await createSurvey("forged", { origin: "registro_legado", status: "concluida" });
  assert.equal(x.r.status, 201, x.t);
  const row = (await pool.query(`SELECT created_by_identity, origin, status FROM cli_satisfaction_surveys WHERE id=$1`, [x.b.survey.id])).rows[0];
  assert.equal(row.created_by_identity, ti.id);
  assert.equal(row.origin, "jornada_canonica");
  assert.equal(row.status, "pendente");
});
test("EXT-06 HTTP+DB: retry idêntico não duplica", opt, async () => {
  const k = idem("retry");
  const body = { client_account_id: accountId, target_identity_id: targetIdentityId, survey_type: "pos_atendimento", methodology: "none", scale_min: 0, scale_max: 10, recovery_rule: { trigger: "none" } };
  const a = await data(await post("/api/ext/satisfaction/surveys", body, { key: k }));
  const b = await data(await post("/api/ext/satisfaction/surveys", body, { key: k }));
  assert.equal(a.r.status, 201);
  assert.equal(b.r.status, 200);
  assert.equal(a.b.survey.id, b.b.survey.id);
  const c = await pool.query(`SELECT count(*)::int n FROM cli_satisfaction_events WHERE idempotency_key=$1`, [k]);
  assert.equal(c.rows[0].n, 1);
});
test("EXT-06 HTTP: mesma chave com corpo diferente recebe 409", opt, async () => {
  const k = idem("conflict");
  await post("/api/ext/satisfaction/surveys", { client_account_id: accountId, target_identity_id: targetIdentityId, survey_type: "pos_atendimento", methodology: "none", scale_min: 0, scale_max: 10, recovery_rule: { trigger: "none" } }, { key: k });
  const r = await post("/api/ext/satisfaction/surveys", { client_account_id: accountId, target_identity_id: targetIdentityId, survey_type: "periodica", methodology: "none", scale_min: 0, scale_max: 10, recovery_rule: { trigger: "none" } }, { key: k });
  assert.equal(r.status, 409);
});
test("EXT-06 HTTP+DB: cancelamento só antes da resposta e exige justificativa", opt, async () => {
  const created = await createSurvey("cancel");
  assert.equal(created.r.status, 201);
  const id = created.b.survey.id;
  assert.equal((await post(`/api/ext/satisfaction/surveys/${id}/cancel`, { justification: "curta" })).status, 400);
  const ok = await data(await post(`/api/ext/satisfaction/surveys/${id}/cancel`, { justification: "Cancelamento sintético devidamente justificado para o teste." }));
  assert.equal(ok.r.status, 200, ok.t);
  assert.equal(ok.b.survey.status, "cancelada");
  const again = await post(`/api/ext/satisfaction/surveys/${id}/cancel`, { justification: "Segunda tentativa sintética de cancelamento." });
  assert.equal(again.status, 409);
});
test("EXT-06 HTTP: conclusão antes da resposta é recusada", opt, async () => {
  const created = await createSurvey("conclude-too-early");
  const r = await post(`/api/ext/satisfaction/surveys/${created.b.survey.id}/conclude`, { conclusion_result: "Tentativa sintética prematura." });
  assert.equal(r.status, 409);
});
test("EXT-06 DB: banco recusa salto de estado direto (pendente->concluida)", opt, async () => {
  const created = await createSurvey("db-jump");
  await assert.rejects(
    pool.query(`UPDATE cli_satisfaction_surveys SET status='concluida', concluded_at=NOW(), concluded_by_identity=$2, conclusion_result='teste' WHERE id=$1`, [created.b.survey.id, ti.id]),
    /invalid satisfaction survey transition/,
  );
});
test("EXT-06 DB: resposta é imutável depois de registrada", opt, async () => {
  const created = await createSurvey("db-immutable", { recovery_rule: { trigger: "never" } });
  await pool.query(`UPDATE cli_satisfaction_surveys SET status='respondida', score=5, feedback='nota original registrada pelo cliente', responded_at=NOW(), responded_by_identity=$2, response_idempotency_key=$3, response_fingerprint=$4 WHERE id=$1`,
    [created.b.survey.id, targetIdentityId, idem("db-respond"), "a".repeat(64)]);
  await assert.rejects(
    pool.query(`UPDATE cli_satisfaction_surveys SET score=1 WHERE id=$1`, [created.b.survey.id]),
    /response is immutable/,
  );
});

// Fluxo completo do cliente: resposta gera acompanhamento sem expor funcionário.
test("EXT-06 HTTP+DB: resposta do cliente com NPS detrator abre plano com responsável canônico, sem vazar identidade na HTTP", opt, async () => {
  const created = await createSurvey("nps-flow", {
    methodology: "nps", scale_min: 0, scale_max: 10, methodology_source: "Pesquisa NPS trimestral declarada para o contrato",
    classification_rule: { detractor_max: 6, passive_max: 8 }, recovery_rule: { trigger: "nps_detractor" },
  });
  assert.equal(created.r.status, 201, created.t);
  const surveyId = created.b.survey.id;
  const key = idem("client-respond");
  const r = await fetch(`${base}/api/client/satisfaction-surveys`, {
    method: "POST", headers: { "content-type": "application/json", origin: base, cookie: clientCookie, "idempotency-key": key },
    body: JSON.stringify({ survey_id: surveyId, score: 2, feedback: "O atendimento noturno demorou mais do que o combinado." }),
  });
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  assert.equal(body.follow_up_required, true);
  assert.equal(body.survey.status, "em_acao");
  assert.equal(body.actionPlan.survey_id, surveyId);
  assert.equal(Object.keys(body.actionPlan).sort().join(","), "status,survey_id");
  const raw = JSON.stringify(body);
  for (const forbidden of ["responsible_name", "responsible_identity", "Responsável Comercial Sintético", "renewal_risk", "facts_json", "action_plan_pending_reason"]) {
    assert.ok(!raw.includes(forbidden), `vazou ${forbidden} na resposta HTTP do portal`);
  }
  const planRow = (await pool.query(`SELECT responsible_identity_id, responsible_name, status FROM cli_satisfaction_action_plans WHERE survey_id=$1`, [surveyId])).rows[0];
  assert.equal(planRow.responsible_identity_id, ti.id);
  assert.equal(planRow.status, "aberta");
});
test("EXT-06 HTTP: lista do cliente nunca inclui campos internos", opt, async () => {
  const r = await fetch(`${base}/api/client/satisfaction-surveys?account=${accountId}`, { headers: { cookie: clientCookie, origin: base } });
  const body = await r.json();
  assert.equal(r.status, 200);
  for (const survey of body.surveys) {
    for (const forbidden of ["renewal_risk", "renewal_risk_reason", "facts_json", "action_plan_pending_reason", "responsible_name", "responsible_identity_id"]) {
      assert.ok(!(forbidden in survey), `campo interno ${forbidden} vazou na listagem do cliente`);
    }
  }
});
test("EXT-06 HTTP: conclusão bloqueada enquanto o plano de recuperação não está concluído", opt, async () => {
  const created = await createSurvey("conclude-block", {
    methodology: "nps", scale_min: 0, scale_max: 10, methodology_source: "Pesquisa NPS trimestral declarada para bloqueio",
    classification_rule: { detractor_max: 6, passive_max: 8 }, recovery_rule: { trigger: "nps_detractor" },
  });
  const surveyId = created.b.survey.id;
  await fetch(`${base}/api/client/satisfaction-surveys`, {
    method: "POST", headers: { "content-type": "application/json", origin: base, cookie: clientCookie, "idempotency-key": idem("conclude-block-respond") },
    body: JSON.stringify({ survey_id: surveyId, score: 1, feedback: "Resposta sintética negativa para teste de bloqueio." }),
  });
  const blocked = await post(`/api/ext/satisfaction/surveys/${surveyId}/conclude`, { conclusion_result: "Tentativa sintética antes do plano concluir." });
  assert.equal(blocked.status, 409);
  const plan = (await pool.query(`SELECT id FROM cli_satisfaction_action_plans WHERE survey_id=$1`, [surveyId])).rows[0];
  const started = await data(await post(`/api/ext/satisfaction/action-plans/${plan.id}/start`, {}));
  assert.equal(started.r.status, 200, started.t);
  const completed = await data(await post(`/api/ext/satisfaction/action-plans/${plan.id}/complete`, { completion_result: "Cliente contatado e situação revertida." }));
  assert.equal(completed.r.status, 200, completed.t);
  const allowed = await data(await post(`/api/ext/satisfaction/surveys/${surveyId}/conclude`, { conclusion_result: "Pesquisa concluída após plano de recuperação." }));
  assert.equal(allowed.r.status, 200, allowed.t);
  assert.equal(allowed.b.survey.status, "concluida");
});
test("EXT-06 HTTP: plano de recuperação segue máquina de estados sem saltos", opt, async () => {
  const created = await createSurvey("plan-transitions", { recovery_rule: { trigger: "score_at_or_below", threshold: 6 } });
  const surveyId = created.b.survey.id;
  await fetch(`${base}/api/client/satisfaction-surveys`, {
    method: "POST", headers: { "content-type": "application/json", origin: base, cookie: clientCookie, "idempotency-key": idem("plan-transitions-respond") },
    body: JSON.stringify({ survey_id: surveyId, score: 3, feedback: "Resposta sintética para testar transições do plano." }),
  });
  const plan = (await pool.query(`SELECT id FROM cli_satisfaction_action_plans WHERE survey_id=$1`, [surveyId])).rows[0];
  const cancelWithoutStart = await data(await post(`/api/ext/satisfaction/action-plans/${plan.id}/cancel`, { justification: "Cancelamento sintético direto sem iniciar." }));
  assert.equal(cancelWithoutStart.r.status, 200, cancelWithoutStart.t);
  const startAfterCancel = await post(`/api/ext/satisfaction/action-plans/${plan.id}/start`, {});
  assert.equal(startAfterCancel.status, 409);
});
test("EXT-06 HTTP: plano manual exige recuperação pendente e responsável real", opt, async () => {
  const noResponsibleAccount = await createAccountWithResponsible({ withResponsible: false });
  const target = await createClientTarget(noResponsibleAccount);
  const clientLogin = await loginClient(target.email);
  const created = await createSurvey("manual-plan", { client_account_id: noResponsibleAccount, target_identity_id: target.identityId, recovery_rule: { trigger: "score_at_or_below", threshold: 6 } });
  assert.equal(created.r.status, 201, created.t);
  const surveyId = created.b.survey.id;
  const respond = await fetch(`${base}/api/client/satisfaction-surveys`, {
    method: "POST", headers: { "content-type": "application/json", origin: base, cookie: clientLogin, "idempotency-key": idem("manual-plan-respond") },
    body: JSON.stringify({ survey_id: surveyId, score: 2, feedback: "Resposta sintética sem responsável comercial cadastrado." }),
  });
  const respondBody = await respond.json();
  assert.equal(respond.status, 200, JSON.stringify(respondBody));
  assert.equal(respondBody.survey.status, "respondida");
  assert.equal(respondBody.actionPlan, null);
  const manualAttempt = await post(`/api/ext/satisfaction/surveys/${surveyId}/action-plan`, {});
  assert.equal(manualAttempt.status, 409);
  const body = await manualAttempt.json();
  assert.equal(body.error, "no_real_responsible_available");
});
test("EXT-06 HTTP: contrato fora da conta é recusado na criação", opt, async () => {
  const otherAccount = await createAccountWithResponsible();
  const contractId = randomUUID();
  await pool.query(`INSERT INTO client_contracts(id,client_account_id,title,service,created_by) VALUES($1,$2,'Contrato sintético de outra conta','Serviço sintético','ti')`, [contractId, otherAccount]);
  const x = await createSurvey("cross-account-contract", { contract_id: contractId });
  assert.equal(x.r.status, 400);
  assert.equal(x.b.error, "invalid_survey_scope");
});
test("EXT-06 HTTP: aggregates declara ausência sem apresentar como zero", opt, async () => {
  const freshAccount = await createAccountWithResponsible();
  const b = await (await get(`/api/ext/satisfaction/aggregates?account_id=${freshAccount}`)).json();
  assert.equal(b.source, "cli_satisfaction_surveys");
  assert.equal(b.groups.length, 0);
  assert.match(b.empty_state, /ausência/);
});
test("EXT-06 legado ext-satisfaction-surveys: items, 401, 403 e 410 após guardas", opt, async () => {
  const read = await data(await get("/api/ext/satisfaction-surveys"));
  assert.equal(read.r.status, 200);
  assert.ok(Array.isArray(read.b.items));
  assert.equal((await get("/api/ext/satisfaction-surveys", null)).status, 401);
  assert.equal((await get("/api/ext/satisfaction-surveys", cookieRh)).status, 403);
  assert.equal((await post("/api/ext/satisfaction-surveys", {})).status, 410);
  assert.equal((await post("/api/ext/satisfaction-surveys", {}, { cookie: null })).status, 401);
});
test("EXT-06 legado cli-finance: leitura funciona, mutação aposentada", opt, async () => {
  const read = await data(await get("/api/admin/hr/cli-satisfaction-surveys"));
  assert.equal(read.r.status, 200);
  const createAttempt = await post("/api/admin/hr/cli-satisfaction-surveys", { client_account_id: accountId });
  assert.equal(createAttempt.status, 410);
  const planAttempt = await post("/api/admin/hr/cli-satisfaction-action-plans", { survey_id: randomUUID(), action: "x", responsible_name: "y", due_date: "2026-01-01" });
  assert.equal(planAttempt.status, 410);
});
test("EXT-06 HTTP+DB: falha de audit_log devolve 503 e rollback total", opt, async () => {
  await pool.query(`CREATE OR REPLACE FUNCTION qa_ext06_reject_audit() RETURNS TRIGGER AS $$ BEGIN IF NEW.action='ext_satisfaction_survey_create' THEN RAISE EXCEPTION 'audit unavailable ext06 qa'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER qa_ext06_reject_audit_trg BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION qa_ext06_reject_audit()`);
  try {
    const key = idem("audit-fail");
    const r = await post("/api/ext/satisfaction/surveys", { client_account_id: accountId, target_identity_id: targetIdentityId, survey_type: "pos_atendimento", methodology: "none", scale_min: 0, scale_max: 10, recovery_rule: { trigger: "none" } }, { key });
    assert.equal(r.status, 503);
    const count = await pool.query(`SELECT count(*)::int n FROM cli_satisfaction_events WHERE idempotency_key=$1`, [key]);
    assert.equal(count.rows[0].n, 0);
  } finally {
    await pool.query(`DROP TRIGGER qa_ext06_reject_audit_trg ON audit_log`);
    await pool.query(`DROP FUNCTION qa_ext06_reject_audit()`);
  }
});
test("EXT-06 DB: evento histórico é imutável", opt, async () => {
  const created = await createSurvey("event-immutable");
  const e = await pool.query(`SELECT id FROM cli_satisfaction_events WHERE survey_id=$1 LIMIT 1`, [created.b.survey.id]);
  await assert.rejects(pool.query(`DELETE FROM cli_satisfaction_events WHERE id=$1`, [e.rows[0].id]), /immutable/);
});
test("EXT-06 HTTP: concorrência não duplica plano de recuperação na resposta simultânea", opt, async () => {
  const created = await createSurvey("concurrency", { recovery_rule: { trigger: "score_at_or_below", threshold: 6 } });
  const surveyId = created.b.survey.id;
  const attempt = () => fetch(`${base}/api/client/satisfaction-surveys`, {
    method: "POST", headers: { "content-type": "application/json", origin: base, cookie: clientCookie, "idempotency-key": idem(`concurrency-${Math.random()}`) },
    body: JSON.stringify({ survey_id: surveyId, score: 1, feedback: "Resposta sintética concorrente para teste de corrida." }),
  });
  const [a, b] = await Promise.all([attempt(), attempt()]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const plans = await pool.query(`SELECT count(*)::int n FROM cli_satisfaction_action_plans WHERE survey_id=$1`, [surveyId]);
  assert.equal(plans.rows[0].n, 1);
});
