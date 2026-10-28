import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// E19 — proteção de `next-env.d.ts` / `tsconfig.json` em TODOS os runners de
// QA que spawnam processos. O Next reescreve esses arquivos quando um gate
// sobe `server.mjs --dev`/NEXT_DIST_DIR; sem restore a guarda E2 falha na
// execução seguinte (falso vermelho de CI). Ver E9 §4.
//
// RED desta fatia: 65 runners spawnavam sem nenhuma proteção.
// GREEN: guarda de saída única (`scripts/qa-generated-files-guard.mjs`)
// importada por todos; prova funcional em subprocesso com process.exit().

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFile(path.join(root, f), 'utf8');
const GUARD = 'scripts/qa-generated-files-guard.mjs';
const FILES = ['next-env.d.ts', 'tsconfig.json'];
const snapshots = async () => Promise.all(FILES.map(f => read(f)));

test('E19: o módulo de guarda restaura de forma síncrona no evento exit', async () => {
  const source = await read(GUARD);
  assert.match(source, /process\.on\('exit',\s*restore\)/,
    'o restore precisa estar no evento exit (process.exit() não aceita await)');
  assert.match(source, /writeFileSync/, 'o handler exit precisa escrever de forma SÍNCRONA');
  assert.match(source, /readFileSync/, 'o snapshot precisa ser lido de forma síncrona');
  assert.match(source, /for \(const name of FILES\)/, 'precisa cobrir os dois arquivos');
  assert.match(source, /SEG_QA_SKIP_GENERATED_GUARD/, 'precisa de opt-out para depuração');
  assert.match(source, /SIGINT.*SIGTERM|SIGTERM.*SIGINT/s, 'precisa cobrir cancelamento de CI');
  assert.match(source, /export function releaseSignalHandlers/,
    'runners com shutdown próprio precisam poder liberar os handlers de sinal');
  assert.match(source, /process\.removeListener/, 'a liberação precisa remover os listeners');
  assert.match(source, /content === null\) continue/, 'não pode inventar arquivo que não existia');
  assert.match(source, /if \(atual === content\) continue/, 'não deve reescrever sem necessidade');
});

