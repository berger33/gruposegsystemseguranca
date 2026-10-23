import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as hrVocabulary from '../src/lib/hr-vocabulary.mjs';
import { employeeItemStatusLabel, employeeItemStatusTone } from '../src/lib/portal-vocabulary.mjs';

const rhWorkspaceSource = await readFile(
  new URL('../src/app/admin/funcionarios/RhWorkspace.tsx', import.meta.url),
  'utf8',
);
const componentSource = await readFile(
  new URL('../src/app/admin/funcionarios/TimeCorrectionReviews.tsx', import.meta.url),
  'utf8',
);
const migration061 = await readFile(
  new URL('../db/migrations/061-hr10-11-12-afastamentos-ponto-banco-horas.sql', import.meta.url),
  'utf8',
);
const migration065 = await readFile(
  new URL('../db/migrations/065-emp02-03-04-05-plantao-escala-jornada-ausencia.sql', import.meta.url),
  'utf8',
);
const migration176 = await readFile(
  new URL('../db/migrations/176-employee-geolocation-time-clock.sql', import.meta.url),
  'utf8',
);

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function sqlEnumValues(source, enumName) {
  const match = source.match(new RegExp(`CREATE TYPE ${enumName} AS ENUM \\(([^)]+)\\)`));
  assert.ok(match, `enum ${enumName} precisa existir na migração`);
  return match[1]
    .split(',')
    .map(item => item.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)
    .sort();
}

test('UX-PRO-05 ponto RH: montagem e contratos de API permanecem preservados', () => {
  assert.match(rhWorkspaceSource, /tab === 'ponto' \? <TimeCorrectionReviews employees=\{employees\} \/> : null/);
  assert.match(componentSource, /\/api\/admin\/hr\/l03\/time-corrections/);
  assert.match(componentSource, /\/api\/admin\/hr\/l03\/time-clock\?employee_id=/);
  assert.match(componentSource, /\/api\/admin\/hr\/l03\/time-punches\?employee_id=/);
  assert.match(componentSource, /method:\s*['"]PATCH['"]/);
  for (const field of ['id', 'status', 'rejection_reason', 'approved_changes', 'clock_in', 'clock_out', 'hours_worked']) {
    assert.match(componentSource, new RegExp(`\\b${field}\\b`), `campo canônico preservado: ${field}`);
  }
  for (const hereCopy of [
    'Endereço via HERE:',
    'Consulta de endereço não configurada.',
    'Coordenadas não foram enviadas ao HERE para esta marcação.',
    'O endereço não foi localizado nesta consulta.',
  ]) {
    assert.ok(componentSource.includes(hereCopy), `mensagem de transparência HERE preservada: ${hereCopy}`);
  }
});

test('UX-PRO-05 ponto RH: falha de leitura preserva a fila carregada e usa UiState honesto sem estilos inline', () => {
  const code = stripComments(componentSource);
  assert.doesNotMatch(
    code,
    /setItems\(\s*\[\s*\]\s*\)/,
    'falha ao reler pedidos não pode apagar a última lista conhecida nem fingir fila vazia',
  );
  assert.match(code, /UiState/, 'estados de leitura e erro devem usar UiState compartilhado');
  assert.match(code, /hrErrorVariant/, 'erros de leitura do RH devem distinguir acesso negado de falha transitória');
  assert.doesNotMatch(code, /\bstyle=\{\{/, 'TimeCorrectionReviews não deve usar estilos inline');
});

test('UX-PRO-05 ponto RH: todo controle de formulário possui id e label htmlFor associados', () => {
  const code = stripComments(componentSource);
  const controlTags = [...code.matchAll(/<(input|select|textarea)\b[\s\S]*?>/g)].map(match => match[0]);
  assert.ok(controlTags.length >= 6, `esperava ao menos 6 controles, encontrou ${controlTags.length}`);
  for (const tag of controlTags) {
    assert.match(tag, /\bid=/, `controle sem atributo id explícito: ${tag.slice(0, 100)}`);
  }
  const labelTags = [...code.matchAll(/<label\b[^>]*>/g)].map(match => match[0]);
  assert.equal(
    labelTags.length,
    controlTags.length,
    `cada controle precisa de um <label htmlFor> dedicado (${labelTags.length} labels para ${controlTags.length} controles)`,
  );
  for (const labelTag of labelTags) {
    assert.match(labelTag, /\bhtmlFor=/, `label sem htmlFor explícito: ${labelTag}`);
  }
});

test('UX-PRO-05 ponto RH: vocabulários de ponto no RH e no portal espelham os enums canônicos sem expor tokens crus', () => {
  assert.ok(Array.isArray(hrVocabulary.TIME_PUNCH_KINDS), 'TIME_PUNCH_KINDS deve ser exportado por hr-vocabulary.mjs');
  assert.ok(Array.isArray(hrVocabulary.TIME_ENTRY_STATUS), 'TIME_ENTRY_STATUS deve ser exportado por hr-vocabulary.mjs');
  assert.ok(Array.isArray(hrVocabulary.TIME_CORRECTION_STATUS), 'TIME_CORRECTION_STATUS deve ser exportado por hr-vocabulary.mjs');

  const punchMatch = migration176.match(/kind IN \(([^)]+)\)/);
  assert.ok(punchMatch, 'check constraint de emp_time_punches.kind precisa existir na migração 176');
  const expectedPunchKinds = punchMatch[1]
    .split(',')
    .map(item => item.trim().replace(/^'|'$/g, ''))
    .sort();

  assert.deepEqual(
    hrVocabulary.TIME_PUNCH_KINDS.map(item => item.value).sort(),
    expectedPunchKinds,
  );
  assert.deepEqual(
    hrVocabulary.TIME_ENTRY_STATUS.map(item => item.value).sort(),
    sqlEnumValues(migration061, 'hr_time_entry_status'),
  );
  assert.deepEqual(
    hrVocabulary.TIME_CORRECTION_STATUS.map(item => item.value).sort(),
    sqlEnumValues(migration065, 'emp_journey_correction_status'),
  );

  assert.equal(hrVocabulary.timePunchKindLabel('saida_intervalo'), 'Início do intervalo');
  assert.equal(hrVocabulary.timePunchKindLabel('retorno_intervalo'), 'Fim do intervalo');
  assert.equal(hrVocabulary.timeEntryStatusLabel('corrigido'), 'Corrigido');
  assert.equal(hrVocabulary.timeEntryStatusLabel('divergente'), 'Divergente');
  assert.equal(hrVocabulary.timeCorrectionStatusLabel('solicitado'), 'Aguardando análise');
  assert.equal(hrVocabulary.timeCorrectionStatusLabel('em_analise'), 'Em análise');

  // Portal do funcionário também traduz o registro de jornada após ajuste aprovado pelo RH.
  assert.equal(employeeItemStatusLabel('corrigido'), 'Corrigido');
  assert.equal(employeeItemStatusLabel('em_correcao'), 'Em correção');
  assert.equal(employeeItemStatusLabel('divergente'), 'Divergente');
  assert.equal(employeeItemStatusLabel('solicitado'), 'Aguardando análise');
  assert.equal(employeeItemStatusTone('corrigido'), 'success');
  assert.equal(employeeItemStatusTone('divergente'), 'danger');
});
