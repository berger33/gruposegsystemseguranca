import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-ID3 / /cliente/app/relatorios: além do vazamento A/B, esta página
// renderiza BOTÕES DE ACEITE por relatório e guarda rascunhos de observação por
// id. Um relatório de A não pode deixar um botão clicável nem uma observação
// digitada na tela de B. O PATCH também precisa ler o corpo do 400.
const source = await readFile(
  new URL('../src/app/cliente/app/relatorios/page.tsx', import.meta.url),
  'utf8',
);

test('UX-PRO-ID3 Relatórios: leitura, erro, lista e aceites ficam na conta ativa', () => {
  assert.match(source, /type ReportsRead = \{\s*accountId: string;\s*reports: Report\[\];/,
    'o resultado precisa guardar a conta que originou a leitura');
  assert.match(source, /type ReportsReadError = \{ accountId: string; message: string \}/,
    'o erro precisa guardar a conta que originou a falha');
  assert.match(source, /setRead\(\{ accountId, reports: data\.reports/,
    'o sucesso precisa ser gravado junto do accountId da consulta');
  assert.match(source, /setReadError\(\{ accountId, message:/,
    'a falha precisa ser gravada junto do accountId da consulta');
  assert.match(source, /const currentRead = activeAccount\?\.id === read\?\.accountId \? read : null;/,
    'somente o resultado da conta ativa pode ser elegível para renderização');
  assert.match(source, /const currentError = activeAccount\?\.id === readError\?\.accountId \? readError : null;/,
    'somente o erro da conta ativa pode ser elegível para renderização');
  assert.match(source, /currentRead\.reports\.map\(report =>/,
    'a lista e seus botões de aceite precisam vir do resultado reconciliado');
  assert.doesNotMatch(source, /(?<![\w.])reports\.map\(report =>/,
    'uma coleção global sem conta não pode alimentar botões de aceite');
  assert.match(source, /const accountId = activeAccount\.id;/, 'a conta precisa ser capturada antes do await');
  assert.match(source, /currentRead\.reports\.some\(/,
    'o PATCH precisa conferir que o relatório pertence à conta ativa');
});

test('UX-PRO-ID3 Relatórios: leitura pendente, fora de ordem e payload inválido são honestos', () => {
  assert.match(source, /const latestRequest = useRef\(0\);/, 'é preciso identificar a consulta mais recente');
  assert.match(source, /const requestId = \+\+latestRequest\.current;/, 'cada consulta precisa de sequência própria');
  const staleGuards = source.match(/if \(requestId !== latestRequest\.current\) return;/g) || [];
  assert.ok(staleGuards.length >= 3, 'sucesso, erro e finally precisam descartar consulta fora de ordem');
  assert.match(source, /Array\.isArray\(data\.reports\)/, 'payload inesperado não é "nenhum relatório"');
  assert.doesNotMatch(source, /workspaceResponse/,
    'o corpo não pode ser parseado duas vezes (a checagem de !ok era caminho morto)');
  assert.match(source, /aria-busy=\{readLoading\}/, 'a região precisa anunciar a leitura em andamento');
  assert.match(source, /readLoading \|\| !currentRead/, 'conta sem leitura concluída permanece em carregamento');
  assert.match(source, /currentError \? \(/, 'a falha precisa ser exibida em alerta');
  assert.match(source, /currentRead \? \(/, 'os dados já lidos precisam continuar renderizados na falha');
  assert.match(source, /Última leitura concluída/, 'a tela precisa identificar a última leitura válida');
  assert.match(source, /appStyles\.suspendedNote/, 'cadastro inativo precisa de estado próprio');
  assert.match(source, /setNotes\(\{\}\)/,
    'os rascunhos de observação precisam ser limpos na troca de conta');
  assert.match(source, /setMessage\(""\)/, 'a mensagem de aceite da conta anterior precisa ser limpa');
});

test('UX-PRO-ID3 Relatórios: aceite traduz erros reais do PATCH', () => {
  const workspaceFetchCalls = source.match(/workspaceFetch\(/g) || [];
  assert.equal(workspaceFetchCalls.length, 1,
    'apenas o GET pode usar workspaceFetch; o PATCH precisa ler o corpo de erro');
  assert.match(source, /await fetch\(`\/api\/client\/reports\/\$\{report\.id\}\/acknowledge`, \{/,
    'PATCH com fetch direto');
  assert.match(source, /messages\[payload\.error \?\? ""\]/, 'o motivo do erro precisa ser traduzido');
  assert.match(source, /report_acknowledgement_too_short:/, '400 de observação curta precisa de mensagem amigável');
  assert.match(source, /report_not_published:/, '403 de relatório não publicado precisa de mensagem amigável');
  assert.match(source, /report_not_found:/, '404 de relatório precisa de mensagem amigável');
  assert.match(source, /invalid_request:/, '400 de corpo inválido precisa de mensagem amigável');
  assert.match(source, /actionFailureMessage\(error\)/, 'queda de rede não pode exibir erro cru');
  assert.match(source, /reportStatus\[report\.status\] \?\?/,
    'status inesperado no payload não pode quebrar a renderização');
});
