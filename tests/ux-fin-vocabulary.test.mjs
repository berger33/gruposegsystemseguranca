// UX-07B — o vocabulário financeiro não pode divergir dos servidores.
//
// Este teste lê `src/server/fin-api.mjs`, `fin-advanced-api.mjs`,
// `fin-budget-api.mjs` e `f03-finance-api.mjs` e FALHA se a interface passar a
// traduzir um código que os servidores não devolvem, ou deixar sem frase um
// código que eles devolvem.
//
// Em dinheiro, duas regras valem dobrado e estão trancadas aqui:
//  - falha de leitura NUNCA vira zero, saldo vazio ou "nenhuma cobrança";
//  - o sistema NÃO paga automaticamente, e a tela precisa dizer isso.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import {
  accountStatusLabel,
  accountStatusTone,
  budgetStatusLabel,
  conciliationStatusLabel,
  conciliationStatusTone,
  describeFinError,
  finErrorFootnote,
  finErrorVariant,
  moneyLabel,
} from '../src/lib/fin-vocabulary.mjs';

const ARQUIVOS_API = ['fin-api.mjs', 'fin-advanced-api.mjs', 'fin-budget-api.mjs', 'f03-finance-api.mjs'];
const fontesApi = await Promise.all(
  ARQUIVOS_API.map(nome => readFile(new URL(`../src/server/${nome}`, import.meta.url), 'utf8')),
);
const vocabulario = await readFile(new URL('../src/lib/fin-vocabulary.mjs', import.meta.url), 'utf8');
const telaRaiz = await readFile(new URL('../src/app/admin/financeiro/FinanceiroWorkspace.tsx', import.meta.url), 'utf8');
const telaOrcamento = await readFile(new URL('../src/app/admin/financeiro/BudgetWorkspace.tsx', import.meta.url), 'utf8');
const telaConciliacao = await readFile(new URL('../src/app/admin/financeiro/BankReconciliationWorkspace.tsx', import.meta.url), 'utf8');

