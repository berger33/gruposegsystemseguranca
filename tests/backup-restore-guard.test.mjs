import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const runner = fileURLToPath(new URL('../scripts/qa-backup-restore-postgres.mjs', import.meta.url));
const cwd = path.dirname(path.dirname(runner));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'ALLOW_REMOTE_MIGRATIONS', 'RUN_DATABASE_INTEGRATION_REMOTE'].includes(key)));

test('PLT-BAK-001: runner recusa URL de operador antes de iniciar um cluster', () => {
  const run = spawnSync(process.execPath, [runner], {
    cwd, env: { ...env, DATABASE_URL: 'postgresql://example.invalid/operator' }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /QA_RESTORE_REFUSED/);
  assert.doesNotMatch(run.stdout + run.stderr, /QA_RESTORE_READY/);
});

test('PLT-BAK-001: runner de arquivos recusa diretório externo antes de criar banco', () => {
  const run = spawnSync(process.execPath, [runner], {
    cwd, env: { ...env, QA_RESTORE_INCLUDE_SYNTHETIC_FILE: '1', CLIENT_DOCS_DIR: '/operator/private-docs' },
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /QA_RESTORE_REFUSED.*CLIENT_DOCS_DIR/);
  assert.doesNotMatch(run.stdout + run.stderr, /QA_RESTORE_READY/);
});

test('PLT-BAK-001: HTTP restaurado exige arquivo e dois clusters QA antes de criar banco', () => {
  for (const flags of [
    { QA_RESTORE_VERIFY_HTTP: '1', QA_RESTORE_SEPARATE_CLUSTERS: '1' },
    { QA_RESTORE_VERIFY_HTTP: '1', QA_RESTORE_INCLUDE_SYNTHETIC_FILE: '1' },
  ]) {
    const run = spawnSync(process.execPath, [runner], {
      cwd, env: { ...env, QA_RESTORE_SEPARATE_CLUSTERS: '', QA_RESTORE_INCLUDE_SYNTHETIC_FILE: '', ...flags },
      encoding: 'utf8', timeout: 10000,
    });
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /QA_RESTORE_REFUSED.*HTTP download/);
    assert.doesNotMatch(run.stdout + run.stderr, /QA_RESTORE_READY/);
  }
});

test('PLT-BAK-001: coadulteração só é permitida em pacote sintético de dois clusters', () => {
  const run = spawnSync(process.execPath, [runner], {
    cwd, env: { ...env, QA_RESTORE_SEPARATE_CLUSTERS: '', QA_RESTORE_INCLUDE_SYNTHETIC_FILE: '',
      QA_RESTORE_INJECT_COTAMPER: '1' }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /QA_RESTORE_REFUSED.*co-tamper/);
  assert.doesNotMatch(run.stdout + run.stderr, /QA_RESTORE_READY/);
});

test('PLT-BAK-001: assinatura QA requer pacote e dois clusters; injeção exige assinatura', () => {
  for (const flags of [
    { QA_RESTORE_VERIFY_SIGNATURE: '1', QA_RESTORE_SEPARATE_CLUSTERS: '1' },
    { QA_RESTORE_VERIFY_SIGNATURE: '1', QA_RESTORE_INCLUDE_SYNTHETIC_FILE: '1' },
    { QA_RESTORE_INJECT_SIGNED_COTAMPER: '1' },
  ]) {
    const run = spawnSync(process.execPath, [runner], {
      cwd, env: { ...env, QA_RESTORE_SEPARATE_CLUSTERS: '', QA_RESTORE_INCLUDE_SYNTHETIC_FILE: '',
        QA_RESTORE_VERIFY_SIGNATURE: '', ...flags }, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /QA_RESTORE_REFUSED.*signed manifest QA/);
    assert.doesNotMatch(run.stdout + run.stderr, /QA_RESTORE_READY/);
  }
});

test('PLT-BAK-001: inventário QA recusa ausência de assinatura/escopo e full isolado', () => {
  for (const flags of [
    { QA_RESTORE_VERIFY_INVENTORY: '1' },
    { QA_RESTORE_REQUIRE_FULL_COVERAGE: '1' },
    { QA_RESTORE_INVENTORY_INJECT_MISSING: '1' },
  ]) {
    const run = spawnSync(process.execPath, [runner], {
      cwd, env: { ...env, QA_RESTORE_VERIFY_SIGNATURE: '', QA_RESTORE_VERIFY_INVENTORY: '',
        QA_RESTORE_SEPARATE_CLUSTERS: '', QA_RESTORE_INCLUDE_SYNTHETIC_FILE: '', ...flags },
      encoding: 'utf8', timeout: 10000,
    });
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /QA_RESTORE_REFUSED.*inventory QA/);
    assert.doesNotMatch(run.stdout + run.stderr, /QA_RESTORE_READY/);
  }
});

test('PLT-BAK-001: CLI v2 QA exige clusters/arquivo/assinatura/HTTP antes de iniciar banco', () => {
  for (const flags of [
    { QA_RESTORE_INCLUDE_CLI_V2_OBJECTS: '1' },
    { QA_RESTORE_INJECT_CLI_V2_COTAMPER: '1' },
    { QA_RESTORE_INJECT_CLI_V2_PARTIAL: '1' },
  ]) {
    const run = spawnSync(process.execPath, [runner], {
      cwd, env: { ...env, QA_RESTORE_SEPARATE_CLUSTERS: '', QA_RESTORE_INCLUDE_SYNTHETIC_FILE: '',
        QA_RESTORE_VERIFY_SIGNATURE: '', QA_RESTORE_VERIFY_HTTP: '', ...flags },
      encoding: 'utf8', timeout: 10000,
    });
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /QA_RESTORE_REFUSED.*CLI v2 objects/);
    assert.doesNotMatch(run.stdout + run.stderr, /QA_RESTORE_READY/);
  }
});

test('PLT-BAK-001: duas falhas CLI simultâneas são recusadas antes do banco', () => {
  const run = spawnSync(process.execPath, [runner], {
    cwd, env: { ...env, QA_RESTORE_SEPARATE_CLUSTERS: '1', QA_RESTORE_INCLUDE_SYNTHETIC_FILE: '1',
      QA_RESTORE_VERIFY_SIGNATURE: '1', QA_RESTORE_VERIFY_HTTP: '1',
      QA_RESTORE_INCLUDE_CLI_V2_OBJECTS: '1', QA_RESTORE_INJECT_CLI_V2_COTAMPER: '1',
      QA_RESTORE_INJECT_CLI_V2_PARTIAL: '1' }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /QA_RESTORE_REFUSED.*exclusive mode/);
  assert.doesNotMatch(run.stdout + run.stderr, /QA_RESTORE_READY/);
});

test('PLT-BAK-001: runner recusa binários indisponíveis antes de criar banco', () => {
  const run = spawnSync(process.execPath, [runner], {
    cwd, env: { ...env, QA_PG_DUMP_BIN: '/nonexistent/qa-pg-dump-17', QA_PG_RESTORE_BIN: '/nonexistent/qa-pg-restore-17' },
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /QA_RESTORE_CLIENT_MISSING_OR_INCOMPATIBLE/);
  assert.doesNotMatch(run.stdout + run.stderr, /QA_RESTORE_READY/);
});
