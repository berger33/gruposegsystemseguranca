import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-03 — promoção "com prova" da família PLT-14 (dependências).
// Critério de 02/10: rota real, autorização decidida no servidor, indicador com
// fonte/período/data-base, drill-down ao registro canônico, erro de leitura
// declarado com retry e subteste no gate. Este teste focal é executado antes da
// reescrita do protótipo: na base ele deve falhar (RED).
const component = await readFile(new URL('../src/app/admin/ti/DependencyClient.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/DependencyClient.module.css', import.meta.url), 'utf8')
  .catch(() => '');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/server/dependency-api.mjs', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

const ENDPOINTS = [
  '/api/admin/dependencies/audits',
  '/api/admin/dependencies/vulnerabilities',
  '/api/admin/dependencies/updates',
  '/api/admin/dependencies/lockfile',
];

test('UX-PRO-03 PLT-14: a família deixa de ser órfã e ganha aba real no console', () => {
  assert.match(consoleClient, /\['dependencias','Dependências'\]/);
  assert.match(consoleClient, /const DependencyClient=dynamic\(\(\)=>import\('\.\/DependencyClient'\)\)/);
  assert.match(consoleClient, /active==='dependencias'&&<DependencyClient\/>/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
  assert.match(consoleClient, /'saude','observacao','incidentes','integracoes','dependencias'/);
});

test('UX-PRO-03 PLT-14: os quatro contratos e o papel admin/ti são preservados', () => {
  for (const endpoint of ENDPOINTS) {
    assert.ok(component.includes(endpoint), `o componente precisa continuar chamando ${endpoint}`);
    assert.ok(server.includes(endpoint), `server.mjs precisa continuar despachando ${endpoint}`);
  }
  const roleChecks = api.match(/requireRole\(sess,\['admin','ti'\]\)/g) || [];
  assert.equal(roleChecks.length, 4, 'os quatro handlers precisam decidir o papel no servidor');
  for (const method of ['POST', 'PATCH']) assert.ok(component.includes(`"${method}"`), `o método ${method} precisa continuar disponível`);
  for (const action of ['Aprovar', 'Corrigido', 'Registrar']) assert.ok(component.includes(action));
});

test('UX-PRO-03 PLT-14: leitura por estado honesto, payload validado e sem diálogos nativos', () => {
  for (const variant of ['loading', 'empty', 'error', 'denied']) {
    assert.ok(component.includes(`variant="${variant}"`) || component.includes(`variant: '${variant}'`) || component.includes(`variant: "${variant}"`),
      `estado ${variant} precisa ser distinto`);
  }
  assert.match(component, /onRetry=\{/);
  assert.match(component, /aria-busy=/);
  assert.match(component, /Array\.isArray/);
  assert.match(component, /sequence/);
  assert.doesNotMatch(component, /\balert\(/);
  assert.doesNotMatch(component, /\bprompt\(/);
  assert.doesNotMatch(component, /style=\{\{/);
});

test('UX-PRO-03 PLT-14: fonte, data-base e drill-down, com tema responsivo e foco visível', () => {
  assert.match(component, /Fonte:/);
  assert.match(component, /data-base|Data-base|dataBase/);
  assert.match(component, /<details/);
  assert.match(component, /audit_date|auditDate/);
  assert.match(component, /lockfileVersion/);
  assert.match(component, /role="status"/);
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted', '--ux-color-border', '--ux-color-focus', '--ux-color-error', '--ux-color-warning', '--ux-color-success']) {
    assert.ok(styles.includes(token), `o CSS module precisa usar ${token}`);
  }
  for (const breakpoint of ['@media(max-width:900px)', '@media(max-width:650px)']) assert.ok(styles.includes(breakpoint));
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});
