// UX-07 / EXT-08 — teste anti-deriva do vocabulário da família CONHECIMENTO.
//
// Ele lê o ARQUIVO REAL de servidor, extrai os códigos de erro e falha se:
//  - existir código real sem descrição no vocabulário;
//  - o vocabulário inventar um código que o servidor não devolve;
//  - o levantamento cair abaixo do limiar (regressão de extração);
//  - o espelho do ciclo de vida (KB_NEXT_STATUS) derivar de KB_TRANSITIONS.
//
// A lição que originou este formato está registrada na seção 4 de
// docs/UX-07-CONTRATOS-2026-10-05.md e na seção 5.3 de
// docs/UX-07-FINANCEIRO-2026-10-05.md: medir apenas `error:` literal simples
// dá falsa segurança. Aqui o extrator casa os formatos conhecidos (literal,
// ternário dentro da expressão de `error:`, `new HttpError()/new E()` e
// wrapper local `bad()/unavailable()`) e remove antes os operandos de
// `.includes('…')` e `[=!]==? '…'`, que são valores de ENUM e nomes de
// constraint — não códigos de erro.
//
// UMA origem real (ver cabeçalho de src/lib/knowledge-vocabulary.mjs):
// src/server/ext-knowledge-api.mjs — servidor canônico, dispatch único de
// /api/ext/knowledge/* em server.mjs. As rotas LEGADAS da família
// (`/api/ext/knowledge-base` e equivalentes de RH) despacham para
// `handleLegacy()` DENTRO do mesmo arquivo, então o código
// `legacy_knowledge_writer_retired` já entra neste levantamento. Não existe
// recorte legado em ext-advanced-api.mjs para esta família.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { KB_TRANSITIONS } from '../src/server/ext-knowledge-api.mjs';
import {
  describeKnowledgeError,
  knowledgeErrorMessage,
  knowledgeErrorVariant,
  knowledgeErrorFootnote,
  kbStatusLabel,
  kbStatusTone,
  knowledgeOriginLabel,
  knowledgeOriginTone,
  knowledgeEventLabel,
  knowledgeEventTone,
  ackSourceLabel,
  accessRoleLabel,
  accessScopeLabel,
  honestDate,
  honestDateTime,
  honestNumber,
  honestPercent,
  honestText,
  count,
  ABSENT,
  PERCENT_NOT_CALCULATED,
  KB_NEXT_STATUS,
  ERROR_MESSAGES,
} from '../src/lib/knowledge-vocabulary.mjs';

const read = url => readFile(new URL(url, import.meta.url), 'utf8');

const canonical = await read('../src/server/ext-knowledge-api.mjs');

