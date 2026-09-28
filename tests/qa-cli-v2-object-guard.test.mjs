import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const runner = fileURLToPath(new URL('../scripts/qa-cli-v2-postgres.mjs', import.meta.url));
const cwd = path.dirname(path.dirname(runner));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'CLIENT_DOCS_DIR', 'ALLOW_REMOTE_MIGRATIONS', 'RUN_DATABASE_INTEGRATION_REMOTE'].includes(key)));

test('PLT-BAK-001: PG QA de objetos recusa URL de operador e diretório externo antes do cluster', () => {
  for (const extra of [
    { DATABASE_URL: 'postgresql://example.invalid/operator' },
    { DATABASE_MIGRATION_URL: 'postgresql://example.invalid/operator' },
    { CLIENT_DOCS_DIR: '/operator/private-docs' },
  ]) {
    const run = spawnSync(process.execPath, [runner], {
      cwd, env: { ...env, QA_CLI_V2_OBJECT_CONTRACT: '1', ...extra }, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /QA_CLI_V2_REFUSED/);
    assert.doesNotMatch(run.stdout + run.stderr, /QA_CLI_V2_READY/);
  }
});
