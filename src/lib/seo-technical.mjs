// PUB-08 — SEO técnico. Módulo PURO: não lê banco, não lê `process.env` e não
// faz I/O. Quem chama entrega o ambiente e o catálogo; aqui só existe decisão
// determinística, para que o teste de unidade cubra os dois estados
// (liberado / não liberado) sem subir servidor.
//
// Política registrada em `docs/PROMPT-CONTINUACAO-PUB08-SEO-TECNICO.md`.

/** Prefixos que nunca podem ser indexados nem virar origem de redirect. */
export const NON_PUBLIC_PREFIXES = Object.freeze([
  '/admin',
  '/api',
  '/cliente',
  '/funcionario',
  '/proposta',
  '/qa',
]);

/** Acrescenta o que é interno do framework; não aparece no robots público. */
export const RESERVED_PREFIXES = Object.freeze([...NON_PUBLIC_PREFIXES, '/_next']);

/** Caminhos que a própria fatia serve e que nenhum redirect pode sombrear. */
export const RESERVED_EXACT_PATHS = Object.freeze(['/robots.txt', '/sitemap.xml', '/favicon.ico']);

/**
 * Rotas públicas estáticas que existem de fato em `src/app`.
 * Deliberadamente fora: `/layout-01`..`/layout-10` (prévias de layouts
 * alternativos, conteúdo duplicado da home), `/qa/modulos` (conferência
 * interna) e `/proposta/aceite/[token]` (endereço por destinatário).
 */
export const STATIC_PUBLIC_PATHS = Object.freeze([
  '/',
  '/servicos',
  '/segmentos',
  '/faq',
  '/contato',
  '/orcamento',
  '/simulador',
  '/privacidade',
]);

/**
 * Indexação só é liberada com as DUAS condições que `src/app/layout.tsx` já
 * usa para a meta tag. Manter a mesma regra nos dois lugares é o que impede
 * `robots.txt` e `<meta name="robots">` de se contradizerem.
 */
export function isIndexingReleased(env = {}) {
  return env.NEXT_PUBLIC_ENV === 'production' && env.NEXT_PUBLIC_ALLOW_INDEX === 'true';
}

/** Escape XML. Sem isto, uma URL com `&` ou `<` quebra ou injeta o documento. */
export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * Lista derivada das rotas públicas reais. `services` e `segments` vêm do
 * mesmo catálogo que as páginas renderizam, então o mapa não pode divergir do
 * site: se um serviço sair do catálogo, ele sai do sitemap junto.
 */
export function listPublicPaths({ services = [], segments = [] } = {}) {
  const paths = [...STATIC_PUBLIC_PATHS];
  for (const service of services) {
    const name = typeof service === 'string' ? service : service?.name;
    if (typeof name === 'string' && name.trim()) paths.push(`/servicos/${encodeURIComponent(name)}`);
  }
  for (const segment of segments) {
    const key = typeof segment === 'string' ? segment : segment?.key;
    if (typeof key === 'string' && key.trim()) paths.push(`/segmentos/${encodeURIComponent(key)}`);
  }
  // Sem duplicata e com ordem estável: o documento precisa ser reproduzível.
  return [...new Set(paths)];
}

export function isReservedPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return true;
  if (RESERVED_EXACT_PATHS.includes(path)) return true;
  return RESERVED_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * `/robots.txt`. Fora de produção o padrão é negar tudo e NÃO anunciar
 * sitemap: enquanto não há liberação, não há mapa publicado.
 */
export function buildRobotsTxt({ released = false, origin = '' } = {}) {
  if (!released) {
    return [
      '# Ambiente não produtivo: indexação bloqueada por padrão (PUB-08).',
      '# Liberar exige NEXT_PUBLIC_ENV=production e NEXT_PUBLIC_ALLOW_INDEX=true.',
      'User-agent: *',
      'Disallow: /',
      '',
    ].join('\n');
  }
  const lines = ['User-agent: *', 'Allow: /'];
  for (const prefix of NON_PUBLIC_PREFIXES) lines.push(`Disallow: ${prefix}`);
  if (origin) lines.push('', `Sitemap: ${origin}/sitemap.xml`);
  lines.push('');
  return lines.join('\n');
}

