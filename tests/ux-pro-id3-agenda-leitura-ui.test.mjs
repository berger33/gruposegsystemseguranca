import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-ID3 / /cliente/app/agenda: a leitura de visitas precisa se comportar
// como a de cobranças (#288) e contratos (#298): sucesso e erro pertencem a uma
// conta, respostas fora de ordem são descartadas e uma conta sem leitura
// concluída nunca é apresentada como "vazia".
const source = await readFile(
  new URL('../src/app/cliente/app/agenda/page.tsx', import.meta.url),
  'utf8',
);

test('UX-PRO-ID3 Agenda: resultado e erro ficam associados à conta ativa', () => {
  assert.match(source, /type VisitRead = \{ accountId: string; visits: Visit\[\]/,
    'o resultado precisa guardar a conta que originou a leitura');
  assert.match(source, /type VisitReadError = \{ accountId: string; message: string \}/,
    'o erro precisa guardar a conta que originou a falha');
  assert.match(source, /setRead\(\{ accountId, visits: data\.visits/,
    'o sucesso precisa ser gravado junto do accountId da consulta');
  assert.match(source, /setReadError\(\{ accountId, message:/,
    'a falha precisa ser gravada junto do accountId da consulta');
  assert.match(source, /const currentRead = activeAccount\?\.id === read\?\.accountId \? read : null;/,
    'somente o resultado da conta ativa pode ser elegível para renderização');
  assert.match(source, /const currentError = activeAccount\?\.id === readError\?\.accountId \? readError : null;/,
    'somente o erro da conta ativa pode ser elegível para renderização');
  assert.match(source, /currentRead\.visits\.map\(visit =>/,
    'a lista precisa vir do resultado reconciliado com a conta ativa');
  assert.doesNotMatch(source, /(?<![\w.])visits\.map\(visit =>/,
    'uma coleção global sem conta não pode alimentar a lista');
});

test('UX-PRO-ID3 Agenda: leitura pendente, fora de ordem e payload inválido são honestos', () => {
  assert.match(source, /const latestRequest = useRef\(0\);/,
    'o componente precisa identificar a consulta mais recente');
  assert.match(source, /const requestId = \+\+latestRequest\.current;/,
    'cada consulta precisa receber uma sequência própria');
  const staleGuards = source.match(/if \(requestId !== latestRequest\.current\) return;/g) || [];
  assert.ok(staleGuards.length >= 3,
    'sucesso, erro e finally precisam ignorar uma consulta que já não é a mais recente');
  assert.match(source, /Array\.isArray\(data\.visits\)/,
    'um 200 com payload inesperado não pode virar lista vazia nem sucesso');
  assert.match(source, /aria-busy=\{readLoading\}/,
    'a região da agenda precisa anunciar a leitura em andamento');
  assert.match(source, /readLoading \|\| !currentRead/,
    'a conta sem leitura concluída precisa permanecer em carregamento');
});

test('UX-PRO-ID3 Agenda: falha de releitura preserva os dados já lidos', () => {
  assert.match(source, /currentError \? \(/, 'a falha precisa ser exibida em alerta');
  assert.match(source, /currentRead \? \(/, 'os dados já lidos precisam continuar renderizados na falha');
  assert.match(source, /Última leitura concluída/,
    'a tela precisa identificar que o dado visível é de uma leitura anterior');
});
