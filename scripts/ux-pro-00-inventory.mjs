#!/usr/bin/env node
// UX-PRO-00 — inventário vigente de rotas e matriz de cobertura, gerados a partir do código.
// Somente leitura: não inicia servidor, banco ou rede. Não substitui teste de navegador,
// de teclado, de tema ou de API; apenas registra o que o código declara e o que os gates citam.
//
// Uso:
//   node scripts/ux-pro-00-inventory.mjs            # imprime o CSV da matriz em stdout
//   node scripts/ux-pro-00-inventory.mjs --write    # grava docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-10.csv
//   node scripts/ux-pro-00-inventory.mjs --summary  # imprime contagens reconciliadas (JSON)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MATRIX_FILE = 'docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-10.csv';
const SELF = 'scripts/ux-pro-00-inventory.mjs';

// Áreas de apresentação fora do catálogo administrativo. Cada regra é explícita e ordenada.
const NON_ADMIN_AREAS = [
  [/^\/cliente\/app(\/|$)/, 'Área autenticada do cliente'],
  [/^\/cliente(\/|$)/, 'Portal do cliente (entrada, prévia e recuperação)'],
  [/^\/funcionario$/, 'Portal do funcionário'],
  [/^\/qa(\/|$)/, 'QA e homologação (condicional ao ambiente)'],
  [/^\/(layout-\d{2}|layout-preview)$/, 'Prévias de layout do site (não publicadas)'],
];

// Entradas de exceção/redirect do próprio /admin, conforme tests/admin-page-gates.test.mjs.
const ADMIN_NON_GATE = {
  '/admin': 'hub: AdminHub contém AdminGate',
  '/admin/entrar': 'entrada de login da equipe (sem AdminGate, por desenho)',
  '/admin/convite': 'exceção deliberada: aceite de convite (sem AdminGate)',
  '/admin/verificacao-manual': 'exceção deliberada: verificação manual (sem AdminGate)',
  '/admin/visual': 'redirect de compatibilidade para /admin/aparencia',
};

const MAX_DEPTH = 2;
// Scripts que apenas produzem capturas de tela: não contam como teste de cobertura de rota.
const CAPTURE_TOOLS = new Set(['scripts/ux-evidence-capture.mjs', 'scripts/ux-evidence-postgres.mjs', 'scripts/audit-ui-inventory.mjs']);
const CODE_EXT = ['.tsx', '.ts', '.mjs', '.js'];

function walkPages(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPages(full, out);
    else if (entry.name === 'page.tsx') out.push(full);
  }
  return out;
}

function toRoute(root, file) {
  const rel = path.relative(path.join(root, 'src/app'), path.dirname(file)).split(path.sep).join('/');
  return rel ? `/${rel}` : '/';
}

