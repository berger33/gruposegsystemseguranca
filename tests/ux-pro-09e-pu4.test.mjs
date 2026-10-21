import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { measureTextContrast } from '../scripts/ux-evidence-text-contrast.mjs';

const script = await readFile(new URL('../scripts/ux-evidence-capture.mjs', import.meta.url), 'utf8');
const helper = await readFile(new URL('../scripts/ux-evidence-text-contrast.mjs', import.meta.url), 'utf8');

test('UX-PRO-09E PU4: stage mantém medição textual abrangente e opt-in', () => {
  const stage = /'ux-pro-09e':\s*\{([\s\S]*?)\n\s*\},\n\s*};/.exec(script)?.[1] || '';
  assert.match(stage, /fullTextContrastSamples:\s*true/,
    'somente o estágio 09E deve ativar amostras de nós de texto');
  assert.match(helper, /function measureTextContrast\s*\(/,
    'a medição ampliada deve ser isolada para poder ser focalmente verificada');
  assert.match(helper, /not-measured/,
    'ausência de amostra deve ter estado explícito, nunca virar aprovação');
  assert.match(helper, /unmeasuredVisibleTextCount/,
    'o resumo precisa contabilizar texto visível sem medição');
  assert.match(script, /textContrast/,
    'a nova saída deve ser aditiva e não substituir o contrato contrast.samples existente');
});

test('UX-PRO-09E PU4: etapas não 09E não ativam as amostras ampliadas', () => {
  const active = [...script.matchAll(/fullTextContrastSamples:\s*true/g)];
  assert.equal(active.length, 1);
  assert.match(script, /fullTextContrastSamples === true/,
    'a execução deve depender da opção do plano, não afetar todos os estágios');
  assert.match(script, /path\.resolve\(root, path\.dirname\(entry\.screenshot\)\) === path\.resolve\(root, directory\)/,
    'o resumo precisa reter as capturas também quando os caminhos usam separadores Windows');
  assert.match(script, /process\.platform/,
    'a limitação do navegador/plataforma precisa descrever o ambiente executado');
});

test('UX-PRO-09E PU4: Chromium mede tags/classes omitidas e explicita fundo indeterminado', async () => {
  const browser = await playwrightChromium.launch({
    ...(process.platform === 'win32' && existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
      ? { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }
      : { args: packagedChromium.args, executablePath: await packagedChromium.executablePath() }),
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><html><body style="background:#fff;color:#222">
      <dl><dt>Período do relatório</dt></dl><span>texto isolado</span>
      <footer>Rodapé de privacidade</footer><div class="field"><span>Campo adicional</span></div>
      <p class="hint">Ajuda contextual</p><p class="error">Erro do formulário</p>
      <p class="gradient" style="background:linear-gradient(#fff,#ddd)">Fundo complexo</p>
      <p style="display:none">Conteúdo oculto</p>
    </body></html>`);
    const result = await page.evaluate(measureTextContrast);
    const texts = result.samples.map(sample => sample.text);
    for (const expected of ['Período do relatório', 'texto isolado', 'Rodapé de privacidade', 'Campo adicional', 'Ajuda contextual', 'Erro do formulário', 'Fundo complexo']) {
      assert.ok(texts.includes(expected), `amostra ausente: ${expected}`);
    }
    assert.equal(texts.includes('Conteúdo oculto'), false);
    assert.equal(result.status, 'measured');
    assert.equal(result.sampleCount, 7);
    assert.equal(result.indeterminateCount, 1);
    assert.equal(result.samples.find(sample => sample.text === 'Fundo complexo').ratio, null);
    assert.equal(result.samples.find(sample => sample.text === 'Campo adicional').selector, 'div.field > span');
  } finally {
    await browser.close();
  }
});

test('UX-PRO-09E PU4: ausência de texto renderizado é "not-measured"', async () => {
  const browser = await playwrightChromium.launch({
    ...(process.platform === 'win32' && existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
      ? { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }
      : { args: packagedChromium.args, executablePath: await packagedChromium.executablePath() }),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body><p style="display:none">Somente oculto</p></body></html>');
    const result = await page.evaluate(measureTextContrast);
    assert.equal(result.status, 'not-measured');
    assert.equal(result.sampleCount, 0);
    assert.equal(result.resolvedCount, 0);
    assert.deepEqual(result.under45, []);
  } finally {
    await browser.close();
  }
});

test('UX-PRO-09E PU4: resumos e integridade referenciam as 112 capturas próprias', async () => {
  const evidenceRoot = new URL('../docs/UX-PRO-09E-PU4-evidencias-2026-10-21/', import.meta.url);
  const summary = JSON.parse(await readFile(new URL('resumo.json', evidenceRoot), 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('integridade.json', evidenceRoot), 'utf8'));
  assert.equal(summary.baseMain, 'fb174f93996944c0b11e64553b4dc81c64a90856');
  assert.equal(summary.totals.routes, 14);
  assert.equal(summary.totals.captures, 112);
  assert.equal(summary.entries.length, 112);
  assert.equal(manifest.algorithm, 'SHA-256');
  assert.equal(manifest.files.length, 112);
  assert.deepEqual(new Set(manifest.files.map(file => file.path)), new Set(summary.entries.map(entry => entry.screenshot)));
  for (const file of manifest.files) {
    const image = await readFile(new URL(`../${file.path}`, import.meta.url));
    assert.equal(image.subarray(1, 4).toString(), 'PNG');
    assert.equal(image.length, file.bytes);
    assert.equal(createHash('sha256').update(image).digest('hex'), file.sha256);
    assert.equal(image.readUInt32BE(16), file.width);
    assert.equal(image.readUInt32BE(20), file.height);
  }
});