function serverErrorCodes(text) {
  const codes = new Set();
  // Operandos de comparação e de `.includes()` são valores de ENUM e nomes de
  // constraint; retirá-los antes evita contar o que não é código.
  const cleaned = text
    .replace(/\.includes\(\s*[`'"][^`'"]*[`'"]\s*\)/g, '')
    .replace(/[=!]==?\s*[`'"][^`'"]*[`'"]/g, '');
  // TODOS os literais dentro da expressão de `error:` contam: é isto que
  // captura o ternário real desta família
  // (`error: bodyResult.large ? "body_too_large" : "invalid_body"`).
  for (const match of cleaned.matchAll(/error:\s*([^,}\n]{1,200})/g)) {
    for (const literal of match[1].matchAll(/[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(literal[1]);
  }
  for (const match of cleaned.matchAll(/new (?:HttpError|E)\(\s*\d+\s*,\s*[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(match[1]);
  for (const match of cleaned.matchAll(/\b(?:bad|unavailable)\(\s*res\s*,\s*[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(match[1]);
  return codes;
}

const codes = serverErrorCodes(canonical);

test('UX-07 conhecimento: a origem única da família continua religada em server.mjs', async () => {
  const server = await read('../server.mjs');
  // Dispatch único do servidor canônico.
  assert.match(server, /createExtKnowledgeApi/);
  assert.match(server, /extKnowledgeApi\.handle\(req, res\)/);
  assert.match(server, /startsWith\("\/api\/ext\/knowledge\/"\)/);
  // As rotas legadas continuam religadas e despacham para handleLegacy()
  // DENTRO do próprio servidor canônico — por isso NÃO há segunda origem de
  // códigos para esta família.
  assert.match(server, /extKnowledgeApi\.handleLegacy\(req, res\)/);
  assert.match(server, /"\/api\/ext\/knowledge-base"/);
  assert.match(canonical, /legacy_knowledge_writer_retired/);
  // ext-advanced-api.mjs ainda contém um handler antigo de conhecimento,
  // mas ele NÃO está religado: server.mjs não despacha knowledge algum para
  // extAdvancedApi. Se isso mudar, há uma segunda origem de códigos e este
  // levantamento passa a estar incompleto — o teste falha aqui.
  assert.doesNotMatch(server, /extAdvancedApi\.handle[A-Za-z]*Knowledge/i,
    'EXT-08 não tem rota viva em ext-advanced-api.mjs');
});

test('UX-07 conhecimento: a família não tem wrapper local de erro', () => {
  // Fato verificado nesta fatia e registrado no documento: tudo sai por
  // `json(res, status, { error: '...' })`, inclusive os `deny` de work(). O
  // extrator continua casando os outros formatos justamente para que a
  // introdução de um wrapper amanhã não passe despercebida.
  assert.doesNotMatch(canonical, /\b(?:bad|unavailable)\(\s*res\s*,/);
  assert.doesNotMatch(canonical, /new (?:HttpError|E)\(\s*\d+\s*,/);
  assert.doesNotMatch(canonical, /new Error\(\s*[`'"][a-z0-9_]+[`'"]\s*\)\s*,\s*\{\s*status/);
});

test('UX-07 conhecimento: o levantamento real de códigos fica acima do limiar anti-deriva', () => {
  // Total real medido nesta fatia: 27 — 25 por `error: "..."` literal simples
  // e 2 pelo ternário de parseBody (`body_too_large`, `invalid_body`). O
  // limiar fica logo abaixo para que a perda de um código falhe o gate.
  assert.ok(codes.size > 25, `esperava mais de 25 códigos na família, achei ${codes.size}`);
  for (const ternary of ['body_too_large', 'invalid_body']) {
    assert.ok(codes.has(ternary), `o código ${ternary} sai por ternário e precisa ser medido`);
  }
  assert.ok(codes.has('legacy_knowledge_writer_retired'), 'a escrita legada aposentada precisa entrar no levantamento');
});

// Título devolvido pelo vocabulário quando o código NÃO tem tradução. É o
// sentinela do teste: qualquer código real que caia nele está descoberto.
const TITULO_SEM_TRADUCAO = describeKnowledgeError('codigo_que_o_servidor_nao_devolve', 500).title;

test('UX-07 conhecimento: todo código real tem descrição em português', () => {
  const faltando = [];
  for (const code of codes) {
    const item = describeKnowledgeError(code, 500);
    if (!item.title || item.title === code || item.title === TITULO_SEM_TRADUCAO) faltando.push(code);
    assert.equal(item.code, code, `o descritor precisa preservar o código canônico ${code}`);
  }
  assert.deepEqual(faltando, [], `códigos reais sem tradução: ${faltando.join(', ')}`);
});

test('UX-07 conhecimento: o vocabulário não inventa código que o servidor não devolve', () => {
  const inventados = Object.keys(ERROR_MESSAGES).filter(code => !codes.has(code));
  assert.deepEqual(inventados, [], `traduções sem código real correspondente: ${inventados.join(', ')}`);
  assert.equal(new Set(Object.keys(ERROR_MESSAGES)).size, Object.keys(ERROR_MESSAGES).length, 'nenhum código duplicado');
});

test('UX-07 conhecimento: código desconhecido passa cru e nunca ganha frase inventada', () => {
  const desconhecido = describeKnowledgeError('codigo_novo_do_servidor', 422);
  assert.equal(desconhecido.code, 'codigo_novo_do_servidor');
  assert.equal(desconhecido.title, 'Falha no servidor');
  assert.match(desconhecido.detail, /codigo_novo_do_servidor/);
  assert.equal(desconhecido.canRetry, false);
  // O código canônico é informação técnica, nunca o título principal.
  assert.match(knowledgeErrorMessage('codigo_novo_do_servidor', 422), /\(codigo_novo_do_servidor\)$/);
  assert.match(knowledgeErrorFootnote(desconhecido), /^Código técnico: \(codigo_novo_do_servidor\)$/);

  // Falha de rede e falha sem código continuam sendo estados próprios.
  const rede = describeKnowledgeError(null, 0);
  assert.equal(rede.kind, 'network');
  assert.equal(rede.code, null);
  assert.match(rede.detail, /não é uma lista vazia nem um resultado zero/i);
  const semCodigo = describeKnowledgeError(null, 502);
  assert.equal(semCodigo.code, null);
  assert.equal(semCodigo.kind, 'error');
  assert.match(semCodigo.detail, /não devolveu um código/i);
});

test('UX-07 conhecimento: recusa de permissão é estado próprio, distinto de falha', () => {
  // EXT-08 decide no próprio servidor canônico: sessão (401 unauthorized),
  // papel de equipe (403 forbidden_role), versão não publicada
  // (403 draft_not_accessible), escopo por papel do procedimento publicado
  // (403 forbidden_by_role_scope), papel de publicação
  // (403 publish_permission_required) e origem de escrita
  // (403 origin_forbidden). Não há permissão granular por grant nesta rota.
  for (const code of [
    'unauthorized', 'forbidden_role', 'draft_not_accessible',
    'forbidden_by_role_scope', 'publish_permission_required', 'origin_forbidden',
  ]) {
    const negado = describeKnowledgeError(code, code === 'unauthorized' ? 401 : 403);
    assert.equal(negado.kind, 'denied', `${code} precisa ser negado`);
    assert.equal(knowledgeErrorVariant(negado), 'denied');
  }
  assert.equal(knowledgeErrorVariant(describeKnowledgeError('knowledge_mutation_failed', 503)), 'error');
  assert.equal(describeKnowledgeError('knowledge_mutation_failed', 503).canRetry, true);
  assert.equal(describeKnowledgeError('audit_unavailable', 503).canRetry, true);
  assert.equal(describeKnowledgeError('database_error', 500).canRetry, true);
  assert.equal(describeKnowledgeError('invalid_status_transition', 409).canRetry, false);
  // "Menu não é autorização" está dito na própria tradução da recusa.
  assert.match(describeKnowledgeError('forbidden_role', 403).detail, /menu não concede acesso/i);
});

test('UX-07 conhecimento: o espelho do ciclo de vida é idêntico ao KB_TRANSITIONS do servidor', () => {
  // O espelho existe só para APRESENTAR transições; se o servidor mudar, este
  // deep-equal falha o gate em vez de deixar a tela derivar em silêncio.
  assert.deepEqual(
    Object.fromEntries(Object.entries(KB_NEXT_STATUS).map(([key, value]) => [key, [...value]])),
    Object.fromEntries(Object.entries(KB_TRANSITIONS).map(([key, value]) => [key, [...value]])),
  );
  // Todo estado e todo alvo do ciclo real têm rótulo em português.
  for (const [status, targets] of Object.entries(KB_TRANSITIONS)) {
    assert.notEqual(kbStatusLabel(status), status, `estado ${status} sem rótulo`);
    for (const target of targets) assert.notEqual(kbStatusLabel(target), target, `alvo ${target} sem rótulo`);
  }
});

test('UX-07 conhecimento: ENUM desconhecido é preservado cru, conhecido sai em português', () => {
  assert.equal(kbStatusLabel('em_revisao'), 'Em revisão');
  assert.equal(kbStatusTone('publicado'), 'success');
  assert.equal(kbStatusLabel('arquivado'), 'Arquivado');
  assert.equal(knowledgeOriginLabel('ext08_canonica'), 'Jornada canônica EXT-08');
  assert.equal(knowledgeOriginTone('registro_legado'), 'warning');
  assert.equal(knowledgeEventLabel('ciencia_registrada'), 'Ciência registrada por colaborador');
  assert.equal(knowledgeEventTone('transicao_publicado'), 'success');
  assert.equal(ackSourceLabel('jornada_canonica'), 'Jornada canônica de ciência');
  assert.equal(accessRoleLabel('operacao'), 'Operação');

  assert.equal(kbStatusLabel('estado_novo_do_banco'), 'estado_novo_do_banco');
  assert.equal(kbStatusTone('estado_novo_do_banco'), 'neutral');
  assert.equal(knowledgeOriginLabel('origem_nova'), 'origem_nova');
  assert.equal(knowledgeEventLabel('evento_novo'), 'evento_novo');
  assert.equal(ackSourceLabel('fonte_nova'), 'fonte_nova');
  assert.equal(accessRoleLabel('papel_novo'), 'papel_novo');
});

test('UX-07 conhecimento: todo ENUM real das migrações e do servidor tem rótulo', async () => {
  // ext_kb_status (migração 086): os cinco estados do ciclo canônico.
  const migration086 = await read('../db/migrations/086-ext07-08-09-10-11-12-compliance-conhecimento-expansao-continuidade-analytics-editor.sql');
  assert.match(migration086, /ext_kb_status AS ENUM \('rascunho','em_revisao','aprovado','publicado','arquivado'\)/);
  for (const status of ['rascunho', 'em_revisao', 'aprovado', 'publicado', 'arquivado']) {
    assert.notEqual(kbStatusLabel(status), status, `kbStatus ${status}`);
  }
  // constraint ext_knowledge_origin_check (migração 160).
  const migration160 = await read('../db/migrations/160-ext08-knowledge-canonical-journey.sql');
  assert.match(migration160, /origin IN \('registro_legado', 'ext08_canonica'\)/);
  for (const origin of ['registro_legado', 'ext08_canonica']) {
    assert.notEqual(knowledgeOriginLabel(origin), origin, `origin ${origin}`);
  }
  // event_type realmente gravado pelo servidor canônico: três literais, o
  // dinâmico `transicao_${nextStatus}` (um por estado do ciclo) e a ciência.
  for (const literal of ['"artigo_criado"', '"artigo_atualizado"', '"nova_versao_criada"', '"ciencia_registrada"']) {
    assert.ok(canonical.includes(literal), `o servidor ainda grava o evento ${literal}`);
  }
  assert.ok(canonical.includes('`transicao_${nextStatus}`'), 'o servidor ainda grava transicao_<estado>');
  for (const event of [
    'artigo_criado', 'artigo_atualizado', 'nova_versao_criada', 'ciencia_registrada',
    'transicao_rascunho', 'transicao_em_revisao', 'transicao_aprovado', 'transicao_publicado', 'transicao_arquivado',
  ]) assert.notEqual(knowledgeEventLabel(event), event, `event_type ${event}`);
  // source da ciência: o servidor insere literalmente 'jornada_canonica'.
  assert.ok(canonical.includes("'jornada_canonica'"), 'o servidor ainda grava a origem jornada_canonica');
  assert.notEqual(ackSourceLabel('jornada_canonica'), 'jornada_canonica');
  // STAFF_ROLES do servidor: cada papel aceito em sessão e em access_roles
  // tem rótulo, e nenhum papel foi inventado no vocabulário.
  const staffRoles = canonical.match(/const STAFF_ROLES = \[([^\]]+)\]/)?.[1]
    ?.match(/"([a-z]+)"/g)?.map(value => value.replaceAll('"', '')) ?? [];
  assert.ok(staffRoles.length >= 8, 'STAFF_ROLES precisa continuar legível no servidor');
  for (const role of staffRoles) {
    assert.notEqual(accessRoleLabel(role), role, `papel ${role} sem rótulo`);
  }
  // Escopo vazio é o comportamento real do servidor: todos os papéis leem.
  assert.equal(accessScopeLabel([]), 'Todos os papéis de equipe autenticados');
  assert.equal(accessScopeLabel(null), 'Todos os papéis de equipe autenticados');
  assert.match(accessScopeLabel(['operacao', 'papel_novo']), /Operação, papel_novo/);
});

test('UX-07 conhecimento: categoria, etiqueta e slug são texto declarado e passam crus', () => {
  // O servidor valida apenas tamanho/formato (3–100, 1–50, SLUG_REGEX): não
  // existe taxonomia fixa para traduzir, e nenhuma é inventada.
  assert.match(canonical, /const SLUG_REGEX/);
  assert.equal(honestText('operacional'), 'operacional');
  assert.equal(honestText('categoria declarada nova'), 'categoria declarada nova');
  assert.equal(honestText(''), ABSENT);
  assert.equal(honestText(null), ABSENT);
});

test('UX-07 conhecimento: ausência é honesta e nunca vira zero, 0% ou 01/01/1970', () => {
  for (const vazio of [null, undefined, '']) {
    assert.equal(honestDate(vazio), ABSENT);
    assert.equal(honestDateTime(vazio), ABSENT);
    assert.equal(count(vazio), ABSENT);
    assert.equal(honestNumber(vazio), ABSENT);
    assert.equal(honestText(vazio), ABSENT);
    assert.equal(honestPercent(vazio), PERCENT_NOT_CALCULATED);
  }
  assert.notEqual(honestDate(null), '01/01/1970');
  assert.notEqual(count(null), '0');
  assert.notEqual(honestPercent(null), '0%');
  assert.equal(kbStatusLabel(null), ABSENT);
  assert.equal(knowledgeOriginLabel(''), ABSENT);

  // Zero REAL vindo do servidor continua sendo zero: o defeito era
  // transformar ausência em zero, não mostrar um zero verdadeiro — o contador
  // de ciências (`ack_count`) é verdadeiro, inclusive quando é zero.
  assert.equal(count(0), '0');
  assert.equal(honestNumber(0), '0');
  assert.equal(honestPercent(0), '0%');

  // Datas e números em pt-BR, sem espaço rígido inesperado.
  assert.equal(honestDate('2026-10-06'), '06/10/2026');
  assert.equal(count(1234567), '1.234.567');
  assert.doesNotMatch(count(1234567), /[\u00a0\u202f]/);
  assert.doesNotMatch(honestDateTime('2026-10-06T12:00:00.000Z'), /[\u00a0\u202f]/);
  assert.doesNotMatch(honestPercent(0.125), /[\u00a0\u202f]/);
  // Valor que não é data continua aparecendo cru, sem virar epoch.
  assert.equal(honestDate('nao-e-data'), 'nao-e-data');
});

test('UX-07 conhecimento: a apresentação não tem style inline e usa o módulo compartilhado', async () => {
  const workspace = await read('../src/app/admin/conhecimento/KnowledgeWorkspace.tsx');
  assert.doesNotMatch(workspace, /style\s*=\s*\{/, 'zero style inline');
  assert.doesNotMatch(workspace, /CSSProperties/, 'nenhum objeto de estilo');
  assert.match(workspace, /UiWorkspace\.module\.css/);
  assert.match(workspace, /<UiState/);
  assert.match(workspace, /knowledgeRequest/);
  // Nenhuma rota, método ou cabeçalho da família foi trocado pela reescrita.
  // Todas as sub-rotas abaixo saem do dispatch real de handle().
  for (const contrato of [
    /`\/api\/ext\/knowledge\/articles\$\{suffix\}`/,
    /"\/api\/ext\/knowledge\/articles"/,
    /`\/api\/ext\/knowledge\/articles\/\$\{id\}`/,
    /`\/api\/ext\/knowledge\/articles\/\$\{id\}\/acknowledgments`/,
    /`\/api\/ext\/knowledge\/articles\/\$\{selectedId\}`/,
    /`\/api\/ext\/knowledge\/articles\/\$\{selectedId\}\/transition`/,
    /`\/api\/ext\/knowledge\/articles\/\$\{selectedId\}\/acknowledge`/,
    /"idempotency-key": k/,
    /"PATCH"/,
  ]) assert.match(workspace, contrato, `contrato preservado: ${contrato}`);
  // Contrato herdado de idempotência: chave preservada após falha.
  assert.match(workspace, /keys\.current\[op\]=k/);
  assert.match(workspace, /delete keys\.current\[op\]/);
  assert.match(workspace, /`ext08-\$\{op\}-\$\{crypto\.randomUUID\(\)\}`/);
  // Toda URL de API chamada pela tela precisa ser do namespace canônico; as
  // rotas legadas religadas NÃO são consumidas aqui.
  for (const [, url] of workspace.matchAll(/["'`](\/api\/[^"'`$]+)/g)) {
    assert.ok(url.startsWith('/api/ext/knowledge/'), `URL fora do namespace canônico: ${url}`);
  }
});

test('UX-07 conhecimento: as abas são tablist/tab/tabpanel reais com roving tabindex', async () => {
  const workspace = await read('../src/app/admin/conhecimento/KnowledgeWorkspace.tsx');
  assert.match(workspace, /role="tablist"/);
  assert.match(workspace, /role="tab"/);
  assert.match(workspace, /role="tabpanel"/);
  assert.match(workspace, /aria-selected=\{active === tab\.id\}/);
  assert.match(workspace, /aria-controls=\{`knowledge-panel-\$\{tab\.id\}`\}/);
  assert.match(workspace, /aria-labelledby="knowledge-tab-/);
  assert.match(workspace, /tabIndex=\{active === tab\.id \? 0 : -1\}/, 'roving tabindex');
  for (const tecla of ['ArrowRight', 'ArrowLeft', '"Home"', '"End"']) assert.match(workspace, new RegExp(tecla));
  assert.doesNotMatch(workspace, /aria-pressed/, 'aria-pressed não substitui tab');
});

test('UX-07 conhecimento: a tela declara as fronteiras reais e não promete além do servidor', async () => {
  const workspace = await read('../src/app/admin/conhecimento/KnowledgeWorkspace.tsx');
  // Honestidade central da família: versão publicada é imutável, ciência é
  // por versão e menu não é autorização.
  assert.match(workspace, /histórico\s+imutável/i);
  assert.match(workspace, /menu\s+não\s+é\s+autorização/i);
  assert.match(workspace, /nunca\s+mostra\s+zero\s+no\s+lugar/i);
  assert.match(workspace, /não\s+inventa\s+versão,\s+revisão,\s+aprovação\s+nem\s+ciência/i);
  assert.match(workspace, /texto\s+declarado\s+pela\s+equipe/i);
  assert.match(workspace, /áreas\s+legadas/i);
  // O servidor realmente aplica o que a tela declara.
  assert.match(canonical, /publish_permission_required/);
  assert.match(canonical, /article_not_published_for_acknowledgment/);
  assert.match(canonical, /ON CONFLICT \(kb_id, user_identity\)/);
});

test('UX-07 conhecimento: a página não alargou o AdminGate nem trocou de servidor', async () => {
  const page = await read('../src/app/admin/conhecimento/page.tsx');
  assert.match(page, /allowedRoles=\{\["marcelo", "admin", "ti"\]\}/);
  // Quem decide é o servidor: sessão de equipe + papel, dentro do canônico.
  assert.match(canonical, /json\(res, 401, \{ error: "unauthorized" \}\)/);
  assert.match(canonical, /json\(res, 403, \{ error: "forbidden_role" \}\)/);
  assert.match(canonical, /const STAFF_ROLES = \["admin", "ti", "marcelo", "rh", "operacao", "supervisor", "comercial", "financeiro"\]/,
    'os papéis aceitos pelo servidor não mudaram');
  assert.match(canonical, /const EDIT_ROLES = \["admin", "ti", "marcelo", "rh", "operacao"\]/);
  assert.match(canonical, /const PUBLISH_ROLES = \["admin", "ti", "marcelo"\]/);
  // Isolamento de origem e idempotência seguem no servidor, intocados.
  assert.match(canonical, /sameOrigin\(req\)/);
  assert.match(canonical, /idempotency_key_required/);
  assert.match(canonical, /audit_unavailable/);
});
