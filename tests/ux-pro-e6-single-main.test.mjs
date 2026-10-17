// UX-PRO-E6 — contrato estático do `<main>` único por documento nas rotas /admin.
//
// O que este arquivo PROVA, lido do código:
//  1. que nenhuma página administrativa sob AdminGate emite `<main>` além do do
//     shell: o documento de cada rota renderiza exatamente UM `<main>` (os três
//     `<main>` de src/app/admin/AdminGate.tsx são estados mutuamente exclusivos
//     — checking (:234), error (:247) e chrome (:115) — e o conteúdo da página
//     desce como descendente do chrome);
//  2. que o shell preserva o marco `main[data-admin-theme-scope="true"]` nos três
//     estados (acoplamento do tema dia/noite em admin-theme.css).
//
// O que NÃO prova: renderização em navegador (isso é o gate
// scripts/qa-ux-pro-e6-postgres.mjs + tests/ux-pro-e6-single-main.integration.test.mjs),
// leitor de tela, aceite humano, UAT ou conformidade WCAG. O walk cobre imports
// estáticos e dinâmicos por caminho relativo; imports de pacote não carregam
// `<main>` de página administrativa hoje e continuam fora do alcance.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const adminRoot = path.join(root, 'src/app/admin');
const shellFile = path.join(adminRoot, 'AdminGate.tsx');

async function pageFiles(directory = adminRoot, prefix = 'src/app/admin') {
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
  for (const match of text.matchAll(/from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']/g)) {
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

test('UX-PRO-E6: nenhuma rota /admin sob AdminGate emite <main> aninhado ao do shell', async () => {
  const pages = (await pageFiles()).sort();
  const problems = [];
  let gatedPages = 0;
  for (const page of pages) {
    const source = await readFile(path.join(root, page), 'utf8');
    if (!/<AdminGate\b/.test(source)) continue;
    gatedPages += 1;
    for (const hit of await reachableMainLines(page)) {
      if (hit.shell) continue;
      problems.push(
        `rota ${page} emite <main> aninhado ao shell do AdminGate: ${hit.file}:${hit.line} — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)`,
      );
    }
  }
  assert.ok(gatedPages >= 30, `walk do AdminGate não encontrou páginas suficientes (${gatedPages})`);
  assert.deepEqual(
    problems,
    [],
    `UX-PRO-E6: <main> aninhado presente em ${problems.length} ocorrência(s):\n${problems.join('\n')}`,
  );
});

test('UX-PRO-E6: o shell administrativo preserva o marco main[data-admin-theme-scope] nos três estados', async () => {
  const shell = await readFile(shellFile, 'utf8');
  const mains = [...shell.matchAll(/<main\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(mains.length, 3, `AdminGate.tsx deve manter exatamente 3 <main> (checking/error/chrome), encontrados ${mains.length}`);
  for (const tag of mains) {
    assert.match(tag, /data-admin-theme-scope="true"/, `todo <main> do shell mantém o escopo de tema: ${tag}`);
  }
  assert.equal((shell.match(/<\/main>/g) || []).length, 3, 'cada <main> do shell mantém seu fechamento');
  assert.match(shell, /<header\b/, 'o chrome preserva o header do shell');
  assert.match(shell, /id="admin-module-nav"/, 'o chrome preserva a navegação por módulos');
});
