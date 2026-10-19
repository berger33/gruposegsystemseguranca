#!/usr/bin/env node
// Reproducible browser evidence for the mounted site-layout previews.
// Requires a running local Next dev server at UX_PRO_10B_BASE_URL (default 3000).
// The script does not authenticate or change publication settings.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.UX_PRO_10B_BASE_URL || 'http://127.0.0.1:3000';
const outputDir = path.resolve('docs/ux-pro-10b-evidencias-2026-10-18');
const viewports = [
  { name: '320', width: 320, height: 900 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.UX_PRO_10B_BROWSER_CHANNEL || 'chrome' });
const results = [];
const errors = [];
try {
  for (const visual of Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, '0'))) {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, locale: 'pt-BR', colorScheme: 'light' });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      page.on('pageerror', error => errors.push({ visual, viewport: viewport.name, error: error.message.slice(0, 240) }));
      const route = `/layout-preview?visual=${visual}`;
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
      if (visual === '01') {
        const frame = page.locator('iframe[title="Layout 01 — Institucional clássica"]');
        await frame.waitFor({ state: 'visible' });
        await page.frameLocator('iframe').getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible' });
      } else {
        await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible' });
      }
      const metrics = await page.evaluate(() => ({
        title: document.title,
        heading: document.querySelector('h1')?.textContent?.trim() || null,
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        iframeCount: document.querySelectorAll('iframe').length,
        previewNotice: Boolean(document.querySelector('[data-testid="site-preview-notice"]')),
      }));
      if (visual === '01') {
        metrics.heading = await page.frameLocator('iframe').getByRole('heading', { level: 1 }).first().innerText();
      }
      const screenshot = `layout-${visual}-${viewport.name}.png`;
      await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: false });
      results.push({ route, viewport: viewport.name, status: response?.status() ?? null, screenshot, ...metrics });
      await context.close();
    }
  }

  // The standalone export is the only iframe-based preview; measure its real
  // keyboard boundary separately in the parent and child browsing contexts.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  const page = await context.newPage();
  const response = await page.goto(`${baseUrl}/layout-01`, { waitUntil: 'domcontentloaded' });
  await page.locator('iframe[title="Layout 01 — Institucional clássica"]').waitFor({ state: 'visible' });
  await page.keyboard.press('Tab');
  const firstFocus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, href: document.activeElement?.getAttribute('href') }));
  await page.keyboard.press('Tab');
  const secondFocus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, href: document.activeElement?.getAttribute('href') }));
  await page.keyboard.press('Tab');
  const iframeFocus = await page.evaluate(() => {
    const frame = document.querySelector('iframe');
    let inner = null;
    try { inner = frame?.contentDocument?.activeElement; } catch {}
    return {
      parentActiveTag: document.activeElement?.tagName,
      parentActiveIsIframe: document.activeElement === frame,
      childActiveTag: inner?.tagName || null,
      childActiveHref: inner?.getAttribute?.('href') || null,
    };
  });
  await page.keyboard.press('Shift+Tab');
  const reverseFocus = await page.evaluate(() => ({
    parentActiveTag: document.activeElement?.tagName,
    parentActiveHref: document.activeElement?.getAttribute('href'),
    parentActiveIsIframe: document.activeElement === document.querySelector('iframe'),
  }));
  await page.screenshot({ path: path.join(outputDir, 'layout-01-iframe-1440.png'), fullPage: false });
  results.push({
    route: '/layout-01', viewport: '1440', status: response?.status() ?? null,
    firstFocus: Boolean(firstFocus?.tag && secondFocus?.tag && iframeFocus.parentActiveIsIframe),
    percursoTeclado: [
      `parent ${firstFocus?.tag || 'sem foco'} href=${firstFocus?.href || ''}`,
      `parent ${secondFocus?.tag || 'sem foco'} href=${secondFocus?.href || ''}`,
      `iframe ${iframeFocus.childActiveTag || 'sem foco'} href=${iframeFocus.childActiveHref || ''}`,
      `Shift+Tab parent ${reverseFocus.parentActiveTag || 'sem foco'} href=${reverseFocus.parentActiveHref || ''}`,
    ],
    firstFocusTarget: firstFocus,
    secondFocusTarget: secondFocus,
    iframeFocus,
    reverseFocus,
    screenshot: 'layout-01-iframe-1440.png',
  });
  await context.close();

  const summary = {
    stage: 'ux-pro-10b',
    generatedAt: new Date().toISOString(),
    baseUrl,
    method: 'Automated Playwright Chromium browser inspection; no authentication; no manual human validation.',
    viewports: viewports.map(({ name, width, height }) => ({ name, width, height })),
    routes: results,
    browserErrors: errors,
    limitations: [
      'The /admin/aparencia authenticated gallery and its day/night controls were not exercised; no user credentials or session were supplied.',
      'Public color-mode CSS is not equivalent to a product-operated theme switch; no publication setting was changed.',
      'Automated focus traversal is not manual keyboard acceptance or a complete WCAG audit.',
    ],
  };
  await writeFile(path.join(outputDir, 'resumo-layouts.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ screenshots: results.length, browserErrors: errors.length, summary: path.join(outputDir, 'resumo-layouts.json') }, null, 2));
} finally {
  await browser.close();
}
