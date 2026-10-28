import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-03 — 6ª promoção "com prova": PLT-13, configurações, flags,
// manutenção, rollout e reversão com negócio separado de infraestrutura.
// Antes: protótipo órfão com hex inline, `any`, JSON.parse sem tratamento,
// fetch sem verificação de status, um único <p> para qualquer falha e nenhum
// aviso de que a tela é inventário declarativo (não ativa produção).
// Agora: 18ª aba real, quatro contratos preservados, papel admin/ti no
// servidor, segredo mascarado explicitamente, fonte/data-base, drill-down,
// quatro estados de leitura com retry e aviso NO-GO. Executar antes: RED.
const component = await readFile(new URL('../src/app/admin/ti/ConfigClient.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/ConfigClient.module.css', import.meta.url), 'utf8')
  .catch(() => '');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/server/config-api.mjs', import.meta.url), 'utf8');
const server = (await readFile(new URL('../server.mjs', import.meta.url), 'utf8')).replace(/\\\//g, '/');

const ENDPOINTS = [
  '/api/admin/config/flags',
  '/api/admin/config/maintenance',
  '/api/admin/config/rollouts',
];

test('UX-PRO-03 PLT-13: a família deixa de ser órfã e ganha a 18ª aba real no console', () => {
  assert.match(consoleClient, /\['configuracoes','Configurações e rollout'\]/);
  assert.match(consoleClient, /const ConfigClient=dynamic\(\(\)=>import\('\.\/ConfigClient'\)\)/);
  assert.match(consoleClient, /active==='configuracoes'&&<ConfigClient\/>/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
  assert.match(consoleClient, /'manutencao','orcamentos','configuracoes'/);
  const tabsDeclaration = consoleClient.match(/const tabs=(\[[\s\S]*?\]) as const;/)?.[1] ?? '';
  const keys = [...tabsDeclaration.matchAll(/\['([a-z_]+)','/g)].map(match => match[1]);
  assert.ok(keys.length >= 18, 'a 6ª promoção precisa elevar o console a pelo menos 18 abas');
});

test('UX-PRO-03 PLT-13: os quatro contratos, os métodos, o papel e o mascaramento são preservados', () => {
  for (const endpoint of ENDPOINTS) {
    assert.ok(component.includes(endpoint), `o componente precisa continuar chamando ${endpoint}`);
    assert.ok(server.includes(endpoint), `server.mjs precisa continuar despachando ${endpoint}`);
  }
  const roleChecks = api.match(/requireRole\(sess,\['admin','ti'\]\)/g) || [];
  assert.ok(roleChecks.length >= 4, 'flags, flag por id, manutenção e rollouts precisam exigir admin/ti');
  for (const method of ['POST', 'PATCH']) assert.ok(component.includes(`"${method}"`), `método ${method} preservado`);
  for (const action of ['Salvar flag', 'Atualizar flag', 'Reverter ao histórico', 'Agendar manutenção', 'Criar plano de rollout', 'Aprovar rollout', 'Reverter rollout']) {
    assert.ok(component.includes(action), `ação ${action} precisa continuar disponível`);
  }
  // O servidor já mascara segredos nos GETs; a UI precisa declarar isso.
  assert.match(api, /masked:\s*true/);
  assert.match(component, /mascarado/i);
  assert.match(api, /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}/);
});

test('UX-PRO-03 PLT-13: leitura por estado honesto, payload validado e sem diálogos nativos', () => {
  for (const variant of ['loading', 'empty', 'error', 'denied']) {
    assert.ok(component.includes(`variant="${variant}"`) || component.includes(`variant: '${variant}'`),
      `estado ${variant} precisa ser distinto`);
  }
  assert.match(component, /onRetry=\{\(/);
  assert.match(component, /aria-busy=/);
  assert.match(component, /Array\.isArray/);
  assert.match(component, /sequence/);
  const codeOnly = component.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(codeOnly, /\balert\(/);
  assert.doesNotMatch(codeOnly, /\bprompt\(/);
  assert.doesNotMatch(codeOnly, /document\.getElementById/);
  assert.doesNotMatch(codeOnly, /style=\{\{/);
  assert.doesNotMatch(codeOnly, /:\s*any\b/);
});

test('UX-PRO-03 PLT-13: fonte, data-base, drill-down, separação negócio/infra e não ativação de produção', () => {
  assert.match(component, /Fonte:/);
  assert.match(component, /Data-base:/);
  assert.match(component, /<details/);
  assert.match(component, /is_business/);
  assert.match(component, /environment/);
  assert.match(component, /rollout_percentage/);
  assert.match(component, /rollback_plan/);
  assert.match(component, /role="status"/);
  assert.match(component, /inventário declarativo/i);
  assert.match(component, /não ativa|nao ativa/i);
  assert.match(component, /decisão do proprietário/i);
  assert.match(component, /NO-GO/);
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted', '--ux-color-border', '--ux-color-focus', '--ux-color-error', '--ux-color-warning', '--ux-color-success']) {
    assert.ok(styles.includes(token), `o CSS module precisa usar ${token}`);
  }
  for (const breakpoint of ['@media(max-width:900px)', '@media(max-width:650px)']) assert.ok(styles.includes(breakpoint));
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});
