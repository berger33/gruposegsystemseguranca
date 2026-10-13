import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ti = new URL('../src/app/admin/ti/', import.meta.url);
const client = await readFile(new URL('NotificationsClient.tsx', ti), 'utf8');
const consoleClient = await readFile(new URL('TiConsole.tsx', ti), 'utf8');
const page = await readFile(new URL('page.tsx', ti), 'utf8');
const styles = await readFile(new URL('NotificationsClient.module.css', ti), 'utf8');
const api = await readFile(new URL('../src/server/admin-notifications-api.mjs', import.meta.url), 'utf8');
const queue = await readFile(new URL('../src/server/notification-queue.mjs', import.meta.url), 'utf8');

test('UX-PRO-03 notifications: refines only the mounted TI notifications surface', () => {
  assert.match(consoleClient, /active==='avisos'&&<NotificationsClient\/>/);
  assert.match(consoleClient, /\['avisos','Notificações'\]/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
});

test('UX-PRO-03 notifications: preserves the four existing endpoints and request contracts', () => {
  for (const endpoint of [
    "'/api/admin/notifications?limit=50'", "'/api/admin/notifications'",
    '`/api/admin/notifications/${id}/retry`', "'/api/admin/notifications/process'",
  ]) assert.ok(client.includes(endpoint), `expected endpoint ${endpoint}`);
  for (const field of ['recipientKind:', 'recipientEmail:', 'channel:', 'template:', 'payload,', 'dedupKey:']) assert.ok(client.includes(field));
  assert.match(client, /method: 'POST', headers: \{ 'Content-Type': 'application\/json' \}/);
  assert.match(api, /async function requireAdminSession/);
  assert.match(api, /\["ti","admin","marcelo"\]\.includes\(session\.role\)/);
  assert.match(api, /notificationQueue\.retry\(id, \{ actorKind: session\.role, actorId: session\.identityId \}\)/);
  assert.match(queue, /notification_enqueue/);
  assert.match(queue, /notification_retry/);
  assert.match(queue, /status = 'local_outbox'/);
  assert.doesNotMatch(client, /method: ['"](?:PUT|PATCH|DELETE)['"]/);
});

test('UX-PRO-03 notifications: communicates loading, denied, failure, empty, success and provider limits', () => {
  assert.match(client, /variant="loading"/);
  assert.match(client, /variant="empty"/);
  assert.match(client, /variant: 'success'/);
  assert.match(client, /<UiState variant=\{notice\.variant\}/);
  assert.match(client, /variant=\{loadError\.variant\}/);
  for (const message of ['não comprova entrega externa', 'caixa local', 'envio externo', 'Falha de conexão', 'A fila ainda não tem notificações']) {
    assert.ok(client.toLowerCase().includes(message.toLowerCase()), `expected honest state copy: ${message}`);
  }
  assert.match(client, /setLastProcess\(/);
  assert.match(client, /statusLabels/);
});

test('UX-PRO-03 notifications: supports accepted recipients/channels, keyboard focus and responsive day/night tokens', () => {
  for (const value of ['client', 'staff', 'lead', 'system', 'marcelo', 'ti', 'admin', 'rh']) assert.ok(client.includes(`${value}:`));
  for (const value of ['email', 'whatsapp', 'sms', 'push', 'webhook', 'internal']) assert.ok(client.includes(`${value}:`));
  assert.match(client, /role="region"[^>]+tabIndex=\{0\}/);
  assert.match(styles, /@media \(max-width: 520px\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /:focus-visible/);
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted', '--ux-color-border', '--ux-color-focus']) assert.ok(styles.includes(token), `missing theme token ${token}`);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});
