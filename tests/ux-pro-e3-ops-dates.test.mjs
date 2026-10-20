// UX-PRO-E3 — datas e horas em `/admin/operacao`.
//
// Trava ADITIVA do auxiliar de exibição `src/lib/ops-dates.mjs` e das sete
// linhas de `OperacaoWorkspace.tsx` que exibiam carimbos `TIMESTAMPTZ` por
// `String(valor).slice(0, 16).replace("T", " ")`, sem fuso.
//
// Decisão do proprietário em 19/10/2026 (via (a)): fuso local
// `America/Sao_Paulo` DECLARADO no texto + instante ISO preservado como texto
// secundário. O teste prova:
//
//  1. `2026-10-05T14:32:00Z` sai `05/10/2026 11:32 (America/Sao_Paulo)` e
//     `2026-10-05T17:32:00Z` sai `05/10/2026 14:32 (America/Sao_Paulo)` — duas
//     marcas distintas do mesmo dia NÃO colidem; nenhuma delas é o ISO fatiado;
//  2. a conversão atravessa a virada do dia (não é deslocamento de string);
//  3. ausente é declarado, formato inesperado volta como veio e data de
//     calendário (`DATE`) NÃO é convertida por este auxiliar;
//  4. o mesmo texto vale em qualquer fuso de máquina (processo filho com `TZ`);
//  5. as sete linhas não voltam ao padrão antigo, as colunas `DATE` da rota
//     permanecem intactas e o resíduo fora do escopo (E3-CRM) não foi tocado.
//
// O teste lê o sistema de arquivos, mas não inicia servidor nem banco: a prova
// de jornada (HTTP real + Chromium) está no caso E3 de
// `tests/ux-ops-workspace.integration.test.mjs`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  OPS_DATETIME_ABSENT,
  OPS_TIME_ZONE,
  opsDateTime,
  opsIsoStamp,
} from '../src/lib/ops-dates.mjs';

const root = path.resolve(import.meta.dirname, '..');
const modulo = path.join(root, 'src', 'lib', 'ops-dates.mjs');
const workspace = path.join(root, 'src', 'app', 'admin', 'operacao', 'OperacaoWorkspace.tsx');
const crm = path.join(root, 'src', 'app', 'admin', 'crm', 'OpportunitySummary.tsx');

test('UX-PRO-E3 opsDateTime: São Paulo com o fuso declarado e duas marcas do mesmo dia sem colisão', () => {
  assert.equal(OPS_TIME_ZONE, 'America/Sao_Paulo');
  assert.equal(opsDateTime('2026-10-05T14:32:00Z'), '05/10/2026 11:32 (America/Sao_Paulo)');
  assert.equal(opsDateTime('2026-10-05T17:32:00Z'), '05/10/2026 14:32 (America/Sao_Paulo)');
  // As duas marcas distintas do MESMO dia precisam permanecer distintas.
  assert.notEqual(opsDateTime('2026-10-05T14:32:00Z'), opsDateTime('2026-10-05T17:32:00Z'));
  // Formato exato exigido pelas sete exibições desta rota.
  assert.match(opsDateTime('2026-10-15T13:29:16.123Z'), /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} \(America\/Sao_Paulo\)$/);
  assert.equal(opsDateTime('2026-10-15T13:29:16.123Z'), '15/10/2026 10:29 (America/Sao_Paulo)');
  // Hora 00 com `hourCycle: 'h23'`: não pode virar 24 nem 12 AM.
  assert.equal(opsDateTime('2026-01-01T02:05:00Z'), '31/12/2025 23:05 (America/Sao_Paulo)');
  // O texto exibido nunca é o ISO fatiado que a fatia corrigiu.
  assert.notEqual(opsDateTime('2026-10-05T14:32:00Z'), '2026-10-05 14:32');
});

test('UX-PRO-E3 opsDateTime: a conversão atravessa a virada do dia (não é deslocamento de texto)', () => {
  // 01:30Z do dia 6 é 22:30 do dia 5 em São Paulo.
  assert.equal(opsDateTime('2026-10-06T01:30:00Z'), '05/10/2026 22:30 (America/Sao_Paulo)');
  // 02:30Z do dia 5 é 23:30 do dia 4 em São Paulo.
  assert.equal(opsDateTime('2026-10-05T02:30:00Z'), '04/10/2026 23:30 (America/Sao_Paulo)');
});

