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

// E27: a linha `| Testes |` do ledger declarava `1234/1234` enquanto a suíte
// fechava `1236/1236` (E22 levou 1226→1234; as guardas de E23 e E25 somaram +2).
// Contagem de asserções não é determinística nem pode ser medida sem rodar a
// suíte inteira — por isso a guarda confere o que é determinístico: quantos
// ARQUIVOS o `test:unit` do package.json realmente lista. Se uma fatia entrar no
// `test:unit`, o ledger precisa ser reconciliado na mesma PR.
async function unitTestFiles() {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const command = pkg.scripts['test:unit'] ?? '';
  assert.match(command, /^node --test\s/, 'o test:unit precisa ser uma lista explícita de arquivos');
  return command.replace(/^node --test\s+/, '').trim().split(/\s+/).filter(name => name.endsWith('.test.mjs'));
}

function ledgerTestsRow(ledger) {
  const row = ledger.split('\n').find(line => line.startsWith('| Testes |'));
  assert.ok(row, 'o §1 do STATUS-VIGENTE.md precisa manter a linha `| Testes |`');
  return row;
}

test('E27: o ledger declara a contagem de arquivos do test:unit que o package.json lista', async () => {
  const files = await unitTestFiles();
  assert.ok(files.length > 100, `test:unit inesperadamente curto (${files.length} arquivos)`);
  assert.equal(new Set(files).size, files.length, 'o test:unit não pode listar o mesmo arquivo duas vezes');
  for (const file of files) {
    assert.match(file, /^tests\/[\w.-]+\.test\.mjs$/, `arquivo fora do padrão do test:unit: ${file}`);
  }

  const row = ledgerTestsRow(await readFile(path.join(root, 'docs/STATUS-VIGENTE.md'), 'utf8'));
  assert.match(
    row,
    new RegExp(`\\*\\*${files.length}\\*\\* arquivos explícitos no \`test:unit\``),
    `o ledger precisa declarar **${files.length}** arquivos explícitos no \`test:unit\``,
  );
});

test('E27: o placar de testes do ledger não se contradiz (n/m com n = m)', async () => {
  const row = ledgerTestsRow(await readFile(path.join(root, 'docs/STATUS-VIGENTE.md'), 'utf8'));
  const placares = [...row.matchAll(/\*\*(\d+)\/(\d+)\*\*/g)];
  assert.ok(placares.length > 0, 'a linha `| Testes |` precisa declarar pelo menos um placar');
  for (const [, passaram, total] of placares) {
    assert.equal(passaram, total,
      `placar incoerente no ledger: ${passaram}/${total}`);
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
