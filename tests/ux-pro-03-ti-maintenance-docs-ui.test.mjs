import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-03 — 2ª promoção "com prova": PLT-18, documentação de manutenção.
// Mesmo critério de 02/10 aplicado a PLT-14. Executar antes da reescrita do
// protótipo: na base este teste precisa falhar (RED).
const component = await readFile(new URL('../src/app/admin/ti/MaintenanceDocClient.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/MaintenanceDocClient.module.css', import.meta.url), 'utf8')
  .catch(() => '');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/server/maintenance-doc-api.mjs', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

const ENDPOINTS = [
  '/api/admin/maintenance/docs',
  '/api/admin/maintenance/docs/${id}',
];

test('UX-PRO-03 PLT-18: a família deixa de ser órfã e ganha aba real no console', () => {
  assert.match(consoleClient, /\['manutencao','Documentação de manutenção'\]/);
  assert.match(consoleClient, /const MaintenanceDocClient=dynamic\(\(\)=>import\('\.\/MaintenanceDocClient'\)\)/);
  assert.match(consoleClient, /active==='manutencao'&&<MaintenanceDocClient\/>/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
  assert.match(consoleClient, /'saude','observacao','incidentes','integracoes','dependencias','manutencao'/);
});

test('UX-PRO-03 PLT-18: os dois contratos, os métodos e o papel admin/ti são preservados', () => {
  for (const endpoint of ENDPOINTS) {
    assert.ok(component.includes(endpoint), `o componente precisa continuar chamando ${endpoint}`);
  }
  assert.ok(server.includes('/api/admin/maintenance/docs'), 'server.mjs precisa continuar despachando a família');
  assert.match(server, /maintDocByIdMatch = url\.pathname\.match/);
  assert.match(server, /maintenanceDocApi\.handleDocById/);
  const roleChecks = api.match(/requireRole\(sess,\['admin','ti'\]\)/g) || [];
  assert.equal(roleChecks.length, 2, 'lista e detalhe precisam decidir o papel no servidor');
  // PLT-18: o uuidRe tinha só 4 grupos (8-4-4-12) e recusava TODO uuid válido
  // com 400 invalid_id, tornando detalhe/histórico inalcançáveis. Corrigido
  // nesta fatia; esta asserção impede a regressão.
  assert.match(api, /function uuidRe\(\)\{ return \/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$\/i; \}/);
  // Publicar com status='publicado' + publish=true duplicava is_published no
  // SET e o PostgreSQL recusava o UPDATE. O dedupe precisa continuar.
  assert.match(api, /if\(publish && next_status!=='publicado'\)/);
  for (const method of ['POST', 'PATCH']) assert.ok(component.includes(`"${method}"`), `método ${method} preservado`);
  for (const action of ['Registrar documento', 'Publicar', 'Nova versão', 'Abrir']) assert.ok(component.includes(action));
});

test('UX-PRO-03 PLT-18: leitura por estado honesto, payload validado e sem atalhos de DOM', () => {
  for (const variant of ['loading', 'empty', 'error', 'denied']) {
    assert.ok(component.includes(`variant="${variant}"`) || component.includes(`variant: '${variant}'`),
      `estado ${variant} precisa ser distinto`);
  }
  assert.match(component, /onRetry=\{/);
  assert.match(component, /aria-busy=/);
  assert.match(component, /Array\.isArray/);
  assert.match(component, /sequence/);
  // Comentários descrevem o defeito antigo e citam o antipadrão: avaliar só código.
  const codeOnly = component.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(codeOnly, /\balert\(/);
  assert.doesNotMatch(codeOnly, /\bprompt\(/);
  assert.doesNotMatch(codeOnly, /document\.getElementById/);
  assert.doesNotMatch(codeOnly, /style=\{\{/);
});

test('UX-PRO-03 PLT-18: fonte, data-base, versões e drill-down com tema responsivo', () => {
  assert.match(component, /Fonte:/);
  assert.match(component, /data-base|Data-base|dataBase/);
  assert.match(component, /<details/);
  assert.match(component, /published_at/);
  assert.match(component, /change_summary/);
  assert.match(component, /role="status"/);
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted', '--ux-color-border', '--ux-color-focus', '--ux-color-error', '--ux-color-warning', '--ux-color-success']) {
    assert.ok(styles.includes(token), `o CSS module precisa usar ${token}`);
  }
  for (const breakpoint of ['@media(max-width:900px)', '@media(max-width:650px)']) assert.ok(styles.includes(breakpoint));
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});
