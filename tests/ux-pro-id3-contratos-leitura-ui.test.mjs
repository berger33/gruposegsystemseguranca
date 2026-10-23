import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contractsSource = await readFile(
  new URL('../src/app/cliente/app/contratos/page.tsx', import.meta.url),
  'utf8',
);

test('UX-PRO-ID3: Contratos só renderiza sucesso e erro associados à conta ativa', () => {
  assert.match(contractsSource, /type ContractRead = \{ accountId: string; contracts: Contract\[\] \}/,
    'o resultado precisa guardar a conta que originou a leitura');
  assert.match(contractsSource, /type ContractReadError = \{ accountId: string; message: string \}/,
    'o erro precisa guardar a conta que originou a falha');
  assert.match(contractsSource, /setRead\(\{ accountId, contracts: data\.contracts \}\)/,
    'o sucesso precisa ser gravado junto do accountId da consulta');
  assert.match(contractsSource, /setReadError\(\{ accountId, message:/,
    'a falha precisa ser gravada junto do accountId da consulta');
  assert.match(contractsSource, /const currentRead = activeAccount\?\.id === read\?\.accountId \? read : null;/,
    'somente o resultado da conta ativa pode ser elegível para renderização');
  assert.match(contractsSource, /const currentError = activeAccount\?\.id === readError\?\.accountId \? readError : null;/,
    'somente o erro da conta ativa pode ser elegível para renderização');
  assert.match(contractsSource, /currentRead\.contracts\.map\(contract =>/,
    'a lista precisa vir do resultado reconciliado com a conta ativa');
  assert.doesNotMatch(contractsSource, /(?<![\w.])contracts\.map\(contract =>/,
    'uma coleção global sem conta não pode alimentar a lista');
});

test('UX-PRO-ID3: Contratos anuncia leitura e ignora conclusões fora de ordem', () => {
  assert.match(contractsSource, /const latestRequest = useRef\(0\);/,
    'o componente precisa identificar a consulta mais recente');
  assert.match(contractsSource, /const requestId = \+\+latestRequest\.current;/,
    'cada consulta precisa receber uma sequência própria');
  const staleGuards = contractsSource.match(/if \(requestId !== latestRequest\.current\) return;/g) || [];
  assert.ok(staleGuards.length >= 3,
    'sucesso, erro e finally precisam ignorar uma consulta que já não é a mais recente');
  assert.match(contractsSource, /readLoading \|\| !currentRead/,
    'a conta sem leitura concluída precisa permanecer em carregamento');
  assert.match(contractsSource, /aria-busy=\{readLoading\}/,
    'a região de contratos precisa anunciar a leitura em andamento');
});
