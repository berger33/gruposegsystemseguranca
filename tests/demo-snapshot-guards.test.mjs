import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function run(args, extra = {}) {
  return spawnSync(process.execPath, ['scripts/demo-offline-snapshot.mjs', ...args], {
    cwd: path.resolve(import.meta.dirname, '..'), encoding:'utf8', timeout:10_000,
    env: { PATH:process.env.PATH || '', HOME:process.env.HOME || '', TEMP:process.env.TEMP || '',
      TMP:process.env.TMP || '', TMPDIR:process.env.TMPDIR || '',
      SystemRoot:process.env.SystemRoot || '', USERPROFILE:process.env.USERPROFILE || '',
      SEG_DEMO_TEST_MODE:'1', SEG_DEMO_TEST_DIR:path.join(tmpdir(),'seg-demo-qa-not-created'), ...extra },
  });
}
test('QA-HOM-009: backup CLI refuses operator DB, SMTP and unknown action before writing', () => {
  for (const [action,extra,expected] of [
    [['--backup',path.join(tmpdir(),'seg-demo-qa-test-archive')], {DATABASE_URL:'postgresql://127.0.0.1:5432/operator'}, 'snapshot_env_refused_DATABASE_URL'],
    [['--backup',path.join(tmpdir(),'seg-demo-qa-test-archive')], {MAIL_HOST:'smtp.example.invalid'}, 'snapshot_env_refused_MAIL_HOST'],
    [['--erase',path.join(tmpdir(),'seg-demo-qa-test-archive')], {}, 'snapshot_usage_refused'],
  ]) {
    const result=run(action,extra);
    assert.equal(result.status,1);
    assert.match(result.stderr,new RegExp(expected));
  }
});
test('QA-HOM-009: restore never overwrites an existing destination', () => {
  const dir=mkdtempSync(path.join(tmpdir(),'seg-demo-qa-existing-'));
  try {
    const result=run(['--restore-copy',path.join(tmpdir(),'seg-demo-qa-missing-archive'),dir]);
    assert.equal(result.status,1);
    assert.match(result.stderr,/snapshot_destination_exists_no_overwrite/);
    assert.deepEqual(readdirSync(dir),[]);
  } finally { rmdirSync(dir); }
});
