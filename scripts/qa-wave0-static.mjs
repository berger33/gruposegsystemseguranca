#!/usr/bin/env node
// Preflight SOMENTE LEITURA da Onda 0. Não inicia servidor, banco ou serviços externos.
// Rode: node scripts/qa-wave0-static.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const report = [];
const add = (id, label, problems) => report.push({ id, label, ok: problems.length === 0, problems });

const server = read('server.mjs');
const relativeImports = [...server.matchAll(/^\s*import\s+.+?\s+from\s+["'](\.[^"']+)["']/gm)].map(m => m[1]);
const missingImports = relativeImports.filter(spec => !fs.existsSync(path.resolve(root, spec + (path.extname(spec) ? '' : '.mjs'))));
add('PLT-SMK-001', 'Imports relativos estáticos de server.mjs', missingImports.map(spec => `ausente: ${spec}`));

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const requiredRuntime = ['@next/env', '@electric-sql/pglite', 'next', 'pg', 'nodemailer'];
const missingDeps = requiredRuntime.filter(dep => !Object.hasOwn(pkg.dependencies || {}, dep));
const rootLock = lock.packages?.['']?.dependencies || {};
const lockMismatch = requiredRuntime.filter(dep => Object.hasOwn(pkg.dependencies || {}, dep) && !Object.hasOwn(rootLock, dep));
add('PLT-SMK-001', 'Dependências runtime declaradas em manifest e lockfile', [
  ...missingDeps.map(dep => `package.json não declara ${dep}`),
  ...lockMismatch.map(dep => `package-lock.json raiz não declara ${dep}`),
]);

const migrationDir = path.join(root, 'db', 'migrations');
const latestMigration = 119;
const migrationRange = Array.from({ length: latestMigration }, (_, i) => i + 1);
const sqlFiles = fs.existsSync(migrationDir) ? fs.readdirSync(migrationDir).filter(f => /^\d{3}-.*\.sql$/.test(f)) : [];
const byNumber = new Map();
for (const file of sqlFiles) {
  const n = Number(file.slice(0, 3));
  byNumber.set(n, [...(byNumber.get(n) || []), file]);
}
const missingMigrations = migrationRange.filter(n => !byNumber.has(n));
const duplicateNumbers = [...byNumber.entries()].filter(([, files]) => files.length > 1).map(([n]) => n);
const unexpectedNumbers = [...byNumber.keys()].filter(n => n < 1 || n > latestMigration);
add('PLT-MIG-001', `Migrações SQL 001–${latestMigration} contínuas e únicas`, [
  ...(missingMigrations.length ? [`faltam números: ${missingMigrations.map(n => String(n).padStart(3, '0')).join(', ')}`] : []),
  ...(duplicateNumbers.length ? [`números duplicados: ${duplicateNumbers.join(', ')}`] : []),
  ...(unexpectedNumbers.length ? [`números fora do baseline: ${unexpectedNumbers.join(', ')}`] : []),
]);
const migrator = read('scripts/migrate-site-visual.mjs');
const declared = new Set([...migrator.matchAll(/["'](\d{3}-[^"']+\.sql)["']/g)].map(m => Number(m[1].slice(0, 3))));
const notScheduled = migrationRange.filter(n => !declared.has(n));
add('PLT-MIG-001', `Migrações 001–${latestMigration} registradas no migrador PG`, notScheduled.length
  ? [`não agendadas: ${notScheduled.map(n => String(n).padStart(3, '0')).join(', ')}`] : []);

const workflow = '.github/workflows/ci.yml';
const ciProblems = [];
if (!exists(workflow)) ciProblems.push(`${workflow} ausente no checkout`);
else {
  const ci = read(workflow);
  for (const step of ['npm ci', 'npm test', 'npm run typecheck', 'npm run build']) {
    if (!ci.includes(step)) ciProblems.push(`etapa obrigatória não identificada: ${step}`);
  }
  if (ci.includes('|| true')) ciProblems.push('workflow contém "|| true": revisar se alguma falha obrigatória é mascarada');
}
add('PLT-CI-001', 'CI com install/test/typecheck/build sem bypass', ciProblems);

for (const item of report) {
  console.log(`${item.ok ? 'OK' : 'FALHOU'} ${item.id}: ${item.label}`);
  for (const problem of item.problems) console.log(`  - ${problem}`);
}
console.log(`RESUMO: ${report.filter(x => x.ok).length}/${report.length} verificações estáticas OK; ${missingImports.length} imports ausentes; ${missingMigrations.length} migrações ausentes.`);
if (report.some(x => !x.ok)) process.exitCode = 1;
