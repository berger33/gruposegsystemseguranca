// UX-PRO-07F-1 — datas e fuso em `/admin/financeiro`.
//
// Este teste é a trava ADITIVA do auxiliar de exibição `src/lib/finance-dates.mjs`
// e do mapa auditado de 20 exibições em 17 linhas de 9 arquivos:
//
//  1. data de calendário (`DATE`) vira `DD/MM/AAAA` montado dos DÍGITOS — nunca
//     por `Intl`/`new Date`, que reintroduziriam o deslocamento de um dia
//     conforme o fuso da máquina;
//  2. ausência é DECLARADA (`Não informada`/`Não informado`), nunca vira data
//     inventada nem célula vazia;
//  3. carimbo `TIMESTAMPTZ` sai com o fuso DECLARADO na própria frase (`UTC`),
//     em vez de herdar o fuso de quem opera;
//  4. o mesmo texto vale em qualquer fuso de máquina (prova em processo filho
//     com `TZ` diferente);
//  5. nenhuma das 20 exibições volta a sair em ISO cru e nenhum dos 19 campos
//     `<input type="date">` (20 ocorrências, pois uma linha traz dois campos) é
//     tocado — é o contrato das escritas.
//
// O teste lê o sistema de arquivos, mas não inicia servidor nem banco: a prova
// de jornada (HTTP real + Chromium) fica no gate
// `tests/ux-finance-workspace.integration.test.mjs` e no runner da fatia.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  FINANCE_DATE_ABSENT,
  FINANCE_DATETIME_ABSENT,
  financeDate,
  financeDateTime,
  financeMonth,
} from '../src/lib/finance-dates.mjs';

const root = path.resolve(import.meta.dirname, '..');
const modulo = path.join(root, 'src', 'lib', 'finance-dates.mjs');
const financeiro = path.join(root, 'src', 'app', 'admin', 'financeiro');

test('UX-PRO-07F-1 financeDate: data de calendário vira DD/MM/AAAA pelos dígitos, sem deslocar pelo fuso', () => {
  assert.equal(financeDate('2037-02-15'), '15/02/2037');
  // Timestamp completo do mesmo dia: a parte de calendário é a mesma, em
  // qualquer hora do dia — 00:00Z e 23:59Z NÃO podem cair em dias diferentes.
  assert.equal(financeDate('2037-02-15T00:00:00.000Z'), '15/02/2037');
  assert.equal(financeDate('2037-02-15T23:59:59.999Z'), '15/02/2037');
  assert.equal(financeDate('2037-01-01T03:00:00.000Z'), '01/01/2037');
  // Primeiro e último dia do ano, para provar que não há deslocamento de mês/ano.
  assert.equal(financeDate('2037-01-01'), '01/01/2037');
  assert.equal(financeDate('2037-12-31'), '31/12/2037');
});

test('UX-PRO-07F-1 financeDate/financeMonth: ausência é declarada e formato inesperado não é adivinhado', () => {
  for (const ausente of [null, undefined, '']) {
    assert.equal(financeDate(ausente), 'Não informada');
    assert.equal(financeDate(ausente), FINANCE_DATE_ABSENT);
    assert.equal(financeMonth(ausente), 'Não informada');
    assert.equal(financeDateTime(ausente), 'Não informado');
    assert.equal(financeDateTime(ausente), FINANCE_DATETIME_ABSENT);
  }
  // Formato inesperado volta como veio: nada é inventado nem convertido.
  assert.equal(financeDate('formato-inesperado'), 'formato-inesperado');
  assert.equal(financeDate('15/02/2037'), '15/02/2037');
  assert.equal(financeMonth('formato-inesperado'), 'formato-inesperado');
  assert.equal(financeDateTime('formato-inesperado'), 'formato-inesperado');
  assert.equal(financeDateTime('2037-02-15T99:99:00Z'), '2037-02-15T99:99:00Z');
  // Nenhum caminho devolve `Invalid Date`, `NaN` ou célula vazia.
  for (const entrada of [null, undefined, '', 'formato-inesperado', '2037-02-15T99:99:00Z']) {
    for (const saida of [financeDate(entrada), financeMonth(entrada), financeDateTime(entrada)]) {
      assert.ok(saida.length > 0, `"${String(entrada)}" não pode virar texto vazio`);
      assert.doesNotMatch(saida, /Invalid Date|NaN|undefined/);
    }
  }
});

