import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-03 — 7ª promoção "com prova": CLI-05/06/07/08, lado administrativo
// (staff) dos recursos v2 do portal do cliente. Critério de 02/10: rota real,
// autorização decidida no servidor, fonte/data-base, drill-down, erro de leitura
// com retry e subteste no gate de navegador.
//
// Esta família exige prova de papel explícita: `client-advanced-api.mjs` usa
// `ensureAuth`, que exige `requireRole(session,["admin","ti"])` e nega RH e
// comercial de propósito enquanto não existir autorização por conta (A3).
// Executar antes da reescrita do protótipo: na base precisa falhar (RED).
const component = await readFile(new URL('../src/app/admin/ti/CliAdvancedClient.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/CliAdvancedClient.module.css', import.meta.url), 'utf8')
  .catch(() => '');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/server/cli-advanced-api.mjs', import.meta.url), 'utf8');
const server = (await readFile(new URL('../server.mjs', import.meta.url), 'utf8')).replace(/\\\//g, '/');

const ENDPOINTS = [
  '/api/cli/tickets-v2',
  '/api/cli/ticket-messages',
  '/api/cli/ticket-attachments',
  '/api/cli/ticket-history',
  '/api/cli/ticket-sla-pauses',
  '/api/cli/visits',
  '/api/cli/visit-history',
  '/api/cli/reports-v2',
  '/api/cli/report-history-v2',
];

test('UX-PRO-03 CLI-05/06/07/08: a família deixa de ser órfã e ganha aba real no console', () => {
  assert.match(consoleClient, /\['cliente','Portal do cliente v2'\]/);
  assert.match(consoleClient, /const CliAdvancedClient=dynamic\(\(\)=>import\('\.\/CliAdvancedClient'\)\)/);
  assert.match(consoleClient, /active==='cliente'&&<CliAdvancedClient\/>/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
  // A aba precisa estar num grupo de navegação, senão não é alcançável.
  assert.match(consoleClient, /keys:\['avisos','visual','cliente'\]/);
});

test('UX-PRO-03 CLI-05/06/07/08: os nove contratos, os métodos e o papel admin/ti são preservados', () => {
  for (const endpoint of ENDPOINTS) {
    assert.ok(component.includes(endpoint), `o componente precisa continuar chamando ${endpoint}`);
    assert.ok(server.includes(endpoint), `server.mjs precisa continuar despachando ${endpoint}`);
  }
  const roleChecks = api.match(/requireRole\(session, \["admin","ti"\]\)/g) || [];
  assert.equal(roleChecks.length, 1, 'ensureAuth precisa decidir o papel no servidor (admin/ti)');
  assert.match(api, /res\.writeHead\(403, \{ "Content-Type":"application\/json" \}\); res\.end\(JSON\.stringify\(\{ error:"forbidden" \}\)\)/);
  for (const method of ['POST', 'PATCH']) assert.ok(component.includes(`"${method}"`), `método ${method} preservado`);
  for (const action of [
    'Registrar chamado', 'Atualizar estado do chamado', 'Registrar mensagem',
    'Registrar metadado de anexo', 'Aplicar ação de SLA',
    'Agendar visita', 'Atualizar visita',
    'Criar relatório', 'Atualizar relatório',
  ]) {
    assert.ok(component.includes(action), `ação ${action} precisa continuar disponível`);
  }
});

test('UX-PRO-03 CLI-05/06/07/08: leitura por estado honesto, payload validado e sem diálogos nativos', () => {
  for (const variant of ['loading', 'empty', 'error', 'denied']) {
    assert.ok(component.includes(`variant="${variant}"`), `estado ${variant} precisa ser distinto`);
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
  // `any` foi o vício do protótipo: o payload é validado campo a campo.
  assert.doesNotMatch(codeOnly, /:\s*any\b/);
});

test('UX-PRO-03 CLI-05/06/07/08: fonte, data-base, drill-down e limites declarados', () => {
  assert.match(component, /Fonte: tabelas/);
  assert.match(component, /Data-base:/);
  assert.match(component, /<details/);
  assert.match(component, /cli_tickets_v2/);
  assert.match(component, /cli_client_report_history_v2/);
  assert.match(component, /role="status"/);
  assert.match(component, /role="alert"/);
  // Sem upload real: a tela precisa dizer que nenhum byte é armazenado.
  assert.match(component, /não há armazenamento de arquivos/i);
  assert.match(component, /nenhum byte é enviado/i);
  // Sem escopo por conta (A3): o limite do servidor precisa estar declarado.
  assert.match(component, /A3/);
  assert.match(component, /não comprovam vínculo|não comprovam\s+vínculo/i);
  // Sem envio real ao cliente e sem aceite humano.
  assert.match(component, /SMTP/);
  assert.match(component, /NO-GO/);
  assert.match(component, /0\/222/);
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted', '--ux-color-border', '--ux-color-focus', '--ux-color-error', '--ux-color-warning', '--ux-color-success']) {
    assert.ok(styles.includes(token), `o CSS module precisa usar ${token}`);
  }
  for (const breakpoint of ['@media(max-width:900px)', '@media(max-width:650px)']) assert.ok(styles.includes(breakpoint));
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});

// Achado desta fatia (E26 da auditoria de 28/10): os MESMOS nove recursos têm
// dois grupos de aliases em server.mjs. Os aliases `/api/hr/cli-*` passam antes
// pela borda legada de RH (`authorizeLegacyHrRequest`), que exige a permissão
// granular `employees.read|write` — e portanto devolvem 403 para `ti`/`admin`,
// justamente os papéis que `ensureAuth` autoriza. Provado contra PostgreSQL
// real: `/api/hr/cli-tickets-v2` com sessão `ti` → 403; `/api/cli/tickets-v2`
// com a mesma sessão → 200. A tela precisa usar o alias canônico, senão nasce
// morta para o papel que a hospeda.
test('UX-PRO-03 CLI-05/06/07/08: a tela usa o alias canônico /api/cli/*, não a borda legada de RH', () => {
  for (const endpoint of ENDPOINTS) {
    assert.ok(component.includes(endpoint), `o componente precisa chamar o alias canônico ${endpoint}`);
    assert.ok(server.includes(endpoint), `server.mjs precisa despachar ${endpoint}`);
  }
  assert.doesNotMatch(component, /\/api\/hr\/cli-/, 'nenhum endpoint pode voltar para o alias preso na borda de RH');
  // A borda que explica o achado continua existindo e continua cobrindo /api/hr/.
  assert.match(server, /async function authorizeLegacyHrRequest/);
  assert.match(server, /url\.pathname\.startsWith\("\/api\/hr\/"\)/);
  assert.match(server, /if \(!\(await authorizeLegacyHrRequest\(req, res, url\)\)\) return;/);
});

// `<summary>` também expõe papel de botão na árvore de acessibilidade. Se um
// resumo tiver o MESMO nome do botão que ele revela, `getByRole('button',
// {name})` fica ambíguo (strict mode) e o leitor de tela anuncia dois
// controles idênticos. O gate de navegador reprovou exatamente nisso.
test('UX-PRO-03 CLI-05/06/07/08: resumo e botão de cada formulário não compartilham nome', () => {
  const summaries = [...component.matchAll(/<summary>([^<{]+)<\/summary>/g)]
    .map(match => match[1].trim())
    .filter(text => !/\(JSON\)/.test(text) && !/^Histórico/.test(text) && !/^Pausas de SLA/.test(text));
  const buttons = [...component.matchAll(/>([^<>{}]+)<\/button>/g)].map(match => match[1].trim());
  assert.ok(summaries.length >= 7, `esperava os resumos dos formulários, achei ${summaries.length}`);
  for (const summary of summaries) {
    assert.ok(!buttons.includes(summary), `"${summary}" não pode nomear resumo e botão ao mesmo tempo`);
  }
});

// O texto de ajuda dentro do <label> vira parte do NOME ACESSÍVEL do controle:
// `getByLabel('Título', {exact:true})` deixa de casar e o leitor de tela anuncia
// "Título 3 a 200 caracteres." como se fosse o rótulo. O gate de navegador
// reprovou nisso (timeout de 45 s no primeiro campo do formulário de chamado).
test('UX-PRO-03 CLI-05/06/07/08: o texto de ajuda fica fora do <label> (nome acessível limpo)', () => {
  const field = component.match(/function Field\([\s\S]*?\n}/)?.[0] ?? '';
  assert.ok(field, 'o componente precisa manter o helper Field');
  assert.match(field, /<label htmlFor=\{id\}>/, 'o rótulo precisa ser <label htmlFor={id}>');
  assert.match(field, /"aria-describedby": helpId/, 'a ajuda precisa ser anunciada por aria-describedby');
  assert.doesNotMatch(field, /<small[^>]*>\{help\}<\/small>\}?<\/label>/, 'a ajuda não pode estar dentro do <label>');
  for (const inner of [...component.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)].map(match => match[1])) {
    assert.ok(!inner.includes('<small'), 'nenhum <small> de ajuda pode viver dentro de um <label>');
  }
});

// Os três painéis repetem rótulos ("Título", "Novo estado", "Conta do cliente
// (UUID)"). O gate de navegador reprovou com `strict mode violation: getByLabel
// ('Novo estado') resolved to 3 elements` — e o `nth(índice)` que existia antes
// depende da ordem de montagem, que muda quando um painel fica vazio. A saída
// correta é escopar por região: cada painel é um landmark nomeado.
test('UX-PRO-03 CLI-05/06/07/08: cada painel é uma região nomeada (escopo sem nth)', () => {
  for (const id of ['cli-tickets-title', 'cli-visits-title', 'cli-reports-title']) {
    assert.ok(component.includes(`aria-labelledby="${id}"`), `o painel precisa de aria-labelledby="${id}"`);
    assert.match(component, new RegExp(`<h3 id="${id}">`), `o painel precisa do <h3 id="${id}">`);
  }
  // O <h3> de cada painel começa por um texto estável, usado como escopo no gate.
  assert.match(component, /<h3 id="cli-tickets-title">Chamados v2 \(/);
  assert.match(component, /<h3 id="cli-visits-title">Agenda de visitas \(/);
  assert.match(component, /<h3 id="cli-reports-title">Relatórios de execução, medição e aceite \(/);
});
