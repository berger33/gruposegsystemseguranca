import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const IDS = ['01','02','03','04','05','06','07','08','09','10'];

test('UX-PRO-08C faixa de prévia declara prévia × publicação sem tocar no fluxo', async () => {
  const notice = await read('src/components/SitePreviewNotice.tsx');
  assert.match(notice, /data-testid="site-preview-notice"/);
  assert.match(notice, /Prévia interna/);
  assert.match(notice, /não é o site público/);
  assert.match(notice, /\/admin\/aparencia/);
  assert.match(notice, /invalidRequested/);
  assert.doesNotMatch(notice, /style=\{\{/);
  const css = await read('src/components/SitePreviewNotice.module.css');
  assert.match(css, /--ux-color-focus/);
  assert.match(css, /min-height: 44px/);
});

test('UX-PRO-08C as 11 rotas de prévia exibem a faixa e são noindex', async () => {
  for (const id of IDS) {
    const page = await read(`src/app/layout-${id}/page.tsx`);
    assert.match(page, new RegExp(`<SitePreviewNotice visual="${id}"`), `layout-${id} sem faixa`);
    assert.match(page, /robots: \{ index: false, follow: false \}/, `layout-${id} sem noindex`);
  }
  const preview = await read('src/app/layout-preview/page.tsx');
  assert.match(preview, /<SitePreviewNotice/);
  assert.match(preview, /invalidRequested/);
  assert.match(preview, /robots:\{index:false,follow:false\}/);
});

test('UX-PRO-08C galeria distingue ativo × comparação junto à prévia e preserva a publicação', async () => {
  const gallery = await read('src/components/AppearanceGallery.tsx');
  assert.match(gallery, /data-testid="appearance-preview-state"/);
  assert.match(gallery, /Layout ativo no site/);
  assert.match(gallery, /Em comparação — ainda não publicado/);
  // Fluxo de publicação preservado: confirmação, motivo, concorrência e concessão.
  assert.match(gallery, /Revisar e aplicar/);
  assert.match(gallery, /expectedVisual:active/);
  assert.match(gallery, /site\.visual\.write/);
  assert.match(gallery, /method:'PUT'/);
});

test('UX-PRO-08D evidências e resumo.json das três superfícies cobrem 320/390/768/1440px, tema dia/noite, teclado e reconciliação de contagens', async () => {
  const specs = [
    {
      dir: 'docs/ux-pro-08-conhecimento-evidencias',
      stage: 'ux-pro-08-conhecimento',
      expectedPngCount: 12,
      routes: ['/admin/conhecimento'],
      nightRoutes: ['/admin/conhecimento'],
    },
    {
      dir: 'docs/ux-pro-08-assistentes-evidencias',
      stage: 'ux-pro-08-assistentes',
      expectedPngCount: 35,
      routes: ['/admin/marcelo/assistente', '/admin/rh/assistente', '/cliente/app/assistente'],
      nightRoutes: ['/admin/marcelo/assistente', '/admin/rh/assistente'],
    },
    {
      dir: 'docs/ux-pro-08-aparencia-evidencias',
      stage: 'ux-pro-08-aparencia',
      expectedPngCount: 23,
      routes: ['/admin/aparencia', '/layout-preview', '/layout-03'],
      nightRoutes: ['/admin/aparencia'],
    },
  ];

  for (const spec of specs) {
    const absDir = path.join(root, spec.dir);
    const files = await readdir(absDir);
    const pngs = files.filter(f => f.endsWith('.png'));
    const summary = JSON.parse(await read(`${spec.dir}/resumo.json`));
    assert.equal(summary.stage, spec.stage, `${spec.dir}: stage canônico`);
    assert.ok(Array.isArray(summary.entries), `${spec.dir}: entries[] presente`);
    assert.equal(pngs.length, spec.expectedPngCount, `${spec.dir}: contagem exata de PNGs em disco`);
    assert.equal(summary.entries.length, pngs.length, `${spec.dir}: entries.length reconciliado com PNGs em disco`);

    for (const route of spec.routes) {
      const routeEntries = summary.entries.filter(e => e.route === route);
      for (const prefix of ['320x', '390x', '768x', '1440x']) {
        assert.ok(
          routeEntries.some(e => String(e.viewport || '').startsWith(prefix)),
          `${spec.dir} (${route}): captura ${prefix} presente`,
        );
      }
      assert.ok(
        routeEntries.some(e => e.firstFocus === true && Array.isArray(e.percursoTeclado) && e.percursoTeclado.length > 0),
        `${spec.dir} (${route}): percursoTeclado e firstFocus registrados`,
      );
    }

    for (const nightRoute of spec.nightRoutes) {
      const nightEntry = summary.entries.find(e => e.route === nightRoute && e.theme === 'night' && String(e.viewport || '').startsWith('768x'));
      assert.ok(nightEntry, `${spec.dir} (${nightRoute}): entrada 768x1024 night presente`);
      assert.ok(Array.isArray(nightEntry.problems) && nightEntry.problems.length > 0, `${spec.dir} (${nightRoute}): resíduo noturno registrado em problems[]`);
    }
  }
});

