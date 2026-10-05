// UX-07A — o vocabulário de operação não pode divergir dos servidores.
//
// Este teste lê `src/server/ops-api.mjs`, `ops-advanced-api.mjs`,
// `ops-advanced2-api.mjs`, `ops-advanced3-api.mjs` e `ops-pendency-api.mjs` e
// FALHA se a interface passar a traduzir um código que os servidores não
// devolvem, ou deixar sem frase um código que eles devolvem. É a amarração que
// impede a tradução de virar invenção.
//
// Ele também tranca as regras que esta família não pode perder:
//  - falha de leitura NUNCA vira ausência de dado;
//  - 403 (sem concessão) e 503 (indisponível) são estados diferentes;
//  - o código canônico só aparece no rodapé, entre parênteses.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  allocationStatusLabel,
  allocationStatusTone,
  checklistStatusLabel,
  coverageRequestStatusLabel,
  describeOpsError,
  dimensioningStatusLabel,
  gapStatusLabel,
  handoverStatusLabel,
  occurrenceSeverityLabel,
  occurrenceSeverityTone,
  occurrenceStatusLabel,
  opsErrorFootnote,
  opsErrorVariant,
  postTypeLabel,
  roleTypeLabel,
  scheduleEntryStatusLabel,
  scheduleVersionStatusLabel,
  shiftTypeLabel,
  weekdayLabel,
} from '../src/lib/ops-vocabulary.mjs';

const ARQUIVOS_API = [
  'ops-api.mjs',
  'ops-advanced-api.mjs',
  'ops-advanced2-api.mjs',
  'ops-advanced3-api.mjs',
  'ops-pendency-api.mjs',
];

const fontesApi = await Promise.all(
  ARQUIVOS_API.map(nome => readFile(new URL(`../src/server/${nome}`, import.meta.url), 'utf8')),
);
const vocabulario = await readFile(new URL('../src/lib/ops-vocabulary.mjs', import.meta.url), 'utf8');
const tela = await readFile(new URL('../src/app/admin/operacao/OperacaoWorkspace.tsx', import.meta.url), 'utf8');

