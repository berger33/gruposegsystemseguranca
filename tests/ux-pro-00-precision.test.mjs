import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hasKeyboardTraversal, recordKeyboardCapture } from '../scripts/ux-pro-00-keyboard-evidence.mjs';

const root = path.resolve(import.meta.dirname, '..');
const inventory = 'docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv';
const matrix = 'docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv';

function parseCsv(source) {
  const lines = source.trim().split('\n');
  const fields = line => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(m => m[1].replaceAll('""', '"'));
  const columns = fields(lines[0]);
  return Object.fromEntries(lines.slice(1).map(line => {
    const row = Object.fromEntries(fields(line).map((value, i) => [columns[i], value]));
    return [row.rota, row];
  }));
}

async function fixture(t, sources, entries = []) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ux-pro-00-precision-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const d of ['scripts', 'docs/fixture-evidencias', 'src/app', '.github/workflows']) {
    await mkdir(path.join(directory, d), { recursive: true });
  }
  // Executa o gerador real, em árvore sintética isolada: nunca reescreve os
  // CSVs versionados nem precisa alterar o teste obrigatório de freshness.
  for (const file of await readdir(path.join(root, 'scripts'))) {
    if (/^ux-pro-00-.*\.mjs$/.test(file)) {
      await copyFile(path.join(root, 'scripts', file), path.join(directory, 'scripts', file));
    }
  }
  for (const [route, source] of Object.entries(sources)) {
    const file = path.join(directory, 'src/app', route.slice(1), 'page.tsx');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, source);
  }
  await writeFile(path.join(directory, 'docs/fixture-evidencias/resumo.json'), JSON.stringify({ stage: 'fixture', entries }));
  const run = (...args) => execFileSync(process.execPath, ['scripts/ux-pro-00-inventory.mjs', ...args], { cwd: directory, encoding: 'utf8' });
  run();
  return {
    directory,
    run,
    inventory: parseCsv(await readFile(path.join(directory, inventory), 'utf8')),
    matrix: parseCsv(await readFile(path.join(directory, matrix), 'utf8')),
  };
}

test('UX-PRO-00: desatualização literal e por prop contam; alertas de escrita não contam', async t => {
  const f = await fixture(t, {
    '/admin/prop': '<FaixaDesatualizada testId="contratos-desatualizada" leitura={contratos} />',
    '/admin/literal': '<div role="alert" data-testid="historico-desatualizado">Última leitura preservada</div>',
    '/admin/write': '<div role="alert" data-testid="contracts-write-error">Escrita recusada</div>',
    '/admin/alert': '<p role="alert">Aviso genérico</p>',
  });
  assert.equal(f.inventory['/admin/prop'].estados_erro, 'sim');
  assert.equal(f.inventory['/admin/literal'].estados_erro, 'sim');
  assert.equal(f.inventory['/admin/write'].estados_erro, 'nao');
  assert.equal(f.inventory['/admin/alert'].estados_erro, 'nao');
});

test('UX-PRO-00: percurso explícito do gate é creditado sem alegar cobertura completa ou humana', async t => {
  const f = await fixture(t, { '/admin/medido': '<main />' }, [{
    route: '/admin/medido', viewport: '390x844', firstFocus: true,
    percursoTeclado: ['campo-cadastro', 'Recarregar lista'],
  }]);
  assert.equal(f.inventory['/admin/medido'].marcadores_teclado, 'sim');
  assert.equal(f.inventory['/admin/medido'].capturas_primeiro_foco, 'sim');
  assert.match(f.matrix['/admin/medido'].teclado, /percurso de teclado registrado em navegador/);
  assert.doesNotMatch(f.matrix['/admin/medido'].teclado, /percurso completo nao verificado/);
  assert.doesNotMatch(f.matrix['/admin/medido'].lacuna, /percurso de teclado nao verificado/);
  assert.match(f.matrix['/admin/medido'].lacuna, /limitado ao recorte registrado/);
  assert.match(f.matrix['/admin/medido'].evidencia, /validacao manual: nao_registrado/);
  assert.match(f.matrix['/admin/medido'].evidencia, /aceite humano: nao_registrado/);
});

