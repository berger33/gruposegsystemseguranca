import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const cwd = path.resolve(import.meta.dirname, '..');
const runner = 'scripts/qa-homologacao-local.mjs';
const names = ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'CLIENT_DOCS_DIR',
  'SITE_ADMIN_TOKEN_TI', 'OLLAMA_HOST', 'QA_PGLITE_ONLY'];

test('QA-HOM-001 preflight accepts only clean local input (no server or DB started)', () => {
  const env = { ...process.env };
  for (const name of names) delete env[name];
  const result = spawnSync(process.execPath, [runner, '--preflight'], { cwd, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /QA_HOM_PREFLIGHT/);
});

for (const name of names) test(`QA-HOM-001 rejects inherited ${name} before DB startup`, () => {
  const env = { ...process.env };
  for (const key of names) delete env[key];
  env[name] = name === 'DATABASE_URL' ? 'postgres://example.invalid/db' : 'untrusted';
  const result = spawnSync(process.execPath, [runner, '--preflight'], { cwd, env, encoding: 'utf8' });
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stderr, new RegExp(`qa_env_refused_${name}`));
  assert.doesNotMatch(result.stdout + result.stderr, /postgres:\/\/example\.invalid/);
});
