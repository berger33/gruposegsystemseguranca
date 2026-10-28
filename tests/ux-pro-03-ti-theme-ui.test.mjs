import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-03 — prova focal da aba "Aparência do site". ThemeClient é um adapter
// de três linhas: a prova real está na galeria que ele monta. Sem este teste a
// aba ficava fora do critério "com prova" da decisão de 02/10.
const component = await readFile(new URL('../src/app/admin/ti/ThemeClient.tsx', import.meta.url), 'utf8');
const gallery = await readFile(new URL('../src/components/AppearanceGallery.tsx', import.meta.url), 'utf8');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const server = (await readFile(new URL('../server.mjs', import.meta.url), 'utf8')).replace(/\\\//g, '/');

test('UX-PRO-03 aparência: aba montada, rótulo próprio e delegação sem duplicar regra', () => {
  assert.match(consoleClient, /\['visual','Tema e aparência'\]/);
  assert.match(consoleClient, /active==='visual'&&<ThemeClient\/>/);
  assert.match(consoleClient, /const ThemeClient=dynamic\(\(\)=>import\('\.\/ThemeClient'\)\)/);
  assert.match(consoleClient, /key==='visual'\?'Aparência do site':label/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
  assert.match(component, /import AppearanceGallery from '@\/components\/AppearanceGallery'/);
  assert.match(component, /return <AppearanceGallery\/>/);
  assert.equal((component.match(/fetch\(/g) || []).length, 0,
    'o adapter não deve reimplementar chamadas de API');
});

test('UX-PRO-03 aparência: consulta e publicação mantêm permissão, confirmação e auditoria', () => {
  for (const endpoint of ['/api/admin/site-visual', '/api/site-visual']) {
    assert.ok(gallery.includes(endpoint), `a galeria precisa chamar ${endpoint}`);
    assert.ok(server.includes(endpoint), `server.mjs precisa despachar ${endpoint}`);
  }
  assert.match(gallery, /method:'PUT'/);
  assert.match(gallery, /expectedVisual:active/, 'a publicação precisa ser concorrente/otimista');
  assert.match(gallery, /visual_changed_refresh/, 'concorrência precisa de mensagem específica');
  assert.match(gallery, /site\.visual\.write/, 'a permissão de publicação precisa ser nomeada');
  assert.match(gallery, /setCanManage\(false\)/, 'falha de leitura não pode liberar publicação');
  assert.match(gallery, /minLength=\{10\}/, 'o motivo da mudança precisa de conteúdo mínimo');
  assert.match(gallery, /disabled=\{busy\|\|!checked\|\|reason\.trim\(\)\.length<10\}/,
    'a confirmação exige checkbox e motivo');
  assert.match(gallery, /disabled=\{!canManage\|\|loading\|\|busy\|\|active===selected\}/);
  assert.match(gallery, /registrada na auditoria/);
});

test('UX-PRO-03 aparência: estados de leitura, erro e prévia são honestos', () => {
  assert.match(gallery, /aria-busy=\{busy\|\|loading\}/);
  assert.match(gallery, /role="status"/);
  assert.match(gallery, /role="alert"/);
  assert.match(gallery, /A prévia não altera o site/);
  assert.match(gallery, /As miniaturas são esquemas\. A janela abaixo renderiza o layout real\./);
  assert.match(gallery, /Consultando configuração…/);
  assert.match(gallery, /Não foi possível consultar a configuração/);
  assert.match(gallery, /<iframe[^>]*title=\{`Prévia do layout/);
  assert.match(gallery, /<dialog/, 'a confirmação precisa ser um diálogo nativo');
});
