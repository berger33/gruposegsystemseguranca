/**
 * Fatia 06B — auditor TAP genérico para gates PostgreSQL reaproveitados.
 *
 * Motivo medido: `qa-staff-auth-postgres.mjs`, `qa-tenant-postgres.mjs` e
 * `qa-cli-v2-postgres.mjs` lançavam o arquivo de integração com `stdio:
 * 'inherit'` e propagavam apenas o exit code. Um arquivo inteiro marcado como
 * `skip` (opt-in não satisfeito, por exemplo) sai com código 0 e o gate
 * apareceria verde sem executar cenário algum — o mesmo falso positivo que a
 * fatia 06A mediu nas rotas públicas.
 *
 * Isto NÃO substitui o TAP de cada jornada: só recusa resumo ausente,
 * duplicado, truncado, com skip/cancelamento/falha/todo, com contagem
 * incoerente ou abaixo do piso declarado pelo runner.
 */
const COUNTERS = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
// Node 22 conta subtestes em `# tests`; uma linha sintética com o nome do
// arquivo não é cenário. O piso do runner é sobre a contagem de console.
const NAMED = /^(?:not ok|ok) (\d+) - (.+)$/gm;

export const TAP_LIMIT = 2 * 1024 * 1024;

/**
 * Reencaminha stdout/stderr do filho e guarda cópia limitada do stdout para
 * auditoria. Nunca esconde a saída: o log do gate continua completo no CI.
 */
export function collectTap(child, { limit = TAP_LIMIT } = {}) {
  let output = '';
  let truncated = false;
  const take = (chunk) => {
    const text = chunk.toString();
    if (output.length >= limit) { truncated = true; return; }
    const room = limit - output.length;
    if (text.length > room) { truncated = true; output += text.slice(0, room); }
    else output += text;
  };
  if (child.stdout) child.stdout.on('data', (chunk) => { take(chunk); process.stdout.write(chunk); });
  if (child.stderr) child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code: code ?? 1, output, truncated }));
  });
}

/**
 * Audita o resumo TAP. Devolve `problems` vazio só quando há um resumo único e
 * coerente, sem skip/cancelamento/falha/todo, com contagem mínima satisfeita.
 */
export function auditTapSummary(output, { minimum = 1, truncated = false } = {}) {
  const problems = [];
  if (truncated) problems.push('output_limit');
  const counters = {};
  for (const name of COUNTERS) {
    const matches = [...output.matchAll(new RegExp(`^# ${name} (\\d+)\\s*$`, 'gm'))];
    if (matches.length !== 1) problems.push(`counter_${name}`);
    else counters[name] = Number(matches[0][1]);
  }
  const named = [...output.matchAll(NAMED)];
  if (named.length === 0) problems.push('sem_cenario_nomeado');
  if (named.some((match) => match[1] === 'not ok')) problems.push('falha');
  if (problems.includes('counter_tests')) {
    return { problems, tests: null };
  }
  if (counters.tests === undefined) return { problems, tests: null };
  if (counters.tests < minimum) problems.push('abaixo_do_piso');
  if (counters.fail !== 0) problems.push('fail');
  if (counters.cancelled !== 0) problems.push('cancelled');
  if (counters.skipped !== 0) problems.push('skipped');
  if (counters.todo !== 0) problems.push('todo');
  if (counters.pass !== counters.tests) problems.push('pass_diferente_de_tests');
  return { problems: [...new Set(problems)], tests: counters.tests };
}

/** Auditoria + mensagens padronizadas, para reaproveitar nos runners. */
export function assertTapSummary(output, { minimum, truncated, label }) {
  const audit = auditTapSummary(output, { minimum, truncated });
  if (audit.problems.length) {
    console.error(`QA_TAP_REFUSED: ${label} recusou o resumo TAP (${audit.problems.join(', ')}); piso ${minimum}.`);
    return { ok: false, tests: audit.tests };
  }
  console.log(`QA_TAP_OK: ${label} ${audit.tests} casos no resumo; pass=tests, 0 skip/fail/todo/cancelado; piso ${minimum}.`);
  return { ok: true, tests: audit.tests };
}