test('UX-PRO-07F-1 financeMonth: competência vira MM/AAAA e aceita data completa', () => {
  assert.equal(financeMonth('2037-02'), '02/2037');
  assert.equal(financeMonth('2037-02-15'), '02/2037');
  assert.equal(financeMonth('2037-02-15T00:00:00.000Z'), '02/2037');
  assert.equal(financeMonth('2037-02-15T23:59:59.999Z'), '02/2037');
  assert.equal(financeMonth('2037-12-01'), '12/2037');
});

test('UX-PRO-07F-1 financeDateTime: carimbo sai em DD/MM/AAAA HH:mm UTC, com o fuso declarado', () => {
  assert.equal(financeDateTime('2037-02-15T23:30:00.000Z'), '15/02/2037 23:30 UTC');
  assert.equal(financeDateTime('2037-01-01T00:05:00Z'), '01/01/2037 00:05 UTC');
  // Hora 23 com `hourCycle: 'h23'`: não pode virar 11 PM nem 12.
  assert.equal(financeDateTime('2026-10-15T13:29:16.123Z'), '15/10/2026 13:29 UTC');
  // Formato exato exigido pelas superfícies (FIN-13, FIN-14 e FIN-16).
  assert.match(financeDateTime('2026-10-15T13:29:16.123Z'), /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} UTC$/);
});

test('UX-PRO-07F-1 determinismo: o mesmo texto vale em qualquer fuso de máquina (UTC declarado, não herdado)', () => {
  const script = `
    import { financeDate, financeMonth, financeDateTime } from ${JSON.stringify(pathToFileURL(modulo).href)};
    console.log(JSON.stringify({
      date: financeDate('2037-02-15'),
      month: financeMonth('2037-02-15'),
      stamp: financeDateTime('2037-02-15T23:30:00.000Z'),
    }));
  `;
  const executar = (TZ) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ }, encoding: 'utf8',
  }).trim());

  // Extremos: Kiritimati é UTC+14 (o primeiro fuso a virar o dia) e São Paulo é
  // UTC-3 — com `toLocaleString` local, o mesmo carimbo sairia 23:30 em um e
  // 20:30 no outro, que é exatamente o defeito corrigido nesta fatia.
  const esperado = { date: '15/02/2037', month: '02/2037', stamp: '15/02/2037 23:30 UTC' };
  assert.deepEqual(executar('Pacific/Kiritimati'), esperado);
  assert.deepEqual(executar('America/Sao_Paulo'), esperado);
  assert.deepEqual(executar('Asia/Tokyo'), esperado);
  assert.deepEqual({
    date: financeDate('2037-02-15'),
    month: financeMonth('2037-02-15'),
    stamp: financeDateTime('2037-02-15T23:30:00.000Z'),
  }, esperado);
});

