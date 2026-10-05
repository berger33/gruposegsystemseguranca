// UX-04 — o vocabulário de RH não pode divergir do servidor.
//
// Este teste lê os conjuntos canônicos DIRETO dos arquivos de API e falha se a
// interface oferecer um valor que o servidor recusa, ou deixar de oferecer um
// que ele aceita. É a amarração que impede a tradução de virar invenção.
//
// Ele também trava as regras de honestidade que a UX-04 introduziu: falha de
// leitura nunca pode ser classificada como "vazio", e a negativa de concessão
// precisa explicar que aparecer no menu não é autorização.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ADMISSION_STATUS,
  COMPENSATION_DOCUMENT_KINDS,
  DOCUMENT_KINDS,
  DOCUMENT_STATUS,
  EMPLOYEE_STATUS,
  SELF_REQUEST_STATUS,
  SELF_REQUEST_TYPES,
  TERMINATION_TYPES,
  describeHrError,
  documentKindLabel,
  documentStatusLabel,
  employeeStatusLabel,
  hrErrorVariant,
  isTerminable,
  selfRequestStatusLabel,
  selfRequestTypeLabel,
  terminationTypeLabel,
} from '../src/lib/hr-vocabulary.mjs';

const employeeApi = await readFile(new URL('../src/server/employee-api.mjs', import.meta.url), 'utf8');
const hrApi = await readFile(new URL('../src/server/hr-api.mjs', import.meta.url), 'utf8');
const terminationApi = await readFile(new URL('../src/server/hr-termination-api.mjs', import.meta.url), 'utf8');

