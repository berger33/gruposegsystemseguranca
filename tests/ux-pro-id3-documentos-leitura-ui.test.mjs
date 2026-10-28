import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-ID3 / /cliente/app/documentos: além do vazamento A/B, esta página
// renderiza LINKS DE DOWNLOAD. Um documento da conta antiga não pode deixar um
// link clicável na tela da nova conta.
const source = await readFile(
  new URL('../src/app/cliente/app/documentos/page.tsx', import.meta.url),
  'utf8',
);

test('UX-PRO-ID3 Documentos: leitura, erro e links ficam associados à conta ativa', () => {
  assert.match(source, /type DocumentsRead = \{ accountId: string; documents: ClientDocument\[\]/,
    'o resultado precisa guardar a conta que originou a leitura');
  assert.match(source, /type DocumentsReadError = \{ accountId: string; message: string \}/,
    'o erro precisa guardar a conta que originou a falha');
  assert.match(source, /setRead\(\{ accountId, documents: data\.documents/,
    'o sucesso precisa ser gravado junto do accountId da consulta');
  assert.match(source, /setReadError\(\{ accountId, message:/,
    'a falha precisa ser gravada junto do accountId da consulta');
  assert.match(source, /const currentRead = activeAccount\?\.id === read\?\.accountId \? read : null;/,
    'somente o resultado da conta ativa pode ser elegível para renderização');
  assert.match(source, /const currentError = activeAccount\?\.id === readError\?\.accountId \? readError : null;/,
    'somente o erro da conta ativa pode ser elegível para renderização');
  assert.match(source, /currentRead\.documents\.map\(document =>/,
    'a lista e seus links precisam vir do resultado reconciliado com a conta ativa');
  assert.doesNotMatch(source, /(?<![\w.])documents\.map\(document =>/,
    'uma coleção global sem conta não pode alimentar links de download');
  assert.match(source, /href=\{\`\/api\/client\/documents\/\$\{document\.id\}\/download\`\}/,
    'o link de download canônico precisa ser preservado');
});

test('UX-PRO-ID3 Documentos: leitura pendente, fora de ordem e payload inválido são honestos', () => {
  assert.match(source, /const latestRequest = useRef\(0\);/, 'é preciso identificar a consulta mais recente');
  assert.match(source, /const requestId = \+\+latestRequest\.current;/, 'cada consulta precisa de sequência própria');
  const staleGuards = source.match(/if \(requestId !== latestRequest\.current\) return;/g) || [];
  assert.ok(staleGuards.length >= 3, 'sucesso, erro e finally precisam descartar consulta fora de ordem');
  assert.match(source, /Array\.isArray\(data\.documents\)/, 'payload inesperado não é "nenhum documento"');
  assert.match(source, /aria-busy=\{readLoading\}/, 'a região precisa anunciar a leitura em andamento');
  assert.match(source, /readLoading \|\| !currentRead/, 'conta sem leitura concluída permanece em carregamento');
  assert.match(source, /currentError \? \(/, 'a falha precisa ser exibida em alerta');
  assert.match(source, /currentRead \? \(/, 'os dados já lidos precisam continuar renderizados na falha');
  assert.match(source, /Última leitura concluída/, 'a tela precisa identificar a última leitura válida');
  assert.match(source, /appStyles\.suspendedNote/, 'cadastro inativo precisa de estado próprio');
});

test('UX-PRO-ID3 Documentos: leitura única, sem dupla chamada ao parser', () => {
  const workspaceFetchCalls = source.match(/workspaceFetch\(/g) || [];
  assert.equal(workspaceFetchCalls.length, 1, 'uma única leitura GET');
  assert.doesNotMatch(source, /workspaceResponse/,
    'o corpo não pode ser parseado duas vezes (a checagem de !ok era caminho morto)');
});
