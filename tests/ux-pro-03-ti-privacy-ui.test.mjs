import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component = await readFile(new URL('../src/app/admin/ti/PrivacyClient.tsx', import.meta.url), 'utf8');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/PrivacyClient.module.css', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/server/privacy-api.mjs', import.meta.url), 'utf8');

test('UX-PRO-03 privacy: improves only the mounted TI privacy surface and preserves its gate', () => {
  assert.match(consoleClient, /active==='privacidade'&&<PrivacyClient\/>/);
  assert.match(consoleClient, /\['privacidade','Privacidade'\]/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
});

test('UX-PRO-03 privacy: preserves the same read/write endpoints and request contracts', () => {
  for (const endpoint of ["'/api/admin/privacy/inventory'", "'/api/admin/privacy/policies'", '`/api/admin/privacy/policies/${policy.id}`']) {
    assert.ok(component.includes(endpoint), `expected endpoint ${endpoint}`);
  }
  for (const field of [
    'data_category', 'data_field', 'description', 'purpose', 'legal_basis', 'legal_basis_detail',
    'retention_days', 'retention_description', 'recipients', 'is_sensitive', 'is_required', 'source',
    'title', 'content', 'contact_email', 'dpo_name', 'dpo_contact', 'retention_summary', 'rights_description',
    'recipients_description',
  ]) assert.ok(component.includes(field), `preserved API field ${field}`);
  assert.match(component, /body\.rejection_reason = 'Revisão competente pendente'/);
  assert.match(api, /if \(!\['admin','ti'\]\.includes\(session\.role\)\)/);
  assert.match(api, /approval_requires_admin/);
  assert.match(api, /must_be_approved_before_publish/);
  assert.match(api, /privacy_inventory_create/);
  assert.match(api, /privacy_policy_create/);
  assert.match(api, /privacy_policy_approve/);
  assert.match(api, /privacy_policy_publish/);
});

test('UX-PRO-03 privacy: retains every server-supported category, basis and policy status', () => {
  for (const value of ['identificacao', 'contato', 'localizacao', 'profissional', 'financeiro', 'tecnico', 'comportamental', 'sensivel', 'outro']) assert.ok(component.includes(`['${value}'`));
  for (const value of ['consentimento', 'execucao_contrato', 'cumprimento_legal', 'legitimo_interesse', 'protecao_vida', 'tutela_saude', 'exercicio_direitos', 'protecao_credito', 'outro']) assert.ok(component.includes(`['${value}'`));
  for (const value of ['rascunho', 'em_revisao', 'aprovado', 'publicado', 'arquivado', 'rejeitado']) assert.ok(component.includes(`${value}:`));
  for (const value of ['em_revisao', 'aprovado', 'publicado', 'arquivado', 'rejeitado']) assert.ok(component.includes(`'${value}'`));
});

test('UX-PRO-03 privacy: distinguishes states and avoids legal or publication overclaims', () => {
  assert.match(component, /variant="loading"/);
  assert.match(component, /variant: 'denied'|variant: 'error'/);
  assert.match(component, /variant="empty"/);
  assert.match(component, /variant: 'success'/);
  for (const phrase of ['não substituem a avaliação jurídica', 'não foi publicada', 'revisão competente', 'API']) assert.ok(component.toLowerCase().includes(phrase.toLowerCase()));
  assert.match(component, /setLoadError\(/);
  assert.match(component, /setFeedback\(/);
});

test('UX-PRO-03 privacy: uses responsive theme tokens, labelled fields and keyboard focus', () => {
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(max-width: 650px\)/);
  assert.match(styles, /:focus-visible/);
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted', '--ux-color-border', '--ux-color-focus']) assert.ok(styles.includes(token));
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
  assert.match(component, /<label className=\{styles\.field\}>/);
  assert.match(component, /type="submit"/);
});
