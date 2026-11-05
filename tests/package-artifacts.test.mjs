import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { mainTips, checkLedgerBase } from '../scripts/lib/ledger-base.mjs';

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

// N1: base explícita de main ou primeiro pai do merge que publicou a mesma
// fotografia. A exceção é de um único merge, não ancestralidade irrestrita.
const LEDGER = 'docs/STATUS-VIGENTE.md';

function linhaCabecalho(ledger) {
  const linhas = ledger.split('\n');
  const idx = linhas.findIndex((linha) => linha.startsWith('**Última reconciliação:**'));
  assert.ok(idx >= 0 && idx <= 4, 'o cabeçalho do STATUS-VIGENTE.md precisa estar nas primeiras 5 linhas');
  return linhas[idx];
}

test('N1: o cabeçalho do STATUS-VIGENTE.md está em formato fixo (data real, base SHA completo de main, branch arena/)', async () => {
  const linha = linhaCabecalho(await readFile(path.join(root, LEDGER), 'utf8'));
  const m = linha.match(
    /^\*\*Última reconciliação:\*\* (\d{2})\/(\d{2})\/(\d{4}) · \*\*Base:\*\* `([0-9a-f]{40})` \(`main`, .+\) · \*\*Branch de trabalho:\*\* `(arena\/[^`]+)` \(.+\)\.$/,
  );
  assert.ok(m, `cabeçalho fora do formato esperado: ${linha}`);
  const [, dd, mm, yyyy] = m;
  const data = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  assert.equal(data.getFullYear(), Number(yyyy), 'ano inválido no cabeçalho');
  assert.equal(data.getMonth(), Number(mm) - 1, 'mês inválido no cabeçalho');
  assert.equal(data.getDate(), Number(dd), 'dia inválido no cabeçalho');
  const hoje = new Date();
  const meiaNoite = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  assert.ok(data <= meiaNoite, `data do cabeçalho no futuro: ${dd}/${mm}/${yyyy}`);
});

test('N1: a base é topo de main ou pertence ao merge que publicou a fotografia (anti-deriva)', async (t) => {
  const ledger = await readFile(path.join(root, LEDGER), 'utf8');
  const base = linhaCabecalho(ledger).match(/\*\*Base:\*\* `([0-9a-f]{40})`/)[1];
  const tips = mainTips(root);
  const result = checkLedgerBase({ root, base, ledger, tips });
  if (result.reason === 'no-main-tip') {
    // Limite preexistente: push de branch em checkout raso sem main/evento base.
    // Declarar diagnóstico; os testes herméticos abaixo continuam obrigatórios.
    t.diagnostic('N1: sem topo de main disponível; proveniência não verificada neste checkout (formato e cenários herméticos continuam obrigatórios)');
    return;
  }
  assert.ok(result.ok,
    `base ${base.slice(0, 7)} não é topo de main nem primeiro pai do merge que publicou esta fotografia (${tips.map(tip => tip.slice(0, 7)).join(', ')}): ${result.reason}`);
});

// Repositórios descartáveis: o teste não depende da topologia deste checkout.
async function ledgerRepository(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'seg-ledger-base-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const run = (...args) => execFileSync('git', args, {
    cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_NAME: 'QA', GIT_AUTHOR_EMAIL: 'qa@example.invalid',
      GIT_COMMITTER_NAME: 'QA', GIT_COMMITTER_EMAIL: 'qa@example.invalid' },
  }).trim();
  run('init', '-b', 'main');
  await mkdir(path.join(directory, 'docs'));
  await writeFile(path.join(directory, LEDGER), 'fotografia inicial\n');
  run('add', '.'); run('commit', '-m', 'base');
  const base = run('rev-parse', 'HEAD');
  // commit-tree constrói um DAG de teste sem checkout/troca de branch.
  const branch = run('commit-tree', run('rev-parse', 'HEAD^{tree}'), '-p', base, '-m', 'trabalho');
  const ledger = `Base: ${base}\nFotografia reconciliada\n`;
  await writeFile(path.join(directory, LEDGER), ledger);
  run('add', '.');
  const tree = run('write-tree');
  const merged = run('commit-tree', tree, '-p', base, '-p', branch, '-m', 'publica fotografia');
  return { directory, run, base, branch, ledger, tree, merged };
}

test('N1: aceita a base atual e o merge publicador; recusa base antiga, inexistente e segundo pai', async t => {
  const f = await ledgerRepository(t);
  const check = (base, tip, ledger = f.ledger) => checkLedgerBase({ root: f.directory, base, ledger, tips: [tip] });
  assert.equal(check(f.base, f.base).reason, 'main-tip');
  assert.equal(check(f.base, f.merged).reason, 'publishing-merge');
  assert.equal(check(f.branch, f.merged).ok, false, 'segundo pai não é main anterior');
  assert.equal(check('f'.repeat(40), f.merged).ok, false);
  assert.equal(check(f.base, 'e'.repeat(40)).ok, false, 'objeto do topo ausente não é prova de merge');
  assert.equal(check('SHA-inválido', f.merged).reason, 'invalid-base');
  assert.equal(check(f.base, f.merged, 'outra fotografia').ok, false);
  const next = f.run('commit-tree', f.tree, '-p', f.merged, '-m', 'avanço sem reconciliar');
  assert.equal(check(f.base, next).ok, false, 'ancestralidade não dá tolerância ilimitada');
  const nextMerge = f.run('commit-tree', f.tree, '-p', f.merged, '-p', f.branch, '-m', 'outro merge');
  assert.equal(check(f.base, nextMerge).ok, false, 'não andar recursivamente pelos merges');
  const linear = f.run('commit-tree', f.tree, '-p', f.base, '-m', 'linear');
  assert.equal(check(f.base, linear).ok, false, 'pai de commit linear não é exceção de merge');
  const third = f.run('commit-tree', f.tree, '-p', f.base, '-m', 'terceiro pai');
  const octopus = f.run('commit-tree', f.tree, '-p', f.base, '-p', f.branch, '-p', third, '-m', 'octopus');
  assert.equal(check(f.base, octopus).ok, false, 'merge de mais de dois pais não tem exceção implícita');
  assert.equal(checkLedgerBase({ root: f.directory, base: f.base, ledger: f.ledger, tips: [] }).reason, 'no-main-tip');
});

test('N1: merge publicador funciona em clone raso sem o objeto do primeiro pai', async t => {
  const f = await ledgerRepository(t);
  f.run('update-ref', 'refs/heads/main', f.merged);
  const clone = path.join(f.directory, 'shallow');
  f.run('clone', '--depth=1', `file://${f.directory}`, clone);
  assert.equal(execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: clone, encoding: 'utf8' }).trim(), 'true');
  assert.throws(() => execFileSync('git', ['cat-file', '-e', f.base], { cwd: clone, stdio: 'pipe' }));
  assert.equal(checkLedgerBase({ root: clone, base: f.base, ledger: f.ledger, tips: [f.merged] }).reason, 'publishing-merge');
});

test('N1: evento de main/PR é autoritativo e before não é aceito como topo', async t => {
  const f = await ledgerRepository(t);
  const event = path.join(f.directory, 'event.json');
  await writeFile(event, JSON.stringify({ after: f.merged, before: f.base }));
  assert.deepEqual(mainTips(f.directory, { GITHUB_EVENT_PATH: event, GITHUB_REF: 'refs/heads/main' }), [f.merged]);
  await writeFile(event, JSON.stringify({ pull_request: { base: { sha: f.merged } } }));
  assert.deepEqual(mainTips(f.directory, { GITHUB_EVENT_PATH: event, GITHUB_REF: 'refs/pull/1/merge' }), [f.merged]);
  await writeFile(event, '{invalid');
  assert.deepEqual(mainTips(f.directory, { GITHUB_EVENT_PATH: event }), [f.base], 'evento inválido usa ref local disponível');
});
