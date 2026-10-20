// UX-PRO-E3-CRM — conversão bidirecional de `<input type="datetime-local">` em `/admin/crm`.
//
// Trava ADITIVA do auxiliar `src/lib/crm-dates.mjs` e do campo
// `next_action_date` em `OpportunitySummary.tsx:82`.
// Decisão do proprietário em 20/10/2026 (via (a)): fuso local
// `America/Sao_Paulo` DECLARADO no valor do input + rótulo visível.
// O teste prova:
//
//  1. LEITURA: `2026-10-05T14:32:00Z` (UTC) → `2026-10-05T11:32` (São Paulo)
//     `2026-10-05T17:32:00Z` (UTC) → `2026-10-05T14:32` (São Paulo)
//     Duas marcas distintas do mesmo dia NÃO colidem.
//  2. A conversão atravessa a virada do dia (não é deslocamento de string).
//  3. ESCRITA: `2026-10-05T11:32` (input, assumido São Paulo) → `2026-10-05T14:32:00.000Z` (UTC)
//     `2026-10-05T14:32` (input) → `2026-10-05T17:32:00.000Z` (UTC)
//  4. Ausente é declarado, formato inesperado retorna null/vazio, data de
//     calendário (`DATE`) NÃO é convertida por este auxiliar.
//  5. O mesmo resultado vale em qualquer fuso de máquina (processo filho com `TZ`).
//  6. Rótulo de fuso visível `(America/Sao_Paulo)` exportado.
//  7. Varredura: `OpportunitySummary.tsx` usa os auxiliares e não tem mais
//     `toISOString().slice(0, 16)` nem `new Date(...).toISOString()` direto no campo.
//
// NOTA: imports dinâmicos dentro dos testes evitam cache do test runner.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const modulo = path.join(root, 'src', 'lib', 'crm-dates.mjs');
const crm = path.join(root, 'src', 'app', 'admin', 'crm', 'OpportunitySummary.tsx');

async function loadMod() {
  return import('../src/lib/crm-dates.mjs');
}

test('UX-PRO-E3-CRM crmDateTimeForInput: São Paulo com fuso declarado, duas marcas do mesmo dia sem colisão', async () => {
  const { CRM_TIME_ZONE, CRM_TIMEZONE_LABEL, crmDateTimeForInput } = await loadMod();
  assert.equal(CRM_TIME_ZONE, 'America/Sao_Paulo');
  assert.equal(CRM_TIMEZONE_LABEL, '(America/Sao_Paulo)');

  // 14:32Z = 11:32 em São Paulo (UTC-3)
  assert.equal(crmDateTimeForInput('2026-10-05T14:32:00Z'), '2026-10-05T11:32');
  // 17:32Z = 14:32 em São Paulo (UTC-3)
  assert.equal(crmDateTimeForInput('2026-10-05T17:32:00Z'), '2026-10-05T14:32');

  // As duas marcas distintas do MESMO dia precisam permanecer distintas.
  assert.notEqual(
    crmDateTimeForInput('2026-10-05T14:32:00Z'),
    crmDateTimeForInput('2026-10-05T17:32:00Z'),
    '14:32Z e 17:32Z não podem colidir no mesmo dia em São Paulo',
  );

  // Formato exato para datetime-local: YYYY-MM-DDTHH:MM
  assert.match(crmDateTimeForInput('2026-10-15T13:29:16.123Z'), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(crmDateTimeForInput('2026-10-15T13:29:16.123Z'), '2026-10-15T10:29');

  // Hora 00 com hourCycle h23: não pode virar 24 nem 12 AM.
  // 02:05Z de 01/01 = 23:05 de 31/12 em São Paulo (UTC-3, sem horário de verão em jan)
  assert.equal(crmDateTimeForInput('2026-01-01T02:05:00Z'), '2025-12-31T23:05');

  // O texto exibido nunca é o ISO fatiado que a fatia corrigiu.
  assert.notEqual(crmDateTimeForInput('2026-10-05T14:32:00Z'), '2026-10-05T14:32');
});

test('UX-PRO-E3-CRM crmDateTimeForInput: a conversão atravessa a virada do dia (não é deslocamento de texto)', async () => {
  const { crmDateTimeForInput } = await loadMod();
  // 01:30Z do dia 6 = 22:30 do dia 5 em São Paulo (UTC-3)
  assert.equal(crmDateTimeForInput('2026-10-06T01:30:00Z'), '2026-10-05T22:30');
  // 02:30Z do dia 5 = 23:30 do dia 4 em São Paulo (UTC-3)
  assert.equal(crmDateTimeForInput('2026-10-05T02:30:00Z'), '2026-10-04T23:30');
});

test('UX-PRO-E3-CRM crmDateTimeFromInput: escrita input (São Paulo) → UTC para API', async () => {
  const { crmDateTimeForInput, crmDateTimeFromInput } = await loadMod();
  // Input 11:32 em São Paulo = 14:32Z
  assert.equal(crmDateTimeFromInput('2026-10-05T11:32'), '2026-10-05T14:32:00.000Z');
  // Input 14:32 em São Paulo = 17:32Z
  assert.equal(crmDateTimeFromInput('2026-10-05T14:32'), '2026-10-05T17:32:00.000Z');

  // Round-trip: UTC → input → UTC preserva o instante original.
  const utc1 = '2026-10-05T14:32:00Z';
  const input1 = crmDateTimeForInput(utc1);
  const back1 = crmDateTimeFromInput(input1);
  assert.equal(back1, '2026-10-05T14:32:00.000Z', `round-trip ${utc1} → ${input1} → ${back1}`);

  const utc2 = '2026-10-05T17:32:00Z';
  const input2 = crmDateTimeForInput(utc2);
  const back2 = crmDateTimeFromInput(input2);
  assert.equal(back2, '2026-10-05T17:32:00.000Z', `round-trip ${utc2} → ${input2} → ${back2}`);
});

test('UX-PRO-E3-CRM crmDateTimeForInput/FromInput: ausência declarada, formato inesperado, DATE não convertido', () => {
  const script = `
    import { crmDateTimeForInput, crmDateTimeFromInput } from ${JSON.stringify(pathToFileURL(modulo).href)};
    const resultados = {
      // Ausência
      absentForInput: [null, undefined, '', '   '].map(v => crmDateTimeForInput(v)),
      absentFromInput: [null, undefined, '', '   '].map(v => crmDateTimeFromInput(v)),
      // Formato inesperado
      badForInput1: crmDateTimeForInput('formato-inesperado'),
      badFromInput1: crmDateTimeFromInput('formato-inesperado'),
      badForInput2: crmDateTimeForInput('2026-10-05T99:99:00Z'),
      badFromInput2: crmDateTimeFromInput('2026-10-05T99:99'),
      // DATE não convertido
      dateForInput: crmDateTimeForInput('2026-10-05'),
      dateFromInput: crmDateTimeFromInput('2026-10-05'),
      // Meia-noite UTC vira 21h anterior em SP (outubro = UTC-3)
      midnightForInput: crmDateTimeForInput('2026-10-05T00:00:00.000Z'),
    };
    console.log(JSON.stringify(resultados));
  `;
  const executar = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env }, encoding: 'utf8',
  }).trim());

  const r = executar();
  // Ausência
  for (const v of r.absentForInput) assert.equal(v, '');
  for (const v of r.absentFromInput) assert.equal(v, null);
  // Formato inesperado
  assert.equal(r.badForInput1, '');
  assert.equal(r.badFromInput1, null);
  assert.equal(r.badForInput2, '');
  assert.equal(r.badFromInput2, null);
  // DATE não convertido
  assert.equal(r.dateForInput, '');
  assert.equal(r.dateFromInput, null);
  // Meia-noite UTC = 21h anterior em SP (outubro = UTC-3)
  assert.equal(r.midnightForInput, '2026-10-04T21:00');
});