test('UX-PRO-07F-1 varredura: as 20 exibições usam os auxiliares e os campos de formulário continuam ISO', async () => {
  // Mapa auditado (arquivo → exibições esperadas) e as expressões ISO cruas que
  // ele substituiu. Nenhuma linha é editada por este teste: ele só lê.
  const exibicoes = {
    'FinanceiroWorkspace.tsx': { financeDate: 3, financeMonth: 0, financeDateTime: 0 },
    'BudgetWorkspace.tsx': { financeDate: 2, financeMonth: 0, financeDateTime: 1 },
    'CashflowWorkspace.tsx': { financeDate: 2, financeMonth: 0, financeDateTime: 0 },
    'ClosureWorkspace.tsx': { financeDate: 0, financeMonth: 3, financeDateTime: 0 },
    'CommissionWorkspace.tsx': { financeDate: 1, financeMonth: 0, financeDateTime: 1 },
    'CostAllocationWorkspace.tsx': { financeDate: 2, financeMonth: 0, financeDateTime: 0 },
    'ExportWorkspace.tsx': { financeDate: 2, financeMonth: 0, financeDateTime: 1 },
    'BankReconciliationWorkspace.tsx': { financeDate: 1, financeMonth: 0, financeDateTime: 0 },
    'ManagementResultsWorkspace.tsx': { financeDate: 1, financeMonth: 0, financeDateTime: 0 },
  };
  const removidas = [
    ['FinanceiroWorkspace.tsx', '{String(rule.start_date).slice(0, 10)}'],
    ['FinanceiroWorkspace.tsx', '{String(item.period_start)} a {String(item.period_end)}'],
    ['BudgetWorkspace.tsx', '{String(selected.period_start).slice(0, 10)}'],
    ['BudgetWorkspace.tsx', 'new Date(entry.changed_at).toLocaleString("pt-BR")'],
    ['CashflowWorkspace.tsx', '{String(snapshot.competence_date).slice(0, 10)}'],
    ['CashflowWorkspace.tsx', '{String(item.competence_date).slice(0, 10)}'],
    ['ClosureWorkspace.tsx', 'd.closure.competence_date.slice(0,7)'],
    ['ClosureWorkspace.tsx', 'x.competence_date.slice(0,7)'],
    ['ClosureWorkspace.tsx', 'selected.competence_date.slice(0,7)'],
    ['CommissionWorkspace.tsx', 'x.provision_date.slice(0,10)'],
    ['CommissionWorkspace.tsx', 'new Date(selected.reviewed_at).toLocaleString("pt-BR")'],
    ['CostAllocationWorkspace.tsx', '{String(item.competence_date).slice(0,10)}'],
    ['CostAllocationWorkspace.tsx', '{String(cost.competence_date).slice(0,10)}'],
    ['ExportWorkspace.tsx', '{selected.period_start.slice(0,10)}'],
    ['ExportWorkspace.tsx', 'new Date(x.created_at).toLocaleString("pt-BR")'],
    ['BankReconciliationWorkspace.tsx', '{transaction.transaction_date}'],
    ['ManagementResultsWorkspace.tsx', '{r.competence_date}'],
  ];
  // Fora do recorte declarado, e que por isso precisam CONTINUAR como estão:
  // preenchimento de formulário (valor do `<input type="date">` é ISO) e corpo
  // do POST de geração recorrente (payload não muda).
  const preservadas = [
    ['CashflowWorkspace.tsx', 'selected?.due_date?.slice(0, 10)'],
    ['CostAllocationWorkspace.tsx', 'String(selected.competence_date).slice(0,10)'],
    ['FinanceiroWorkspace.tsx', 'rule.start_date.slice(0, 10)'],
    ['ManagementResultsWorkspace.tsx', 'maximumFractionDigits'],
  ];

  let total = 0;
  for (const [arquivo, esperado] of Object.entries(exibicoes)) {
    const fonte = await readFile(path.join(financeiro, arquivo), 'utf8');
    assert.match(fonte, /from "\.\.\/\.\.\/\.\.\/lib\/finance-dates\.mjs"/,
      `${arquivo} precisa importar o auxiliar de datas da tela`);
    const contagem = {
      financeDate: (fonte.match(/financeDate\(/g) || []).length,
      financeMonth: (fonte.match(/financeMonth\(/g) || []).length,
      financeDateTime: (fonte.match(/financeDateTime\(/g) || []).length,
    };
    assert.deepEqual(contagem, esperado, `exibições de data divergem do mapa auditado em ${arquivo}`);
    total += contagem.financeDate + contagem.financeMonth + contagem.financeDateTime;
  }
  assert.equal(total, 20, 'o mapa desta fatia tem exatamente 20 exibições de data/hora em 9 arquivos');

  for (const [arquivo, trecho] of removidas) {
    const fonte = await readFile(path.join(financeiro, arquivo), 'utf8');
    assert.ok(!fonte.includes(trecho),
      `${arquivo} não pode voltar a exibir ISO cru: "${trecho}"`);
  }
  for (const [arquivo, trecho] of preservadas) {
    const fonte = await readFile(path.join(financeiro, arquivo), 'utf8');
    assert.ok(fonte.includes(trecho),
      `${arquivo} precisa preservar o uso fora do recorte: "${trecho}"`);
  }

  // Contrato das escritas: os campos de data continuam `<input type="date">`
  // (19 linhas, 20 ocorrências — `ExportWorkspace.tsx:31` traz dois na mesma linha).
  const nomes = (await readdirFinanceiro()).filter(nome => nome.endsWith('.tsx'));
  let campos = 0;
  for (const nome of nomes) {
    const fonte = await readFile(path.join(financeiro, nome), 'utf8');
    campos += (fonte.match(/type="date"/g) || []).length;
  }
  assert.equal(campos, 20, 'os 20 campos de data de formulário precisam continuar exatamente como estavam');
});

async function readdirFinanceiro() {
  const { readdir } = await import('node:fs/promises');
  return readdir(financeiro);
}
