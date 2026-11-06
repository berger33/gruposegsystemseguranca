import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { auditPublicTap, publicMinimum } from '../scripts/lib/qa-public-tap-audit.mjs';

const tap = ({ count = 6, skip = false, fail = false, todo = false } = {}) => {
  const rows = Array.from({ length: count }, (_, i) => `${fail && i === 0 ? 'not ok' : 'ok'} ${i + 1} - caso ${i + 1}${skip ? ' # SKIP' : todo && i === 0 ? ' # TODO futuro' : ''}`).join('\n');
  return `TAP version 13\n${rows}\n1..${count}\n# tests ${count}\n# suites 0\n# pass ${skip ? 0 : count - (fail ? 1 : 0)}\n# fail ${fail ? 1 : 0}\n# cancelled 0\n# skipped ${skip ? count : 0}\n# todo ${todo ? 1 : 0}\n`;
};

test('auditor público aceita TAP completo e fixa os pisos dos quatro workflows e integral', () => {
  for (const [pattern, count] of [['',24], ['E6 grupo 1',6], ['E6 grupo 2',7], ['E6 grupo 3',6], ['UX-PRO-10B previas',5], ['caso individual',1]]) {
    assert.equal(publicMinimum(pattern), count);
    assert.deepEqual(auditPublicTap(tap({ count }), { pattern }).problems, []);
    assert.deepEqual(auditPublicTap(tap({ count, skip:true }), { pattern, probe:true }).problems, []);
    if (count > 1) assert.ok(auditPublicTap(tap({ count:count-1 }), { pattern }).problems.length);
  }
});

test('auditor público recusa saída parcial, falha, skip, todo, ausência e resumo duplicado', () => {
  for (const output of ['', tap({ fail:true }), tap({ skip:true }), tap({ todo:true }), tap().replace('# cancelled 0\n',''), tap()+'# pass 6\n', tap().replace('# tests 6','# tests 7')]) {
    assert.ok(auditPublicTap(output, { pattern:'E6 grupo 1' }).problems.length, output);
  }
  assert.ok(auditPublicTap(tap(), { pattern:'E6 grupo 1', truncated:true }).problems.includes('output_limit'));
  assert.ok(auditPublicTap(tap(), { pattern:'E6 grupo 1', probe:true }).problems.includes('probe_not_all_skipped'));
});

test('auditor público rejeita casos reais pulados e a falsa aprovação do arquivo sem correspondência', () => {
  const env = { ...process.env, RUN_DATABASE_INTEGRATION:'', DATABASE_URL:'', DATABASE_MIGRATION_URL:'', RUN_DATABASE_INTEGRATION_REMOTE:'' };
  delete env.NODE_TEST_CONTEXT;
  const file = path.resolve(import.meta.dirname, 'ux-public-routes.integration.test.mjs');
  const run = pattern => spawnSync(process.execPath, ['--test','--test-concurrency=1','--test-reporter=tap','--test-name-pattern',pattern,file], { env, encoding:'utf8', timeout:20_000 });
  const missing = run('qa_sem_casos_06a_776');
  assert.equal(missing.status, 0); assert.match(missing.stdout, /# tests 1\b/);
  assert.ok(auditPublicTap(missing.stdout, { pattern:'qa_sem_casos_06a_776' }).problems.length);
  assert.ok(auditPublicTap(missing.stdout, { pattern:'qa_sem_casos_06a_776', probe:true }).problems.length);
  const skipped = run('E6 grupo 1');
  assert.equal(skipped.status, 0); assert.match(skipped.stdout, /# skipped 6\b/);
  assert.ok(auditPublicTap(skipped.stdout, { pattern:'E6 grupo 1' }).problems.length);
  assert.deepEqual(auditPublicTap(skipped.stdout, { pattern:'E6 grupo 1', probe:true }).problems, []);
});

test('auditor público está ligado antes do banco e após a execução, nos quatro workflows', async () => {
  const { readFile } = await import('node:fs/promises');
  const runner = await readFile(new URL('../scripts/qa-ux-public-routes-postgres.mjs', import.meta.url), 'utf8');
  assert.ok(runner.indexOf('QA_PUBLIC_SELECTION_REFUSED') < runner.indexOf("await import('embedded-postgres')"));
  assert.match(runner, /delete childEnv.NODE_TEST_CONTEXT/);
  assert.match(runner, /auditPublicTap\(execution.output/);
  assert.match(runner, /result = execution.code \|\| \(audit.problems.length \? 1 : 0\)/);
  assert.match(runner, /2 \* 1024 \* 1024/);
  for (const name of ['ux-public-routes-delivery.yml','ux-public-routes-group2-delivery.yml','ux-public-routes-group3-delivery.yml','ux-layout-previews-a11y-delivery.yml']) {
    const workflow = await readFile(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
    assert.ok(workflow.includes("'scripts/lib/qa-public-tap-audit.mjs'"), name);
    assert.ok(workflow.includes("'tests/qa-public-tap-audit.test.mjs'"), name);
    assert.ok(workflow.indexOf('node --test tests/qa-public-tap-audit.test.mjs') < workflow.indexOf('node scripts/qa-ux-public-routes-postgres.mjs'), name);
  }
});

test('runner público recusa seleção vazia e regex inválida antes de criar banco', async t => {
  const { mkdtemp, readdir, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const directory = await mkdtemp(path.join(tmpdir(), 'seg-public-probe-test-'));
  t.after(() => rm(directory, { recursive:true, force:true }));
  const runner = path.resolve(import.meta.dirname, '../scripts/qa-ux-public-routes-postgres.mjs');
  for (const pattern of ['qa_sem_casos_06a_776', '[']) {
    const env = { ...process.env, TMPDIR:directory, DATABASE_URL:'', DATABASE_MIGRATION_URL:'', RUN_DATABASE_INTEGRATION_REMOTE:'', UX_PUBLIC_TEST_PATTERN:pattern };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [runner], { env, encoding:'utf8', timeout:20_000 });
    assert.equal(result.status, 1, result.stderr); assert.match(result.stderr, /QA_PUBLIC_SELECTION_REFUSED/);
    assert.doesNotMatch(result.stdout, /QA_PUBLIC_PG_READY|UX_PUBLIC_TAP_AUDIT:.*PASS/);
    if (process.platform !== 'win32') assert.match(result.stdout, /QA_PUBLIC_PG_TEMP_CLEANED: true/);
    assert.deepEqual(await readdir(directory), []);
  }
});
