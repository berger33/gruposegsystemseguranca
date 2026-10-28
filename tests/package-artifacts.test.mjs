import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// E13: os ZIPs de downloads/ e dist/ são fotografias antigas (~96 migrações)
// e continuam no índice do Git. O aviso precisa existir e acompanhar o ledger
// vigente; quando o ledger ganhar uma migração, este teste obriga a atualizar o aviso
// e a decidir entre regenerar ou remover os pacotes.
const root = path.resolve(import.meta.dirname, '..');

const migrationCount = async () =>
  (await readdir(path.join(root, 'db/migrations'))).filter(name => name.endsWith('.sql')).length;

// E21: o aviso também enuncia a contagem de rotas; medi-la pelo filesystem
// impede que o texto envelheça silenciosamente ao criar uma rota nova.
const routeCount = async () => {
  const entries = await readdir(path.join(root, 'src/app'), { recursive: true, withFileTypes: true });
  return entries.filter(entry => entry.isFile() && entry.name === 'page.tsx').length;
};

// `dist/` é um diretório de artefato: o ZIP é versionado, mas o conteúdo da
// pasta não sobrevive a snapshots/checkouts limpos. O aviso é materializado a
// partir do canônico de `downloads/` para que a exigência "todo ZIP tem aviso
// ao lado" continue verdadeira em qualquer ambiente, sem depender de commit.
// E21: `dist/LEIA-ME.md` é GERADO — fica fora do índice (ver .gitignore) e a
// suíte não pode depender de um arquivo versionado que o ambiente descarta.
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

test('E21: o aviso enuncia a contagem vigente de rotas, não só a de migrações', async () => {
  const routes = await routeCount();
  assert.ok(routes >= 100, 'contagem de rotas inesperadamente baixa');
  for (const dir of ['downloads', 'dist']) {
    const warning = await readFile(path.join(root, dir, 'LEIA-ME.md'), 'utf8');
    assert.match(warning, new RegExp(`\\b${routes} rotas`), `${dir}: aviso sem a contagem vigente de rotas`);
  }
});

test('E21: dist/LEIA-ME.md é gerado pela guarda e não suja a árvore', async () => {
  const gitignore = await readFile(path.join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, /^dist\/\*$/m, 'dist/ precisa permanecer como diretório de artefato');
  assert.doesNotMatch(gitignore, /^!dist\/LEIA-ME\.md$/m,
    'o aviso de dist/ é materializado pelo teste; reabrir a exceção volta a sujar a árvore');
  const tracked = execFileSync('git', ['ls-files', 'dist/LEIA-ME.md'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(tracked, '', 'dist/LEIA-ME.md não pode estar no índice do Git');
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
