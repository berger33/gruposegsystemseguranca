import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-03 — 7ª promoção "com prova": PLT-10, pedidos do titular (acesso,
// correção, eliminação, portabilidade, oposição, revogação) com verificação de
// identidade, responsável, prazo de 15 dias, impedimentos legais documentados e
// histórico de transições. Antes: protótipo órfão com hex inline, `any`, fetch
// sem verificação de status e um único <div> para sucesso, erro e exceção de
// rede. Agora: aba real do TiConsole, os quatro contratos preservados, papel
// admin/ti/rh decidido no servidor, fonte/data-base declaradas, drill-down ao
// registro canônico e ao histórico, quatro estados de leitura com retry e aviso
// de que a tela não substitui parecer jurídico. Executar antes da reescrita: RED.
const component = await readFile(new URL('../src/app/admin/ti/LgpdRequestClient.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/LgpdRequestClient.module.css', import.meta.url), 'utf8')
  .catch(() => '');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/server/lgpd-request-api.mjs', import.meta.url), 'utf8');
const server = (await readFile(new URL('../server.mjs', import.meta.url), 'utf8')).replace(/\\\//g, '/');

const ENDPOINTS = [
  '/api/admin/lgpd/requests',
  '/api/lgpd/requests',
];

test('UX-PRO-03 PLT-10: a família deixa de ser órfã e ganha a 19ª aba real no console', () => {
  assert.match(consoleClient, /\['lgpd','Pedidos LGPD'\]/);
  assert.match(consoleClient, /const LgpdRequestClient=dynamic\(\(\)=>import\('\.\/LgpdRequestClient'\)\)/);
  assert.match(consoleClient, /active==='lgpd'&&<LgpdRequestClient\/>/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
  // A aba entra no grupo já existente de governança; nenhuma aba sai dele.
  assert.match(consoleClient, /'auditoria','backup','privacidade','ambientes','retencao','lgpd'/);
  const tabsDeclaration = consoleClient.match(/const tabs=(\[[\s\S]*?\]) as const;/)?.[1] ?? '';
  const keys = [...tabsDeclaration.matchAll(/\['([a-z_]+)','/g)].map(match => match[1]);
  // Presença, não total exato: novas promoções não podem quebrar esta guarda.
  assert.ok(keys.length >= 19, 'a 7ª promoção precisa elevar o console a pelo menos 19 abas');
});

test('UX-PRO-03 PLT-10: os contratos, os métodos, os filtros e o papel admin/ti/rh são preservados', () => {
  for (const endpoint of ENDPOINTS) {
    assert.ok(component.includes(endpoint), `o componente precisa continuar chamando ${endpoint}`);
    assert.ok(server.includes(endpoint), `server.mjs precisa continuar despachando ${endpoint}`);
  }
  // Leitura e escrita administrativas continuam presas a papéis nomeados — nunca
  // a uma sessão staff genérica. O canal público do titular é outra coisa: ele
  // existe e continua existindo, com same-origin e limite de corpo.
  assert.match(api, /\['admin','ti','rh'\]\.includes\(session\.role\)/);
  assert.match(api, /lgpd_restricted_admin_ti_rh/);
  assert.match(api, /same_origin_required/);
  // E17: uuidRe correto (8-4-4-4-12) para o detalhe e o PATCH por UUID.
  assert.match(api, /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}/);
  for (const method of ['POST', 'PATCH']) assert.ok(component.includes(`"${method}"`), `método ${method} preservado`);
  for (const action of ['Carregar pedidos', 'Criar pedido público', 'Atualizar pedido', 'Abrir detalhe']) {
    assert.ok(component.includes(action), `ação ${action} precisa continuar disponível`);
  }
  // Filtros que a API já aceita e que o protótipo nunca usou (aditivo).
  for (const param of ['type', 'status', 'email', 'limit']) {
    assert.ok(component.includes(`params.set("${param}"`), `filtro ${param} precisa chegar à API`);
    assert.ok(api.includes(`searchParams.get('${param}')`), `a API precisa continuar aceitando ${param}`);
  }
  assert.match(component, /\$\{LIST_ENDPOINT\}\?\$\{query\}/, 'os filtros precisam virar query string da leitura administrativa');
  // Máquina de estados e regras de negócio preservadas na tela.
  for (const status of ['recebido', 'em_verificacao', 'em_analise', 'aguardando_titular', 'aprovado', 'atendido', 'rejeitado', 'cancelado', 'expirado']) {
    assert.ok(component.includes(status), `status ${status} precisa continuar selecionável`);
  }
  for (const rule of ['identity_verification_required', 'legal_impediment_must_be_documented', 'invalid_transition']) {
    assert.ok(component.includes(rule), `motivo ${rule} do servidor precisa ter tradução na tela`);
  }
});

test('UX-PRO-03 PLT-10: leitura por estado honesto, payload validado e sem diálogos nativos', () => {
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
  assert.doesNotMatch(codeOnly, /\bconfirm\(/);
  assert.doesNotMatch(codeOnly, /document\.getElementById/);
  assert.doesNotMatch(codeOnly, /style=\{\{/);
  assert.doesNotMatch(codeOnly, /:\s*any\b/);
});

test('UX-PRO-03 PLT-10: fonte, data-base, drill-down e honestidade sobre limite e privacidade', () => {
  assert.match(component, /Fonte:/);
  assert.match(component, /Data-base:/);
  assert.match(component, /<details/);
  assert.match(component, /lgpd_request_history|Histórico de transições/);
  assert.match(component, /requester_document_hash/);
  assert.match(component, /due_date/);
  assert.match(component, /impediment_documented/);
  assert.match(component, /is_identity_verified/);
  assert.match(component, /role="status"/);
  assert.match(component, /role="alert"/);
  // O documento do titular nunca é exibido: só existe como hash no servidor, e a
  // tela precisa dizer isso onde o campo é coletado.
  assert.match(component, /armazenado apenas como hash/i);
  assert.match(component, /Doc\. hash|documento hasheado/i);
  assert.match(component, /15 dias/i);
  assert.match(component, /parecer|jurídico|juridico/i);
  assert.match(component, /NO-GO/);
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted', '--ux-color-border', '--ux-color-focus', '--ux-color-error', '--ux-color-warning', '--ux-color-success']) {
    assert.ok(styles.includes(token), `o CSS module precisa usar ${token}`);
  }
  for (const breakpoint of ['@media(max-width:900px)', '@media(max-width:650px)']) assert.ok(styles.includes(breakpoint));
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});
