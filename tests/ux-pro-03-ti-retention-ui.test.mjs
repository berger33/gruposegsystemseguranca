import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-03 — 5ª promoção "com prova": PLT-11, retenção por categoria e
// descarte verificável. Antes: protótipo órfão com hex inline, `any`, fetch
// sem verificação de status e um único <p> para qualquer falha. Agora: aba
// real do TiConsole, quatro contratos preservados, papel admin/ti decidido
// no servidor, fonte/data-base declaradas, drill-down ao registro canônico,
// quatro estados de leitura com retry e aviso de que o descarte é simulação
// sintética — não apaga dado pessoal real. Executar antes da reescrita: RED.
const component = await readFile(new URL('../src/app/admin/ti/RetentionClient.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/RetentionClient.module.css', import.meta.url), 'utf8')
  .catch(() => '');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/server/retention-api.mjs', import.meta.url), 'utf8');
const server = (await readFile(new URL('../server.mjs', import.meta.url), 'utf8')).replace(/\\\//g, '/');

const ENDPOINTS = [
  '/api/admin/retention/policies',
  '/api/admin/retention/exceptions',
  '/api/admin/retention/disposal/jobs',
  '/api/admin/retention/disposal/logs',
];

test('UX-PRO-03 PLT-11: a família deixa de ser órfã e ganha a 17ª aba real no console', () => {
  assert.match(consoleClient, /\['retencao','Retenção e descarte'\]/);
  assert.match(consoleClient, /const RetentionClient=dynamic\(\(\)=>import\('\.\/RetentionClient'\)\)/);
  assert.match(consoleClient, /active==='retencao'&&<RetentionClient\/>/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
  assert.match(consoleClient, /'auditoria','backup','privacidade','ambientes','retencao'/);
  const tabsDeclaration = consoleClient.match(/const tabs=(\[[\s\S]*?\]) as const;/)?.[1] ?? '';
  const keys = [...tabsDeclaration.matchAll(/\['([a-z_]+)','/g)].map(match => match[1]);
  // Presença, não total exato: novas promoções não podem quebrar esta guarda.
  assert.ok(keys.length >= 17, 'a 5ª promoção precisa elevar o console a pelo menos 17 abas');
});

test('UX-PRO-03 PLT-11: os quatro contratos, os métodos e o papel admin/ti são preservados', () => {
  for (const endpoint of ENDPOINTS) {
    assert.ok(component.includes(endpoint), `o componente precisa continuar chamando ${endpoint}`);
    assert.ok(server.includes(endpoint), `server.mjs precisa continuar despachando ${endpoint}`);
  }
  const roleChecks = api.match(/requireRole\(sess,\['admin','ti'\]\)/g) || [];
  assert.ok(roleChecks.length >= 4, 'políticas, exceção por id, jobs e job por id precisam exigir admin/ti');
  for (const method of ['POST', 'PATCH']) assert.ok(component.includes(`"${method}"`), `método ${method} preservado`);
  for (const action of ['Salvar política', 'Solicitar exceção formal', 'Atualizar status da exceção', 'Executar job de descarte']) {
    assert.ok(component.includes(action), `ação ${action} precisa continuar disponível`);
  }
  // E17: uuidRe correto (8-4-4-4-12) para PATCH de exceção e detalhe de job.
  assert.match(api, /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}/);
});

test('UX-PRO-03 PLT-11: leitura por estado honesto, payload validado e sem diálogos nativos', () => {
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

test('UX-PRO-03 PLT-11: fonte, data-base, drill-down e honestidade sobre o descarte sintético', () => {
  assert.match(component, /Fonte:/);
  assert.match(component, /Data-base:/);
  assert.match(component, /<details/);
  assert.match(component, /record_reference_hash/);
  assert.match(component, /expires_at/);
  assert.match(component, /total_scanned/);
  assert.match(component, /role="status"/);
  assert.match(component, /simulação sintética/i);
  assert.match(component, /não apaga|nao apaga/i);
  assert.match(component, /parecer|jurídico|juridico/i);
  assert.match(component, /NO-GO/);
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted', '--ux-color-border', '--ux-color-focus', '--ux-color-error', '--ux-color-warning', '--ux-color-success']) {
    assert.ok(styles.includes(token), `o CSS module precisa usar ${token}`);
  }
  for (const breakpoint of ['@media(max-width:900px)', '@media(max-width:650px)']) assert.ok(styles.includes(breakpoint));
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});
