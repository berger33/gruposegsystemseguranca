// UX-07 (fatia B — Financeiro) — o vocabulário da tela financeira não pode
// divergir dos seis servidores que ela consome.
//
// Este teste lê `src/server/fin-api.mjs`, `fin-advanced-api.mjs`,
// `fin-budget-api.mjs`, `fin-management-api.mjs`, `f03-finance-api.mjs` e
// `commission-api.mjs` e falha se a interface passar a traduzir um código que
// os servidores não devolvem mais, ou deixar sem tradução um código que eles
// devolvem. É a mesma amarração que, em UX-06, encontrou códigos sem frase.
//
// Dois cuidados no levantamento, ambos declarados e não adivinhados:
//
//  1. `key.includes('...')` e `x === '...'` aparecem DENTRO da expressão que
//     monta o código (`{error: key.includes('idempotency') ? 'duplicate_...'}`)
//     — o literal testado na condição é o nome de uma constraint do banco, não
//     um código devolvido ao cliente. Esses operandos são removidos antes da
//     extração.
//  2. Dois códigos são montados por template literal a partir do nome do
//     campo: `invalid_${key}` em `fin-budget-api.mjs` (sobre `rule_id`,
//     `commission_id`, `contract_id`) e em `fin-management-api.mjs` (sobre
//     `contract_id`, `client_account_id`, `competence_date`, `status`). Os
//     valores realmente possíveis estão nas duas listas do próprio servidor e
//     são declarados explicitamente abaixo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  describeFinanceError,
  financeErrorFootnote,
  financeErrorMessage,
  financeErrorVariant,
  accountStatusLabel,
  approvalStatusLabel,
  agingBucketLabel,
  cashflowTypeLabel,
  chargeStatusLabel,
  closureStatusLabel,
  collectionStatusLabel,
  commissionStatusLabel,
  conciliationStatusLabel,
  expenseStatusLabel,
  exportStatusLabel,
  fiscalDocStatusLabel,
  fiscalObligationStatusLabel,
  fiscalProviderStatusLabel,
  gatewayStatusLabel,
  resultStatusLabel,
  scenarioTypeLabel,
  webhookStatusLabel,
  money,
} from '../src/lib/finance-vocabulary.mjs';

const FILES = [
  '../src/server/fin-api.mjs',
  '../src/server/fin-advanced-api.mjs',
  '../src/server/fin-budget-api.mjs',
  '../src/server/fin-management-api.mjs',
  '../src/server/f03-finance-api.mjs',
  '../src/server/commission-api.mjs',
];

const sources = await Promise.all(FILES.map(file => readFile(new URL(file, import.meta.url), 'utf8')));

/**
 * Todos os códigos que um servidor financeiro pode devolver em
 * `{ error: '...' }`, incluindo os montados por ternário e por
 * `new HttpError(status, 'code')` / `new E(status, 'code')`.
 */
