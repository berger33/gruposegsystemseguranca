import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component = await readFile(new URL('../src/app/admin/ti/RbacClient.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/RbacClient.module.css', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/server/admin-rbac-api.mjs', import.meta.url), 'utf8');
const evaluator = await readFile(new URL('../src/server/rbac.mjs', import.meta.url), 'utf8');

test('UX-PRO-03 RBAC: preserves existing list, grant, and revoke API contracts', () => {
  assert.match(component, /fetch\("\/api\/admin\/permissions"\)/);
  assert.match(component, /fetch\("\/api\/admin\/permissions", \{ method: "POST"/);
  assert.match(component, /identityId: form\.identityId\.trim\(\), permission: form\.permission, scopeType: form\.scopeType, scopeId: form\.scopeId\.trim\(\) \|\| null, reason: form\.reason\.trim\(\)/);
  assert.match(component, /fetch\(`\/api\/admin\/permissions\/\$\{permission\.id\}`, \{ method: "DELETE"/);
  assert.match(component, /body: JSON\.stringify\(\{ reason: reason\.trim\(\) \}\)/);
});

test('UX-PRO-03 RBAC: clearly identifies the accepted team scope that does not match resources', () => {
  assert.match(evaluator, /if \(row\.scope_type === 'organization'\)/);
  assert.match(evaluator, /return false;/);
  assert.match(component, /o avaliador atual não concede acesso efetivo para ele/);
  assert.match(component, /Não efetivo no avaliador atual/);
});

test('UX-PRO-03 RBAC: does not claim audit logging is a required transaction', () => {
  assert.match(api, /auth_access_audit/);
  assert.match(api, /\.catch\(\(\)=>\{\}\)/);
  assert.match(component, /tenta registrar o evento em/);
  assert.match(component, /não depende de confirmar essa escrita auxiliar/);
});

test('UX-PRO-03 RBAC: fields are labeled and table supports narrow-screen and keyboard use', () => {
  assert.match(component, /Identidade da pessoa/);
  assert.match(component, /Acesso que será concedido/);
  assert.match(component, /Identificador do escopo/);
  assert.match(component, /Motivo da concessão/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width: 760px\)/);
});