function resolveSpec(root, fromFile, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(root, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // pacote externo
  const candidates = [base, ...CODE_EXT.map(ext => base + ext), ...CODE_EXT.map(ext => path.join(base, 'index' + ext))];
  for (const c of candidates) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  if (base.endsWith('.css') && fs.existsSync(base)) return base;
  return null;
}

function importsOf(source) {
  const specs = new Set();
  for (const m of source.matchAll(/(?:import|export)\s+(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g)) specs.add(m[1]);
  for (const m of source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.add(m[1]);
  return [...specs];
}

// Coleta a árvore de arquivos da rota: página + dependências locais até MAX_DEPTH.
function routeTree(root, pageFile) {
  const seen = new Map(); // abs -> depth
  const queue = [[pageFile, 0]];
  while (queue.length) {
    const [file, depth] = queue.shift();
    if (seen.has(file)) continue;
    seen.set(file, depth);
    if (!/\.(tsx|ts|mjs|js)$/.test(file) || depth >= MAX_DEPTH) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const spec of importsOf(source)) {
      const target = resolveSpec(root, file, spec);
      if (!target || target === file) continue;
      if (target.endsWith('.css')) { if (!seen.has(target)) seen.set(target, depth + 1); continue; }
      if (path.basename(target) === 'page.tsx') continue; // nunca puxa outra rota
      if (target.includes(`${path.sep}src${path.sep}lib${path.sep}`)) { if (!seen.has(target)) seen.set(target, depth + 1); continue; }
      queue.push([target, depth + 1]);
    }
  }
  return seen;
}

function countMatches(texts, regex) {
  return texts.reduce((n, t) => n + (t.match(new RegExp(regex.source, 'g'))?.length || 0), 0);
}

// Verifica se a rota exata aparece citada num arquivo de gate (entre aspas simples, duplas ou crase; sem casar subrotas).
function citesRoute(text, route) {
  const esc = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(["'\`])${esc}(?:[?#]|\\1)`).test(text);
}

function gateCitations(route, gateFiles) {
  const hits = [];
  for (const { rel, text } of gateFiles) if (citesRoute(text, route)) hits.push(rel);
  return hits;
}

function listGateFiles(root) {
  const dirs = ['scripts', 'tests'];
  const files = [];
  for (const d of dirs) {
    const full = path.join(root, d);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full).sort()) {
      if (!/\.(mjs|js|ts|tsx)$/.test(name)) continue;
      const rel = `${d}/${name}`;
      if (rel === SELF || CAPTURE_TOOLS.has(rel)) continue; // mesma ordem em qualquer SO
      files.push({ rel, text: fs.readFileSync(path.join(root, rel), 'utf8') });
    }
  }
  return files;
}

// Capturas registradas: resumo.json (campo route) e screenshots nomeados nas pastas de evidência.
function captureIndex(root) {
  const docs = path.join(root, 'docs');
  const entries = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === 'resumo.json') {
        try {
          const json = JSON.parse(fs.readFileSync(full, 'utf8'));
          for (const item of json.entries || []) {
            if (item.route) entries.push({ route: item.route, file: path.relative(root, full).split(path.sep).join('/'), screenshot: item.screenshot || '' });
          }
        } catch { /* ignora JSON inválido; não inventa captura */ }
      }
    }
  };
  walk(docs);
  return entries;
}

function areaFor(route, catalogueGroupOf) {
  if (route.startsWith('/admin')) {
    const group = catalogueGroupOf(route);
    if (group) return group;
    return 'Área administrativa — fora do catálogo global';
  }
  const hit = NON_ADMIN_AREAS.find(([re]) => re.test(route));
  if (hit) return hit[1];
  return 'Site público e entradas';
}

const CSV_COLUMNS = [
  'rota', 'area', 'posicao_no_catalogo', 'papel_declarado', 'gate', 'layout', 'arquivo',
  'componentes_compartilhados', 'primitivos_ui', 'tema_tokens', 'tema_cores_literais', 'tema_scope_dia_noite',
  'responsividade_media_queries', 'estados_no_codigo', 'marcadores_demonstrativos', 'marcador_previa',
  'evid_codigo', 'evid_teste_automatizado', 'evid_captura_visual', 'evid_validacao_manual', 'evid_aceite_humano',
  'lacunas',
];

