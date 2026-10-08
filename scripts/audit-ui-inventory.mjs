import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(root, 'src', 'app');
const output = path.join(root, 'docs', 'AUDITORIA-INTERFACE-ROTAS-2026-10-08.csv');

async function walk(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(absolute));
    else found.push(absolute);
  }
  return found;
}

function count(source, expression) {
  return [...source.matchAll(expression)].length;
}

function csv(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const allFiles = await walk(appRoot);
const pages = allFiles.filter(file => /[\\/]page\.(?:tsx|jsx|ts|js)$/.test(file)).sort();
const rows = [];
for (const page of pages) {
  const directory = path.dirname(page);
  const localFiles = allFiles.filter(file => path.dirname(file) === directory && /\.(?:tsx|jsx)$/.test(file));
  if (!localFiles.includes(page)) localFiles.push(page);
  const sources = await Promise.all(localFiles.map(file => readFile(file, 'utf8')));
  const source = sources.join('\n');
  const relativePage = path.relative(appRoot, page).replaceAll('\\', '/');
  const route = `/${relativePage.replace(/\/page\.(?:tsx|jsx|ts|js)$/, '')}`
    .split('/')
    .filter(segment => segment && !/^\([^/]+\)$/.test(segment))
    .join('/');
  rows.push({
    route: route || '/',
    entry: path.relative(root, page).replaceAll('\\', '/'),
    localTsxFiles: localFiles.length,
    controls: count(source, /<(?:input|select|textarea)\b/g),
    labels: count(source, /<label(?:\s|>)/g),
    ariaLabel: count(source, /\baria-label\s*=/g),
    placeholder: count(source, /\bplaceholder\s*=/g),
    tables: count(source, /<table\b/g),
    defaultLocaleCalls: count(source, /\.toLocale(?:Date|Time)?String\s*\(\s*\)/g),
  });
}

const columns = ['route', 'entry', 'local_tsx_files', 'form_controls', 'label_elements', 'aria_label_attributes', 'placeholder_attributes', 'tables', 'default_locale_calls'];
const lines = [columns.map(csv).join(','), ...rows.map(row => [
  row.route, row.entry, row.localTsxFiles, row.controls, row.labels,
  row.ariaLabel, row.placeholder, row.tables, row.defaultLocaleCalls,
].map(csv).join(','))];
await writeFile(output, `${lines.join('\n')}\n`, 'utf8');

console.log(JSON.stringify({
  routeEntries: rows.length,
  routeDirectoriesWithControls: rows.filter(row => row.controls > 0).length,
  localFormControls: rows.reduce((sum, row) => sum + row.controls, 0),
  localLabelElements: rows.reduce((sum, row) => sum + row.labels, 0),
  localAriaLabelAttributes: rows.reduce((sum, row) => sum + row.ariaLabel, 0),
  localPlaceholders: rows.reduce((sum, row) => sum + row.placeholder, 0),
  tableMarkupOccurrences: rows.reduce((sum, row) => sum + row.tables, 0),
  defaultLocaleCalls: rows.reduce((sum, row) => sum + row.defaultLocaleCalls, 0),
  inventory: path.relative(root, output).replaceAll('\\', '/'),
}, null, 2));
