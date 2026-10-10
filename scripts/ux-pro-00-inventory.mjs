#!/usr/bin/env node
/**
 * UX-PRO-00 — inventário vigente de rotas e matriz de cobertura.
 *
 * Fonte de verdade: o código em `src/app` + os registros legíveis por máquina
 * que já existem no repositório (`docs/<stage>-evidencias/resumo.json` de capturas visuais e
 * os filtros `paths:` dos workflows em `.github/workflows`).
 *
 * Nada aqui é inferido de documentação narrativa. Quando uma informação não
 * tem fonte legível por máquina (validação manual, aceite humano) o gerador
 * escreve "nao_registrado" em vez de supor.
 *
 * Uso:
 *   node scripts/ux-pro-00-inventory.mjs           # regenera os CSVs e imprime o resumo
 *   node scripts/ux-pro-00-inventory.mjs --check   # não escreve; exit 1 se os CSVs versionados estiverem desatualizados
 *
 * Critério de contagem (ver docs/UX-PRO-00-RECONCILIACAO-COBERTURA-2026-10-10.md):
 *   1 entrada = 1 arquivo `page.(tsx|jsx|ts|js)` sob `src/app`.
 *   A rota é o diretório desse arquivo relativo a `src/app`, com grupos de
 *   rota `(nome)` removidos. Segmentos dinâmicos `[param]` permanecem literais.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(root, 'src', 'app');
const docsRoot = path.join(root, 'docs');
const workflowsRoot = path.join(root, '.github', 'workflows');

const INVENTORY_CSV = 'docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-10.csv';
const MATRIX_CSV = 'docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-10.csv';

/** Inventários históricos usados apenas na reconciliação; nunca são reescritos. */
const HISTORICAL_INVENTORIES = [
  { id: 'UX-00 05/10/2026', file: 'docs/UX-00-INVENTARIO-ROTAS.csv' },
  { id: 'FECH-12 07/10/2026', file: 'docs/FECH-12-INVENTARIO-ROTAS-2026-10-07.csv' },
  { id: 'Auditoria 08/10/2026', file: 'docs/AUDITORIA-INTERFACE-ROTAS-2026-10-08.csv' },
];

const PAGE_FILE = /[\\/]page\.(?:tsx|jsx|ts|js)$/;
const SOURCE_FILE = /\.(?:tsx|jsx|ts|js|mts)$/;

const csv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const rel = (absolute) => path.relative(root, absolute).replaceAll('\\', '/');

async function walk(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(absolute));
    else found.push(absolute);
  }
  return found;
}

function countOccurrences(source, expression) {
  return [...source.matchAll(expression)].length;
}

/** `/admin/contratos/[id]` a partir de `src/app/admin/contratos/[id]/page.tsx`. */
function routeOf(pageFile) {
  const relative = path.relative(appRoot, path.dirname(pageFile)).replaceAll('\\', '/');
  const segments = relative
    .split('/')
    .filter((segment) => segment && segment !== '.' && !/^\([^/]+\)$/.test(segment));
  return `/${segments.join('/')}`.replace(/\/+$/, '') || '/';
}

/**
 * Áreas usadas pelo plano mestre. A classificação é por prefixo de rota e é
 * estável: mudar aqui muda o relatório inteiro de forma reproduzível.
 */
function areaOf(route) {
  if (route === '/') return 'site publico';
  if (route === '/qa/modulos') return 'homologacao local (restrita)';
  if (route.startsWith('/admin')) return 'administrativo staff';
  if (route.startsWith('/cliente/app')) return 'portal do cliente autenticado';
  if (route.startsWith('/cliente')) return 'entrada/recuperacao do cliente';
  if (route.startsWith('/funcionario')) return 'portal do funcionario';
  if (/^\/layout-(?:\d\d|preview)$/.test(route)) return 'previas visuais de layout';
  return 'site publico';
}

