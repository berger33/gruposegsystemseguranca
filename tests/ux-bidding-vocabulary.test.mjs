// UX-08 / EXT-03 — anti-deriva: lê servidor e dispatch reais.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ERROR_MESSAGES, describeBiddingError, biddingStatusLabel, deadlineKindLabel, deadlineSourceLabel, deadlineSituationLabel, proposalDecisionLabel, honestMoney, honestDate } from '../src/lib/bidding-vocabulary.mjs';
const canonical=await readFile(new URL('../src/server/ext-bidding-api.mjs',import.meta.url),'utf8');
const dispatch=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
const workspace=await readFile(new URL('../src/app/admin/licitacoes/LicitacoesWorkspace.tsx',import.meta.url),'utf8');
const codes=new Set([...canonical.matchAll(/error:\s*["']([a-z0-9_]+)["']/g)].map(m=>m[1]));
test('UX-08: arquivo real e todos os 15 handlers continuam vivos no dispatch',()=>{
  assert.match(dispatch,/createExtBiddingApi/);
  for(const handler of ['handleNotices','handleNoticeById','handleNoticeResponsible','handleNoticeDeadlines','handleDeadlineSupersede','handleNoticeProposals','handleProposalWithdraw','handleNoticeResult','handleNoticeDocuments','handleDocumentDeactivate','handleNoticeChecklist','handleChecklistDeactivate','handleNoticeAlertRules','handleLegacyBiddingNotices','handleLegacyBiddingDocuments']) {
    assert.match(canonical,new RegExp(`\\b${handler}\\b`)); assert.match(dispatch,new RegExp(`extBiddingApi\\.${handler}`));
  }
});
test('UX-08: aliases legados vivos entram no levantamento',()=>{
  for(const alias of ['/api/admin/hr/ext-bidding-notices','/api/crm/hr/ext-bidding-notices','/api/hr/ext-bidding-notices','/api/ext/bidding-notices','/api/admin/hr/ext-bidding-documents','/api/crm/hr/ext-bidding-documents','/api/hr/ext-bidding-documents','/api/ext/bidding-documents']) assert.ok(dispatch.includes(`"${alias}"`));
  assert.ok(codes.has('legacy_mutation_retired'));
});
test('UX-08: os 64 códigos reais têm descrição própria e nenhum é inventado',()=>{
  assert.equal(codes.size,64);
  assert.deepEqual(Object.keys(ERROR_MESSAGES).filter(c=>!codes.has(c)),[]);
  assert.deepEqual([...codes].filter(c=>!ERROR_MESSAGES[c]),[]);
  for(const code of codes){const d=describeBiddingError(code,400);assert.equal(d.code,code);assert.notEqual(d.title,code);assert.ok(d.detail.length>35);}
});
test('UX-08: desconhecido e negativa permanecem honestos',()=>{
  const u=describeBiddingError('novo_codigo',422); assert.equal(u.code,'novo_codigo'); assert.match(u.detail,/novo_codigo/);
  assert.equal(describeBiddingError('forbidden_role',403).kind,'denied'); assert.equal(describeBiddingError('unauthorized',401).kind,'denied');
  assert.match(describeBiddingError(null,0).detail,/não representa uma lista vazia/);
});
test('UX-08: constantes e derivações reais saem traduzidas',()=>{
  for(const x of ['rascunho','publicado','em_analise','homologado','vencido','cancelado','deserto']) assert.notEqual(biddingStatusLabel(x),x);
  for(const x of ['publicacao','esclarecimento','impugnacao','entrega_proposta','sessao_abertura','recurso','assinatura']) assert.notEqual(deadlineKindLabel(x),x);
  for(const x of ['edital_publicado','retificacao_publicada','registro_interno']) assert.notEqual(deadlineSourceLabel(x),x);
  for(const x of ['vigente','a_vencer','substituido','sem_data_declarada','prazo_inexistente']) assert.notEqual(deadlineSituationLabel(x),x);
  for(const x of ['prazo_vigente','prazo_encerrado','sem_prazo_registrado','edital_encerrado','edital_inexistente']) assert.notEqual(proposalDecisionLabel(x),x);
  assert.equal(honestMoney(null),'Não informado'); assert.equal(honestMoney(0),'R$ 0,00'); assert.equal(honestDate(null),'Não informada');
});
test('UX-08: workspace só consome rotas canônicas e preserva prefixos do protótipo',()=>{
  assert.doesNotMatch(workspace,/\/api\/(?:admin\/hr|crm\/hr|hr)\/ext-bidding/);
  for(const prefix of ['ext03-edt','ext03-sta','ext03-rsp','ext03-prz','ext03-sub','ext03-prp','ext03-ret','ext03-doc','ext03-chk','ext03-alr','ext03-res']) assert.ok(workspace.includes(prefix));
  assert.match(workspace,/Idempotency-Key/); assert.match(workspace,/biddingRequest/);
});
