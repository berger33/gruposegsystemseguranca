#!/usr/bin/env node
// E9 — snapshot/restore dos arquivos que o Next reescreve quando um gate sobe
// `server.mjs --dev` com NEXT_DIST_DIR (ou sem ele, como faz o demo local).
//
// Sintoma real: `npm run test:demo-local:pg` mudava o SHA versionado de
// `next-env.d.ts` de 1862ac4b… para 0f706298… (`.next/dev/types/...`), e
// `npm run test:ext14-intel:pg` mudava para e15fd6c2… (`.next/integration-ext14/dev/types/...`)
// além de acrescentar dois includes em `tsconfig.json`. A árvore ficava suja e
// a guarda E2 (`tests/generated-files-hygiene.test.mjs`) falhava na execução
// seguinte — um falso vermelho de CI indistinguível de regressão de verdade.
//
// Uso: envolver o corpo do runner em `withCleanGeneratedFiles(async () => {...})`
// ou chamar snapshot/restore explicitamente no `finally`. O restore precisa
// acontecer mesmo quando o gate falha, e nunca apaga um arquivo que já existia.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const GENERATED_FILES = ['next-env.d.ts', 'tsconfig.json'];

export const repoRoot = () => path.resolve(import.meta.dirname, '..');

export async function snapshotGeneratedFiles(root = repoRoot()) {
  const snapshot = new Map();
  for (const name of GENERATED_FILES) {
    snapshot.set(name, await readFile(path.join(root, name), 'utf8').catch(() => null));
  }
  return snapshot;
}

export async function restoreGeneratedFiles(snapshot, root = repoRoot()) {
  if (!snapshot) return;
  for (const [name, content] of snapshot) {
    // `null` significa que o arquivo não existia antes: não inventar um.
    if (content !== null) await writeFile(path.join(root, name), content);
  }
}

/** Executa `fn` e devolve a árvore ao estado de entrada, inclusive em falha. */
export async function withCleanGeneratedFiles(fn, root = repoRoot()) {
  const snapshot = await snapshotGeneratedFiles(root);
  try {
    return await fn();
  } finally {
    await restoreGeneratedFiles(snapshot, root);
  }
}
