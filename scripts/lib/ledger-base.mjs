// Proveniência limitada da fotografia do ledger. Não usa rede nem altera refs.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SHA = /^[0-9a-f]{40}$/;
export const LEDGER_PATH = 'docs/STATUS-VIGENTE.md';
const git = (root, args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

export function mainTips(root, env = process.env) {
  const tips = new Set();
  const add = value => { if (SHA.test(value ?? '')) tips.add(value); };
  if (env.GITHUB_EVENT_PATH) {
    try {
      const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
      if (env.GITHUB_REF === 'refs/heads/main') add(event.after ?? env.GITHUB_SHA);
      add(event.pull_request?.base?.sha);
    } catch { /* sem evento legível, usar refs disponíveis */ }
  }
  // O evento é autoritativo; um ref local velho não pode ampliar a exceção.
  if (tips.size) return [...tips];
  for (const ref of ['origin/main', 'main']) {
    try { add(git(root, ['rev-parse', '--verify', ref])); } catch { /* checkout raso */ }
  }
  return [...tips];
}

export function checkLedgerBase({ root, base, ledger, tips = mainTips(root) }) {
  if (!SHA.test(base ?? '')) return { ok: false, reason: 'invalid-base' };
  const known = tips.filter(tip => SHA.test(tip));
  if (!known.length) return { ok: false, reason: 'no-main-tip' };
  if (known.includes(base)) return { ok: true, reason: 'main-tip' };
  for (const tip of known) {
    try {
      // cat-file lê os pais reais mesmo quando rev-list oculta a fronteira rasa.
      const commit = git(root, ['cat-file', '-p', tip]);
      const headers = commit.split('\n\n')[0];
      const parents = [...headers.matchAll(/^parent ([0-9a-f]{40})$/gm)].map(m => m[1]);
      if (parents.length !== 2 || parents[0] !== base) continue;
      // A tolerância só vale para o merge que contém ESTA fotografia.
      // Não basta ser ancestral ou segundo pai; não há caminhada recursiva.
      const published = git(root, ['show', `${tip}:${LEDGER_PATH}`]);
      if (published !== ledger.trim()) continue;
      return { ok: true, reason: 'publishing-merge', tip };
    } catch { /* objeto ausente não é prova; rejeitar essa alternativa */ }
  }
  return { ok: false, reason: 'stale-or-unproven-base' };
}
