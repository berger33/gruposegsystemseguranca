import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