/**
 * `/sitemap.xml`. Só `<loc>`: não existe fonte verdadeira para `lastmod`,
 * `priority` ou `changefreq` (as páginas são código, não conteúdo com data de
 * alteração), e preencher com um palpite seria inventar dado com cara de fato.
 */
export function buildSitemapXml({ origin = '', paths = [] } = {}) {
  const body = paths.map(path => `  <url><loc>${escapeXml(`${origin}${path}`)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}${body ? '\n' : ''}</urlset>\n`;
}

/**
 * Normaliza um caminho interno de redirect. Devolve `null` (fail-closed) para
 * qualquer coisa que não seja caminho absoluto interno: `//host` (relativo a
 * protocolo), `http://`, barra invertida, espaço, caractere de controle, `..`,
 * query e fragmento. É aqui que o open redirect é barrado.
 */
export function normalizeRedirectPath(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value.length < 1 || value.length > 500) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  if (value.includes('\\')) return null;
  if (value.includes('://')) return null;
  if (value.includes('?') || value.includes('#')) return null;
  if (/\s/.test(value)) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  if (value.split('/').includes('..')) return null;
  const trimmed = value.length > 1 ? value.replace(/\/+$/, '') : value;
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Regras de cadastro do redirect, todas fail-closed. Devolve o código do erro
 * ou `null` quando está tudo certo. `activeRedirects` já vem sem a própria
 * linha quando a chamada é de alteração.
 */
export function validateRedirect({ oldPath, newPath, publicPaths = [], activeRedirects = [] } = {}) {
  if (!oldPath || !newPath) return 'invalid_path';
  if (oldPath === newPath) return 'cannot_redirect_to_self';
  const publicSet = new Set(publicPaths);
  // A origem não pode esconder rota que existe — nem pública, nem interna.
  if (publicSet.has(oldPath) || isReservedPath(oldPath)) return 'cannot_shadow_existing_route';
  // O destino precisa existir de verdade: redirect para 404 é promessa quebrada,
  // e exigir rota pública impede usar o redirect para alcançar área interna.
  if (!publicSet.has(newPath)) return 'redirect_target_not_public';
  // Segunda barreira. As duas regras acima já tornam cadeia impossível hoje
  // (origem nunca é rota pública, destino sempre é), mas a lista pública muda
  // com o catálogo: se um serviço sair, um destino antigo deixa de ser público
  // e poderia virar origem. Então a checagem fica.
  for (const redirect of activeRedirects) {
    if (redirect?.old_path === newPath) return 'redirect_chain_not_allowed';
    if (redirect?.new_path === oldPath) return 'redirect_chain_not_allowed';
  }
  return null;
}

/**
 * Extensões de asset estático. Só estas pulam a consulta — `.html` NÃO entra,
 * porque endereço legado terminado em `.html` é justamente um dos casos que
 * mais precisam de redirect.
 */
const STATIC_ASSET_EXTENSIONS = Object.freeze([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.ico', '.bmp',
  '.css', '.js', '.mjs', '.map', '.json', '.webmanifest',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp4', '.webm', '.mp3', '.pdf', '.zip', '.txt', '.xml',
]);

/** Caminhos que nem sequer consultam a tabela de redirects. */
export function skipsRedirectLookup(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return true;
  if (pathname === '/') return false;
  // Caminho reservado nunca pode ser origem (o cadastro recusa), então
  // consultar o banco para ele seria consulta garantidamente vazia.
  if (isReservedPath(pathname)) return true;
  const lowered = pathname.toLowerCase();
  return STATIC_ASSET_EXTENSIONS.some(extension => lowered.endsWith(extension));
}
