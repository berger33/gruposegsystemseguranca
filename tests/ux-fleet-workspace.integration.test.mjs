// UX-07 / EXT-01 — HTTP + PostgreSQL + Chromium reais.
// Massa de frota nasce exclusivamente nas APIs canônicas. SQL é usado apenas
// para provisionar autenticação de equipe (helper compartilhado) e ler
// CURRENT_DATE do servidor; nenhuma tabela de negócio da frota recebe SQL.
// Falhas são injetadas somente no browser, sobre window.fetch. O servidor não
// é enfraquecido. Aceite humano permanece PENDENTE.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";
import pg from "pg";
import { chromium as playwrightChromium } from "playwright";
import packagedChromium from "@sparticuz/chromium";
import { provisionStaff, STAFF_TEST_PASSWORD } from "./helpers/staff-login.mjs";

const RUN =
  process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, "..");
let server, baseUrl, pool, adminCookie, rhCookie, vehicle, today;
const progress = (name) => console.log(`UX_FLEET_SETUP: ${name}`);
const operationKey = (label) => `ext01-ux-${label}-${randomUUID()}`;
async function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}
async function waitServer() {
  const end = Date.now() + 180000;
  while (Date.now() < end) {
    try {
      const r = await fetch(`${baseUrl}/api/admin/session`);
      if ([200, 401].includes(r.status)) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("server_did_not_start");
}
async function login(email) {
  const r = await fetch(`${baseUrl}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ email, password: STAFF_TEST_PASSWORD }),
  });
  assert.equal(r.status, 200);
  const raw = (r.headers.getSetCookie?.() || []).find((v) =>
    v.startsWith("seg_admin_session="),
  );
  assert.ok(raw);
  return raw.split(";")[0];
}
async function api(
  url,
  { method = "GET", cookie, body, idempotencyKey, origin = baseUrl } = {},
) {
  const r = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      accept: "application/json",
      ...(cookie ? { cookie } : {}),
      ...(method !== "GET"
        ? {
            origin,
            "content-type": "application/json",
            ...(idempotencyKey === null
              ? {}
              : { "idempotency-key": idempotencyKey || operationKey("api") }),
          }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {}
  return { status: r.status, body: parsed, text };
}
async function launch() {
  return playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    args: packagedChromium.args.filter((a) => a !== "--disable-web-security"),
    headless: true,
  });
}
async function openPage(
  browser,
  cookie,
  { width = 1440, height = 900, fail = "", presentAdmin = false } = {},
) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: "pt-BR",
  });
  const i = cookie.indexOf("=");
  await context.addCookies([
    { name: cookie.slice(0, i), value: cookie.slice(i + 1), url: baseUrl },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  await page.addInitScript(
    ({ failed, menu }) => {
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input?.url || "";
        if (
          menu &&
          url.includes("/api/admin/session") &&
          (!init?.method || init.method === "GET")
        )
          return new Response(
            JSON.stringify({
              role: "admin",
              mfaVerified: true,
              expiresAt: "2099-01-01T00:00:00Z",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        if (failed && url.includes(failed))
          return new Response(
            JSON.stringify({
              error: "fleet_unavailable",
              hint: "falha sintética apenas no navegador",
            }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        return original(input, init);
      };
    },
    { failed: fail, menu: presentAdmin },
  );
  await page.goto(`${baseUrl}/admin/frota`, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("heading", { name: "Frota e histórico por veículo" })
    .waitFor();
  return { page, context };
}

before(async () => {
  if (!RUN) return;
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      NODE_ENV: "development",
      NEXT_DIST_DIR: ".next/integration-ux-fleet",
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      EMPLOYEE_SESSION_SECRET: randomUUID().repeat(2),
      CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
      ADMIN_LOGIN_MAX_ATTEMPTS: "200",
      SITE_ADMIN_LEGACY_TOKENS: "",
      OLLAMA_ENABLED: "false",
      MAIL_HOST: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  server.stdout.on("data", (c) => (logs += c));
  server.stderr.on("data", (c) => (logs += c));
  try {
    await waitServer();
  } catch (e) {
    throw new Error(`${e.message}\n${logs.slice(-3000)}`);
  }
  progress("servidor no ar");
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  today = (await pool.query("SELECT CURRENT_DATE::text AS today")).rows[0]
    .today;
  progress(`CURRENT_DATE ${today}`);
  const admin = await provisionStaff(pool, { role: "admin" });
  const rh = await provisionStaff(pool, { role: "rh" });
  adminCookie = await login(admin.email);
  rhCookie = await login(rh.email);
  progress("sessões reais criadas");
  let r = await api("/api/ext/fleet/vehicles", {
    method: "POST",
    cookie: adminCookie,
    body: {
      plate: "UXF1A23",
      model: "Furgão sintético",
      manufacturer: "Fabricante fictício",
      year: 2024,
      fuel_type: "flex",
      mileage: 12000,
      cost_center: "Centro fictício UX",
    },
    idempotencyKey: operationKey("vehicle"),
  });
  assert.equal(r.status, 201, r.text);
  vehicle = r.body.vehicle;
  progress(`veículo criado ${vehicle.plate}`);
  r = await api(`/api/ext/fleet/vehicles/${vehicle.id}/fuel-logs`, {
    method: "POST",
    cookie: adminCookie,
    body: {
      fuel_date: today,
      liters: 35.5,
      cost_cents: 18750,
      mileage: 12010,
      station: "Posto sintético",
    },
    idempotencyKey: operationKey("fuel"),
  });
  assert.equal(r.status, 201, r.text);
  r = await api(`/api/ext/fleet/vehicles/${vehicle.id}/maintenance-logs`, {
    method: "POST",
    cookie: adminCookie,
    body: {
      maintenance_type: "preventiva",
      description: "Manutenção sintética criada pela API canônica.",
      cost_cents: 42000,
      mileage: 12000,
      performed_at: today,
    },
    idempotencyKey: operationKey("maintenance"),
  });
  assert.equal(r.status, 201, r.text);
  r = await api(`/api/ext/fleet/vehicles/${vehicle.id}/documents`, {
    method: "POST",
    cookie: adminCookie,
    body: { document_type: "crlv", document_number: "FICTICIO-001" },
    idempotencyKey: operationKey("document"),
  });
  assert.equal(r.status, 201, r.text);
  r = await api(`/api/ext/fleet/vehicles/${vehicle.id}/maintenance-rules`, {
    method: "POST",
    cookie: adminCookie,
    body: {
      interval_days: 180,
      interval_km: 10000,
      alert_before_days: 15,
      alert_before_km: 500,
      justification: "Regra sintética escrita por quem opera o gate.",
    },
    idempotencyKey: operationKey("rule"),
  });
  assert.equal(r.status, 201, r.text);
  progress("massa criada pelas APIs canônicas");
  for (const route of ["/admin/entrar", "/admin/frota"]) {
    const end = Date.now() + 240000;
    while (Date.now() < end) {
      const r = await fetch(`${baseUrl}${route}`, { redirect: "manual" }).catch(
        () => null,
      );
      if (r && r.status !== 404) break;
      await new Promise((v) => setTimeout(v, 500));
    }
    progress(`página compilada ${route}`);
  }
});
after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    server.kill("SIGKILL");
  }
});

test(
  "HTTP: sessão, papel, origem e chave continuam decididos pelo servidor",
  { skip: !RUN },
  async () => {
    let r = await api("/api/ext/fleet/vehicles");
    assert.equal(r.status, 401);
    assert.equal(r.body.error, "unauthorized");
    r = await api("/api/ext/fleet/vehicles", { cookie: rhCookie });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "forbidden_role");
    r = await api("/api/ext/fleet/vehicles", {
      method: "POST",
      cookie: adminCookie,
      body: { plate: "NEG1A23", model: "Veículo negado" },
      idempotencyKey: null,
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "idempotency_key_required");
    r = await api(`/api/ext/fleet/vehicles/${vehicle.id}`, {
      method: "PATCH",
      cookie: adminCookie,
      origin: "https://origem.invalid",
      body: { status: "em_uso" },
    });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "origin_forbidden");
  },
);

test(
  "browser: papel recusado vira NEGADO com código e sem tabela",
  { skip: !RUN },
  async () => {
    const browser = await launch();
    try {
      const { page, context } = await openPage(browser, rhCookie, {
        presentAdmin: true,
      });
      await page.getByText("Papel sem acesso à frota").waitFor();
      assert.equal(await page.locator('[data-ui-state="denied"]').count(), 1);
      assert.match(
        await page
          .getByRole("heading", { name: "Frota e histórico por veículo" })
          .locator("..")
          .textContent(),
        /forbidden_role/,
      );
      assert.equal(await page.getByRole("table").count(), 0);
      assert.doesNotMatch(
        await page
          .getByRole("heading", { name: "Frota e histórico por veículo" })
          .locator("..")
          .textContent(),
        /Nenhuma frota própria registrada/,
      );
      await context.close();
    } finally {
      await browser.close();
    }
  },
);

test(
  "browser: falha injetada não vira vazio nem indicador zero",
  { skip: !RUN },
  async () => {
    const browser = await launch();
    try {
      const { page, context } = await openPage(browser, adminCookie, {
        fail: "/api/ext/fleet/vehicles",
      });
      await page.getByText("Frota indisponível").waitFor();
      const text = await page
        .getByRole("heading", { name: "Frota e histórico por veículo" })
        .locator("..")
        .textContent();
      assert.match(text, /fleet_unavailable/);
      assert.doesNotMatch(text, /Nenhuma frota própria registrada/);
      assert.equal(await page.getByRole("table").count(), 0);
      assert.equal(await page.locator('[class*="metricValue"]').count(), 0);
      await context.close();
    } finally {
      await browser.close();
    }
  },
);

test(
  "browser: abas têm roving tabindex e teclado completo",
  { skip: !RUN },
  async () => {
    const browser = await launch();
    try {
      const { page, context } = await openPage(browser, adminCookie);
      await page.getByText("UXF1A23").waitFor();
      const tabs = page.getByRole("tab");
      assert.equal(await tabs.count(), 4);
      await tabs.nth(0).focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await tabs.nth(1).getAttribute("aria-selected"), "true");
      await page.keyboard.press("End");
      assert.equal(await tabs.nth(3).getAttribute("aria-selected"), "true");
      await page.keyboard.press("Home");
      assert.equal(await tabs.nth(0).getAttribute("aria-selected"), "true");
      await page.keyboard.press("ArrowLeft");
      assert.equal(await tabs.nth(3).getAttribute("aria-selected"), "true");
      assert.equal(await tabs.nth(3).getAttribute("tabindex"), "0");
      await context.close();
    } finally {
      await browser.close();
    }
  },
);

test(
  "browser: conteúdo real aparece em português e preserva ausências",
  { skip: !RUN },
  async () => {
    const browser = await launch();
    try {
      const { page, context } = await openPage(browser, adminCookie);
      await page.getByText("UXF1A23").waitFor();
      const row = page.getByRole("row").filter({ hasText: "UXF1A23" });
      assert.match(await row.textContent(), /Disponível/);
      await row.getByRole("button", { name: "Abrir veículo" }).click();
      await page.getByRole("tab", { name: "Histórico e custos" }).click();
      await page.getByText("R$ 187,50").first().waitFor();
      const text = await page
        .getByRole("heading", { name: "Frota e histórico por veículo" })
        .locator("..")
        .textContent();
      assert.match(text, /Preventiva/);
      assert.match(text, /CRLV/);
      assert.match(text, /Vencimento ausente/);
      assert.doesNotMatch(text, /01\/01\/1970/);
      assert.match(text, /R\$ 0,00|R\$ 187,50/);
      await context.close();
    } finally {
      await browser.close();
    }
  },
);

test(
  "browser: 390px não transborda e todo controle de formulário tem rótulo",
  { skip: !RUN },
  async () => {
    const browser = await launch();
    try {
      const { page, context } = await openPage(browser, adminCookie, {
        width: 390,
        height: 844,
      });
      await page.getByText("UXF1A23").waitFor();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      assert.ok(overflow <= 1, `transbordo de ${overflow}px`);
      await page.getByRole("tab", { name: "Cadastrar veículo" }).click();
      const missing = await page
        .getByRole("heading", { name: "Frota e histórico por veículo" })
        .locator("..")
        .locator("input, select, textarea")
        .evaluateAll((nodes) =>
          nodes.filter((node) => !node.labels?.length).map((node) => node.id),
        );
      assert.deepEqual(missing, []);
      await context.close();
    } finally {
      await browser.close();
    }
  },
);
