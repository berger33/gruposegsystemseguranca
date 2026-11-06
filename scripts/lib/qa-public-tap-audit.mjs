// Auditor restrito ao TAP do arquivo de rotas públicas (Node 22, execução serial).
// A presença de um nome de arquivo como único "teste" não comprova um cenário.
const SYNTHETIC_FILE = /(?:^|[\\/])ux-public-routes\.integration\.test\.mjs$/;
const COUNTERS = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
const FLOORS = new Map([
  ['', 24], ['E6 grupo 1', 6], ['E6 grupo 2', 7],
  ['E6 grupo 3', 6], ['UX-PRO-10B previas', 5],
]);

export function publicMinimum(pattern) {
  return FLOORS.get(pattern || '') ?? 1;
}

// `probe` é apenas descoberta sem banco: todos os cenários selecionados devem
// estar marcados SKIP. Nunca é evidência de execução dos cenários.
export function auditPublicTap(output, { pattern = '', probe = false, truncated = false } = {}) {
  const problems = [];
  if (truncated) problems.push('output_limit');
  const counters = {};
  for (const name of COUNTERS) {
    const matches = [...output.matchAll(new RegExp(`^# ${name} (\\d+)\\s*$`, 'gm'))];
    if (matches.length !== 1) problems.push(`counter_${name}`);
    else counters[name] = Number(matches[0][1]);
  }
  const results = [...output.matchAll(/^(not ok|ok) (\d+) - (.+)$/gm)];
  const real = results.filter(match => !SYNTHETIC_FILE.test(match[3].trim()));
  const skips = real.filter(match => /\s#\s*SKIP(?:\s|$)/i.test(match[3]));
  if (results.length !== real.length || real.length < publicMinimum(pattern)) problems.push('named_scenarios_below_floor');
  if (real.some(match => match[1] !== 'ok' || /\s#\s*TODO(?:\s|$)/i.test(match[3]))) problems.push('failed_or_todo');
  if (counters.tests !== real.length || counters.fail !== 0 || counters.cancelled !== 0 || counters.todo !== 0) problems.push('summary_mismatch');
  if (probe) {
    if (counters.pass !== 0 || counters.skipped !== real.length || skips.length !== real.length) problems.push('probe_not_all_skipped');
  } else if (counters.pass !== real.length || counters.skipped !== 0 || skips.length !== 0) {
    problems.push('partial_or_skipped');
  }
  return { problems, named: real.length, minimum: publicMinimum(pattern) };
}
