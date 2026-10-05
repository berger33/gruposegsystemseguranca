// UX-06 — o vocabulário dos portais não pode divergir dos servidores.
//
// Este teste lê `src/server/employee-api.mjs`, `src/server/client-space-api.mjs`
// e `src/server/client-access-api.mjs` e falha se a interface passar a traduzir
// um código que os servidores não devolvem mais, ou deixar sem tradução um
// código que eles devolvem. É a amarração que impede a tradução de virar
// invenção — o mesmo teste que, na UX-05, encontrou 17 códigos sem frase.
//
// Ele também tranca as duas regras que os portais não podem perder:
//  - falha de leitura NUNCA pode virar ausência de dado;
//  - só um 401 de sessão autoriza a interface a mostrar a tela de entrada.
//    Era esse o defeito do portal do funcionário: qualquer erro derrubava a
//    pessoa para o login, como se ela não estivesse autenticada.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EMPLOYEE_OCCURRENCE_CATEGORIES,
  EMPLOYEE_REQUEST_TYPES,
  EMPLOYEE_SEVERITIES,
  accountStatusLabel,
  accountStatusTone,
  describePortalError,
  employeeItemStatusLabel,
  portalErrorFootnote,
  portalErrorVariant,
  portalShouldSignIn,
  ticketStatusLabel,
  ticketStatusTone,
} from '../src/lib/portal-vocabulary.mjs';

const employeeApi = await readFile(new URL('../src/server/employee-api.mjs', import.meta.url), 'utf8');
const clientSpaceApi = await readFile(new URL('../src/server/client-space-api.mjs', import.meta.url), 'utf8');
const clientAccessApi = await readFile(new URL('../src/server/client-access-api.mjs', import.meta.url), 'utf8');
const employeeUi = await readFile(new URL('../src/app/funcionario/EmployeePortal.tsx', import.meta.url), 'utf8');
const clientProvider = await readFile(new URL('../src/app/cliente/app/ClientSpaceProvider.tsx', import.meta.url), 'utf8');
const clientHome = await readFile(new URL('../src/app/cliente/app/page.tsx', import.meta.url), 'utf8');

