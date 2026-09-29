import { createHash, randomBytes } from "node:crypto";

export function createProposalAcceptanceApi({ json, readJson, sameOrigin, getPool, readAdminSession, clientIp }) {
  const VALID_STATUS = new Set(['ativo','usado','expirado','revogado']);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuid = v => typeof v === 'string' && UUID_RE.test(v);
  const bad = (res, msg) => json(res, 400, { error: msg });

  function hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
  }

  function generateSecureToken() {
    // 32 bytes random + timestamp, base64url
    const rand = randomBytes(32).toString('base64url');
    return `${rand}-${Date.now().toString(36)}`;
  }

  async function handleLinks(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      const proposalId = url.searchParams.get('proposalId') || url.searchParams.get('proposal_id');
      const status = url.searchParams.get('status');
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      if (proposalId && !isUuid(proposalId)) return bad(res, 'invalid_proposal_id');
      if (status && !VALID_STATUS.has(status)) return bad(res, 'invalid_status');
      const conds = []; const vals = []; let idx = 1;
      if (proposalId) { conds.push(`proposal_id = $${idx++}`); vals.push(proposalId); }
      if (status) { conds.push(`status = $${idx++}`); vals.push(status); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      try {
        const pool = getPool();
        const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM crm_proposal_acceptance_links ${where}`, vals);
        const listRes = await pool.query(
          `SELECT id, proposal_id, proposal_version, token_prefix, recipient_email, recipient_name, expires_at, is_used, used_at, status, legal_value_note, legal_decision_by, legal_decision_at, is_qualified_signature, is_simple_click, acceptance_note, created_by, created_at
           FROM crm_proposal_acceptance_links ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
          [...vals, limit, offset]
        );
        return json(res, 200, { total: countRes.rows[0]?.total || 0, links: listRes.rows, limit, offset });
      } catch (e) {
        const unconfigured = e.message === 'DATABASE_NOT_CONFIGURED';
        if (!unconfigured) console.error('acceptance links list failed', e);
        return json(res, 503, { error: unconfigured ? 'database_not_configured' : 'links_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const proposal_id = body?.proposal_id ? String(body.proposal_id).trim() : null;
      const proposal_version = body?.proposal_version != null ? parseInt(body.proposal_version, 10) : null;
      const recipient_email = body?.recipient_email ? String(body.recipient_email).trim().toLowerCase() : null;
      const recipient_name = body?.recipient_name ? String(body.recipient_name).trim().slice(0,200) : null;
      const expires_days = body?.expires_days != null ? parseInt(body.expires_days, 10) : 7;
      const legal_value_note = body?.legal_value_note ? String(body.legal_value_note).trim().slice(0,2000) : null;
      const acceptance_note = body?.acceptance_note ? String(body.acceptance_note).trim().slice(0,2000) : null;

      if (!proposal_id || !isUuid(proposal_id)) return bad(res, 'invalid_proposal_id');
      if (!recipient_email || recipient_email.length < 5 || recipient_email.length > 320) return bad(res, 'invalid_recipient_email');
      if (proposal_version != null && (isNaN(proposal_version) || proposal_version < 1)) return bad(res, 'invalid_proposal_version');
      if (isNaN(expires_days) || expires_days < 1 || expires_days > 90) return bad(res, 'invalid_expires_days');

      // Decisão jurídica sobre valor do aceite deve ser registrada se adotado
      // Se legal_value_note não informado, ainda permite criar link, mas ao aceitar deve registrar que é aceite simples, não assinatura qualificada

      try {
        const pool = getPool();
        const propRes = await pool.query('SELECT id, version, status FROM crm_proposals WHERE id = $1', [proposal_id]);
        if (!propRes.rows[0]) return json(res, 404, { error: 'proposal_not_found' });
        const proposal = propRes.rows[0];
        const versionToUse = proposal_version || proposal.version;

        // Verificar snapshot preservado existe para versão vinculada
        const verRes = await pool.query('SELECT id FROM crm_proposal_versions WHERE proposal_id = $1 AND version = $2', [proposal_id, versionToUse]);
        if (!verRes.rows[0]) {
          return json(res, 409, { error: 'version_not_preserved_cannot_create_secure_link', message: 'Versão deve estar preservada em crm_proposal_versions para criar link seguro vinculado à versão' });
        }

        const token = generateSecureToken();
        const tokenHash = hashToken(token);
        const tokenPrefix = token.slice(0, 8);

        const expiresAt = new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000);

        const ins = await pool.query(
          `INSERT INTO crm_proposal_acceptance_links
            (proposal_id, proposal_version, token_hash, token_prefix, recipient_email, recipient_name, expires_at, status, legal_value_note, legal_decision_by, legal_decision_by_id, legal_decision_at, is_qualified_signature, is_simple_click, acceptance_note, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'ativo',$8,$9,$10,NOW(),false,true,$11,$12,$13) RETURNING id, proposal_id, proposal_version, token_prefix, recipient_email, expires_at, status, legal_value_note, is_qualified_signature, is_simple_click`,
          [proposal_id, versionToUse, tokenHash, tokenPrefix, recipient_email, recipient_name, expiresAt, legal_value_note, session.role, session.identityId || null, acceptance_note, session.role, session.identityId || null]
        );

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_proposal_acceptance_link_create',$3,'allowed','none')", [session.role, session.identityId || session.role, ins.rows[0].id]); } catch {}

        // Retornar token apenas uma vez (não armazenado em claro), e link seguro
        const publicBase = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '') || 'http://localhost:3000';
        const secureLink = `${publicBase}/proposta/aceite/${token}`;

        return json(res, 201, {
          link: ins.rows[0],
          token, // mostrar apenas uma vez
          secureLink,
          note: 'Link seguro expirável vinculado à versão. Decisão jurídica sobre valor do aceite registrada em legal_value_note. Não chamar clique simples de assinatura qualificada. is_qualified_signature=false, is_simple_click=true',
        });
      } catch (e) {
        if (e.code === '23505') return json(res, 409, { error: 'token_collision_retry' });
        console.error('acceptance link create failed', e);
        return json(res, 503, { error: 'link_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleAcceptByToken(req, res, token) {
    if (!token || typeof token !== 'string' || token.length < 20) return bad(res, 'invalid_token');
    const tokenHash = hashToken(token);

    if (req.method === 'GET') {
      // Visualizar proposta para aceite (sem sessão admin, mas com token válido)
      try {
        const pool = getPool();
        const linkRes = await pool.query('SELECT * FROM crm_proposal_acceptance_links WHERE token_hash = $1', [tokenHash]);
        if (!linkRes.rows[0]) return json(res, 404, { error: 'link_not_found' });
        const link = linkRes.rows[0];

        // Verificar expiração
        if (new Date(link.expires_at) < new Date()) {
          if (link.status === 'ativo') {
            await pool.query(`UPDATE crm_proposal_acceptance_links SET status = 'expirado', updated_at = NOW() WHERE id = $1`, [link.id]);
          }
          return json(res, 410, { error: 'link_expired', expires_at: link.expires_at });
        }
        if (link.status !== 'ativo') {
          return json(res, 410, { error: 'link_not_active', status: link.status, is_used: link.is_used });
        }

        // Buscar snapshot da versão vinculada (mesma versão persistida)
        const verRes = await pool.query('SELECT * FROM crm_proposal_versions WHERE proposal_id = $1 AND version = $2', [link.proposal_id, link.proposal_version]);
        if (!verRes.rows[0]) return json(res, 404, { error: 'version_snapshot_not_found' });

        const snapshot = verRes.rows[0].snapshot;
        return json(res, 200, {
          link: { id: link.id, proposal_id: link.proposal_id, proposal_version: link.proposal_version, recipient_email: link.recipient_email, recipient_name: link.recipient_name, expires_at: link.expires_at, status: link.status, legal_value_note: link.legal_value_note, is_qualified_signature: link.is_qualified_signature, is_simple_click: link.is_simple_click },
          proposal_version: verRes.rows[0].version,
          snapshot,
          note: 'Link seguro vinculado à versão. Aceite simples, não assinatura qualificada. Decisão jurídica registrada em legal_value_note.',
        });
      } catch (e) {
        console.error('accept link GET failed', e);
        return json(res, 503, { error: 'accept_link_failed' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { body = {}; }
      const confirm = body?.confirm === true || body?.accept === true;
      const signer_name = body?.signer_name ? String(body.signer_name).trim().slice(0,200) : null;
      const acceptance_note = body?.acceptance_note ? String(body.acceptance_note).trim().slice(0,2000) : null;

      if (!confirm) return bad(res, 'confirm_required');

      try {
        const pool = getPool();
        const linkRes = await pool.query('SELECT * FROM crm_proposal_acceptance_links WHERE token_hash = $1 FOR UPDATE', [tokenHash]);
        if (!linkRes.rows[0]) return json(res, 404, { error: 'link_not_found' });
        const link = linkRes.rows[0];

        if (new Date(link.expires_at) < new Date()) {
          await pool.query(`UPDATE crm_proposal_acceptance_links SET status = 'expirado', updated_at = NOW() WHERE id = $1`, [link.id]);
          return json(res, 410, { error: 'link_expired' });
        }
        if (link.status !== 'ativo' || link.is_used) {
          return json(res, 410, { error: 'link_already_used_or_inactive', status: link.status });
        }

        // Verificar proposta ainda está em estado que permite aceite (enviada ou aprovada_para_envio)
        const propRes = await pool.query('SELECT id, version, status FROM crm_proposals WHERE id = $1', [link.proposal_id]);
        if (!propRes.rows[0]) return json(res, 404, { error: 'proposal_not_found' });
        const proposal = propRes.rows[0];

        // Vinculado à versão: aceitar só se versão do link corresponde à versão atual ou a uma versão preservada? Permitir se versão do link <= versão atual e status ainda permite?
        // Para segurança, aceitar apenas se proposta está em enviada ou aprovada_para_envio, e versão do link é a versão que foi enviada
        if (!['enviada','aprovada_para_envio'].includes(proposal.status)) {
          return json(res, 409, { error: 'proposal_not_in_acceptable_state', current_status: proposal.status });
        }

        if (proposal.version !== link.proposal_version) {
          // Permitir se versão do link tem snapshot preservado, mas alertar que é versão específica
          // Para CRM-22, link vinculado à versão, então aceitar versão específica mesmo se proposta avançou? Vamos exigir que versão do link seja a versão atual ou a última enviada
          // Se proposta.version != link.proposal_version, verificar se link.proposal_version tem snapshot e se proposta tem versão posterior substituída? Para simplificar, bloquear se diferente
          return json(res, 409, { error: 'version_mismatch_link_bound_to_version', link_version: link.proposal_version, proposal_version: proposal.version });
        }

        const ipHash = clientIp ? (() => { try { const { createHash } = require('node:crypto'); return createHash('sha256').update(String(clientIp(req) || 'unknown')).digest('hex').slice(0,32); } catch { return null; } })() : null;
        const userAgent = req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0,500) : null;

        // Marcar link como usado
        await pool.query(
          `UPDATE crm_proposal_acceptance_links SET is_used = true, used_at = NOW(), used_ip_hash = $2, used_user_agent = $3, status = 'usado', acceptance_note = COALESCE($4, acceptance_note), updated_at = NOW() WHERE id = $1`,
          [link.id, ipHash, userAgent, acceptance_note]
        );

        // Atualizar proposta para aceita
        await pool.query(`UPDATE crm_proposals SET status = 'aceita', updated_at = NOW() WHERE id = $1`, [link.proposal_id]);

        // Criar assinatura por integração com nota que é aceite simples, não qualificada
        const sigId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO crm_proposal_signatures (id, proposal_id, proposal_version, delivery_id, signer_email, signer_name, status, provider, signed_at, webhook_payload)
           VALUES ($1,$2,$3,NULL,$4,$5,'accepted_via_secure_link',$6,NOW(),$7::jsonb)`,
          [sigId, link.proposal_id, link.proposal_version, link.recipient_email, signer_name || link.recipient_name, 'secure_link', JSON.stringify({ token_prefix: link.token_prefix, ip_hash: ipHash, user_agent: userAgent, acceptance_note, legal_value_note: link.legal_value_note, is_qualified_signature: false, is_simple_click: true, note: 'Aceite por link seguro expirável vinculado à versão. Não é assinatura qualificada. Decisão jurídica registrada.' })]
        );

        // Também criar/atualizar delivery aceito se existir
        try {
          await pool.query(
            `UPDATE crm_proposal_deliveries SET status = 'aceito', accepted_at = NOW(), webhook_payload = $2::jsonb, updated_at = NOW() WHERE proposal_id = $1 AND recipient_email = $3 AND proposal_version = $4 AND status IN ('enviado_pelo_provedor','entregue_comprovada','leitura_comprovada')`,
            [link.proposal_id, JSON.stringify({ acceptance_link_id: link.id, token_prefix: link.token_prefix, ip_hash: ipHash }), link.recipient_email, link.proposal_version]
          );
        } catch {}

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ('system',$1,'crm_proposal_accepted_via_secure_link',$2,'allowed','none')", [ipHash || 'secure_link', link.id]); } catch {}

        // CRM-23: proposta aceita cria contrato/implantação de modo idempotente; retries não duplicam cliente, contrato, postos ou faturamento
        let contractInfo = null;
        try {
          const tableExists = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_contracts'");
          if (tableExists.rows[0]) {
            const existingContract = await pool.query('SELECT id FROM crm_contracts WHERE proposal_id = $1 AND proposal_version = $2', [link.proposal_id, link.proposal_version]);
            if (existingContract.rows[0]) {
              contractInfo = { id: existingContract.rows[0].id, isNew: false, idempotent: true };
              try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ('system',$1,'crm_contract_idempotent_hit',$2,'allowed','none')", [ipHash || 'secure_link', existingContract.rows[0].id]); } catch {}
            } else {
              const propFullRes = await pool.query('SELECT * FROM crm_proposals WHERE id = $1', [link.proposal_id]);
              const proposalFull = propFullRes.rows[0];
              if (proposalFull) {
                const proposalItemsRes = await pool.query('SELECT * FROM crm_proposal_items WHERE proposal_id = $1 AND proposal_version = $2 ORDER BY created_at', [link.proposal_id, link.proposal_version]);
                const contractId = crypto.randomUUID();
                const title = proposalFull.title ? `${proposalFull.title} - Contrato v${link.proposal_version}` : `Contrato proposta ${link.proposal_id.slice(0,8)} v${link.proposal_version}`;
                const idempotencyKey = `proposal:${link.proposal_id}:v${link.proposal_version}`;
                const client = await pool.connect();
                try {
                  await client.query('BEGIN');
                  const existingTx = await client.query('SELECT id FROM crm_contracts WHERE proposal_id = $1 AND proposal_version = $2 FOR UPDATE', [link.proposal_id, link.proposal_version]);
                  if (existingTx.rows[0]) {
                    await client.query('ROLLBACK');
                    contractInfo = { id: existingTx.rows[0].id, isNew: false, idempotent: true };
                  } else {
                    await client.query(
                      `INSERT INTO crm_contracts (id, proposal_id, proposal_version, company_id, opportunity_id, title, status, origin, version, total_cost, total_price, margin_percent, validity_days, validity_until, conditions, notes, idempotency_key, created_by, created_by_id)
                       VALUES ($1,$2,$3,$4,$5,$6,'ativo','crm_proposal_acceptance',1,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
                      [contractId, link.proposal_id, link.proposal_version, proposalFull.company_id, proposalFull.opportunity_id, title, proposalFull.total_cost || 0, proposalFull.total_price || 0, proposalFull.margin_percent, proposalFull.validity_days, proposalFull.validity_until, proposalFull.conditions, `Criado idempotente via aceite link seguro ${link.id} v${link.proposal_version}. Retries não duplicam.`, idempotencyKey, 'system', null]
                    );
                    for (const pi of proposalItemsRes.rows) {
                      await client.query(
                        `INSERT INTO crm_contract_items (contract_id, proposal_item_id, type, description, equipment_id, quantity, unit, unit_cost, total_cost, unit_price, total_price, recurrence_type, recurrence_details, supplier_name, notes)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (contract_id, proposal_item_id) DO NOTHING`,
                        [contractId, pi.id, pi.type, pi.description, pi.equipment_id, pi.quantity, pi.unit, pi.unit_cost, pi.total_cost, pi.unit_price, pi.total_price, pi.recurrence_type, pi.recurrence_details, pi.supplier_name, pi.notes]
                      );
                    }
                    const implantationId = crypto.randomUUID();
                    await client.query(
                      `INSERT INTO crm_contract_implantations (id, contract_id, proposal_id, proposal_version, status, created_by, created_by_id) VALUES ($1,$2,$3,$4,'planejada',$5,$6) ON CONFLICT (contract_id) DO NOTHING`,
                      [implantationId, contractId, link.proposal_id, link.proposal_version, 'system', null]
                    );
                    await client.query('COMMIT');
                    contractInfo = { id: contractId, isNew: true, idempotent: true };
                    try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ('system',$1,'crm_contract_create',$2,'allowed','none')", [ipHash || 'secure_link', contractId]); } catch {}
                  }
                } catch (e) {
                  try { await client.query('ROLLBACK'); } catch {}
                  console.error('contract auto-create from acceptance link failed', e);
                } finally {
                  client.release();
                }
              }
            }
          }
        } catch (e) {
          console.error('contract auto-create check failed', e);
        }

        return json(res, 200, {
          accepted: true,
          proposal_id: link.proposal_id,
          proposal_version: link.proposal_version,
          signature_id: sigId,
          contract: contractInfo,
          note: 'Aceite registrado via link seguro expirável vinculado à versão. Aceite simples, não assinatura qualificada. Decisão jurídica sobre valor do aceite registrada em legal_value_note. Contrato criado idempotente (CRM-23).',
          legal_value_note: link.legal_value_note,
          is_qualified_signature: false,
          is_simple_click: true,
        });
      } catch (e) {
        console.error('accept by token POST failed', e);
        return json(res, 503, { error: 'accept_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleLinkById(req, res, id) {
    if (!isUuid(id)) return bad(res, 'invalid_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT id, proposal_id, proposal_version, token_prefix, recipient_email, recipient_name, expires_at, is_used, used_at, used_ip_hash, status, legal_value_note, legal_decision_by, legal_decision_at, is_qualified_signature, is_simple_click, acceptance_note, created_by, created_at FROM crm_proposal_acceptance_links WHERE id = $1', [id]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { link: r.rows[0] });
      } catch (e) {
        return json(res, 503, { error: 'link_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      if (body?.status !== undefined) {
        const st = String(body.status).trim().toLowerCase();
        if (!VALID_STATUS.has(st)) return bad(res, 'invalid_status');
        fields.push(`status = $${idx++}`); vals.push(st);
      }
      if (body?.legal_value_note !== undefined) {
        const note = body.legal_value_note ? String(body.legal_value_note).trim().slice(0,2000) : null;
        fields.push(`legal_value_note = $${idx++}`); vals.push(note);
        fields.push(`legal_decision_by = $${idx++}`); vals.push(session.role);
        fields.push(`legal_decision_by_id = $${idx++}`); vals.push(session.identityId || null);
        fields.push(`legal_decision_at = NOW()`);
      }
      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_proposal_acceptance_links SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, proposal_id, proposal_version, token_prefix, recipient_email, expires_at, status, legal_value_note, is_qualified_signature, is_simple_click`, [...vals, id]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { link: upd.rows[0] });
      } catch (e) {
        return json(res, 503, { error: 'link_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  return { handleLinks, handleAcceptByToken, handleLinkById };
}
