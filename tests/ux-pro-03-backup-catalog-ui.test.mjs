import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ti = new URL('../src/app/admin/ti/', import.meta.url);
const client = await readFile(new URL('BackupClient.tsx', ti), 'utf8');
const consoleClient = await readFile(new URL('TiConsole.tsx', ti), 'utf8');
const styles = await readFile(new URL('BackupCatalog.module.css', ti), 'utf8');
const api = await readFile(new URL('../src/server/backup-api.mjs', import.meta.url), 'utf8');

test('UX-PRO-03 backup: improves only the already mounted TI catalog', () => {
  assert.match(consoleClient, /active==='backup'&&<BackupClient\/>/);
  assert.match(consoleClient, /\['backup','Catálogo de backups'\]/);
  assert.match(api, /\['admin','ti'\]\.includes\(session\.role\)/);
});

test('UX-PRO-03 backup: preserves the existing three read endpoints and response fields', () => {
  for (const endpoint of ['/api/admin/backups', '/api/admin/backups/restores', '/api/admin/backups/retention']) {
    assert.ok(client.includes(endpoint), `expected read endpoint ${endpoint}`);
  }
  for (const field of ['backups.backups', 'restores.restores', 'retention.policies', 'retention.expired_count', 'recorded_status', 'recorded_is_restore_tested', 'target_env', 'is_isolated']) {
    assert.ok(client.includes(field), `expected existing response field ${field}`);
  }
  assert.match(client, /fetch\("\/api\/admin\/backups"/);
  assert.doesNotMatch(client, /method:\s*["'](?:POST|PATCH|DELETE|PUT)["']/);
});

test('UX-PRO-03 backup: distinguishes loading, failure, empty and unverified legacy metadata', () => {
  for (const text of ['não executa nem verifica backups ou restaurações', 'Não verificado', 'Nenhum job legado encontrado', 'Nenhuma restauração legada encontrada', 'Prazos declarados']) {
    assert.ok(client.toLowerCase().includes(text.toLowerCase()), `expected honest UI copy: ${text}`);
  }
  assert.match(client, /variant="loading"/);
  assert.match(client, /variant="denied"/);
  assert.match(client, /variant="error"/);
  assert.match(client, /variant="empty"/);
  assert.match(client, /<details className=\{styles\.details\}>/);
});

test('UX-PRO-03 backup: responsive layout and focus use administrative theme tokens', () => {
  assert.match(styles, /@media\(max-width:650px\)/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /var\(--ux-color-surface\)/);
  assert.match(styles, /var\(--ux-color-text\)/);
  assert.match(styles, /var\(--ux-color-canvas\)/);
});