function serverErrorCodes(source) {
  const codes = new Set();
  for (const match of source.matchAll(/error:\s*["']([a-z0-9_]+)["']/g)) codes.add(match[1]);
  return codes;
}

const codigosServidor = new Set(fontesApi.flatMap(fonte => [...serverErrorCodes(fonte)]));
const traduzidos = [...vocabulario.matchAll(/^ {2}([a-z0-9_]+): \{/gm)].map(match => match[1]);

test('UX-07B deriva: todo código dos servidores financeiros tem frase em português', () => {
  assert.ok(codigosServidor.size > 170,
    `esperava mais de cento e setenta códigos somando os quatro servidores, achei ${codigosServidor.size}`);
  const semTraducao = [...codigosServidor].filter(code => !traduzidos.includes(code));
  assert.deepEqual(semTraducao.sort(), [],
    `códigos dos servidores sem frase em português: ${semTraducao.join(', ')}`);
});

test('UX-07B deriva: nenhuma tradução inventa um código que os servidores não devolvem', () => {
  const inventados = traduzidos.filter(code => !codigosServidor.has(code));
  assert.deepEqual(inventados.sort(), [],
    `traduções para códigos inexistentes nos servidores: ${inventados.join(', ')}`);
});

test('UX-07B dinheiro: falha de leitura jamais vira saldo, zero ou ausência de cobrança', () => {
  const falha = describeFinError('finance_flow_unavailable', 503);
  assert.equal(falha.kind, 'retry');
  assert.equal(falha.canRetry, true);
  assert.match(falha.detail, /NÃO significa que não existam contas, baixas ou regras/i);
  assert.match(falha.detail, /Nenhum valor exibido como zero representa saldo real/i);

  const rede = describeFinError(null, 0);
  assert.equal(rede.kind, 'network');
  assert.match(rede.detail, /pode ser lido como saldo real/i);
  assert.equal(finErrorFootnote(rede), 'Resposta do servidor: sem resposta.');
});

test('UX-07B dinheiro: valor ausente é declarado ausente, nunca R$ 0,00', () => {
  assert.equal(moneyLabel(null), 'Dado ausente');
  assert.equal(moneyLabel(undefined), 'Dado ausente');
  assert.equal(moneyLabel(''), 'Dado ausente');
  assert.equal(moneyLabel('abacaxi'), 'Dado ausente');
  assert.equal(moneyLabel(0), 'R$ 0,00', 'zero de verdade continua sendo zero');
  assert.equal(moneyLabel('12345'), 'R$ 123,45');
});

test('UX-07B pagamento: o sistema não paga automaticamente, e diz isso', () => {
  const automatico = describeFinError('auto_paid_forbidden_nao_pagar_automaticamente', 403);
  assert.equal(automatico.kind, 'denied');
  assert.match(automatico.detail, /Nada foi pago/i);
  assert.match(automatico.title, /não paga automaticamente/i);

  const manual = describeFinError('manual_payment_confirmation_required_nao_pagar_automaticamente', 409);
  assert.match(manual.detail, /não paga sozinho/i);
  assert.match(manual.detail, /nada foi pago/i);

  // Cobrança não dispara mensagem real.
  assert.match(describeFinError('real_message_forbidden', 403).detail, /Nada foi enviado/i);
});

test('UX-07B auditoria fail-closed: sem trilha, nenhum lançamento é gravado', () => {
  const descriptor = describeFinError('audit_unavailable', 503);
  assert.equal(descriptor.kind, 'retry');
  assert.match(descriptor.detail, /fail-closed/i);
  assert.match(descriptor.detail, /nenhum lançamento é gravado/i);
});

test('UX-07B permissão: negado e indisponível são estados diferentes', () => {
  const negado = describeFinError('forbidden', 403);
  const indisponivel = describeFinError('finance_flow_unavailable', 503);
  assert.equal(finErrorVariant(negado), 'denied');
  assert.equal(finErrorVariant(indisponivel), 'error');
  assert.equal(negado.canRetry, false);
  assert.match(negado.detail, /O menu pode mostrar o caminho, mas a concessão é verificada no servidor/i);
  assert.equal(describeFinError('read_only', 403).kind, 'denied');
  assert.match(describeFinError('read_only', 403).detail, /Nada foi gravado/i);
});

test('UX-07B histórico e estorno: nada é reescrito em silêncio', () => {
  assert.match(describeFinError('history_immutable', 409).detail, /não é editado nem apagado/i);
  assert.match(describeFinError('estorno_already_exists', 409).detail, /Nada foi estornado duas vezes/i);
  assert.match(describeFinError('estorno_amount_exceeds_origin', 409).detail, /mais do que foi pago/i);
  assert.match(describeFinError('approved_budget_locked_requires_revision', 409).detail, /registre uma revisão/i);
  assert.match(describeFinError('budget_archived_locked', 409).detail, /histórico é preservado/i);
});

test('UX-07B idempotência: repetição recusada diz que nada foi gravado duas vezes', () => {
  assert.match(describeFinError('idempotency_key_conflict', 409).detail, /Nada foi gravado duas vezes/i);
  assert.match(describeFinError('idempotency_key_reused_with_different_payload', 409).detail, /Nada foi gravado/i);
  assert.match(describeFinError('already_generated', 409).detail, /nada foi duplicado/i);
});

test('UX-07B margem: percentual é calculado, não digitado', () => {
  const descriptor = describeFinError('margin_percent_not_accepted_calculated_from_revenue_and_cost', 400);
  assert.match(descriptor.title, /calculada/i);
  assert.match(descriptor.detail, /receita e custo/i);
  assert.match(describeFinError('premises_10_2000_required_nao_prometer_resultado', 400).detail,
    /projeta cenário, não garante resultado/i);
});

test('UX-07B diagnóstico: o código canônico fica no rodapé, entre parênteses', () => {
  const descriptor = describeFinError('already_generated', 409);
  assert.equal(finErrorFootnote(descriptor), 'Resposta do servidor: HTTP 409 (already_generated).');
  for (const code of traduzidos) {
    assert.doesNotMatch(describeFinError(code, 400).title, new RegExp(`\\b${code}\\b`),
      `o título de ${code} não pode exibir o código cru`);
  }
});

test('UX-07B rótulos: tradução não altera o valor e o desconhecido passa cru', () => {
  assert.equal(accountStatusLabel('parcial'), 'Parcialmente baixada');
  assert.equal(accountStatusLabel('RECEBIDO'), 'Recebido');
  assert.equal(accountStatusLabel(null), '—');
  assert.equal(accountStatusLabel('status_novo'), 'status_novo');
  assert.equal(accountStatusTone('vencido'), 'danger');
  assert.equal(accountStatusTone('desconhecido'), 'neutral');
  assert.equal(conciliationStatusLabel('divergente'), 'Divergente');
  assert.equal(conciliationStatusTone('conciliada'), 'success');
  assert.equal(budgetStatusLabel('em_revisao'), 'Em revisão');
  assert.equal(budgetStatusLabel('situacao_nova'), 'situacao_nova');
});

test('UX-07B rótulos: todo valor traduzido existe no contrato (servidor ou enum do banco)', async () => {
  const uniao = fontesApi.join('\n');
  // Os valores canônicos de situação vivem nos enums do banco; lê-los aqui é o
  // que impede o rótulo de inventar um valor que o servidor nunca devolve.
  const dirMigracoes = new URL('../db/migrations/', import.meta.url);
  const arquivos = (await readdir(dirMigracoes)).filter(nome => nome.endsWith('.sql'));
  const migracoes = (await Promise.all(
    arquivos.map(nome => readFile(new URL(nome, dirMigracoes), 'utf8')),
  )).join('\n');
  const enums = [...migracoes.matchAll(/ENUM \(([^)]*)\)/g)].map(m => m[1]).join(' ');
  const catalogos = [...vocabulario.matchAll(/_LABELS = Object\.freeze\(\{([\s\S]*?)\}\);/g)]
    .flatMap(bloco => [...bloco[1].matchAll(/(?:^|[\s{])'?([a-z0-9_]+)'?\s*:/g)].map(m => m[1]));
  const universo = `${uniao}\n${migracoes}\n${enums}`;
  const foraDoContrato = [...new Set(catalogos)].filter(valor => !universo.includes(`'${valor}'`));
  assert.deepEqual(foraDoContrato.sort(), [],
    `valores traduzidos fora do contrato: ${foraDoContrato.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Amarrações de tela (estáticas). O comportamento é provado pelo gate
// scripts/qa-ux-fin-postgres.mjs, com PostgreSQL real e Chromium real.
// ---------------------------------------------------------------------------

function semComentarios(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('UX-07B tela: o financeiro tem abas de verdade, com painel e teclado', () => {
  assert.match(telaRaiz, /role="tablist"/);
  assert.match(telaRaiz, /role="tab"/);
  assert.match(telaRaiz, /role="tabpanel"/, 'o painel precisa existir — era o que faltava');
  assert.match(telaRaiz, /aria-controls=\{`finance-painel-\$\{id\}`\}/);
  assert.match(telaRaiz, /tabIndex=\{tab===id\?0:-1\}/, 'só a aba ativa fica na ordem de tabulação');
  for (const tecla of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
    assert.ok(telaRaiz.includes(`"${tecla}"`), `a navegação por teclado precisa tratar ${tecla}`);
  }
});

test('UX-07B tela: as três telas descrevem a falha pelo vocabulário, não pelo código cru', () => {
  for (const [nome, fonte] of [['raiz', telaRaiz], ['orçamento', telaOrcamento], ['conciliação', telaConciliacao]]) {
    const codigo = semComentarios(fonte);
    assert.match(codigo, /describeFinError/, `${nome}: a falha precisa passar pelo vocabulário`);
    assert.match(codigo, /finErrorFootnote/, `${nome}: o rodapé com HTTP e código precisa aparecer`);
    assert.doesNotMatch(codigo, /error instanceof Error \? error\.message/,
      `${nome}: mensagem crua de exceção não pode voltar`);
    assert.doesNotMatch(codigo, /new Error\(String\(data\.error/,
      `${nome}: o erro precisa carregar status, não só texto`);
  }
});

test('UX-07B tela: os estados declarados aparecem, e vazio só depois de ler', () => {
  assert.match(telaRaiz, /variant="loading"/);
  assert.match(telaRaiz, /variant=\{finErrorVariant\(/);
  assert.match(telaRaiz, /loaded&&!error/, 'o vazio da tabela depende de leitura concluída');
  assert.match(telaRaiz, /A leitura foi concluída com sucesso/);
  assert.match(telaConciliacao, /A leitura foi concluída com sucesso/);
  assert.match(telaOrcamento, /A leitura foi concluída com sucesso/);
});

test('UX-07B tela: a tabela de recebíveis não afirma ausência sem leitura', () => {
  assert.match(telaRaiz, /Recebíveis ainda não lidos — nada aqui representa saldo/,
    'antes da primeira leitura a tabela precisa dizer que ainda não leu');
});
