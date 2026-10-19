import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');

function jsxAttribute(opening, sourceFile, name) {
  return opening.attributes.properties.find(attribute =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === name,
  );
}

function hasZeroTabIndex(opening, sourceFile) {
  const attribute = jsxAttribute(opening, sourceFile, 'tabIndex');
  if (!attribute?.initializer) return false;
  const value = attribute.initializer.getText(sourceFile);
  return value === '0' || value === '{0}';
}

async function listTsxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTsxFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [absolutePath] : [];
  }));
  return nested.flat().sort((left, right) => left.localeCompare(right));
}

test('UX-PRO-E5: wrappers de tabela administrativos nomeiam região rolável e recebem foco por teclado', async () => {
  const files = (await listTsxFiles(path.join(root, 'src/app/admin')))
    .map(file => path.relative(root, file).split(path.sep).join('/'));
  const wrappers = [];

  for (const file of files) {
    const source = await readFile(path.join(root, file), 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = node => {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sourceFile) === 'div') {
        const className = jsxAttribute(node, sourceFile, 'className');
        if (className?.initializer?.getText(sourceFile).includes('styles.tableWrap')) {
          const parent = node.parent;
          const children = ts.isJsxElement(parent)
            ? parent.children.filter(child => !ts.isJsxText(child) || child.getText(sourceFile).trim())
            : [];
          const childNames = children.filter(ts.isJsxElement).map(child => child.openingElement.tagName.getText(sourceFile));
          wrappers.push({ file, sourceFile, opening: node, childNames });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const nested = wrappers.filter(item => item.childNames.includes('UiTableScroll'));
  const directTables = wrappers.filter(item => item.childNames.includes('table'));
  const incomplete = directTables.filter(({ opening, sourceFile }) => {
    const role = jsxAttribute(opening, sourceFile, 'role')?.initializer?.getText(sourceFile);
    const label = jsxAttribute(opening, sourceFile, 'aria-label')?.initializer?.getText(sourceFile);
    const labelledBy = jsxAttribute(opening, sourceFile, 'aria-labelledby')?.initializer?.getText(sourceFile);
    return role !== '"region"' || !hasZeroTabIndex(opening, sourceFile) || (!label && !labelledBy);
  });

  assert.equal(wrappers.length, 51, 'inventário de wrappers mudou; reavaliar o escopo antes de atualizar a linha de base');
  assert.equal(nested.length, 6, 'UiTableScroll interno deve continuar sendo o único scroll region/foco');
  assert.equal(directTables.length, 45);
  assert.deepEqual(incomplete.map(item => `${item.file}:${item.sourceFile.getLineAndCharacterOfPosition(item.opening.getStart(item.sourceFile)).line + 1}`), []);

  const sharedScroll = await readFile(path.join(root, 'src/components/ui/UiTableScroll.tsx'), 'utf8');
  assert.match(sharedScroll, /role="region"/);
  assert.match(sharedScroll, /aria-label=/);
  assert.match(sharedScroll, /tabIndex=\{0\}/);
});
