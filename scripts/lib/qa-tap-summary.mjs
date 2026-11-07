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
