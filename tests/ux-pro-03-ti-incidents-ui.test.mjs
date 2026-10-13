import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const client = await readFile(new URL('../src/app/admin/ti/IncidentClient.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/IncidentClient.module.css', import.meta.url), 'utf8');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/server/incident-api.mjs', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

test('UX-PRO-03 incidents: improves the mounted TI incident surface behind the current role gate', () => {
  assert.match(consoleClient, /active==='incidentes'&&<IncidentClient\/>/);
  assert.match(consoleClient, /\['incidentes','Incidentes'\]/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
  assert.match(api, /requireRole\(sess,\['admin','ti'\]\)/);
  assert.match(api, /if\(!sameOrigin\(req\)\)/);
});

test('UX-PRO-03 incidents: preserves current endpoints, methods, payload fields, and audit calls', () => {
  for (const endpoint of ['/api/admin/incidents', '/api/admin/incidents/evidences', '/api/admin/incidents/actions', '/api/admin/incidents/communications']) {
    assert.ok(client.includes(endpoint), `expected endpoint ${endpoint}`);
  }
  assert.match(client, /`\/api\/admin\/incidents\/\$\{id\}`/);
  assert.match(client, /'POST'/);
  assert.match(client, /'PATCH'/);
  for (const field of ['incident_type', 'severity', 'affected_data_categories', 'affected_records_estimate', 'file_reference', 'action_type', 'assigned_to_name', 'recipient_type', 'recipient_contact', 'root_cause', 'impact_assessment', 'remediation_plan', 'lessons_learned']) {
    assert.ok(client.includes(field), `expected existing API field ${field}`);
  }
  for (const auditAction of ['incident_create', 'incident_update', 'incident_evidence_add', 'incident_action_create', 'incident_action_complete', 'incident_communicate']) {
    assert.ok(api.includes(`action:'${auditAction}'`), `expected existing audit action ${auditAction}`);
  }
  for (const path of ['/api/admin/incidents', '/api/admin/incidents/evidences', '/api/admin/incidents/actions', '/api/admin/incidents/communications']) assert.ok(server.includes(path));
});

test('UX-PRO-03 incidents: explains that evidence is a reference and communications are not sent externally', () => {
  assert.match(client, /não faz upload nem verifica arquivos/);
  assert.match(client, /não envia e-mail, SMS ou notificação externa/);
  assert.match(client, /registro interno em/);
  assert.match(client, /minLength=\{10\}/);
  assert.match(client, /minLength=\{20\}/);
  assert.match(client, /containment_lead_required/);
  assert.match(client, /root_cause_required_for_close/);
});

test('UX-PRO-03 incidents: separates list/detail/form states and retains responsive theme/keyboard behavior', () => {
  for (const variant of ['loading', 'empty', 'success']) assert.ok(client.includes(`variant="${variant}"`), `expected ${variant} state`);
  assert.match(client, /variant:denied\?'denied':'error'/);
  assert.match(client, /detailError/);
  assert.match(client, /Gestão de incidentes/);
  for (const breakpoint of ['@media(max-width:900px)', '@media(max-width:650px)']) assert.ok(styles.includes(breakpoint));
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted', '--ux-color-border', '--ux-color-focus']) assert.ok(styles.includes(token), `expected ${token}`);
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
  assert.match(client, /tabIndex=\{0\} aria-label="Lista rolável de incidentes"/);
});
