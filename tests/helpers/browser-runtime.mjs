// E22 — runtime de navegador hermético para a suíte unitária.
//
// PROBLEMA (E22): `tests/ux-pro-09e-pu4.test.mjs` lançava o Chromium empacotado
// por `@sparticuz/chromium` dentro do `test:unit` e dependia de `AWS_EXECUTION_ENV`
// estar definido no ambiente de quem chamava. Sem essa variável o pacote não
// monta o ambiente AL2023 (não extrai `al2023.tar.br` nem define
// `LD_LIBRARY_PATH`), o binário morre com
// `error while loading shared libraries: libnspr4.so` e a suíte fica vermelha
// por causa do ambiente — indistinguível de regressão de código.
//
// POLÍTICA DE TRÊS ESTADOS, SEMPRE EXPLÍCITA:
//   run           → navegador disponível e lançado; a asserção de fato roda.
//   skip-marcado  → plataforma sem binário suportado (ex.: win32 sem o Google
//                   Chrome instalado, macOS). O motivo é devolvido ao teste, que
//                   marca o skip com texto; nada é aprovado em silêncio.
//   fail-explicit → quando o gate exige navegador (`UX_PU4_REQUIRE_BROWSER=1`)
//                   ou quando o lançamento realmente falha: erro com código,
//                   causa provável e instrução. Skip nunca vira verde.
//
// O runtime é resolvido pelo próprio helper (chamadas abaixo), não pelo ambiente:
// a injeção do marcador AL2023 acontece ANTES do import dinâmico do pacote,
// porque o pacote decide no momento do import se deve chamar
// `setupLambdaEnvironment`.

import { existsSync } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium as playwrightChromium } from 'playwright';

/** Marcador que faz `@sparticuz/chromium` liberar as bibliotecas AL2023. */
export const AL2023_RUNTIME_MARKER = 'AWS_Lambda_nodejs22.x';
/** Variável que escala o gate: nela, navegador indisponível é falha, não skip. */
export const REQUIRE_BROWSER_ENV = 'UX_PU4_REQUIRE_BROWSER';
/** Regra do Windows preservada: se houver Chrome instalado, ele é usado. */
export const WINDOWS_CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export const BROWSER_POLICY = Object.freeze({
  run: 'run',
  skipMarked: 'skip-marcado',
  failExplicit: 'fail-explicit',
});

const EXTRACTION_LOCK = join(tmpdir(), 'seg-e22-chromium-extract.lock');
const EXTRACTION_LOCK_TIMEOUT_MS = 120_000;
const LAUNCH_ATTEMPTS = 3;

/** Erro explícito do runtime: nunca é confundido com falha de asserção. */
export class BrowserPolicyError extends Error {
  constructor(message, { code } = {}) {
    super(message);
    this.name = 'BrowserPolicyError';
    this.code = code;
  }
}

/**
 * Injeta o marcador AL2023 no ambiente do processo, sem sobrescrever o que já
 * existe (no Lambda real a variável vem de fora e continua sendo a fonte).
 * Precisa rodar antes do import de `@sparticuz/chromium`.
 */
export function ensurePackagedRuntime(env = process.env, platform = process.platform) {
  if (platform !== 'linux') return { injected: false, marker: env.AWS_EXECUTION_ENV ?? null };
  if (env.AWS_EXECUTION_ENV) return { injected: false, marker: env.AWS_EXECUTION_ENV };
  env.AWS_EXECUTION_ENV = AL2023_RUNTIME_MARKER;
  return { injected: true, marker: AL2023_RUNTIME_MARKER };
}

let packagedModulePromise;

/** Carrega o pacote depois da injeção — o import dinâmico é obrigatório aqui. */
export async function loadPackagedModule() {
  ensurePackagedRuntime();
  packagedModulePromise ??= import('@sparticuz/chromium');
  return packagedModulePromise;
}

/**
 * Motivo para pular, ou `null` quando o navegador deve rodar.
 * Só limitação determinística de plataforma justifica skip; falta de biblioteca
 * em plataforma suportada é falha explícita, não skip.
 */
export function browserSkipReason({ platform = process.platform } = {}) {
  if (platform === 'win32') {
    return existsSync(WINDOWS_CHROME_PATH)
      ? null
      : `win32 sem Google Chrome instalado em ${WINDOWS_CHROME_PATH}; o Chromium empacotado é Linux-only`;
  }
  if (platform === 'linux') return null;
  return `plataforma ${platform} sem Chromium empacotado; o binário do @sparticuz/chromium é Linux-only`;
}

