import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scanRoots = ['src/app', 'src/components'];

async function filesUnder(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await filesUnder(absolute));
    else if (/\.(?:tsx|jsx|ts|js)$/.test(entry.name)) found.push(absolute);
  }
  return found;
}

test('datas e horários exibidos declaram a localidade pt-BR', async () => {
  const files = (await Promise.all(scanRoots.map(directory => filesUnder(path.join(root, directory))))).flat();
  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (/\.toLocale(?:Date|Time)?String\s*\(\s*\)/.test(source)) offenders.push(path.relative(root, file));
  }
  assert.deepEqual(offenders, [], `formatador sem localidade: ${offenders.join(', ')}`);
});
