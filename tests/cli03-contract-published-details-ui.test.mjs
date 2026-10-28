import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// CLI-03 (fatia de UI): a rota GET /api/client/contracts/:id/published-details
// já era provada por HTTP/PostgreSQL, mas não tinha nenhuma tela. Esta guarda
// congela o contrato da interface acrescentada em /cliente/app/contratos:
// leitura presa à conta ativa E ao contrato aberto, descarte de resposta fora
// de ordem, estados honestos (carregando/erro/negado/vazio) e nenhum campo que
// o servidor deliberadamente não projeta (file_url / storage_key).

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const contractsSource = await read('src/app/cliente/app/contratos/page.tsx');
const serverSource = await read('server.mjs');
const apiSource = await read('src/server/client-space-api.mjs');

test('CLI-03 UI: a tela consome a rota canônica de detalhe publicado', () => {
  assert.match(
    contractsSource,
    /\/api\/client\/contracts\/\$\{contractId\}\/published-details\?account=\$\{encodeURIComponent\(accountId\)\}/,
    'a leitura precisa usar a rota canônica com conta e contrato na URL',
  );
  assert.match(contractsSource, /\{ cache: "no-store" \}/, 'a leitura não pode ser servida de cache');
  // A rota precisa continuar despachada no servidor e não pode virar alias novo.
  assert.ok(
    serverSource.includes('clientContractPublishedMatch = url.pathname.match('),
    'o despacho da rota published-details precisa continuar existindo em server.mjs',
  );
  assert.ok(
    serverSource.includes('\\/published-details$/i'),
    'o padrão publicado precisa exigir o UUID do contrato e o sufixo published-details',
  );
  assert.match(
    serverSource,
    /handleClientContractPublishedDetails\(req, res, url, clientContractPublishedMatch\[1\]\)/,
    'o despacho precisa entregar o id do contrato ao handler de leitura',
  );
  assert.match(
    apiSource,
    /async function handleClientContractPublishedDetails\(req, res, url, contractId\)/,
    'o handler de leitura publicado precisa continuar no módulo do portal do cliente',
  );
});

test('CLI-03 UI: leitura e erro do detalhe ficam presos à conta ativa e ao contrato aberto', () => {
  assert.match(contractsSource, /type DetailRead = \{ accountId: string; contractId: string; data: ContractPublishedDetails \}/,
    'o resultado do detalhe precisa guardar conta e contrato de origem');
  assert.match(contractsSource, /type DetailReadError = \{ accountId: string; contractId: string; message: string \}/,
    'o erro do detalhe precisa guardar conta e contrato de origem');
  assert.match(contractsSource, /setDetailRead\(\{ accountId, contractId, data: payload as unknown as ContractPublishedDetails \}\)/,
    'o sucesso precisa ser gravado junto da conta e do contrato consultados');
  assert.match(contractsSource, /setDetailError\(\{ accountId, contractId, message: detailFailureMessage\(response\.status, payload\?\.error\) \}\)/,
    'a falha precisa ser gravada junto da conta e do contrato consultados');
  assert.match(
    contractsSource,
    /activeAccount\?\.id === detailRead\?\.accountId && detailRead\?\.contractId === openContractId \? detailRead : null;/,
    'somente o detalhe da conta ativa e do contrato aberto pode ser renderizado',
  );
  assert.match(
    contractsSource,
    /activeAccount\?\.id === detailError\?\.accountId && detailError\?\.contractId === openContractId \? detailError : null;/,
    'somente o erro da conta ativa e do contrato aberto pode ser renderizado',
  );
  // Reaproveitar a leitura de outro contrato seria mostrar detalhe trocado.
  assert.match(contractsSource, /const reusable = detailRead\?\.accountId === accountId && detailRead\?\.contractId === contractId;/,
    'a releitura só pode ser reaproveitada quando conta e contrato coincidem');
  assert.match(contractsSource, /setDetailRead\(reusable \? detailRead : null\)/,
    'abrir outro contrato precisa descartar o detalhe anterior');
});

test('CLI-03 UI: resposta fora de ordem não sobrescreve o detalhe mais recente', () => {
  assert.match(contractsSource, /const latestDetailRequest = useRef\(0\);/,
    'o componente precisa identificar a leitura de detalhe mais recente');
  assert.match(contractsSource, /const requestId = \+\+latestDetailRequest\.current;/,
    'cada leitura de detalhe precisa receber uma sequência própria');
  const staleGuards = contractsSource.match(/if \(requestId !== latestDetailRequest\.current\) return;/g) || [];
  assert.ok(staleGuards.length >= 3,
    'sucesso, erro e finally da leitura de detalhe precisam descartar consulta obsoleta');
  // Trocar de conta/contrato ou fechar o painel invalida a leitura em voo.
  const invalidations = contractsSource.match(/latestDetailRequest\.current \+= 1;/g) || [];
  assert.ok(invalidations.length >= 2,
    'troca de conta e fechamento do painel precisam invalidar a leitura em voo');
});

