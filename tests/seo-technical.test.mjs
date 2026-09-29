// PUB-08 — teste de unidade do módulo PURO de SEO técnico.
// Cobre os dois estados de liberação sem subir servidor nem banco: o gate de
// integração prova a ligação HTTP, aqui provamos a decisão.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NON_PUBLIC_PREFIXES,
  STATIC_PUBLIC_PATHS,
  buildRobotsTxt,
  buildSitemapXml,
  escapeXml,
  isIndexingReleased,
  isReservedPath,
  listPublicPaths,
  normalizeRedirectPath,
  skipsRedirectLookup,
  validateRedirect,
} from '../src/lib/seo-technical.mjs';

test('PUB-08: indexação só é liberada com as DUAS variáveis de produção', () => {
  assert.equal(isIndexingReleased({}), false);
  assert.equal(isIndexingReleased({ NEXT_PUBLIC_ENV: 'production' }), false);
  assert.equal(isIndexingReleased({ NEXT_PUBLIC_ALLOW_INDEX: 'true' }), false);
  assert.equal(isIndexingReleased({ NEXT_PUBLIC_ENV: 'preview', NEXT_PUBLIC_ALLOW_INDEX: 'true' }), false);
  // Só a combinação exata libera; 'TRUE'/'1' não contam.
  assert.equal(isIndexingReleased({ NEXT_PUBLIC_ENV: 'production', NEXT_PUBLIC_ALLOW_INDEX: 'TRUE' }), false);
  assert.equal(isIndexingReleased({ NEXT_PUBLIC_ENV: 'production', NEXT_PUBLIC_ALLOW_INDEX: '1' }), false);
  assert.equal(isIndexingReleased({ NEXT_PUBLIC_ENV: 'production', NEXT_PUBLIC_ALLOW_INDEX: 'true' }), true);
});

test('PUB-08: robots fora de produção nega tudo e não anuncia sitemap', () => {
  const robots = buildRobotsTxt({ released: false, origin: 'https://exemplo.test' });
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Disallow: \/$/m);
  assert.equal(/^Allow:/m.test(robots), false);
  assert.equal(robots.includes('Sitemap:'), false, 'sem liberação não há mapa publicado para anunciar');
});

test('PUB-08: robots em produção liberada nega as áreas internas e anuncia o sitemap', () => {
  const robots = buildRobotsTxt({ released: true, origin: 'https://exemplo.test' });
  assert.match(robots, /^Allow: \/$/m);
  for (const prefix of NON_PUBLIC_PREFIXES) {
    assert.match(robots, new RegExp(`^Disallow: ${prefix}$`, 'm'), `${prefix} precisa continuar negado mesmo liberado`);
  }
  assert.match(robots, /^Sitemap: https:\/\/exemplo\.test\/sitemap\.xml$/m);
  // "Disallow: /" puro nunca pode sobrar na versão liberada.
  assert.equal(/^Disallow: \/$/m.test(robots), false);
});

test('PUB-08: sitemap traz só <loc>, sem lastmod/priority/changefreq inventados', () => {
  const xml = buildSitemapXml({ origin: 'https://exemplo.test', paths: ['/', '/faq'] });
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<url><loc>https:\/\/exemplo\.test\/<\/loc><\/url>/);
  assert.match(xml, /<url><loc>https:\/\/exemplo\.test\/faq<\/loc><\/url>/);
  for (const inventado of ['<lastmod>', '<priority>', '<changefreq>']) {
    assert.equal(xml.includes(inventado), false, `${inventado} não tem fonte verdadeira e não pode ser preenchido`);
  }
  // Documento vazio continua bem formado.
  assert.match(buildSitemapXml({ origin: 'https://exemplo.test', paths: [] }), /<urlset[^>]*>\n?<\/urlset>/);
});

test('PUB-08: XML é escapado — concatenação crua permitiria injeção', () => {
  assert.equal(escapeXml('a & b'), 'a &amp; b');
  assert.equal(escapeXml('<loc>'), '&lt;loc&gt;');
  assert.equal(escapeXml('aspas " e \''), 'aspas &quot; e &apos;');
  // & é trocado primeiro: não pode virar &amp;amp;
  assert.equal(escapeXml('&lt;'), '&amp;lt;');
  const xml = buildSitemapXml({ origin: 'https://exemplo.test', paths: ['/busca?a=1&b=2', '/x"><script>'] });
  assert.equal(xml.includes('&b=2'), false, 'o & precisa sair escapado');
  assert.equal(xml.includes('<script>'), false, 'nenhuma marcação pode escapar para dentro do documento');
  assert.match(xml, /&amp;b=2/);
});

test('PUB-08: a lista pública é derivada do catálogo e exclui superfície interna', () => {
  const paths = listPublicPaths({
    services: [{ name: 'Câmeras e CFTV' }, { name: 'Portaria e Controle de Acesso' }],
    segments: [{ key: 'condominios_residenciais' }],
  });
  for (const estatica of STATIC_PUBLIC_PATHS) assert.ok(paths.includes(estatica), `${estatica} precisa estar no mapa`);
  assert.ok(paths.includes('/servicos/C%C3%A2meras%20e%20CFTV'), 'o nome do serviço precisa sair percent-encoded');
  assert.ok(paths.includes('/segmentos/condominios_residenciais'));
  // Nada de superfície interna ou de prévia de layout.
  for (const path of paths) {
    assert.equal(/^\/(admin|api|cliente|funcionario|proposta|qa|_next)(\/|$)/.test(path), false, `${path} não pode entrar no mapa`);
    assert.equal(/^\/layout-\d/.test(path), false, `${path} é prévia de layout, não entra no mapa`);
  }
  // Catálogo vazio não inventa página de serviço.
  assert.deepEqual(listPublicPaths({ services: [], segments: [] }), [...STATIC_PUBLIC_PATHS]);
  // Sem duplicata quando o catálogo repete.
  const repetido = listPublicPaths({ services: [{ name: 'A' }, { name: 'A' }], segments: [] });
  assert.equal(repetido.filter(path => path === '/servicos/A').length, 1);
});

