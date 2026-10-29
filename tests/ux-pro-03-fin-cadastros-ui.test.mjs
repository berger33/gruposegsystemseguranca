import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-03 — 8ª aba "com prova" do TiConsole, escopo de LACUNA da família
// financeiro. A decisão do proprietário (29/10) foi explícita: a família
// `Fin*` NÃO é promovida como órfã porque `/admin/financeiro` já é rota real
// (13 workspaces, 2.953 linhas) e cobre 26 dos 32 endpoints daqueles
// protótipos. Montar os quatro no console criaria duas UIs concorrentes sobre
// os mesmos dados.
//
// O que esta aba entrega é só o que NÃO existe em nenhuma tela viva:
//   - cadastro de fornecedores       (`/api/fin/suppliers`)
//   - cadastro de centros de custo   (`/api/fin/cost-centers`)
//   - drill-down do histórico de baixa (`/api/fin/payment-history`)
// e a leitura de contas a receber/pagar serve APENAS para escolher a conta do
// histórico (GET; nenhuma escrita daqueles recursos volta para esta tela).
//
// Executado antes da implementação: na base falha pelo motivo certo (RED).
const componentPath = new URL('../src/app/admin/ti/FinRegistryClient.tsx', import.meta.url);
const component = await readFile(componentPath, 'utf8').catch(() => '');
const styles = await readFile(new URL('../src/app/admin/ti/FinRegistryClient.module.css', import.meta.url), 'utf8')
  .catch(() => '');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/server/fin-api.mjs', import.meta.url), 'utf8');