function serverErrorCodes(source) {
  const codes = new Set();
  const cleaned = source
    .replace(/\.includes\(\s*[`'"][^`'"]*[`'"]\s*\)/g, '')
    .replace(/[=!]==?\s*[`'"][^`'"]*[`'"]/g, '');
  for (const match of cleaned.matchAll(/error:\s*([^,}\n]{1,200})/g)) {
    for (const literal of match[1].matchAll(/[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(literal[1]);
  }
  for (const match of cleaned.matchAll(/new (?:HttpError|E)\(\s*\d+\s*,\s*[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(match[1]);
  // Wrappers locais de cada servidor:
  //   const bad = (res, msg) => json(res, 400, { error: msg });
  //   const unavailable = (res, msg) => json(res, 503, { error: msg });
  // Foram esquecidos na primeira versão deste levantamento e escondiam 23
  // códigos; a correção está declarada no documento desta fatia.
  for (const match of cleaned.matchAll(/\b(?:bad|unavailable)\(\s*res\s*,\s*[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(match[1]);
  return codes;
}

const codigosServidor = new Set();
for (const source of sources) for (const code of serverErrorCodes(source)) codigosServidor.add(code);
// Códigos montados por template literal (ver comentário 2 acima).
for (const code of [
  'invalid_rule_id', 'invalid_commission_id', 'invalid_contract_id',
  'invalid_client_account_id', 'invalid_competence_date', 'invalid_status',
]) codigosServidor.add(code);

test('UX-07 financeiro: o levantamento encontra mais de 340 códigos distintos nos seis servidores', () => {
  assert.ok(codigosServidor.size > 340, `esperava mais de 340 códigos, achei ${codigosServidor.size}`);
});

test('UX-07 vocabulário: todo código dos servidores financeiros tem frase em português', () => {
  const semTraducao = [];
  for (const code of codigosServidor) {
    const descriptor = describeFinanceError(code, 500);
    // Sem tradução dedicada o fallback devolve o texto genérico de `internal`.
    if (descriptor.title === 'Falha no servidor' && code !== 'internal') semTraducao.push(code);
  }
  assert.deepEqual(semTraducao.sort(), [],
    `códigos dos servidores financeiros sem frase em português: ${semTraducao.join(', ')}`);
});

test('UX-07 vocabulário: nenhuma tradução inventa um código que os servidores não devolvem', async () => {
  const vocabulario = await readFile(new URL('../src/lib/finance-vocabulary.mjs', import.meta.url), 'utf8');
  const bloco = vocabulario.match(/const ERROR_MESSAGES = Object\.freeze\(\{([\s\S]*?)\n\}\);/)[1];
  const traduzidos = [...bloco.matchAll(/^\s{2}([a-z0-9_]+):\s*\{/gm)].map(match => match[1]);
  assert.ok(traduzidos.length > 340, 'o vocabulário deveria cobrir mais de 340 códigos');

  const inventados = traduzidos.filter(code => !codigosServidor.has(code));
  assert.deepEqual(inventados.sort(), [],
    `traduções para códigos inexistentes nos servidores financeiros: ${inventados.join(', ')}`);
});

test('UX-07 honestidade: toda falha classificada traz código, status e indicação de nova tentativa', () => {
  for (const code of codigosServidor) {
    const descriptor = describeFinanceError(code, 503);
    assert.equal(descriptor.code, code);
    assert.equal(descriptor.status, 503);
    assert.equal(typeof descriptor.canRetry, 'boolean');
    assert.ok(descriptor.title.length > 0, `código ${code} não tem título`);
    assert.ok(descriptor.detail.length > 0, `código ${code} não tem detalhe`);
    // O código canônico nunca é o título: ele só aparece no rodapé.
    assert.notEqual(descriptor.title, code);
    assert.ok(!/^[a-z0-9_]+$/.test(descriptor.title), `o título de ${code} ainda parece um código cru`);
  }
});

test('UX-07 honestidade: falha de leitura e de auditoria nunca dizem "sem registro"', () => {
  for (const code of [
    'audit_unavailable', 'internal', 'migration_required', 'finance_flow_unavailable',
    'commissions_unavailable', 'goals_unavailable', 'rules_unavailable', 'approval_check_unavailable',
  ]) {
    const descriptor = describeFinanceError(code, 503);
    const texto = `${descriptor.title} ${descriptor.detail}`.toLowerCase();
    for (const ausencia of ['nenhum registro', 'não há registro', 'sem registro']) {
      assert.ok(!texto.includes(ausencia), `${code} não pode soar como ausência de dado: "${texto}"`);
    }
    // Mencionar "vazia"/"zero" só é aceitável para NEGAR a leitura vazia.
    if (/vazia|zero|zerad/.test(texto)) {
      assert.match(texto, /não significa/,
        `${code} menciona vazio/zero sem negar explicitamente: "${texto}"`);
    }
    assert.equal(descriptor.canRetry, true, `${code} deveria permitir nova tentativa`);
  }
});

test('UX-07 honestidade: regra de negócio financeira explica a regra, não um código cru', () => {
  for (const code of [
    'already_generated', 'overpayment', 'approval_authority_exceeded', 'requester_cannot_decide',
    'rule_not_approved', 'rule_suspended', 'policy_not_approved', 'charge_paid_only_via_conciliated_webhook',
    'commission_not_approved_cannot_pay', 'auto_paid_forbidden_nao_pagar_automaticamente',
    'margin_not_accepted_calculated_server_side', 'approved_budget_locked_requires_revision',
  ]) {
    const descriptor = describeFinanceError(code, 409);
    assert.ok(['conflict', 'denied', 'invalid'].includes(descriptor.kind),
      `${code} deveria ser recusa de regra de negócio, veio ${descriptor.kind}`);
    assert.equal(descriptor.canRetry, false, `${code} não é resolvido só tentando de novo`);
  }
});

test('UX-07 rodapé: o código canônico só aparece entre parênteses, nunca como frase principal', () => {
  const descriptor = describeFinanceError('already_generated', 409);
  assert.match(financeErrorFootnote(descriptor), /\(already_generated\)/);
  assert.equal(financeErrorVariant(descriptor), 'error');
  assert.equal(financeErrorVariant(describeFinanceError('forbidden', 403)), 'denied');
  // A mensagem de uma linha das áreas FIN-05..FIN-16 mantém o código visível
  // para diagnóstico, depois da frase em português.
  const mensagem = financeErrorMessage('audit_unavailable', 503);
  assert.match(mensagem, /auditoria/i);
  assert.match(mensagem, /\(audit_unavailable\)/);
});

test('UX-07 honestidade: código desconhecido passa cru, nunca é inventado', () => {
  const desconhecido = describeFinanceError('um_codigo_que_o_servidor_nao_tem', 500);
  assert.equal(desconhecido.code, 'um_codigo_que_o_servidor_nao_tem');
  assert.equal(desconhecido.title, 'Falha no servidor');
  const semResposta = describeFinanceError(null, 0);
  assert.equal(semResposta.kind, 'network');
  assert.equal(semResposta.canRetry, true);
});

test('UX-07 vocabulário de situação: valor desconhecido passa cru, nunca é inventado', () => {
  assert.equal(accountStatusLabel('parcial'), 'Baixa parcial');
  assert.equal(accountStatusLabel('um_valor_novo_do_banco'), 'um_valor_novo_do_banco');
  assert.equal(approvalStatusLabel('rejeitado'), 'Recusada');
  assert.equal(conciliationStatusLabel('divergente'), 'Divergente');
  assert.equal(collectionStatusLabel('lembrete_enviado'), 'Lembrete enviado (simulado)');
  assert.equal(cashflowTypeLabel('previsto'), 'Previsto');
  assert.equal(agingBucketLabel('vencido_90_plus'), 'Vencida há mais de 90 dias');
  assert.equal(resultStatusLabel('incompleto'), 'Base incompleta');
  assert.equal(expenseStatusLabel('rejeitado'), 'Recusada');
  assert.equal(fiscalProviderStatusLabel('nao_configurado'), 'Não configurado');
  assert.equal(fiscalObligationStatusLabel('determinada'), 'Determinada');
  assert.equal(fiscalDocStatusLabel('emitido'), 'Emitido (sintético)');
  assert.equal(gatewayStatusLabel('sandbox'), 'Homologado em teste');
  assert.equal(webhookStatusLabel('replay'), 'Repetição recusada');
  assert.equal(chargeStatusLabel('estornado'), 'Estornada');
  assert.equal(scenarioTypeLabel('expansao'), 'Expansão');
  assert.equal(exportStatusLabel('expirado'), 'Expirado');
  assert.equal(closureStatusLabel('reaberta'), 'Reaberta');
  assert.equal(commissionStatusLabel('provisionada'), 'Provisionada');
  assert.equal(accountStatusLabel(null), '—');
});

test('UX-07 dinheiro: ausência de valor não vira R$ 0,00', () => {
  assert.equal(money(null), 'Dado ausente');
  assert.equal(money(undefined), 'Dado ausente');
  assert.equal(money(0), 'R$ 0,00');
  assert.equal(money(12000), 'R$ 120,00');
  // Espaço comum, não rígido: buscas por "R$ 120,00" precisam encontrar.
  assert.ok(!money(12000).includes('\u00a0'), 'o valor não pode usar espaço rígido');
});
