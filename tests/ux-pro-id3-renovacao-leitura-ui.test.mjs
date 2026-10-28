import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-ID3 / /cliente/app/renovacao: uma única leitura alimenta QUATRO
// superfícies — o <select> de manifestação, a lista de comunicações, a faixa
// de restrição declarada e as datas de vencimento (contratos + CRM). Um dado
// da conta A não pode sobreviver à seleção da conta B em nenhuma delas.
const source = await readFile(
  new URL('../src/app/cliente/app/renovacao/page.tsx', import.meta.url),
  'utf8',
);

test('UX-PRO-ID3 Renovação: leitura, erro, restrição e datas ficam na conta ativa', () => {
  assert.match(source, /type RenewalRead = \{\s*accountId: string;\s*communications: Communication\[\];/,
    'o resultado precisa guardar a conta que originou a leitura');
  assert.match(source, /type RenewalReadError = \{ accountId: string; message: string \}/,
    'o erro precisa guardar a conta que originou a falha');
  assert.match(source, /setRead\(\{ accountId, communications: data\.communications/,
    'o sucesso precisa ser gravado junto do accountId da consulta');
  assert.match(source, /setReadError\(\{ accountId, message:/,
    'a falha precisa ser gravada junto do accountId da consulta');
  assert.match(source, /const currentRead = activeAccount\?\.id === read\?\.accountId \? read : null;/,
    'somente o resultado da conta ativa pode ser elegível para renderização');
  assert.match(source, /const currentError = activeAccount\?\.id === readError\?\.accountId \? readError : null;/,
    'somente o erro da conta ativa pode ser elegível para renderização');
  assert.match(source, /currentRead\?\.accessRestriction\.restricted/,
    'a restrição declarada precisa vir da leitura da conta ativa');
  assert.match(source, /currentRead\.communications\.map\(item =>/,
    'a lista de comunicações precisa vir do resultado reconciliado');
  assert.match(source, /currentRead\.responses\.filter\(r =>/,
    'as manifestações registradas precisam vir do resultado reconciliado');
  assert.match(source, /currentRead\.renewalDates\.contracts\.map\(item =>/,
    'os vencimentos de contratos precisam vir do resultado reconciliado');
  assert.match(source, /currentRead\.renewalDates\.crmRenewals\.map\(item =>/,
    'as renovações do CRM precisam vir do resultado reconciliado');
  assert.doesNotMatch(source, /data\?\.communications/,
    'um payload global sem conta não pode alimentar a lista');
  assert.doesNotMatch(source, /data\?\.renewalDates/,
    'um payload global sem conta não pode alimentar as datas');
});

test('UX-PRO-ID3 Renovação: leitura pendente, fora de ordem e payload inválido são honestos', () => {
  assert.match(source, /const latestRequest = useRef\(0\);/, 'é preciso identificar a consulta mais recente');
  assert.match(source, /const requestId = \+\+latestRequest\.current;/, 'cada consulta precisa de sequência própria');
  const staleGuards = source.match(/if \(requestId !== latestRequest\.current\) return;/g) || [];
  assert.ok(staleGuards.length >= 3, 'sucesso, erro e finally precisam descartar consulta fora de ordem');
  assert.match(source, /Array\.isArray\(data\.communications\)/, 'comunicações inesperadas não são "nenhuma comunicação"');
  assert.match(source, /Array\.isArray\(data\.responses\)/, 'manifestações inesperadas não são "nenhuma resposta"');
  assert.match(source, /Array\.isArray\(data\.renewalDates\.contracts\)/, 'contratos inesperados não são "nenhum vencimento"');
  assert.match(source, /Array\.isArray\(data\.renewalDates\.crmRenewals\)/, 'renovações inesperadas não são "nenhum vencimento"');
  const busyRegions = source.match(/aria-busy=\{readLoading\}/g) || [];
  assert.ok(busyRegions.length >= 3, 'formulário, comunicações e datas precisam anunciar a leitura em andamento');
  assert.match(source, /readLoading \|\| !currentRead/, 'conta sem leitura concluída permanece em carregamento');
  assert.match(source, /currentError \? \(/, 'a falha precisa ser exibida em alerta');
  assert.match(source, /currentRead \? \(/, 'os dados já lidos precisam continuar renderizados na falha');
  assert.match(source, /Última leitura concluída/, 'a tela precisa identificar a última leitura válida');
  const suspended = source.match(/appStyles\.suspendedNote/g) || [];
  assert.ok(suspended.length >= 3, 'as três seções precisam de estado próprio para cadastro inativo');
  assert.doesNotMatch(source, /load_failed/, 'código técnico de erro não pode aparecer para o cliente');
});

test('UX-PRO-ID3 Renovação: manifestação traduz erros reais e não envia comunicação de outra conta', () => {
  const workspaceFetchCalls = source.match(/workspaceFetch\(/g) || [];
  assert.equal(workspaceFetchCalls.length, 1,
    'apenas o GET pode usar workspaceFetch; o POST precisa ler o corpo de erro');
  assert.match(source, /await fetch\("\/api\/client\/renewal-communications", \{/, 'POST com fetch direto');
  assert.match(source, /messages\[data\.error \|\| ""\]/, 'o motivo do erro precisa ser traduzido');
  assert.match(source, /const accountId = activeAccount\.id;/, 'a conta precisa ser capturada antes do await');
  assert.match(source, /currentRead\.communications\.some\(/,
    'o communication_id enviado precisa pertencer à leitura da conta ativa');
  assert.match(source, /currentRead\.responses/, 'os tipos disponíveis precisam vir da leitura da conta ativa');
  assert.match(source, /Idempotency-Key/, 'a chave de idempotência precisa ser preservada');
  assert.match(source, /invalid_reference:/, '400 de referência inválida precisa de mensagem amigável');
  assert.match(source, /invalid_response_kind:/, '400 de tipo inválido precisa de mensagem amigável');
  assert.match(source, /idempotency_key_required:/, '400 de chave ausente precisa de mensagem amigável');
  assert.match(source, /renewal_communication_unavailable:/, '503 do serviço precisa de mensagem amigável');
  assert.match(source, /submitFailureMessage\(error\)/, 'queda de rede não pode exibir "Failed to fetch" cru');
});
