import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-03 — promoção "com prova" da área de monitoramento e automação
// determinística: central/vídeo, biometria e automações de vencimento/tarefa.
//
// Esta é a fatia em que o protótipo órfão `ExtReportingClient` deixa de ser
// órfão. A auditoria antes de codar mostrou que três das seis famílias que ele
// chamava estão APOSENTADAS no servidor (relatórios programados, inteligência
// comercial e apoio emergencial respondem 410 nas rotas legadas e têm jornada
// canônica própria), então a aba monta somente as três famílias cujo contrato
// legado continua vivo e com papel nomeado (`admin|ti`) no servidor.
//
// Executado antes da reescrita este arquivo é RED: o componente ainda é o
// protótipo com hex inline, `any`, formulários que batem em rota 410 e um
// único bloco para sucesso, erro e exceção de rede.
const component = await readFile(new URL('../src/app/admin/ti/ExtReportingClient.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/ExtReportingClient.module.css', import.meta.url), 'utf8')
  .catch(() => '');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/server/ext-reporting-api.mjs', import.meta.url), 'utf8');
const server = (await readFile(new URL('../server.mjs', import.meta.url), 'utf8')).replace(/\\\//g, '/');

const ENDPOINTS = [
  '/api/ext/central-projects',
  '/api/ext/biometry-projects',
  '/api/ext/ai-automations',
  '/api/ext/ai-automation-logs',
];
// Rotas legadas que o servidor aposentou (410). Montar formulário nelas seria
// entregar botão que não grava nada.
const RETIRED = [
  '/api/ext/periodic-reports',
  '/api/ext/commercial-intelligence',
  '/api/ext/emergency-channels',
  '/api/ext/emergency-tests',
];

test('UX-PRO-03 monitoramento: a área deixa de ser órfã e ganha aba real no console', () => {
  assert.match(consoleClient, /\['monitoramento_ext','Central, biometria e automações'\]/);
  assert.match(consoleClient, /const ExtReportingClient=dynamic\(\(\)=>import\('\.\/ExtReportingClient'\)\)/);
  assert.match(consoleClient, /active==='monitoramento_ext'&&<ExtReportingClient\/>/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
  // Grupo próprio: nenhuma aba existente muda de grupo nesta fatia.
  assert.match(consoleClient, /Inteligência e monitoramento/);
  const tabsDeclaration = consoleClient.match(/const tabs=(\[[\s\S]*?\]) as const;/)?.[1] ?? '';
  const keys = [...tabsDeclaration.matchAll(/\['([a-z0-9_]+)','/g)].map(match => match[1]);
  assert.ok(keys.length >= 22, 'a promoção precisa elevar o console a pelo menos 22 abas');
  for (const existing of ['bases', 'saude', 'observacao', 'incidentes', 'integracoes', 'dependencias',
    'manutencao', 'orcamentos', 'ambientes', 'acessos', 'auditoria', 'backup', 'avisos', 'privacidade',
    'visual', 'retencao', 'configuracoes', 'lgpd', 'cliente', 'financeiro_cadastros']) {
    assert.ok(keys.includes(existing), `a aba ${existing} não pode desaparecer`);
  }
});

test('UX-PRO-03 monitoramento: só contrato vivo, papel nomeado e nenhuma rota aposentada montada', () => {
  for (const endpoint of ENDPOINTS) {
    assert.ok(component.includes(endpoint), `o componente precisa chamar ${endpoint}`);
    assert.ok(server.includes(endpoint), `server.mjs precisa continuar despachando ${endpoint}`);
  }
  // O servidor decide: admin/ti nomeados, mesma origem, sessão obrigatória.
  assert.ok((api.match(/requireRole\(sess,\['admin','ti'\]\)/g) || []).length >= 8,
    'todos os handlers precisam manter papel nomeado admin|ti');
  assert.match(api, /same_origin|sameOrigin\(req\)/);
  for (const retired of RETIRED) {
    assert.ok(!component.includes(`fetch("${retired}`), `a tela não pode formular escrita em rota aposentada (${retired} → 410)`);
    assert.ok(!component.includes(`\`${retired}`), `a tela não pode formular escrita em rota aposentada (${retired} → 410)`);
  }
  // Leitura das quatro coleções e as duas escritas que o servidor aceita.
  for (const read of ['requestJson(ENDPOINTS.central)', 'requestJson(ENDPOINTS.biometry)', 'requestJson(ENDPOINTS.automations)',
    'requestJson(`${ENDPOINTS.logs}?automation_id=']) {
    assert.ok(component.includes(read), `a leitura precisa continuar: ${read}`);
  }
  for (const method of ['"POST"', '"PATCH"']) {
    assert.ok(component.includes(method), `método ${method} precisa continuar disponível`);
  }
  for (const action of ['Central de monitoramento', 'Biometria', 'Automação']) {
    assert.ok(component.includes(action), `a área ${action} precisa continuar na tela`);
  }
});

test('UX-PRO-03 monitoramento: quatro estados honestos, payload validado e sem diálogo nativo', () => {
  for (const variant of ['loading', 'empty', 'error', 'denied']) {
    assert.ok(component.includes(`variant="${variant}"`), `estado ${variant} precisa existir e ser distinto`);
  }
  assert.match(component, /onRetry=\{\(\)/);
  assert.match(component, /aria-busy=/);
  assert.match(component, /Array\.isArray/);
  assert.match(component, /sequence/);
  assert.match(component, /role="status"/);
  assert.match(component, /role="alert"/);
  const code = component.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
  assert.doesNotMatch(code, /\balert\(/);
  assert.doesNotMatch(code, /\bprompt\(/);
  assert.doesNotMatch(code, /\bconfirm\(/);
  assert.doesNotMatch(code, /style=\{\{/);
  assert.doesNotMatch(code, /:\s*any\b/);
  assert.doesNotMatch(code, /document\.getElementById/);
});

test('UX-PRO-03 monitoramento: regras reais do servidor traduzidas, nunca código cru', () => {
  // Sem aprovação de privacidade declarada o projeto não entra em implantação.
  assert.ok(component.includes('privacy_approval_required_projeto_separado_privacidade_aprovada'));
  // Biometria não coleta por padrão e não fica ativa sem aprovação.
  assert.ok(component.includes('collection_requires_approval_nao_coletar_biometria_por_padrao'));
  assert.ok(component.includes('approval_required_biometria_projeto_separado_privacidade_aprovada'));
  for (const reason of ['invalid_title', 'invalid_description', 'invalid_scope', 'invalid_necessity',
    'invalid_impact_assessment', 'invalid_legal_basis', 'invalid_biometry_type', 'invalid_automation_type',
    'invalid_privacy_assessment', 'invalid_status', 'missing_automation_id', 'invalid_result',
    'invalid_target_type', 'not_found', 'forbidden', 'unauthorized']) {
    assert.ok(component.includes(reason), `o motivo ${reason} precisa ter tradução na tela`);
  }
  // O mínimo real de cada campo aparece onde o campo é digitado.
  assert.match(component, /20 caracteres/);
  assert.match(component, /10 caracteres/);
});

test('UX-PRO-03 monitoramento: fonte, data-base, drill-down e limites escritos na tela', () => {
  assert.match(component, /Fonte:/);
  assert.match(component, /Data-base:/);
  assert.match(component, /<details/);
  assert.match(component, /JSON/);
  assert.match(component, /is_privacy_approved/);
  assert.match(component, /collection_active/);
  assert.match(component, /is_collection_active|collection_active/);
  assert.match(component, /automation_id/);
  // Nada de campo que o banco não guarda: sem status de central e sem
  // agendamento de automação (colunas inexistentes na migração 087).
  assert.doesNotMatch(component, /schedule_cron/);
  assert.doesNotMatch(component, /CENTRAL_STATUSES/);
  // Honestidade: a tela não coleta biometria, não implanta central, não executa job.
  assert.match(component, /não coleta|nao coleta/i);
  assert.match(component, /não executa|nao executa/i);
  assert.match(component, /NO-GO/);
  assert.match(component, /aceite humano/i);
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted',
    '--ux-color-border', '--ux-color-focus', '--ux-color-error', '--ux-color-warning', '--ux-color-success']) {
    assert.ok(styles.includes(token), `o CSS module precisa usar ${token}`);
  }
  for (const breakpoint of ['@media(max-width:900px)', '@media(max-width:650px)']) {
    assert.ok(styles.includes(breakpoint), `o CSS module precisa cobrir ${breakpoint}`);
  }
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});