test('UX-PRO-E3 opsDateTime/opsIsoStamp: ausência é declarada, formato inesperado não é adivinhado', () => {
  for (const ausente of [null, undefined, '', '   ']) {
    assert.equal(opsDateTime(ausente), 'Não informado');
    assert.equal(opsDateTime(ausente), OPS_DATETIME_ABSENT);
    assert.equal(opsIsoStamp(ausente), '');
  }
  // Formato inesperado volta como veio: nada é inventado nem convertido.
  assert.equal(opsDateTime('formato-inesperado'), 'formato-inesperado');
  assert.equal(opsDateTime('2026-10-05T99:99:00Z'), '2026-10-05T99:99:00Z');
  // Data de calendário (`DATE`) NÃO passa por este auxiliar: converter por
  // `new Date('2026-10-05')` (meia-noite UTC) cairia no dia anterior em SP.
  assert.equal(opsDateTime('2026-10-05'), '2026-10-05');
  assert.equal(opsIsoStamp('2026-10-05'), '');
  // O ISO secundário é o texto ORIGINAL, preservado para auditoria.
  assert.equal(opsIsoStamp('2026-10-05T14:32:00Z'), '2026-10-05T14:32:00Z');
  assert.equal(opsIsoStamp('2026-10-05T14:32:00.000Z'), '2026-10-05T14:32:00.000Z');
  for (const entrada of [null, undefined, '', 'formato-inesperado', '2026-10-05', '2026-10-05T99:99:00Z']) {
    const saida = opsDateTime(entrada);
    assert.ok(saida.length > 0, `"${String(entrada)}" não pode virar texto vazio`);
    assert.doesNotMatch(saida, /Invalid Date|NaN|undefined/);
  }
});

test('UX-PRO-E3 determinismo: o mesmo texto vale em qualquer fuso de máquina (São Paulo declarado, não herdado)', () => {
  const script = `
    import { opsDateTime, opsIsoStamp } from ${JSON.stringify(pathToFileURL(modulo).href)};
    console.log(JSON.stringify({
      a: opsDateTime('2026-10-05T14:32:00Z'),
      b: opsDateTime('2026-10-05T17:32:00Z'),
      iso: opsIsoStamp('2026-10-05T14:32:00Z'),
    }));
  `;
  const executar = (TZ) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ }, encoding: 'utf8',
  }).trim());

  // Extremos: Kiritimati é UTC+14 (o primeiro fuso a virar o dia), Tóquio é
  // UTC+9 e São Paulo é UTC−3 — com formatação local herdada, o mesmo carimbo
  // sairia 04:32, 23:32 e 11:32, que é exatamente o defeito corrigido.
  const esperado = {
    a: '05/10/2026 11:32 (America/Sao_Paulo)',
    b: '05/10/2026 14:32 (America/Sao_Paulo)',
    iso: '2026-10-05T14:32:00Z',
  };
  assert.deepEqual(executar('Pacific/Kiritimati'), esperado);
  assert.deepEqual(executar('America/Sao_Paulo'), esperado);
  assert.deepEqual(executar('Asia/Tokyo'), esperado);
  assert.deepEqual(executar('UTC'), esperado);
});

