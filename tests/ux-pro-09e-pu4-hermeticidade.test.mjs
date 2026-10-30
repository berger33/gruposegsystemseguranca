// E22 — guarda de hermeticidade da suíte unitária.
//
// Esta guarda existe para impedir a reincidência do defeito: o `test:unit` não
// pode voltar a depender de `AWS_EXECUTION_ENV` (nem de bibliotecas do SO) para
// abrir o navegador empacotado, e o skip — quando existir — precisa ser marcado
// com motivo. Ela também vigia o contrato do PU4 (5 asserções) e do gate.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AL2023_RUNTIME_MARKER,
  BROWSER_POLICY,
  REQUIRE_BROWSER_ENV,
  browserSkipReason,
  ensurePackagedRuntime,
  launchBrowser,
} from './helpers/browser-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const DOC = 'docs/E22-HERMETICIDADE-SUITE-UNITARIA-2026-10-30.md';

test('E22: a política tem três estados declarados e nenhum skip silencioso', async () => {
  assert.deepEqual(
    Object.values(BROWSER_POLICY).sort(),
    ['fail-explicit', 'run', 'skip-marcado'],
    'a política precisa nomear run, skip-marcado e fail-explicit',
  );
  const helper = await read('tests/helpers/browser-runtime.mjs');
  assert.match(helper, /status: BROWSER_POLICY\.skipMarked/, 'o skip precisa devolver estado próprio');
  assert.match(helper, /reason: skipReason/, 'o skip precisa devolver o motivo ao teste');
  assert.match(helper, /throw new BrowserPolicyError\(/, 'falha precisa ser erro explícito');
  assert.doesNotMatch(helper, /console\.warn|silently|return \{ status: 'ok'/,
    'nada de degradar em silêncio');
});

test('E22: o marcador AL2023 é injetado antes do import do pacote', async () => {
  const helper = await read('tests/helpers/browser-runtime.mjs');
  const injection = helper.indexOf('ensurePackagedRuntime();');
  const dynamicImport = helper.indexOf("import('@sparticuz/chromium')");
  assert.ok(injection > 0, 'o helper precisa injetar o marcador');
  assert.ok(dynamicImport > injection,
    'o import do pacote precisa ser dinâmico e posterior à injeção: o pacote decide no import');
  assert.doesNotMatch(helper, /^import .*from '@sparticuz\/chromium';/m,
    'import estático tornaria a injeção inútil');

  const vazio = {};
  assert.equal(ensurePackagedRuntime(vazio, 'linux').injected, true);
  assert.equal(vazio.AWS_EXECUTION_ENV, AL2023_RUNTIME_MARKER);
  const jaDefinido = { AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs20.x' };
  assert.equal(ensurePackagedRuntime(jaDefinido, 'linux').injected, false,
    'o marcador do ambiente real nunca pode ser sobrescrito');
  assert.equal(jaDefinido.AWS_EXECUTION_ENV, 'AWS_Lambda_nodejs20.x');
});

test('E22: em processo limpo, sem AWS_EXECUTION_ENV, o navegador roda', () => {
  const probe = [
    "import { launchBrowser } from './tests/helpers/browser-runtime.mjs';",
    'const antes = process.env.AWS_EXECUTION_ENV ?? null;',
    'const launched = await launchBrowser();',
    'const pagina = launched.browser && await launched.browser.newPage();',
    'const valor = pagina ? await pagina.evaluate(() => 6 * 7) : null;',
    'await launched.browser?.close();',
    "console.log(JSON.stringify({ antes, status: launched.status, marcador: process.env.AWS_EXECUTION_ENV ?? null, valor }));",
  ].join('\n');
  const env = { ...process.env };
  delete env.AWS_EXECUTION_ENV;
  delete env[REQUIRE_BROWSER_ENV];
  delete env.LD_LIBRARY_PATH;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', probe], {
    cwd: root,
    encoding: 'utf8',
    env,
    timeout: 120_000,
  });
  const result = JSON.parse(output.trim().split('\n').at(-1));
  assert.equal(result.antes, null, 'o processo filho precisa começar sem a variável');
  assert.equal(result.status, 'run', 'em Linux x64 o navegador empacotado precisa rodar sem variável');
  assert.equal(result.marcador, AL2023_RUNTIME_MARKER, 'quem injeta o marcador é o helper');
  assert.equal(result.valor, 42, 'o navegador precisa estar funcional, não só iniciado');
});

test('E22: as 5 asserções do PU4 foram preservadas', async () => {
  const pu4 = await read('tests/ux-pro-09e-pu4.test.mjs');
  assert.equal((pu4.match(/^test\('/gm) ?? []).length, 5, 'o PU4 precisa continuar com 5 testes');
  for (const evidencia of [
    'Período do relatório',
    'Campo adicional',
    'Fundo complexo',
    'not-measured',
    'fullTextContrastSamples',
    '112 capturas próprias',
    'indeterminateCount',
  ]) {
    assert.ok(pu4.includes(evidencia), `asserção perdida: ${evidencia}`);
  }
  assert.match(pu4, /from '\.\/helpers\/browser-runtime\.mjs'/, 'o PU4 precisa usar o helper');
  assert.doesNotMatch(pu4, /from 'playwright'|from '@sparticuz\/chromium'|from 'node:fs';/,
    'o PU4 não pode voltar a lançar o navegador por conta própria');
});

test('E22: a regra do Windows e o limite de plataforma continuam explícitos', async () => {
  const helper = await read('tests/helpers/browser-runtime.mjs');
  assert.match(helper, /Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome\.exe/,
    'Chrome instalado no Windows precisa continuar sendo o caminho preferido');
  assert.match(helper, /process\.platform === 'win32'/, 'a escolha por plataforma precisa ser explícita');
  assert.equal(browserSkipReason({ platform: 'linux' }), null,
    'Linux x64 é plataforma suportada: nunca skip');
  assert.match(browserSkipReason({ platform: 'darwin' }) ?? '', /Linux-only/,
    'plataforma sem binário precisa de motivo declarado, não de silêncio');
  const script = await read('scripts/ux-evidence-capture.mjs');
  assert.match(script, /process\.platform/, 'a captura precisa seguir declarando a plataforma executada');
  assert.match(script, /path\.resolve\(root, path\.dirname\(entry\.screenshot\)\)/,
    'a normalização de separadores do Windows não pode ser perdida');
});

test('E22: falha de lançamento é erro explícito, nunca skip', async () => {
  await assert.rejects(
    () => launchBrowser({ executablePath: path.join(root, 'chromium-e22-inexistente') }),
    (error) => {
      assert.equal(error.name, 'BrowserPolicyError', 'precisa ser erro de política, não asserção');
      assert.match(error.message, /falha ao lançar o navegador/);
      assert.match(error.message, /test:ux-pro-09e-pu4:browser/, 'a mensagem precisa dizer o que fazer');
      assert.ok(error.code, 'a mensagem precisa reter o código da causa');
      return true;
    },
  );
  await assert.rejects(
    () => launchBrowser({ skipReason: 'plataforma simulada sem navegador', requireBrowser: true }),
    /navegador exigido por UX_PU4_REQUIRE_BROWSER=1/,
    'no gate, indisponibilidade precisa ser falha',
  );
});

test('E22: o gate de navegador escala skip para falha e fica fora do test:unit', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const gate = pkg.scripts['test:ux-pro-09e-pu4:browser'];
  assert.ok(gate, 'o script do gate precisa existir');
  assert.match(gate, /UX_PU4_REQUIRE_BROWSER=1/, 'o gate precisa exigir navegador');
  assert.match(gate, /tests\/ux-pro-09e-pu4\.test\.mjs/, 'o gate precisa rodar o PU4');
  assert.doesNotMatch(pkg.scripts['test:unit'], /UX_PU4_REQUIRE_BROWSER/,
    'o test:unit não pode virar gate de navegador');
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /npm run test:ux-pro-09e-pu4:browser/, 'o CI precisa executar o gate');
});

test('E22: a guarda roda no test:unit e o limite está documentado', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.match(pkg.scripts['test:unit'], /tests\/ux-pro-09e-pu4-hermeticidade\.test\.mjs/,
    'a guarda precisa rodar na suíte local/CI');
  const doc = await read(DOC);
  assert.match(doc, /skip-marcado/, 'o documento precisa declarar o skip marcado');
  assert.match(doc, /fail-explícito/, 'o documento precisa declarar a falha explícita');
  assert.match(doc, /AWS_EXECUTION_ENV/, 'o documento precisa registrar a causa raiz');
  assert.match(doc, /NO-GO/, 'o limite de produção precisa continuar escrito');
});