/**
 * Remove comentários de bloco e linhas iniciadas por `//` antes de inspecionar
 * código-fonte de runner. Comentário não executa jornada nem audita TAP (falso
 * positivo já medido na fatia 06B).
 */
export function stripRunnerComments(source) {
  return String(source ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

/**
 * Detecção estática (sem executar nada) de auditoria do resumo TAP em um runner
 * `scripts/*.mjs`.
 *
 * Classes devolvidas em `tapAudit`:
 *   - `nao_aplicavel`: o runner não invoca `node --test` (migrações SQL,
 *     backup/restore, PGlite WASM, inventários e guardas estáticas);
 *   - `auditado_tap`: captura a saída do filho (`collectTap` ou `stdio` com
 *     `pipe`), audita os contadores do resumo TAP (`qa-tap-summary.mjs`,
 *     `qa-public-tap-audit.mjs` ou auditor inline de `pass`/`fail`/`skipped`/
 *     `todo` que reprova o exit code) e impõe piso numérico positivo (`>= 1`,
 *     contando piso condicional pelo MENOR valor);
 *   - `sem_auditoria_tap`: invoca `node --test`, mas propaga apenas o exit code
 *     (`stdio: 'inherit'`), declara constante de piso sem auditar o resumo, ou
 *     admite caminho condicional com piso `< 1`.
 */
export function detectRunnerTapAudit(source) {
  const code = stripRunnerComments(source);
  const spawnsChild = /\b(?:spawn|spawnSync|execFile|execFileSync)\s*\(/.test(code);
  const passesTestFlag = /['"]--test['"]|\bnode\s+--test\b/.test(code);
  const executesNodeTest = spawnsChild && passesTestFlag;
  if (!executesNodeTest) {
    return { executesNodeTest: false, tapAudit: 'nao_aplicavel', mode: null, floor: null };
  }

  const floors = [];
  for (const match of code.matchAll(/\b(?:MINIMUM_CASES|MINIMO)\s*=\s*(\d+)/g)) {
    floors.push(Number(match[1]));
  }
  for (const match of code.matchAll(/\b(?:minimum|minimumCases)\s*:\s*([^,})\n]{1,120})/g)) {
    for (const value of match[1].matchAll(/\b(\d+)\b/g)) floors.push(Number(value[1]));
  }
  for (const match of code.matchAll(/\bpass\s*<\s*(\d+)/g)) {
    floors.push(Number(match[1]));
  }

  const usesPublicTap = /qa-public-tap-audit\.mjs/.test(code) && /\bauditPublicTap\s*\(/.test(code);
  if (usesPublicTap && floors.length === 0) floors.push(5);

  const floor = floors.length ? Math.min(...floors) : null;
  const capturesOutput = /\bcollectTap\s*\(/.test(code) || /stdio\s*:\s*[^;\n]*['"]pipe['"]/.test(code);
  const usesQaTapSummary = /qa-tap-summary\.mjs/.test(code) && (
    (/\bassertTapSummary\s*\(/.test(code) && (/\.\s*ok\b/.test(code) || /\{\s*ok\b/.test(code)))
    || (/\bauditTapSummary\s*\(/.test(code) && /\.\s*problems\b/.test(code))
  );
  const inlineCountersRequired = ['pass', 'fail', 'skipped', 'todo'];
  const checksInlineCounters = inlineCountersRequired.every((counter) => (
    new RegExp(`['"]${counter}['"]|# ${counter}\\b`).test(code)
  )) && /(?:result|exitCode)\s*=\s*(?:result\s*\|\|\s*)?1\b/.test(code);

  const mode = usesQaTapSummary
    ? 'qa-tap-summary'
    : usesPublicTap
      ? 'qa-public-tap-audit'
      : checksInlineCounters
        ? 'inline-tap'
        : null;

  const audited = capturesOutput && mode !== null && floor !== null && floor >= 1;
  return {
    executesNodeTest: true,
    tapAudit: audited ? 'auditado_tap' : 'sem_auditoria_tap',
    mode: audited ? mode : null,
    floor,
  };
}
