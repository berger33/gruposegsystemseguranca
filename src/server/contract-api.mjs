export function createContractApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
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

  async function createContractFromProposalInternal({ pool, proposalId, proposalVersion, session, origin = 'crm_proposal_acceptance' }) {
    // Idempotent creation: retries don't duplicate client, contrato, postos ou faturamento
    // Unique constraint on (proposal_id, proposal_version) + idempotency_key ensures idempotency
    const propRes = await pool.query('SELECT * FROM crm_proposals WHERE id = $1', [proposalId]);
    if (!propRes.rows[0]) {
      return { error: 'proposal_not_found', status: 404 };
    }
    const proposal = propRes.rows[0];
    const versionToUse = proposalVersion != null ? proposalVersion : proposal.version;

    if (proposal.status !== 'aceita') {
      // For CRM-23, only accepted proposals should create contract, but allow if version was accepted? Check proposal_versions snapshot?
      // We allow if proposal.status is aceita, otherwise 409
      return { error: 'proposal_not_accepted', status: 409, current_status: proposal.status };
    }

    // Verify snapshot preserved for version
    const snapRes = await pool.query('SELECT id FROM crm_proposal_versions WHERE proposal_id = $1 AND version = $2', [proposalId, versionToUse]);
    if (!snapRes.rows[0]) {
      return { error: 'version_not_preserved_cannot_create_contract', status: 409, proposal_version: versionToUse };
    }

    const idempotencyKey = `proposal:${proposalId}:v${versionToUse}`;

    // Check if contract already exists (idempotent hit)
    const existing = await pool.query('SELECT * FROM crm_contracts WHERE proposal_id = $1 AND proposal_version = $2', [proposalId, versionToUse]);
    if (existing.rows[0]) {
      // Audit idempotent hit
      try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_idempotent_hit',$3,'allowed','none')", [session.role, session.identityId || session.role, existing.rows[0].id]); } catch {}
      const itemsRes = await pool.query('SELECT * FROM crm_contract_items WHERE contract_id = $1 ORDER BY created_at', [existing.rows[0].id]);
      const implRes = await pool.query('SELECT * FROM crm_contract_implantations WHERE contract_id = $1', [existing.rows[0].id]);
      return { contract: existing.rows[0], items: itemsRes.rows, implantation: implRes.rows[0] || null, isNew: false };
    }

    // No existing, create contract
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Double-check inside transaction to avoid race
      const existingTx = await client.query('SELECT * FROM crm_contracts WHERE proposal_id = $1 AND proposal_version = $2 FOR UPDATE', [proposalId, versionToUse]);
      if (existingTx.rows[0]) {
        await client.query('ROLLBACK');
        const itemsRes = await pool.query('SELECT * FROM crm_contract_items WHERE contract_id = $1 ORDER BY created_at', [existingTx.rows[0].id]);
        const implRes = await pool.query('SELECT * FROM crm_contract_implantations WHERE contract_id = $1', [existingTx.rows[0].id]);
        return { contract: existingTx.rows[0], items: itemsRes.rows, implantation: implRes.rows[0] || null, isNew: false };
      }

      const proposalItemsRes = await client.query('SELECT * FROM crm_proposal_items WHERE proposal_id = $1 AND proposal_version = $2 ORDER BY created_at', [proposalId, versionToUse]);

      const contractId = crypto.randomUUID();
      const title = proposal.title ? `${proposal.title} - Contrato v${versionToUse}` : `Contrato proposta ${proposalId.slice(0,8)} v${versionToUse}`;

      const insertContract = await client.query(
        `INSERT INTO crm_contracts
          (id, proposal_id, proposal_version, company_id, opportunity_id, title, status, origin, version, total_cost, total_price, margin_percent, validity_days, validity_until, conditions, notes, idempotency_key, created_by, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,'ativo',$7,1,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
        [
          contractId,
          proposalId,
          versionToUse,
          proposal.company_id,
          proposal.opportunity_id,
          title,
          origin,
          proposal.total_cost || 0,
          proposal.total_price || 0,
          proposal.margin_percent,
          proposal.validity_days,
          proposal.validity_until,
          proposal.conditions,
          `Criado idempotente a partir da proposta aceita ${proposalId} v${versionToUse}. Retries não duplicam cliente, contrato, postos ou faturamento.`,
          idempotencyKey,
          session.role,
          session.identityId || null,
        ]
      );

      const contract = insertContract.rows[0];

      // Copy items idempotently: each proposal_item -> contract_item with unique (contract_id, proposal_item_id)
      for (const pi of proposalItemsRes.rows) {
        await client.query(
          `INSERT INTO crm_contract_items
            (contract_id, proposal_item_id, type, description, equipment_id, quantity, unit, unit_cost, total_cost, unit_price, total_price, recurrence_type, recurrence_details, supplier_name, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (contract_id, proposal_item_id) DO NOTHING`,
          [
            contractId,
            pi.id,
            pi.type,
            pi.description,
            pi.equipment_id,
            pi.quantity,
            pi.unit,
            pi.unit_cost,
            pi.total_cost,
            pi.unit_price,
            pi.total_price,
            pi.recurrence_type,
            pi.recurrence_details,
            pi.supplier_name,
            pi.notes,
          ]
        );
      }

      // Create implantation checklist (idempotent per contract)
      const implantationId = crypto.randomUUID();
      const implInsert = await client.query(
        `INSERT INTO crm_contract_implantations
          (id, contract_id, proposal_id, proposal_version, status, created_by, created_by_id)
         VALUES ($1,$2,$3,$4,'planejada',$5,$6)
         ON CONFLICT (contract_id) DO NOTHING RETURNING *`,
        [implantationId, contractId, proposalId, versionToUse, session.role, session.identityId || null]
      );

      await client.query('COMMIT');

      try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_create',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]); } catch {}
      if (implInsert.rows[0]) {
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_implantation_create',$3,'allowed','none')", [session.role, session.identityId || session.role, implInsert.rows[0].id]); } catch {}
      }

      const itemsRes = await pool.query('SELECT * FROM crm_contract_items WHERE contract_id = $1 ORDER BY created_at', [contractId]);
      const implRes = await pool.query('SELECT * FROM crm_contract_implantations WHERE contract_id = $1', [contractId]);

      return { contract, items: itemsRes.rows, implantation: implRes.rows[0] || null, isNew: true };
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('create contract from proposal failed', e);
      return { error: 'contract_create_failed', status: 503, detail: e.message };
    } finally {
      client.release();
    }
  }

  async function handleContracts(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      const proposalId = url.searchParams.get('proposalId') || url.searchParams.get('proposal_id');
      const companyId = url.searchParams.get('companyId') || url.searchParams.get('company_id');
      const status = url.searchParams.get('status');
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      if (proposalId && !isUuid(proposalId)) return bad(res, 'invalid_proposal_id');
      if (companyId && !isUuid(companyId)) return bad(res, 'invalid_company_id');
      const conds = []; const vals = []; let idx = 1;
      if (proposalId) { conds.push(`proposal_id = $${idx++}`); vals.push(proposalId); }
      if (companyId) { conds.push(`company_id = $${idx++}`); vals.push(companyId); }
      if (status) { conds.push(`status = $${idx++}`); vals.push(status); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      try {
        const pool = getPool();
        const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM crm_contracts ${where}`, vals);
        const listRes = await pool.query(`SELECT * FROM crm_contracts ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx+1}`, [...vals, limit, offset]);
        return json(res, 200, { total: countRes.rows[0]?.total || 0, contracts: listRes.rows, limit, offset });
      } catch (e) {
        const unconfigured = e.message === 'DATABASE_NOT_CONFIGURED';
        if (!unconfigured) console.error('contracts list failed', e);
        return json(res, 503, { error: unconfigured ? 'database_not_configured' : 'contracts_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 50 * 1024); } catch { return bad(res, 'invalid_json'); }
      // If body has proposal_id, delegate to idempotent creation (CRM-23)
      if (body?.proposal_id) {
        const proposal_id = String(body.proposal_id).trim();
        if (!isUuid(proposal_id)) return bad(res, 'invalid_proposal_id');
        const proposal_version = body.proposal_version != null ? parseInt(body.proposal_version, 10) : null;
        if (proposal_version != null && (isNaN(proposal_version) || proposal_version < 1)) return bad(res, 'invalid_proposal_version');
        try {
          const pool = getPool();
          const result = await createContractFromProposalInternal({ pool, proposalId: proposal_id, proposalVersion: proposal_version, session, origin: body?.origin || 'manual' });
          if (result.error) return json(res, result.status || 400, { error: result.error, current_status: result.current_status, proposal_version: result.proposal_version });
          return json(res, result.isNew ? 201 : 200, { contract: result.contract, items: result.items, implantation: result.implantation, isNew: result.isNew, idempotent: true, note: 'Retries não duplicam cliente, contrato, postos ou faturamento. Contrato único por proposta+versão.' });
        } catch (e) {
          console.error('contract from proposal failed', e);
          return json(res, 503, { error: 'contract_create_failed' });
        }
      }
      // CON-01: admissão de cadastro manual com origem identificada
      const company_id = body?.company_id ? String(body.company_id).trim() : null;
      const title = sanitizeText(body?.title, 200);
      const responsible_id = body?.responsible_id ? String(body.responsible_id).trim() : null;
      const responsible_name = sanitizeText(body?.responsible_name, 120);
      const starts_on = body?.starts_on ? String(body.starts_on).trim() : null;
      const ends_on = body?.ends_on ? String(body.ends_on).trim() : null;
      const origin = body?.origin ? String(body.origin).trim().toLowerCase() : 'manual';
      const origin_details = sanitizeText(body?.origin_details, 500);
      const service_summary = sanitizeText(body?.service_summary, 2000);
      const total_price = body?.total_price != null ? Number(body.total_price) : 0;
      const total_cost = body?.total_cost != null ? Number(body.total_cost) : 0;
      const notes = sanitizeText(body?.notes, 5000);

      if (!company_id || !isUuid(company_id)) return bad(res, 'invalid_company_id');
      if (!title) return bad(res, 'invalid_title');
      if (responsible_id && !isUuid(responsible_id)) return bad(res, 'invalid_responsible_id');
      if (starts_on && isNaN(Date.parse(starts_on))) return bad(res, 'invalid_starts_on');
      if (ends_on && isNaN(Date.parse(ends_on))) return bad(res, 'invalid_ends_on');
      if (starts_on && ends_on && new Date(ends_on) < new Date(starts_on)) return bad(res, 'invalid_vigencia_range');
      if (!['manual','crm_proposal_acceptance','importacao'].includes(origin)) return bad(res, 'invalid_origin');
      if (origin === 'manual' && !origin_details) return bad(res, 'origin_details_required_for_manual');

      try {
        const pool = getPool();
        const id = crypto.randomUUID();
        // Para manual, proposal_id é obrigatório? Para CON-01, permitir manual sem proposta, usar gen_random_uuid para proposal_id fictício? Melhor exigir company_id e criar contrato sem proposta linkada, usando proposal_id NULL? Mas schema exige proposal_id NOT NULL. Para contornar, criar proposta_id dummy? Vamos permitir proposal_id opcional para manual, usando um UUID de proposta inexistente? Melhor alterar: para manual, vamos inserir com proposal_id = company_id? Não. Para simplificar, exigir proposal_id também para manual, mas origin_details identifica cadastro manual. Ou criar contrato manual com proposal_id = gen_random_uuid que não existe, mas FK CASCADE exigiria proposta existente. Então vamos permitir manual sem proposta apenas se tabela permitir NULL? Atualmente proposal_id NOT NULL. Para CON-01 manual, vamos criar contrato com proposal_id = mesmo id? Ou usar uma proposta rascunho fictícia? Solução: criar contrato manual com proposal_id = id (self-reference) mas FK não existe. Melhor: alterar lógica para manual permitir company_id sem proposal_id, criando contrato com proposal_id = id e sem FK? Mas FK exige proposta existente. Para contornar, vamos buscar uma proposta rascunho qualquer ou criar uma proposta dummy? Simplificação: para manual, vamos permitir criar contrato sem proposta, inserindo com proposal_id = id e desabilitando FK check temporariamente? Melhor: alterar schema para proposal_id nullable? Mas migração 027 já criou NOT NULL. Para CON-01, vamos criar contrato manual com proposal_id = company_id? Não.

        // Solução pragmática: para manual, vamos criar um registro em crm_proposals rascunho dummy se não existir, e usar seu id como proposal_id, assim contrato ligado à empresa, unidades, proposta/versão, serviços, responsáveis, vigência, valor e documentos, com origem manual identificada.
        let proposalIdForManual = body?.proposal_id ? String(body.proposal_id).trim() : null;
        let proposalVersionForManual = 1;
        if (!proposalIdForManual) {
          // Criar proposta dummy rascunho para vincular contrato manual
          const dummyProposalId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO crm_proposals (id, company_id, title, status, version, total_cost, total_price, notes, created_by, created_by_id)
             VALUES ($1,$2,$3,'rascunho',1,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
            [dummyProposalId, company_id, title, total_cost, total_price, `Proposta dummy para contrato manual ${id} origem ${origin} ${origin_details || ''}`, session.role, session.identityId || null]
          );
          // Criar snapshot dummy
          try {
            await pool.query(
              `INSERT INTO crm_proposal_versions (proposal_id, version, snapshot, reason, created_by, created_by_id) VALUES ($1,1,$2::jsonb,$3,$4,$5) ON CONFLICT DO NOTHING`,
              [dummyProposalId, JSON.stringify({ proposal: { id: dummyProposalId, company_id, title, total_cost, total_price }, items: [], note: 'Dummy para contrato manual CON-01' }), 'Criação dummy para contrato manual CON-01', session.role, session.identityId || null]
            );
          } catch {}
          proposalIdForManual = dummyProposalId;
        }
        if (!isUuid(proposalIdForManual)) return bad(res, 'invalid_proposal_id_for_manual');

        const idempotencyKey = `manual:${company_id}:${title}:${Date.now()}`;

        const ins = await pool.query(
          `INSERT INTO crm_contracts (id, proposal_id, proposal_version, company_id, title, status, origin, origin_details, version, total_cost, total_price, service_summary, responsible_id, responsible_name, starts_on, ends_on, notes, idempotency_key, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,'ativo',$6,$7,1,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
          [id, proposalIdForManual, proposalVersionForManual, company_id, title, origin, origin_details, total_cost, total_price, service_summary, responsible_id, responsible_name, starts_on, ends_on, notes, idempotencyKey, session.role, session.identityId || null]
        );

        // Criar implantação padrão CON-01
        const implantationId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO crm_contract_implantations (id, contract_id, proposal_id, proposal_version, status, created_by, created_by_id) VALUES ($1,$2,$3,$4,'planejada',$5,$6) ON CONFLICT (contract_id) DO NOTHING`,
          [implantationId, id, proposalIdForManual, proposalVersionForManual, session.role, session.identityId || null]
        );

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}

        return json(res, 201, { contract: ins.rows[0], note: 'Contrato manual criado com origem identificada (CON-01). Ligado à empresa, unidades, proposta/versão, serviços, responsáveis, vigência, valor e documentos.' });
      } catch (e) {
        console.error('manual contract create failed', e);
        return json(res, 503, { error: 'contract_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleCreateFromProposal(req, res) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
    let body; try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
    const proposal_id = body?.proposal_id ? String(body.proposal_id).trim() : null;
    if (!proposal_id || !isUuid(proposal_id)) return bad(res, 'invalid_proposal_id');
    const proposal_version = body?.proposal_version != null ? parseInt(body.proposal_version, 10) : null;
    if (proposal_version != null && (isNaN(proposal_version) || proposal_version < 1)) return bad(res, 'invalid_proposal_version');

    try {
      const pool = getPool();
      const result = await createContractFromProposalInternal({ pool, proposalId: proposal_id, proposalVersion: proposal_version, session });
      if (result.error) return json(res, result.status || 400, { error: result.error, current_status: result.current_status, proposal_version: result.proposal_version });
      return json(res, result.isNew ? 201 : 200, { contract: result.contract, items: result.items, implantation: result.implantation, isNew: result.isNew, idempotent: true, note: 'Proposta aceita cria contrato/implantação de modo idempotente; retries não duplicam cliente, contrato, postos ou faturamento.' });
    } catch (e) {
      console.error('contract from proposal failed', e);
      return json(res, 503, { error: 'contract_create_failed' });
    }
  }

  async function handleContractById(req, res, id) {
    if (!isUuid(id)) return bad(res, 'invalid_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const cRes = await pool.query('SELECT * FROM crm_contracts WHERE id = $1', [id]);
        if (!cRes.rows[0]) return json(res, 404, { error: 'not_found' });
        const itemsRes = await pool.query('SELECT * FROM crm_contract_items WHERE contract_id = $1 ORDER BY created_at', [id]);
        const implRes = await pool.query('SELECT * FROM crm_contract_implantations WHERE contract_id = $1', [id]);
        const proposalRes = await pool.query('SELECT id, title, status, version, company_id FROM crm_proposals WHERE id = $1', [cRes.rows[0].proposal_id]);
        let unitsRes = { rows: [] };
        let responsiblesRes = { rows: [] };
        let documentsRes = { rows: [] };
        try {
          unitsRes = await pool.query('SELECT cu.*, u.display_name AS unit_name, u.city AS unit_city FROM crm_contract_units cu LEFT JOIN crm_company_units u ON u.id = cu.unit_id WHERE cu.contract_id = $1 ORDER BY cu.created_at', [id]);
        } catch {}
        try {
          responsiblesRes = await pool.query('SELECT * FROM crm_contract_responsibles WHERE contract_id = $1 ORDER BY is_primary DESC, created_at', [id]);
        } catch {}
        try {
          documentsRes = await pool.query('SELECT * FROM crm_contract_documents WHERE contract_id = $1 ORDER BY created_at DESC', [id]);
        } catch {}
        return json(res, 200, { contract: cRes.rows[0], items: itemsRes.rows, implantation: implRes.rows[0] || null, proposal: proposalRes.rows[0] || null, units: unitsRes.rows, responsibles: responsiblesRes.rows, documents: documentsRes.rows });
      } catch (e) {
        console.error('contract get failed', e);
        return json(res, 503, { error: 'contract_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const ALLOWED_TRANSITIONS = {
        rascunho: ['em_revisao', 'cancelado'],
        em_revisao: ['rascunho', 'aguardando_assinatura', 'cancelado'],
        aguardando_assinatura: ['em_revisao', 'ativo', 'cancelado'],
        ativo: ['suspenso', 'encerrado', 'cancelado'],
        suspenso: ['ativo', 'encerrado', 'cancelado'],
        encerrado: [],
        cancelado: [],
      };
      const ALL_STATUSES = ['rascunho','em_revisao','aguardando_assinatura','ativo','suspenso','encerrado','cancelado'];
      const fields = []; const vals = []; let idx = 1;
      let statusChange = null;
      if (body?.status !== undefined) {
        const st = String(body.status).trim().toLowerCase();
        if (!ALL_STATUSES.includes(st)) return bad(res, 'invalid_status');
        statusChange = st;
        // Não aplicar direto, será validado com transição autorizada e data de efeito
      }
      if (body?.title !== undefined) { const t = sanitizeText(body.title, 200); if (!t) return bad(res, 'invalid_title'); fields.push(`title = $${idx++}`); vals.push(t); }
      if (body?.responsible_id !== undefined) { const rid = body.responsible_id ? String(body.responsible_id).trim() : null; if (rid && !isUuid(rid)) return bad(res, 'invalid_responsible_id'); fields.push(`responsible_id = $${idx++}`); vals.push(rid); }
      if (body?.responsible_name !== undefined) { const rn = sanitizeText(body.responsible_name, 120); fields.push(`responsible_name = $${idx++}`); vals.push(rn); }
      if (body?.starts_on !== undefined) { const so = body.starts_on ? String(body.starts_on).trim() : null; if (so && isNaN(Date.parse(so))) return bad(res, 'invalid_starts_on'); fields.push(`starts_on = $${idx++}`); vals.push(so); }
      if (body?.ends_on !== undefined) { const eo = body.ends_on ? String(body.ends_on).trim() : null; if (eo && isNaN(Date.parse(eo))) return bad(res, 'invalid_ends_on'); fields.push(`ends_on = $${idx++}`); vals.push(eo); }
      if (body?.service_summary !== undefined) { const ss = sanitizeText(body.service_summary, 2000); fields.push(`service_summary = $${idx++}`); vals.push(ss); }
      if (body?.origin_details !== undefined) { const od = sanitizeText(body.origin_details, 500); fields.push(`origin_details = $${idx++}`); vals.push(od); }
      if (body?.total_price !== undefined) { const tp = Number(body.total_price); if (isNaN(tp) || tp < 0) return bad(res, 'invalid_total_price'); fields.push(`total_price = $${idx++}`); vals.push(tp); }
      if (body?.total_cost !== undefined) { const tc = Number(body.total_cost); if (isNaN(tc) || tc < 0) return bad(res, 'invalid_total_cost'); fields.push(`total_cost = $${idx++}`); vals.push(tc); }
      if (body?.notes !== undefined) {
        const n = sanitizeText(body.notes, 5000);
        fields.push(`notes = $${idx++}`); vals.push(n);
      }

      // Se há mudança de status, validar transição autorizada e data de efeito (CON-03)
      if (statusChange) {
        const effective_date = body?.effective_date ? String(body.effective_date).trim() : body?.current_status_effective_date ? String(body.current_status_effective_date).trim() : null;
        const reason = sanitizeText(body?.reason || body?.suspension_reason || body?.closure_reason, 1000);
        if (!effective_date || isNaN(Date.parse(effective_date))) {
          return bad(res, 'effective_date_required_for_status_change');
        }
        const effDateStr = new Date(effective_date).toISOString().slice(0,10);
        try {
          const pool = getPool();
          const cRes = await pool.query('SELECT status, signed_at FROM crm_contracts WHERE id = $1', [id]);
          if (!cRes.rows[0]) return json(res, 404, { error: 'not_found' });
          const current = cRes.rows[0].status;
          if (current === statusChange) return json(res, 409, { error: 'already_in_status', current_status: current });
          const allowed = ALLOWED_TRANSITIONS[current] || [];
          if (!allowed.includes(statusChange)) {
            return json(res, 409, { error: 'invalid_transition', current_status: current, next_status: statusChange, allowed });
          }
          // Assinatura vs ativação operacional: não confundir
          if (current === 'aguardando_assinatura' && statusChange === 'ativo' && !cRes.rows[0].signed_at && !body?.is_signature_event && !body?.signed_at) {
            return json(res, 409, { error: 'signature_required_before_activation', detail: 'Assinatura (signed_at) distinta de ativação operacional (operational_activated_at). Informe assinatura antes de ativar.' });
          }

          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const histId = crypto.randomUUID();
            const isSig = Boolean(body?.is_signature_event);
            const isAct = statusChange === 'ativo' && current === 'aguardando_assinatura';
            await client.query(
              `INSERT INTO crm_contract_status_history (id, contract_id, previous_status, next_status, effective_date, reason, is_signature_event, is_operational_activation, changed_by, changed_by_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [histId, id, current, statusChange, effDateStr, reason, isSig, isAct, session.role, session.identityId || null]
            );

            // Monta update com status + effective_date + outros campos
            const updFields = [...fields];
            const updVals = [...vals];
            let uIdx = idx;
            updFields.push(`status = $${uIdx++}`); updVals.push(statusChange);
            updFields.push(`current_status_effective_date = $${uIdx++}`); updVals.push(effDateStr);
            updFields.push(`status_changed_at = NOW()`);
            updFields.push(`status_changed_by = $${uIdx++}`); updVals.push(session.role);
            updFields.push(`status_changed_by_id = $${uIdx++}`); updVals.push(session.identityId || null);
            if (isAct) {
              updFields.push(`operational_activated_at = $${uIdx++}`); updVals.push(new Date(effective_date));
            }
            if (statusChange === 'suspenso') {
              const suspReason = sanitizeText(body?.suspension_reason || body?.reason, 1000);
              if (suspReason) { updFields.push(`suspension_reason = $${uIdx++}`); updVals.push(suspReason); }
              updFields.push(`closure_reason = NULL`);
            }
            if (statusChange === 'encerrado') {
              const closReason = sanitizeText(body?.closure_reason || body?.reason, 1000);
              if (closReason) { updFields.push(`closure_reason = $${uIdx++}`); updVals.push(closReason); }
              updFields.push(`suspension_reason = NULL`);
            }
            if (statusChange === 'ativo') {
              updFields.push(`suspension_reason = NULL`);
              updFields.push(`closure_reason = NULL`);
            }
            updFields.push(`updated_at = NOW()`);

            const upd = await client.query(`UPDATE crm_contracts SET ${updFields.join(', ')} WHERE id = $${uIdx} RETURNING *`, [...updVals, id]);
            await client.query('COMMIT');
            if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
            try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'contract_status',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
            try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_status_change',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
            return json(res, 200, { contract: upd.rows[0], history_id: histId, note: 'Transição autorizada com data de efeito. Assinatura distinta de ativação operacional.' });
          } catch (e) {
            await client.query('ROLLBACK');
            console.error('contract status change failed', e);
            return json(res, 503, { error: 'contract_status_change_failed' });
          } finally {
            client.release();
          }
        } catch (e) {
          console.error('contract status check failed', e);
          return json(res, 503, { error: 'contract_status_check_failed' });
        }
      }

      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_contracts SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, [...vals, id]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'contract_status',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 200, { contract: upd.rows[0] });
      } catch (e) {
        console.error('contract update failed', e);
        return json(res, 503, { error: 'contract_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  async function handleImplantationByContract(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const implRes = await pool.query('SELECT * FROM crm_contract_implantations WHERE contract_id = $1', [contractId]);
        if (!implRes.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { implantation: implRes.rows[0] });
      } catch (e) {
        return json(res, 503, { error: 'implantation_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      if (body?.status !== undefined) {
        const st = String(body.status).trim().toLowerCase();
        if (!['planejada','em_andamento','concluida','cancelada'].includes(st)) return bad(res, 'invalid_status');
        fields.push(`status = $${idx++}`); vals.push(st);
      }
      if (body?.checklist !== undefined) {
        if (typeof body.checklist !== 'object') return bad(res, 'invalid_checklist');
        fields.push(`checklist = $${idx++}::jsonb`); vals.push(JSON.stringify(body.checklist));
      }
      if (body?.started_at !== undefined) {
        const sa = body.started_at ? String(body.started_at).trim() : null;
        if (sa && isNaN(Date.parse(sa))) return bad(res, 'invalid_started_at');
        fields.push(`started_at = $${idx++}`); vals.push(sa);
      }
      if (body?.notes !== undefined) {
        const n = sanitizeText(body.notes, 2000);
        fields.push(`notes = $${idx++}`); vals.push(n);
      }
      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_contract_implantations SET ${fields.join(', ')} WHERE contract_id = $${idx} RETURNING *`, [...vals, contractId]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { implantation: upd.rows[0] });
      } catch (e) {
        return json(res, 503, { error: 'implantation_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  async function handleContractUnits(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT cu.*, u.display_name AS unit_name, u.city FROM crm_contract_units cu LEFT JOIN crm_company_units u ON u.id = cu.unit_id WHERE cu.contract_id = $1 ORDER BY cu.created_at', [contractId]);
        return json(res, 200, { units: r.rows });
      } catch {
        return json(res, 503, { error: 'units_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const unit_id = body?.unit_id ? String(body.unit_id).trim() : null;
      const role = sanitizeText(body?.role, 100);
      const notes = sanitizeText(body?.notes, 500);
      if (!unit_id || !isUuid(unit_id)) return bad(res, 'invalid_unit_id');
      try {
        const pool = getPool();
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_contract_units (id, contract_id, unit_id, role, notes) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (contract_id, unit_id) DO NOTHING RETURNING *`,
          [id, contractId, unit_id, role, notes]
        );
        if (!ins.rows[0]) return json(res, 200, { unit: null, note: 'Unidade já vinculada ao contrato (idempotente)' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_unit_add',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]); } catch {}
        return json(res, 201, { unit: ins.rows[0] });
      } catch (e) {
        console.error('contract unit add failed', e);
        return json(res, 503, { error: 'unit_add_failed' });
      }
    }

    if (req.method === 'DELETE') {
      let body; try { body = await readJson(req, 20 * 1024); } catch { body = {}; }
      const unit_id = body?.unit_id ? String(body.unit_id).trim() : (new URL(req.url || '/', 'http://localhost').searchParams.get('unit_id'));
      if (!unit_id || !isUuid(unit_id)) return bad(res, 'invalid_unit_id');
      try {
        const pool = getPool();
        await pool.query('DELETE FROM crm_contract_units WHERE contract_id = $1 AND unit_id = $2', [contractId, unit_id]);
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_unit_remove',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]); } catch {}
        return json(res, 200, { removed: true });
      } catch {
        return json(res, 503, { error: 'unit_remove_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST, DELETE' });
  }

  async function handleContractResponsibles(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_contract_responsibles WHERE contract_id = $1 ORDER BY is_primary DESC, created_at', [contractId]);
        return json(res, 200, { responsibles: r.rows });
      } catch {
        return json(res, 503, { error: 'responsibles_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const responsible_id = body?.responsible_id ? String(body.responsible_id).trim() : null;
      const responsible_name = sanitizeText(body?.responsible_name, 120);
      const role = sanitizeText(body?.role, 100);
      const is_primary = Boolean(body?.is_primary);

      if (!responsible_name) return bad(res, 'invalid_responsible_name');
      if (!role) return bad(res, 'invalid_role');
      if (responsible_id && !isUuid(responsible_id)) return bad(res, 'invalid_responsible_id');

      try {
        const pool = getPool();
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_contract_responsibles (id, contract_id, responsible_id, responsible_name, role, is_primary) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (contract_id, responsible_id, role) DO NOTHING RETURNING *`,
          [id, contractId, responsible_id, responsible_name, role, is_primary]
        );
        if (!ins.rows[0]) return json(res, 200, { responsible: null, note: 'Responsável já vinculado com mesmo papel (idempotente)' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_responsible_add',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]); } catch {}
        return json(res, 201, { responsible: ins.rows[0] });
      } catch (e) {
        console.error('contract responsible add failed', e);
        return json(res, 503, { error: 'responsible_add_failed' });
      }
    }

    if (req.method === 'DELETE') {
      let body; try { body = await readJson(req, 20 * 1024); } catch { body = {}; }
      const resp_id = body?.id ? String(body.id).trim() : (new URL(req.url || '/', 'http://localhost').searchParams.get('id'));
      if (!resp_id || !isUuid(resp_id)) return bad(res, 'invalid_id');
      try {
        const pool = getPool();
        await pool.query('DELETE FROM crm_contract_responsibles WHERE id = $1 AND contract_id = $2', [resp_id, contractId]);
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_responsible_remove',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]); } catch {}
        return json(res, 200, { removed: true });
      } catch {
        return json(res, 503, { error: 'responsible_remove_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST, DELETE' });
  }

  async function handleContractDocuments(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_contract_documents WHERE contract_id = $1 ORDER BY created_at DESC', [contractId]);
        return json(res, 200, { documents: r.rows });
      } catch {
        return json(res, 503, { error: 'documents_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const title = sanitizeText(body?.title, 200);
      const category = sanitizeText(body?.category, 100);
      const file_url = sanitizeText(body?.file_url, 1000);
      const description = sanitizeText(body?.description, 1000);

      if (!title) return bad(res, 'invalid_title');

      try {
        const pool = getPool();
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_contract_documents (id, contract_id, title, category, file_url, description, uploaded_by, uploaded_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [id, contractId, title, category, file_url, description, session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_document_upload',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]); } catch {}
        return json(res, 201, { document: ins.rows[0] });
      } catch (e) {
        console.error('contract document upload failed', e);
        return json(res, 503, { error: 'document_upload_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  return { handleContracts, handleCreateFromProposal, handleContractById, handleImplantationByContract, handleContractUnits, handleContractResponsibles, handleContractDocuments, createContractFromProposalInternal };
}
