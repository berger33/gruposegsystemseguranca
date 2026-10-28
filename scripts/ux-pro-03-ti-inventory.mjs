#!/usr/bin/env node
/**
 * UX-PRO-03 — inventário reproduzível dos componentes de `/admin/ti`.
 *
 * Substitui, como fonte de estado, o retrato histórico de 02/10 em
 * `docs/INVENTARIO-ADMIN-TI.md` (82 arquivos, "0 imports"). Nada aqui é
 * inferido de documentação narrativa: a classificação vem do grafo real de
 * importação em `src/app`, do despacho em `server.mjs` e dos testes em `tests/`.
 *
 * Classificação:
 *   console   — importado por `TiConsole.tsx` E renderizado numa aba;
 *   workspace — importado por outra rota/workspace (não é aba do console);
 *   orfao     — nenhuma importação em `src/app` (não pode ser contado como
 *               funcionalidade entregue; decisão de 02/10 exige prova por área).
 *
 * `decisao = com_prova` exige teste focal nomeando o componente, papel ti/admin
 * e nenhum endpoint sem despacho. É uma prova ESTÁTICA: não substitui gate de
 * navegador, aceite humano nem autorização exercida em tempo de execução.
 *
 * Uso:
 *   node scripts/ux-pro-03-ti-inventory.mjs           # regenera CSV + JSON
 *   node scripts/ux-pro-03-ti-inventory.mjs --check   # não escreve; exit 1 se desatualizado
 */
import { createHash } from 'node:crypto';
import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tiDir = path.join(root, 'src/app/admin/ti');
const CSV = 'docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.csv';
const JSON_FILE = 'docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.json';
const CSV_HEADER = [
  'componente', 'linhas', 'classificacao', 'montado_por', 'aba',
  'apis', 'apis_sem_dispatch', 'teste_focal', 'papel', 'decisao',
];

// Registro explícito das promoções "com prova" (decisão de 02/10). Cada entrada
// exige aba real, papel no servidor, teste focal e subteste no gate — e um
// relatório próprio. Mantido à mão DE PROPÓSITO: um órfão ligado por acidente
// não deve ser automaticamente contado como "promovido".
const PROMOCOES_COM_PROVA = [
  {
    componente: 'DependencyClient.tsx',
    aba: 'dependencias',
    familia: 'PLT-14 dependências / lockfile / vulnerabilidades',
    relatorio: 'docs/UX-PRO-03-PROMOCAO-DEPENDENCIAS-2026-10-27.md',
  },
  {
    componente: 'MaintenanceDocClient.tsx',
    aba: 'manutencao',
    familia: 'PLT-18 documentação de manutenção versionada',
    relatorio: 'docs/UX-PRO-03-PROMOCAO-DOCUMENTACAO-MANUTENCAO-2026-10-27.md',
  },
  {
    componente: 'BudgetClient.tsx',
    aba: 'orcamentos',
    familia: 'PLT-16 orçamento operacional, métricas de uso e alertas',
    relatorio: 'docs/UX-PRO-03-PROMOCAO-ORCAMENTO-USO-2026-10-27.md',
  },
  {
    componente: 'EnvClient.tsx',
    aba: 'ambientes',
    familia: 'PLT-17 inventário declarativo de ambientes e verificações de isolamento',
    relatorio: 'docs/UX-PRO-03-PROMOCAO-AMBIENTES-2026-10-27.md',
  },
  {
    componente: 'RetentionClient.tsx',
    aba: 'retencao',
    familia: 'PLT-11 retenção por categoria, exceções formais e descarte verificável',
    relatorio: 'docs/UX-PRO-03-PROMOCAO-RETENCAO-DESCARTE-2026-10-27.md',
  },
  {
    componente: 'ConfigClient.tsx',
    aba: 'configuracoes',
    familia: 'PLT-13 configurações, flags, manutenção, rollout e reversão',
    relatorio: 'docs/UX-PRO-03-PROMOCAO-CONFIGURACOES-ROLLOUT-2026-10-27.md',
  },
  {
    componente: 'LgpdRequestClient.tsx',
    aba: 'lgpd',
    familia: 'PLT-10 pedidos do titular com verificação de identidade, responsável, prazo de 15 dias e impedimentos documentados',
    relatorio: 'docs/UX-PRO-03-PROMOCAO-PEDIDOS-LGPD-2026-10-28.md',
  },
];

