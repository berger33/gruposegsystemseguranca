// UX-07 (fatia C — Contratos) — o vocabulário das telas contratuais não pode
// divergir dos onze servidores que elas consomem.
//
// Este teste lê os arquivos de servidor reais e falha se a interface passar a
// traduzir um código que os servidores não devolvem mais, ou deixar sem
// tradução um código que eles devolvem.
//
// Dois cuidados no levantamento, ambos declarados e não adivinhados:
//
//  1. a maioria dos códigos NÃO aparece como `{ error: '...' }` literal: cada
//     servidor define os helpers locais `bad(res, msg)` e `unavailable(res,
//     msg)`. Ignorá-los escondia 158 dos 305 códigos desta família — e 23 na
//     fatia B (Financeiro), corrigida no mesmo commit;
//  2. `key.includes('...')` e
//     `x === '...'` aparecem DENTRO da expressão que monta o código — o
//     literal testado na condição é nome de constraint do banco, não código
//     devolvido ao cliente. Esses operandos são removidos antes da extração.
//
// Os servidores de contrato não montam código por template literal (conferido
// com `grep "error: \`"`), então não há lista suplementar aqui.
//
// Os onze arquivos são lidos de propósito, embora hoje só `contract-l05-api`
// esteja religado em server.mjs (~3022) para `/api/crm/contracts*`: os demais
// seguem no repositório por compatibilidade histórica, e manter a tradução
// deles impede que uma rota religada volte a mostrar código cru.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  describeContractError,
  contractErrorFootnote,
  contractErrorMessage,
  contractErrorVariant,
  alertStatusLabel,
  alertTypeLabel,
  amendmentStatusLabel,
  blockTypeLabel,
  brl,
  closureStatusLabel,
  closureStepLabel,
  closureStepStatusLabel,
  contractOriginLabel,
  contractStatusLabel,
  contractStatusTone,
  diaryCategoryLabel,
  diaryVisibilityLabel,
  dossierStatusLabel,
  exceptionStatusLabel,
  implantationStepLabel,
  measurementStatusLabel,
  obligationCategoryLabel,
  obligationPeriodicityLabel,
  obligationStatusLabel,
  postShiftLabel,
  shortDate,
  slaServiceLabel,
  stepStatusLabel,
  stepStatusTone,
} from '../src/lib/contract-vocabulary.mjs';

const FILES = [
  'contract-api', 'contract-details-api', 'contract-status-api', 'contract-amendment-api',
  'contract-alert-api', 'contract-doc-obligation-api', 'contract-implantation-api',
  'contract-closure-api', 'contract-fiscal-api', 'contract-management-diary-api', 'contract-l05-api',
];

const sources = await Promise.all(
  FILES.map(file => readFile(new URL(`../src/server/${file}.mjs`, import.meta.url), 'utf8')),
);

