// UX-07 / EXT-06 — teste anti-deriva do vocabulário da família SATISFAÇÃO.
//
// Ele lê os ARQUIVOS REAIS de servidor, extrai os códigos de erro e falha se:
//  - existir código real sem descrição no vocabulário;
//  - o vocabulário inventar um código que o servidor não devolve;
//  - o levantamento cair abaixo do limiar (regressão de extração);
//  - a origem legada MORTA voltar ao dispatch sem entrar no vocabulário.
//
// A lição que originou este formato está registrada na seção 4 de
// docs/UX-07-CONTRATOS-2026-10-05.md, na seção 5.3 de
// docs/UX-07-FINANCEIRO-2026-10-05.md e na seção 3.2 de
// docs/UX-07-COMPLIANCE-2026-10-06.md: medir apenas `error:` literal dá falsa
// segurança. Aqui o extrator casa os quatro formatos conhecidos (literal,
// `new HttpError()/new E()`, wrapper local `bad()/unavailable()` e a exceção
// `new Error('codigo')` convertida em resposta) e remove antes os operandos de
// `.includes('…')` e `[=!]==? '…'`, que são valores de ENUM e nomes de
// método HTTP — não códigos de erro.
//
// ORIGENS, e a decisão registrada sobre cada uma:
//  1. src/server/ext-satisfaction-api.mjs — servidor canônico, dispatch de
//     /api/ext/satisfaction/* em server.mjs (~4385–4393). É a única origem
//     VIVA, e ela já contém `handleLegacy`, o recorte somente-leitura
//     religado em server.mjs (~3887 e ~4395) que devolve 410
//     `legacy_mutation_retired` em mutação. Por ser rota viva, esse código
//     ENTRA no vocabulário — e, por morar no arquivo canônico, é medido pela
//     mesma leitura, sem recorte por marcador.
//  2. src/server/cli-finance-api.mjs ainda exporta handleSatisfactionSurveys
//     e handleSatisfactionActionPlans, com códigos próprios. Eles NÃO entram
//     no vocabulário porque server.mjs não despacha mais nada para esses dois
//     handlers: é origem MORTA. Este teste fixa a decisão — se um deles
//     voltar ao dispatch, o gate falha e o levantamento precisa ser refeito.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  describeSatisfactionError,
  satisfactionErrorMessage,
  satisfactionErrorVariant,
  satisfactionErrorFootnote,
  surveyTypeLabel,
  surveyStatusLabel,
  surveyStatusTone,
  methodologyLabel,
  planStatusLabel,
  planStatusTone,
  planOriginLabel,
  surveyOriginLabel,
  satisfactionEventLabel,
  actorKindLabel,
  followUpOperatorLabel,
  absenceLabel,
  honestDate,
  honestDateTime,
  honestNumber,
  honestAverage,
  honestText,
  scaleLabel,
  triggerRuleSummary,
  factsSummary,
  count,
  ABSENT,
  AVERAGE_NOT_CALCULATED,
  PERIOD_NOT_MEASURED,
  ERROR_MESSAGES,
} from '../src/lib/satisfaction-vocabulary.mjs';

const read = url => readFile(new URL(url, import.meta.url), 'utf8');

const canonical = await read('../src/server/ext-satisfaction-api.mjs');
const server = await read('../server.mjs');
const deadLegacy = await read('../src/server/cli-finance-api.mjs');
const workspace = await read('../src/app/admin/satisfacao/SatisfacaoWorkspace.tsx');

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

