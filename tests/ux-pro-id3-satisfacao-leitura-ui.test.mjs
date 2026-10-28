import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-ID3 / /cliente/app/satisfacao: a leitura alimenta TANTO o histórico
// QUANTO o <select> de pesquisas pendentes. Uma pesquisa de A não pode ser
// oferecida nem enviada enquanto B está selecionada.
const source = await readFile(
  new URL('../src/app/cliente/app/satisfacao/page.tsx', import.meta.url),
  'utf8',
);

test('UX-PRO-ID3 Satisfação: leitura, erro e pesquisas pendentes ficam na conta ativa', () => {
  assert.match(source, /type SurveysRead = \{ accountId: string; surveys: Survey\[\]/,
    'o resultado precisa guardar a conta que originou a leitura');
  assert.match(source, /type SurveysReadError = \{ accountId: string; message: string \}/,
    'o erro precisa guardar a conta que originou a falha');
  assert.match(source, /setRead\(\{ accountId, surveys: data\.surveys/,
    'o sucesso precisa ser gravado junto do accountId da consulta');
  assert.match(source, /setReadError\(\{ accountId, message:/,
    'a falha precisa ser gravada junto do accountId da consulta');
  assert.match(source, /const currentRead = activeAccount\?\.id === read\?\.accountId \? read : null;/,
    'somente o resultado da conta ativa pode ser elegível para renderização');
  assert.match(source, /const currentError = activeAccount\?\.id === readError\?\.accountId \? readError : null;/,
    'somente o erro da conta ativa pode ser elegível para renderização');
  assert.match(source, /const pending = currentRead \? currentRead\.surveys\.filter/,
    'as pesquisas pendentes precisam derivar da leitura da conta ativa');
  assert.match(source, /currentRead\.surveys\.map\(item =>/,
    'o histórico precisa vir do resultado reconciliado com a conta ativa');
  assert.doesNotMatch(source, /(?<![\w.])items\.map\(item =>/,
    'uma coleção global sem conta não pode alimentar o histórico');
});

test('UX-PRO-ID3 Satisfação: leitura pendente, fora de ordem e payload inválido são honestos', () => {
  assert.match(source, /const latestRequest = useRef\(0\);/, 'é preciso identificar a consulta mais recente');
  assert.match(source, /const requestId = \+\+latestRequest\.current;/, 'cada consulta precisa de sequência própria');
  const staleGuards = source.match(/if \(requestId !== latestRequest\.current\) return;/g) || [];
  assert.ok(staleGuards.length >= 3, 'sucesso, erro e finally precisam descartar consulta fora de ordem');
  assert.match(source, /Array\.isArray\(data\.surveys\)/, 'payload inesperado não é "nenhuma pesquisa"');
  assert.match(source, /aria-busy=\{readLoading\}/, 'as regiões precisam anunciar a leitura em andamento');
  assert.match(source, /readLoading \|\| !currentRead/, 'conta sem leitura concluída permanece em carregamento');
  assert.doesNotMatch(source, /load_failed/, 'código técnico de erro não pode aparecer para o cliente');
  assert.match(source, /currentError \? \(/, 'a falha precisa ser exibida em alerta');
  assert.match(source, /currentRead \? \(/, 'os dados já lidos precisam continuar renderizados na falha');
  assert.match(source, /Última leitura concluída/, 'a tela precisa identificar a última leitura válida');
  const suspended = source.match(/appStyles\.suspendedNote/g) || [];
  assert.ok(suspended.length >= 2, 'formulário e histórico precisam de estado próprio para cadastro inativo');
});

test('UX-PRO-ID3 Satisfação: resposta traduz erros reais e não envia pesquisa de outra conta', () => {
  const workspaceFetchCalls = source.match(/workspaceFetch\(/g) || [];
  assert.equal(workspaceFetchCalls.length, 1,
    'apenas o GET pode usar workspaceFetch; o POST precisa ler o corpo de erro');
  assert.match(source, /await fetch\("\/api\/client\/satisfaction-surveys", \{/, 'POST com fetch direto');
  assert.match(source, /messages\[data\.error \|\| ""\]/, 'o motivo do erro precisa ser traduzido');
  assert.match(source, /invalid_response:/, '400 invalid_response precisa de mensagem amigável');
  assert.match(source, /score_outside_declared_scale:/, '400 de nota fora da escala precisa de mensagem amigável');
  assert.match(source, /pending\.some\(/, 'o survey_id enviado precisa pertencer às pendentes da conta ativa');
  assert.match(source, /Idempotency-Key/, 'a chave de idempotência precisa ser preservada');
});
