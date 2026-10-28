import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-03 — 3ª promoção "com prova": PLT-16, orçamento operacional e
// alertas de uso. Critério de 02/10: rota real, autorização no servidor,
// fonte/período/data-base, drill-down, erro de leitura com retry e subteste
// no gate. Executar antes da reescrita do protótipo: na base precisa falhar.
const component = await readFile(new URL('../src/app/admin/ti/BudgetClient.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/BudgetClient.module.css', import.meta.url), 'utf8')
  .catch(() => '');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/server/budget-api.mjs', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

const ENDPOINTS = [
  '/api/admin/budgets',
  '/api/admin/usage/metrics',
  '/api/admin/usage/alerts',
];

test('UX-PRO-03 PLT-16: a família deixa de ser órfã e ganha aba real no console', () => {
  assert.match(consoleClient, /\['orcamentos','Orçamento e uso'\]/);
  assert.match(consoleClient, /const BudgetClient=dynamic\(\(\)=>import\('\.\/BudgetClient'\)\)/);
  assert.match(consoleClient, /active==='orcamentos'&&<BudgetClient\/>/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
  assert.match(consoleClient, /'saude','observacao','incidentes','integracoes','dependencias','manutencao','orcamentos'/);
});

test('UX-PRO-03 PLT-16: os três contratos, os métodos e o papel admin/ti são preservados', () => {
  for (const endpoint of ENDPOINTS) {
    assert.ok(component.includes(endpoint), `o componente precisa continuar chamando ${endpoint}`);
    assert.ok(server.includes(endpoint), `server.mjs precisa continuar despachando ${endpoint}`);
  }
  const roleChecks = api.match(/requireRole\(sess,\['admin','ti'\]\)/g) || [];
  assert.equal(roleChecks.length, 3, 'os três handlers precisam decidir o papel no servidor');
  for (const method of ['POST', 'PATCH']) assert.ok(component.includes(`"${method}"`), `método ${method} preservado`);
  for (const action of ['Registrar orçamento', 'Atualizar uso', 'Registrar métrica', 'Reconhecer alerta']) {
    assert.ok(component.includes(action), `ação ${action} precisa continuar disponível`);
  }
  // E17: o uuidRe deste módulo foi corrigido; o acknowledge por id depende dele.
  assert.match(api, /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}/);
});

test('UX-PRO-03 PLT-16: leitura por estado honesto, payload validado e sem diálogos nativos', () => {
  for (const variant of ['loading', 'empty', 'error', 'denied']) {
    assert.ok(component.includes(`variant="${variant}"`) || component.includes(`variant: '${variant}'`),
      `estado ${variant} precisa ser distinto`);
  }
  assert.match(component, /onRetry=\{/);
  assert.match(component, /aria-busy=/);
  assert.match(component, /Array\.isArray/);
  assert.match(component, /sequence/);
  const codeOnly = component.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(codeOnly, /\balert\(/);
  assert.doesNotMatch(codeOnly, /\bprompt\(/);
  assert.doesNotMatch(codeOnly, /document\.getElementById/);
  assert.doesNotMatch(codeOnly, /style=\{\{/);
});

test('UX-PRO-03 PLT-16: fonte, data-base, drill-down e honestidade sobre o teto de custo', () => {
  assert.match(component, /Fonte:/);
  assert.match(component, /data-base|Data-base|dataBase/);
  assert.match(component, /<details/);
  assert.match(component, /period_start/);
  assert.match(component, /measured_at/);
  assert.match(component, /threshold_value/);
  assert.match(component, /role="status"/);
  // O seed cita "R$200/mês": é planejamento sintético, não teto aprovado.
  assert.match(component, /planejamento sintético/i);
  assert.match(component, /decisão do proprietário|teto aprovado|teto de hospedagem/i);
  assert.doesNotMatch(component, /R\$200\/m[eê]s (?:cobre|é suficiente)/i);
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted', '--ux-color-border', '--ux-color-focus', '--ux-color-error', '--ux-color-warning', '--ux-color-success']) {
    assert.ok(styles.includes(token), `o CSS module precisa usar ${token}`);
  }
  for (const breakpoint of ['@media(max-width:900px)', '@media(max-width:650px)']) assert.ok(styles.includes(breakpoint));
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});
