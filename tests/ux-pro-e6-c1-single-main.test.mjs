// UX-PRO-E6-C1 — contrato estático do `<main>` único por documento nas rotas /cliente/app.
//
// O que este arquivo PROVA, lido do código:
//  1. que nenhuma página sob RealAccessShell emite `<main>` além do do
//     shell: o documento de cada rota renderiza exatamente UM `<main>` (o de
//     src/app/cliente/RealAccessShell.tsx:26);
//  2. que o shell preserva o marco `main` único.
//
// O que NÃO prova: renderização em navegador, leitor de tela, aceite humano,
// UAT ou conformidade WCAG. O walk cobre imports estáticos por caminho
// relativo; imports de pacote não carregam `<main>` de portal hoje.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const clienteRoot = path.join(root, 'src/app/cliente');
const shellFile = path.join(clienteRoot, 'RealAccessShell.tsx');

async function pageFiles(directory = clienteRoot, prefix = 'src/app/cliente') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await pageFiles(absolute, relative));
    else if (entry.name === 'page.tsx') result.push(relative);
  }
  return result;
}

async function importsOf(file) {
  const text = await readFile(file, 'utf8');
  const resolved = new Set();
  for (const match of text.matchAll(/from\s+[\"']([^\"']+)[\"']|import\s*\(\s*[\"']([^\"']+)[\"']/g)) {
    const spec = match[1] || match[2];
    if (!spec || !spec.startsWith('.')) continue;
    const base = path.resolve(path.dirname(file), spec);
    for (const candidate of [
      `${base}.tsx`, `${base}.ts`, `${base}.mjs`, `${base}.js`,
      path.join(base, 'index.tsx'), path.join(base, 'index.ts'), path.join(base, 'index.mjs'),
    ]) {
      try {
        await readFile(candidate, 'utf8');
        resolved.add(candidate);
        break;
      } catch { /* próximo candidato */ }
    }
  }
  return { text, resolved };
}

/** Linhas com `<main` em todos os módulos alcançáveis a partir da entrada. */
async function reachableMainLines(entry) {
  const seen = new Set();
  const queue = [path.resolve(root, entry)];
  const lines = [];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    let text, resolved;
    try {
      ({ text, resolved } = await importsOf(file));
    } catch {
      continue;
    }
    text.split('\n').forEach((line, index) => {
      if (/<main\b/.test(line)) {
        lines.push({
          file: path.relative(root, file).replaceAll('\\', '/'),
          line: index + 1,
          source: line.trim(),
          shell: path.resolve(file) === path.resolve(shellFile),
        });
      }
    });
    queue.push(...resolved);
  }
  return lines;
}

test('UX-PRO-E6-C1: nenhuma rota /cliente/app sob RealAccessShell emite <main> aninhado', async () => {
  const pages = (await pageFiles()).sort();
  // Filtra apenas rotas sob /cliente/app (via layout que usa RealAccessShell)
  const appPages = pages.filter(p => p.startsWith('src/app/cliente/app/'));
  const problems = [];
  let appCount = 0;
  for (const page of appPages) {
    // Todas as páginas sob app/layout.tsx são envolvidas pelo shell; não há gate condicional.
    // Diferente do admin, não há verificação de <AdminGate> — o layout garante o shell.
    appCount += 1;
    for (const hit of await reachableMainLines(page)) {
      if (hit.shell) continue;
      problems.push(
        `rota ${page} emite <main> aninhado ao shell RealAccessShell: ${hit.file}:${hit.line} — o documento deve conter exatamente um <main> (o do shell, em src/app/cliente/RealAccessShell.tsx)`,
      );
    }
  }
  assert.ok(appCount >= 14, `walk do cliente/app não encontrou páginas suficientes (${appCount})`);
  assert.deepEqual(
    problems,
    [],
    `UX-PRO-E6-C1: <main> aninhado presente em ${problems.length} ocorrência(s):\n${problems.join('\n')}`,
  );
});

test('UX-PRO-E6-C1: o shell do portal preserva o marco main único', async () => {
  const shell = await readFile(shellFile, 'utf8');
  const mains = [...shell.matchAll(/<main\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(mains.length, 1, `RealAccessShell.tsx deve manter exatamente 1 <main>, encontrados ${mains.length}`);
  assert.match(mains[0], /className=\{styles\.main\}/, `o <main> do shell mantém a classe de layout: ${mains[0]}`);
  assert.equal((shell.match(/<\/main>/g) || []).length, 1, 'cada <main> do shell mantém seu fechamento');
  assert.match(shell, /<header\b/, 'o shell preserva o header');
  assert.match(shell, /<footer\b/, 'o shell preserva o footer');
});