/** Todos os códigos que um servidor pode devolver em `{ error: '...' }`. */
function serverErrorCodes(source) {
  const codes = new Set();
  for (const match of source.matchAll(/error:\s*["']([a-z0-9_]+)["']/g)) codes.add(match[1]);
  return codes;
}

const codigosServidor = new Set([
  ...serverErrorCodes(employeeApi),
  ...serverErrorCodes(clientSpaceApi),
  ...serverErrorCodes(clientAccessApi),
]);

test('UX-06 vocabulário: todo código dos servidores de portal tem frase em português', () => {
  assert.ok(codigosServidor.size > 100,
    `esperava mais de cem códigos somando os três servidores, achei ${codigosServidor.size}`);

  const semTraducao = [];
  for (const code of codigosServidor) {
    const descriptor = describePortalError(code, 500);
    // Sem tradução dedicada o fallback devolve o texto genérico de `internal`.
    if (descriptor.title === 'Falha no servidor' && code !== 'internal') semTraducao.push(code);
  }
  assert.deepEqual(semTraducao.sort(), [],
    `códigos dos servidores sem frase em português: ${semTraducao.join(', ')}`);
});

test('UX-06 vocabulário: nenhuma tradução inventa um código que os servidores não devolvem', async () => {
  // Códigos derivados: produzidos a partir de erros do PostgreSQL, de camadas
  // vizinhas ou do próprio cliente HTTP, então não aparecem como literais.
  const derivados = new Set(['internal', 'ticket_or_message_missing']);
  const vocabulario = await readFile(new URL('../src/lib/portal-vocabulary.mjs', import.meta.url), 'utf8');
  const traduzidos = [...vocabulario.matchAll(/^\s{2}([a-z0-9_]+):\s*\{/gm)].map(match => match[1]);
  assert.ok(traduzidos.length > 100, 'o vocabulário deveria cobrir mais de cem códigos');

  const inventados = traduzidos.filter(code => !codigosServidor.has(code) && !derivados.has(code));
  assert.deepEqual(inventados.sort(), [],
    `traduções para códigos inexistentes nos servidores: ${inventados.join(', ')}`);
});

test('UX-06 honestidade: falha de leitura jamais é descrita como ausência de dado', () => {
  const falhas = [
    'employee_home_unavailable', 'employee_api_error', 'employee_auth_unavailable',
    'employee_access_unavailable', 'employee_request_unavailable',
    'employee_request_review_unavailable', 'document_unavailable',
    'password_change_unavailable', 'mfa_login_unavailable', 'idempotency_key_unavailable',
  ];
  for (const code of falhas) {
    const descriptor = describePortalError(code, 503);
    assert.equal(descriptor.kind, 'retry', `${code} é falha de leitura ou gravação, não ausência de dado`);
    assert.equal(descriptor.canRetry, true, `${code} precisa oferecer nova tentativa`);
    assert.doesNotMatch(descriptor.detail, /\bnenhum registro existe\b|\bé zero\b|\bzero registros\b/i,
      `${code} não pode afirmar ausência de dado`);
  }
  // A frase que importa no portal do funcionário.
  assert.match(describePortalError('employee_home_unavailable', 503).detail,
    /NÃO significa que você não tenha plantão/i);
});

test('UX-06 falha de rede: requisição que não chegou não vira dado ausente', () => {
  const descriptor = describePortalError(null, 0);
  assert.equal(descriptor.kind, 'network');
  assert.equal(descriptor.canRetry, true);
  assert.match(descriptor.detail, /não significa que não existam registros/i);
  assert.equal(portalErrorFootnote(descriptor), 'Resposta do servidor: sem resposta.');
});

test('UX-06 sessão: só um 401 de sessão leva a pessoa para a tela de entrada', () => {
  // Este é o defeito corrigido na fatia: antes, QUALQUER erro devolvia o login.
  assert.equal(portalShouldSignIn(describePortalError('employee_session_required', 401)), true);
  assert.equal(portalShouldSignIn(describePortalError('client_session_required', 401)), true);

  for (const [code, status] of [
    ['employee_home_unavailable', 503],
    ['employee_api_error', 500],
    ['permission_scope_denied', 403],
    ['forbidden', 403],
    [null, 0],
  ]) {
    assert.equal(portalShouldSignIn(describePortalError(code, status)), false,
      `${code}/${status} não pode mandar a pessoa para o login`);
  }
});

test('UX-06 diagnóstico: o código canônico fica no rodapé, entre parênteses', () => {
  const descriptor = describePortalError('permission_scope_denied', 403);
  assert.equal(descriptor.title, 'Sem a concessão necessária');
  assert.equal(portalErrorFootnote(descriptor), 'Resposta do servidor: HTTP 403 (permission_scope_denied).');
  assert.doesNotMatch(descriptor.title, /permission_scope_denied/);
  assert.equal(portalErrorVariant(descriptor), 'denied');
  assert.equal(descriptor.canRetry, false, 'uma negativa de concessão não se resolve repetindo');
});

test('UX-06 permissão: o menu não é autorização, e a tela diz isso', () => {
  const descriptor = describePortalError('permission_scope_denied', 403);
  assert.match(descriptor.detail, /aparece no menu, mas a concessão específica não foi dada/i,
    'a recusa precisa separar "papel no menu" de "concessão efetiva"');
  // Remuneração continua exigindo concessão própria, dita em voz alta.
  assert.match(describePortalError('compensation_permission_required', 403).detail,
    /concessão separada/i);
});

test('UX-06 integridade: arquivo ausente ou corrompido é falha, não documento inexistente', () => {
  for (const code of ['document_file_missing', 'document_integrity_failed']) {
    const descriptor = describePortalError(code, 409);
    assert.equal(descriptor.kind, 'error', `${code} precisa ser tratado como falha a reportar`);
    assert.doesNotMatch(descriptor.detail, /não existe\b/i,
      `${code} não pode ser apresentado como documento inexistente`);
  }
});

test('UX-06 idempotência: repetição recusada diz que nada foi gravado duas vezes', () => {
  assert.match(describePortalError('idempotency_key_reused', 409).detail, /Nada foi gravado duas vezes/i);
  assert.match(describePortalError('idempotency_conflict', 409).detail, /Nada foi gravado/i);
  assert.equal(describePortalError('idempotency_key_unavailable', 503).canRetry, true);
  assert.match(describePortalError('idempotency_key_unavailable', 503).detail, /nada foi gravado, de propósito/i);
});

test('UX-06 rótulos: tradução não altera o valor e o desconhecido passa cru', () => {
  assert.equal(accountStatusLabel('active'), 'Ativa');
  assert.equal(accountStatusLabel('SUSPENDED'), 'Suspensa');
  assert.equal(accountStatusLabel(null), '—');
  assert.equal(accountStatusLabel('valor_novo_do_servidor'), 'valor_novo_do_servidor');
  assert.equal(accountStatusTone('closed'), 'danger');
  assert.equal(accountStatusTone('desconhecido'), 'neutral');

  assert.equal(ticketStatusLabel('waiting_client'), 'Aguardando você');
  assert.equal(ticketStatusLabel('situacao_nova'), 'situacao_nova');
  assert.equal(ticketStatusTone('waiting_client'), 'warning');

  assert.equal(employeeItemStatusLabel('em_analise'), 'Em análise');
  assert.equal(employeeItemStatusLabel('status_novo'), 'status_novo');
});

test('UX-06 opções: a tela só oferece valores que o servidor aceita', () => {
  for (const option of EMPLOYEE_REQUEST_TYPES) {
    assert.ok(employeeApi.includes(`'${option.value}'`) || employeeUi.includes(`"${option.value}"`),
      `o tipo de solicitação ${option.value} precisa existir no contrato`);
  }
  assert.deepEqual(EMPLOYEE_SEVERITIES.map(item => item.value), ['baixa', 'media', 'alta', 'critica']);
  assert.deepEqual(EMPLOYEE_OCCURRENCE_CATEGORIES.map(item => item.value),
    ['operacional', 'seguranca', 'equipamento', 'outro']);
});

// ---------------------------------------------------------------------------
// Amarrações de tela. Estas asserções são estáticas: provam o código, não o
// comportamento. O comportamento é provado pelo gate
// scripts/qa-ux-portal-postgres.mjs, com PostgreSQL real e Chromium real.
// ---------------------------------------------------------------------------

/** Remove comentários para que citar um defeito antigo não falseie a busca. */
function semComentarios(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('UX-06 tela: o portal do funcionário tem um tablist de verdade', () => {
  assert.match(employeeUi, /role="tablist"/, 'as abas precisam de um tablist');
  assert.match(employeeUi, /role="tab"/, 'cada aba precisa de role=tab');
  assert.match(employeeUi, /role="tabpanel"/, 'cada painel precisa de role=tabpanel');
  assert.match(employeeUi, /onKeyDown=\{onTabKeyDown\}/, 'as abas precisam responder ao teclado');
  assert.match(employeeUi, /tabIndex=\{tab === id \? 0 : -1\}/, 'só a aba ativa fica na ordem de tabulação');
});

test('UX-06 tela: o portal do funcionário não devolve o login por causa de uma falha', () => {
  assert.match(employeeUi, /portalShouldSignIn/,
    'a decisão de mostrar o login precisa passar pela regra explícita');
  // O padrão antigo: `refresh().catch(() => setSession(null))`. A busca é feita
  // no código sem comentários — o cabeçalho do arquivo cita o defeito antigo de
  // propósito, e citar não é reintroduzir.
  assert.doesNotMatch(semComentarios(employeeUi), /catch\(\s*\(\s*\)\s*=>\s*setSession\(null\)\s*\)/,
    'nenhum catch pode transformar uma falha qualquer em "não autenticado"');
});

test('UX-06 tela: o portal do funcionário usa os estados declarados', () => {
  assert.match(employeeUi, /variant="loading"/, 'carregando precisa ser visível');
  // A falha pode ser renderizada com a variante calculada pelo vocabulário
  // (`denied` quando o servidor nega, `error` quando quebra): ambas são estados
  // declarados do UiState, e é isso que o teste exige.
  assert.match(employeeUi, /variant="error"|variant=\{portalErrorVariant\(/,
    'falha precisa ser visível como estado declarado');
  assert.match(employeeUi, /variant="empty"/, 'vazio precisa ser dito, e separado de falha');
  assert.match(employeeUi, /describePortalError|portalRequest/,
    'as falhas precisam ser descritas pelo vocabulário, não pelo código cru');
});

test('UX-06 tela: todo campo do portal do funcionário tem rótulo associado', () => {
  const ids = [...employeeUi.matchAll(/<(?:input|select|textarea)\s[^>]*\bid=(\{)?["`]?([^"`}\s]+)/g)]
    .map(match => ({ expressao: Boolean(match[1]), id: match[2] }))
    .filter(item => !item.id.includes('${'));
  // Cada campo precisa de um <label for> correspondente, seja o id um literal
  // (`id="x"` -> `htmlFor="x"`) ou uma expressão (`id={fieldId}` -> `htmlFor={fieldId}`).
  const semRotulo = ids
    .filter(item => !employeeUi.includes(item.expressao ? `htmlFor={${item.id}}` : `htmlFor="${item.id}"`))
    .map(item => item.id);
  assert.deepEqual(semRotulo, [], `campos sem <label for>: ${semRotulo.join(', ')}`);
  // E nenhum campo pode depender apenas de placeholder.
  assert.ok(employeeUi.includes('htmlFor='), 'o portal precisa ter rótulos associados');
});

test('UX-06 tela: a área do cliente distingue falha de "sem vínculo"', () => {
  // Defeito corrigido: um erro ao ler /api/client/accounts deixava a lista
  // vazia e a tela afirmava que a identidade ainda não tinha vínculo.
  assert.match(clientProvider, /accountsState/,
    'a provedora precisa declarar o estado da leitura de contas');
  assert.doesNotMatch(clientProvider, /catch\s*\{\s*setNotice\(/,
    'o catch não pode colapsar toda falha numa frase única');
  assert.match(clientHome, /accountsState === ["']error["']|accountsState !== ["']ready["']/,
    'a visão geral precisa consultar o estado antes de afirmar ausência de vínculo');
});

test('UX-06 tela: a área do cliente não anuncia etapa interna de projeto', () => {
  assert.doesNotMatch(clientHome, /Etapa 2/,
    'jargão interno de projeto não pertence à tela de quem é cliente');
});