const sha256 = value => createHash('sha256').update(value).digest('hex');
const cell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;

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

function apisOf(source) {
  const literals = source.match(/["'`](\/api\/[A-Za-z0-9_./?=&{}$:-]+)["'`]/g) || [];
  return [...new Set(literals.map(raw => raw.slice(1, -1).split('${')[0].replace(/[?].*$/, '')))]
    .filter(api => api.startsWith('/api/'));
}

export async function collect() {
  const consoleSrc = await readFile(path.join(tiDir, 'TiConsole.tsx'), 'utf8');
  const pageSrc = await readFile(path.join(tiDir, 'page.tsx'), 'utf8');
  // Regexes de rota em server.mjs escapam as barras (\/api\/...): normalizar
  // para que um endpoint realmente despachado não pareça ausente.
  const dispatchText = (await readFile(path.join(root, 'server.mjs'), 'utf8')).replace(/\\\//g, '/');

  const componentFiles = (await readdir(tiDir)).filter(file => file.endsWith('Client.tsx')).sort();
  const componentSources = await readMap(componentFiles.map(file => path.join(tiDir, file)));
  const appSources = await readMap(await walk(path.join(root, 'src/app')));
  const testFiles = (await readdir(path.join(root, 'tests'))).filter(file => file.endsWith('.mjs')).sort();
  const testSources = await readMap(testFiles.map(file => path.join(root, 'tests', file)));

  const tabsDeclaration = consoleSrc.match(/const tabs=(\[[\s\S]*?\]) as const;/)?.[1] ?? '';
  const tabs = [...tabsDeclaration.matchAll(/\['([a-z_]+)','([^']+)'\]/g)].map(match => ({ key: match[1], label: match[2] }));
  const renders = [...consoleSrc.matchAll(/active==='([a-z_]+)'&&<(\w+)\/>/g)]
    .map(match => ({ key: match[1], component: match[2] }));
  const dynamicNames = [...consoleSrc.matchAll(/const\s+(\w+)\s*=\s*dynamic\(\(\)\s*=>\s*import\(['"]\.\/([^'"]+)['"]\)\)/g)]
    .map(match => match[2]);
  const consoles = new Map(renders.map(item => [item.component, item.key]));

  const roleGate = /allowedRoles=\{\['ti','admin'\]\}/.test(pageSrc) ? 'ti|admin' : 'verificar gate';
  const isDispatched = api => dispatchText.includes(api) || dispatchText.includes(api.replace(/\/$/, ''));

  const rows = componentFiles.map(file => {
    const base = file.replace(/\.tsx$/, '');
    const selfPath = path.join(tiDir, file);
    const source = componentSources.get(selfPath);
    const importers = [...appSources.entries()]
      .filter(([candidate, content]) => {
        if (candidate === selfPath || candidate.endsWith('TiConsole.tsx')) return false;
        const specifiers = content.match(/['"]([^'"]+)['"]/g) || [];
        return specifiers.some(raw => {
          const spec = raw.slice(1, -1);
          return spec === `./${base}` || spec.endsWith(`/${base}`);
        });
      })
      .map(([candidate]) => path.relative(root, candidate).replaceAll('\\', '/'));

    const classification = consoles.has(base) ? 'console' : importers.length > 0 ? 'workspace' : 'orfao';
    // Fronteira de palavra: `BudgetClient` não é prova de `LaborBudgetClient`.
    const focalName = new RegExp(`\\b${base}\\b`);
    const focal = [...testSources.entries()]
      .filter(([, content]) => focalName.test(content))
      .map(([candidate]) => path.basename(candidate))
      .sort();
    const apis = apisOf(source);
    const semDispatch = apis.filter(api => !isDispatched(api));

    const papel = classification === 'console' ? roleGate
      : classification === 'workspace' ? 'herdado do workspace' : 'nao_montado';
    const decisao = classification === 'console'
      ? (focal.length > 0 && semDispatch.length === 0 && roleGate === 'ti|admin' ? 'com_prova' : 'lacuna_de_prova')
      : classification === 'workspace' ? 'montado_em_workspace' : 'orfao_nao_promovido';

    return {
      componente: file,
      linhas: source.split('\n').length,
      classificacao: classification,
      montado_por: classification === 'console' ? 'TiConsole'
        : classification === 'workspace' ? importers.join('|') : '',
      aba: consoles.get(base) ?? '',
      apis: apis.length,
      apis_sem_dispatch: semDispatch.length,
      teste_focal: focal.join('|'),
      papel,
      decisao,
    };
  });

  const consoleRows = rows.filter(row => row.classificacao === 'console');
  const orphans = rows.filter(row => row.classificacao === 'orfao');
  const summary = {
    inventario: CSV,
    resumo: JSON_FILE,
    data: '2026-10-27',
    criterio: 'promover por area somente com prova (decisao de 02/10); prova estatica nao substitui gate de navegador nem aceite humano',
    tiConsoleSha256: sha256(consoleSrc),
    pageSha256: sha256(pageSrc),
    total: rows.length,
    abas: tabs.length,
    importsDinamicos: dynamicNames.length,
    console: {
      total: consoleRows.length,
      comProva: consoleRows.filter(row => row.decisao === 'com_prova').length,
      lacunas: consoleRows.filter(row => row.decisao !== 'com_prova').map(row => row.componente),
    },
    workspace: { total: rows.filter(row => row.classificacao === 'workspace').length },
    orfos: {
      total: orphans.length,
      // Nenhum órfão pode ser marcado como entregue sem deixar a classificação.
      promovidosSemSairDaClassificacao: orphans.filter(row => row.decisao !== 'orfao_nao_promovido').length,
    },
    promocoesComProva: {
      total: PROMOCOES_COM_PROVA.length,
      todasMontadas: PROMOCOES_COM_PROVA.every(item => consoleRows.some(row =>
        row.componente === item.componente && row.aba === item.aba && row.decisao === 'com_prova')),
      detalhes: PROMOCOES_COM_PROVA,
    },
    apis: {
      literais: rows.reduce((total, row) => total + row.apis, 0),
      semDispatch: rows.reduce((total, row) => total + row.apis_sem_dispatch, 0),
    },
  };

  const csvContent = [
    CSV_HEADER.map(cell).join(','),
    ...rows.map(row => CSV_HEADER.map(column => cell(row[column])).join(',')),
  ].join('\n') + '\n';
  const jsonContent = JSON.stringify(summary, null, 2) + '\n';
  return { rows, summary, csvContent, jsonContent };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { summary, csvContent, jsonContent } = await collect();
  if (process.argv.includes('--check')) {
    const [currentCsv, currentJson] = await Promise.all([
      readFile(path.join(root, CSV), 'utf8').catch(() => null),
      readFile(path.join(root, JSON_FILE), 'utf8').catch(() => null),
    ]);
    // "Com prova" também significa relatório existente: registrar uma promoção
    // sem o documento correspondente não pode passar no CI.
    const missingReports = [];
    for (const item of PROMOCOES_COM_PROVA) {
      try { await access(path.join(root, item.relatorio)); }
      catch { missingReports.push(item.relatorio); }
    }
    const ok = currentCsv === csvContent && currentJson === jsonContent && missingReports.length === 0;
    console.log(ok
      ? `OK: ${CSV} e ${JSON_FILE} conferem com o codigo atual (${summary.total} componentes; ${PROMOCOES_COM_PROVA.length} promocao(oes) com relatorio).`
      : `DESATUALIZADO: execute 'node scripts/ux-pro-03-ti-inventory.mjs' para regenerar.`);
    for (const missing of missingReports) console.error(`Relatorio de promocao ausente: ${missing}`);
    if (!ok) process.exitCode = 1;
  } else {
    await writeFile(path.join(root, CSV), csvContent);
    await writeFile(path.join(root, JSON_FILE), jsonContent);
    console.log(JSON.stringify({
      inventario: CSV, resumo: JSON_FILE, total: summary.total, abas: summary.abas,
      console: summary.console, workspace: summary.workspace, orfos: summary.orfos, apis: summary.apis,
    }, null, 2));
  }
}
