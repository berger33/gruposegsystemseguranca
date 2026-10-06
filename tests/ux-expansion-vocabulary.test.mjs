// UX-10 / EXT-09 — teste anti-deriva do vocabulário da família EXPANSÃO.
//
// Ele lê os ARQUIVOS REAIS (`src/server/ext-expansion-api.mjs`, `server.mjs`,
// a migração 086 e a própria tela) e falha se:
//  - existir código de erro real sem descrição no vocabulário;
//  - o vocabulário inventar um código que o servidor não devolve;
//  - o levantamento cair abaixo do limiar (regressão de extração);
//  - a máquina de estados, a lista de papéis, as transições restritas ou as
//    que exigem justificativa divergirem do servidor;
//  - algum handler exportado deixar de ser despachado em `server.mjs`;
//  - a tela voltar a usar `fetch` cru, estilo inline ou cifra zero inventada.
//
// Nada aqui é afirmação de homologação: é prova de que a apresentação continua
// colada ao contrato do servidor.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  describeExpansionError,
  expansionErrorMessage,
  expansionErrorVariant,
  expansionErrorFootnote,
  planStatusLabel,
  planStatusTone,
  transitionActionLabel,
  planEventLabel,
  allowedTransitions,
  isTerminalStatus,
  requiresJustification,
  requiresApprovalRole,
  honestMoney,
  honestMargin,
  honestCapacity,
  honestDate,
  honestDateTime,
  honestMilestone,
  honestText,
  honestPercent,
  count,
  ABSENT,
  MONEY_ABSENT,
  MARGIN_NOT_CALCULATED,
  PERCENT_NOT_CALCULATED,
  CAPACITY_ABSENT,
  ESTIMATE_BOUNDARY,
  EXTERNAL_BOUNDARY,
  ERROR_MESSAGES,
  ENUMS,
  PLAN_TRANSITIONS,
  TERMINAL_STATUSES,
  READ_ROLES,
  EDIT_ROLES,
  APPROVE_ROLES,
  APPROVAL_ONLY_TRANSITIONS,
  JUSTIFICATION_REQUIRED_TRANSITIONS,
} from '../src/lib/expansion-vocabulary.mjs';

const read = url => readFile(new URL(url, import.meta.url), 'utf8');

const canonical = await read('../src/server/ext-expansion-api.mjs');
const dispatcher = await read('../server.mjs');
const migration = await read('../db/migrations/086-ext07-08-09-10-11-12-compliance-conhecimento-expansao-continuidade-analytics-editor.sql');
const workspace = await read('../src/app/admin/expansao/ExpansionWorkspace.tsx');
const page = await read('../src/app/admin/expansao/page.tsx');

/**
 * Extrator dos códigos reais. A família devolve tudo por
 * `json(res, status, { error: '...' })` ou por `{ error: '...', status }`
 * dentro de `work()`. Operandos de comparação e de `.includes()` são
 * removidos antes: são valores de ENUM e códigos de erro do PostgreSQL, não
 * códigos da API. O casamento de `new HttpError()/new E()` e de wrappers
 * locais fica no extrator para que a introdução de um deles amanhã não passe
 * despercebida.
 */
