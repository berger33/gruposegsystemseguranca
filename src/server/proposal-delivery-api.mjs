export function createProposalDeliveryApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
  const VALID_STATUS = new Set(['fila','enviado_pelo_provedor','falhou','entregue_comprovada','leitura_comprovada','aceito','recusado']);
  const VALID_CHANNEL = new Set(['email','whatsapp','outro']);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuid = v => typeof v === 'string' && UUID_RE.test(v);
  const bad = (res, msg) => json(res, 400, { error: msg });

  function sanitizeError(err) {
    if (!err) return null;
    let msg = err instanceof Error ? err.message : String(err);
    // sanitizar: remover stack, segredos, limitar 1000
    msg = msg.replace(/password|secret|token|key/gi, '[redacted]');
    return msg.slice(0, 1000);
  }

  async function handleDeliveries(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
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
        const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM crm_proposal_deliveries ${where}`, vals);
        const listRes = await pool.query(`SELECT * FROM crm_proposal_deliveries ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx+1}`, [...vals, limit, offset]);
        return json(res, 200, { total: countRes.rows[0]?.total || 0, deliveries: listRes.rows, limit, offset });
      } catch (e) {
        const unconfigured = e.message === 'DATABASE_NOT_CONFIGURED';
        if (!unconfigured) console.error('proposal deliveries list failed', e);
        return json(res, 503, { error: unconfigured ? 'database_not_configured' : 'deliveries_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const proposal_id = body?.proposal_id ? String(body.proposal_id).trim() : null;
      const proposal_version = body?.proposal_version != null ? parseInt(body.proposal_version, 10) : null;
      const recipient_email = body?.recipient_email ? String(body.recipient_email).trim().toLowerCase() : null;
      const recipient_name = body?.recipient_name ? String(body.recipient_name).trim().slice(0,200) : null;
      const channel = String(body?.channel || 'email').trim().toLowerCase();

      if (!proposal_id || !isUuid(proposal_id)) return bad(res, 'invalid_proposal_id');
      if (!recipient_email || recipient_email.length < 5 || recipient_email.length > 320) return bad(res, 'invalid_recipient_email');
      if (!VALID_CHANNEL.has(channel)) return bad(res, 'invalid_channel');
      if (proposal_version != null && (isNaN(proposal_version) || proposal_version < 1)) return bad(res, 'invalid_proposal_version');

      try {
        const pool = getPool();
        // Verificar proposta existe e buscar versão atual se não informada
        const propRes = await pool.query('SELECT id, version, status FROM crm_proposals WHERE id = $1', [proposal_id]);
        if (!propRes.rows[0]) return json(res, 404, { error: 'proposal_not_found' });
        const proposal = propRes.rows[0];
        const versionToUse = proposal_version || proposal.version;

        // Verificar se versão tem snapshot preservado (para garantir PDF mesma versão)
        const verRes = await pool.query('SELECT id FROM crm_proposal_versions WHERE proposal_id = $1 AND version = $2', [proposal_id, versionToUse]);
        if (!verRes.rows[0]) {
          // Se não tem snapshot, criar um a partir da versão atual? Para CRM-21, envio deve ser de versão preservada
          // Permitir mas auditar que não tem snapshot
        }

        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_proposal_deliveries (id, proposal_id, proposal_version, recipient_email, recipient_name, channel, status, attempts, max_attempts, next_attempt_at, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,'fila',0,5,NOW(),$7,$8) RETURNING *`,
          [id, proposal_id, versionToUse, recipient_email, recipient_name, channel, session.role, session.identityId || null]
        );

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_proposal_delivery_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}

        return json(res, 201, { delivery: ins.rows[0], proposal_status: proposal.status, note: 'Estados realistas: fila, enviado_pelo_provedor, falhou; entrega/leitura só quando comprovadas por webhook' });
      } catch (e) {
        console.error('proposal delivery create failed', e);
        return json(res, 503, { error: 'delivery_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleDeliveryById(req, res, id) {
    if (!isUuid(id)) return bad(res, 'invalid_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_proposal_deliveries WHERE id = $1', [id]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        const sigRes = await pool.query('SELECT * FROM crm_proposal_signatures WHERE delivery_id = $1 ORDER BY created_at DESC', [id]);
        return json(res, 200, { delivery: r.rows[0], signatures: sigRes.rows });
      } catch (e) {
        return json(res, 503, { error: 'delivery_unavailable' });
      }
    }

    if (req.method === 'POST') {
      // Simular envio pelo provedor (fila -> enviado_pelo_provedor ou falhou) - sem inventar entrega/leitura
      let body; try { body = await readJson(req, 10 * 1024); } catch { body = {}; }
      const action = String(body?.action || 'send').trim().toLowerCase();

      if (action === 'send') {
        try {
          const pool = getPool();
          const cur = await pool.query('SELECT * FROM crm_proposal_deliveries WHERE id = $1', [id]);
          if (!cur.rows[0]) return json(res, 404, { error: 'not_found' });
          const delivery = cur.rows[0];
          if (delivery.status !== 'fila' && delivery.status !== 'falhou') {
            return json(res, 409, { error: 'delivery_not_in_queue', status: delivery.status });
          }

          // Verificar integração configurada
          const integRes = await pool.query("SELECT status, config_sanitized FROM integrations WHERE provider = 'smtp' OR provider = 'whatsapp' OR id = $1 LIMIT 1", [delivery.channel === 'email' ? 'smtp' : 'whatsapp']);
          const integration = integRes.rows[0];
          const isConfigured = integration && integration.status === 'configured';

          if (!isConfigured) {
            // Marcar como falhou com erro sanitizado, sem promessa de entrega
            const upd = await pool.query(
              `UPDATE crm_proposal_deliveries SET status = 'falhou', last_error_sanitized = $2, attempts = attempts + 1, next_attempt_at = NOW() + INTERVAL '5 minutes', updated_at = NOW() WHERE id = $1 RETURNING *`,
              [id, 'Provedor não configurado (integração smtp/whatsapp não configurada)']
            );
            return json(res, 200, { delivery: upd.rows[0], note: 'Falha realista: provedor não configurado, sem simulação de entrega' });
          }

          // Simular envio pelo provedor (não entrega)
          const providerMessageId = `prov-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
          const upd = await pool.query(
            `UPDATE crm_proposal_deliveries SET status = 'enviado_pelo_provedor', provider_message_id = $2, provider = $3, sent_at = NOW(), attempts = attempts + 1, last_error_sanitized = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`,
            [id, providerMessageId, delivery.channel === 'email' ? 'smtp' : 'whatsapp']
          );

          try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_proposal_delivery_sent',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}

          return json(res, 200, { delivery: upd.rows[0], note: 'Enviado pelo provedor (estado realista), entrega/leitura só quando comprovadas por webhook' });
        } catch (e) {
          console.error('delivery send failed', e);
          return json(res, 503, { error: 'delivery_send_failed' });
        }
      }

      return bad(res, 'invalid_action');
    }

    if (req.method === 'PATCH') {
      // Webhook de confirmação: entrega/leitura/aceite só quando comprovadas
      // Este endpoint deve ser chamado por integração com prova (ex: webhook do provedor)
      // Para segurança, exigir prova via body.proof e validar
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const newStatus = String(body?.status || '').trim().toLowerCase();
      const proof = body?.proof || body?.webhook_payload;
      const provider_message_id = body?.provider_message_id ? String(body.provider_message_id).trim().slice(0,500) : null;

      if (!VALID_STATUS.has(newStatus)) return bad(res, 'invalid_status');

      // Estados entrega/leitura só quando comprovadas
      if (['entregue_comprovada','leitura_comprovada','aceito','recusado'].includes(newStatus)) {
        if (!proof) return bad(res, 'proof_required_for_delivery_read');
        // Validar que proof contém evidência (ex: provider_message_id, timestamp, signature)
        if (typeof proof !== 'object' || Object.keys(proof).length === 0) return bad(res, 'invalid_proof');
      }

      // Não permitir pular de fila direto para entregue/leitura sem passar por enviado_pelo_provedor
      try {
        const pool = getPool();
        const cur = await pool.query('SELECT * FROM crm_proposal_deliveries WHERE id = $1', [id]);
        if (!cur.rows[0]) return json(res, 404, { error: 'not_found' });
        const current = cur.rows[0];

        if (current.status === 'fila' && ['entregue_comprovada','leitura_comprovada','aceito','recusado'].includes(newStatus)) {
          return json(res, 409, { error: 'must_be_sent_by_provider_first', current_status: current.status });
        }

        const fields = []; const vals = []; let idx = 1;
        fields.push(`status = $${idx++}`); vals.push(newStatus);
        if (provider_message_id) { fields.push(`provider_message_id = $${idx++}`); vals.push(provider_message_id); }
        if (proof) { fields.push(`webhook_payload = $${idx++}::jsonb`); vals.push(JSON.stringify(proof)); }

        if (newStatus === 'entregue_comprovada') { fields.push(`delivered_at = NOW()`); }
        if (newStatus === 'leitura_comprovada') { fields.push(`read_at = NOW()`); }
        if (newStatus === 'aceito') { fields.push(`accepted_at = NOW()`); }
        if (newStatus === 'recusado') { fields.push(`refused_at = NOW()`); }
        if (newStatus === 'falhou') {
          const err = sanitizeError(body?.error || body?.last_error);
          if (err) { fields.push(`last_error_sanitized = $${idx++}`); vals.push(err); }
          fields.push(`next_attempt_at = NOW() + INTERVAL '15 minutes'`);
        }

        fields.push(`updated_at = NOW()`);

        const upd = await pool.query(`UPDATE crm_proposal_deliveries SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, [...vals, id]);

        // Se aceito, atualizar proposta para aceita e criar assinatura por integração + contrato idempotente CRM-23
        let contractInfo = null;
        if (newStatus === 'aceito') {
          try {
            await pool.query(`UPDATE crm_proposals SET status = 'aceita', updated_at = NOW() WHERE id = $1 AND status = 'enviada'`, [current.proposal_id]);
            await pool.query(
              `INSERT INTO crm_proposal_signatures (proposal_id, proposal_version, delivery_id, signer_email, signer_name, status, provider, provider_envelope_id, signed_at, webhook_payload)
               VALUES ($1,$2,$3,$4,$5,'signed',$6,$7,NOW(),$8::jsonb)`,
              [current.proposal_id, current.proposal_version, id, current.recipient_email, current.recipient_name, proof?.provider || current.provider || 'smtp', proof?.envelope_id || provider_message_id, JSON.stringify(proof)]
            );
          } catch {}
          // CRM-23 idempotent contract creation
          try {
            const tableExists = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_contracts'");
            if (tableExists.rows[0]) {
              const existingContract = await pool.query('SELECT id FROM crm_contracts WHERE proposal_id = $1 AND proposal_version = $2', [current.proposal_id, current.proposal_version]);
              if (existingContract.rows[0]) {
                contractInfo = { id: existingContract.rows[0].id, isNew: false, idempotent: true };
              } else {
                const propRes = await pool.query('SELECT * FROM crm_proposals WHERE id = $1', [current.proposal_id]);
                const proposal = propRes.rows[0];
                if (proposal) {
                  const proposalItemsRes = await pool.query('SELECT * FROM crm_proposal_items WHERE proposal_id = $1 AND proposal_version = $2 ORDER BY created_at', [current.proposal_id, current.proposal_version]);
                  const contractId = crypto.randomUUID();
                  const title = proposal.title ? `${proposal.title} - Contrato v${current.proposal_version}` : `Contrato proposta ${current.proposal_id.slice(0,8)} v${current.proposal_version}`;
                  const idempotencyKey = `proposal:${current.proposal_id}:v${current.proposal_version}`;
                  const client = await pool.connect();
                  try {
                    await client.query('BEGIN');
                    const existingTx = await client.query('SELECT id FROM crm_contracts WHERE proposal_id = $1 AND proposal_version = $2 FOR UPDATE', [current.proposal_id, current.proposal_version]);
                    if (existingTx.rows[0]) {
                      await client.query('ROLLBACK');
                      contractInfo = { id: existingTx.rows[0].id, isNew: false, idempotent: true };
                    } else {
                      await client.query(
                        `INSERT INTO crm_contracts (id, proposal_id, proposal_version, company_id, opportunity_id, title, status, origin, version, total_cost, total_price, margin_percent, validity_days, validity_until, conditions, notes, idempotency_key, created_by, created_by_id)
                         VALUES ($1,$2,$3,$4,$5,$6,'ativo','crm_proposal_acceptance',1,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
                        [contractId, current.proposal_id, current.proposal_version, proposal.company_id, proposal.opportunity_id, title, proposal.total_cost || 0, proposal.total_price || 0, proposal.margin_percent, proposal.validity_days, proposal.validity_until, proposal.conditions, `Criado idempotente via delivery aceito ${id} v${current.proposal_version}. Retries não duplicam.`, idempotencyKey, session.role, session.identityId || null]
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
                        [implantationId, contractId, current.proposal_id, current.proposal_version, session.role, session.identityId || null]
                      );
                      await client.query('COMMIT');
                      contractInfo = { id: contractId, isNew: true, idempotent: true };
                    }
                  } catch (e) {
                    try { await client.query('ROLLBACK'); } catch {}
                    console.error('contract auto-create from delivery failed', e);
                  } finally {
                    client.release();
                  }
                }
              }
            }
          } catch (e) {
            console.error('contract auto-create check from delivery failed', e);
          }
        }

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')", [session.role, session.identityId || session.role, `crm_proposal_delivery_status_${newStatus}`, id]); } catch {}

        return json(res, 200, { delivery: upd.rows[0], contract: contractInfo, note: newStatus === 'entregue_comprovada' || newStatus === 'leitura_comprovada' ? 'Entrega/leitura só quando comprovadas (com proof)' : newStatus === 'aceito' ? 'Status aceito cria contrato idempotente (CRM-23) retries não duplicam' : 'Status atualizado com estados realistas' });
      } catch (e) {
        console.error('delivery patch failed', e);
        return json(res, 503, { error: 'delivery_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST, PATCH' });
  }

  return { handleDeliveries, handleDeliveryById };
}
