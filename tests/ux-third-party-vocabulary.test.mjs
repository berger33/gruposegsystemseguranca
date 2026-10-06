// UX-07 / EXT-02 — teste anti-deriva do vocabulário da família TERCEIROS.
//
// Ele lê os ARQUIVOS REAIS de servidor, extrai os códigos de erro e falha se:
//  - existir código real sem descrição no vocabulário;
//  - o vocabulário inventar um código que o servidor não devolve;
//  - o levantamento cair abaixo do limiar (regressão de extração);
//  - a rota legada VIVA sair do dispatch sem refazer o levantamento;
//  - algum handler exportado pelo servidor canônico sair do dispatch (origem
//    morta nova, que obrigaria a rever a decisão registrada).
//
// A lição que originou este formato está registrada na seção 4 de
// docs/UX-07-CONTRATOS-2026-10-05.md e na seção 3 de
// docs/UX-07-FROTA-2026-10-06.md: medir apenas `error:` literal dá falsa
// segurança. Aqui o extrator casa os quatro formatos conhecidos (literal,
// `new HttpError()/new E()`, wrapper local `bad()/unavailable()` e a exceção
// `new Error('codigo')` convertida em resposta) e remove antes os operandos de
// `.includes('…')` e `[=!]==? '…'`, que são valores de ENUM e nomes de método
// HTTP — não códigos de erro. Nesta família isso importa porque treze códigos
// só aparecem dentro de `{ deny: { code, body: { error: … } } }`.
//
// ORIGENS, e a decisão registrada sobre cada uma:
//  1. src/server/ext-third-party-api.mjs — servidor canônico, dispatch de
//     /api/ext/third-party/* em server.mjs (~4245–4266). Única origem VIVA.
//  2. O recorte legado (`handleLegacyThirdParties` e
//     `handleLegacyThirdPartyDocuments`) mora no MESMO arquivo canônico e
//     continua RELIGADO (~4266–4274 e ~5958–5962). Por ser rota VIVA,
//     `legacy_route_retired` ENTRA no vocabulário — mesmo critério aplicado em
//     EXT-01 (Frota) e EXT-06 (Satisfação).
//  3. NÃO há handler morto nesta família: os doze handlers exportados por
//     `createExtThirdPartyApi()` estão todos no dispatch. Este teste fixa a
//     decisão: se algum sair do dispatch, o levantamento precisa ser refeito.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  describeThirdPartyError,
  thirdPartyErrorMessage,
  thirdPartyErrorVariant,
  thirdPartyErrorFootnote,
  thirdPartyStatusLabel,
  thirdPartyStatusTone,
  scopeKindLabel,
  windowStatusLabel,
  windowStatusTone,
  accessSituationLabel,
  decisionReasonLabel,
  documentExpiryLabel,
  documentRuleAbsenceLabel,
  thirdPartyEventLabel,
  windowSummary,
  expirySummary,
  evaluationScoreLabel,
  honestDate,
  honestDateTime,
  honestText,
  responsibleLabel,
  count,
  ABSENT,
  NO_RESPONSIBLE,
  NO_CONTRACT,
  NO_EVALUATION,
  EXTERNAL_BOUNDARY,
  ERROR_MESSAGES,
} from '../src/lib/third-party-vocabulary.mjs';

const read = url => readFile(new URL(url, import.meta.url), 'utf8');

const canonical = await read('../src/server/ext-third-party-api.mjs');
const server = await read('../server.mjs');
const workspace = await read('../src/app/admin/terceiros/TerceirosWorkspace.tsx');
const migration148 = await read('../db/migrations/148-ext02-third-parties-canonical-journey.sql');