function serverErrorCodes(text) {
  const codes = new Set();
  const cleaned = text
    .replace(/\.includes\(\s*[`'"][^`'"]*[`'"]\s*\)/g, '')
    .replace(/[=!]==?\s*[`'"][^`'"]*[`'"]/g, '');
  for (const match of cleaned.matchAll(/error:\s*([^,}\n]{1,200})/g)) {
    for (const literal of match[1].matchAll(/[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(literal[1]);
  }
  for (const match of cleaned.matchAll(/new (?:HttpError|E)\(\s*\d+\s*,\s*[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(match[1]);
  for (const match of cleaned.matchAll(/\b(?:bad|unavailable|deny)\(\s*res\s*,\s*[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(match[1]);
  return codes;
}

/** Lê `const NOME = ['a','b'];` direto do fonte do servidor. */
function serverStringArray(text, name) {
  const match = text.match(new RegExp(`const ${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  assert.ok(match, `o servidor precisa continuar declarando ${name}`);
  return [...match[1].matchAll(/[`'"]([a-z0-9_]+)[`'"]/g)].map(item => item[1]);
}

/** Lê o objeto `VALID_TRANSITIONS` direto do fonte do servidor. */
function serverTransitions(text) {
  const block = text.match(/const VALID_TRANSITIONS\s*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(block, 'o servidor precisa continuar declarando VALID_TRANSITIONS');
  const map = {};
  for (const line of block[1].split('\n')) {
    const entry = line.match(/^\s*([a-z_]+)\s*:\s*\[([^\]]*)\]/);
    if (!entry) continue;
    map[entry[1]] = [...entry[2].matchAll(/[`'"]([a-z0-9_]+)[`'"]/g)].map(item => item[1]);
  }
  return map;
}

const codes = serverErrorCodes(canonical);

test('UX-10 expansão: o servidor canônico continua sendo o único religado', () => {
  assert.match(dispatcher, /createExtExpansionApi/);
  assert.match(dispatcher, /from "\.\/src\/server\/ext-expansion-api\.mjs"/);
  // Rota canônica despachada por prefixo e presente na borda de API do Next.
  assert.match(dispatcher, /url\.pathname\.startsWith\("\/api\/ext\/expansion\/"\)\) return extExpansionApi\.handle\(req, res\)/);
  assert.match(dispatcher, /pathname\.startsWith\("\/api\/ext\/expansion\/"\)/);
  // Os dois grupos de alias legados continuam somente-leitura, cada um no seu
  // handler.
  assert.match(dispatcher, /extExpansionApi\.handleLegacyPlans\(req, res\)/);
  assert.match(dispatcher, /extExpansionApi\.handleLegacyScenarios\(req, res\)/);
  for (const alias of [
    '/api/admin/hr/ext-expansion-plans', '/api/crm/hr/ext-expansion-plans',
    '/api/hr/ext-expansion-plans', '/api/ext/expansion-plans',
    '/api/admin/hr/ext-expansion-scenarios', '/api/crm/hr/ext-expansion-scenarios',
    '/api/hr/ext-expansion-scenarios', '/api/ext/expansion-scenarios',
  ]) {
    assert.ok(dispatcher.includes(`"${alias}"`), `o alias legado ${alias} continua religado`);
  }
});

test('UX-10 expansão: todo handler exportado é despachado — nenhum handler morto', () => {
  // O `return` da fábrica é o último bloco do arquivo, com indentação de dois
  // espaços; os `return { error: ... }` internos ficam de fora.
  const exported = canonical.match(/\n  return \{\n([\s\S]*?)\n  \};\n\}/);
  assert.ok(exported, 'a fábrica precisa continuar devolvendo o conjunto de handlers');
  const names = [...exported[1].matchAll(/([A-Za-z][A-Za-z0-9]*)/g)].map(item => item[1]);
  assert.deepEqual(names, ['handle', 'handleLegacyPlans', 'handleLegacyScenarios']);
  for (const name of names) {
    assert.ok(dispatcher.includes(`extExpansionApi.${name}(`), `${name} precisa estar no dispatch`);
  }
});

test('UX-10 expansão: as rotas usadas pela tela são exatamente as do servidor', () => {
  // Cada caminho chamado pelo workspace existe como rota reconhecida pelo
  // roteador do servidor canônico. A tela não inventa endpoint.
  assert.match(canonical, /url\.pathname === "\/api\/ext\/expansion\/plans" && req\.method === "GET"/);
  assert.match(canonical, /url\.pathname === "\/api\/ext\/expansion\/plans" && req\.method === "POST"/);
  assert.match(canonical, /\^\\\/api\\\/ext\\\/expansion\\\/plans\\\/\(\[0-9a-f-\]\{36\}\)\$/);
  assert.match(canonical, /\\\/transition\$/);
  assert.match(canonical, /\\\/scenarios\$/);
  assert.match(canonical, /\^\\\/api\\\/ext\\\/expansion\\\/scenarios\\\/\(\[0-9a-f-\]\{36\}\)\$/);
  assert.match(canonical, /planDetailMatch && req\.method === "PATCH"/);
  assert.match(canonical, /scenarioDelMatch && req\.method === "DELETE"/);

  for (const url of [
    '`/api/ext/expansion/plans${query}`',
    '"/api/ext/expansion/plans"',
    '`/api/ext/expansion/plans/${id}`',
    '`/api/ext/expansion/plans/${selectedId}`',
    '`/api/ext/expansion/plans/${selectedId}/transition`',
    '`/api/ext/expansion/plans/${selectedId}/scenarios`',
    '`/api/ext/expansion/scenarios/${scenarioId}`',
  ]) {
    assert.ok(workspace.includes(url), `a tela precisa continuar usando ${url}`);
  }
  // Nenhum caminho de expansão fora dos sete acima. O cabeçalho de comentário
  // da tela também lista as rotas, em prosa: só o código executável conta.
  const executavel = workspace.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
  const used = new Set([...executavel.matchAll(/\/api\/ext\/expansion\/[A-Za-z0-9${}/_-]*/g)].map(item => item[0]));
  assert.deepEqual(
    [...used].sort(),
    [
      '/api/ext/expansion/plans',
      '/api/ext/expansion/plans${query}',
      '/api/ext/expansion/plans/${id}',
      '/api/ext/expansion/plans/${selectedId}',
      '/api/ext/expansion/plans/${selectedId}/scenarios',
      '/api/ext/expansion/plans/${selectedId}/transition',
      '/api/ext/expansion/scenarios/${scenarioId}',
    ].sort(),
  );
});

test('UX-10 expansão: o levantamento real de códigos fica acima do limiar anti-deriva', () => {
  // Total real medido nesta fatia: 28, todos em src/server/ext-expansion-api.mjs.
  // O limiar fica logo abaixo para que a perda de um código falhe o gate.
  assert.ok(codes.size > 26, `esperava mais de 26 códigos na família, achei ${codes.size}`);
});

// Título devolvido pelo vocabulário quando o código NÃO tem tradução. É o
// sentinela do teste: qualquer código real que caia nele está descoberto.
const TITULO_SEM_TRADUCAO = describeExpansionError('codigo_que_o_servidor_nao_devolve', 500).title;

test('UX-10 expansão: todo código real do servidor tem descrição em português', () => {
  const faltando = [];
  for (const code of codes) {
    const item = describeExpansionError(code, 500);
    if (!item.title || item.title === code || item.title === TITULO_SEM_TRADUCAO) faltando.push(code);
    assert.equal(item.code, code, `o descritor precisa preservar o código canônico ${code}`);
  }
  assert.deepEqual(faltando, [], `códigos reais sem tradução: ${faltando.join(', ')}`);
});

test('UX-10 expansão: o vocabulário não inventa código que o servidor não devolve', () => {
  const inventados = Object.keys(ERROR_MESSAGES).filter(code => !codes.has(code));
  assert.deepEqual(inventados, [], `traduções sem código real correspondente: ${inventados.join(', ')}`);
  assert.equal(new Set(Object.keys(ERROR_MESSAGES)).size, Object.keys(ERROR_MESSAGES).length, 'nenhum código duplicado');
});

test('UX-10 expansão: código desconhecido passa cru e nunca ganha frase inventada', () => {
  const desconhecido = describeExpansionError('codigo_novo_do_servidor', 422);
  assert.equal(desconhecido.code, 'codigo_novo_do_servidor');
  assert.equal(desconhecido.title, 'Falha no servidor');
  assert.match(desconhecido.detail, /codigo_novo_do_servidor/);
  assert.equal(desconhecido.canRetry, false);
  assert.match(expansionErrorMessage('codigo_novo_do_servidor', 422), /\(codigo_novo_do_servidor\)$/);
  assert.equal(expansionErrorFootnote(desconhecido), 'Código técnico: codigo_novo_do_servidor (HTTP 422)');
  assert.equal(
    expansionErrorFootnote(describeExpansionError('forbidden_role', 0)),
    'Código técnico: forbidden_role (sem resposta HTTP)',
  );

  const rede = describeExpansionError(null, 0);
  assert.equal(rede.kind, 'network');
  assert.equal(rede.code, null);
  assert.match(rede.detail, /não é uma lista vazia nem um resultado zero/i);

  const semCodigo = describeExpansionError(null, 502);
  assert.equal(semCodigo.code, null);
  assert.equal(semCodigo.kind, 'error');
  assert.match(semCodigo.detail, /não devolveu um código/i);
  assert.equal(expansionErrorFootnote(semCodigo), 'Código técnico: indisponível');
});

test('UX-10 expansão: recusa de papel é NEGADO, estado próprio e distinto de falha', () => {
  for (const code of ['unauthorized', 'forbidden_role', 'origin_forbidden', 'approve_permission_required']) {
    const negado = describeExpansionError(code, 403);
    assert.equal(negado.kind, 'denied', `${code} precisa ser recusa, não falha`);
    assert.equal(expansionErrorVariant(negado), 'denied');
  }
  // Indisponibilidade continua sendo falha com repetição possível.
  for (const code of ['audit_unavailable', 'database_error', 'internal_error']) {
    const falha = describeExpansionError(code, 503);
    assert.equal(expansionErrorVariant(falha), 'error');
    assert.equal(falha.canRetry, true, `${code} é transitório e permite repetir`);
  }
  // Conflito de negócio não é transitório: repetir não resolve.
  for (const code of ['invalid_transition', 'scenario_name_duplicate', 'cannot_update_in_current_status']) {
    assert.equal(describeExpansionError(code, 409).canRetry, false);
  }
});

test('UX-10 expansão: a máquina de estados da tela é espelho do servidor', () => {
  const doServidor = serverTransitions(canonical);
  assert.deepEqual(
    Object.keys(PLAN_TRANSITIONS).sort(),
    Object.keys(doServidor).sort(),
    'o domínio de situações precisa ser o mesmo do servidor',
  );
  for (const [status, destinos] of Object.entries(doServidor)) {
    assert.deepEqual([...allowedTransitions(status)], destinos, `transições divergentes a partir de ${status}`);
  }
  // Terminais são exatamente as situações sem destino no servidor.
  const terminaisReais = Object.entries(doServidor).filter(([, destinos]) => destinos.length === 0).map(([status]) => status);
  assert.deepEqual([...TERMINAL_STATUSES].sort(), terminaisReais.sort());
  for (const status of terminaisReais) assert.equal(isTerminalStatus(status), true);
  assert.equal(isTerminalStatus('rascunho'), false);
  // Situação desconhecida não ganha transição inventada.
  assert.deepEqual([...allowedTransitions('situacao_nova_do_banco')], []);
});

test('UX-10 expansão: o ENUM do banco e o domínio do servidor têm rótulo em português', () => {
  const enumBanco = migration.match(/CREATE TYPE ext_expansion_status AS ENUM \(([^)]*)\)/);
  assert.ok(enumBanco, 'a migração 086 precisa continuar definindo ext_expansion_status');
  const valores = [...enumBanco[1].matchAll(/'([a-z_]+)'/g)].map(item => item[1]);
  assert.deepEqual(valores.sort(), Object.keys(PLAN_TRANSITIONS).sort(), 'ENUM do banco e máquina de estados coincidem');
  for (const status of valores) {
    assert.notEqual(planStatusLabel(status), status, `${status} precisa de rótulo em português`);
    assert.notEqual(transitionActionLabel(status), status, `${status} precisa de verbo de ação em português`);
  }
  assert.equal(planStatusLabel('em_analise'), 'Em análise');
  assert.equal(planStatusTone('rejeitado'), 'danger');
  // Valor desconhecido continua cru: nada é inventado.
  assert.equal(planStatusLabel('situacao_nova_do_banco'), 'situacao_nova_do_banco');
  assert.equal(planStatusTone('situacao_nova_do_banco'), 'neutral');
  assert.equal(planStatusLabel(null), ABSENT);
});

test('UX-10 expansão: os papéis exibidos são os que o servidor realmente usa', () => {
  assert.deepEqual([...READ_ROLES], serverStringArray(canonical, 'STAFF_ROLES'));
  assert.deepEqual([...EDIT_ROLES], serverStringArray(canonical, 'EDIT_ROLES'));
  assert.deepEqual([...APPROVE_ROLES], serverStringArray(canonical, 'APPROVE_ROLES'));
  // O AdminGate da página continua coerente com a leitura do servidor e não
  // foi alargado por esta fatia.
  const gate = page.match(/allowedRoles=\{\[([^\]]*)\]\}/);
  assert.ok(gate, 'a página precisa continuar montada sob AdminGate');
  const papeisDaPagina = [...gate[1].matchAll(/"([a-z]+)"/g)].map(item => item[1]);
  assert.deepEqual(papeisDaPagina.sort(), [...READ_ROLES].sort(), 'menu e leitura do servidor descrevem o mesmo conjunto');
});

test('UX-10 expansão: restrição de decisão e de justificativa vem do servidor', () => {
  const restritas = canonical.match(/if \(\[([^\]]*)\]\.includes\(nextStatus\) && !APPROVE_ROLES/);
  assert.ok(restritas, 'o servidor precisa continuar restringindo a decisão por papel');
  const listaRestrita = [...restritas[1].matchAll(/"([a-z_]+)"/g)].map(item => item[1]);
  assert.deepEqual([...APPROVAL_ONLY_TRANSITIONS], listaRestrita);
  for (const status of listaRestrita) assert.equal(requiresApprovalRole(status), true);
  assert.equal(requiresApprovalRole('em_analise'), false);

  const justificativa = canonical.match(/if \(\[([^\]]*)\]\.includes\(nextStatus\) && !justification\)/);
  assert.ok(justificativa, 'o servidor precisa continuar exigindo justificativa formal');
  const listaJustificativa = [...justificativa[1].matchAll(/"([a-z_]+)"/g)].map(item => item[1]);
  assert.deepEqual([...JUSTIFICATION_REQUIRED_TRANSITIONS], listaJustificativa);
  for (const status of listaJustificativa) assert.equal(requiresJustification(status), true);
  assert.equal(requiresJustification('aprovado'), false);
});

test('UX-10 expansão: todo event_type gravado pelo servidor tem rótulo', () => {
  const literais = [...canonical.matchAll(/eventType:\s*"([a-z_]+)"/g)].map(item => item[1]);
  assert.deepEqual(literais.sort(), ['cenario_adicionado', 'cenario_removido', 'plano_atualizado', 'plano_criado']);
  // Os eventos de transição são montados como `status_${nextStatus}`.
  assert.match(canonical, /eventType: `status_\$\{nextStatus\}`/);
  const todos = [...literais, ...Object.keys(PLAN_TRANSITIONS).map(status => `status_${status}`)];
  for (const event of todos) {
    assert.notEqual(planEventLabel(event), event, `o evento ${event} precisa de rótulo em português`);
  }
  assert.deepEqual(Object.keys(ENUMS.planEvent).sort(), todos.sort(), 'nenhum evento traduzido a mais nem a menos');
  assert.equal(planEventLabel('evento_novo_do_servidor'), 'evento_novo_do_servidor');
  assert.equal(planEventLabel(null), ABSENT);
});

test('UX-10 expansão: ausência nunca vira zero, R$ 0,00, 0% ou 01/01/1970', () => {
  for (const vazio of [null, undefined, '']) {
    assert.equal(honestMoney(vazio), MONEY_ABSENT);
    assert.equal(honestMargin(vazio), MARGIN_NOT_CALCULATED);
    assert.equal(honestCapacity(vazio), CAPACITY_ABSENT);
    assert.equal(count(vazio), ABSENT);
    assert.equal(honestDate(vazio), ABSENT);
    assert.equal(honestDateTime(vazio), ABSENT);
    assert.equal(honestText(vazio), ABSENT);
    assert.equal(honestPercent(vazio), PERCENT_NOT_CALCULATED);
    assert.equal(honestMilestone(vazio, 'Aprovação pendente'), 'Aprovação pendente');
  }
  assert.notEqual(honestMoney(null), 'R$ 0,00');
  assert.notEqual(honestMargin(null), 'R$ 0,00');
  assert.notEqual(count(null), '0');
  assert.notEqual(honestDate(null), '01/01/1970');
  assert.notEqual(honestDateTime(null), '01/01/1970, 00:00');
});

test('UX-10 expansão: zero real do servidor continua sendo zero, não ausência', () => {
  // BIGINT chega como string pelo driver pg: as duas formas valem.
  assert.equal(honestMoney(0), 'R$ 0,00');
  assert.equal(honestMoney('0'), 'R$ 0,00');
  assert.equal(honestMargin(0), 'R$ 0,00');
  assert.equal(honestMoney('5000000'), 'R$ 50.000,00');
  assert.equal(honestMoney(123456), 'R$ 1.234,56');
  assert.equal(honestMargin('-250000'), '-R$ 2.500,00');
  assert.equal(honestCapacity(0), '0 vagas declaradas');
  assert.equal(honestCapacity(1), '1 vaga declarada');
  assert.equal(honestCapacity('12'), '12 vagas declaradas');
  assert.equal(count(0), '0');
  assert.equal(honestDate('2026-10-06T12:00:00.000Z'), '06/10/2026');
  assert.equal(honestMilestone('2026-10-06T12:00:00.000Z', 'Aprovação pendente'), '06/10/2026, 12:00');
  // Valor ilegível não vira zero silencioso.
  assert.equal(honestMoney('não é número'), MONEY_ABSENT);
});

test('UX-10 expansão: a fronteira declarada não promete integração nem certeza', () => {
  assert.match(ESTIMATE_BOUNDARY, /estimativa declarada/i);
  assert.match(ESTIMATE_BOUNDARY, /receita contratada/i);
  assert.match(EXTERNAL_BOUNDARY, /Não há integração com fonte externa/i);
  // A migração sustenta a frase: estimativa é marca do próprio banco.
  assert.match(migration, /is_estimate BOOLEAN NOT NULL DEFAULT true/);
  assert.match(migration, /estimate_note TEXT NOT NULL DEFAULT 'planejamento é estimativa identificada sem projeção vendida como certeza'/);
});

test('UX-10 expansão: a tela não volta a inventar zero, estilo inline ou fetch cru', () => {
  assert.doesNotMatch(workspace, /style=\{\{/, 'a tela usa a superfície compartilhada, não estilo inline');
  assert.doesNotMatch(workspace, /R\$ 0,00/, 'nenhuma cifra zero literal na tela');
  assert.doesNotMatch(workspace, /\|\|\s*0\b/, 'ausência não pode virar zero por coalescência');
  assert.doesNotMatch(workspace, /\?\?\s*0\b/, 'ausência não pode virar zero por coalescência');
  assert.doesNotMatch(workspace, /\bawait fetch\(/, 'toda chamada passa pelo transporte da família');
  assert.doesNotMatch(workspace, /toLocaleString\(/, 'formatação de número vem do vocabulário');
  assert.match(workspace, /expansionRequest/, 'a tela usa o transporte discriminado');
  // Prefixos de idempotência do protótipo preservados literalmente.
  for (const prefix of ['"plan-"', '"trans-"', '"scen-"', '"del-scen-"']) {
    assert.ok(workspace.includes(prefix), `o prefixo de idempotência ${prefix} precisa ser preservado`);
  }
  // A chave é preservada enquanto falha e descartada só no sucesso.
  assert.match(workspace, /keys\.current\[op\] = key/);
  assert.match(workspace, /delete keys\.current\[op\]/);
});