/** Extrai `const NAME=['a','b']` de um fonte de API. */
function canonicalArray(source, name, label) {
  const match = source.match(new RegExp(`const ${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  assert.ok(match, `${name} precisa continuar declarado em ${label}`);
  return match[1]
    .split(',')
    .map(item => item.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
    .sort();
}

/** Extrai `const NAME = new Set([...])` de um fonte de API. */
function canonicalSet(source, name, label) {
  const match = source.match(new RegExp(`const ${name}\\s*=\\s*new Set\\(\\[([^\\]]*)\\]\\)`));
  assert.ok(match, `${name} precisa continuar declarado em ${label}`);
  return match[1]
    .split(',')
    .map(item => item.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
    .sort();
}

test('a situação do cadastro na tela é exatamente a que hr-api.mjs aceita', () => {
  assert.deepEqual(
    EMPLOYEE_STATUS.map(option => option.value).sort(),
    canonicalArray(hrApi, 'EMP_STATUS', 'src/server/hr-api.mjs'),
  );
});

test('a situação da admissão na tela é exatamente a que hr-api.mjs aceita', () => {
  assert.deepEqual(
    ADMISSION_STATUS.map(option => option.value).sort(),
    canonicalArray(hrApi, 'ADMISSION_STATUS', 'src/server/hr-api.mjs'),
  );
});

test('os tipos de desligamento na tela são exatamente os que hr-termination-api.mjs aceita', () => {
  assert.deepEqual(
    TERMINATION_TYPES.map(option => option.value).sort(),
    canonicalArray(terminationApi, 'TERMINATION_TYPE', 'src/server/hr-termination-api.mjs'),
  );
});

test('os tipos de solicitação na tela são exatamente os que employee-api.mjs aceita', () => {
  assert.deepEqual(
    SELF_REQUEST_TYPES.map(option => option.value).sort(),
    canonicalSet(employeeApi, 'SELF_REQUEST_TYPES', 'src/server/employee-api.mjs'),
  );
});

test('as situações de solicitação cobrem o conjunto validado pelo handler de self-requests', () => {
  const match = employeeApi.match(/const validStatuses = new Set\(\[([^\]]*)\]\)/);
  assert.ok(match, 'o handler de self-requests precisa continuar validando as situações');
  const canonical = match[1]
    .split(',')
    .map(item => item.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
    .sort();
  assert.deepEqual(SELF_REQUEST_STATUS.map(option => option.value).sort(), canonical);
});

test('as situações de documento são exatamente as aceitas no PATCH de documentos privados', () => {
  const match = employeeApi.match(/if \(!\[([^\]]*)\]\.includes\(status\)\)/);
  assert.ok(match, 'o PATCH de documentos precisa continuar validando a situação');
  const canonical = match[1]
    .split(',')
    .map(item => item.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
    .sort();
  assert.deepEqual(DOCUMENT_STATUS.map(option => option.value).sort(), canonical);
});

test('as naturezas de documento são exatamente as aceitas em storeDocument', () => {
  const match = employeeApi.match(/const documentKind = \[([^\]]*)\]\.includes\(data\?\.documentKind\)/);
  assert.ok(match, 'a lista de documentKind precisa continuar declarada em employee-api.mjs');
  const canonical = match[1]
    .split(',')
    .map(item => item.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
    .sort();
  assert.deepEqual(DOCUMENT_KINDS.map(option => option.value).sort(), canonical);
});

test('as naturezas que exigem concessão de remuneração continuam sendo as do servidor', () => {
  // O servidor exige employees.compensation.* exatamente para estas duas.
  assert.ok(employeeApi.includes("['payroll','income_report'].includes(data.documentKind)"));
  assert.ok(employeeApi.includes("['payroll','income_report'].includes(current[0].document_kind)"));
  assert.deepEqual([...COMPENSATION_DOCUMENT_KINDS].sort(), ['income_report', 'payroll']);
});

test('os rótulos são traduzidos, distintos e nunca repetem o token cru', () => {
  const lists = [
    EMPLOYEE_STATUS, ADMISSION_STATUS, SELF_REQUEST_TYPES,
    SELF_REQUEST_STATUS, DOCUMENT_STATUS, DOCUMENT_KINDS, TERMINATION_TYPES,
  ];
  for (const list of lists) {
    const labels = list.map(option => option.label);
    assert.equal(new Set(labels).size, labels.length, 'os rótulos precisam ser distintos entre si');
    for (const option of list) {
      assert.ok(option.label.trim().length > 1);
      assert.notEqual(option.label, option.value, 'o rótulo precisa ser traduzido, não o token cru');
    }
  }
  assert.equal(employeeStatusLabel('em_admissao'), 'Em admissão');
  assert.equal(selfRequestStatusLabel('solicitado'), 'Aguardando análise');
  assert.equal(selfRequestTypeLabel('ferias'), 'Férias');
  assert.equal(documentStatusLabel('published'), 'Publicado ao titular');
  assert.equal(documentKindLabel('income_report'), 'Informe de rendimentos');
  assert.equal(terminationTypeLabel('dispensa_sem_justa'), 'Dispensa sem justa causa');
});

test('um valor desconhecido continua visível, em vez de virar um rótulo inventado', () => {
  assert.equal(employeeStatusLabel('estado_que_o_servidor_passou_a_emitir'), 'estado_que_o_servidor_passou_a_emitir');
  assert.equal(documentStatusLabel(null), '—');
});

test('só quem não está desligado é oferecido para desligamento', () => {
  assert.equal(isTerminable('ativo'), true);
  assert.equal(isTerminable('em_admissao'), true);
  assert.equal(isTerminable('desligado'), false);
});

test('403 de concessão explica que menu não é autorização e não oferece repetir', () => {
  const denied = describeHrError('permission_scope_denied', 403);
  assert.equal(denied.kind, 'denied');
  assert.equal(denied.canRetry, false, 'repetir a mesma chamada negada não ajuda ninguém');
  assert.match(denied.detail, /menu não concede acesso/i);
  assert.equal(hrErrorVariant(denied), 'denied');
});

test('remuneração negada aponta a concessão específica, sem expor dado', () => {
  const denied = describeHrError('compensation_permission_required', 403);
  assert.equal(denied.kind, 'denied');
  assert.match(denied.detail, /employees\.compensation/);
  assert.match(denied.detail, /Nada foi exibido nem gravado/);
});

test('falha de leitura jamais é classificada como vazio e oferece repetir', () => {
  for (const [code, status] of [[null, 500], [null, 503], [null, 0]]) {
    const failure = describeHrError(code, status);
    assert.notEqual(failure.kind, 'empty');
    assert.equal(failure.canRetry, true, `status ${status} deveria permitir nova tentativa`);
    assert.equal(hrErrorVariant(failure), 'error');
  }
  // A mensagem precisa dizer, em texto, que falha não é ausência de registros.
  assert.match(describeHrError(null, 500).detail, /não é a mesma coisa que não haver registros/i);
  assert.match(describeHrError(null, 0).detail, /não significa que não existam registros/i);
});

test('sessão expirada é tratada como autenticação, não como permissão', () => {
  const auth = describeHrError('admin_session_required', 401);
  assert.equal(auth.kind, 'auth');
  assert.equal(auth.canRetry, true);
});
