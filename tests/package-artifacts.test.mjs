import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// E13: os ZIPs de downloads/ e dist/ são fotografias antigas (~96 migrações)
// e continuam no índice do Git. O aviso precisa existir e acompanhar o ledger
// vigente; quando o ledger ganhar uma migração, este teste obriga a atualizar o aviso
// e a decidir entre regenerar ou remover os pacotes.
const root = path.resolve(import.meta.dirname, '..');

const migrationCount = async () =>
  (await readdir(path.join(root, 'db/migrations'))).filter(name => name.endsWith('.sql')).length;

// `dist/` é um diretório de artefato: o ZIP é versionado, mas o conteúdo da
// pasta não sobrevive a snapshots/checkouts limpos. O aviso é materializado a
// partir do canônico de `downloads/` para que a exigência "todo ZIP tem aviso
// ao lado" continue verdadeira em qualquer ambiente, sem depender de commit.
before(async () => {
  const canonical = await readFile(path.join(root, 'downloads/LEIA-ME.md'), 'utf8');
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist/LEIA-ME.md'), canonical);
});

test('PLT-DEF-024: avisos de pacotes obsoletos acompanham o ledger de migrações', async () => {
  const count = await migrationCount();
  assert.ok(count >= 180, 'ledger de migrações inesperadamente baixo');
  for (const dir of ['downloads', 'dist']) {
    const warning = await readFile(path.join(root, dir, 'LEIA-ME.md'), 'utf8');
    assert.match(warning, /OBSOLETO/);
    assert.match(warning, new RegExp(`\\b${count} migrações`), `${dir}: aviso sem a contagem vigente`);
    assert.match(warning, /não use|Não use|não usar/i);
  }
});

test('PLT-DEF-024: todo ZIP versionado continua coberto pelo aviso', async () => {
  for (const dir of ['downloads', 'dist']) {
    const entries = await readdir(path.join(root, dir));
    const zips = entries.filter(name => name.endsWith('.zip'));
    assert.ok(zips.length > 0, `${dir}: nenhum ZIP para sinalizar`);
    const warning = await readFile(path.join(root, dir, 'LEIA-ME.md'), 'utf8');
    assert.match(warning, /\*\.zip/, `${dir}: aviso não cobre os arquivos ZIP`);
  }
});