const server = (await readFile(new URL('../server.mjs', import.meta.url), 'utf8')).replace(/\\\//g, '/');
const financeiroPage = await readFile(new URL('../src/app/admin/financeiro/page.tsx', import.meta.url), 'utf8');

const LACUNA = [
  '/api/fin/suppliers',
  '/api/fin/cost-centers',
  '/api/fin/payment-history',
];

// Leitura usada só como seletor da conta do histórico. Se qualquer uma destas
// aparecer com escrita, a tela passou a duplicar `/admin/financeiro`.
const SOMENTE_LEITURA = ['/api/fin/receivables', '/api/fin/payables'];

// Recursos que JÁ têm tela em `/admin/financeiro`. A aba de cadastros não pode
// chamá-los: é aqui que a duplicação seria introduzida sem ninguém notar.
const DUPLICADOS = [
  '/api/fin/payments',
  '/api/fin/recurrence-rules',
  '/api/fin/generate-recurring',
  '/api/fin/budgets',
  '/api/fin/budget-scenarios',
  '/api/fin/exports',
  '/api/fin/commission-provisions',
  '/api/fin/competence-closures',
  '/api/fin/report-versions',
  '/api/fin/management-results',
  '/api/fin/expenses',
  '/api/fin/fiscal-providers',
  '/api/fin/fiscal-obligations',
  '/api/fin/fiscal-documents',
  '/api/fin/fiscal-activity-rules',
  '/api/fin/payment-gateways',
  '/api/fin/gateway-webhooks',
  '/api/fin/gateway-charges',
  '/api/fin/bank-statements',
  '/api/fin/bank-transactions',
  '/api/fin/conciliations',
  '/api/fin/collection-policies',
  '/api/fin/collection-reminders',
  '/api/fin/cashflow-snapshots',
  '/api/fin/aging-receivables',
  '/api/fin/costs',
  '/api/fin/cost-imports',
];

test('UX-PRO-03 FIN cadastros: a lacuna ganha aba real no console, com papel e grupo de navegação', () => {
  assert.ok(component.length > 0, 'o componente FinRegistryClient precisa existir');
  assert.match(consoleClient, /\['financeiro_cadastros','Cadastros financeiros'\]/);
  assert.match(consoleClient, /const FinRegistryClient=dynamic\(\(\)=>import\('\.\/FinRegistryClient'\)\)/);
  assert.match(consoleClient, /active==='financeiro_cadastros'&&<FinRegistryClient\/>/);
  // Sem grupo, a aba existe mas não é alcançável.
  assert.match(consoleClient, /name:'Financeiro e cadastros',keys:\['financeiro_cadastros'\]/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
});

test('UX-PRO-03 FIN cadastros: só a lacuna real, com o servidor despachando os três contratos', () => {
  for (const endpoint of LACUNA) {
    assert.ok(component.includes(endpoint), `a tela precisa chamar ${endpoint}`);
    assert.ok(server.includes(endpoint), `server.mjs precisa despachar ${endpoint}`);
  }
  // O handler continua decidindo o papel e a origem no servidor.
  assert.match(api, /ensureAuth\(req, res, \["admin","ti","financeiro"\]\)/);
  assert.match(api, /if \(roles && !requireRole\(session, roles\)\)/);
  assert.match(api, /if \(!sameOrigin\(req\)\)/);
});

test('UX-PRO-03 FIN cadastros: a tela não duplica a rota real /admin/financeiro', () => {
  assert.ok(financeiroPage.includes('FinanceiroWorkspace'), 'a rota real precisa continuar existindo');
  for (const endpoint of DUPLICADOS) {
    assert.ok(!component.includes(endpoint),
      `${endpoint} já tem tela em /admin/financeiro; a aba de cadastros não pode duplicá-lo`);
  }
  // As duas leituras de seleção existem, e só como GET.
  for (const endpoint of SOMENTE_LEITURA) {
    assert.ok(component.includes(endpoint), `a seleção da conta usa ${endpoint}`);
  }
  assert.doesNotMatch(component, /method:\s*"(POST|PATCH|PUT|DELETE)"[\s\S]{0,400}\/api\/fin\/(receivables|payables)/,
    'contas a receber/pagar são somente leitura nesta aba');
  // A tela aponta o operador para a rota dona da escrita financeira.
  assert.match(component, /\/admin\/financeiro/);
});

test('UX-PRO-03 FIN cadastros: quatro estados, retry, sequência e payload validado sem any', () => {
  for (const variant of ['loading', 'empty', 'error', 'denied']) {
    assert.ok(component.includes(`variant="${variant}"`), `estado ${variant} precisa ser distinto`);
  }
  assert.match(component, /onRetry=\{/);
  assert.match(component, /aria-busy=/);
  assert.match(component, /sequence/);
  assert.match(component, /function records\(/);
  assert.match(component, /Array\.isArray/);
  const codeOnly = component.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(codeOnly, /\balert\(/);
  assert.doesNotMatch(codeOnly, /\bprompt\(/);
  assert.doesNotMatch(codeOnly, /style=\{\{/);
  assert.doesNotMatch(codeOnly, /:\s*any\b/);
  assert.doesNotMatch(codeOnly, /catch\s*\{\s*\}/, 'falha silenciosa engolida não é estado honesto');
  // O protótipo usava aliases presos à borda legada de RH.
  assert.doesNotMatch(codeOnly, /\/api\/hr\/fin-/, 'a tela usa o alias canônico /api/fin/*');
});

test('UX-PRO-03 FIN cadastros: rótulo em todo campo, fonte, data-base e drill-down', () => {
  assert.match(component, /htmlFor=/);
  assert.match(component, /aria-describedby=/);
  assert.match(component, /aria-labelledby="fin-cadastros-/);
  assert.match(component, /<details/);
  assert.match(component, /Fonte: tabelas/);
  assert.match(component, /Data-base:/);
  assert.match(component, /fin_suppliers/);
  assert.match(component, /fin_cost_centers/);
  assert.match(component, /fin_payment_history/);
  assert.match(component, /role="status"/);
  assert.match(component, /role="alert"/);
  // Limites declarados: sem upload, sem gateway/SMTP e produção NO-GO.
  assert.match(component, /nenhum byte/i);
  assert.match(component, /SMTP/);
  assert.match(component, /NO-GO/);
  assert.match(component, /0\/222/);
  // Rotulagem: o texto de ajuda não fica dentro do <label> (achado do gate).
  assert.doesNotMatch(codeOnly(component), /<label[^>]*>[^<]*<small/);
});

test('UX-PRO-03 FIN cadastros: CSS por token, sem hex, foco visível e responsivo', () => {
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted',
    '--ux-color-border', '--ux-color-focus', '--ux-color-error', '--ux-color-success', '--ux-color-warning']) {
    assert.ok(styles.includes(token), `o CSS module precisa usar ${token}`);
  }
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
  for (const breakpoint of ['@media(max-width:900px)', '@media(max-width:650px)']) {
    assert.ok(styles.includes(breakpoint), `o CSS precisa cobrir ${breakpoint}`);
  }
  // Resumo e botão do formulário não podem compartilhar nome acessível.
  assert.match(component, /<summary/);
  assert.doesNotMatch(component, /<summary>\s*Criar/i);
});

function codeOnly(source) {
  return source.replace(/^\s*\/\/.*$/gm, '');
}
