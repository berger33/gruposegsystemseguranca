import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// E2: um build comum (`npm run build`, sem NEXT_DIST_DIR) reescreve
// `next-env.d.ts` apontando para `.next/types/...`. O arquivo versionado
// precisa ser exatamente esse conteúdo; caso contrário todo build suja a
// árvore e os relatórios precisam restaurar o arquivo por hash à mão.
// O distDir isolado continua disponível para os gates de integração via
// NEXT_DIST_DIR, sem ser o padrão versionado.
const root = path.resolve(import.meta.dirname, '..');

test('PLT-SMK-001: next-env.d.ts versionado usa o distDir padrão', async () => {
  const content = await readFile(path.join(root, 'next-env.d.ts'), 'utf8');
  assert.match(content, /import "\.\/\.next\/types\/routes\.d\.ts";/);
  assert.match(content, /import "\.\/\.next\/types\/root-params\.d\.ts";/);
  assert.doesNotMatch(content, /integration-/,
    'sobra de distDir isolado de teste no arquivo gerado versionado');
});

test('PLT-SMK-001: isolamento de distDir dos gates continua opt-in por ambiente', async () => {
  const config = await readFile(path.join(root, 'next.config.ts'), 'utf8');
  assert.match(config, /NEXT_DIST_DIR/);
  assert.match(config, /isolatedDistDir \? \{ distDir: isolatedDistDir \} : \{\}/);
});