function layoutOf(pageFile, layoutFiles) {
  let directory = path.dirname(pageFile);
  while (directory.startsWith(appRoot)) {
    for (const extension of ['tsx', 'jsx', 'ts', 'js']) {
      const candidate = path.join(directory, `layout.${extension}`);
      if (layoutFiles.includes(candidate)) return rel(candidate);
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return '';
}

/**
 * Arquivos locais da rota: o próprio diretório e subdiretórios que NÃO abrigam
 * outra entrada `page.*`. Assim `/admin/contratos` não herda o código de
 * `/admin/contratos/[id]`.
 */
function localSourcesOf(pageFile, allFiles, pageFiles) {
  const directory = path.dirname(pageFile);
  const nestedRouteDirs = pageFiles
    .map((page) => path.dirname(page))
    .filter((dir) => dir !== directory && dir.startsWith(directory + path.sep));
  return allFiles
    .filter((file) => file.startsWith(directory + path.sep) && SOURCE_FILE.test(file))
    .filter((file) => !nestedRouteDirs.some((dir) => file.startsWith(dir + path.sep)))
    .sort();
}

function rolesFrom(source) {
  const roles = [];
  for (const match of source.matchAll(/allowedRoles\s*=\s*\{\s*\[([^\]]*)\]/g)) {
    for (const role of match[1].matchAll(/["']([^"']+)["']/g)) {
      if (!roles.includes(role[1])) roles.push(role[1]);
    }
  }
  return roles;
}

function guardOf(route, source) {
  const roles = rolesFrom(source);
  if (roles.length) return { roles, guard: 'AdminGate com papeis declarados (UI; autorizacao fica na API)' };
  if (/<AdminGate\b/.test(source)) return { roles: [], guard: 'AdminGate sem lista local de papeis' };
  if (/\bredirect\s*\(/.test(source) && !/<[A-Z]/.test(source.replace(/import[\s\S]*?;/g, ''))) {
    return { roles: [], guard: 'redirecionamento de compatibilidade (sem interface propria)' };
  }
  if (route.startsWith('/cliente/app')) return { roles: [], guard: 'ClientSpaceProvider no layout; sessao + grant decididos na API' };
  if (route === '/funcionario') return { roles: [], guard: 'EmployeePortal; sessao decidida na API' };
  if (route === '/qa/modulos') return { roles: [], guard: 'notFound() salvo em modo de homologacao loopback' };
  if (route.startsWith('/cliente')) return { roles: [], guard: 'entrada publica de acesso/recuperacao; validar fluxo de convite' };
  if (route.startsWith('/admin')) return { roles: [], guard: 'conferir guardas de entrada' };
  return { roles: [], guard: 'publica ou condicional; verificar origem do conteudo' };
}

/** Papéis que aparecem nos menus/navegações declarados no código, por rota. */
async function declaredNavigationRoles() {
  const byRoute = new Map();
  const navigationFiles = [
    path.join(root, 'src', 'app', 'admin', 'AdminGate.tsx'),
    path.join(root, 'src', 'app', 'cliente', 'app', 'ClientAppNavigation.tsx'),
  ];
  for (const file of navigationFiles) {
    let source = '';
    try {
      source = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    for (const match of source.matchAll(/\{\s*href:\s*["']([^"']+)["'][^}]*?roles:\s*\[([^\]]*)\]/g)) {
      const roles = [...match[2].matchAll(/["']([^"']+)["']/g)].map((entry) => entry[1]);
      byRoute.set(match[1], roles);
    }
  }
  return byRoute;
}

/**
 * Workflows cujo filtro `paths:` alcança `src/app/...`.
 * Filtros precisos viram gate de jornada da rota; filtros amplos (`src/**`) ou a
 * ausência de filtro viram baseline, porque compilam/unit-testam tudo sem provar
 * a jornada de cada rota.
 */
async function workflowGates() {
  const gates = [];
  let entries = [];
  try {
    entries = await readdir(workflowsRoot);
  } catch {
    return gates;
  }
  for (const entry of entries.sort()) {
    if (!/\.ya?ml$/.test(entry)) continue;
    const source = await readFile(path.join(workflowsRoot, entry), 'utf8');
    const name = source.match(/^name:\s*(.+)$/m)?.[1]?.trim() || entry;
    const jobs = [...source.matchAll(/^ {2}([a-z0-9-]+):\s*$/gm)].map((match) => match[1]);

    const blocks = [...source.matchAll(/paths:\s*\n((?:[ \t]+-[ \t]*.+\n?)+)/g)];
    const inline = [...source.matchAll(/paths:[ \t]*\[([^\]]*)\]/g)];
    const items = [
      ...blocks.flatMap((match) => match[1].split('\n')),
      ...inline.flatMap((match) => match[1].split(',')),
    ].map((line) => line.trim().replace(/^-[ \t]*/, '').replace(/^["']|["'],?$/g, '').trim()).filter(Boolean);

    const prefixes = new Set();
    let broad = items.length === 0;
    for (const value of items) {
      if (/^(?:src|src\/app)\/\*\*?$/.test(value) || value === '**') {
        broad = true;
        continue;
      }
      if (!value.startsWith('src/app/')) continue;
      const withoutApp = value.slice('src/app'.length).replace(/\/\*.*$/, '').replace(/\/$/, '');
      const prefix = `/${withoutApp.split('/').filter((segment) => segment && !segment.includes('*')).join('/')}`;
      if (prefix !== '/') prefixes.add(prefix);
    }
    for (const prefix of prefixes) {
      gates.push({ workflow: entry, name, jobs: jobs.join('|'), prefix, broad: false });
    }
    if (broad) gates.push({ workflow: entry, name, jobs: jobs.join('|'), prefix: '/', broad: true });
  }
  return gates;
}

/** Capturas visuais legíveis por máquina: `docs/<stage>-evidencias/resumo.json`. */
async function visualCaptures() {
  const byRoute = new Map();
  const files = (await walk(docsRoot)).filter((file) => file.endsWith('resumo.json')).sort();
  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      continue;
    }
    for (const entry of parsed.entries || []) {
      if (!entry.route) continue;
      const record = byRoute.get(entry.route) || { stages: new Set(), viewports: new Set(), firstFocus: false, files: new Set() };
      record.stages.add(parsed.stage || path.basename(path.dirname(file)));
      record.viewports.add(entry.viewport || 'sem_viewport');
      if (entry.firstFocus) record.firstFocus = true;
      record.files.add(rel(file));
      byRoute.set(entry.route, record);
    }
  }
  return byRoute;
}

async function historicalRouteSets() {
  const sets = [];
  for (const inventory of HISTORICAL_INVENTORIES) {
    let source;
    try {
      source = await readFile(path.join(root, inventory.file), 'utf8');
    } catch {
      sets.push({ ...inventory, routes: null, registrados: null, semBarraInicial: null, raizGravadaComoArquivo: null });
      continue;
    }
    const lines = source.split('\n').filter((line) => line.trim().length > 0);
    const recorded = lines
      .slice(1)
      .map((line) => line.match(/^"((?:[^"]|"")*)"/)?.[1]?.replaceAll('""', '"') ?? '')
      .filter(Boolean);
    // O inventário de 08/10 registra a rota sem a barra inicial; normalizar é
    // parte do critério e fica registrado no resumo para não parecer diferença real.
    const withoutLeadingSlash = recorded.filter((route) => !route.startsWith('/')).length;
    const rootAsFileName = recorded.filter((route) => /^page\.(?:tsx|jsx|ts|js)$/.test(route)).length;
    const routes = new Set(
      recorded
        .map((route) => (route.startsWith('/') ? route : `/${route}`).replace(/\/+$/, '') || '/')
        // O gerador de 08/10 gravou a entrada raiz como "page.tsx" em vez de "/".
        .map((route) => (/^\/page\.(?:tsx|jsx|ts|js)$/.test(route) ? '/' : route)),
    );
    sets.push({
      ...inventory,
      routes,
      registrados: recorded.length,
      semBarraInicial: withoutLeadingSlash,
      raizGravadaComoArquivo: rootAsFileName,
    });
  }
  return sets;
}

const allFiles = await walk(appRoot);
const pageFiles = allFiles.filter((file) => PAGE_FILE.test(file)).sort();
const layoutFiles = allFiles.filter((file) => /[\\/]layout\.(?:tsx|jsx|ts|js)$/.test(file));
const navigationRoles = await declaredNavigationRoles();
const gates = await workflowGates();
const captures = await visualCaptures();

const DEMO_MARKERS = /demonstra[çc][ãa]o|demonstrativ|prot[óo]tipo|simula[çc][ãa]o|dados fict[íi]cios|massa fict[íi]cia|exemplo fict[íi]cio/i;
// Padrões de estado dominantes no código atual (medidos em src/app em 10/10/2026).
// São ocorrências estáticas: indicam que a rota declara o estado, não que ele foi exercitado.
const LOADING_MARKERS = /variant=["']loading|phase[:=]\s*["']loading["']|\bCarregando\b|\bLendo\b/;
const ERROR_MARKERS = /variant=["']error|ErrorVariant|phase[:=]\s*["']failed["']|\bFalhou\b|\bfalhou\b/;
const EMPTY_MARKERS = /variant=["']empty|phase[:=]\s*["']empty["']|\bvazio\b|\bVazio\b|[Nn]enhum/;
const KEYBOARD_MARKERS = /onKeyDown|addEventListener\(\s*["']keydown|tabIndex|\.focus\(|focus-visible/;
const LOCALE_DEFAULT = /\.toLocale(?:Date|Time)?String\s*\(\s*\)/g;
// `UiWorkspace` é uma folha de estilos compartilhada, não um componente; por isso
// módulos CSS são contados em coluna própria.
const SHARED_UI = /components\/ui\/(Ui[A-Za-z0-9]+)/g;
const SHARED_UI_CSS = /components\/ui\/(Ui[A-Za-z0-9]+)\.module\.css/g;

const rows = [];
for (const pageFile of pageFiles) {
  const route = routeOf(pageFile);
  const sources = localSourcesOf(pageFile, allFiles, pageFiles);
  const source = (await Promise.all(sources.map((file) => readFile(file, 'utf8')))).join('\n');
  const { roles, guard } = guardOf(route, source);
  const navigation = navigationRoles.get(route) || [];
  const sharedUi = [...new Set([
    ...source.replaceAll(SHARED_UI_CSS, '').matchAll(SHARED_UI),
  ].map((match) => match[1]))].sort();
  const sharedCss = [...new Set([...source.matchAll(SHARED_UI_CSS)].map((match) => match[1]))].sort();
  const routeGates = gates.filter((gate) => !gate.broad && (route === gate.prefix || route.startsWith(`${gate.prefix}/`)));
  const baselineGates = gates.filter((gate) => gate.broad);
  const capture = captures.get(route);
  const adminScoped = /<AdminGate\b|data-admin-theme-scope/.test(source);

  rows.push({
    rota: route,
    area: areaOf(route),
    papeis_declarados: roles.join('|'),
    papeis_no_menu: navigation.join('|'),
    fonte_da_guarda: guard,
    arquivo_entrada: rel(pageFile),
    layout: layoutOf(pageFile, layoutFiles),
    arquivos_locais: sources.length,
    componentes_ui_compartilhados: sharedUi.join('|'),
    estilos_ui_compartilhados: sharedCss.join('|'),
    usa_admin_gate: /<AdminGate\b/.test(source) ? 'sim' : 'nao',
    escopo_tema_administrativo: adminScoped ? 'sim' : 'nao',
    tabelas: countOccurrences(source, /<table\b/g),
    marcadores_demo: DEMO_MARKERS.test(source) ? 'sim' : 'nao',
    estados_carregando: LOADING_MARKERS.test(source) ? 'sim' : 'nao',
    estados_erro: ERROR_MARKERS.test(source) ? 'sim' : 'nao',
    estados_vazio: EMPTY_MARKERS.test(source) ? 'sim' : 'nao',
    marcadores_teclado: KEYBOARD_MARKERS.test(source) ? 'sim' : 'nao',
    chamadas_locale_padrao: countOccurrences(source, LOCALE_DEFAULT),
    gate_baseline: baselineGates.map((gate) => gate.workflow).join('|'),
    gates_automatizados: routeGates.map((gate) => gate.workflow).join('|'),
    gates_jobs: [...new Set(routeGates.flatMap((gate) => gate.jobs.split('|')))].filter(Boolean).join('|'),
    capturas_viewports: capture ? [...capture.viewports].sort().join('|') : '',
    capturas_stage: capture ? [...capture.stages].sort().join('|') : '',
    capturas_primeiro_foco: capture?.firstFocus ? 'sim' : 'nao',
  });
}

rows.sort((a, b) => a.rota.localeCompare(b.rota, 'pt-BR'));

const REQUIRED_VIEWPORTS = ['320', '390', '768', '1440'];

function matrixRow(row) {
  const component = row.componentes_ui_compartilhados
    ? `componentes compartilhados: ${row.componentes_ui_compartilhados}`
    : 'sem componente UI compartilhado detectado no diretório da rota';
  const theme = row.escopo_tema_administrativo === 'sim'
    ? 'dentro do escopo admin (tokens dia/noite); noite nao comprovado por captura'
    : 'fora do escopo do tema administrativo';
  const viewports = row.capturas_viewports ? row.capturas_viewports.split('|') : [];
  const covered = REQUIRED_VIEWPORTS.filter((width) => viewports.some((viewport) => viewport.startsWith(`${width}x`)));
  const responsiveness = viewports.length
    ? `capturado em ${viewports.join(', ')}; faltam ${REQUIRED_VIEWPORTS.filter((width) => !covered.includes(width)).map((width) => `${width}px`).join(', ') || 'nenhum'}`
    : 'sem captura; 320/390/768/1440 px nao verificados';
  const keyboard = row.capturas_primeiro_foco === 'sim'
    ? 'primeiro foco registrado em captura; percurso completo nao verificado'
    : (row.marcadores_teclado === 'sim' ? 'marcadores de teclado no codigo; nao verificado em navegador' : 'sem marcador e sem verificacao');
  const states = [
    row.estados_carregando === 'sim' ? 'carregando' : null,
    row.estados_erro === 'sim' ? 'erro' : null,
    row.estados_vazio === 'sim' ? 'vazio' : null,
  ].filter(Boolean);
  const statesLabel = `${states.length ? states.join('/') : 'nenhum estado detectado'} (ocorrencia estatica no codigo)`;
  const evidence = [
    'codigo (inventario gerado por scripts/ux-pro-00-inventory.mjs)',
    row.gate_baseline ? `teste automatizado de compilacao/unidade (baseline): ${row.gate_baseline}` : null,
    row.gates_automatizados ? `teste automatizado de jornada: ${row.gates_automatizados}` : null,
    row.capturas_viewports ? `captura visual: ${row.capturas_stage} @ ${row.capturas_viewports}` : null,
    'validacao manual: nao_registrado (sem fonte legivel por maquina)',
    'aceite humano: nao_registrado (nunca inferido automaticamente)',
  ].filter(Boolean).join(' ; ');
  const classRank = row.capturas_viewports ? 3 : row.gates_automatizados ? 2 : 1;
  const evidenceClass = ['codigo', 'teste automatizado de jornada', 'captura visual'][classRank - 1];
  const gaps = [];
  if (!row.gates_automatizados) gaps.push('sem gate automatizado que alcance a rota');
  if (!row.capturas_viewports) gaps.push('sem captura visual');
  else gaps.push(`captura ausente em ${REQUIRED_VIEWPORTS.filter((width) => !covered.includes(width)).map((width) => `${width}px`).join('/') || '—'}`);
  if (row.escopo_tema_administrativo === 'sim') gaps.push('tema noturno sem captura');
  else gaps.push('fora do escopo do tema administrativo; identidade da area nao verificada');
  gaps.push('percurso de teclado nao verificado');
  gaps.push('estados nao exercitados em navegador');
  gaps.push('validacao manual e aceite humano nao registrados');
  return {
    rota: row.rota,
    area_papel: `${row.area} | ${row.papeis_declarados || row.papeis_no_menu || 'sem papel declarado na pagina'}`,
    componente: `${component} | layout: ${row.layout || 'nenhum layout proprio'}`,
    tema: theme,
    responsividade: responsiveness,
    teclado: keyboard,
    estados: statesLabel,
    evidencia: evidence,
    classe_evidencia: evidenceClass,
    lacuna: gaps.join(' ; '),
  };
}

const matrixRows = rows.map(matrixRow);

const inventoryColumns = Object.keys(rows[0]);
const matrixColumns = Object.keys(matrixRows[0]);
const toCsv = (columns, data) => [
  columns.map(csv).join(','),
  ...data.map((row) => columns.map((column) => csv(row[column])).join(',')),
].join('\n') + '\n';

const inventoryCsv = toCsv(inventoryColumns, rows);
const matrixCsv = toCsv(matrixColumns, matrixRows);

const areaCounts = {};
for (const row of rows) areaCounts[row.area] = (areaCounts[row.area] || 0) + 1;
const evidenceClassCounts = {};
for (const row of matrixRows) evidenceClassCounts[row.classe_evidencia] = (evidenceClassCounts[row.classe_evidencia] || 0) + 1;

const historical = await historicalRouteSets();
const currentRoutes = new Set(rows.map((row) => row.rota));
const reconciliation = historical.map((entry) => {
  if (!entry.routes) return { ...entry, total: null, added: null, removed: null };
  return {
    ...entry,
    total: entry.routes.size,
    added: [...currentRoutes].filter((route) => !entry.routes.has(route)).sort(),
    removed: [...entry.routes].filter((route) => !currentRoutes.has(route)).sort(),
  };
});

/** Componentes compartilhados que nenhuma rota nem outro componente importa. */
async function orphanSharedComponents() {
  const uiRoot = path.join(root, 'src', 'components', 'ui');
  let components = [];
  try {
    components = (await readdir(uiRoot)).filter((name) => /^Ui[A-Za-z0-9]+\.tsx$/.test(name)).sort();
  } catch {
    return [];
  }
  const consumers = (await walk(path.join(root, 'src')))
    .filter((file) => /\.(?:tsx|jsx|ts|mts)$/.test(file) && !file.startsWith(uiRoot + path.sep));
  const haystack = (await Promise.all(consumers.map((file) => readFile(file, 'utf8')))).join('\n');
  return components
    .map((name) => name.replace(/\.tsx$/, ''))
    .filter((name) => !new RegExp(`components/ui/${name}(?![A-Za-z0-9])`).test(haystack));
}

const orphanComponents = await orphanSharedComponents();

const summary = {
  criterio: '1 entrada = 1 arquivo page.(tsx|jsx|ts|js) em src/app; grupos (nome) removidos; [param] literal',
  entradasDeRota: rows.length,
  rotasDistintas: currentRoutes.size,
  porArea: areaCounts,
  rotasComPapeisDeclarados: rows.filter((row) => row.papeis_declarados).length,
  rotasDentroDoEscopoTemaAdministrativo: rows.filter((row) => row.escopo_tema_administrativo === 'sim').length,
  rotasComGateAutomatizado: rows.filter((row) => row.gates_automatizados).length,
  rotasComCapturaVisual: rows.filter((row) => row.capturas_viewports).length,
  chamadasLocalePadrao: rows.reduce((sum, row) => sum + row.chamadas_locale_padrao, 0),
  rotasComComponenteUiCompartilhado: rows.filter((row) => row.componentes_ui_compartilhados).length,
  rotasSemComponenteNemEstiloUiCompartilhado: rows.filter((row) => !row.componentes_ui_compartilhados && !row.estilos_ui_compartilhados).length,
  componentesUiCompartilhadosOrfaos: orphanComponents,
  classesDeEvidencia: evidenceClassCounts,
  reconciliacao: reconciliation.map((entry) => ({
    inventario: entry.id,
    arquivo: entry.file,
    linhasRegistradas: entry.registrados,
    rotasDistintasRegistradas: entry.total,
    linhasSemBarraInicial: entry.semBarraInicial,
    raizGravadaComoArquivo: entry.raizGravadaComoArquivo,
    adicionadasDesde: entry.added,
    removidasDesde: entry.removed,
  })),
};

if (process.argv.includes('--check')) {
  const currentInventory = await readFile(path.join(root, INVENTORY_CSV), 'utf8').catch(() => '');
  const currentMatrix = await readFile(path.join(root, MATRIX_CSV), 'utf8').catch(() => '');
  const outdated = [];
  if (currentInventory !== inventoryCsv) outdated.push(INVENTORY_CSV);
  if (currentMatrix !== matrixCsv) outdated.push(MATRIX_CSV);
  console.log(JSON.stringify(summary, null, 2));
  if (outdated.length) {
    console.error(`DESATUALIZADO: ${outdated.join(', ')} — rode "node scripts/ux-pro-00-inventory.mjs" e versiona o resultado.`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${INVENTORY_CSV} e ${MATRIX_CSV} conferem com o código atual.`);
  }
} else {
  await writeFile(path.join(root, INVENTORY_CSV), inventoryCsv, 'utf8');
  await writeFile(path.join(root, MATRIX_CSV), matrixCsv, 'utf8');
  console.log(JSON.stringify({ ...summary, inventario: INVENTORY_CSV, matriz: MATRIX_CSV }, null, 2));
}