test('UX-07 satisfação: o servidor canônico e o recorte legado continuam religados', () => {
  // Dispatch real do servidor canônico, conferido URL a URL.
  assert.match(server, /createExtSatisfactionApi/);
  assert.match(server, /extSatisfactionApi\.handleReferences\(req,res\)/);
  assert.match(server, /extSatisfactionApi\.handleCreate\(req,res\)/);
  assert.match(server, /extSatisfactionApi\.handleList\(req,res\)/);
  assert.match(server, /extSatisfactionApi\.handleDetail\(req,res,satisfactionDetail\[1\]\)/);
  assert.match(server, /\/\^\\\/api\\\/ext\\\/satisfaction\\\/plans\\\//);
  // O recorte somente-leitura continua vivo nos dois grupos de alias.
  assert.match(server, /extSatisfactionApi\.handleLegacy\(req, res, \{cli:true\}\)/);
  assert.match(server, /extSatisfactionApi\.handleLegacy\(req,res\)/);
  assert.match(canonical, /legacy_mutation_retired/);
});

test('UX-07 satisfação: a origem legada de cli-finance-api continua MORTA', () => {
  // Decisão registrada: os códigos abaixo existem no arquivo, mas nenhuma
  // rota de server.mjs chega até eles — EXT-06 assumiu /api/client/
  // satisfaction-surveys e os aliases cli-satisfaction-*. Por isso eles não
  // entram no vocabulário. Se voltarem ao dispatch, este teste falha.
  for (const handler of ['handleSatisfactionSurveys', 'handleSatisfactionActionPlans']) {
    assert.match(deadLegacy, new RegExp(`function ${handler}`), `${handler} ainda existe no arquivo legado`);
    assert.doesNotMatch(server, new RegExp(`cliFinanceApi\\.${handler}`), `${handler} não pode voltar ao dispatch sem refazer o levantamento`);
  }
  for (const morto of ['satisfaction_surveys_unavailable', 'satisfaction_facts_unavailable', 'satisfaction_survey_unavailable']) {
    assert.ok(deadLegacy.includes(morto), `o código morto ${morto} ainda está no arquivo legado`);
    assert.ok(!codes.has(morto), `o código morto ${morto} não pode entrar no levantamento`);
    assert.ok(!(morto in ERROR_MESSAGES), `o código morto ${morto} não pode ser traduzido como se fosse vivo`);
  }
  // Quem responde pelas rotas de satisfação é só o servidor canônico.
  assert.match(server, /url\.pathname === "\/api\/client\/satisfaction-surveys"/);
  assert.match(server, /extSatisfactionApi\.handleClient\(req, res\)/);
});

test('UX-07 satisfação: a família não tem wrapper local nem exceção convertida', () => {
  // Fato verificado nesta fatia e registrado no documento: tudo sai por
  // `json(res, status, { error: '...' })`, inclusive os `deny` montados em
  // `work()` e devolvidos por `mutate()`. `readBody()` responde direto, sem
  // lançar. O extrator continua casando os outros formatos justamente para
  // que a introdução de um wrapper amanhã não passe despercebida.
  assert.doesNotMatch(canonical, /\b(?:bad|unavailable)\(\s*res\s*,/);
  assert.doesNotMatch(canonical, /new (?:HttpError|E)\(\s*\d+\s*,/);
  assert.doesNotMatch(canonical, /new Error\(\s*[`'"][a-z0-9_]+[`'"]\s*\)\s*,\s*\{\s*status/);
});

test('UX-07 satisfação: o levantamento real de códigos fica acima do limiar anti-deriva', () => {
  // Total real medido nesta fatia: 28 códigos, todos no servidor canônico.
  // Três deles vivem dentro do ternário de `handlePlan` e só aparecem porque
  // o extrator limpa as comparações antes de casar os literais.
  assert.ok(codes.size >= 28, `esperava ao menos 28 códigos na família, achei ${codes.size}`);
  for (const ternario of ['result_required', 'justification_required', 'note_required']) {
    assert.ok(codes.has(ternario), `o código ${ternario} sai de um ternário e precisa ser medido`);
  }
  // O recorte somente-leitura é origem VIVA e entra no vocabulário.
  assert.ok(codes.has('legacy_mutation_retired'), 'o recorte legado religado precisa entrar no levantamento');
  // Guardas de sessão, papel e origem são códigos distintos nesta família.
  for (const guarda of ['unauthorized', 'forbidden_role', 'origin_forbidden', 'client_session_required', 'forbidden']) {
    assert.ok(codes.has(guarda), `o código de guarda ${guarda} precisa ser medido`);
  }
});

// Título devolvido pelo vocabulário quando o código NÃO tem tradução. É o
// sentinela do teste: qualquer código real que caia nele está descoberto.
const TITULO_SEM_TRADUCAO = describeSatisfactionError('codigo_que_o_servidor_nao_devolve', 500).title;

test('UX-07 satisfação: todo código real do servidor tem descrição em português', () => {
  const faltando = [];
  for (const code of codes) {
    const item = describeSatisfactionError(code, 500);
    if (!item.title || item.title === code || item.title === TITULO_SEM_TRADUCAO) faltando.push(code);
    assert.equal(item.code, code, `o descritor precisa preservar o código canônico ${code}`);
  }
  assert.deepEqual(faltando, [], `códigos reais sem tradução: ${faltando.join(', ')}`);
});

test('UX-07 satisfação: o vocabulário não inventa código que o servidor não devolve', () => {
  const inventados = Object.keys(ERROR_MESSAGES).filter(code => !codes.has(code));
  assert.deepEqual(inventados, [], `traduções sem código real correspondente: ${inventados.join(', ')}`);
  assert.equal(new Set(Object.keys(ERROR_MESSAGES)).size, Object.keys(ERROR_MESSAGES).length, 'nenhum código duplicado');
});

test('UX-07 satisfação: código desconhecido passa cru e nunca ganha frase inventada', () => {
  const desconhecido = describeSatisfactionError('codigo_novo_do_servidor', 422);
  assert.equal(desconhecido.code, 'codigo_novo_do_servidor');
  assert.equal(desconhecido.title, 'Falha no servidor');
  assert.match(desconhecido.detail, /codigo_novo_do_servidor/);
  assert.equal(desconhecido.canRetry, false);
  // O código canônico é informação técnica, nunca o título principal.
  assert.match(satisfactionErrorMessage('codigo_novo_do_servidor', 422), /\(codigo_novo_do_servidor\)$/);
  assert.match(satisfactionErrorFootnote(desconhecido), /^Código técnico: \(codigo_novo_do_servidor\)$/);

  // Falha de rede e falha sem código continuam sendo estados próprios.
  const rede = describeSatisfactionError(null, 0);
  assert.equal(rede.kind, 'network');
  assert.equal(rede.code, null);
  assert.match(rede.detail, /não é uma lista vazia nem um resultado zero/i);
  const semCodigo = describeSatisfactionError(null, 502);
  assert.equal(semCodigo.code, null);
  assert.equal(semCodigo.kind, 'error');
  assert.match(semCodigo.detail, /não devolveu um código/i);
  assert.equal(satisfactionErrorFootnote(semCodigo), 'Código técnico: indisponível');
});

test('UX-07 satisfação: recusa de permissão é estado próprio, distinto de falha', () => {
  // EXT-06 decide por sessão (401), papel (403) e origem (403) no próprio
  // servidor canônico; não há permissão granular por grant nesta família.
  for (const negado of ['unauthorized', 'forbidden_role', 'forbidden', 'origin_forbidden', 'client_session_required']) {
    const descritor = describeSatisfactionError(negado, 403);
    assert.equal(descritor.kind, 'denied', `${negado} precisa ser recusa, não falha`);
    assert.equal(satisfactionErrorVariant(descritor), 'denied');
  }
  assert.equal(satisfactionErrorVariant(describeSatisfactionError('satisfaction_journey_unavailable', 503)), 'error');
  assert.equal(describeSatisfactionError('satisfaction_journey_unavailable', 503).canRetry, true);
  assert.equal(describeSatisfactionError('audit_unavailable', 503).canRetry, true);
  assert.equal(describeSatisfactionError('plan_terminal_or_invalid_transition', 409).canRetry, false);
  assert.equal(describeSatisfactionError('idempotency_key_reused', 409).canRetry, false);
});

test('UX-07 satisfação: ENUM desconhecido é preservado cru, conhecido sai em português', () => {
  assert.equal(surveyTypeLabel('tipo_novo'), 'tipo_novo');
  assert.equal(surveyStatusLabel('situacao_nova'), 'situacao_nova');
  assert.equal(methodologyLabel('metodologia_nova'), 'metodologia_nova');
  assert.equal(planStatusLabel('situacao_nova'), 'situacao_nova');
  assert.equal(planOriginLabel('origem_nova'), 'origem_nova');
  assert.equal(surveyOriginLabel('origem_nova'), 'origem_nova');
  assert.equal(satisfactionEventLabel('evento_novo'), 'evento_novo');
  assert.equal(actorKindLabel('ator_novo'), 'ator_novo');
  assert.equal(followUpOperatorLabel('gte'), 'gte');
  assert.equal(absenceLabel('ausencia_nova'), 'ausencia_nova');
});

test('UX-07 satisfação: todo ENUM real das migrações e do servidor tem rótulo', () => {
  // cli_satisfaction_type (076), também validado no servidor canônico.
  for (const value of ['pos_atendimento', 'periodica', 'outro']) {
    assert.ok(canonical.includes(`"${value}"`), `o servidor ainda aceita o tipo ${value}`);
    assert.notEqual(surveyTypeLabel(value), value, `surveyType ${value}`);
  }
  // methodology (152), validada no servidor canônico.
  for (const value of ['generica', 'nps', 'csat']) {
    assert.ok(canonical.includes(`"${value}"`), `o servidor ainda aceita a metodologia ${value}`);
    assert.notEqual(methodologyLabel(value), value, `methodology ${value}`);
  }
  // cli_satisfaction_status (076 + `cancelada` na 152): a máquina de estados
  // do próprio servidor é a fonte.
  for (const value of ['pendente', 'respondida', 'em_acao', 'concluida', 'cancelada']) {
    assert.ok(canonical.includes(value), `o servidor ainda usa a situação ${value}`);
    assert.notEqual(surveyStatusLabel(value), value, `surveyStatus ${value}`);
  }
  // status dos acompanhamentos (076/152).
  for (const value of ['aberta', 'em_andamento', 'concluida', 'cancelada']) {
    assert.notEqual(planStatusLabel(value), value, `planStatus ${value}`);
  }
  // origens (142 e 152).
  for (const value of ['ext06_canonica', 'registro_legado']) assert.notEqual(surveyOriginLabel(value), value);
  for (const value of ['portal_cliente', 'registro_interno']) assert.notEqual(planOriginLabel(value), value);
  assert.ok(canonical.includes("'ext06_canonica'"), 'o servidor ainda filtra pela origem canônica');
  assert.ok(canonical.includes("'portal_cliente'"), 'o servidor ainda grava a origem do acompanhamento');
  // event_type realmente gravado pelo servidor canônico.
  for (const event of ['pesquisa_criada', 'resposta_registrada']) {
    assert.ok(canonical.includes(`"${event}"`), `o servidor ainda grava o evento ${event}`);
    assert.notEqual(satisfactionEventLabel(event), event, `event_type ${event}`);
  }
  for (const event of ['acompanhamento_start', 'acompanhamento_complete', 'acompanhamento_cancel']) {
    assert.notEqual(satisfactionEventLabel(event), event, `event_type ${event}`);
  }
  assert.match(canonical, /eventType:`acompanhamento_\$\{operation\}`/, 'o evento do acompanhamento é montado por operação');
  // actor_kind (constraint da 152) e operador declarado do limiar.
  for (const value of ['staff', 'client']) assert.notEqual(actorKindLabel(value), value);
  assert.ok(canonical.includes("'lte'"), 'o operador do limiar continua fixado em lte');
  assert.notEqual(followUpOperatorLabel('lte'), 'lte');
  // Ausência NOMEADA pelo servidor: handleList devolve absence/empty_state.
  assert.match(canonical, /absence:agg\.denominator\?null:"sem_respostas"/);
  assert.match(canonical, /empty_state:rows\.length\?null:/);
  assert.notEqual(absenceLabel('sem_respostas'), 'sem_respostas');
});

test('UX-07 satisfação: ausência é honesta e nunca vira zero, média zero ou 01/01/1970', () => {
  for (const vazio of [null, undefined, '']) {
    assert.equal(honestDate(vazio), ABSENT);
    assert.equal(honestDateTime(vazio), ABSENT);
    assert.equal(count(vazio), ABSENT);
    assert.equal(honestNumber(vazio), ABSENT);
    assert.equal(honestText(vazio), ABSENT);
    assert.equal(honestAverage(vazio), AVERAGE_NOT_CALCULATED);
  }
  assert.notEqual(honestDate(null), '01/01/1970');
  assert.notEqual(count(null), '0');
  assert.notEqual(honestAverage(null), '0');
  assert.equal(surveyStatusLabel(null), ABSENT);
  assert.equal(methodologyLabel(''), ABSENT);
  assert.equal(scaleLabel(null, 10), ABSENT);
  assert.equal(scaleLabel(0, null), ABSENT);
  assert.equal(triggerRuleSummary(null), ABSENT);
  assert.equal(triggerRuleSummary({}), ABSENT);
  assert.equal(factsSummary(undefined), ABSENT);
  assert.notEqual(PERIOD_NOT_MEASURED, '01/01/1970');

  // Zero REAL vindo do servidor continua sendo zero: o defeito era transformar
  // ausência em zero, não mostrar um zero verdadeiro — `denominator` é um
  // contador honesto do servidor, inclusive quando vale 0.
  assert.equal(count(0), '0');
  assert.equal(honestNumber(0), '0');
  assert.equal(honestAverage(0), '0');
  assert.equal(scaleLabel(0, 10), '0 a 10');

  // Regra e fatos declarados saem em português, preservando o número real.
  assert.match(triggerRuleSummary({ operator: 'lte', threshold: 6, observed: 2 }), /nota menor ou igual ao limiar/);
  assert.match(triggerRuleSummary({ operator: 'lte', threshold: 6, observed: 2 }), /limiar 6/);
  assert.match(triggerRuleSummary({ operator: 'gte', threshold: 6, observed: 2 }), /gte/);
  assert.match(factsSummary({ score: 2, methodology: 'nps' }), /Nota registrada 2/);
  assert.match(factsSummary({ score: 2, methodology: 'nps' }), /NPS declarado/);

  // Datas e números em pt-BR, sem espaço rígido inesperado.
  assert.equal(honestDate('2026-10-06'), '06/10/2026');
  assert.equal(count(1234567), '1.234.567');
  assert.doesNotMatch(count(1234567), /[\u00a0\u202f]/);
  assert.doesNotMatch(honestDateTime('2026-10-06T12:00:00.000Z'), /[\u00a0\u202f]/);
  // Valor que não é data continua aparecendo cru, sem virar epoch.
  assert.equal(honestDate('nao-e-data'), 'nao-e-data');
});

test('UX-07 satisfação: a apresentação não tem style inline e usa o módulo compartilhado', () => {
  assert.doesNotMatch(workspace, /style\s*=\s*\{/, 'zero style inline');
  assert.doesNotMatch(workspace, /CSSProperties/, 'nenhum objeto de estilo');
  assert.match(workspace, /UiWorkspace\.module\.css/);
  assert.match(workspace, /<UiState/);
  assert.match(workspace, /satisfactionRequest/);
  // Nenhuma rota, método ou cabeçalho da família foi trocado pela reescrita.
  for (const contrato of [
    /"\/api\/ext\/satisfaction\/references"/,
    /"\/api\/ext\/satisfaction\/surveys"/,
    /`\/api\/ext\/satisfaction\/surveys\/\$\{id\}`/,
    /`\/api\/ext\/satisfaction\/plans\/\$\{id\}\/\$\{op\}`/,
    /"idempotency-key": key/,
  ]) assert.match(workspace, contrato, `contrato preservado: ${contrato}`);
  // Contrato herdado de idempotência: chave criada por operação, preservada
  // após falha e descartada só no sucesso.
  assert.match(workspace, /keys\.current\[op\]=key/);
  assert.match(workspace, /delete keys\.current\[op\]/);
  assert.match(workspace, /`ext06-\$\{op\}-\$\{crypto\.randomUUID\(\)\}`/);
  assert.match(workspace, /setPreservedKey\(key\)/, 'a chave preservada é mostrada a quem opera');
  // Toda URL de API chamada pela tela precisa ser do namespace canônico; a
  // leitura legada religada NÃO é consumida aqui. Comentários são removidos
  // antes: eles citam os aliases legados justamente para registrar que a tela
  // não os consome.
  const semComentarios = workspace.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const urls = [...semComentarios.matchAll(/["'`](\/api\/[^"'`]+)["'`]/g)].map(match => match[1]);
  assert.ok(urls.length >= 4, `esperava as URLs canônicas no código, achei ${urls.length}`);
  for (const url of urls) {
    assert.ok(url.startsWith('/api/ext/satisfaction/'), `URL fora do namespace canônico: ${url}`);
  }
  assert.ok(!semComentarios.includes('/api/ext/satisfaction-surveys'), 'a tela não consome o alias legado');
  assert.ok(!semComentarios.includes('cli-satisfaction'), 'a tela não consome os aliases CLI-11');
});

test('UX-07 satisfação: a tela não inventa mais o conteúdo do registro imutável', () => {
  // Defeito corrigido: o protótipo enviava
  // `justification: result || "Cancelamento explicitamente justificado pela gestão."`.
  assert.doesNotMatch(workspace, /Cancelamento explicitamente justificado pela gest/i);
  assert.doesNotMatch(workspace, /justification:\s*[^}\n]*\|\|/, 'nenhum texto padrão substitui quem opera');
  assert.doesNotMatch(workspace, /result:\s*[^}\n]*\|\|/, 'nenhum resultado padrão substitui quem opera');
  // O texto das três transições vem de um campo rotulado.
  assert.match(workspace, /transitionText\[`plan-\$\{id\}`\]/);
  assert.match(workspace, /op === "complete" \? \{ result: typed \}/);
  assert.match(workspace, /op === "cancel" \? \{ justification: typed \}/);
  // Correção de chamada COM evidência: `handlePlan()` lê `note` no início.
  assert.match(workspace, /: \{ note: typed \}/);
  assert.match(canonical, /txt\(b\.note,3,1000\)/, 'o servidor realmente exige note no início');
  assert.match(canonical, /txt\(b\.result,10,2000\)/, 'o servidor realmente exige result na conclusão');
  assert.match(canonical, /txt\(b\.justification,10,1000\)/, 'o servidor realmente exige justification no cancelamento');
});

test('UX-07 satisfação: as abas são tablist/tab/tabpanel reais com roving tabindex', () => {
  assert.match(workspace, /role="tablist"/);
  assert.match(workspace, /role="tab"/);
  assert.match(workspace, /role="tabpanel"/);
  assert.match(workspace, /aria-selected=\{active === tab\.id\}/);
  assert.match(workspace, /aria-controls=\{`satisfacao-panel-\$\{tab\.id\}`\}/);
  assert.match(workspace, /aria-labelledby="satisfacao-tab-/);
  assert.match(workspace, /tabIndex=\{active === tab\.id \? 0 : -1\}/, 'roving tabindex');
  for (const tecla of ['ArrowRight', 'ArrowLeft', '"Home"', '"End"']) assert.match(workspace, new RegExp(tecla));
  assert.doesNotMatch(workspace, /aria-pressed/, 'aria-pressed não substitui tab');
});

test('UX-07 satisfação: a tela declara a fronteira de privacidade e não promete satisfação', () => {
  // Frase de fronteira preservada do protótipo e exigida por
  // tests/ext06-satisfaction.test.mjs.
  assert.match(workspace, /sem expor funcionário/);
  assert.match(workspace, /projeção mínima/);
  assert.match(workspace, /fronteira staff/);
  assert.match(workspace, /nunca mostra zero no lugar/i);
  assert.match(workspace, /declaração registrada, não uma certificação de método/i);
  assert.match(workspace, /Ausência de acompanhamento não é prova de satisfação/i);
  assert.match(workspace, /área\s+legada\s+declarada/i);
  // A projeção mínima do cliente é decidida pelo servidor, não pela tela.
  assert.match(canonical, /CLIENT_SURVEY_FIELDS/);
});

test('UX-07 satisfação: a página não alargou o AdminGate nem trocou de servidor', async () => {
  const page = await read('../src/app/admin/satisfacao/page.tsx');
  assert.match(page, /allowedRoles=\{\["marcelo", "admin", "ti"\]\}/);
  // Quem decide é o servidor: sessão de equipe, papel e origem.
  assert.match(canonical, /const STAFF_ROLES=\["admin","marcelo","ti"\]/, 'os papéis aceitos pelo servidor não mudaram');
  assert.match(canonical, /json\(res,401,\{error:"unauthorized"\}\)/);
  assert.match(canonical, /json\(res,403,\{error:"forbidden_role"\}\)/);
  assert.match(canonical, /sameOrigin\(req\)/);
  assert.match(canonical, /idempotency_key_required/);
  assert.match(canonical, /audit_unavailable/);
  // Transações terminais continuam fechadas no próprio contrato exportado.
  assert.match(canonical, /SATISFACTION_TRANSITIONS/);
});