export function buildMatrix(root) {
  root = path.resolve(root);
  const navSource = fs.readFileSync(path.join(root, 'src/lib/admin-navigation.mjs'), 'utf8');
  const catalogueHrefs = new Map();
  const groupSource = navSource.split('export function groupAdminModules')[0];
  for (const g of groupSource.matchAll(/\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*hrefs:\s*\[([^\]]*)\]/g)) {
    for (const h of g[3].matchAll(/'([^']+)'/g)) catalogueHrefs.set(h[1], g[2]);
  }
  const catalogueGroupOf = (route) => {
    if (catalogueHrefs.has(route)) return catalogueHrefs.get(route);
    // subrota de um destino do catálogo (ex.: /admin/contratos/[id] -> /admin/contratos)
    const parent = [...catalogueHrefs.keys()].filter(h => route.startsWith(h + '/')).sort((a, b) => b.length - a.length)[0];
    return parent ? catalogueHrefs.get(parent) + ' (subrota)' : '';
  };

  const gateFiles = listGateFiles(root);
  const captures = captureIndex(root);
  const pages = walkPages(path.join(root, 'src/app'));
  const rows = [];

  for (const pageFile of pages) {
    const route = toRoute(root, pageFile);
    const rel = path.relative(root, pageFile).split(path.sep).join('/');
    const source = fs.readFileSync(pageFile, 'utf8');
    const tree = routeTree(root, pageFile);
    const texts = [...tree.keys()].filter(f => /\.(tsx|ts|mjs|js)$/.test(f)).map(f => fs.readFileSync(f, 'utf8'));
    const cssFiles = [...tree.keys()].filter(f => f.endsWith('.css'));
    const cssTexts = cssFiles.map(f => fs.readFileSync(f, 'utf8'));
    const allText = texts.join('\n');

    // papel e gate
    const roleMatch = source.match(/allowedRoles=\{\[([^\]]*)\]/s) || texts.join('\n').match(/allowedRoles=\{\[([^\]]*)\]/s);
    let papel;
    let gate;
    if (roleMatch) {
      papel = [...roleMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]).join(',');
      gate = 'AdminGate (papéis literais)';
    } else if (route.startsWith('/admin')) {
      papel = route === '/admin' ? 'conforme AdminHub' : 'não declarado';
      gate = ADMIN_NON_GATE[route] || 'sem AdminGate — revisar';
    } else if (route.startsWith('/cliente/app')) {
      papel = 'cliente com grant ativo (servidor decide)';
      gate = 'RealAccessShell + ClientSpaceProvider (layout)';
    } else if (route === '/funcionario') {
      papel = 'funcionário próprio (servidor decide)';
      gate = 'EmployeePortal (sessão no componente)';
    } else {
      papel = 'público ou sem papel declarado no arquivo';
      gate = 'nenhum no arquivo de rota';
    }

    const layout = route.startsWith('/cliente/app') ? 'src/app/layout.tsx + src/app/cliente/app/layout.tsx' : 'src/app/layout.tsx';

    // componentes compartilhados: arquivos fora da pasta da rota e fora de src/lib
    const routeDir = path.dirname(pageFile) + path.sep;
    const shared = [...tree.keys()]
      .filter(f => /\.(tsx|ts)$/.test(f) && f !== pageFile && !f.startsWith(routeDir) && !f.includes(`${path.sep}src${path.sep}lib${path.sep}`))
      .map(f => path.relative(path.join(root, 'src'), f).split(path.sep).join('/'))
      .sort();
    const primitives = [...new Set([...allText.matchAll(/\b(Ui[A-Z][A-Za-z]+)\b/g)].map(m => m[1]))].sort();

    // tema: tokens vs cores literais; scope dia/noite
    const tokens = countMatches([allText, ...cssTexts], /var\(--/);
    const literals = countMatches([allText, ...cssTexts], /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(/);
    const scopeInTree = /data-admin-theme-scope/.test(allText) || cssTexts.some(t => /data-admin-theme-scope/.test(t));
    const themeScope = gate.startsWith('AdminGate')
      ? (scopeInTree ? 'escopo data-admin-theme-scope presente na árvore (AdminGate)' : 'AdminGate sem escopo de tema identificado')
      : (scopeInTree ? 'escopo data-admin-theme-scope presente na árvore' : 'não declarado (sem escopo administrativo)');
    const media = countMatches(cssTexts, /@media/);

    const states = [];
    if (/UiState/.test(allText)) states.push('UiState');
    if (/carregando|loading/i.test(allText)) states.push('carregamento');
    if (/\berro\b|erro|falha|error/i.test(allText)) states.push('erro');
    if (/vazio|nenhum[ao]?\s|sem (registros|dados|pedidos|itens)|empty/i.test(allText)) states.push('vazio');
    if (/negado|403|forbidden|sem permiss/i.test(allText)) states.push('negado');
    if (/sucesso|salv|registrad/i.test(allText)) states.push('sucesso');

    const demoWords = [...new Set([...allText.matchAll(/demonstrativ\w*|demonstração|demonstracao|fict[ií]c\w*|exemplo|protótipo|prototipo|simulad\w*|mock|seed/gi)].map(m => m[0].toLowerCase()))].sort();
    const previa = /PRÉVIA|prévia|PREVIA/.test(allText) ? 'sim' : 'não';

    const testHits = gateCitations(route, gateFiles);
    const capHits = captures.filter(c => c.route === route);
    const capCount = capHits.length;

    const lacunas = [];
    if (testHits.length === 0) lacunas.push('sem gate automatizado que cite a rota');
    if (capCount === 0) lacunas.push('sem captura visual registrada');
    lacunas.push('teclado não validado nesta matriz');
    lacunas.push('dia/noite não validado nesta matriz');
    lacunas.push('responsividade 320/390/768/1440 não validada nesta matriz');
    if (gate.startsWith('sem AdminGate')) lacunas.push('entrada sem AdminGate: ver reconciliação');
    if (gate === ADMIN_NON_GATE['/admin/visual']) lacunas.push('redirect: sem tela própria para testar');
    if (states.length === 0) lacunas.push('estados não declarados no código da rota');
    if (demoWords.length) lacunas.push('dados demonstrativos/prévia sinalizados no código');
    if (media === 0 && cssFiles.length) lacunas.push('sem @media nos CSS da rota');

    rows.push({
      rota: route,
      area: areaFor(route, catalogueGroupOf),
      posicao_no_catalogo: route.startsWith('/admin') ? (catalogueHrefs.has(route) ? 'destino direto' : (catalogueGroupOf(route) ? 'subrota de destino' : 'fora do catálogo')) : 'não aplicável',
      papel_declarado: papel,
      gate,
      layout,
      arquivo: rel,
      componentes_compartilhados: shared.join(' | ') || 'nenhum',
      primitivos_ui: primitives.join(' | ') || 'nenhum',
      tema_tokens: tokens,
      tema_cores_literais: literals,
      tema_scope_dia_noite: themeScope,
      responsividade_media_queries: media,
      estados_no_codigo: states.join(' | ') || 'nenhum declarado',
      marcadores_demonstrativos: demoWords.join(' | ') || 'nenhum',
      marcador_previa: previa,
      evid_codigo: `código: ${rel}`,
      evid_teste_automatizado: testHits.length ? `${testHits.length} arquivo(s): ${testHits.join(' | ')}` : '0',
      evid_captura_visual: capCount ? `${capCount} registro(s) em ${[...new Set(capHits.map(c => c.file))].join(' | ')}` : '0',
      evid_validacao_manual: 'não registrada por rota no repositório',
      evid_aceite_humano: 'não registrado por rota',
      lacunas: lacunas.join('; '),
    });
  }

  rows.sort((a, b) => (a.rota < b.rota ? -1 : a.rota > b.rota ? 1 : 0));
  return rows;
}