/** Todos os códigos que um servidor pode devolver em `{ error: '...' }`. */
function serverErrorCodes(source) {
  const codes = new Set();
  for (const match of source.matchAll(/error:\s*["']([a-z0-9_]+)["']/g)) codes.add(match[1]);
  return codes;
}

const codigosServidor = new Set(fontesApi.flatMap(fonte => [...serverErrorCodes(fonte)]));
const traduzidos = [...vocabulario.matchAll(/^ {2}([a-z0-9_]+): \{/gm)].map(match => match[1]);

test('UX-07A deriva: todo código dos servidores de operação tem frase em português', () => {
  assert.ok(codigosServidor.size > 130,
    `esperava mais de cento e trinta códigos somando os cinco servidores, achei ${codigosServidor.size}`);

  const semTraducao = [...codigosServidor].filter(code => !traduzidos.includes(code));
  assert.deepEqual(semTraducao.sort(), [],
    `códigos dos servidores sem frase em português: ${semTraducao.join(', ')}`);
});

test('UX-07A deriva: nenhuma tradução inventa um código que os servidores não devolvem', () => {
  const inventados = traduzidos.filter(code => !codigosServidor.has(code));
  assert.deepEqual(inventados.sort(), [],
    `traduções para códigos inexistentes nos servidores: ${inventados.join(', ')}`);
});

test('UX-07A honestidade: falha de leitura jamais é descrita como ausência de dado', () => {
  const falhas = [
    'read_unavailable', 'audit_unavailable', 'service_unavailable', 'internal_error',
    'allocation_unavailable', 'employee_unavailable', 'post_shift_need_unavailable',
    'schedule_entry_unavailable', 'schedule_validation_unavailable', 'validation_unavailable',
    'work_rule_unavailable', 'pendency_unavailable',
  ];
  for (const code of falhas) {
    const descriptor = describeOpsError(code, 503);
    assert.equal(descriptor.kind, 'retry', `${code} é falha, não ausência de dado`);
    assert.equal(descriptor.canRetry, true, `${code} precisa oferecer nova tentativa`);
    assert.equal(opsErrorVariant(descriptor), 'error');
    assert.doesNotMatch(descriptor.detail, /\bnenhum registro existe\b|\bé zero\b|\bzero registros\b/i,
      `${code} não pode afirmar ausência de dado`);
  }
  assert.match(describeOpsError('read_unavailable', 503).detail,
    /NÃO significa que não existam postos, escalas ou ocorrências/i);
});

test('UX-07A auditoria fail-closed: indisponibilidade de trilha recusa a ação e diz isso', () => {
  const descriptor = describeOpsError('audit_unavailable', 503);
  assert.equal(descriptor.kind, 'retry');
  assert.match(descriptor.detail, /fail-closed/i);
  assert.match(descriptor.detail, /nada é gravado/i);
});

test('UX-07A permissão: negado e indisponível são estados diferentes', () => {
  const negado = describeOpsError('forbidden', 403);
  const indisponivel = describeOpsError('read_unavailable', 503);
  assert.equal(opsErrorVariant(negado), 'denied');
  assert.equal(opsErrorVariant(indisponivel), 'error');
  assert.equal(negado.canRetry, false, 'uma negativa de concessão não se resolve repetindo');
  assert.notEqual(negado.title, indisponivel.title);
  // Menu não é autorização, e a frase precisa dizer isso.
  assert.match(negado.detail, /O menu pode mostrar o caminho, mas a concessão é verificada no servidor/i);
  // E nunca pode prometer acesso ampliado.
  assert.doesNotMatch(negado.detail, /tente novamente/i);
});

test('UX-07A sessão: 401 é convite a entrar, não recusa de permissão', () => {
  const descriptor = describeOpsError('unauthorized', 401);
  assert.equal(descriptor.kind, 'auth');
  assert.equal(opsErrorVariant(descriptor), 'error');
  assert.equal(descriptor.canRetry, true);
});

test('UX-07A falha de rede: requisição que não chegou não vira dado ausente', () => {
  const descriptor = describeOpsError(null, 0);
  assert.equal(descriptor.kind, 'network');
  assert.equal(descriptor.canRetry, true);
  assert.match(descriptor.detail, /não significa que não existam registros/i);
  assert.equal(opsErrorFootnote(descriptor), 'Resposta do servidor: sem resposta.');
});

test('UX-07A diagnóstico: o código canônico fica no rodapé, entre parênteses', () => {
  const descriptor = describeOpsError('overlap_detected', 409);
  assert.equal(descriptor.title, 'Há sobreposição de turno para esta pessoa');
  assert.doesNotMatch(descriptor.title, /overlap_detected/);
  assert.equal(opsErrorFootnote(descriptor), 'Resposta do servidor: HTTP 409 (overlap_detected).');
  // Nenhum título pode ser o próprio código canônico.
  for (const code of traduzidos) {
    assert.doesNotMatch(describeOpsError(code, 400).title, new RegExp(`\\b${code}\\b`),
      `o título de ${code} não pode exibir o código cru`);
  }
});

test('UX-07A regra de jornada: limite e descanso explicam que nada foi gravado', () => {
  for (const code of [
    'max_daily_hours_exceeded', 'max_weekly_hours_exceeded',
    'max_consecutive_days_exceeded', 'min_rest_hours_violated',
    'qualification_required', 'overlap_detected',
  ]) {
    const descriptor = describeOpsError(code, 409);
    assert.equal(descriptor.kind, 'conflict', `${code} é conflito de regra, não falha de servidor`);
    assert.equal(descriptor.canRetry, false, `${code} não se resolve repetindo o mesmo pedido`);
    assert.match(descriptor.detail, /Nada foi gravado/i, `${code} precisa declarar que nada foi gravado`);
  }
});

test('UX-07A escala: publicação, validade e edição de versão são ditas sem jargão de código', () => {
  assert.match(describeOpsError('version_not_published', 409).detail, /publicada ou revisada/i);
  assert.match(describeOpsError('version_not_editable', 409).detail, /nova versão/i);
  assert.match(describeOpsError('entry_date_out_of_validity', 409).detail, /validade/i);
  assert.equal(describeOpsError('duplicate_ack', 409).kind, 'conflict');
  assert.match(describeOpsError('duplicate_ack', 409).detail, /não duplica efeito/i);
});

test('UX-07A contrato: situação não operacional preserva histórico', () => {
  const descriptor = describeOpsError('contract_not_operational', 409);
  assert.match(descriptor.detail, /encerrado, cancelado ou suspenso/i);
  assert.match(descriptor.detail, /histórico é preservado/i);
});

test('UX-07A rótulos: tradução não altera o valor e o desconhecido passa cru', () => {
  assert.equal(allocationStatusLabel('planejado'), 'Planejada');
  assert.equal(allocationStatusLabel('CONFIRMADO'), 'Confirmada');
  assert.equal(allocationStatusLabel(null), '—');
  assert.equal(allocationStatusLabel('status_novo_do_servidor'), 'status_novo_do_servidor');
  assert.equal(allocationStatusTone('cancelado'), 'danger');
  assert.equal(allocationStatusTone('desconhecido'), 'neutral');

  assert.equal(scheduleVersionStatusLabel('em_revisao'), 'Em revisão');
  assert.equal(scheduleEntryStatusLabel('falta'), 'Falta');
  assert.equal(dimensioningStatusLabel('em_execucao'), 'Em execução');
  assert.equal(gapStatusLabel('em_tratamento'), 'Em tratamento');
  assert.equal(coverageRequestStatusLabel('candidato_encontrado'), 'Candidato encontrado');
  assert.equal(handoverStatusLabel('escalonado'), 'Escalonada');
  assert.equal(occurrenceStatusLabel('retificado'), 'Retificada');
  assert.equal(checklistStatusLabel('nao_aplicavel'), 'Não aplicável');
  assert.equal(occurrenceSeverityLabel('critica'), 'Crítica');
  assert.equal(occurrenceSeverityTone('critica'), 'danger');
  assert.equal(postTypeLabel('zeladoria'), 'Zeladoria');
  assert.equal(roleTypeLabel('funcao'), 'Função');
  assert.equal(shiftTypeLabel('12x36_noite'), '12x36 noturno');
  assert.equal(shiftTypeLabel('turno_novo'), 'turno_novo');
});

test('UX-07A dia da semana: NULL é ausência de restrição, não "todos os dias"', () => {
  assert.equal(weekdayLabel(0), 'Domingo');
  assert.equal(weekdayLabel(6), 'Sábado');
  assert.equal(weekdayLabel(null), 'Sem dia específico');
  assert.doesNotMatch(weekdayLabel(null), /todos os dias/i);
  assert.equal(weekdayLabel(9), '9');
});

test('UX-07A rótulos: todo valor traduzido existe no contrato do servidor', () => {
  const uniao = fontesApi.join('\n');
  const catalogos = [...vocabulario.matchAll(/_LABELS = Object\.freeze\(\{([\s\S]*?)\}\);/g)]
    .flatMap(bloco => [...bloco[1].matchAll(/(?:^|[\s{])'?([a-z0-9_]+)'?\s*:/g)].map(m => m[1]));
  const foraDoContrato = [...new Set(catalogos)].filter(valor => !uniao.includes(`'${valor}'`));
  assert.deepEqual(foraDoContrato.sort(), [],
    `valores traduzidos que o servidor não aceita: ${foraDoContrato.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Amarrações de tela. Estas asserções são estáticas: provam o código, não o
// comportamento em navegador.
// ---------------------------------------------------------------------------

/** Remove comentários para que citar um defeito antigo não falseie a busca. */
function semComentarios(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('UX-07A tela: a operação tem abas de verdade, com painel e teclado', () => {
  assert.match(tela, /role="tablist"/, 'as abas precisam de um tablist');
  assert.match(tela, /role="tab"/, 'cada aba precisa de role=tab');
  assert.match(tela, /role="tabpanel"/, 'o painel precisa existir — era o que faltava');
  assert.match(tela, /aria-controls=\{`ops-painel-\$\{id\}`\}/, 'a aba precisa apontar para o painel');
  assert.match(tela, /tabIndex=\{activeTab === id \? 0 : -1\}/, 'só a aba ativa fica na ordem de tabulação');
  assert.match(tela, /onKeyDown=\{onTabKeyDown\}/, 'as abas precisam responder ao teclado');
  for (const tecla of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
    assert.ok(tela.includes(`"${tecla}"`), `a navegação por teclado precisa tratar ${tecla}`);
  }
});

test('UX-07A tela: os cinco estados são declarados, e falha não vira zero', () => {
  const codigo = semComentarios(tela);
  assert.match(codigo, /variant="loading"/, 'carregando precisa ser visível');
  assert.match(codigo, /variant="empty"/, 'vazio precisa ser dito, e separado de falha');
  assert.match(codigo, /variant=\{opsErrorVariant\(/, 'falha precisa usar a variante calculada (error ou denied)');
  assert.match(codigo, /describeOpsError/, 'as falhas precisam ser descritas pelo vocabulário');
  assert.doesNotMatch(codigo, /err\.message/, 'nenhuma falha pode ser exibida como mensagem crua de exceção');
  assert.doesNotMatch(codigo, /"Falha ao carregar\."/, 'a frase genérica antiga não pode voltar');
});

test('UX-07A tela: o rodapé de falha declara a resposta real do servidor', () => {
  assert.match(tela, /opsErrorFootnote\(/, 'o rodapé com HTTP e código precisa ser exibido');
});

test('UX-07A tela: nenhum painel afirma ausência sem ter lido', () => {
  // Todo estado "empty" precisa dizer que a leitura foi concluída — é essa
  // frase que separa "não há registro" de "não consegui ler".
  const vazios = [...tela.matchAll(/variant="empty"[^>]*?detail="([^"]*)"/g)].map(m => m[1]);
  assert.ok(vazios.length >= 15, `esperava ao menos quinze estados vazios declarados, achei ${vazios.length}`);
  const semLeitura = vazios.filter(detalhe => !/leitura foi concluída/i.test(detalhe));
  assert.deepEqual(semLeitura, [], `estados vazios sem declarar leitura concluída: ${semLeitura.join(' | ')}`);
});
