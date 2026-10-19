// UX-PRO-10B (correção da PR #263) — guarda estática dos arquivos `visuals`.
//
// O que este arquivo PROVA, lido do código/disco:
//  1. que `public/visuals` contém apenas a pasta `layout-01` (a exportação
//     estática completa, com `index.html` e seus `_next/`) — o único
//     conteúdo desta família referenciado pela aplicação
//     (`src/components/Layout01.tsx`) e esperado pelos scripts
//     `scripts/package-layout-*.sh`. Os 9 snapshots órfãos criados pela
//     PR #263 (sem referência, sem CSS de layout) não voltam;
//  2. que nenhum arquivo de `src/` referencia `visuals/layout-02..10`;
//  3. que os 5 documentos nascidos na raiz pela #263 vivem em `docs/` e a
//     raiz não volta a acumular `GAP-*.md`/`UX-PRO-10*.md`;
//  4. que `@playwright/test` não volta a ser declarado sem uso (os testes
//     usam `playwright`, que permanece declarado).
//
// O que NÃO prova: acessibilidade em navegador. A UX-PRO-10B (teclado
// dentro do iframe do Layout 01, troca de tema, zoom 320/390/768/1440 e
// `/layout-preview` em navegador real) continua PENDENTE — nenhum teste
// unitário a substitui, e este arquivo não declara gap resolvido, aceite
// humano, UAT ou conformidade WCAG.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(absolute));
    else result.push(absolute);
  }
  return result;
}

test('UX-PRO-10B correção #263: public/visuals contém apenas a pasta layout-01 referenciada', async () => {
  const entries = (await readdir(path.join(root, 'public/visuals'), { withFileTypes: true }))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(entries, ['layout-01']);
  const layout01Files = (await walk(path.join(root, 'public/visuals/layout-01')))
    .map((file) => path.basename(file));
  assert.ok(layout01Files.includes('index.html'), 'layout-01 precisa manter seu index.html');
});

test('UX-PRO-10B correção #263: nenhum código referencia visuals/layout-02..10', async () => {
  const sources = (await walk(path.join(root, 'src')))
    .filter((file) => /\.(tsx?|mjs|css)$/.test(file));
  const offenders = [];
  for (const file of sources) {
    const text = await readFile(file, 'utf8');
    if (/visuals\/layout-(0[2-9]|10)\b/.test(text)) {
      offenders.push(path.relative(root, file).split(path.sep).join('/'));
    }
  }
  assert.deepEqual(offenders, []);
  const layout01 = await readFile(path.join(root, 'src/components/Layout01.tsx'), 'utf8');
  assert.match(layout01, /src="\/visuals\/layout-01\/index\.html"/);
});

test('UX-PRO-10B correção #263: documentos da #263 vivem em docs/, não na raiz', async () => {
  const docs = [
    'GAP-IFRAME-ACCESSIBILITY.md',
    'GAP-KEYBOARD-ACCESSIBILITY.md',
    'GAP-THEME-SWITCHING.md',
    'UX-PRO-10A-AUDIT.md',
    'UX-PRO-10C-CLOSEOUT.md',
  ];
  for (const name of docs) {
    const text = await readFile(path.join(root, 'docs', name), 'utf8');
    assert.match(text, /retifica[cç][aã]o \(18\/10\/2026/i, `${name} sem banner de retificação`);
  }
  const rootEntries = await readdir(root);
  assert.deepEqual(
    rootEntries.filter((name) => /^(GAP-|UX-PRO-10).*\.md$/.test(name)),
    [],
  );
});

test('UX-PRO-10B correção #263: @playwright/test não declarado; playwright preservado', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.equal(declared['@playwright/test'], undefined);
  assert.ok(declared.playwright, 'playwright precisa continuar declarado (usado pelos testes)');
});
