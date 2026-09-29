import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmdirSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function uniquePath() {
  const dir = mkdtempSync(path.join(tmpdir(), 'seg-demo-qa-'));
  rmdirSync(dir);
  return dir;
}
function run(dir, action, extra = {}) {
  return spawnSync(process.execPath, ['scripts/local-demo.mjs', action], {
    cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8', timeout: 10_000,
    env: { PATH: process.env.PATH || '', HOME: process.env.HOME || '',
      TEMP: process.env.TEMP || '', TMP: process.env.TMP || '', TMPDIR: process.env.TMPDIR || '',
      SystemRoot: process.env.SystemRoot || '', USERPROFILE: process.env.USERPROFILE || '',
      SEG_DEMO_TEST_MODE: '1', SEG_DEMO_TEST_DIR: dir, SEG_DEMO_WEB_PORT: '31993', ...extra },
  });
}
test('QA-HOM-008: unsafe operator DB and unknown flags fail before any data directory', () => {
  for (const [flag, extra, reason] of [
    ['--init', { DATABASE_URL: 'postgresql://127.0.0.1:5432/operator' }, 'demo_env_refused_DATABASE_URL'],
    ['--init', { MAIL_HOST: 'smtp.example.invalid' }, 'demo_env_refused_MAIL_HOST'],
    ['--reset', {}, 'demo_usage_refused'],
  ]) {
    const dir = uniquePath();
    const result = run(dir, flag, extra);
    assert.equal(result.status, 1);
    assert.equal(existsSync(dir), false);
    assert.match(result.stderr, new RegExp(reason));
  }
});
test('QA-HOM-008: missing state and pre-existing incomplete folder are never initialised implicitly', () => {
  const missing = uniquePath();
  const absent = run(missing, '--start');
  assert.equal(absent.status, 1);
  assert.match(absent.stderr, /demo_directory_missing_or_symlink/);
  assert.equal(existsSync(missing), false);
  const existing = uniquePath(); mkdirSync(existing);
  try {
    const refused = run(existing, '--init');
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /demo_directory_exists/);
    assert.deepEqual(readdirSync(existing), []);
  } finally { rmdirSync(existing); }
});