test('PUB-08: caminho reservado é reconhecido', () => {
  for (const reservado of ['/admin', '/admin/leads', '/api/leads', '/cliente/painel', '/funcionario', '/_next/static/x', '/robots.txt', '/sitemap.xml']) {
    assert.equal(isReservedPath(reservado), true, `${reservado} precisa ser reservado`);
  }
  for (const livre of ['/', '/faq', '/administrativo', '/apiario']) {
    assert.equal(isReservedPath(livre), false, `${livre} não é reservado (prefixo não pode casar por substring)`);
  }
});

test('PUB-08: normalização de caminho barra open redirect e lixo', () => {
  assert.equal(normalizeRedirectPath('/promo'), '/promo');
  assert.equal(normalizeRedirectPath('  /promo  '), '/promo');
  assert.equal(normalizeRedirectPath('/promo/'), '/promo');
  assert.equal(normalizeRedirectPath('/'), '/');
  assert.equal(normalizeRedirectPath('/promo.html'), '/promo.html');
  for (const recusado of [
    '//evil.test/x',            // relativo a protocolo
    'http://evil.test',         // absoluto externo
    'https://evil.test',
    '/x\\y',                    // barra invertida
    '/x y',                     // espaço
    '/x\ty',
    '/x\ny',
    '/x\u0000y',                // controle
    '/../etc',                  // travessia
    '/a/../../b',
    'promo',                    // sem barra inicial
    '',
    '   ',
    '/busca?a=1',               // query no cadastro
    '/pagina#ancora',
    null, undefined, 42, {},
    `/${'x'.repeat(600)}`,      // acima do limite da coluna
  ]) {
    assert.equal(normalizeRedirectPath(recusado), null, `${JSON.stringify(recusado)} precisa ser recusado`);
  }
});

test('PUB-08: regras de cadastro do redirect são fail-closed', () => {
  const publicPaths = ['/', '/servicos', '/faq'];
  const base = { publicPaths, activeRedirects: [] };

  assert.equal(validateRedirect({ ...base, oldPath: '/promo', newPath: '/servicos' }), null);

  assert.equal(validateRedirect({ ...base, oldPath: null, newPath: '/servicos' }), 'invalid_path');
  assert.equal(validateRedirect({ ...base, oldPath: '/promo', newPath: '/promo' }), 'cannot_redirect_to_self');
  // O laço é recusado ANTES da regra de sombra, com o erro mais preciso —
  // inclusive quando a origem também seria rota reservada.
  assert.equal(validateRedirect({ ...base, oldPath: '/faq', newPath: '/faq' }), 'cannot_redirect_to_self');
  // Não pode esconder rota que existe — pública ou interna.
  assert.equal(validateRedirect({ ...base, oldPath: '/faq', newPath: '/servicos' }), 'cannot_shadow_existing_route');
  assert.equal(validateRedirect({ ...base, oldPath: '/admin/leads', newPath: '/servicos' }), 'cannot_shadow_existing_route');
  assert.equal(validateRedirect({ ...base, oldPath: '/api/leads', newPath: '/servicos' }), 'cannot_shadow_existing_route');
  assert.equal(validateRedirect({ ...base, oldPath: '/sitemap.xml', newPath: '/servicos' }), 'cannot_shadow_existing_route');
  // Destino precisa existir de verdade.
  assert.equal(validateRedirect({ ...base, oldPath: '/promo', newPath: '/inexistente' }), 'redirect_target_not_public');
  assert.equal(validateRedirect({ ...base, oldPath: '/promo', newPath: '/admin' }), 'redirect_target_not_public');
  // Cadeia nos dois sentidos.
  assert.equal(
    validateRedirect({ ...base, oldPath: '/promo', newPath: '/servicos', activeRedirects: [{ old_path: '/servicos', new_path: '/faq' }] }),
    'redirect_chain_not_allowed',
  );
  assert.equal(
    validateRedirect({ ...base, oldPath: '/promo', newPath: '/servicos', activeRedirects: [{ old_path: '/outro', new_path: '/promo' }] }),
    'redirect_chain_not_allowed',
  );
  // Redirect inativo não forma cadeia (quem chama passa a lista já filtrada).
  assert.equal(validateRedirect({ ...base, oldPath: '/promo', newPath: '/servicos', activeRedirects: [] }), null);
});

test('PUB-08: asset estático não consulta a tabela, mas endereço legado .html consulta', () => {
  for (const asset of ['/_next/static/chunk.js', '/icons/icon-192.png', '/globals.css', '/favicon.ico', '/offline.txt']) {
    assert.equal(skipsRedirectLookup(asset), true, `${asset} não deve gerar consulta`);
  }
  // Caminho reservado nunca pode ser origem, então não gera consulta.
  for (const reservado of ['/admin/leads', '/api/leads', '/cliente/painel', '/funcionario']) {
    assert.equal(skipsRedirectLookup(reservado), true, `${reservado} é reservado e não deve gerar consulta`);
  }
  for (const pagina of ['/', '/promo', '/servicos/antigo', '/promo.html', '/pagina.php']) {
    assert.equal(skipsRedirectLookup(pagina), false, `${pagina} precisa ser consultado — é endereço de página`);
  }
});