test('CLI-03 UI: estados do detalhe são anunciados e existe repetição', () => {
  assert.match(contractsSource, /aria-expanded=\{isOpen\}/, 'o botão precisa declarar se o painel está aberto');
  assert.match(contractsSource, /aria-controls=\{`contract-published-details-\$\{contract\.id\}`\}/,
    'o botão precisa apontar para o painel que controla');
  assert.match(contractsSource, /id=\{`contract-published-details-\$\{contract\.id\}`\}/,
    'o painel precisa ter o id referenciado pelo botão');
  assert.match(contractsSource, /role="region"/, 'o painel precisa ser uma região identificável');
  assert.match(contractsSource, /aria-label=\{`Detalhes publicados do contrato \$\{contract\.title\}`\}/,
    'a região precisa de nome acessível com o contrato');
  assert.match(contractsSource, /aria-busy=\{isLoadingDetail\}/, 'a região precisa anunciar leitura em andamento');
  assert.match(contractsSource, /role="status"/, 'o carregamento precisa ser anunciado sem interromper');
  assert.match(contractsSource, /role="alert"/, 'a falha precisa ser anunciada como alerta');
  assert.match(contractsSource, /onClick=\{\(\) => loadDetails\(activeAccount\.id, contract\.id\)\}/,
    'a falha precisa oferecer repetição da leitura do mesmo contrato');
});

test('CLI-03 UI: as três coleções publicadas vêm só da leitura reconciliada', () => {
  assert.match(contractsSource, /currentDetail\.data\.items\.map\(item =>/, 'os itens precisam vir da leitura reconciliada');
  assert.match(contractsSource, /currentDetail\.data\.vigencias\.map\(vigencia =>/, 'as vigências precisam vir da leitura reconciliada');
  assert.match(contractsSource, /currentDetail\.data\.documents\.map\(document =>/,
    'os documentos precisam vir da leitura reconciliada');
  assert.doesNotMatch(contractsSource, /(?<![\w.])detailRead\.data\.(items|vigencias|documents)\.map\(/,
    'uma leitura global sem conta não pode alimentar o painel');
  // Vazio é vazio declarado, nunca silêncio.
  assert.match(contractsSource, /Nenhum item de serviço foi publicado para este contrato\./);
  assert.match(contractsSource, /Nenhuma vigência está ativa nesta data\./);
  assert.match(contractsSource, /Nenhum documento foi publicado para este contrato\./);
});

test('CLI-03 UI: nenhum campo privado é exibido e não se promete download', () => {
  // Comentários podem citar os campos proibidos; o CÓDIGO não.
  const codeOnly = contractsSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(codeOnly, /file_url/, 'a projeção do servidor exclui file_url; a tela não pode reintroduzir');
  assert.doesNotMatch(codeOnly, /storage_key/, 'a projeção do servidor exclui storage_key; a tela não pode reintroduzir');
  assert.match(contractsSource, /sem link de download/, 'a tela precisa declarar que não oferece download');
  assert.doesNotMatch(contractsSource, /href=\{`?\/api\/client\/documents/,
    'o painel não pode inventar um link de download que o servidor não publica');
});

test('CLI-03 UI: motivos de falha do servidor têm mensagem própria', () => {
  for (const code of ['invalid_account_id', 'invalid_contract_id', 'forbidden', 'contract_not_found', 'client_session_required']) {
    assert.match(contractsSource, new RegExp(`${code}:\\s*"`), `o motivo ${code} precisa de mensagem específica`);
  }
  assert.match(contractsSource, /if \(status === 403\) return "Seu acesso não permite ver os detalhes publicados deste contrato\.";/,
    '403 sem motivo precisa continuar traduzido como negativa de escopo');
  assert.match(contractsSource, /if \(status === 404\) return "Este contrato não está mais disponível para este cadastro\.";/,
    '404 sem motivo precisa continuar traduzido como indisponibilidade do contrato');
});

test('CLI-03 UI: o comportamento anterior da lista de contratos foi preservado', () => {
  assert.match(contractsSource, /type ContractRead = \{ accountId: string; contracts: Contract\[\] \}/,
    'a leitura da lista continua presa à conta ativa');
  assert.match(contractsSource, /const currentRead = activeAccount\?\.id === read\?\.accountId \? read : null;/);
  assert.match(contractsSource, /currentRead\.contracts\.map\(contract =>/, 'a lista continua vindo da leitura reconciliada');
  assert.match(contractsSource, /aria-busy=\{readLoading\}/, 'a região da lista continua anunciando leitura');
  assert.match(contractsSource, /Carregando contratos…/);
  assert.match(contractsSource, /Nenhum contrato foi registrado ainda para este cadastro/);
  assert.match(contractsSource, /Cadastro \{activeAccount\.status === "suspended" \? "suspenso" : "encerrado"\}/,
    'o aviso de cadastro suspenso/encerrado continua existindo');
  assert.match(contractsSource, /Recorte do vínculo: \{activeAccount\.scope_note\}/,
    'o recorte do vínculo continua visível');
  // A conta nova não herda painel aberto da conta anterior.
  const clearedOnEffect = /useEffect\(\(\) => \{[\s\S]*?setOpenContractId\(null\);[\s\S]*?\}, \[activeAccount, loadContracts\]\);/.test(contractsSource);
  assert.ok(clearedOnEffect, 'a troca de conta precisa fechar o painel de detalhe');
});