test('E19: os 67 runners que spawnam processos estão protegidos', async () => {
  const runners = (await readdir(path.join(root, 'scripts')))
    .filter(f => /^qa-.*\.mjs$/.test(f)).sort();
  const spawnam = [];
  const desprotegidos = [];
  for (const file of runners) {
    const source = await read(`scripts/${file}`);
    if (!/spawn\(|execFileSync|execSync/.test(source)) continue;
    spawnam.push(file);
    if (!/qa-generated-files-guard\.mjs|restoreGeneratedFiles|withCleanGeneratedFiles/.test(source)) {
      desprotegidos.push(file);
    }
  }
  assert.ok(spawnam.length >= 67, `esperávamos ≥67 runners com spawn, achamos ${spawnam.length}`);
  assert.deepEqual(desprotegidos, [], 'todo runner com spawn precisa de proteção');
  let imports = 0;
  for (const file of runners) {
    const source = await read(`scripts/${file}`);
    if (/^import (?:'\.\/qa-generated-files-guard\.mjs'|\{ releaseSignalHandlers \} from '\.\/qa-generated-files-guard\.mjs');$/m.test(source)) imports += 1;
  }
  assert.ok(imports >= 65, `esperávamos ≥65 imports do guard, achamos ${imports}`);
  // Runners que registram o PRÓPRIO handler de SIGINT/SIGTERM precisam
  // liberar os do guard, senão process.exit() atropela o graceful shutdown.
  const comHandlerProprio = [];
  for (const file of runners) {
    const source = await read(`scripts/${file}`);
    if (!/process\.on\(\s*signal|process\.on\([^)]*SIGINT|process\.on\([^)]*SIGTERM/.test(source)) continue;
    if (file === 'qa-generated-files-guard.mjs') continue;
    comHandlerProprio.push(file);
    assert.match(source, /releaseSignalHandlers\(\)/,
      `${file}: handler de sinal próprio exige releaseSignalHandlers()`);
  }
  assert.ok(comHandlerProprio.length >= 1, 'o caso de shutdown próprio precisa existir e ser coberto');
});

test('E19: prova real — SIGTERM restaura e encerra quando não há handler próprio', async () => {
  const antes = await snapshots();
  const probe = `import '${path.join(root, GUARD).replaceAll('\\', '/')}';\n` +
    `import { writeFileSync } from 'node:fs';\n` +
    `const r = '${root.replaceAll('\\', '/')}';\n` +
    `writeFileSync(r + '/next-env.d.ts', '// E19 PROBE SIGTERM\\n');\n` +
    `setInterval(() => {}, 1000);\n`;
  const tmp = path.join(root, '.e19-probe-signal.mjs');
  await writeFile(tmp, probe);
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, [tmp], { cwd: root, stdio: 'pipe' });
  await new Promise(resolve => setTimeout(resolve, 350));
  child.kill('SIGTERM');
  const code = await new Promise(resolve => child.once('exit', resolve));
  await (await import('node:fs/promises')).rm(tmp, { force: true });
  assert.equal(code, 143, 'o guard precisa encerrar com 128+SIGTERM (143)');
  assert.deepEqual(await snapshots(), antes, 'o guard precisa restaurar antes de sair por SIGTERM');
});

test('E19: prova real — process.exit() restaura os arquivos sujados', async () => {
  const antes = await snapshots();
  const probe = `import '${path.join(root, GUARD).replaceAll('\\', '/')}';\n` +
    `import { writeFileSync } from 'node:fs';\n` +
    `const r = '${root.replaceAll('\\', '/')}';\n` +
    `writeFileSync(r + '/next-env.d.ts', '// E19 PROBE SUJO\\\\n');\n` +
    `writeFileSync(r + '/tsconfig.json', '{"e19":"sujo"}\\\\n');\n` +
    `process.exit(0);\n`;
  const tmp = path.join(root, '.e19-probe-exit.mjs');
  await writeFile(tmp, probe);
  try {
    execFileSync(process.execPath, [tmp], { cwd: root, stdio: 'pipe' });
  } finally {
    await (await import('node:fs/promises')).rm(tmp, { force: true });
  }
  assert.deepEqual(await snapshots(), antes, 'o guard precisa restaurar após process.exit()');
});

test('E19: prova real — exceção não tratada também restaura', async () => {
  const antes = await snapshots();
  const probe = `import '${path.join(root, GUARD).replaceAll('\\', '/')}';\n` +
    `import { writeFileSync } from 'node:fs';\n` +
    `const r = '${root.replaceAll('\\', '/')}';\n` +
    `writeFileSync(r + '/next-env.d.ts', '// E19 PROBE THROW\\\\n');\n` +
    `throw new Error('e19_probe_throw');\n`;
  const tmp = path.join(root, '.e19-probe-throw.mjs');
  await writeFile(tmp, probe);
  try {
    execFileSync(process.execPath, [tmp], { cwd: root, stdio: 'pipe' });
    assert.fail('o probe precisava falhar');
  } catch (error) {
    assert.ok(error.status !== 0 || error.signal, 'o subprocesso precisa terminar com erro');
  } finally {
    await (await import('node:fs/promises')).rm(tmp, { force: true });
  }
  assert.deepEqual(await snapshots(), antes, 'o guard precisa restaurar após exceção não tratada');
});

test('E19: o opt-out desliga a guarda (para depuração) sem afetar o padrão', async () => {
  const antes = await snapshots();
  const probe = `import '${path.join(root, GUARD).replaceAll('\\', '/')}';\n` +
    `import { writeFileSync } from 'node:fs';\n` +
    `writeFileSync('${root.replaceAll('\\', '/')}/next-env.d.ts', '// E19 OPTOUT\\\\n');\n` +
    `process.exit(0);\n`;
  const tmp = path.join(root, '.e19-probe-optout.mjs');
  await writeFile(tmp, probe);
  try {
    execFileSync(process.execPath, [tmp], {
      cwd: root, stdio: 'pipe', env: { ...process.env, SEG_QA_SKIP_GENERATED_GUARD: '1' },
    });
    // Com opt-out o arquivo fica sujo: restaurar manualmente é obrigatório.
    const sujo = await read('next-env.d.ts');
    assert.match(sujo, /E19 OPTOUT/, 'com opt-out a guarda não deve agir');
  } finally {
    await writeFile(path.join(root, 'next-env.d.ts'), antes[0]);
    await (await import('node:fs/promises')).rm(tmp, { force: true });
  }
  assert.deepEqual(await snapshots(), antes, 'o teste precisa devolver o estado original');
});

test('E19: a guarda está no test:unit e o servidor de produção NÃO a importa', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.match(pkg.scripts['test:unit'], /tests\/e19-generated-files-guard\.test\.mjs/,
    'a guarda E19 precisa rodar na suíte local/CI');
  const server = await read('server.mjs');
  assert.doesNotMatch(server, /qa-generated-files-guard/,
    'o servidor de produção não deve restaurar arquivos concorrentemente');
  const helper = await read('scripts/qa-generated-files.mjs');
  assert.match(helper, /withCleanGeneratedFiles/,
    'o helper E9 precisa continuar disponível para envelopes explícitos');
});
