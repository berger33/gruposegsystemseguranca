// UX-00: inventory of page routes and their visible page-level gate.
// This is navigation evidence, never a substitute for API authorization review.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('src/app');
async function pages(dir) {
  const out = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...await pages(full));
    else if (item.name === 'page.tsx') out.push(full);
  }
  return out;
}
const rows = [];
for (const file of await pages(root)) {
  const route = '/' + path.relative(root, path.dirname(file)).split(path.sep).join('/');
  const content = await readFile(file, 'utf8');
  const gate = content.match(/<AdminGate\b[^>]*allowedRoles=\{\[([^\]]+)\]/s);
  const roles = gate ? [...gate[1].matchAll(/["']([^"']+)["']/g)].map(match => match[1]).join('|') : '';
  const evidence = route.startsWith('/admin')
    ? gate ? 'AdminGate com papeis declarados' : content.includes('<AdminGate') ? 'AdminGate sem lista local' : 'conferir entrada/guardas'
    : route.startsWith('/cliente/app') ? 'ClientSpaceProvider no layout; validar API/grant'
    : route === '/funcionario' ? 'EmployeePortal; validar sessao/API'
    : route.startsWith('/cliente') ? 'verificar previa, acesso ou recuperacao'
    : 'publica ou condicional; verificar fonte';
  rows.push({ route: route === '/' ? '/' : route.replace(/\/$/, ''), roles, evidence, file: path.relative(process.cwd(), file).split(path.sep).join('/') });
}
rows.sort((a, b) => a.route.localeCompare(b.route, 'pt-BR'));
const csv = value => `"${String(value).replaceAll('"', '""')}"`;
process.stdout.write(['route,roles_declarados,evidencia_de_pagina,arquivo', ...rows.map(row => [row.route, row.roles, row.evidence, row.file].map(csv).join(','))].join('\n') + '\n');