test('UX-PRO-E3 varredura: as sete exibições usam o auxiliar e as colunas DATE continuam intactas', async () => {
  const fonte = await readFile(workspace, 'utf8');
  assert.match(fonte, /from "\.\.\/\.\.\/\.\.\/lib\/ops-dates\.mjs"/,
    'a rota precisa importar o auxiliar de datas da tela');

  // Sete linhas da E3 + fallback `requested_at` da E3-R1 = oito `<Stamp value=`:
  // a janela da lacuna tem início e fim (dois `<Stamp>`), `CoveragePanel` usa
  // `<Stamp value={cov.requested_at} />` quando `coverage_date` é ausente, e o
  // selo de ciência usa o mesmo par de auxiliares inline para preservar o
  // prefixo herdado "Ciente desde".
  assert.equal((fonte.match(/<Stamp value=/g) || []).length, 8,
    'as sete linhas de célula (incluindo o fallback de CoveragePanel) precisam passar pelo componente de carimbo');
  assert.equal((fonte.match(/opsIsoStamp\(ack\.acknowledged_at\)/g) || []).length, 1,
    'o ISO secundário precisa continuar visível também no selo de ciência');
  assert.equal((fonte.match(/opsDateTime\(/g) || []).length, 2,
    'somente o componente de carimbo e o selo de ciência chamam opsDateTime');
  assert.equal((fonte.match(/opsIsoStamp\(/g) || []).length, 2,
    'somente o componente de carimbo e o selo de ciência chamam opsIsoStamp');
  assert.ok(!fonte.includes('slice(0, 16)'),
    'nenhuma exibição pode voltar ao ISO fatiado sem fuso');

  // As datas de CALENDÁRIO (`DATE`) desta rota ficam fora da conversão e
  // continuam com `slice(0, 10)` (19 ocorrências em 15 linhas, agora todas em
  // colunas `DATE`, incluindo `String(cov.coverage_date).slice(0, 10)`).
  assert.equal((fonte.match(/slice\(0, 10\)/g) || []).length, 19,
    'as 19 ocorrências de slice(0, 10) permanecem restritas a datas de calendário');

  // O rótulo herdado do selo de ciência continua prefixado por "Ciente desde".
  assert.ok(fonte.includes('`Ciente desde ${opsDateTime(ack.acknowledged_at)}`'),
    'o selo de ciência precisa preservar o prefixo textual herdado');

  // E3-CRM: agora corrigido nesta fatia — usa crm-dates.mjs e não tem mais toISOString().slice(0, 16).
  const fonteCrm = await readFile(crm, 'utf8');
  assert.match(fonteCrm, /from \"\.\.\/\.\.\/\.\.\/lib\/crm-dates\.mjs\"/,
    'E3-CRM precisa importar crm-dates.mjs');
  assert.ok(fonteCrm.includes('crmDateTimeForInput('),
    'E3-CRM precisa usar crmDateTimeForInput na leitura');
  assert.ok(fonteCrm.includes('crmDateTimeFromInput('),
    'E3-CRM precisa usar crmDateTimeFromInput na escrita');
  assert.ok(!fonteCrm.includes('toISOString().slice(0, 16)'),
    'E3-CRM não pode mais usar toISOString().slice(0, 16)');
  assert.ok(!fonteCrm.includes('new Date(form.next_action_date).toISOString()'),
    'E3-CRM não pode mais usar new Date(...).toISOString() direto no save');
  assert.ok(fonteCrm.includes('CRM_TIMEZONE_LABEL') || fonteCrm.includes('(America/Sao_Paulo)'),
    'E3-CRM precisa ter rótulo de fuso visível');
});

test('UX-PRO-E3-R1 fallback de cobertura: 02:30Z e 14:32Z não colidem, viram dia em SP e preservam DATE sem conversão', () => {
  const stampMadrugada = '2026-10-05T02:30:00Z';
  const stampDiurno = '2026-10-05T14:32:00Z';
  const renderizarCelulaCobertura = (cov) => (
    cov.coverage_date
      ? String(cov.coverage_date).slice(0, 10)
      : `${opsDateTime(cov.requested_at)} · ${opsIsoStamp(cov.requested_at)}`
  );

  const celulaMadrugada = renderizarCelulaCobertura({ coverage_date: null, requested_at: stampMadrugada });
  const celulaDiurno = renderizarCelulaCobertura({ coverage_date: null, requested_at: stampDiurno });

  assert.notEqual(celulaMadrugada, celulaDiurno);
  assert.equal(celulaMadrugada, '04/10/2026 23:30 (America/Sao_Paulo) · 2026-10-05T02:30:00Z');
  assert.equal(celulaDiurno, '05/10/2026 11:32 (America/Sao_Paulo) · 2026-10-05T14:32:00Z');
  assert.notEqual(celulaMadrugada, '2026-10-05');
  assert.notEqual(celulaDiurno, '2026-10-05');

  // Quando `coverage_date` (`DATE`) existe, permanece em ISO sem passar por `opsDateTime`.
  assert.equal(
    renderizarCelulaCobertura({ coverage_date: '2026-10-08', requested_at: stampMadrugada }),
    '2026-10-08',
  );
  assert.equal(
    renderizarCelulaCobertura({ coverage_date: '2026-10-08T00:00:00.000Z', requested_at: stampMadrugada }),
    '2026-10-08',
  );
});

test('UX-PRO-E3-R1 varredura: CoveragePanel preserva coverage_date (DATE) e usa Stamp para requested_at', async () => {
  const fonte = await readFile(workspace, 'utf8');
  assert.ok(
    !fonte.includes('String(cov.requested_at).slice(0, 10)'),
    'requested_at (TIMESTAMPTZ) não pode mais ser truncado com slice(0, 10)',
  );
  assert.ok(
    fonte.includes('cov.coverage_date ? String(cov.coverage_date).slice(0, 10) : <Stamp value={cov.requested_at} />'),
    'CoveragePanel precisa manter String(cov.coverage_date).slice(0, 10) para DATE e usar <Stamp value={cov.requested_at} /> no fallback',
  );
});
