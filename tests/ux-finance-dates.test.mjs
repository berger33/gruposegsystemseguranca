// UX-PRO-07F-1 — contrato de `src/lib/finance-dates.mjs` (datas e fuso da tela
// financeira). Testes puros, sem banco, sem HTTP e sem navegador: provam o
// comportamento das três funções que as 20 exibições de /admin/financeiro
// passaram a usar, inclusive o determinismo entre fusos.
//
// O que NÃO é provado aqui: aceite humano, homologação, tema noturno e as
// jornadas de tela — isso é o gate de integração (PostgreSQL + HTTP + Chromium).

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  financeDate,
  financeMonth,
  financeDateTime,
  FINANCE_DATE_ABSENT,
  FINANCE_DATE_TIME_ABSENT,
} from '../src/lib/finance-dates.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('UX-PRO-07F-1 módulo: três funções e duas constantes, com declarações de tipo para o TypeScript', () => {
  assert.equal(typeof financeDate, 'function');
  assert.equal(typeof financeMonth, 'function');
  assert.equal(typeof financeDateTime, 'function');
  assert.equal(FINANCE_DATE_ABSENT, 'Não informada');
  assert.equal(FINANCE_DATE_TIME_ABSENT, 'Não informado');

  const declaracoes = readFileSync(path.join(root, 'src/lib/finance-dates.d.mts'), 'utf8');
  for (const nome of ['financeDate', 'financeMonth', 'financeDateTime']) {
    assert.match(declaracoes, new RegExp(`export function ${nome}\\(`), `${nome} precisa estar declarada no .d.mts`);
  }
  for (const nome of ['FINANCE_DATE_ABSENT', 'FINANCE_DATE_TIME_ABSENT']) {
    assert.match(declaracoes, new RegExp(`export const ${nome}:`), `${nome} precisa estar declarada no .d.mts`);
  }
});

test('UX-PRO-07F-1 financeDate: data de calendário vira DD/MM/AAAA lendo os dígitos, não convertendo o instante', () => {
  // O servidor serializa `DATE` como `YYYY-MM-DD` ou como instante ISO do dia
  // (o driver `pg` entrega Date). Nos DOIS casos a data de calendário é a que
  // está escrita nos primeiros dez caracteres — e `23:30Z` continua sendo dia
  // 17, ainda que em Tóquio já seja dia 18.
  assert.equal(financeDate('2038-02-17'), '17/02/2038');
  assert.equal(financeDate('2038-02-17T00:00:00.000Z'), '17/02/2038');
  assert.equal(financeDate('2038-02-17T23:30:00.000Z'), '17/02/2038');
  assert.equal(financeDate('2038-02-17T03:00:00.000Z'), '17/02/2038');
  assert.equal(financeDate(' 2038-02-17 '), '17/02/2038');
  assert.equal(financeDate('2038-12-01'), '01/12/2038');
});

test('UX-PRO-07F-1 financeMonth: competência vira MM/AAAA', () => {
  assert.equal(financeMonth('2038-02-17'), '02/2038');
  assert.equal(financeMonth('2038-02-17T00:00:00.000Z'), '02/2038');
  assert.equal(financeMonth('2038-11-01'), '11/2038');
  assert.equal(financeMonth('2038-02'), '02/2038');
});

test('UX-PRO-07F-1 ausência e formato inesperado: nada é inventado e nada é truncado', () => {
  for (const ausente of [null, undefined, '']) {
    assert.equal(financeDate(ausente), FINANCE_DATE_ABSENT);
    assert.equal(financeMonth(ausente), FINANCE_DATE_ABSENT);
    assert.equal(financeDateTime(ausente), FINANCE_DATE_TIME_ABSENT);
  }
  assert.equal(financeDate('   '), FINANCE_DATE_ABSENT, 'espaços em branco também são ausência');
  assert.equal(financeDate('formato-inesperado'), 'formato-inesperado', 'texto inesperado sai cru e inteiro, sem slice');
  assert.equal(financeMonth('fevereiro/2038'), 'fevereiro/2038');
  assert.equal(financeDateTime('quando-der'), 'quando-der');
});

test('UX-PRO-07F-1 financeDateTime: carimbo com hora e sufixo UTC declarado, em ciclo h23', () => {
  const esperado = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC', hourCycle: 'h23', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date('2038-02-17T13:45:00.000Z')).replace(',', '') + ' UTC';
  assert.equal(financeDateTime('2038-02-17T13:45:00.000Z'), esperado);
  assert.match(financeDateTime('2038-02-17T13:45:00.000Z'), /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} UTC$/);
  // h23: meia-noite é 00:05, nunca 24:05.
  assert.equal(financeDateTime('2037-01-15T00:05:00.000Z'), '15/01/2037 00:05 UTC');
  assert.equal(financeDateTime('2037-01-15T23:59:00.000Z'), '15/01/2037 23:59 UTC');
  assert.equal(financeDateTime('data-invalida'), 'data-invalida', 'instante inválido não vira "Invalid Date"');
});

test('UX-PRO-07F-1 determinismo: as três funções devolvem o mesmo texto em fusos diferentes', () => {
  const script = `
    import { financeDate, financeMonth, financeDateTime } from '${path.join(root, 'src/lib/finance-dates.mjs')}';
    process.stdout.write(JSON.stringify([
      financeDate('2038-02-17T23:30:00.000Z'),
      financeMonth('2038-02-17T23:30:00.000Z'),
      financeDateTime('2038-02-17T13:45:00.000Z'),
    ]));
  `;
  const rodar = (timezone) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: timezone }, encoding: 'utf8',
  }));
  const saoPaulo = rodar('America/Sao_Paulo');
  const toquio = rodar('Asia/Tokyo');
  assert.deepEqual(saoPaulo, ['17/02/2038', '02/2038', '17/02/2038 13:45 UTC']);
  assert.deepEqual(toquio, saoPaulo, 'o texto não pode depender do fuso da máquina que renderiza');
});