const csvCell = value => `"${String(value).replaceAll('"', '""')}"`;

export function toCsv(rows) {
  return [CSV_COLUMNS.join(','), ...rows.map(r => CSV_COLUMNS.map(c => csvCell(r[c] ?? '')).join(','))].join('\n') + '\n';
}

export function summarize(rows) {
  const count = (fn) => rows.filter(fn).length;
  const isAdmin = r => r.rota === '/admin' || r.rota.startsWith('/admin/');
  const isCliente = r => r.rota === '/cliente' || r.rota.startsWith('/cliente/');
  return {
    total_page_tsx: rows.length,
    admin: count(isAdmin),
    cliente: count(isCliente),
    cliente_app: count(r => r.rota.startsWith('/cliente/app')),
    demais: count(r => !isAdmin(r) && !isCliente(r)),
    admin_gate_papeis_literais: count(r => r.gate.startsWith('AdminGate (papéis literais)')),
    admin_sem_gate_literal: rows.filter(r => isAdmin(r) && !r.gate.startsWith('AdminGate (papéis literais)')).map(r => r.rota),
    catalogo_destinos_diretos: count(r => r.posicao_no_catalogo === 'destino direto'),
    admin_fora_do_catalogo: rows.filter(r => r.posicao_no_catalogo === 'fora do catálogo').map(r => r.rota),
    com_teste_automatizado: count(r => r.evid_teste_automatizado !== '0'),
    com_captura_visual: count(r => r.evid_captura_visual !== '0'),
    sem_nenhuma_evidencia_automatizada_ou_visual: count(r => r.evid_teste_automatizado === '0' && r.evid_captura_visual === '0'),
  };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rows = buildMatrix(root);
  const csv = toCsv(rows);
  if (process.argv.includes('--summary')) {
    process.stdout.write(JSON.stringify(summarize(rows), null, 2) + '\n');
  } else if (process.argv.includes('--write')) {
    fs.writeFileSync(path.join(root, MATRIX_FILE), csv);
    process.stdout.write(`gravado ${MATRIX_FILE} (${rows.length} rotas)\n`);
  } else {
    process.stdout.write(csv);
  }
}