function packagedBinDirectory() {
  const entry = fileURLToPath(import.meta.resolve('@sparticuz/chromium'));
  return resolvePath(dirname(entry), '..', 'bin');
}

/**
 * Serializa a extração. O `inflate` do pacote checa `existsSync` e só depois
 * escreve; dois processos de teste em paralelo (a suíte roda arquivos em
 * processos separados) escreveriam o mesmo `/tmp/chromium` e o spawn falharia
 * com `ETXTBSY`. O lock é um diretório e tem prazo, então lock órfão não trava.
 */
async function withExtractionLock(task) {
  const deadline = Date.now() + EXTRACTION_LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      await mkdir(EXTRACTION_LOCK);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const info = await stat(EXTRACTION_LOCK);
        if (Date.now() - info.mtimeMs > EXTRACTION_LOCK_TIMEOUT_MS) {
          await rm(EXTRACTION_LOCK, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() > deadline) {
        throw new BrowserPolicyError(
          `extração do Chromium empacotado não liberou o lock ${EXTRACTION_LOCK} em ${EXTRACTION_LOCK_TIMEOUT_MS} ms`,
          { code: 'extraction_lock_timeout' },
        );
      }
      await delay(100);
    }
  }
  try {
    return await task();
  } finally {
    await rm(EXTRACTION_LOCK, { recursive: true, force: true });
  }
}

/** Caminho do binário empacotado, com as bibliotecas AL2023 garantidas. */
export async function resolvePackagedExecutable() {
  const chromium = await loadPackagedModule();
  const libraries = join(tmpdir(), 'al2023', 'lib', 'libnspr4.so');
  return withExtractionLock(async () => {
    // `/tmp/chromium` pode existir de uma execução anterior sem AL2023; nesse
    // caso o pacote não extrairia as bibliotecas e o lançamento falharia.
    if (!existsSync(libraries)) {
      await chromium.inflate(join(packagedBinDirectory(), 'al2023.tar.br'));
    }
    return chromium.default.executablePath();
  });
}

/**
 * Lança o navegador conforme a política e devolve
 * `{ status, browser, reason }` — `browser` é `null` apenas em `skip-marcado`.
 */
export async function launchBrowser(options = {}) {
  const {
    executablePath,
    requireBrowser = process.env[REQUIRE_BROWSER_ENV] === '1',
    skipReason = executablePath ? null : browserSkipReason(),
    headless = true,
  } = options;

  if (skipReason) {
    if (requireBrowser) {
      throw new BrowserPolicyError(
        `navegador exigido por ${REQUIRE_BROWSER_ENV}=1, mas indisponível: ${skipReason}`,
        { code: 'browser_unavailable' },
      );
    }
    return { status: BROWSER_POLICY.skipMarked, browser: null, reason: skipReason };
  }

  const launchOptions = executablePath
    ? { executablePath }
    : process.platform === 'win32'
      ? { executablePath: WINDOWS_CHROME_PATH }
      : { args: (await loadPackagedModule()).default.args, executablePath: await resolvePackagedExecutable() };

  for (let attempt = 1; attempt <= LAUNCH_ATTEMPTS; attempt += 1) {
    try {
      const browser = await playwrightChromium.launch({ ...launchOptions, headless });
      return { status: BROWSER_POLICY.run, browser, reason: null };
    } catch (error) {
      const code = error?.code ?? 'erro';
      // ETXTBSY: binário ainda sendo escrito por outra extração. Re-tentar é
      // seguro porque o lock garante que a escrita termina.
      if (code === 'ETXTBSY' && attempt < LAUNCH_ATTEMPTS) {
        await delay(250 * attempt);
        continue;
      }
      const firstLine = String(error?.message ?? '').split('\n')[0];
      throw new BrowserPolicyError(
        `falha ao lançar o navegador (${code}): ${firstLine}. ` +
          'Se a causa for libnspr4/libnss3, as bibliotecas AL2023 não foram extraídas: ' +
          "rode `npm run test:ux-pro-09e-pu4:browser` em Linux x64 e, se persistir, " +
          'limpe /tmp/chromium e /tmp/al2023 e repita.',
        { code },
      );
    }
  }
  // Inalcançável: o laço ou devolve o navegador ou lança erro explícito.
  throw new BrowserPolicyError('falha ao lançar o navegador', { code: 'unreachable' });
}
