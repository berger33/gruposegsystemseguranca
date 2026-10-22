#!/usr/bin/env node
// Capturas automatizadas da rota montada com sessão e API sintéticas interceptadas.
// Requer app Next compilado em UX_PRO_04_BASE_URL; não autentica nem grava dados.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.UX_PRO_04_BASE_URL || "http://127.0.0.1:3400";
const outputDir = path.resolve("docs/evidencias/ux-pro-04-relatorios-2026-10-21");
const viewports = [
  { name: "320", width: 320, height: 900 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
];
const report = {
  id: "22222222-2222-4222-8222-222222222222",
  protocol: "RPT-2026-0001",
  title: "Resumo comercial do período",
  report_type: "comercial",
  period_start: "2026-10-01",
  period_end: "2026-10-20",
  status: "gerado",
  totals: { sources: { public_leads: 3, crm_contacts: 2 } },
  total_records: 5,
  recipient_emails: ["equipe.sintetica@example.invalid"],
  generated_at: "2026-10-21T12:00:00.000Z",
  sent_at: null,
  approved_at: "2026-10-21T11:00:00.000Z",
  created_at: "2026-10-20T12:00:00.000Z",
  approval_note: "Justificativa sintética para evidência automatizada.",
  send_note: null,
};
const events = [{
  id: "33333333-3333-4333-8333-333333333333",
  event_type: "report_generated",
  summary: "Contagem sintética para captura automatizada; nenhum total real consultado.",
  created_at: "2026-10-21T12:00:00.000Z",
}];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const browserErrors = [];

async function installMocks(page) {
  let failNextList = false;
  await page.route("**/api/admin/session", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ role: "ti", identityId: "11111111-1111-4111-8111-111111111111", mfaVerified: true, expiresAt: "2026-10-22T00:00:00.000Z" }),
  }));
  await page.route("**/api/ext/reports/periodic", async route => {
    if (route.request().method() !== "GET") return route.fulfill({ status: 405, body: "" });
    if (failNextList) {
      failNextList = false;
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "database_error" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ ...report }] }) });
  });
  await page.route("**/api/ext/reports/periodic/*", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ report: { ...report }, events }),
  }));
  return { failNextList: () => { failNextList = true; } };
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, locale: "pt-BR", colorScheme: "light" });
    const page = await context.newPage();
    page.on("pageerror", error => browserErrors.push({ viewport: viewport.name, error: error.message.slice(0, 240) }));
    const mocks = await installMocks(page);
    const response = await page.goto(`${baseUrl}/admin/relatorios`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Relatórios periódicos" }).waitFor();
    await page.getByText(report.title, { exact: true }).first().waitFor();
    await page.getByRole("heading", { name: "Fontes e contagens" }).waitFor();
    await page.evaluate(() => {
      const label = document.createElement("aside");
      label.textContent = "Evidência QA · dados sintéticos · sem persistência";
      label.setAttribute("aria-label", "Aviso de captura automatizada com dados sintéticos");
      label.style.cssText = "position:relative;z-index:20;margin:8px auto;padding:6px 10px;width:max-content;max-width:calc(100% - 16px);border:1px solid #8a5b00;border-radius:6px;background:#fff2cc;color:#493000;font:700 12px/1.3 system-ui,sans-serif;text-align:center";
      document.body.prepend(label);
    });

    const day = await page.evaluate(() => ({
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      theme: document.documentElement.dataset.adminTheme || "day",
    }));
    const dayImage = `relatorios-${viewport.name}-dia.png`;
    await page.screenshot({ path: path.join(outputDir, dayImage), fullPage: true });
    results.push({ viewport: viewport.name, theme: "dia", status: response?.status() ?? null, screenshot: dayImage, ...day });

    await page.getByRole("button", { name: "Ativar modo noite" }).click();
    await page.waitForFunction(() => document.documentElement.dataset.adminTheme === "night");
    const night = await page.evaluate(() => ({
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      theme: document.documentElement.dataset.adminTheme || "day",
    }));
    const nightImage = `relatorios-${viewport.name}-noite.png`;
    await page.screenshot({ path: path.join(outputDir, nightImage), fullPage: true });
    results.push({ viewport: viewport.name, theme: "noite", status: response?.status() ?? null, screenshot: nightImage, ...night });

    if (viewport.name === "390") {
      mocks.failNextList();
      await page.getByRole("button", { name: "Atualizar relatórios" }).click();
      await page.getByText("A atualização falhou; os dados abaixo são da última leitura válida.").waitFor();
      await page.getByText(report.title, { exact: true }).first().waitFor();
      const staleImage = "relatorios-390-noite-falha-releitura.png";
      await page.screenshot({ path: path.join(outputDir, staleImage), fullPage: true });
      results.push({ viewport: "390", theme: "noite", state: "falha de releitura; dado anterior preservado", screenshot: staleImage });

      await page.getByRole("button", { name: "Tentar novamente" }).first().click();
      await page.getByText("A atualização falhou; os dados abaixo são da última leitura válida.").waitFor({ state: "hidden" });
      const approval = page.getByRole("button", { name: "Registrar aprovação com justificativa" });
      if (!(await approval.isDisabled())) throw new Error("approval_enabled_without_operator_note");
      await page.getByLabel("Justificativa da aprovação (mínimo de 10 caracteres)").fill("Nota sintética escrita para testar validação.");
      if (await approval.isDisabled()) throw new Error("approval_stays_disabled_after_note");
      await page.getByLabel("Título").focus();
      await page.keyboard.press("Tab");
      const keyboard = await page.evaluate(() => ({
        activeLabel: document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim() || document.activeElement?.tagName || null,
        outlineStyle: getComputedStyle(document.activeElement).outlineStyle,
        outlineWidth: getComputedStyle(document.activeElement).outlineWidth,
      }));
      if (keyboard.outlineStyle === "none" || keyboard.outlineWidth === "0px") throw new Error("visible_keyboard_focus_missing");
      const keyboardImage = "relatorios-390-teclado.png";
      await page.screenshot({ path: path.join(outputDir, keyboardImage), fullPage: true });
      results.push({ viewport: "390", state: "nota explícita habilita aprovação; Tab com foco visível", screenshot: keyboardImage, ...keyboard });
    }
    await context.close();
  }

  if (browserErrors.length) throw new Error(`browser_errors_${JSON.stringify(browserErrors)}`);
  if (results.some(result => result.horizontalOverflow)) throw new Error("horizontal_overflow_detected");
  const summary = {
    stage: "ux-pro-04-relatorios",
    generatedAt: new Date().toISOString(),
    baseUrl,
    method: "Automated Playwright Chromium with synthetic API fixture and mocked ti session; no product records written; not human review or acceptance.",
    viewports: viewports.map(({ name, width, height }) => ({ name, width, height })),
    routes: results.map(result => ({ ...result, route: "/admin/relatorios" })),
    browserErrors,
    limitations: [
      "Session and EXT-13 responses were intercepted synthetic fixtures; production authentication, data and persistence were not tested by these captures.",
      "The PostgreSQL EXT-13 gate separately exercised real HTTP, RBAC, idempotency, audit and transaction behavior.",
      "Automated screenshots and focus checks are not manual visual/keyboard review, a complete WCAG audit or human acceptance.",
    ],
  };
  await writeFile(path.join(outputDir, "resumo.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ screenshots: results.filter(result => result.screenshot).length, browserErrors: browserErrors.length, summary: path.join(outputDir, "resumo.json") }, null, 2));
} finally {
  await browser.close();
}
