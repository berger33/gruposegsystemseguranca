import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-ID3 / /cliente/app/reclamacoes-colaborador: canal RESTRITO. Um
// vazamento entre contas aqui é mais grave que nas outras páginas, e um 200
// malformado não pode ser apresentado como "nenhuma reclamação".
const source = await readFile(
  new URL('../src/app/cliente/app/reclamacoes-colaborador/page.tsx', import.meta.url),
  'utf8',
);

test('UX-PRO-ID3 Reclamações: leitura e erro ficam associados à conta ativa', () => {
  assert.match(source, /type ComplaintsRead = \{ accountId: string; complaints: Complaint\[\]; hrMinimalShare: HrShareInfo\[\]/,
    'o resultado precisa guardar a conta que originou a leitura');
  assert.match(source, /type ComplaintsReadError = \{ accountId: string; message: string \}/,
    'o erro precisa guardar a conta que originou a falha');
  assert.match(source, /setRead\(\{ accountId, complaints: payload\.complaints, hrMinimalShare: payload\.hrMinimalShare/,
    'sucesso precisa ser gravado junto do accountId da consulta');
  assert.match(source, /setReadError\(\{ accountId, message:/,
    'a falha precisa ser gravada junto do accountId da consulta');
  assert.match(source, /const currentRead = activeAccount\?\.id === read\?\.accountId \? read : null;/,
    'somente o resultado da conta ativa pode ser elegível para renderização');
  assert.match(source, /const currentError = activeAccount\?\.id === readError\?\.accountId \? readError : null;/,
    'somente o erro da conta ativa pode ser elegível para renderização');
  assert.match(source, /currentRead\.complaints\.map\(item =>/,
    'a lista de reclamações precisa vir do resultado reconciliado com a conta ativa');
  assert.doesNotMatch(source, /(?<![\w.])complaints\.map\(item =>/,
    'uma coleção global sem conta não pode alimentar a lista');
  assert.match(source, /currentRead\.hrMinimalShare\.map\(share =>/,
    'o envelope mínimo do RH também precisa vir da leitura da conta ativa');
  assert.doesNotMatch(source, /(?<![\w.])hrMinimalShare\.map\(share =>/,
    'o envelope mínimo global não pode ser renderizado');
  assert.doesNotMatch(source, /data\?\.(complaints|hrMinimalShare)/,
    'nenhuma seção pode consumir diretamente o payload global');
});

test('UX-PRO-ID3 Reclamações: leitura pendente, fora de ordem e payload inválido são honestos', () => {
  assert.match(source, /const latestRequest = useRef\(0\);/, 'é preciso identificar a consulta mais recente');
  assert.match(source, /const requestId = \+\+latestRequest\.current;/, 'cada consulta precisa de sequência própria');
  const staleGuards = source.match(/if \(requestId !== latestRequest\.current\) return;/g) || [];
  assert.ok(staleGuards.length >= 3, 'sucesso, erro e finally precisam descartar consulta fora de ordem');
  assert.match(source, /Array\.isArray\(payload\.complaints\)/, 'payload inesperado de reclamações não é "nenhuma"');
  assert.match(source, /Array\.isArray\(payload\.hrMinimalShare\)/, 'payload inesperado do envelope mínimo não é sucesso');
  assert.match(source, /aria-busy=\{readLoading\}/, 'as regiões precisam anunciar a leitura em andamento');
  assert.match(source, /readLoading \|\| !currentRead/, 'conta sem leitura concluída permanece em carregamento');
  assert.doesNotMatch(source, /load_failed/, 'código técnico de erro não pode aparecer para o cliente');
  assert.match(source, /currentError \? \(/, 'a falha precisa ser exibida em alerta');
  assert.match(source, /currentRead \? \(/, 'os dados já lidos precisam continuar renderizados na falha');
  assert.match(source, /Última leitura concluída/, 'a tela precisa identificar a última leitura válida');
  const suspended = source.match(/appStyles\.suspendedNote/g) || [];
  assert.ok(suspended.length >= 3,
    'formulário, lista e envelope mínimo precisam de estado próprio para cadastro inativo');
});

test('UX-PRO-ID3 Reclamações: relato restrito não é renderizado e erro do POST é traduzido', () => {
  assert.doesNotMatch(source, /item\.description/,
    'o relato da reclamação é restrito e nunca pode aparecer na listagem do portal');
  assert.doesNotMatch(source, /item\.employee_reference/,
    'a referência do colaborador não pode aparecer na listagem do portal');
  const workspaceFetchCalls = source.match(/workspaceFetch\(/g) || [];
  assert.equal(workspaceFetchCalls.length, 1,
    'apenas o GET pode usar workspaceFetch; o POST precisa ler o corpo de erro');
  assert.match(source, /await fetch\("\/api\/client\/employee-complaints", \{/,
    'o POST precisa usar fetch direto');
  assert.match(source, /messages\[payload\.error \|\| ""\]/, 'o motivo do erro precisa ser traduzido');
  assert.match(source, /Idempotency-Key/, 'a chave de idempotência precisa ser preservada');
});
