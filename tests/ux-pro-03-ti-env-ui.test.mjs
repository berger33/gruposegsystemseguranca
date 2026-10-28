import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-03 — 4ª promoção "com prova": PLT-17, isolamento de ambientes.
// Critério de 02/10: rota real, autorização no servidor, fonte/data-base,
// drill-down, erro de leitura com retry e subteste no gate.
// Esta família exige uma prova EXTRA de honestidade: o seed da migração 055
// declara um ambiente "production" com has_real_data=true. A tela precisa
// deixar claro que é inventário declarativo — não configura nem ativa produção.
// Executar antes da reescrita do protótipo: na base precisa falhar (RED).
const component = await readFile(new URL('../src/app/admin/ti/EnvClient.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/EnvClient.module.css', import.meta.url), 'utf8')
  .catch(() => '');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/server/env-api.mjs', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

const ENDPOINTS = [
  '/api/admin/environments',
  '/api/admin/environments/checks',
];

test('UX-PRO-03 PLT-17: a família deixa de ser órfã e ganha aba real no console', () => {
  assert.match(consoleClient, /\['ambientes','Ambientes e isolamento'\]/);
  assert.match(consoleClient, /const EnvClient=dynamic\(\(\)=>import\('\.\/EnvClient'\)\)/);
  assert.match(consoleClient, /active==='ambientes'&&<EnvClient\/>/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
  assert.match(consoleClient, /'acessos','auditoria','backup','privacidade','ambientes'/);
});

test('UX-PRO-03 PLT-17: os dois contratos, os métodos e o papel admin/ti são preservados', () => {
  for (const endpoint of ENDPOINTS) {
    assert.ok(component.includes(endpoint), `o componente precisa continuar chamando ${endpoint}`);
    assert.ok(server.includes(endpoint), `server.mjs precisa continuar despachando ${endpoint}`);
  }
  const roleChecks = api.match(/requireRole\(sess,\['admin','ti'\]\)/g) || [];
  assert.equal(roleChecks.length, 2, 'os dois handlers precisam decidir o papel no servidor');
  for (const method of ['POST', 'PATCH']) assert.ok(component.includes(`"${method}"`), `método ${method} preservado`);
  for (const action of ['Registrar ambiente', 'Verificar isolamento', 'Registrar verificação']) {
    assert.ok(component.includes(action), `ação ${action} precisa continuar disponível`);
  }
  // E17: o uuidRe deste módulo foi corrigido; PATCH e checks por UUID dependem dele.
  assert.match(api, /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}/);
});

test('UX-PRO-03 PLT-17: leitura por estado honesto, payload validado e sem diálogos nativos', () => {
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

test('UX-PRO-03 PLT-17: fonte, data-base, drill-down e aviso de inventário declarativo', () => {
  assert.match(component, /Fonte:/);
  assert.match(component, /data-base|Data-base|dataBase/);
  assert.match(component, /<details/);
  assert.match(component, /isolation_verified_at/);
  assert.match(component, /checked_at/);
  assert.match(component, /role="status"/);
  // O seed cita "produção com dados reais": a tela NÃO pode sugerir que isso
  // é um ambiente ativo, configurável ou liberado.
  assert.match(component, /inventário declarativo/i);
  assert.match(component, /não conecta|nao conecta/i);
  assert.match(component, /não configura|nao configura/i);
  assert.match(component, /NO-GO/);
  assert.match(component, /decisão do proprietário/i);
  assert.match(component, /PRODUCAO-GATE\.md|PRODUÇÃO-GATE\.md|PRODUCAO-GATE/);
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted', '--ux-color-border', '--ux-color-focus', '--ux-color-error', '--ux-color-warning', '--ux-color-success']) {
    assert.ok(styles.includes(token), `o CSS module precisa usar ${token}`);
  }
  for (const breakpoint of ['@media(max-width:900px)', '@media(max-width:650px)']) assert.ok(styles.includes(breakpoint));
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});
