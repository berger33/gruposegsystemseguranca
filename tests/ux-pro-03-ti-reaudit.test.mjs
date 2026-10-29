import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// UX-PRO-03 — reauditoria do TiConsole. A decisão de 02/10 só permite promover
// um componente órfão "com prova" (papel, origem, fonte, drill-down, gate).
// Esta guarda impede duas regressões silenciosas: (1) uma aba montada sem teste
// focal ou com endpoint que o servidor não despacha; (2) um órfão passar a ser
// renderizado sem passar pelo critério. Ela lê o código diretamente, sem
// depender do gerador de inventário, para não virar prova circular.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tiDir = path.join(root, 'src/app/admin/ti');
const testsDir = path.join(root, 'tests');
const appDir = path.join(root, 'src/app');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(absolute));
    else if (/\.(tsx|ts|mjs|jsx|js)$/.test(entry.name)) out.push(absolute);
  }
  return out;
}

async function readMap(files) {
  return new Map(await Promise.all(files.map(async file => [file, await readFile(file, 'utf8')])));
}

const consoleSrc = await readFile(path.join(tiDir, 'TiConsole.tsx'), 'utf8');
const pageSrc = await readFile(path.join(tiDir, 'page.tsx'), 'utf8');
// server.mjs usa regexes com barras escapadas (ex.: \/api\/admin\/...). Sem
// normalizar, um endpoint realmente despachado pareceria ausente.
const dispatchText = (await readFile(path.join(root, 'server.mjs'), 'utf8')).replace(/\\\//g, '/');
const componentFiles = (await readdir(tiDir)).filter(file => file.endsWith('Client.tsx')).sort();
const componentSources = await readMap(componentFiles.map(file => path.join(tiDir, file)));
const testFiles = (await readdir(testsDir)).filter(file => file.endsWith('.mjs')).sort();
const testSources = await readMap(testFiles.map(file => path.join(testsDir, file)));
const appSources = await readMap(await walk(appDir));

// Recortar apenas a declaração `tabs`: os grupos de navegação também usam
// arrays de duas chaves (`keys:['bases','pastas']`) e não são abas.
const tabsDeclaration = consoleSrc.match(/const tabs=(\[[\s\S]*?\]) as const;/)?.[1] ?? '';
// Contagem deliberada: 12 abas históricas + 6 promovidas com prova em 27/10
// (PLT-14 Dependências, PLT-18 Documentação de manutenção, PLT-16 Orçamento
// e uso, PLT-17 Ambientes e isolamento, PLT-11 Retenção e descarte, PLT-13
// Configurações e rollout) + 1 promovida em 28/10 (CLI-05/06/07/08 Portal do
// cliente v2) + 1 aba de lacuna em 29/10 (FIN cadastros de apoio: fornecedores,
// centros de custo e histórico de baixa — a família `Fin*` NÃO foi promovida
// porque `/admin/financeiro` já é rota real). Toda nova ABA exige atualizar
// esta constante E o inventário/CSV — é o atrito que a guarda deve impor.
const EXPECTED_TABS = 20;
const tabKeys = [...tabsDeclaration.matchAll(/\['([a-z0-9_]+)','([^']+)'\]/g)].map(match => match[1]);
const dynamicNames = [...consoleSrc.matchAll(/const\s+(\w+)\s*=\s*dynamic\(\(\)\s*=>\s*import\(['"]\.\/([^'"]+)['"]\)\)/g)].map(match => match[2]);
const renders = [...consoleSrc.matchAll(/active==='([a-z0-9_]+)'&&<(\w+)\/>/g)].map(match => ({ key: match[1], component: match[2] }));

function apisOf(source) {
  const literals = source.match(/["'`](\/api\/[A-Za-z0-9_./?=&{}$:-]+)["'`]/g) || [];
  return [...new Set(literals.map(raw => raw.slice(1, -1).split('${')[0].replace(/[?].*$/, '')))]
    .filter(api => api.startsWith('/api/'));
}

function isDispatched(api) {
  return dispatchText.includes(api) || dispatchText.includes(api.replace(/\/$/, ''));
}

/** Specifiers de importação citados em qualquer arquivo de `src/app`. */
function importersOf(base, selfPath) {
  return [...appSources.entries()]
    .filter(([file, source]) => {
      if (file === selfPath || file.endsWith('TiConsole.tsx')) return false;
      const specifiers = source.match(/['"]([^'"]+)['"]/g) || [];
      return specifiers.some(raw => {
        const spec = raw.slice(1, -1);
        return spec === `./${base}` || spec.endsWith(`/${base}`);
      });
    })
    .map(([file]) => path.relative(root, file));
}

test('UX-PRO-03 reauditoria: as 20 abas montadas têm teste focal e todos os endpoints despachados', () => {
  assert.equal(renders.length, EXPECTED_TABS, 'toda aba declarada precisa estar renderizada');
  for (const { key, component } of renders) {
    const source = componentSources.get(path.join(tiDir, `${component}.tsx`));
    assert.ok(source, `a aba ${key} renderiza ${component}, mas o arquivo não existe`);
    const focalName = new RegExp(`\\b${component}\\b`);
    const focal = [...testSources.entries()]
      .filter(([, content]) => focalName.test(content))
      .map(([file]) => path.basename(file));
    assert.ok(focal.length > 0,
      `a aba ${key} monta ${component} sem nenhum teste focal que o nomeie (critério "com prova")`);
    for (const api of apisOf(source)) {
      assert.ok(isDispatched(api),
        `${component} chama ${api}, que não aparece no despacho de server.mjs`);
    }
  }
});

test('UX-PRO-03 reauditoria: paridade de navegação, gate de papéis e nenhum órfão montado', () => {
  assert.equal(tabKeys.length, EXPECTED_TABS, 'a lista de abas precisa bater com a contagem decidida');
  assert.deepEqual([...renders.map(item => item.key)].sort(), [...tabKeys].sort(),
    'toda aba declarada precisa ter uma renderização correspondente');
  assert.deepEqual([...dynamicNames].sort(), [...new Set(renders.map(item => item.component))].sort(),
    'todo dynamic import precisa ser renderizado e todo componente renderizado precisa ser importado');
  assert.match(pageSrc, /allowedRoles=\{\['ti','admin'\]\}/,
    'o console precisa continuar protegido por AdminGate para ti/admin');
  assert.match(consoleSrc, /nav aria-label="Ferramentas de sistema"/);
  assert.match(consoleSrc, /aria-pressed=\{active===key\}/);

  const mounted = new Set(renders.map(item => item.component));
  for (const file of componentFiles) {
    const base = file.replace(/\.tsx$/, '');
    const selfPath = path.join(tiDir, file);
    const importers = importersOf(base, selfPath);
    if (importers.length === 0 && !dynamicNames.includes(base)) {
      assert.ok(!mounted.has(base),
        `${base} não é importado por nenhuma rota, mas está montado no TiConsole sem critério de prova`);
    }
  }
});

test('UX-PRO-03 reauditoria: inventário reproduzível versionado e --check verde', () => {
  const csvPath = path.join(root, 'docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.csv');
  const jsonPath = path.join(root, 'docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.json');
  return Promise.all([readFile(csvPath, 'utf8'), readFile(jsonPath, 'utf8')]).then(([csv, json]) => {
    const rows = csv.trim().split('\n').slice(1);
    assert.equal(rows.length, componentFiles.length,
      'o CSV precisa ter uma linha por *Client.tsx do diretório');
    const summary = JSON.parse(json);
    assert.equal(summary.total, componentFiles.length);
    assert.equal(summary.console.total, EXPECTED_TABS);
    assert.equal(summary.console.lacunas.length, 0,
      'toda aba montada precisa ter prova focal no inventário');
    assert.equal(summary.orfos.promovidosSemSairDaClassificacao, 0,
      'nenhum órfão pode ser contado como entregue sem deixar a classificação');
    assert.ok(summary.promocoesComProva.total >= 1, 'toda promoção precisa estar registrada explicitamente');
    assert.equal(summary.promocoesComProva.todasMontadas, true,
      'toda promoção registrada precisa ter aba montada com decisão com_prova');
    execFileSync(process.execPath, [path.join(root, 'scripts/ux-pro-03-ti-inventory.mjs'), '--check'], {
      cwd: root, stdio: 'pipe',
    });
  });
});
