import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-ID3 / /cliente/app/chamados: leitura de tickets por conta + três
// mutações (abrir, aceitar, reabrir) cujos motivos de erro precisam chegar à UI.
const source = await readFile(
  new URL('../src/app/cliente/app/chamados/page.tsx', import.meta.url),
  'utf8',
);

test('UX-PRO-ID3 Chamados: leitura e erro ficam associados à conta ativa', () => {
  assert.match(source, /type TicketsRead = \{ accountId: string; tickets: Ticket\[\]/,
    'o resultado precisa guardar a conta que originou a leitura');
  assert.match(source, /type TicketsReadError = \{ accountId: string; message: string \}/,
    'o erro precisa guardar a conta que originou a falha');
  assert.match(source, /setRead\(\{ accountId, tickets: data\.tickets/,
    'o sucesso precisa ser gravado junto do accountId da consulta');
  assert.match(source, /setReadError\(\{ accountId, message:/,
    'a falha precisa ser gravada junto do accountId da consulta');
  assert.match(source, /const currentRead = activeAccount\?\.id === read\?\.accountId \? read : null;/,
    'somente o resultado da conta ativa pode ser elegível para renderização');
  assert.match(source, /const currentError = activeAccount\?\.id === readError\?\.accountId \? readError : null;/,
    'somente o erro da conta ativa pode ser elegível para renderização');
  assert.match(source, /currentRead\.tickets\.map\(ticket =>/,
    'a lista precisa vir do resultado reconciliado com a conta ativa');
  assert.doesNotMatch(source, /(?<![\w.])tickets\.map\(ticket =>/,
    'uma coleção global sem conta não pode alimentar a lista');
});

test('UX-PRO-ID3 Chamados: leitura pendente, fora de ordem e payload inválido são honestos', () => {
  assert.match(source, /const latestRequest = useRef\(0\);/, 'é preciso identificar a consulta mais recente');
  assert.match(source, /const requestId = \+\+latestRequest\.current;/, 'cada consulta precisa de sequência própria');
  const staleGuards = source.match(/if \(requestId !== latestRequest\.current\) return;/g) || [];
  assert.ok(staleGuards.length >= 3, 'sucesso, erro e finally precisam descartar consulta fora de ordem');
  assert.match(source, /Array\.isArray\(data\.tickets\)/, 'payload inesperado não é lista vazia');
  assert.match(source, /aria-busy=\{readLoading\}/, 'a região precisa anunciar a leitura em andamento');
  assert.match(source, /readLoading \|\| !currentRead/, 'conta sem leitura concluída permanece em carregamento');
  assert.match(source, /currentError \? \(/, 'a falha precisa ser exibida em alerta');
  assert.match(source, /currentRead \? \(/, 'os dados já lidos precisam continuar renderizados na falha');
  assert.match(source, /Última leitura concluída/, 'a tela precisa identificar a última leitura válida');
  const suspended = source.match(/appStyles\.suspendedNote/g) || [];
  assert.ok(suspended.length >= 2, 'formulário e lista precisam de estado próprio para cadastro inativo');
});

test('UX-PRO-ID3 Chamados: mutações leem o corpo de erro para traduzir os motivos', () => {
  // workspaceFetch lança em !ok e consome o body: POST/PATCH que o usam nunca
  // alcançam openErrors[...]. Apenas a leitura GET pode continuar usando-o.
  const workspaceFetchCalls = source.match(/workspaceFetch\(/g) || [];
  assert.equal(workspaceFetchCalls.length, 1,
    'apenas o GET pode usar workspaceFetch; abrir/aceitar/reabrir precisam de fetch direto');
  const directFetches = source.match(/await fetch\(/g) || [];
  assert.ok(directFetches.length >= 3, 'as três mutações precisam ler a resposta diretamente');
  const mappedErrors = source.match(/openErrors\[payload\.error \?\? ""\]/g) || [];
  assert.ok(mappedErrors.length >= 3, 'abrir, aceitar e reabrir precisam traduzir o motivo do erro');
  assert.match(source, /Idempotency-Key/, 'a chave de idempotência do POST precisa ser preservada');
});
