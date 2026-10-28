#!/usr/bin/env node
// Executa cinco padrões de gate citados no mapa SEC (4 comandos; E6 grupo 2 e 10B usam o mesmo runner) e grava evidência
// de EXECUÇÃO (exit code, duração, resumo TAP). Sem isto, o mapa seria só um
// índice de asserções escritas — não uma prova de que elas passam.
//
// Uso: AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x node scripts/requisitos-sec-evidence-run.mjs
import './qa-generated-files-guard.mjs';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const OUT = 'docs/REQUISITOS-SEC-EVIDENCIA-EXECUCAO-2026-10-28.json';

const GATES = [
  { gate: 'scripts/qa-wave0-static.mjs', args: [], descricao: 'bateria estática: imports + migrações' },
  { gate: 'scripts/qa-staff-auth-postgres.mjs', args: [], descricao: 'sessão, CSRF, MFA, rate limit (SEC-02/04/05/06/07/13/15)' },
  { gate: 'scripts/qa-cli-v2-postgres.mjs', args: [], descricao: 'escopo de documento e auditoria transacional (SEC-03/12/14)' },
  { gate: 'scripts/qa-ux-public-routes-postgres.mjs', args: [],
    env: { UX_PUBLIC_TEST_PATTERN: 'E6 grupo 2' },
    descricao: 'jornadas de orçamento/simulador/pacotes/privacidade (SEC-10)',
    ambiente: 'PostgreSQL 17 descartável + Chromium' },
  { gate: 'scripts/qa-ux-public-routes-postgres.mjs', args: [],
    env: { UX_PUBLIC_TEST_PATTERN: 'UX-PRO-10B previas' },
    descricao: 'prévias x recursos reais (SEC-11)',
    ambiente: 'PostgreSQL 17 descartável + Chromium' },
];

const run = ({ gate, args, env }) => new Promise(resolve => {
  const started = Date.now();
  const child = spawn(process.execPath, [gate, ...args], {
    cwd: root,
    env: { ...process.env, ...env, AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let tail = '';
  const onData = chunk => { tail = (tail + chunk.toString()).slice(-2500); };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.once('error', error => resolve({ exit: 1, duracaoMs: Date.now() - started, resumo: String(error) }));
  child.once('close', code => {
    const linhas = tail.trim().split('\n');
    const resumo = linhas.filter(l => /# (pass|fail|tests) |RESUMO:|_EXIT:|_SUMMARY:|TAP_SUMMARY/.test(l)).slice(-6).join(' | ');
    resolve({ exit: code ?? 1, duracaoMs: Date.now() - started, resumo: resumo || linhas.slice(-3).join(' | ').slice(0, 300) });
  });
});

const resultados = [];
for (const g of GATES) {
  console.log(`SEC_EVIDENCE_RUN: ${g.gate} ...`);
  const r = await run(g);
  resultados.push({
    gate: g.gate, descricao: g.descricao,
    database: g.ambiente ?? (g.gate === 'scripts/qa-wave0-static.mjs'
      ? 'não aplicável (gate estático)'
      : g.gate === 'scripts/qa-ux-public-routes-postgres.mjs'
        ? 'PostgreSQL 17 descartável + Chromium' : 'PostgreSQL 17 descartável'),
    comando: `${g.gate} ${g.args.join(' ')}`.trim(),
    filtro: g.env?.UX_PUBLIC_TEST_PATTERN ?? null,
    exit: r.exit, duracaoMs: r.duracaoMs, resumo: r.resumo,
  });
  console.log(`SEC_EVIDENCE_RESULT: ${g.gate} exit=${r.exit} (${r.duracaoMs}ms) ${r.resumo.slice(0, 120)}`);
}

const saida = {
  stage: 'requisitos-sec-evidencia-execucao', data: '2026-10-28',
  metodo: 'execução real de 5 padrões de gate (4 comandos): wave0 estático, staff-auth/CLI-v2 em PostgreSQL 17, E6 grupo 2 e 10B em PostgreSQL 17 + Chromium; exit code, duração e resumo TAP capturados',
  ambiente: { node: process.version, execEnv: 'AWS_Lambda_nodejs22.x' },
  gates: resultados,
  aprovados: resultados.filter(r => r.exit === 0).length,
  total: resultados.length,
  limite: 'evidência técnica de execução automatizada; NENHUM aceite humano, UAT, Windows real, leitor de tela ou reauditoria integral por jornada foi executado; produção segue NO-GO',
};
await writeFile(path.join(root, OUT), JSON.stringify(saida, null, 2) + '\n');
console.log(`SEC_EVIDENCE_WRITTEN: ${OUT} (${saida.aprovados}/${saida.total} gates verdes)`);
process.exit(resultados.every(r => r.exit === 0) ? 0 : 1);
