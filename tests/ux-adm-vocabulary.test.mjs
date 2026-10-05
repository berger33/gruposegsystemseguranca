// UX-05 — o vocabulário do painel do Marcelo não pode divergir do servidor.
//
// Este teste lê `src/server/adm-panel-api.mjs` e falha se a interface passar a
// traduzir um código que o servidor não devolve mais, ou deixar sem tradução um
// código que ele devolve. É a amarração que impede a tradução de virar invenção.
//
// Ele também trava as duas regras que o Marcelo não pode perder de vista:
// falha de leitura NUNCA pode ser classificada como vazio ou zero, e as
// recusas de alçada e de segregação precisam dizer, com todas as letras, que a
// decisão não foi gravada.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  APPROVAL_DECISIONS,
  admErrorFootnote,
  admErrorVariant,
  admPriorityLabel,
  admPriorityTone,
  describeAdmError,
} from '../src/lib/adm-vocabulary.mjs';

const panelApi = await readFile(new URL('../src/server/adm-panel-api.mjs', import.meta.url), 'utf8');
const panelUi = await readFile(new URL('../src/app/admin/marcelo/MarceloPanel.tsx', import.meta.url), 'utf8');

/** Todos os códigos que o servidor pode devolver em `{ error: '...' }`. */
function serverErrorCodes(source) {
  const codes = new Set();
  for (const match of source.matchAll(/error:\s*'([a-z0-9_]+)'/g)) codes.add(match[1]);
  return codes;
}

test('UX-05 vocabulário: todo código de erro do servidor tem tradução em português', () => {
  const codes = serverErrorCodes(panelApi);
  assert.ok(codes.size > 20, `esperava dezenas de códigos no servidor, achei ${codes.size}`);

  const semTraducao = [];
  for (const code of codes) {
    const descriptor = describeAdmError(code, 500);
    // Sem tradução dedicada o fallback devolve o texto genérico de `internal`.
    if (descriptor.title === 'Falha no servidor' && code !== 'internal') semTraducao.push(code);
  }
  assert.deepEqual(semTraducao, [], `códigos do servidor sem frase em português: ${semTraducao.join(', ')}`);
});

