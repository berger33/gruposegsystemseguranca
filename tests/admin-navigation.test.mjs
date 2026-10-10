import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ADMIN_GROUPS, groupAdminModules, searchAdminGroups } from '../src/lib/admin-navigation.mjs';

test('every destination in the existing admin catalog belongs to exactly one named group', async () => {
  const source = await readFile(new URL('../src/app/admin/AdminGate.tsx', import.meta.url), 'utf8');
  const section = source.split('export const ADMIN_MODULES')[1].split('export function modulesForRole')[0];
  const existing = [...section.matchAll(/href:\s*"(\/admin[^\"]+)"/g)].map(match => match[1]);
  const grouped = ADMIN_GROUPS.flatMap(group => group.hrefs);
  assert.equal(existing.length, 26, 'review the current navigation catalogue before changing this baseline');
  assert.deepEqual([...new Set(grouped)].sort(), [...existing].sort());
  assert.equal(grouped.length, existing.length, 'no destination may be duplicated');
});

test('grouping and search only use supplied role-filtered destinations', () => {
  const allowed = [
    { href: '/admin/funcionarios', label: 'Funcionários e RH' },
    { href: '/admin/crm', label: 'CRM' },
  ];
  const groups = groupAdminModules(allowed);
  assert.deepEqual(groups.flatMap(group => group.modules), allowed.slice().reverse());
  assert.deepEqual(searchAdminGroups(groups, 'pessoas').flatMap(group => group.modules), [allowed[0]]);
  assert.deepEqual(searchAdminGroups(groups, 'crm').flatMap(group => group.modules), [allowed[1]]);
  assert.deepEqual(searchAdminGroups(groups, 'salário'), []);
});
