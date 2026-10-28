import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-ID3 / /cliente/app/solicitacoes: são DUAS leituras em paralelo
// (service-requests + contracts). Ambas precisam pertencer à conta ativa, ou o
// <select> do formulário oferece contrato de A enquanto B está selecionada.
const source = await readFile(
  new URL('../src/app/cliente/app/solicitacoes/page.tsx', import.meta.url),
  'utf8',
);

test('UX-PRO-ID3 Solicitações: as duas leituras e o erro ficam associados à conta ativa', () => {
  assert.match(source, /type RequestsRead = \{ accountId: string; items: ServiceRequest\[\]; contracts: Contract\[\]/,
    'o resultado precisa guardar a conta que originou as duas leituras');
  assert.match(source, /type RequestsReadError = \{ accountId: string; message: string \}/,
    'o erro precisa guardar a conta que originou a falha');
  assert.match(source, /setRead\(\{ accountId, items: requestData\.serviceRequests, contracts: contractData\.contracts/,
    'sucesso das duas leituras precisa ser gravado junto do accountId da consulta');
  assert.match(source, /setReadError\(\{ accountId, message:/,
    'a falha precisa ser gravada junto do accountId da consulta');
  assert.match(source, /const currentRead = activeAccount\?\.id === read\?\.accountId \? read : null;/,
    'somente o resultado da conta ativa pode ser elegível para renderização');
  assert.match(source, /const currentError = activeAccount\?\.id === readError\?\.accountId \? readError : null;/,
    'somente o erro da conta ativa pode ser elegível para renderização');
  assert.match(source, /currentRead\.items\.map\(item =>/,
    'a lista precisa vir do resultado reconciliado com a conta ativa');
  assert.doesNotMatch(source, /(?<![\w.])items\.map\(item =>/,
    'uma coleção global sem conta não pode alimentar a lista');
  assert.match(source, /currentRead\.contracts\.map\(contract =>/,
    'o seletor de contratos precisa vir do resultado reconciliado com a conta ativa');
  assert.doesNotMatch(source, /(?<![\w.])contracts\.map\(contract =>/,
    'um contrato de outra conta não pode ser oferecido no formulário');
});

test('UX-PRO-ID3 Solicitações: leitura pendente, fora de ordem e payload inválido são honestos', () => {
  assert.match(source, /const latestRequest = useRef\(0\);/, 'é preciso identificar a consulta mais recente');
  assert.match(source, /const requestId = \+\+latestRequest\.current;/, 'cada consulta precisa de sequência própria');
  const staleGuards = source.match(/if \(requestId !== latestRequest\.current\) return;/g) || [];
  assert.ok(staleGuards.length >= 3, 'sucesso, erro e finally precisam descartar consulta fora de ordem');
  assert.match(source, /Array\.isArray\(requestData\.serviceRequests\)/, 'payload inesperado de solicitações não é lista vazia');
  assert.match(source, /Array\.isArray\(contractData\.contracts\)/, 'payload inesperado de contratos não é lista vazia');
  assert.match(source, /aria-busy=\{readLoading\}/, 'a região precisa anunciar a leitura em andamento');
  assert.match(source, /readLoading \|\| !currentRead/, 'conta sem leitura concluída permanece em carregamento');
  assert.doesNotMatch(source, /load_failed/, 'código técnico de erro não pode aparecer para o cliente');
});

test('UX-PRO-ID3 Solicitações: falha de releitura preserva dados e suspenso não fica em spinner', () => {
  assert.match(source, /currentError \? \(/, 'a falha precisa ser exibida em alerta');
  assert.match(source, /currentRead \? \(/, 'os dados já lidos precisam continuar renderizados na falha');
  assert.match(source, /Última leitura concluída/, 'a tela precisa identificar a última leitura válida');
  const suspended = source.match(/appStyles\.suspendedNote/g) || [];
  assert.ok(suspended.length >= 2,
    'tanto o formulário quanto a lista precisam de estado próprio para cadastro inativo');
});