function serverErrorCodes(source) {
  const codes = new Set();
  const cleaned = source
    .replace(/\.includes\(\s*[`'"][^`'"]*[`'"]\s*\)/g, '')
    .replace(/[=!]==?\s*[`'"][^`'"]*[`'"]/g, '');
  for (const match of cleaned.matchAll(/error:\s*([^,}\n]{1,200})/g)) {
    for (const literal of match[1].matchAll(/[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(literal[1]);
  }
  for (const match of cleaned.matchAll(/new (?:HttpError|E)\(\s*\d+\s*,\s*[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(match[1]);
  // Wrappers locais de cada servidor, responsáveis pela maioria dos códigos:
  //   const bad = (res, msg) => json(res, 400, { error: msg });
  //   const unavailable = (res, msg) => json(res, 503, { error: msg });
  for (const match of cleaned.matchAll(/\b(?:bad|unavailable)\(\s*res\s*,\s*[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(match[1]);
  return codes;
}

const codigosServidor = new Set();
for (const source of sources) for (const code of serverErrorCodes(source)) codigosServidor.add(code);

test('UX-07 contratos: o levantamento encontra mais de 300 códigos distintos nos onze servidores', () => {
  assert.ok(codigosServidor.size > 300, `esperava mais de 300 códigos, achei ${codigosServidor.size}`);
});

test('UX-07 vocabulário: todo código dos servidores de contrato tem frase em português', () => {
  const semTraducao = [];
  for (const code of codigosServidor) {
    const descriptor = describeContractError(code, 500);
    // Sem tradução dedicada o fallback de 5xx devolve este título genérico.
    if (descriptor.title === 'Falha no servidor') semTraducao.push(code);
  }
  assert.deepEqual(semTraducao.sort(), [],
    `códigos dos servidores de contrato sem frase em português: ${semTraducao.join(', ')}`);
});

test('UX-07 vocabulário: nenhuma tradução inventa um código que os servidores não devolvem', async () => {
  const vocabulario = await readFile(new URL('../src/lib/contract-vocabulary.mjs', import.meta.url), 'utf8');
  const bloco = vocabulario.match(/const ERROR_MESSAGES = Object\.freeze\(\{([\s\S]*?)\n\}\);/)[1];
  const traduzidos = [...bloco.matchAll(/^\s{2}([a-z0-9_]+):\s*\{/gm)].map(match => match[1]);
  assert.ok(traduzidos.length > 300, 'o vocabulário deveria cobrir mais de 300 códigos');

  const inventados = traduzidos.filter(code => !codigosServidor.has(code));
  assert.deepEqual(inventados.sort(), [],
    `traduções para códigos inexistentes nos servidores de contrato: ${inventados.join(', ')}`);

  const duplicados = traduzidos.filter((code, indice) => traduzidos.indexOf(code) !== indice);
  assert.deepEqual(duplicados, [], `códigos repetidos no vocabulário: ${duplicados.join(', ')}`);
});

test('UX-07 honestidade: toda falha classificada traz código, status e indicação de nova tentativa', () => {
  for (const code of codigosServidor) {
    const descriptor = describeContractError(code, 503);
    assert.equal(descriptor.code, code);
    assert.equal(descriptor.status, 503);
    assert.equal(typeof descriptor.canRetry, 'boolean');
    assert.ok(descriptor.title.length > 0, `código ${code} não tem título`);
    assert.ok(descriptor.detail.length > 0, `código ${code} não tem detalhe`);
    assert.notEqual(descriptor.title, code);
    assert.ok(!/^[a-z0-9_]+$/.test(descriptor.title), `o título de ${code} ainda parece um código cru`);
  }
});

test('UX-07 honestidade: falha de leitura nunca é apresentada como ausência de registro', () => {
  const leituras = [...codigosServidor].filter(code => code.endsWith('_unavailable'));
  assert.ok(leituras.length >= 25, `esperava muitos códigos de leitura, achei ${leituras.length}`);
  for (const code of leituras) {
    const descriptor = describeContractError(code, 503);
    const texto = `${descriptor.title} ${descriptor.detail}`.toLowerCase();
    for (const ausencia of ['nenhum registro', 'não há registro', 'sem registro']) {
      assert.ok(!texto.includes(ausencia), `${code} não pode soar como ausência de dado: "${texto}"`);
    }
    // Mencionar "vazia"/"vazio" só é aceitável para NEGAR a leitura vazia.
    if (/vazi/.test(texto)) {
      assert.match(texto, /isto não significa/, `${code} menciona vazio sem negar explicitamente: "${texto}"`);
    }
    assert.equal(descriptor.canRetry, true, `${code} deveria permitir nova tentativa`);
  }
});

test('UX-07 honestidade: regra contratual explica a regra, nunca um código cru', () => {
  for (const code of [
    'unresolved_implantation_block', 'implantation_checklist_incomplete',
    'signature_required_before_activation', 'legal_requirement_not_waivable',
    'legal_requirement_cannot_be_bypassed_with_simple_checkbox',
    'legal_requirement_block_cannot_be_resolved_without_exception',
    'proposal_version_not_preserved', 'accepted_current_proposal_version_required',
    'version_not_preserved_cannot_create_contract', 'closure_steps_incomplete',
    'invalid_transition', 'contract_already_encerrado', 'exception_not_authorizable',
    'secret_or_medical_record_not_allowed_in_free_notes',
  ]) {
    const descriptor = describeContractError(code, 409);
    assert.ok(['conflict', 'denied', 'invalid'].includes(descriptor.kind),
      `${code} deveria ser recusa de regra, veio ${descriptor.kind}`);
    assert.equal(descriptor.canRetry, false, `${code} não é resolvido só tentando de novo`);
  }
});

test('UX-07 escopo: negativa de carteira e de gestão são recusas, não falhas transitórias', () => {
  for (const code of ['contract_access_forbidden', 'contract_management_forbidden', 'restricted_access']) {
    const descriptor = describeContractError(code, 403);
    assert.equal(descriptor.kind, 'denied');
    assert.equal(contractErrorVariant(descriptor), 'denied');
    assert.equal(descriptor.canRetry, false);
  }
});

test('UX-07 rodapé: o código canônico só aparece entre parênteses, nunca como frase principal', () => {
  const descriptor = describeContractError('unresolved_implantation_block', 409);
  assert.match(contractErrorFootnote(descriptor), /\(unresolved_implantation_block\)/);
  assert.equal(contractErrorVariant(descriptor), 'error');
  const mensagem = contractErrorMessage('contracts_unavailable', 503);
  assert.match(mensagem, /contratos/i);
  assert.match(mensagem, /\(contracts_unavailable\)/);
});

test('UX-07 honestidade: código desconhecido passa cru, nunca é inventado', () => {
  const desconhecido = describeContractError('um_codigo_que_o_servidor_nao_tem', 500);
  assert.equal(desconhecido.code, 'um_codigo_que_o_servidor_nao_tem');
  assert.equal(desconhecido.title, 'Falha no servidor');
  const semResposta = describeContractError(null, 0);
  assert.equal(semResposta.kind, 'network');
  assert.equal(semResposta.canRetry, true);
});

test('UX-07 vocabulário de situação: valor desconhecido passa cru, nunca é inventado', () => {
  assert.equal(contractStatusLabel('ativo'), 'Ativo');
  assert.equal(contractStatusTone('ativo'), 'success');
  assert.equal(contractStatusLabel('uma_situacao_nova_do_banco'), 'uma_situacao_nova_do_banco');
  assert.equal(contractStatusTone('uma_situacao_nova_do_banco'), 'neutral');
  assert.equal(contractOriginLabel('crm_proposal_acceptance'), 'Proposta aceita no CRM');
  assert.equal(implantationStepLabel('convite_cliente'), 'Convite do cliente ao portal');
  assert.equal(stepStatusLabel('nao_aplicavel'), 'Não se aplica');
  assert.equal(stepStatusTone('bloqueado'), 'danger');
  assert.equal(blockTypeLabel('legal'), 'Exigência legal');
  assert.equal(exceptionStatusLabel('autorizada'), 'Autorizada');
  assert.equal(amendmentStatusLabel('em_revisao'), 'Em revisão');
  assert.equal(alertTypeLabel('vigencia_fim'), 'Fim de vigência');
  assert.equal(alertStatusLabel('enviado'), 'Na caixa de saída local');
  assert.equal(obligationCategoryLabel('certidao'), 'Certidão');
  assert.equal(obligationPeriodicityLabel('sob_demanda'), 'Sob demanda');
  assert.equal(obligationStatusLabel('vencido'), 'Vencida');
  assert.equal(closureStatusLabel('em_andamento'), 'Em andamento');
  assert.equal(closureStepLabel('revogacao_escopos'), 'Revogação de escopos de acesso');
  assert.equal(closureStepStatusLabel('nao_aplicavel'), 'Não se aplica');
  assert.equal(dossierStatusLabel('em_analise'), 'Em análise');
  assert.equal(measurementStatusLabel('em_ajuste'), 'Em ajuste');
  assert.equal(diaryCategoryLabel('juridico'), 'Jurídico');
  assert.equal(diaryVisibilityLabel('equipe_gestao'), 'Equipe de gestão');
  assert.equal(postShiftLabel('12x36_noite'), '12x36 noturno');
  assert.equal(slaServiceLabel('monitoramento'), 'Monitoramento');
  assert.equal(contractStatusLabel(null), '—');
});

test('UX-07 alerta: o canal nunca promete entrega que não houve', () => {
  assert.match(alertStatusLabel('enviado'), /caixa de saída local/i);
  assert.doesNotMatch(alertStatusLabel('enviado'), /entregue/i);
});

test('UX-07 ausência: data e valor ausentes não viram data inventada nem R$ 0,00', () => {
  assert.equal(shortDate('2036-02-10'), '10/02/2036');
  assert.equal(shortDate('2036-02-10T12:00:00.000Z'), '10/02/2036');
  assert.equal(shortDate(null), 'Não definida');
  assert.equal(shortDate(null, 'em aberto'), 'em aberto');
  assert.equal(brl(null), 'Dado ausente');
  assert.equal(brl(0), 'R$ 0,00');
  assert.equal(brl('1500.5'), 'R$ 1.500,50');
  assert.ok(!brl(1200).includes('\u00a0'), 'o valor não pode usar espaço rígido');
});