function serverErrorCodes(text) {
  const codes = new Set();
  // Operandos de comparação e de `.includes()` são valores de ENUM, nomes de
  // método HTTP e constantes de negócio; retirá-los antes evita contar o que
  // não é código de erro.
  const cleaned = text
    .replace(/\.includes\(\s*[`'"][^`'"]*[`'"]\s*\)/g, '')
    .replace(/[=!]==?\s*[`'"][^`'"]*[`'"]/g, '');
  for (const match of cleaned.matchAll(/error:\s*([^,}\n]{1,200})/g)) {
    for (const literal of match[1].matchAll(/[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(literal[1]);
  }
  for (const match of cleaned.matchAll(/new (?:HttpError|E)\(\s*\d+\s*,\s*[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(match[1]);
  for (const match of cleaned.matchAll(/\b(?:bad|unavailable)\(\s*res\s*,\s*[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(match[1]);
  for (const match of cleaned.matchAll(/new Error\(\s*[`'"]([a-z0-9_]+)[`'"]\s*\)\s*,\s*\{\s*status/g)) codes.add(match[1]);
  return codes;
}

const codes = serverErrorCodes(canonical);

test('UX-07 terceiros: o servidor canônico continua religado rota a rota', () => {
  assert.match(server, /createExtThirdPartyApi/);
  assert.match(server, /url\.pathname === "\/api\/ext\/third-party\/parties"/);
  assert.match(server, /\/api\\\/ext\\\/third-party\\\/parties\\\/\(\[0-9a-f-\]\{36\}\)\$/);
  // Nenhum handler exportado pode sair do dispatch sem refazer o levantamento.
  for (const handler of [
    'handleParties', 'handlePartyById', 'handlePartyContract', 'handlePartyAccessGrants',
    'handlePartyAuthorization', 'handlePartyDocuments', 'handlePartyDocumentRules',
    'handlePartyEvaluations', 'handleAccessGrantRevoke', 'handleDocumentDeactivate',
    'handleLegacyThirdParties', 'handleLegacyThirdPartyDocuments',
  ]) {
    assert.ok(canonical.includes(handler), `o servidor canônico ainda exporta ${handler}`);
    assert.match(server, new RegExp(`extThirdPartyApi\\.${handler}`), `${handler} precisa continuar no dispatch`);
  }
});

test('UX-07 terceiros: a rota legada continua VIVA e por isso entra no vocabulário', () => {
  // Decisão registrada: a rota antiga responde 200 em leitura e 410
  // `legacy_route_retired` em mutação, e os aliases continuam religados. Por
  // ser VIVA, o seu código entra no vocabulário. Se os aliases saírem do
  // dispatch, este teste falha e o levantamento precisa ser refeito.
  for (const alias of [
    '/api/admin/hr/ext-third-parties',
    '/api/crm/hr/ext-third-parties',
    '/api/hr/ext-third-parties',
    '/api/ext/third-parties',
    '/api/admin/hr/ext-third-party-documents',
    '/api/crm/hr/ext-third-party-documents',
    '/api/hr/ext-third-party-documents',
    '/api/ext/third-party-documents',
  ]) {
    assert.ok(server.includes(`"${alias}"`), `o alias legado ${alias} continua religado em server.mjs`);
  }
  assert.match(canonical, /legacy_route_retired/);
  assert.match(canonical, /use: "\/api\/ext\/third-party\/parties"/);
  assert.ok(codes.has('legacy_route_retired'), 'a rota legada religada precisa entrar no levantamento');
  assert.ok('legacy_route_retired' in ERROR_MESSAGES);
});

test('UX-07 terceiros: a família não tem wrapper local nem exceção convertida', () => {
  // Fato verificado nesta fatia e registrado no documento: tudo sai por
  // `json(res, status, { error: '...' })`, inclusive os `deny` montados em
  // `work()` e devolvidos por `runMutation()`. `readBody()` responde via quem
  // chama, sem lançar. O extrator continua casando os outros formatos
  // justamente para que um wrapper futuro não passe despercebido.
  assert.doesNotMatch(canonical, /\b(?:bad|unavailable)\(\s*res\s*,/);
  assert.doesNotMatch(canonical, /new (?:HttpError|E)\(\s*\d+\s*,/);
  assert.doesNotMatch(canonical, /new Error\(\s*[`'"][a-z0-9_]+[`'"]\s*\)\s*,\s*\{\s*status/);
  assert.doesNotMatch(canonical, /\bthrow new\b/);
  // Diferente de EXT-01 e EXT-06, nenhum código desta família mora dentro de
  // um ternário: o levantamento conferiu e registrou a ausência.
  assert.doesNotMatch(canonical, /\?[^\n]*error:\s*[`'"]/);
});

test('UX-07 terceiros: o levantamento real de códigos fica acima do limiar anti-deriva', () => {
  // Total real medido nesta fatia: 49 códigos, todos no servidor canônico.
  assert.ok(codes.size >= 49, `esperava ao menos 49 códigos na família, achei ${codes.size}`);
  // Estes só existem dentro de `{ deny: { code, body: { error } } }`.
  for (const negado of [
    'third_party_not_found', 'contract_not_found', 'contract_rebind_blocked_by_active_grant',
    'third_party_not_active', 'contract_not_bound_to_third_party', 'contract_not_grantable',
    'service_order_not_found', 'service_order_not_grantable', 'service_order_outside_contract',
    'access_grant_not_found', 'access_grant_already_revoked', 'document_not_found',
    'document_already_inactive',
  ]) {
    assert.ok(codes.has(negado), `o código ${negado} sai de um deny e precisa ser medido`);
  }
  assert.match(canonical, /return \{ deny: \{ code: 404, body: \{ error: "third_party_not_found" \} \} \}/);
  // Guardas de sessão, papel, origem, idempotência e auditoria.
  for (const guarda of [
    'unauthorized', 'forbidden_role', 'origin_forbidden', 'idempotency_key_required',
    'idempotency_key_reused', 'audit_unavailable', 'third_party_unavailable', 'body_too_large',
  ]) {
    assert.ok(codes.has(guarda), `o código de guarda ${guarda} precisa ser medido`);
  }
});

// Título devolvido pelo vocabulário quando o código NÃO tem tradução. É o
// sentinela do teste: qualquer código real que caia nele está descoberto.
const TITULO_SEM_TRADUCAO = describeThirdPartyError('codigo_que_o_servidor_nao_devolve', 500).title;

test('UX-07 terceiros: todo código real do servidor tem descrição em português', () => {
  const faltando = [];
  for (const code of codes) {
    const item = describeThirdPartyError(code, 500);
    if (!item.title || item.title === code || item.title === TITULO_SEM_TRADUCAO) faltando.push(code);
    assert.equal(item.code, code, `o descritor precisa preservar o código canônico ${code}`);
  }
  assert.deepEqual(faltando, [], `códigos reais sem tradução: ${faltando.join(', ')}`);
});

test('UX-07 terceiros: o vocabulário não inventa código que o servidor não devolve', () => {
  const inventados = Object.keys(ERROR_MESSAGES).filter(code => !codes.has(code));
  assert.deepEqual(inventados, [], `traduções sem código real correspondente: ${inventados.join(', ')}`);
  assert.equal(new Set(Object.keys(ERROR_MESSAGES)).size, Object.keys(ERROR_MESSAGES).length, 'nenhum código duplicado');
});

test('UX-07 terceiros: código desconhecido passa cru e nunca ganha frase inventada', () => {
  const desconhecido = describeThirdPartyError('codigo_novo_do_servidor', 422);
  assert.equal(desconhecido.code, 'codigo_novo_do_servidor');
  assert.equal(desconhecido.title, 'Falha no servidor');
  assert.match(desconhecido.detail, /codigo_novo_do_servidor/);
  assert.equal(desconhecido.canRetry, false);
  // O código canônico é informação técnica, nunca o título principal.
  assert.match(thirdPartyErrorMessage('codigo_novo_do_servidor', 422), /\(codigo_novo_do_servidor\)$/);
  assert.match(thirdPartyErrorFootnote(desconhecido), /^Código técnico: \(codigo_novo_do_servidor\)$/);

  // Falha de rede e falha sem código continuam sendo estados próprios.
  const rede = describeThirdPartyError(null, 0);
  assert.equal(rede.kind, 'network');
  assert.equal(rede.code, null);
  assert.match(rede.detail, /não é uma lista vazia de terceiros/i);
  assert.equal(thirdPartyErrorFootnote(rede), 'Código técnico: indisponível');
  const semCodigo = describeThirdPartyError(null, 500);
  assert.equal(semCodigo.kind, 'error');
  assert.equal(semCodigo.code, null);
  assert.equal(semCodigo.canRetry, true);

  // Recusa de papel é estado NEGADO, distinto de falha de leitura.
  assert.equal(thirdPartyErrorVariant(describeThirdPartyError('forbidden_role', 403)), 'denied');
  assert.equal(thirdPartyErrorVariant(describeThirdPartyError('unauthorized', 401)), 'denied');
  assert.equal(thirdPartyErrorVariant(describeThirdPartyError('origin_forbidden', 403)), 'denied');
  assert.equal(thirdPartyErrorVariant(describeThirdPartyError('third_party_unavailable', 503)), 'error');
});

test('UX-07 terceiros: os ENUMs reais do servidor e das migrações saem em português', () => {
  // THIRD_PARTY_STATUSES no servidor canônico.
  for (const value of ['ativo', 'inativo', 'suspenso', 'encerrado']) {
    assert.ok(canonical.includes(`"${value}"`), `o servidor ainda usa a situação ${value}`);
    assert.notEqual(thirdPartyStatusLabel(value), value, `thirdPartyStatus ${value}`);
  }
  // ACCESS_SCOPE_KINDS no servidor canônico.
  for (const value of ['contrato', 'ordem_servico']) {
    assert.ok(canonical.includes(`"${value}"`), `o servidor ainda aceita o escopo ${value}`);
    assert.notEqual(scopeKindLabel(value), value, `scopeKind ${value}`);
  }
  // Situação de UMA janela, derivada por deriveGrantWindow().
  for (const value of ['vigente', 'expirado', 'nao_iniciado', 'revogado']) {
    assert.ok(canonical.includes(`status: "${value}"`), `o servidor ainda deriva a janela ${value}`);
    assert.notEqual(windowStatusLabel(value), value, `windowStatus ${value}`);
  }
  // Situação de acesso, derivada por deriveAccessSituation().
  for (const value of [
    'sem_janela_registrada', 'bloqueado_por_situacao_do_terceiro', 'com_acesso_vigente',
    'janela_futura', 'revogado', 'sem_acesso_vigente',
  ]) {
    assert.ok(canonical.includes(`"${value}"`), `o servidor ainda deriva a situação de acesso ${value}`);
    assert.notEqual(accessSituationLabel(value), value, `accessSituation ${value}`);
  }
  // Decisão de autorização, no ponto de imposição.
  for (const value of [
    'terceiro_inexistente', 'terceiro_nao_ativo', 'escopo_nao_autorizado', 'janela_vigente',
    'janela_encerrada', 'janela_nao_iniciada', 'janela_revogada', 'sem_janela_vigente',
  ]) {
    assert.ok(canonical.includes(`"${value}"`), `o servidor ainda devolve a decisão ${value}`);
    assert.notEqual(decisionReasonLabel(value), value, `decisionReason ${value}`);
  }
  // Vencimento de documento, derivado por deriveDocumentExpiry().
  for (const value of ['vigente', 'a_vencer', 'vencido', 'sem_data_declarada', 'desativado']) {
    assert.ok(canonical.includes(`"${value}"`), `o servidor ainda deriva o vencimento ${value}`);
    assert.notEqual(documentExpiryLabel(value), value, `documentExpiry ${value}`);
  }
  // Ausência de regra, NOMEADA pelo próprio servidor.
  assert.ok(canonical.includes('sem_regra_de_antecedencia'), 'o servidor nomeia a ausência de regra');
  assert.notEqual(documentRuleAbsenceLabel('sem_regra_de_antecedencia'), 'sem_regra_de_antecedencia');
  assert.match(
    documentRuleAbsenceLabel("sem_regra_de_antecedencia: nenhum alerta 'a vencer' é inferido"),
    /Sem regra de antecedência registrada/,
  );
  // event_type: constraint da migração 148 e o que insertEvent() grava.
  for (const value of [
    'terceiro_criado', 'situacao_atualizada', 'contrato_vinculado', 'acesso_concedido',
    'acesso_revogado', 'documento_registrado', 'documento_desativado',
    'regra_documento_registrada', 'avaliacao_registrada',
  ]) {
    assert.ok(migration148.includes(`'${value}'`), `a migração 148 ainda permite o evento ${value}`);
    assert.ok(canonical.includes(`"${value}"`), `o servidor ainda grava o evento ${value}`);
    assert.notEqual(thirdPartyEventLabel(value), value, `thirdPartyEvent ${value}`);
  }
  // Ausência NOMEADA pelo servidor nas respostas de leitura.
  for (const campo of ['third_parties_registered', 'document_rule_absence', 'source', 'base_date', 'note']) {
    assert.ok(canonical.includes(campo), `o servidor ainda declara o campo de ausência ${campo}`);
  }
  // Valor desconhecido PASSA CRU: nada é inventado para ele.
  assert.equal(thirdPartyStatusLabel('situacao_que_nao_existe'), 'situacao_que_nao_existe');
  assert.equal(scopeKindLabel('escopo_novo'), 'escopo_novo');
  assert.equal(windowStatusLabel('status_novo'), 'status_novo');
  assert.equal(accessSituationLabel('situacao_nova'), 'situacao_nova');
  assert.equal(decisionReasonLabel('motivo_novo'), 'motivo_novo');
  assert.equal(thirdPartyEventLabel('evento_novo'), 'evento_novo');
  assert.equal(thirdPartyStatusTone('situacao_que_nao_existe'), 'neutral');
  assert.equal(windowStatusTone('status_novo'), 'neutral');
});

test('UX-07 terceiros: ausência é honesta e nunca vira 0, 0%, R$ 0,00 ou 01/01/1970', () => {
  for (const vazio of [null, undefined, '']) {
    assert.equal(honestDate(vazio), ABSENT);
    assert.equal(honestDateTime(vazio), ABSENT);
    assert.equal(count(vazio), ABSENT);
    assert.equal(honestText(vazio), ABSENT);
    assert.equal(responsibleLabel(vazio), NO_RESPONSIBLE);
    assert.equal(evaluationScoreLabel(vazio), NO_EVALUATION);
  }
  assert.notEqual(honestDate(null), '01/01/1970');
  assert.notEqual(count(null), '0');
  assert.notEqual(evaluationScoreLabel(null), '0/10');
  assert.notEqual(NO_CONTRACT, '0');
  assert.equal(thirdPartyStatusLabel(null), ABSENT);
  assert.equal(windowSummary(null), ABSENT);
  assert.equal(expirySummary(undefined), ABSENT);

  // Zero REAL vindo do servidor continua sendo zero: o defeito era transformar
  // AUSÊNCIA em zero, não mostrar um zero verdadeiro. Nota 0 numa avaliação
  // registrada e 0 janelas vigentes de 2 registradas são fatos canônicos.
  assert.equal(count(0), '0');
  assert.equal(evaluationScoreLabel(0), '0/10');

  // Derivações do servidor saem em português preservando datas reais.
  assert.match(
    windowSummary({ status: 'expirado', access_start: '2026-01-01', access_end: '2026-02-01', base_date: '2026-10-06' }),
    /Expirado — acesso perdido ao término\. Janela de 01\/01\/2026 a 01\/02\/2026; data-base 06\/10\/2026\./,
  );
  assert.match(
    expirySummary({ status: 'a_vencer', expiry_date: '2026-10-20', alert_rule: { id: 'x', alert_before_days: 30, justification: 'j' } }),
    /A vencer, dentro da antecedência da regra\. Vence em 20\/10\/2026\. Regra registrada de 30 dia\(s\) de antecedência\./,
  );
  assert.match(
    expirySummary({ status: 'vigente', expiry_date: '2026-12-01', alert_rule_absence: 'sem_regra_de_antecedencia' }),
    /Sem regra de antecedência registrada\./,
  );
  assert.match(
    expirySummary({ status: 'sem_data_declarada', derivation: 'nenhuma data de validade registrada' }),
    /Sem data de validade declarada\. nenhuma data de validade registrada/,
  );

  // Datas e números em pt-BR, sem espaço rígido inesperado.
  assert.equal(honestDate('2026-10-06'), '06/10/2026');
  assert.equal(count(1234567), '1.234.567');
  assert.doesNotMatch(count(1234567), /[\u00a0\u202f]/);
  assert.doesNotMatch(honestDateTime('2026-10-06T12:00:00.000Z'), /[\u00a0\u202f]/);
  // Valor que não é data continua aparecendo cru, sem virar epoch.
  assert.equal(honestDate('nao-e-data'), 'nao-e-data');
});

test('UX-07 terceiros: a apresentação não tem style inline nem classe utilitária avulsa', () => {
  assert.doesNotMatch(workspace, /style\s*=\s*\{/, 'zero style inline');
  assert.doesNotMatch(workspace, /CSSProperties/, 'nenhum objeto de estilo');
  assert.match(workspace, /UiWorkspace\.module\.css/);
  assert.match(workspace, /<UiState/);
  assert.match(workspace, /thirdPartyRequest/);
  // TODA className precisa ser uma expressão de módulo CSS: nenhuma string
  // literal com utilitários soltos ("border rounded px-2 py-1.5 text-sm" x20,
  // "px-4 py-3 text-left font-medium text-gray-500" x7, e assim por diante).
  const classNames = [...workspace.matchAll(/className=(\{[^}]*\}|"[^"]*")/g)].map(match => match[1]);
  assert.ok(classNames.length > 0, 'a tela precisa aplicar classes do módulo compartilhado');
  for (const expression of classNames) {
    assert.ok(expression.startsWith('{'), `className literal encontrada: ${expression}`);
    assert.match(expression, /styles\./, `className sem o módulo compartilhado: ${expression}`);
  }
  // Nenhum utilitário do protótipo sobrou no arquivo.
  for (const utilitario of [
    'border rounded px-2 py-1.5 text-sm',
    'px-4 py-3 text-left font-medium text-gray-500',
    'text-xs text-gray-500',
    'font-semibold text-sm',
    'border rounded p-3 space-y-2',
    'bg-blue-600',
    'divide-y divide-gray-200',
  ]) {
    assert.ok(!workspace.includes(utilitario), `utilitário avulso remanescente: ${utilitario}`);
  }
  // TODO campo tem rótulo de verdade: nenhum `placeholder` no lugar de label
  // (o protótipo tinha 22 placeholders e ZERO <label>).
  assert.doesNotMatch(workspace, /placeholder=/, 'placeholder nunca substitui rótulo');
  const labels = (workspace.match(/<label htmlFor=/g) || []).length;
  const controls = (workspace.match(/<(input|select|textarea)\b/g) || []).length;
  assert.ok(labels >= controls, `cada controle precisa de um <label>: ${labels} rótulos para ${controls} controles`);
});

test('UX-07 terceiros: a reescrita preservou URL, método, cabeçalho e chave', () => {
  for (const contrato of [
    /"\/api\/ext\/third-party\/parties"/,
    /`\/api\/ext\/third-party\/parties\/\$\{id\}`/,
    /`\/api\/ext\/third-party\/parties\/\$\{selectedId\}\/contract`/,
    /`\/api\/ext\/third-party\/parties\/\$\{selectedId\}\/access-grants`/,
    /`\/api\/ext\/third-party\/access-grants\/\$\{grantId\}\/revoke`/,
    /`\/api\/ext\/third-party\/parties\/\$\{selectedId\}\/documents`/,
    /`\/api\/ext\/third-party\/documents\/\$\{documentId\}\/deactivate`/,
    /`\/api\/ext\/third-party\/parties\/\$\{selectedId\}\/document-rules`/,
    /`\/api\/ext\/third-party\/parties\/\$\{selectedId\}\/evaluations`/,
    /`\/api\/ext\/third-party\/parties\/\$\{id\}\/authorization\?\$\{query\.toString\(\)\}`/,
    /"Idempotency-Key": key/,
  ]) assert.match(workspace, contrato, `contrato preservado: ${contrato}`);
  // Métodos exatamente como o servidor os aceita.
  assert.match(workspace, /"\/api\/ext\/third-party\/parties", "POST"/);
  assert.match(workspace, /`\/api\/ext\/third-party\/parties\/\$\{selectedId\}`, "PATCH"/);
  assert.match(workspace, /\/contract`, "POST"/);
  assert.match(workspace, /\/revoke`, "POST"/);
  // A consulta de autorização é GET com os dois parâmetros do servidor.
  assert.match(workspace, /new URLSearchParams\(\{ scope_kind: scopeKind, scope_id: scopeId \}\)/);
  // Formato REAL da chave do protótipo, prefixo a prefixo.
  assert.match(workspace, /`\$\{prefix\}-\$\{crypto\.randomUUID\(\)\}`/);
  for (const prefixo of [
    'ext02-tp', 'ext02-ctr', 'ext02-grt', 'ext02-rev', 'ext02-sta',
    'ext02-doc', 'ext02-dcx', 'ext02-rul', 'ext02-avl',
  ]) {
    assert.ok(workspace.includes(`"${prefixo}"`), `o prefixo de chave ${prefixo} foi preservado`);
  }
  // Contrato herdado de idempotência: chave criada por operação, preservada
  // após falha e descartada só no sucesso, e VISÍVEL junto do erro.
  assert.match(workspace, /keys\.current\[op\] = key/);
  assert.match(workspace, /delete keys\.current\[op\]/);
  assert.match(workspace, /setPreservedKey\(key\)/, 'a chave preservada é mostrada a quem opera');
  assert.match(workspace, /Chave preservada para repetição segura/);
  // Toda URL de API chamada pela tela precisa ser do namespace canônico; a
  // leitura legada religada NÃO é consumida aqui. Comentários são removidos
  // antes: eles citam os aliases legados justamente para registrar isso.
  const semComentarios = workspace.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const urls = [...semComentarios.matchAll(/["'`](\/api\/[^"'`]+)[\s"'`]/g)].map(match => match[1]);
  assert.ok(urls.length >= 8, `esperava as URLs canônicas no código, achei ${urls.length}`);
  for (const url of urls) {
    assert.ok(url.startsWith('/api/ext/third-party/'), `URL fora do namespace canônico: ${url}`);
  }
  for (const alias of ['/api/ext/third-parties', '/api/hr/ext-third-part', '/api/crm/hr/ext-third-part', '/api/admin/hr/ext-third-part']) {
    assert.ok(!semComentarios.includes(alias), `a tela não consome o alias legado ${alias}`);
  }
});

test('UX-07 terceiros: a tela não escreve justificativa nem motivo no lugar de quem opera', () => {
  assert.doesNotMatch(workspace, /justification:\s*[^}\n]*\|\|/, 'nenhuma justificativa padrão substitui quem opera');
  assert.doesNotMatch(workspace, /reason:\s*[^}\n,]*\|\|/, 'nenhum motivo padrão substitui quem opera');
  // Os textos obrigatórios vêm de campos rotulados.
  assert.match(workspace, /justification: contractForm\.justification/);
  assert.match(workspace, /justification: grantForm\.justification/);
  assert.match(workspace, /justification: ruleForm\.justification/);
  assert.match(workspace, /justification: evaluationForm\.justification/);
  assert.match(workspace, /reason: statusForm\.reason/);
  assert.match(workspace, /const typed = deactivateReason\[documentId\] \|\| "";/);
  assert.match(workspace, /const typed = revokeReason\[grantId\] \|\| "";/);
  assert.match(workspace, /\{ reason: typed \}/);
  // Defeito de estado corrigido: motivo e chave eram um estado único
  // compartilhado por todos os documentos e por todas as janelas.
  assert.match(workspace, /mutate\(`doc-\$\{documentId\}`/, 'cada documento tem a sua própria chave');
  assert.match(workspace, /mutate\(`grant-\$\{grantId\}`/, 'cada janela tem a sua própria chave');
});

test('UX-07 terceiros: as abas são tablist/tab/tabpanel reais com roving tabindex', () => {
  assert.match(workspace, /role="tablist"/);
  assert.match(workspace, /role="tab"/);
  assert.match(workspace, /role: "tabpanel" as const/);
  assert.match(workspace, /aria-selected=\{active === tab\.id\}/);
  assert.match(workspace, /aria-controls=\{`terceiros-panel-\$\{tab\.id\}`\}/);
  assert.match(workspace, /"aria-labelledby": `terceiros-tab-\$\{id\}`/);
  assert.match(workspace, /tabIndex=\{active === tab\.id \? 0 : -1\}/, 'roving tabindex');
  for (const tecla of ['ArrowRight', 'ArrowLeft', '"Home"', '"End"']) assert.match(workspace, new RegExp(tecla));
  assert.doesNotMatch(workspace, /aria-pressed/, 'aria-pressed não substitui tab');
});

test('UX-07 terceiros: a fronteira externa é declarada e nunca simulada', () => {
  // O servidor declara a fronteira; a tela repete a declaração e nomeia o
  // ponto de imposição. Nada aqui cria sessão, login ou canal de terceiro.
  assert.match(canonical, /export const EXTERNAL_ACTOR_BOUNDARY = Object\.freeze\(\{/);
  assert.match(canonical, /authenticated_third_party_channel: false/);
  assert.match(canonical, /status: "pendente"/);
  assert.match(canonical, /enforcement_point:/);
  assert.match(EXTERNAL_BOUNDARY, /Não existe hoje ator externo “terceiro” autenticado/);
  assert.match(EXTERNAL_BOUNDARY, /PENDENTE/);
  assert.match(workspace, /Fronteira externa declarada:/);
  assert.match(workspace, /external_actor_boundary/);
  assert.match(workspace, /Ponto de imposição:/);
  // A tela NÃO simula canal externo: nenhum login, sessão ou portal de
  // terceiro é construído aqui.
  for (const simulacao of ['loginTerceiro', 'thirdPartyLogin', 'portal-do-terceiro', 'fakeSession', 'simulateAccess']) {
    assert.ok(!workspace.includes(simulacao), `a tela não pode simular ator externo: ${simulacao}`);
  }
  // Ausência de janela nunca é lida como acesso liberado.
  assert.match(workspace, /Ausência de janela não é acesso liberado/i);
  assert.match(workspace, /Ausência de documento registrado não é prova de documentação em dia/i);
  assert.match(workspace, /Ausência de avaliação não é nota zero/i);
  assert.match(workspace, /Falha de consulta não é negativa de acesso/i);
  assert.match(workspace, /Menu não é autorização/);
});

test('UX-07 terceiros: a página não alargou o AdminGate nem trocou de servidor', async () => {
  const page = await read('../src/app/admin/terceiros/page.tsx');
  assert.match(page, /allowedRoles=\{\["marcelo", "admin", "ti"\]\}/);
  // Quem decide é o servidor: sessão de equipe, papel, origem e identidade.
  assert.match(canonical, /export const THIRD_PARTY_READ_ROLES = Object\.freeze\(\["admin", "marcelo", "ti"\]\)/);
  assert.match(canonical, /export const THIRD_PARTY_WRITE_ROLES = Object\.freeze\(\["admin", "marcelo", "ti"\]\)/);
  assert.match(canonical, /json\(res, 401, \{ error: "unauthorized" \}\)/);
  assert.match(canonical, /json\(res, 403, \{ error: "forbidden_role" \}\)/);
  assert.match(canonical, /sameOrigin\(req\)/);
  assert.match(canonical, /idempotency_key_required/);
  assert.match(canonical, /audit_unavailable/);
  // Derivações determinísticas continuam exportadas e sem estimativa.
  assert.match(canonical, /export function deriveGrantWindow/);
  assert.match(canonical, /export function deriveAccessSituation/);
  assert.match(canonical, /export function deriveAccessDecision/);
  assert.match(canonical, /export function deriveDocumentExpiry/);
  assert.match(canonical, /status = "sem_janela_registrada"/);
});
