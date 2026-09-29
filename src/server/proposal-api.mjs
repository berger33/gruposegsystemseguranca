export function createProposalApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
  const VALID_STATUS = new Set(['rascunho','em_revisao','aprovada_para_envio','enviada','aceita','recusada','expirada','substituida']);
  const VALID_RECURRENCE = new Set(['recorrente','avulso','implantacao','outro']);
  const VALID_ITEM_TYPE = new Set(['material','equipamento','mao_obra','servico','instalacao','deslocamento','infraestrutura','licenca','garantia','manutencao','outro']);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuid = v => typeof v === 'string' && UUID_RE.test(v);
  const bad = (res, msg) => json(res, 400, { error: msg });

  function sanitizeText(s, max) {
    if (s == null) return null;
    if (typeof s !== 'string') return null;
    const t = s.trim();
    if (t.length === 0) return null;
    if (t.length > max) return null;
    return t;
  }

  // Minimal PDF generator from same persisted version
  function escapePdfText(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function buildSimplePdf({ title, version, lines }) {
    // Very minimal PDF with Helvetica, one page
    const contentLines = [];
    let y = 750;
    const lineHeight = 14;
    contentLines.push('BT');
    contentLines.push('/F1 16 Tf');
    contentLines.push(`50 ${y} Td`);
    contentLines.push(`(${escapePdfText(title)} - v${version}) Tj`);
    contentLines.push('0 -20 Td');
    contentLines.push('/F1 10 Tf');
    for (const line of lines.slice(0, 50)) {
      if (y < 50) break;
      const safe = escapePdfText(line.slice(0, 120));
      contentLines.push(`(${safe}) Tj`);
      contentLines.push(`0 -${lineHeight} Td`);
      y -= lineHeight;
    }
    contentLines.push('ET');
    const content = contentLines.join('\n');
    const contentLength = Buffer.byteLength(content);

    const objects = [];
    objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
    objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
    objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
    objects.push(`5 0 obj\n<< /Length ${contentLength} >>\nstream\n${content}\nendstream\nendobj\n`);

    let pdf = '%PDF-1.4\n';
    const offsets = [];
    let offset = Buffer.byteLength(pdf);
    for (const obj of objects) {
      offsets.push(offset);
      pdf += obj;
      offset += Buffer.byteLength(obj);
    }
    const xrefOffset = offset;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, 'utf-8');
  }

  async function handleProposals(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      const companyId = url.searchParams.get('companyId') || url.searchParams.get('company_id');
      const opportunityId = url.searchParams.get('opportunityId') || url.searchParams.get('opportunity_id');
      const status = url.searchParams.get('status');
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      if (companyId && !isUuid(companyId)) return bad(res, 'invalid_company_id');
      if (opportunityId && !isUuid(opportunityId)) return bad(res, 'invalid_opportunity_id');
      if (status && !VALID_STATUS.has(status)) return bad(res, 'invalid_status');
      const conds = []; const vals = []; let idx = 1;
      if (companyId) { conds.push(`company_id = $${idx++}`); vals.push(companyId); }
      if (opportunityId) { conds.push(`opportunity_id = $${idx++}`); vals.push(opportunityId); }
      if (status) { conds.push(`status = $${idx++}`); vals.push(status); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      try {
        const pool = getPool();
        const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM crm_proposals ${where}`, vals);
        const listRes = await pool.query(`SELECT * FROM crm_proposals ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx+1}`, [...vals, limit, offset]);
        return json(res, 200, { total: countRes.rows[0]?.total || 0, proposals: listRes.rows, limit, offset });
      } catch (e) {
        const unconfigured = e.message === 'DATABASE_NOT_CONFIGURED';
        if (!unconfigured) console.error('proposals list failed', e);
        return json(res, 503, { error: unconfigured ? 'database_not_configured' : 'proposals_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 50 * 1024); } catch { return bad(res, 'invalid_json'); }
      const company_id = body?.company_id ? String(body.company_id).trim() : null;
      const opportunity_id = body?.opportunity_id ? String(body.opportunity_id).trim() : null;
      const technical_budget_id = body?.technical_budget_id ? String(body.technical_budget_id).trim() : null;
      const labor_budget_id = body?.labor_budget_id ? String(body.labor_budget_id).trim() : null;
      const price_scenario_id = body?.price_scenario_id ? String(body.price_scenario_id).trim() : null;
      const discount_request_id = body?.discount_request_id ? String(body.discount_request_id).trim() : null;
      const title = sanitizeText(body?.title, 200);
      const scope_description = sanitizeText(body?.scope_description || body?.scopeDescription, 5000);
      const exclusions = sanitizeText(body?.exclusions, 5000);
      const implementation_details = sanitizeText(body?.implementation_details || body?.implementationDetails, 5000);
      const deadline_description = sanitizeText(body?.deadline_description || body?.deadlineDescription, 1000);
      const readjustment_forecast = sanitizeText(body?.readjustment_forecast || body?.readjustmentForecast, 1000);
      const validity_days = body?.validity_days != null ? parseInt(body.validity_days, 10) : null;
      const validity_until = body?.validity_until ? String(body.validity_until).trim() : null;
      const conditions = sanitizeText(body?.conditions, 5000);
      const notes = sanitizeText(body?.notes, 5000);

      if (!company_id || !isUuid(company_id)) return bad(res, 'invalid_company_id');
      if (!title) return bad(res, 'invalid_title');
      if (opportunity_id && !isUuid(opportunity_id)) return bad(res, 'invalid_opportunity_id');
      if (technical_budget_id && !isUuid(technical_budget_id)) return bad(res, 'invalid_technical_budget_id');
      if (labor_budget_id && !isUuid(labor_budget_id)) return bad(res, 'invalid_labor_budget_id');
      if (price_scenario_id && !isUuid(price_scenario_id)) return bad(res, 'invalid_price_scenario_id');
      if (discount_request_id && !isUuid(discount_request_id)) return bad(res, 'invalid_discount_request_id');
      if (validity_days != null && (isNaN(validity_days) || validity_days < 1 || validity_days > 365)) return bad(res, 'invalid_validity_days');
      if (validity_until && isNaN(Date.parse(validity_until))) return bad(res, 'invalid_validity_until');

      try {
        const pool = getPool();
        const id = crypto.randomUUID();

        // Calcular totais a partir dos orçamentos se existirem
        let total_cost = 0; let total_price = 0;
        if (technical_budget_id) {
          const tb = await pool.query('SELECT total_cost, total_price FROM crm_technical_budgets WHERE id = $1', [technical_budget_id]);
          if (tb.rows[0]) { total_cost += Number(tb.rows[0].total_cost || 0); total_price += Number(tb.rows[0].total_price || 0); }
        }
        if (labor_budget_id) {
          const lb = await pool.query('SELECT total_cost, total_price FROM crm_labor_budgets WHERE id = $1', [labor_budget_id]);
          if (lb.rows[0]) { total_cost += Number(lb.rows[0].total_cost || 0); total_price += Number(lb.rows[0].total_price || 0); }
        }
        if (price_scenario_id) {
          const ps = await pool.query('SELECT price_calculated, base_cost FROM crm_price_scenarios WHERE id = $1', [price_scenario_id]);
          if (ps.rows[0]) {
            // Se cenário existe, usar preço calculado como total_price se não houver orçamentos, ou manter
            if (total_price === 0) total_price = Number(ps.rows[0].price_calculated || 0);
            if (total_cost === 0) total_cost = Number(ps.rows[0].base_cost || 0);
          }
        }

        const result = await pool.query(
          `INSERT INTO crm_proposals
            (id, company_id, opportunity_id, technical_budget_id, labor_budget_id, price_scenario_id, discount_request_id, title, status, version, scope_description, exclusions, implementation_details, deadline_description, readjustment_forecast, validity_days, validity_until, conditions, total_cost, total_price, notes, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'rascunho',1,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
          [id, company_id, opportunity_id, technical_budget_id, labor_budget_id, price_scenario_id, discount_request_id, title, scope_description, exclusions, implementation_details, deadline_description, readjustment_forecast, validity_days, validity_until, conditions, total_cost, total_price, notes, session.role, session.identityId || null]
        );

        const proposal = result.rows[0];

        // Criar versão inicial 1 com snapshot vazio (sem itens ainda)
        const snapshot = { proposal, items: [], created_at: new Date().toISOString(), note: 'Versão inicial rascunho' };
        await pool.query(
          `INSERT INTO crm_proposal_versions (proposal_id, version, snapshot, reason, created_by, created_by_id) VALUES ($1,1,$2::jsonb,$3,$4,$5)`,
          [id, JSON.stringify(snapshot), 'Criação inicial', session.role, session.identityId || null]
        );

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_proposal_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}

        return json(res, 201, { proposal });
      } catch (e) {
        console.error('proposal create failed', e);
        return json(res, 503, { error: 'proposal_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleProposalById(req, res, id) {
    if (!isUuid(id)) return bad(res, 'invalid_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const propRes = await pool.query('SELECT * FROM crm_proposals WHERE id = $1', [id]);
        if (!propRes.rows[0]) return json(res, 404, { error: 'not_found' });
        const proposal = propRes.rows[0];
        const itemsRes = await pool.query('SELECT * FROM crm_proposal_items WHERE proposal_id = $1 AND proposal_version = $2 ORDER BY created_at', [id, proposal.version]);
        const versionsRes = await pool.query('SELECT id, proposal_id, version, reason, created_by, created_by_id, created_at FROM crm_proposal_versions WHERE proposal_id = $1 ORDER BY version DESC', [id]);
        return json(res, 200, { proposal, items: itemsRes.rows, versions: versionsRes.rows });
      } catch (e) {
        console.error('proposal get failed', e);
        return json(res, 503, { error: 'proposal_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req, 50 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      let current = null;
      try { const pool = getPool(); const cur = await pool.query('SELECT * FROM crm_proposals WHERE id = $1', [id]); current = cur.rows[0]; if (!current) return json(res, 404, { error: 'not_found' }); } catch (e) { return json(res, 503, { error: 'proposal_unavailable' }); }

      if (body?.title !== undefined) { const t = sanitizeText(body.title, 200); if (!t) return bad(res, 'invalid_title'); fields.push(`title = $${idx++}`); vals.push(t); }
      if (body?.scope_description !== undefined || body?.scopeDescription !== undefined) { const v = sanitizeText(body.scope_description || body.scopeDescription, 5000); fields.push(`scope_description = $${idx++}`); vals.push(v); }
      if (body?.exclusions !== undefined) { const v = sanitizeText(body.exclusions, 5000); fields.push(`exclusions = $${idx++}`); vals.push(v); }
      if (body?.implementation_details !== undefined || body?.implementationDetails !== undefined) { const v = sanitizeText(body.implementation_details || body.implementationDetails, 5000); fields.push(`implementation_details = $${idx++}`); vals.push(v); }
      if (body?.deadline_description !== undefined || body?.deadlineDescription !== undefined) { const v = sanitizeText(body.deadline_description || body.deadlineDescription, 1000); fields.push(`deadline_description = $${idx++}`); vals.push(v); }
      if (body?.readjustment_forecast !== undefined || body?.readjustmentForecast !== undefined) { const v = sanitizeText(body.readjustment_forecast || body.readjustmentForecast, 1000); fields.push(`readjustment_forecast = $${idx++}`); vals.push(v); }
      if (body?.validity_days !== undefined) { const vd = body.validity_days != null ? parseInt(body.validity_days, 10) : null; if (vd != null && (isNaN(vd) || vd < 1 || vd > 365)) return bad(res, 'invalid_validity_days'); fields.push(`validity_days = $${idx++}`); vals.push(vd); }
      if (body?.validity_until !== undefined) { const vu = body.validity_until ? String(body.validity_until).trim() : null; if (vu && isNaN(Date.parse(vu))) return bad(res, 'invalid_validity_until'); fields.push(`validity_until = $${idx++}`); vals.push(vu); }
      if (body?.conditions !== undefined) { const v = sanitizeText(body.conditions, 5000); fields.push(`conditions = $${idx++}`); vals.push(v); }
      if (body?.notes !== undefined) { const v = sanitizeText(body.notes, 5000); fields.push(`notes = $${idx++}`); vals.push(v); }
      if (body?.margin_percent !== undefined) { const mp = body.margin_percent != null ? Number(body.margin_percent) : null; if (mp != null && (isNaN(mp) || mp < -100 || mp > 100)) return bad(res, 'invalid_margin'); fields.push(`margin_percent = $${idx++}`); vals.push(mp); }

      let newVersion = current.version;
      let shouldVersion = false;

      if (body?.status !== undefined) {
        const st = String(body.status).trim().toLowerCase();
        if (!VALID_STATUS.has(st)) return bad(res, 'invalid_status');

        // Transições: rascunho -> em_revisao -> aprovada_para_envio -> enviada -> aceita/recusada/expirada/substituida
        // Para simplificar, permitir qualquer transição exceto voltar de aceita/recusada sem motivo, mas auditar
        fields.push(`status = $${idx++}`); vals.push(st);

        if (st === 'aprovada_para_envio' || st === 'enviada') {
          // Criar nova versão snapshot ao aprovar para envio ou enviar
          shouldVersion = true;
          fields.push(`approved_by = $${idx++}`); vals.push(session.identityId || null);
          fields.push(`approved_at = NOW()`);
          fields.push(`approved_by_role = $${idx++}`); vals.push(session.role);
          if (st === 'enviada') {
            fields.push(`sent_at = NOW()`);
            fields.push(`sent_by = $${idx++}`); vals.push(session.identityId || null);
          }
        }

        if (st === 'aceita' || st === 'recusada' || st === 'expirada' || st === 'substituida') {
          shouldVersion = true;
        }
      }

      // Se alterar itens relevantes, incrementar versão? Itens são separados, mas se alterar escopo/exclusões/implantação/condições, deve versionar?
      if (body?.scope_description !== undefined || body?.exclusions !== undefined || body?.implementation_details !== undefined || body?.conditions !== undefined) {
        // Se já está em status enviado/aceito, alteração reabre? Para CRM-19, preservar versões enviadas, então criar nova versão em rascunho?
        // Aqui apenas marcamos shouldVersion se status já foi enviada
        if (['enviada','aceita','recusada'].includes(current.status)) {
          shouldVersion = true;
        }
      }

      if (fields.length === 0) return bad(res, 'no_fields');

      if (shouldVersion) {
        newVersion = current.version + 1;
        fields.push(`version = $${idx++}`); vals.push(newVersion);
      }

      fields.push(`updated_at = NOW()`);

      try {
        const pool = getPool();
        // Recalcular totais se itens existem na versão atual
        const itemsRes = await pool.query('SELECT COALESCE(SUM(total_cost),0)::numeric as sum_cost, COALESCE(SUM(total_price),0)::numeric as sum_price FROM crm_proposal_items WHERE proposal_id = $1 AND proposal_version = $2', [id, current.version]);
        if (itemsRes.rows[0]) {
          const sumCost = Number(itemsRes.rows[0].sum_cost || 0);
          const sumPrice = Number(itemsRes.rows[0].sum_price || 0);
          if (sumCost > 0 || sumPrice > 0) {
            fields.push(`total_cost = $${idx++}`); vals.push(sumCost);
            fields.push(`total_price = $${idx++}`); vals.push(sumPrice);
          }
        }

        const upd = await pool.query(`UPDATE crm_proposals SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, [...vals, id]);
        const updated = upd.rows[0];
        if (!updated) return json(res, 404, { error: 'not_found' });

        if (shouldVersion) {
          // Copiar itens da versão anterior para nova versão se necessário? Para preservar, buscamos itens da versão anterior e duplicamos com nova versão?
          // Para CRM-19, proposta versionada com itens: ao versionar, copiar itens atuais para nova versão
          const prevItems = await pool.query('SELECT * FROM crm_proposal_items WHERE proposal_id = $1 AND proposal_version = $2', [id, current.version]);
          for (const it of prevItems.rows) {
            await pool.query(
              `INSERT INTO crm_proposal_items (proposal_id, proposal_version, type, description, equipment_id, quantity, unit, unit_cost, total_cost, unit_price, total_price, recurrence_type, recurrence_details, supplier_name, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
              [id, newVersion, it.type, it.description, it.equipment_id, it.quantity, it.unit, it.unit_cost, it.total_cost, it.unit_price, it.total_price, it.recurrence_type, it.recurrence_details, it.supplier_name, it.notes]
            );
          }

          // Criar snapshot da versão anterior (preservar versões enviadas)
          const snapshotPrev = { proposal: current, items: prevItems.rows, version: current.version, preserved_at: new Date().toISOString() };
          // Se versão anterior já tem snapshot, não duplicar, mas garantir que existe
          const existingSnap = await pool.query('SELECT id FROM crm_proposal_versions WHERE proposal_id = $1 AND version = $2', [id, current.version]);
          if (!existingSnap.rows[0]) {
            await pool.query(
              `INSERT INTO crm_proposal_versions (proposal_id, version, snapshot, reason, created_by, created_by_id) VALUES ($1,$2,$3::jsonb,$4,$5,$6)`,
              [id, current.version, JSON.stringify(snapshotPrev), `Preservação automática ao mudar para ${updated.status} v${newVersion}`, session.role, session.identityId || null]
            );
          }

          // Criar snapshot da nova versão
          const newItemsRes = await pool.query('SELECT * FROM crm_proposal_items WHERE proposal_id = $1 AND proposal_version = $2', [id, newVersion]);
          const snapshotNew = { proposal: updated, items: newItemsRes.rows, version: newVersion, created_at: new Date().toISOString() };
          await pool.query(
            `INSERT INTO crm_proposal_versions (proposal_id, version, snapshot, reason, created_by, created_by_id) VALUES ($1,$2,$3::jsonb,$4,$5,$6)`,
            [id, newVersion, JSON.stringify(snapshotNew), body?.version_reason || `Versão ${newVersion} - ${updated.status}`, session.role, session.identityId || null]
          );
        }

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')", [session.role, session.identityId || session.role, updated.status === 'enviada' ? 'crm_proposal_status_enviada' : updated.status === 'aceita' ? 'crm_proposal_status_aceita' : 'crm_proposal_update', updated.id]); } catch {}

        // CRM-23: proposta aceita cria contrato/implantação idempotente
        let contractInfo = null;
        if (updated.status === 'aceita') {
          try {
            const pool = getPool();
            const tableExists = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_contracts'");
            if (tableExists.rows[0]) {
              const existingContract = await pool.query('SELECT id FROM crm_contracts WHERE proposal_id = $1 AND proposal_version = $2', [id, updated.version]);
              if (existingContract.rows[0]) {
                contractInfo = { id: existingContract.rows[0].id, isNew: false, idempotent: true };
              } else {
                const proposalItemsRes = await pool.query('SELECT * FROM crm_proposal_items WHERE proposal_id = $1 AND proposal_version = $2 ORDER BY created_at', [id, updated.version]);
                const contractId = crypto.randomUUID();
                const title = updated.title ? `${updated.title} - Contrato v${updated.version}` : `Contrato proposta ${id.slice(0,8)} v${updated.version}`;
                const idempotencyKey = `proposal:${id}:v${updated.version}`;
                const client = await pool.connect();
                try {
                  await client.query('BEGIN');
                  const existingTx = await client.query('SELECT id FROM crm_contracts WHERE proposal_id = $1 AND proposal_version = $2 FOR UPDATE', [id, updated.version]);
                  if (existingTx.rows[0]) {
                    await client.query('ROLLBACK');
                    contractInfo = { id: existingTx.rows[0].id, isNew: false, idempotent: true };
                  } else {
                    await client.query(
                      `INSERT INTO crm_contracts (id, proposal_id, proposal_version, company_id, opportunity_id, title, status, origin, version, total_cost, total_price, margin_percent, validity_days, validity_until, conditions, notes, idempotency_key, created_by, created_by_id)
                       VALUES ($1,$2,$3,$4,$5,$6,'ativo','crm_proposal_acceptance',1,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
                      [contractId, id, updated.version, updated.company_id, updated.opportunity_id, title, updated.total_cost || 0, updated.total_price || 0, updated.margin_percent, updated.validity_days, updated.validity_until, updated.conditions, `Criado idempotente via PATCH aceita ${id} v${updated.version}. Retries não duplicam.`, idempotencyKey, session.role, session.identityId || null]
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
                      [implantationId, contractId, id, updated.version, session.role, session.identityId || null]
                    );
                    await client.query('COMMIT');
                    contractInfo = { id: contractId, isNew: true, idempotent: true };
                    try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_create',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]); } catch {}
                  }
                } catch (e) {
                  try { await client.query('ROLLBACK'); } catch {}
                  console.error('contract auto-create from proposal PATCH failed', e);
                } finally {
                  client.release();
                }
              }
            }
          } catch (e) {
            console.error('contract auto-create check from PATCH failed', e);
          }
        }

        return json(res, 200, { proposal: updated, newVersion: shouldVersion ? newVersion : null, contract: contractInfo, note: contractInfo ? 'Proposta aceita cria contrato/implantação de modo idempotente; retries não duplicam cliente, contrato, postos ou faturamento.' : undefined });
      } catch (e) {
        console.error('proposal update failed', e);
        return json(res, 503, { error: 'proposal_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  async function handleItems(req, res, proposalId) {
    if (!isUuid(proposalId)) return bad(res, 'invalid_proposal_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const propRes = await pool.query('SELECT version FROM crm_proposals WHERE id = $1', [proposalId]);
        if (!propRes.rows[0]) return json(res, 404, { error: 'proposal_not_found' });
        const version = propRes.rows[0].version;
        const itemsRes = await pool.query('SELECT * FROM crm_proposal_items WHERE proposal_id = $1 AND proposal_version = $2 ORDER BY created_at', [proposalId, version]);
        return json(res, 200, { items: itemsRes.rows, proposal_version: version });
      } catch (e) {
        return json(res, 503, { error: 'proposal_items_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const type = String(body?.type || 'outro').trim().toLowerCase();
      const description = sanitizeText(body?.description, 500);
      const quantity = body?.quantity != null ? Number(body.quantity) : 1;
      const unit = sanitizeText(body?.unit, 50) || 'un';
      const unit_cost = body?.unit_cost != null ? Number(body.unit_cost) : (body?.unitCost != null ? Number(body.unitCost) : 0);
      const unit_price = body?.unit_price != null ? Number(body.unit_price) : (body?.unitPrice != null ? Number(body.unitPrice) : unit_cost);
      const recurrence_type = String(body?.recurrence_type || body?.recurrenceType || 'avulso').trim().toLowerCase();
      const recurrence_details = sanitizeText(body?.recurrence_details || body?.recurrenceDetails, 500);
      const equipment_id = body?.equipment_id ? String(body.equipment_id).trim() : null;
      const supplier_name = sanitizeText(body?.supplier_name || body?.supplierName, 200);
      const notes = sanitizeText(body?.notes, 500);

      if (!VALID_ITEM_TYPE.has(type)) return bad(res, 'invalid_type');
      if (!description) return bad(res, 'invalid_description');
      if (!Number.isFinite(quantity) || quantity < 0) return bad(res, 'invalid_quantity');
      if (!Number.isFinite(unit_cost) || unit_cost < 0) return bad(res, 'invalid_unit_cost');
      if (!Number.isFinite(unit_price) || unit_price < 0) return bad(res, 'invalid_unit_price');
      if (!VALID_RECURRENCE.has(recurrence_type)) return bad(res, 'invalid_recurrence_type');

      try {
        const pool = getPool();
        const propRes = await pool.query('SELECT version, status FROM crm_proposals WHERE id = $1', [proposalId]);
        if (!propRes.rows[0]) return json(res, 404, { error: 'proposal_not_found' });
        const currentVersion = propRes.rows[0].version;
        const currentStatus = propRes.rows[0].status;

        // Se proposta já foi enviada/aceita, não permitir alteração direta sem versionar? Para CRM-19, preservar versões enviadas, então bloquear adição em versão enviada e exigir nova versão via PATCH status?
        if (['enviada','aceita','recusada'].includes(currentStatus)) {
          return json(res, 409, { error: 'proposal_version_locked_preserve_sent', message: 'Versão enviada preservada, crie nova versão via PATCH status ou duplicação' });
        }

        const total_cost = quantity * unit_cost;
        const total_price = quantity * unit_price;

        const ins = await pool.query(
          `INSERT INTO crm_proposal_items (proposal_id, proposal_version, type, description, equipment_id, quantity, unit, unit_cost, total_cost, unit_price, total_price, recurrence_type, recurrence_details, supplier_name, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
          [proposalId, currentVersion, type, description, equipment_id, quantity, unit, unit_cost, total_cost, unit_price, total_price, recurrence_type, recurrence_details, supplier_name, notes]
        );

        // Atualizar totais da proposta
        const sumRes = await pool.query('SELECT COALESCE(SUM(total_cost),0)::numeric as sum_cost, COALESCE(SUM(total_price),0)::numeric as sum_price FROM crm_proposal_items WHERE proposal_id = $1 AND proposal_version = $2', [proposalId, currentVersion]);
        await pool.query('UPDATE crm_proposals SET total_cost = $2, total_price = $3, updated_at = NOW() WHERE id = $1', [proposalId, sumRes.rows[0].sum_cost, sumRes.rows[0].sum_price]);

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_proposal_item_create',$3,'allowed','none')", [session.role, session.identityId || session.role, `${proposalId}:${ins.rows[0].id}`]); } catch {}

        return json(res, 201, { item: ins.rows[0] });
      } catch (e) {
        console.error('proposal item create failed', e);
        return json(res, 503, { error: 'proposal_item_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleVersions(req, res, proposalId) {
    if (!isUuid(proposalId)) return bad(res, 'invalid_proposal_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
    try {
      const pool = getPool();
      const vers = await pool.query('SELECT id, proposal_id, version, reason, created_by, created_by_id, created_at FROM crm_proposal_versions WHERE proposal_id = $1 ORDER BY version DESC', [proposalId]);
      return json(res, 200, { versions: vers.rows });
    } catch (e) {
      return json(res, 503, { error: 'proposal_versions_unavailable' });
    }
  }

  async function handleVersionByNumber(req, res, proposalId, version) {
    if (!isUuid(proposalId)) return bad(res, 'invalid_proposal_id');
    const v = parseInt(version, 10);
    if (isNaN(v) || v < 1) return bad(res, 'invalid_version');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
    try {
      const pool = getPool();
      const ver = await pool.query('SELECT * FROM crm_proposal_versions WHERE proposal_id = $1 AND version = $2', [proposalId, v]);
      if (!ver.rows[0]) return json(res, 404, { error: 'version_not_found' });
      return json(res, 200, { version: ver.rows[0] });
    } catch (e) {
      return json(res, 503, { error: 'proposal_version_unavailable' });
    }
  }

  async function handlePdf(req, res, proposalId) {
    if (!isUuid(proposalId)) return bad(res, 'invalid_proposal_id');
    // PDF pode ser acessado com sessão admin ou com token? Para CRM-19, PDF gerado a partir da mesma versão persistida
    // Permitir admin session
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const versionParam = url.searchParams.get('version');
    const version = versionParam ? parseInt(versionParam, 10) : null;

    try {
      const pool = getPool();
      let proposalRes;
      let itemsRes;
      let snapVersion;

      if (version != null && !isNaN(version) && version >= 1) {
        const verRes = await pool.query('SELECT * FROM crm_proposal_versions WHERE proposal_id = $1 AND version = $2', [proposalId, version]);
        if (!verRes.rows[0]) return json(res, 404, { error: 'version_not_found' });
        const snapshot = verRes.rows[0].snapshot;
        // snapshot contém proposal e items
        const proposal = snapshot.proposal || snapshot;
        const items = snapshot.items || [];
        snapVersion = version;

        const lines = [];
        lines.push(`Empresa: ${proposal.company_id || '-'}`);
        lines.push(`Oportunidade: ${proposal.opportunity_id || '-'}`);
        lines.push(`Título: ${proposal.title}`);
        lines.push(`Status: ${proposal.status} Versão: ${snapshot.version || version}`);
        lines.push(`Escopo: ${(proposal.scope_description || '').slice(0,200)}`);
        lines.push(`Exclusões: ${(proposal.exclusions || '').slice(0,200)}`);
        lines.push(`Implantação: ${(proposal.implementation_details || '').slice(0,200)}`);
        lines.push(`Prazo: ${proposal.deadline_description || '-'}`);
        lines.push(`Reajuste: ${proposal.readjustment_forecast || '-'}`);
        lines.push(`Validade: ${proposal.validity_days || '-'} dias até ${proposal.validity_until || '-'}`);
        lines.push(`Condições: ${(proposal.conditions || '').slice(0,200)}`);
        lines.push(`Custo total: R$ ${proposal.total_cost} Preço total: R$ ${proposal.total_price}`);
        lines.push(`Itens (${items.length}):`);
        for (const it of items.slice(0,20)) {
          lines.push(`- ${it.type} ${it.description} qtd ${it.quantity} ${it.unit} custo ${it.unit_cost} preço ${it.unit_price} rec ${it.recurrence_type}`);
        }
        lines.push(`Gerado a partir da versão persistida v${snapVersion}, mesma versão persistida.`);

        const pdfBuffer = buildSimplePdf({ title: proposal.title, version: snapVersion, lines });
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename=\"proposta-${proposalId}-v${snapVersion}.pdf\"`,
          'Content-Length': pdfBuffer.length,
          'Cache-Control': 'no-store',
        });
        res.end(pdfBuffer);
        return;
      } else {
        // Versão atual
        proposalRes = await pool.query('SELECT * FROM crm_proposals WHERE id = $1', [proposalId]);
        if (!proposalRes.rows[0]) return json(res, 404, { error: 'not_found' });
        const proposal = proposalRes.rows[0];
        itemsRes = await pool.query('SELECT * FROM crm_proposal_items WHERE proposal_id = $1 AND proposal_version = $2 ORDER BY created_at', [proposalId, proposal.version]);
        const items = itemsRes.rows;
        snapVersion = proposal.version;

        const lines = [];
        lines.push(`Empresa: ${proposal.company_id || '-'}`);
        lines.push(`Oportunidade: ${proposal.opportunity_id || '-'}`);
        lines.push(`Título: ${proposal.title}`);
        lines.push(`Status: ${proposal.status} Versão: ${proposal.version}`);
        lines.push(`Escopo: ${(proposal.scope_description || '').slice(0,200)}`);
        lines.push(`Exclusões: ${(proposal.exclusions || '').slice(0,200)}`);
        lines.push(`Implantação: ${(proposal.implementation_details || '').slice(0,200)}`);
        lines.push(`Prazo: ${proposal.deadline_description || '-'}`);
        lines.push(`Reajuste: ${proposal.readjustment_forecast || '-'}`);
        lines.push(`Validade: ${proposal.validity_days || '-'} dias até ${proposal.validity_until || '-'}`);
        lines.push(`Condições: ${(proposal.conditions || '').slice(0,200)}`);
        lines.push(`Custo total: R$ ${proposal.total_cost} Preço total: R$ ${proposal.total_price}`);
        lines.push(`Itens (${items.length}):`);
        for (const it of items.slice(0,20)) {
          lines.push(`- ${it.type} ${it.description} qtd ${it.quantity} ${it.unit} custo ${it.unit_cost} preço ${it.unit_price} rec ${it.recurrence_type}`);
        }
        lines.push(`Gerado a partir da versão persistida v${snapVersion}, mesma versão persistida.`);

        const pdfBuffer = buildSimplePdf({ title: proposal.title, version: snapVersion, lines });
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename=\"proposta-${proposalId}-v${snapVersion}.pdf\"`,
          'Content-Length': pdfBuffer.length,
          'Cache-Control': 'no-store',
        });
        res.end(pdfBuffer);
        return;
      }
    } catch (e) {
      console.error('proposal pdf failed', e);
      return json(res, 503, { error: 'proposal_pdf_failed' });
    }
  }

  return { handleProposals, handleProposalById, handleItems, handleVersions, handleVersionByNumber, handlePdf };
}
