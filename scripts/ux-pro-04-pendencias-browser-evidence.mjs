#!/usr/bin/env node
// Capturas automatizadas da tela montada com respostas sintéticas interceptadas.
// Requer uma aplicação Next já compilada em UX_PRO_04_BASE_URL; não autentica nem grava dados.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.UX_PRO_04_BASE_URL || "http://127.0.0.1:3400";
const outputDir = path.resolve("docs/evidencias/ux-pro-04-pendencias-2026-10-21");
const viewports = [
  { name: "320", width: 320, height: 900 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
];
const fixture = [
  {
    id: "22222222-2222-4222-8222-222222222222", source_module: "ext07_action_plan", source_id: "33333333-3333-4333-8333-333333333333",
    title: "Plano de ação de compliance em atraso", summary: "Registro sintético para validar a leitura de prioridade, prazo e próxima ação.",
    criticality: "alta", due_date: "2026-10-20", status: "nao_lida", archive_note: null, read_at: null, archived_at: null, created_at: "2026-10-19T13:00:00.000Z",
  },
  {
    id: "44444444-4444-4444-8444-444444444444", source_module: "ext07_task", source_id: "55555555-5555-4555-8555-555555555555",
    title: "Tarefa crítica de conformidade", summary: "Segunda pendência sintética, usada para conferir a ordem por estado e criticidade.",
    criticality: "critica", due_date: "2026-10-22", status: "nao_lida", archive_note: null, read_at: null, archived_at: null, created_at: "2026-10-20T13:00:00.000Z",
  },
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const browserErrors = [];

async function installMocks(page, { empty = false, delayed = false } = {}) {
  let listRequests = 0;
  let failNextList = false;
  let currentItems = empty ? [] : fixture.map(item => ({ ...item }));
  await page.route("**/api/admin/session", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ role: "marcelo", identityId: "11111111-1111-4111-8111-111111111111", mfaVerified: true, expiresAt: "2026-10-22T00:00:00.000Z" }),
  }));
  await page.route("**/api/ops/pendencies", async route => {
    if (route.request().method() !== "GET") return route.fulfill({ status: 405, body: "" });
    listRequests += 1;
    if (delayed && listRequests === 1) await new Promise(resolve => setTimeout(resolve, 700));
    if (failNextList) {
      failNextList = false;
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "pendency_unavailable" }) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: currentItems, unread: currentItems.filter(item => item.status === "nao_lida").length }),
    });
  });
  await page.route("**/api/ops/pendencies/sweep", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0 }) }));
  await page.route("**/api/ops/pendencies/*/*", async route => {
    const [, id, action] = new URL(route.request().url()).pathname.match(/\/api\/ops\/pendencies\/([^/]+)\/(read|archive)$/) || [];
    if (id && action === "read") currentItems = currentItems.map(item => item.id === id ? { ...item, status: "lida" } : item);
    if (id && action === "archive") {
      const body = route.request().postDataJSON();
      currentItems = currentItems.map(item => item.id === id ? { ...item, status: "arquivada", archive_note: body.note } : item);
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  return { failNextList: () => { failNextList = true; } };
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, locale: "pt-BR", colorScheme: "light" });
    const page = await context.newPage();
    page.on("pageerror", error => browserErrors.push({ viewport: viewport.name, error: error.message.slice(0, 240) }));
    const mocks = await installMocks(page);
    const response = await page.goto(`${baseUrl}/admin/pendencias`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Minhas pendências" }).waitFor();
    await page.getByText("Plano de ação de compliance em atraso", { exact: true }).waitFor();
    const order = await page.locator("article h2").allTextContents();
    if (order[0] !== "Tarefa crítica de conformidade") throw new Error(`priority_order_failed_${viewport.name}`);

    const day = await page.evaluate(() => ({
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      theme: document.documentElement.dataset.adminTheme || "day",
      focused: document.activeElement?.tagName || null,
    }));
    const dayImage = `pendencias-${viewport.name}-dia.png`;
    await page.screenshot({ path: path.join(outputDir, dayImage), fullPage: true });
    results.push({ viewport: viewport.name, theme: "dia", status: response?.status() ?? null, screenshot: dayImage, ...day, priorityOrder: order });

    await page.getByRole("button", { name: "Ativar modo noite" }).click();
    await page.waitForFunction(() => document.documentElement.dataset.adminTheme === "night");
    const night = await page.evaluate(() => ({
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      theme: document.documentElement.dataset.adminTheme || "day",
    }));
    const nightImage = `pendencias-${viewport.name}-noite.png`;
    await page.screenshot({ path: path.join(outputDir, nightImage), fullPage: true });
    results.push({ viewport: viewport.name, theme: "noite", status: response?.status() ?? null, screenshot: nightImage, ...night });

    if (viewport.name === "1440") {
      const card = page.locator("article").filter({ hasText: "Plano de ação de compliance em atraso" });
      await card.getByRole("button", { name: "Marcar como lida" }).click();
      await page.getByText("Pendência marcada como lida.").waitFor();
      await card.getByText("Lida", { exact: true }).waitFor();
      results.push({ viewport: "1440", state: "ação de leitura e releitura visual", verified: true });
    }

    if (viewport.name === "390") {
      mocks.failNextList();
      await page.getByRole("button", { name: "Atualizar pendências" }).click();
      await page.getByText("A atualização falhou; os dados anteriores continuam visíveis.").waitFor();
      await page.getByText("Plano de ação de compliance em atraso", { exact: true }).waitFor();
      await page.screenshot({ path: path.join(outputDir, "pendencias-390-noite-falha-releitura.png"), fullPage: true });
      results.push({ viewport: "390", theme: "noite", state: "falha de releitura; dado anterior preservado", screenshot: "pendencias-390-noite-falha-releitura.png" });

      await page.getByRole("button", { name: "Tentar novamente" }).click();
      await page.getByText("A atualização falhou; os dados anteriores continuam visíveis.").waitFor({ state: "hidden" });
      await page.getByLabel("Justificativa do arquivamento").first().focus();
      await page.keyboard.press("Tab");
      const keyboard = await page.evaluate(() => ({
        activeTag: document.activeElement?.tagName || null,
        activeText: document.activeElement?.textContent?.trim() || null,
        outlineStyle: getComputedStyle(document.activeElement).outlineStyle,
        outlineWidth: getComputedStyle(document.activeElement).outlineWidth,
      }));
      if (keyboard.outlineStyle === "none" || keyboard.outlineWidth === "0px") throw new Error("visible_keyboard_focus_missing");
      const keyboardImage = "pendencias-390-teclado.png";
      await page.screenshot({ path: path.join(outputDir, keyboardImage), fullPage: true });
      results.push({
        viewport: "390", theme: "dia", percursoTeclado: ["Justificativa do arquivamento focada", "Tab → Marcar como lida com contorno de foco visível"],
        screenshot: keyboardImage, ...keyboard,
      });
    }
    await context.close();
  }

  const emptyContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "pt-BR" });
  const emptyPage = await emptyContext.newPage();
  await installMocks(emptyPage, { empty: true, delayed: true });
  await emptyPage.goto(`${baseUrl}/admin/pendencias`, { waitUntil: "domcontentloaded" });
  await emptyPage.getByRole("status").getByText("Carregando suas pendências…").waitFor();
  if (await emptyPage.getByText("Nenhuma pendência registrada", { exact: false }).count()) throw new Error("empty_before_confirmed_read");
  const loadingImage = "pendencias-390-carregando.png";
  await emptyPage.screenshot({ path: path.join(outputDir, loadingImage), fullPage: true });
  results.push({ viewport: "390", state: "carregamento inicial; vazio não antecipado", screenshot: loadingImage });
  await emptyPage.getByText("Nenhuma pendência registrada", { exact: false }).waitFor();
  const emptyImage = "pendencias-390-vazio-confirmado.png";
  await emptyPage.screenshot({ path: path.join(outputDir, emptyImage), fullPage: true });
  results.push({ viewport: "390", state: "vazio após resposta confirmada", screenshot: emptyImage });
  await emptyContext.close();

  if (browserErrors.length) throw new Error(`browser_errors_${JSON.stringify(browserErrors)}`);
  if (results.some(result => result.horizontalOverflow)) throw new Error("horizontal_overflow_detected");
  const summary = {
    stage: "ux-pro-04-pendencias",
    generatedAt: new Date().toISOString(),
    baseUrl,
    method: "Automated Playwright Chromium browser with synthetic API fixtures; mocked staff session; no product records written; not human review or acceptance.",
    viewports: viewports.map(({ name, width, height }) => ({ name, width, height })),
    routes: results.map(result => ({
      ...result,
      route: "/admin/pendencias",
      ...(result.theme === "dia" ? { requestedTheme: "light" } : result.theme === "noite" ? { requestedTheme: "dark" } : {}),
    })),
    browserErrors,
    limitations: [
      "The fixtures are synthetic and intercepted in the browser; no authenticated production or PostgreSQL UI session was used.",
      "The PostgreSQL gate separately exercised real F15 APIs, permissions, identity isolation, idempotency, audit and transactions.",
      "Automated focus traversal and CSS inspection do not constitute manual keyboard review, WCAG audit or human acceptance.",
    ],
  };
  await writeFile(path.join(outputDir, "resumo.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ screenshots: results.filter(result => result.screenshot).length, browserErrors: browserErrors.length, summary: path.join(outputDir, "resumo.json") }, null, 2));
} finally {
  await browser.close();
}