test('UX-05 vocabulário: nenhuma tradução inventa um código que o servidor não devolve', async () => {
  const codes = serverErrorCodes(panelApi);
  // Códigos derivados: o servidor os produz a partir de erros do PostgreSQL ou
  // de camadas vizinhas, então não aparecem como literais nesta regex.
  const derivados = new Set([
    'internal', 'not_found', 'invalid_json',
    'approval_authority_exceeded', 'requester_cannot_decide',
  ]);
  const vocabulario = await readFile(new URL('../src/lib/adm-vocabulary.mjs', import.meta.url), 'utf8');
  const traduzidos = [...vocabulario.matchAll(/^\s{2}([a-z0-9_]+):\s*\{/gm)].map(match => match[1]);
  assert.ok(traduzidos.length > 20, 'o vocabulário deveria cobrir dezenas de códigos');

  const inventados = traduzidos.filter(code => !codes.has(code) && !derivados.has(code));
  assert.deepEqual(inventados, [], `traduções para códigos inexistentes no servidor: ${inventados.join(', ')}`);
});

test('UX-05 honestidade: alçada e segregação dizem que a decisão não foi gravada', () => {
  for (const code of ['approval_authority_exceeded', 'requester_cannot_decide']) {
    const descriptor = describeAdmError(code, 403);
    assert.equal(descriptor.kind, 'denied', `${code} precisa ser uma negativa, não uma falha a repetir`);
    assert.equal(descriptor.canRetry, false, `${code} não pode oferecer "tentar novamente"`);
    assert.match(descriptor.detail, /NÃO foi gravada/, `${code} precisa afirmar que nada foi gravado`);
    assert.equal(admErrorVariant(descriptor), 'denied');
  }
});

test('UX-05 honestidade: a trilha de auditoria indisponível desfaz a operação inteira', () => {
  const descriptor = describeAdmError('audit_unavailable', 503);
  assert.match(descriptor.detail, /NADA foi gravado/);
  assert.equal(descriptor.canRetry, true);
});

test('UX-05 honestidade: fonte indisponível jamais é descrita como vazio ou zero', () => {
  const fontes = [
    'drilldown_source_unavailable', 'decision_source_unavailable', 'report_source_unavailable',
    'config_source_unavailable', 'goal_source_unavailable', 'diary_source_unavailable',
    'workspace_source_unavailable',
  ];
  for (const code of fontes) {
    const descriptor = describeAdmError(code, 503);
    assert.equal(descriptor.kind, 'retry', `${code} é falha de leitura, não ausência de dado`);
    assert.equal(descriptor.canRetry, true, `${code} precisa oferecer nova tentativa`);
    assert.doesNotMatch(descriptor.detail, /\bnenhum registro existe\b|\bé zero\b|\bzero registros\b/i,
      `${code} não pode afirmar ausência de dado`);
  }
});

test('UX-05 falha de rede: requisição que não chegou não vira dado ausente', () => {
  const descriptor = describeAdmError(null, 0);
  assert.equal(descriptor.kind, 'network');
  assert.equal(descriptor.canRetry, true);
  assert.match(descriptor.detail, /não significa que não existam registros/i);
  assert.equal(admErrorFootnote(descriptor), 'Resposta do servidor: sem resposta.');
});

test('UX-05 diagnóstico: o código canônico fica no rodapé, entre parênteses', () => {
  const descriptor = describeAdmError('read_only', 403);
  assert.equal(descriptor.title, 'Sua sessão é somente leitura');
  assert.equal(admErrorFootnote(descriptor), 'Resposta do servidor: HTTP 403 (read_only).');
  // O título humano nunca é o token técnico.
  assert.doesNotMatch(descriptor.title, /read_only/);
});

test('UX-05 somente leitura: TI consulta mas a recusa de escrita não é tratada como erro a repetir', () => {
  const descriptor = describeAdmError('read_only', 403);
  assert.equal(descriptor.kind, 'denied');
  assert.equal(descriptor.canRetry, false);
  assert.match(descriptor.detail, /A consulta não foi afetada/);
});

test('UX-05 decisões: apenas os valores canônicos do servidor são oferecidos', () => {
  const valores = APPROVAL_DECISIONS.map(item => item.value);
  assert.deepEqual(valores, ['aprovada', 'rejeitada']);
  for (const valor of valores) {
    assert.ok(panelApi.includes(`'${valor}'`), `o servidor precisa aceitar a decisão ${valor}`);
  }
});

test('UX-05 prioridade: tradução não altera o valor e o desconhecido passa cru', () => {
  assert.equal(admPriorityLabel('critica'), 'Crítica');
  assert.equal(admPriorityLabel('ALTA'), 'Alta');
  assert.equal(admPriorityLabel(null), '—');
  assert.equal(admPriorityLabel('valor_novo_do_servidor'), 'valor_novo_do_servidor');
  assert.equal(admPriorityTone('critica'), 'danger');
  assert.equal(admPriorityTone('alta'), 'warning');
  assert.equal(admPriorityTone('desconhecida'), 'neutral');
});

test('UX-05 tela: as abas do painel são um tablist de verdade', () => {
  assert.match(panelUi, /role="tablist"/, 'as abas precisam de um tablist');
  assert.match(panelUi, /role="tab"/, 'cada aba precisa de role=tab');
  assert.match(panelUi, /role="tabpanel"/, 'cada painel precisa de role=tabpanel');
  assert.match(panelUi, /onKeyDown=\{onTabKeyDown\}/, 'as abas precisam responder ao teclado');
  assert.match(panelUi, /tabIndex=\{tab === id \? 0 : -1\}/, 'só a aba ativa fica na ordem de tabulação');
});

test('UX-05 tela: carregando deixou de ser indistinguível de vazio', () => {
  assert.match(panelUi, /indicatorsState === "loading"/, 'o painel precisa de um estado de carregamento declarado');
  assert.match(panelUi, /variant="loading"/, 'o carregamento precisa ser mostrado ao operador');
  const carregando = [...panelUi.matchAll(/variant="loading"/g)].length;
  assert.ok(carregando >= 8, `esperava carregamento em todas as abas, achei ${carregando}`);
});

test('UX-05 tela: nenhum cartão é renderizado a partir de uma leitura que falhou', () => {
  // A regra do gate L07: `[data-testid="adm-indicators"] article` precisa ser 0
  // quando a leitura falha. Em código, isso significa que `<article` só existe
  // dentro do ramo `indicators ? (...)`.
  const secao = panelUi.slice(panelUi.indexOf('data-testid="adm-indicators"'));
  const ramo = secao.indexOf('{indicators ? (');
  const artigo = secao.indexOf('<article');
  assert.ok(ramo > 0 && artigo > ramo, 'o <article> precisa estar depois da guarda `indicators ?`');
});

test('UX-05 tela: o código do requisito saiu do título do cartão', () => {
  assert.doesNotMatch(panelUi, /<h2>ADM-\d+ — /, 'o código ADM não pode mais abrir o título da aba');
  assert.doesNotMatch(panelUi, /\{indicator\.requirement\} · \{indicator\.label\}/,
    'o código ADM não pode mais abrir o título do cartão');
  assert.match(panelUi, /Requisito \{indicator\.requirement\}/, 'o requisito continua visível, como detalhe');
});

test('UX-05 tela: todo campo de formulário tem rótulo associado', () => {
  const ids = [...panelUi.matchAll(/<(?:input|select|textarea)\s+id="([^"]+)"/g)].map(match => match[1]);
  assert.ok(ids.length >= 10, `esperava ao menos dez campos identificados, achei ${ids.length}`);
  const semRotulo = ids.filter(id => !panelUi.includes(`htmlFor="${id}"`));
  assert.deepEqual(semRotulo, [], `campos sem <label for>: ${semRotulo.join(', ')}`);
  const semId = [...panelUi.matchAll(/<(?:input|select|textarea)\s+(?!id=)[^>]*data-testid/g)];
  assert.equal(semId.length, 0, 'todo campo precisa de id para o rótulo apontar');
});

test('UX-05 tela: a decisão não pode ser enviada duas vezes com um clique duplo', () => {
  assert.match(panelUi, /if \(!selected \|\| deciding\) return;/, 'o envio precisa barrar a repetição');
  assert.match(panelUi, /disabled=\{deciding\}/, 'os botões de decisão precisam desabilitar durante o envio');
  assert.match(panelUi, /finally \{ setDeciding\(false\); \}/, 'o estado de envio precisa ser sempre liberado');
});