test('UX-PRO-E3-CRM determinismo: mesmo resultado em qualquer fuso de máquina (São Paulo declarado, não herdado)', async () => {
  const { crmDateTimeForInput, crmDateTimeFromInput, CRM_TIMEZONE_LABEL } = await loadMod();
  const script = `
    import { crmDateTimeForInput, crmDateTimeFromInput, CRM_TIMEZONE_LABEL } from ${JSON.stringify(pathToFileURL(modulo).href)};
    console.log(JSON.stringify({
      read1: crmDateTimeForInput('2026-10-05T14:32:00Z'),
      read2: crmDateTimeForInput('2026-10-05T17:32:00Z'),
      write1: crmDateTimeFromInput('2026-10-05T11:32'),
      write2: crmDateTimeFromInput('2026-10-05T14:32'),
      label: CRM_TIMEZONE_LABEL,
    }));
  `;

  const executar = (TZ) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ }, encoding: 'utf8',
  }).trim());

  const esperado = {
    read1: '2026-10-05T11:32',
    read2: '2026-10-05T14:32',
    write1: '2026-10-05T14:32:00.000Z',
    write2: '2026-10-05T17:32:00.000Z',
    label: '(America/Sao_Paulo)',
  };

  assert.deepEqual(executar('Pacific/Kiritimati'), esperado);
  assert.deepEqual(executar('America/Sao_Paulo'), esperado);
  assert.deepEqual(executar('Asia/Tokyo'), esperado);
  assert.deepEqual(executar('UTC'), esperado);
});

test('UX-PRO-E3-CRM varredura: OpportunitySummary.tsx usa os auxiliares e não tem mais toISOString().slice(0,16)', async () => {
  const fonte = await readFile(crm, 'utf8');

  // Importa o auxiliar
  assert.match(fonte, /from \"\.\.\/\.\.\/\.\.\/lib\/crm-dates\.mjs\"/,
    'OpportunitySummary precisa importar crm-dates.mjs');

  // Usa crmDateTimeForInput no refresh (leitura da API)
  assert.ok(fonte.includes('crmDateTimeForInput('),
    'precisa chamar crmDateTimeForInput ao carregar next_action_date');

  // Usa crmDateTimeFromInput no save (escrita na API)
  assert.ok(fonte.includes('crmDateTimeFromInput('),
    'precisa chamar crmDateTimeFromInput ao salvar next_action_date');

  // Não tem mais o padrão antigo
  assert.ok(!fonte.includes('toISOString().slice(0, 16)'),
    'não pode mais usar toISOString().slice(0, 16) para datetime-local');
  assert.ok(!fonte.includes('new Date(form.next_action_date).toISOString()'),
    'não pode mais usar new Date(...).toISOString() direto no save');

  // Rótulo de fuso visível ao lado do campo
  assert.ok(fonte.includes('CRM_TIMEZONE_LABEL') || fonte.includes('(America/Sao_Paulo)'),
    'precisa ter rótulo de fuso visível ao lado do input datetime-local');
});