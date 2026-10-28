#!/usr/bin/env node
// E19 — guarda de SAÍDA para os runners de QA.
//
// Muitos runners (65 nesta fatia) sobem `server.mjs --dev` ou testes de
// integração com NEXT_DIST_DIR. O Next reescreve `next-env.d.ts` e
// `tsconfig.json`; sem restore, a árvore fica suja e a guarda E2 falha na
// próxima execução (falso vermelho de CI). Ver docs/E9-ESTABILIZACAO-GATES-
// 2026-10-27.md §4 e docs/STATUS-VIGENTE.md item 16.
//
// Estrutura dos runners: eles têm VÁRIOS `process.exit()` (alguns com 10),
// então envelopar o corpo em `withCleanGeneratedFiles()` exigiria reescrever
// a lógica de cada um. Este módulo usa `process.on('exit')` — disparado por
// `process.exit()`, por exceção não tratada e por fim natural do event loop —
// e restaura de forma SÍNCRONA (o handler `exit` não aceita async).
//
// Uso: basta UMA linha no topo do runner:
//   import './qa-generated-files-guard.mjs';
//
// Opt-out para depuração: SEG_QA_SKIP_GENERATED_GUARD=1
// Log opcional: SEG_QA_GENERATED_GUARD_LOG=1

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const FILES = ['next-env.d.ts', 'tsconfig.json'];
let signalReleaser = null;

if (process.env.SEG_QA_SKIP_GENERATED_GUARD !== '1') {
  const snapshot = new Map();
  for (const name of FILES) {
    try {
      snapshot.set(name, readFileSync(path.join(root, name), 'utf8'));
    } catch {
      snapshot.set(name, null); // arquivo não existia: não inventar um
    }
  }

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    let changed = 0;
    for (const [name, content] of snapshot) {
      if (content === null) continue;
      const file = path.join(root, name);
      try {
        // Só escreve se mudou: evita tocar mtime sem necessidade.
        const atual = readFileSyncSafe(file);
        if (atual === content) continue;
        writeFileSync(file, content);
        changed += 1;
      } catch {
        /* não transformar falha de restore em novo erro no exit */
      }
    }
    if (process.env.SEG_QA_GENERATED_GUARD_LOG === '1') {
      process.stderr.write(`QA_GENERATED_FILES_GUARD: ${changed} arquivo(s) restaurado(s)\n`);
    }
  };

  process.on('exit', restore);
  // SIGINT/SIGTERM não disparam `exit` automaticamente: encerrar de forma
  // explícita para que o restore aconteça também em cancelamento de CI.
  //
  // EXCEÇÃO: runners que JÁ têm o próprio handler de sinal (ex.:
  // qa-homologacao-local.mjs, que precisa parar servidor/Postgres com
  // graceful shutdown) DEVEM chamar releaseSignalHandlers(). Se o guard
  // mantivesse o handler e chamasse process.exit() aqui, o cleanup do runner
  // seria atropelado e deixaria processos órfãos. O `exit` ainda restaura.
  const signalHandlers = new Map();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const handler = () => { restore(); process.exit(128 + (signal === 'SIGINT' ? 2 : 15)); };
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }
  signalReleaser = () => {
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
    signalHandlers.clear();
  };
}

/** Libera os handlers de sinal do guard para runners com shutdown próprio. */
export function releaseSignalHandlers() {
  if (signalReleaser) signalReleaser();
}

function readFileSyncSafe(file) {
  try { return readFileSync(file, 'utf8'); } catch { return null; }
}
