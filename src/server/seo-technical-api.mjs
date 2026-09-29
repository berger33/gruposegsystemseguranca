// PUB-08 — SEO técnico servido de verdade.
//
// O que existia antes: sitemap digitado à mão numa tabela, XML montado por
// concatenação sem escape, redirects que só ficavam guardados sem nunca
// redirecionar, leitura pública de rascunho interno e nenhuma transação.
//
// O que existe aqui: `/robots.txt` e `/sitemap.xml` derivados do código,
// fail-closed fora de produção; prévia autorizada para revisão antes da
// liberação; e cadastro de redirect com regra de sombra/destino/cadeia e
// trilha gravada na MESMA transação da mutação.
//
// Política registrada ANTES da rota em
// `docs/PROMPT-CONTINUACAO-PUB08-SEO-TECNICO.md`.

import { PUBLIC_SERVICES } from '../lib/service-catalog.mjs';
import { SEGMENT_EXAMPLES } from '../lib/segment-examples.mjs';
import {
  buildRobotsTxt,
  buildSitemapXml,
  isIndexingReleased,
  listPublicPaths,
  normalizeRedirectPath,
  skipsRedirectLookup,
  validateRedirect,
} from '../lib/seo-technical.mjs';

const SEO_ADMIN_ROLES = new Set(['marcelo', 'ti', 'admin']);
const REDIRECT_STATUSES = new Set(['301', '302', '307', '308']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createSeoTechnicalApi(ctx) {
  const { json, readJson, sameOrigin, getPool, readAdminSession } = ctx;

  /** Rotas públicas reais; a mesma lista alimenta sitemap e validação de redirect. */
  function publicPaths() {
    return listPublicPaths({ services: PUBLIC_SERVICES, segments: SEGMENT_EXAMPLES });
  }

  function released() {
    return isIndexingReleased(process.env);
  }

  function originOf(req) {
    const forwardedProto = process.env.TRUST_PROXY === 'true' ? req.headers['x-forwarded-proto'] : undefined;
    const forwardedHost = process.env.TRUST_PROXY === 'true' ? req.headers['x-forwarded-host'] : undefined;
    const host = String(forwardedHost || req.headers.host || '').split(',')[0].trim();
    if (!host) return '';
    const proto = String(forwardedProto || '').split(',')[0].trim()
      || (released() ? 'https' : 'http');
    return `${proto}://${host}`;
  }

  function text(res, status, body, extraHeaders = {}) {
    const payload = Buffer.from(body, 'utf8');
    res.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': payload.length,
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    });
    res.end(payload);
  }

  /** Sessão de staff com papel de administração do site. Sem bypass. */
  async function requireSeoSession(req, res) {
    const session = await readAdminSession(req);
    if (!session) { json(res, 401, { error: 'admin_session_required' }); return null; }
    if (!SEO_ADMIN_ROLES.has(session.role)) { json(res, 403, { error: 'forbidden' }); return null; }
    return session;
  }

  function databaseFailure(res, error) {
    const unconfigured = error instanceof Error && error.message === 'DATABASE_NOT_CONFIGURED';
    const migrationMissing = error && typeof error === 'object' && error.code === '42P01';
    if (!unconfigured) console.error('PUB-08: SEO técnico indisponível.', error);
    return json(res, 503, {
      error: unconfigured ? 'database_not_configured' : migrationMissing ? 'migration_required' : 'seo_unavailable',
    });
  }

  // --- /robots.txt -----------------------------------------------------------
  // Fora de produção nega tudo e não anuncia sitemap. Não há parâmetro,
  // cabeçalho ou papel que mude isso: a liberação é só das duas variáveis.
  async function handleRobotsTxt(req, res) {
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
      return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, HEAD' });
    }
    const isReleased = released();
    const body = buildRobotsTxt({ released: isReleased, origin: originOf(req) });
    return text(res, 200, body, isReleased ? {} : { 'X-Robots-Tag': 'noindex, nofollow' });
  }

  // --- /sitemap.xml ----------------------------------------------------------
  // Enquanto não há liberação, não existe mapa publicado: 404, não um
  // `<urlset/>` vazio, que sugeriria "o mapa existe e está vazio".
  async function handleSitemapXml(req, res) {
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
      return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, HEAD' });
    }
    if (!released()) {
      return text(res, 404, 'sitemap_not_published\n', { 'X-Robots-Tag': 'noindex, nofollow' });
    }
    const xml = buildSitemapXml({ origin: originOf(req), paths: publicPaths() });
    const payload = Buffer.from(xml, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Length': payload.length,
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(payload);
  }

  // --- Prévia autorizada (leitura; não publica nada) -------------------------
  async function handleSitemapPreview(req, res) {
    const session = await requireSeoSession(req, res);
    if (!session) return;
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
    const paths = publicPaths();
    const origin = originOf(req);
    return json(res, 200, {
      released: released(),
      derived: true,
      source: 'src/lib/seo-technical.mjs + catálogo público',
      origin,
      paths,
      robots: buildRobotsTxt({ released: released(), origin }),
      xml: buildSitemapXml({ origin, paths }),
      note: 'Prévia de revisão. Enquanto NEXT_PUBLIC_ENV/NEXT_PUBLIC_ALLOW_INDEX não liberarem, /sitemap.xml devolve 404 e /robots.txt nega tudo.',
    });
  }

  // --- Redirects -------------------------------------------------------------
  async function activeRedirects(client, exceptId = null) {
    const { rows } = await (client || getPool()).query(
      'SELECT id, old_path, new_path FROM seo_redirects WHERE is_active = true',
    );
    return exceptId ? rows.filter(row => row.id !== exceptId) : rows;
  }

  async function handleRedirects(req, res) {
    const session = await requireSeoSession(req, res);
    if (!session) return;
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });

    if (req.method === 'GET') {
      try {
        const { rows } = await getPool().query(
          `SELECT id, old_path, new_path, redirect_type, is_active, reason, created_at, updated_at
             FROM seo_redirects ORDER BY old_path ASC LIMIT 200`,
        );
        return json(res, 200, { items: rows, enforced: true });
      } catch (error) { return databaseFailure(res, error); }
    }

    if (!['POST', 'PATCH'].includes(req.method)) {
      return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST, PATCH' });
    }

    let body;
    try { body = await readJson(req, 16 * 1024); } catch (error) {
      return json(res, error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 413 : 400, { error: 'invalid_request' });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'invalid_request' });
    // Campos que o servidor controla nunca vêm do cliente.
    if (['id', 'hits', 'created_by_identity', 'created_at', 'updated_at'].some(field => req.method === 'POST' && Object.hasOwn(body, field))) {
      return json(res, 400, { error: 'server_managed_fields' });
    }

    const isCreate = req.method === 'POST';
    let client;
    try {
      client = await getPool().connect();
      await client.query('BEGIN');

      let current = null;
      if (!isCreate) {
        if (!UUID.test(String(body.id || ''))) { await client.query('ROLLBACK'); return json(res, 400, { error: 'invalid_id' }); }
        const found = await client.query('SELECT * FROM seo_redirects WHERE id = $1 FOR UPDATE', [body.id]);
        if (!found.rows.length) { await client.query('ROLLBACK'); return json(res, 404, { error: 'not_found' }); }
        current = found.rows[0];
      }

      const oldPath = normalizeRedirectPath(isCreate ? body.old_path : (body.old_path ?? current.old_path));
      const newPath = normalizeRedirectPath(body.new_path ?? current?.new_path);
      if (!oldPath || !newPath) { await client.query('ROLLBACK'); return json(res, 400, { error: 'invalid_path' }); }

      const redirectType = String(body.redirect_type ?? current?.redirect_type ?? '301');
      if (!REDIRECT_STATUSES.has(redirectType)) { await client.query('ROLLBACK'); return json(res, 400, { error: 'invalid_redirect_type' }); }

      const isActive = body.is_active === undefined ? (current?.is_active ?? true) : body.is_active === true;
      const rawReason = body.reason === undefined ? current?.reason ?? null : body.reason;
      const reason = rawReason === null ? null : String(rawReason).trim();
      if (reason !== null && (reason.length < 10 || reason.length > 1000)) {
        await client.query('ROLLBACK'); return json(res, 400, { error: 'invalid_reason' });
      }

      const policyError = validateRedirect({
        oldPath,
        newPath,
        publicPaths: publicPaths(),
        // Cadeia só importa entre redirects que estão de fato valendo.
        activeRedirects: isActive ? await activeRedirects(client, current?.id ?? null) : [],
      });
      if (policyError) { await client.query('ROLLBACK'); return json(res, 400, { error: policyError }); }

      let saved;
      try {
        saved = isCreate
          ? await client.query(
            `INSERT INTO seo_redirects (old_path, new_path, redirect_type, is_active, reason, created_by_identity)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, old_path, new_path, redirect_type, is_active, reason`,
            [oldPath, newPath, redirectType, isActive, reason, session.identityId || null],
          )
          : await client.query(
            `UPDATE seo_redirects SET old_path=$2, new_path=$3, redirect_type=$4, is_active=$5, reason=$6, updated_at=NOW()
              WHERE id=$1 RETURNING id, old_path, new_path, redirect_type, is_active, reason`,
            [current.id, oldPath, newPath, redirectType, isActive, reason],
          );
      } catch (error) {
        if (error && error.code === '23505') { await client.query('ROLLBACK'); return json(res, 409, { error: 'duplicate_old_path' }); }
        throw error;
      }

      // Sem trilha durável na mesma transação, o redirect não vale.
      await client.query(
        "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')",
        [
          session.role,
          session.identityId || session.role,
          isCreate ? 'seo_redirect_create' : 'seo_redirect_update',
          `${saved.rows[0].id}:${oldPath}->${newPath}:${redirectType}${isActive ? '' : ':inativo'}`,
        ],
      );

      await client.query('COMMIT');
      return json(res, isCreate ? 201 : 200, { redirect: saved.rows[0] });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return databaseFailure(res, error);
    } finally {
      client?.release();
    }
  }

  /**
   * Resolução no caminho da requisição: UM salto, só GET/HEAD, `Location`
   * sempre interno. Falha de banco NÃO redireciona — redirect não é controle
   * de autorização, e derrubar o site público por causa desta tabela seria
   * pior do que servir a página normalmente.
   */
  async function resolveRedirect(req, pathname) {
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) return null;
    if (skipsRedirectLookup(pathname)) return null;
    const normalized = normalizeRedirectPath(pathname);
    if (!normalized) return null;
    try {
      const { rows } = await getPool().query(
        'SELECT new_path, redirect_type FROM seo_redirects WHERE old_path = $1 AND is_active = true LIMIT 1',
        [normalized],
      );
      if (!rows.length) return null;
      // Defesa em profundidade: mesmo gravado, um destino que não seja caminho
      // interno é ignorado em vez de virar open redirect.
      const target = normalizeRedirectPath(rows[0].new_path);
      if (!target) return null;
      const queryIndex = (req.url || '').indexOf('?');
      const query = queryIndex >= 0 ? (req.url || '').slice(queryIndex) : '';
      return { status: Number(rows[0].redirect_type) || 301, location: `${target}${query}` };
    } catch {
      return null;
    }
  }

  return { handleRobotsTxt, handleSitemapXml, handleSitemapPreview, handleRedirects, resolveRedirect, publicPaths };
}