test('UX-PRO-00: nome de captura, primeiro foco e percurso vazio ou inválido não provam percurso', async t => {
  const sources = Object.fromEntries(['foco', 'nome', 'vazio', 'texto', 'branco', 'objeto', 'codigo'].map(name => [
    `/admin/${name}`, name === 'codigo' ? '<main onKeyDown={handle} />' : '<main />',
  ]));
  const f = await fixture(t, sources, [
    { route: '/admin/foco', viewport: '390x844', firstFocus: true },
    { route: '/admin/nome', viewport: '390x844', file: 'teclado.png', state: 'percurso_teclado' },
    { route: '/admin/vazio', viewport: '390x844', percursoTeclado: [] },
    { route: '/admin/texto', viewport: '390x844', percursoTeclado: 'Tab' },
    { route: '/admin/branco', viewport: '390x844', percursoTeclado: [' '] },
    { route: '/admin/objeto', viewport: '390x844', percursoTeclado: [{}] },
  ]);
  for (const name of ['foco', 'nome', 'vazio', 'texto', 'branco', 'objeto']) {
    assert.equal(f.inventory[`/admin/${name}`].marcadores_teclado, 'nao');
    assert.match(f.matrix[`/admin/${name}`].lacuna, /percurso de teclado nao verificado/);
  }
  assert.equal(f.inventory['/admin/codigo'].marcadores_teclado, 'sim');
  assert.match(f.matrix['/admin/codigo'].teclado, /nao verificado em navegador/);
});

test('UX-PRO-00: --check continua recusando CSV desatualizado', async t => {
  const f = await fixture(t, { '/admin/leitura': '<main />' });
  assert.match(f.run('--check'), /OK:/);
  await writeFile(path.join(f.directory, inventory), 'CSV desatualizado\n');
  const result = spawnSync(process.execPath, ['scripts/ux-pro-00-inventory.mjs', '--check'], { cwd: f.directory, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DESATUALIZADO:/);
});


test('UX-PRO-00: emissor preserva entradas e só acrescenta medições à captura de teclado', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ux-pro-00-keyboard-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const untouched = { route: '/admin/clientes', viewport: '1440x900', screenshot: 'docs/evidencia/desktop.png', problems: [] };
  const keyboard = { route: '/admin/clientes', viewport: '390x844', screenshot: 'docs/evidencia/teclado.png', problems: [] };
  const original = { stage: 'fixture', notes: 'registro preservado', entries: [untouched, keyboard] };
  await writeFile(path.join(directory, 'resumo.json'), JSON.stringify(original));
  const measurement = {
    stage: 'fixture', route: '/admin/clientes', viewport: '390x844',
    file: 'teclado.png', firstFocus: true, percursoTeclado: ['new-account-name'],
  };
  await recordKeyboardCapture(directory, measurement);
  const recorded = JSON.parse(await readFile(path.join(directory, 'resumo.json'), 'utf8'));
  assert.equal(recorded.notes, original.notes);
  assert.equal(recorded.entries.length, 2);
  assert.deepEqual(recorded.entries[0], untouched);
  assert.deepEqual(recorded.entries[1], { ...keyboard, firstFocus: true, percursoTeclado: ['new-account-name'] });
  assert.ok(hasKeyboardTraversal(recorded.entries[1]));
  await recordKeyboardCapture(directory, measurement);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'resumo.json'), 'utf8')), recorded, 'a emissão repetida não duplica entradas');
});

test('UX-PRO-00: emissor não inventa medição nem sobrescreve resumo inválido ou viewport diferente', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ux-pro-00-keyboard-invalid-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const measurement = { stage: 'fixture', route: '/admin/clientes', viewport: '390x844', file: 'teclado.png', firstFocus: true, percursoTeclado: ['campo'] };
  await recordKeyboardCapture('', measurement); // modo CI sem pasta: nenhuma escrita
  for (const bad of [{ firstFocus: false }, { percursoTeclado: [] }, { percursoTeclado: [' '] }]) {
    await assert.rejects(recordKeyboardCapture(directory, { ...measurement, ...bad }), /keyboard_evidence_requires/);
  }
  const file = path.join(directory, 'resumo.json');
  await writeFile(file, 'JSON inválido');
  await assert.rejects(recordKeyboardCapture(directory, measurement), SyntaxError);
  assert.equal(await readFile(file, 'utf8'), 'JSON inválido');
  const mismatch = JSON.stringify({ entries: [{ route: '/admin/clientes', viewport: '320x844', file: 'teclado.png' }] });
  await writeFile(file, mismatch);
  await assert.rejects(recordKeyboardCapture(directory, measurement), /keyboard_evidence_viewport_mismatch/);
  assert.equal(await readFile(file, 'utf8'), mismatch);
});

test('UX-PRO-00: emissor cria resumo legível por máquina quando a pasta é nova', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ux-pro-00-keyboard-new-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const measurement = { stage: 'fixture', route: '/admin/contratos', viewport: '390x844', file: 'teclado.png', firstFocus: true, percursoTeclado: ['Abrir contrato'] };
  await recordKeyboardCapture(directory, measurement);
  const recorded = JSON.parse(await readFile(path.join(directory, 'resumo.json'), 'utf8'));
  assert.equal(recorded.stage, 'fixture');
  assert.deepEqual(recorded.entries, [measurement]);
});
