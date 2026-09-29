export function createAstAdvancedApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readJson = async (req) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
  };
  const generateProtocol = (prefix) => {
    const d = new Date();
    const y = d.getFullYear().toString();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const rand = Math.random().toString(36).substring(2,6).toUpperCase();
    return `${prefix}-${y}${m}${day}-${rand}`;
  };

  // AST-07 inventário físico divergências ajuste aprovado
  const handleInventories = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess || !requireRole(sess, ['admin','ti','rh','financeiro'])) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const { rows } = await pool.query(`SELECT * FROM ast_inventories ORDER BY created_at DESC LIMIT 200`);
      return json(res,200,{items:rows});
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const title = String(body.title||'').trim();
      const description = String(body.description||'').trim();
      const location = String(body.location||'').trim();
      if (title.length<5 || title.length>200) return json(res,400,{error:'invalid_title'});
      if (description.length<10 || description.length>2000) return json(res,400,{error:'invalid_description'});
      if (location.length<3 || location.length>200) return json(res,400,{error:'invalid_location'});
      const protocol = generateProtocol('INV-AST');
      const { rows } = await pool.query(`INSERT INTO ast_inventories (protocol, title, description, location, created_by_identity) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [protocol, title, description, location, sess.identityId||null]);
      await pool.query(`INSERT INTO ast_inventory_history (inventory_id, previous_status, next_status, changed_by_identity, reason) VALUES ($1,NULL,$2,$3,$4)`, [rows[0].id, 'rascunho', sess.identityId||null, 'Criação inventário físico divergências ajuste aprovado']);
      await auditLog({ action:'ast_inventory_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ protocol, location } });
      return json(res,201,rows[0]);
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id;
      const next_status = body.status ? String(body.status).trim() : null;
      const reason = body.reason ? String(body.reason).trim() : 'Atualização inventário';
      if (!id || !next_status) return json(res,400,{error:'missing_id_or_status'});
      if (reason.length<10 || reason.length>1000) return json(res,400,{error:'invalid_reason'});
      const { rows: existing } = await pool.query(`SELECT * FROM ast_inventories WHERE id=$1`, [id]);
      if (!existing.length) return json(res,404,{error:'not_found'});
      const prev = existing[0].status;
      const valid = ['rascunho','em_contagem','divergente','ajustado','aprovado','cancelado'];
      if (!valid.includes(next_status)) return json(res,400,{error:'invalid_status'});
      let approved_by = existing[0].approved_by_identity;
      let approved_at = existing[0].approved_at;
      if (next_status==='aprovado') { approved_by = sess.identityId||null; approved_at = new Date(); }
      const { rows } = await pool.query(`UPDATE ast_inventories SET status=$2, approved_by_identity=$3, approved_at=$4, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, next_status, approved_by, approved_at]);
      await pool.query(`INSERT INTO ast_inventory_history (inventory_id, previous_status, next_status, changed_by_identity, reason) VALUES ($1,$2,$3,$4,$5)`, [id, prev, next_status, sess.identityId||null, reason]);
      await auditLog({ action:'ast_inventory_status_update', actor:sess.identityId||'system', target:id, meta:{ from: prev, to: next_status } });
      // se aprovado, aplicar ajustes
      if (next_status==='aprovado') {
        const { rows: items } = await pool.query(`SELECT * FROM ast_inventory_items WHERE inventory_id=$1 AND is_approved=true AND adjustment_quantity IS NOT NULL`, [id]);
        for (const it of items) {
          const diff = it.adjustment_quantity - it.expected_quantity;
          if (diff!==0) {
            const movType = diff>0 ? 'entrada' : 'saida';
            await pool.query(`INSERT INTO ast_stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, created_by_identity) VALUES ($1,$2,$3,$4,'inventario',$5,$6)`, [it.product_id, movType, Math.abs(diff), `Ajuste inventário ${existing[0].protocol} divergência aprovada ${it.expected_quantity}->${it.adjustment_quantity}`, existing[0].protocol, sess.identityId||null]);
          }
        }
      }
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleInventoryItems = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess || !requireRole(sess, ['admin','ti','rh','financeiro'])) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const inventory_id = url.searchParams.get('inventory_id');
      if (!inventory_id) return json(res,400,{error:'missing_inventory_id'});
      const { rows } = await pool.query(`SELECT ii.*, p.sku, p.name as product_name FROM ast_inventory_items ii JOIN ast_products p ON p.id=ii.product_id WHERE ii.inventory_id=$1 ORDER BY p.name ASC`, [inventory_id]);
      return json(res,200,{items:rows});
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const inventory_id = body.inventory_id;
      const product_id = body.product_id;
      const expected_quantity = Number(body.expected_quantity);
      const counted_quantity = Number(body.counted_quantity);
      const adjustment_quantity = body.adjustment_quantity !=null ? Number(body.adjustment_quantity) : null;
      const adjustment_reason = body.adjustment_reason ? String(body.adjustment_reason).trim() : null;
      const is_approved = !!body.is_approved;
      if (!inventory_id || !product_id) return json(res,400,{error:'missing_inventory_or_product'});
      if (!Number.isFinite(expected_quantity) || expected_quantity<0) return json(res,400,{error:'invalid_expected_quantity'});
      if (!Number.isFinite(counted_quantity) || counted_quantity<0) return json(res,400,{error:'invalid_counted_quantity'});
      if (adjustment_quantity!=null && (!Number.isFinite(adjustment_quantity) || adjustment_quantity<0)) return json(res,400,{error:'invalid_adjustment_quantity'});
      if (adjustment_reason && (adjustment_reason.length<10 || adjustment_reason.length>1000)) return json(res,400,{error:'invalid_adjustment_reason'});
      if (adjustment_quantity!=null && !adjustment_reason) return json(res,400,{error:'adjustment_reason_required'});
      try {
        const { rows } = await pool.query(`INSERT INTO ast_inventory_items (inventory_id, product_id, expected_quantity, counted_quantity, adjustment_quantity, adjustment_reason, is_approved) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [inventory_id, product_id, expected_quantity, counted_quantity, adjustment_quantity, adjustment_reason, is_approved]);
        await auditLog({ action:'ast_inventory_item_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ inventory_id, product_id } });
        return json(res,201,rows[0]);
      } catch(e){
        if (e.code==='23505') return json(res,409,{error:'duplicate_product_in_inventory'});
        throw e;
      }
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id;
      if (!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ast_inventory_items WHERE id=$1`, [id]);
      if (!existing.length) return json(res,404,{error:'not_found'});
      const counted_quantity = body.counted_quantity !=null ? Number(body.counted_quantity) : existing[0].counted_quantity;
      const adjustment_quantity = body.adjustment_quantity !== undefined ? (body.adjustment_quantity!=null ? Number(body.adjustment_quantity) : null) : existing[0].adjustment_quantity;
      const adjustment_reason = body.adjustment_reason !== undefined ? (body.adjustment_reason ? String(body.adjustment_reason).trim() : null) : existing[0].adjustment_reason;
      const is_approved = body.is_approved !== undefined ? !!body.is_approved : existing[0].is_approved;
      if (!Number.isFinite(counted_quantity) || counted_quantity<0) return json(res,400,{error:'invalid_counted_quantity'});
      if (adjustment_quantity!=null && (!Number.isFinite(adjustment_quantity) || adjustment_quantity<0)) return json(res,400,{error:'invalid_adjustment_quantity'});
      if (adjustment_reason && (adjustment_reason.length<10 || adjustment_reason.length>1000)) return json(res,400,{error:'invalid_adjustment_reason'});
      const { rows } = await pool.query(`UPDATE ast_inventory_items SET counted_quantity=$2, adjustment_quantity=$3, adjustment_reason=$4, is_approved=$5 WHERE id=$1 RETURNING *`, [id, counted_quantity, adjustment_quantity, adjustment_reason, is_approved]);
      await auditLog({ action:'ast_inventory_item_update', actor:sess.identityId||'system', target:id, meta:{ counted_quantity, adjustment_quantity } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // AST-08 OS
  const handleServiceOrders = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess || !requireRole(sess, ['admin','ti','rh','financeiro'])) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const { rows } = await pool.query(`SELECT so.*, ca.name as client_name FROM ast_service_orders so LEFT JOIN client_accounts ca ON ca.id=so.client_account_id ORDER BY so.created_at DESC LIMIT 200`);
      return json(res,200,{items:rows});
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const title = String(body.title||'').trim();
      const description = String(body.description||'').trim();
      const requester_name = String(body.requester_name||'').trim();
      const client_account_id = body.client_account_id || null;
      const contract_id = body.contract_id || null;
      const technician_name = body.technician_name ? String(body.technician_name).trim() : null;
      const technician_identity = body.technician_identity || null;
      const priority = String(body.priority||'media').trim();
      const scheduled_at = body.scheduled_at || null;
      const diagnosis = body.diagnosis ? String(body.diagnosis).trim() : null;
      const checklist = body.checklist || [];
      const parts = body.parts || [];
      if (title.length<5 || title.length>200) return json(res,400,{error:'invalid_title'});
      if (description.length<10 || description.length>2000) return json(res,400,{error:'invalid_description'});
      if (requester_name.length<2 || requester_name.length>200) return json(res,400,{error:'invalid_requester_name'});
      if (technician_name && (technician_name.length<2 || technician_name.length>200)) return json(res,400,{error:'invalid_technician_name'});
      const validPrio = ['baixa','media','alta','critica'];
      if (!validPrio.includes(priority)) return json(res,400,{error:'invalid_priority'});
      if (diagnosis && (diagnosis.length<10 || diagnosis.length>2000)) return json(res,400,{error:'invalid_diagnosis'});
      const protocol = generateProtocol('OS-AST');
      const { rows } = await pool.query(`INSERT INTO ast_service_orders (protocol, title, description, requester_name, requester_identity, client_account_id, contract_id, technician_name, technician_identity, priority, scheduled_at, diagnosis, checklist, parts, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`, [protocol, title, description, requester_name, sess.identityId||null, client_account_id, contract_id, technician_name, technician_identity, priority, scheduled_at, diagnosis, JSON.stringify(checklist), JSON.stringify(parts), sess.identityId||null]);
      await pool.query(`INSERT INTO ast_service_order_history (service_order_id, previous_status, next_status, changed_by_identity, reason) VALUES ($1,NULL,$2,$3,$4)`, [rows[0].id, 'rascunho', sess.identityId||null, 'Criação OS solicitante contrato técnico agenda diagnóstico checklist peças execução']);
      await auditLog({ action:'ast_service_order_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ protocol, title } });
      return json(res,201,rows[0]);
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id;
      const next_status = body.status ? String(body.status).trim() : null;
      const reason = body.reason ? String(body.reason).trim() : 'Atualização OS';
      if (!id || !next_status) return json(res,400,{error:'missing_id_or_status'});
      if (reason.length<10 || reason.length>1000) return json(res,400,{error:'invalid_reason'});
      const { rows: existing } = await pool.query(`SELECT * FROM ast_service_orders WHERE id=$1`, [id]);
      if (!existing.length) return json(res,404,{error:'not_found'});
      const prev = existing[0].status;
      const valid = ['rascunho','aberta','em_execucao','aguardando_peca','aguardando_aprovacao','concluida','cancelada'];
      if (!valid.includes(next_status)) return json(res,400,{error:'invalid_status'});
      const execution_notes = body.execution_notes ? String(body.execution_notes).trim() : existing[0].execution_notes;
      const diagnosis = body.diagnosis !== undefined ? (body.diagnosis ? String(body.diagnosis).trim() : null) : existing[0].diagnosis;
      const { rows } = await pool.query(`UPDATE ast_service_orders SET status=$2, execution_notes=$3, diagnosis=$4, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, next_status, execution_notes, diagnosis]);
      await pool.query(`INSERT INTO ast_service_order_history (service_order_id, previous_status, next_status, changed_by_identity, reason) VALUES ($1,$2,$3,$4,$5)`, [id, prev, next_status, sess.identityId||null, reason]);
      await auditLog({ action:'ast_service_order_status_update', actor:sess.identityId||'system', target:id, meta:{ from: prev, to: next_status } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // AST-09 evidências antes/depois aceite garantia retorno custo acesso cliente somente aprovado
  const handleServiceOrderEvidences = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess || !requireRole(sess, ['admin','ti','rh','financeiro'])) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const service_order_id = url.searchParams.get('service_order_id');
      let q = `SELECT * FROM ast_service_order_evidences`;
      const params = [];
      if (service_order_id) { params.push(service_order_id); q+=` WHERE service_order_id=$${params.length}`; }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'acesso cliente somente ao que for aprovado is_client_visible true e is_approved true'});
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const service_order_id = body.service_order_id;
      const evidence_type = String(body.evidence_type||'').trim();
      const file_name = String(body.file_name||'').trim();
      const file_url = String(body.file_url||'').trim();
      const storage_key = String(body.storage_key||'').trim();
      const before_after = String(body.before_after||'').trim();
      const is_client_visible = !!body.is_client_visible;
      const warranty_until = body.warranty_until || null;
      const cost_cents = body.cost_cents !=null ? Number(body.cost_cents) : null;
      if (!service_order_id) return json(res,400,{error:'missing_service_order_id'});
      if (evidence_type.length<3 || evidence_type.length>100) return json(res,400,{error:'invalid_evidence_type'});
      if (file_name.length<1 || file_name.length>500) return json(res,400,{error:'invalid_file_name'});
      if (file_url.length<5 || file_url.length>1000) return json(res,400,{error:'invalid_file_url'});
      if (storage_key.length<5 || storage_key.length>500) return json(res,400,{error:'invalid_storage_key'});
      if (!['antes','depois','outro'].includes(before_after)) return json(res,400,{error:'invalid_before_after'});
      if (cost_cents!=null && (!Number.isFinite(cost_cents) || cost_cents<0)) return json(res,400,{error:'invalid_cost'});
      try {
        const { rows } = await pool.query(`INSERT INTO ast_service_order_evidences (service_order_id, evidence_type, file_name, file_url, storage_key, before_after, is_client_visible, warranty_until, cost_cents, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [service_order_id, evidence_type, file_name, file_url, storage_key, before_after, is_client_visible, warranty_until, cost_cents, sess.identityId||null]);
        await auditLog({ action:'ast_os_evidence_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ service_order_id, evidence_type, is_client_visible } });
        return json(res,201,rows[0]);
      } catch(e){
        if (e.code==='23505') return json(res,409,{error:'duplicate_storage_key'});
        throw e;
      }
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id;
      if (!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ast_service_order_evidences WHERE id=$1`, [id]);
      if (!existing.length) return json(res,404,{error:'not_found'});
      const is_approved = body.is_approved !== undefined ? !!body.is_approved : existing[0].is_approved;
      const is_client_visible = body.is_client_visible !== undefined ? !!body.is_client_visible : existing[0].is_client_visible;
      // acesso cliente somente ao que for aprovado: is_client_visible true só se is_approved true
      if (is_client_visible && !is_approved) return json(res,400,{error:'client_visible_requires_approved'});
      const { rows } = await pool.query(`UPDATE ast_service_order_evidences SET is_approved=$2, is_client_visible=$3, approved_by_identity=$4, approved_at=$5 WHERE id=$1 RETURNING *`, [id, is_approved, is_client_visible, is_approved ? sess.identityId||null : null, is_approved ? new Date() : null]);
      await auditLog({ action:'ast_os_evidence_approve', actor:sess.identityId||'system', target:id, meta:{ is_approved, is_client_visible } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // AST-10 manutenção preventiva/corretiva periodicidade alerta próxima visita histórico por ativo
  const handleMaintenancePlans = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess || !requireRole(sess, ['admin','ti','rh','financeiro'])) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const asset_id = url.searchParams.get('asset_id');
      let q = `SELECT mp.*, a.serial_number FROM ast_maintenance_plans mp JOIN ast_serialized_assets a ON a.id=mp.asset_id`;
      const params = [];
      if (asset_id) { params.push(asset_id); q+=` WHERE mp.asset_id=$${params.length}`; }
      q+=` ORDER BY mp.next_due_date ASC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows});
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const asset_id = body.asset_id;
      const maintenance_type = String(body.maintenance_type||'preventiva').trim();
      const title = String(body.title||'').trim();
      const description = String(body.description||'').trim();
      const periodicity_days = Number(body.periodicity_days);
      const next_due_date = body.next_due_date;
      const alert_days_before = body.alert_days_before !=null ? Number(body.alert_days_before) : 7;
      if (!asset_id) return json(res,400,{error:'missing_asset_id'});
      if (title.length<5 || title.length>200) return json(res,400,{error:'invalid_title'});
      if (description.length<10 || description.length>2000) return json(res,400,{error:'invalid_description'});
      if (!Number.isFinite(periodicity_days) || periodicity_days<=0) return json(res,400,{error:'invalid_periodicity_days'});
      if (!next_due_date) return json(res,400,{error:'missing_next_due_date'});
      if (!Number.isFinite(alert_days_before) || alert_days_before<0) return json(res,400,{error:'invalid_alert_days'});
      const validTypes = ['preventiva','corretiva','preditiva','outro'];
      if (!validTypes.includes(maintenance_type)) return json(res,400,{error:'invalid_maintenance_type'});
      const { rows } = await pool.query(`INSERT INTO ast_maintenance_plans (asset_id, maintenance_type, title, description, periodicity_days, next_due_date, alert_days_before, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [asset_id, maintenance_type, title, description, periodicity_days, next_due_date, alert_days_before, sess.identityId||null]);
      await auditLog({ action:'ast_maintenance_plan_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ asset_id, maintenance_type } });
      return json(res,201,rows[0]);
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id;
      const status = body.status ? String(body.status).trim() : null;
      if (!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ast_maintenance_plans WHERE id=$1`, [id]);
      if (!existing.length) return json(res,404,{error:'not_found'});
      const next_status = status || existing[0].status;
      const valid = ['agendada','em_execucao','concluida','atrasada','cancelada'];
      if (!valid.includes(next_status)) return json(res,400,{error:'invalid_status'});
      const next_due_date = body.next_due_date || existing[0].next_due_date;
      const { rows } = await pool.query(`UPDATE ast_maintenance_plans SET status=$2, next_due_date=$3, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, next_status, next_due_date]);
      await auditLog({ action:'ast_maintenance_plan_update', actor:sess.identityId||'system', target:id, meta:{ status: next_status } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleMaintenanceExecutions = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess || !requireRole(sess, ['admin','ti','rh','financeiro'])) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const plan_id = url.searchParams.get('plan_id');
      let q = `SELECT * FROM ast_maintenance_executions`;
      const params = [];
      if (plan_id) { params.push(plan_id); q+=` WHERE plan_id=$${params.length}`; }
      q+=` ORDER BY executed_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows});
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const plan_id = body.plan_id;
      const asset_id = body.asset_id;
      const executed_at = body.executed_at;
      const executed_by_name = String(body.executed_by_name||'').trim();
      const result = String(body.result||'').trim();
      const next_due_date = body.next_due_date || null;
      const cost_cents = body.cost_cents !=null ? Number(body.cost_cents) : null;
      const evidence_file_url = body.evidence_file_url ? String(body.evidence_file_url).trim() : null;
      const evidence_storage_key = body.evidence_storage_key ? String(body.evidence_storage_key).trim() : null;
      if (!plan_id || !asset_id) return json(res,400,{error:'missing_plan_or_asset'});
      if (!executed_at) return json(res,400,{error:'missing_executed_at'});
      if (executed_by_name.length<2 || executed_by_name.length>200) return json(res,400,{error:'invalid_executed_by_name'});
      if (result.length<10 || result.length>2000) return json(res,400,{error:'invalid_result'});
      if (cost_cents!=null && (!Number.isFinite(cost_cents) || cost_cents<0)) return json(res,400,{error:'invalid_cost'});
      if (evidence_file_url && (evidence_file_url.length<5 || evidence_file_url.length>1000)) return json(res,400,{error:'invalid_file_url'});
      if (evidence_storage_key && (evidence_storage_key.length<5 || evidence_storage_key.length>500)) return json(res,400,{error:'invalid_storage_key'});
      try {
        const { rows } = await pool.query(`INSERT INTO ast_maintenance_executions (plan_id, asset_id, executed_at, executed_by_name, executed_by_identity, result, next_due_date, cost_cents, evidence_file_url, evidence_storage_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [plan_id, asset_id, executed_at, executed_by_name, sess.identityId||null, result, next_due_date, cost_cents, evidence_file_url, evidence_storage_key]);
        // atualizar plano next_due_date e last_executed_at
        if (next_due_date) {
          await pool.query(`UPDATE ast_maintenance_plans SET last_executed_at=$2, next_due_date=$3, status='agendada', updated_at=NOW() WHERE id=$1`, [plan_id, executed_at, next_due_date]);
        } else {
          await pool.query(`UPDATE ast_maintenance_plans SET last_executed_at=$2, status='concluida', updated_at=NOW() WHERE id=$1`, [plan_id, executed_at]);
        }
        await auditLog({ action:'ast_maintenance_execution_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ plan_id, asset_id } });
        return json(res,201,rows[0]);
      } catch(e){
        if (e.code==='23505' && e.constraint && e.constraint.includes('storage_key')) return json(res,409,{error:'duplicate_storage_key'});
        throw e;
      }
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // AST-11 dossiê técnico CFTV modelos localização autorizada garantia documentação senhas fora cadastro/log comum
  const handleCftvDossiers = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess || !requireRole(sess, ['admin','ti','rh','financeiro'])) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const { rows } = await pool.query(`SELECT * FROM ast_cftv_dossiers ORDER BY created_at DESC LIMIT 200`);
      return json(res,200,{items:rows, note:'senhas de equipamentos fora do cadastro/log comum apenas referencia segura'});
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const client_account_id = body.client_account_id || null;
      const contract_id = body.contract_id || null;
      const location = String(body.location||'').trim();
      const model = String(body.model||'').trim();
      const manufacturer = body.manufacturer ? String(body.manufacturer).trim() : null;
      const serial_number = body.serial_number ? String(body.serial_number).trim() : null;
      const ip_address = body.ip_address ? String(body.ip_address).trim() : null;
      const warranty_until = body.warranty_until || null;
      const installation_date = body.installation_date || null;
      const documentation_file_url = body.documentation_file_url ? String(body.documentation_file_url).trim() : null;
      const documentation_storage_key = body.documentation_storage_key ? String(body.documentation_storage_key).trim() : null;
      const notes = body.notes ? String(body.notes).trim() : null;
      const password_reference = body.password_reference ? String(body.password_reference).trim() : null;
      const password_storage_hint = body.password_storage_hint ? String(body.password_storage_hint).trim() : null;
      if (location.length<3 || location.length>200) return json(res,400,{error:'invalid_location'});
      if (model.length<3 || model.length>200) return json(res,400,{error:'invalid_model'});
      if (manufacturer && (manufacturer.length<2 || manufacturer.length>200)) return json(res,400,{error:'invalid_manufacturer'});
      if (serial_number && (serial_number.length<3 || serial_number.length>200)) return json(res,400,{error:'invalid_serial_number'});
      if (ip_address && (ip_address.length<7 || ip_address.length>45)) return json(res,400,{error:'invalid_ip'});
      if (documentation_file_url && (documentation_file_url.length<5 || documentation_file_url.length>1000)) return json(res,400,{error:'invalid_file_url'});
      if (documentation_storage_key && (documentation_storage_key.length<5 || documentation_storage_key.length>500)) return json(res,400,{error:'invalid_storage_key'});
      if (notes && (notes.length<10 || notes.length>2000)) return json(res,400,{error:'invalid_notes'});
      if (password_reference && (password_reference.length<5 || password_reference.length>200)) return json(res,400,{error:'invalid_password_reference'});
      if (password_storage_hint && (password_storage_hint.length<10 || password_storage_hint.length>500)) return json(res,400,{error:'invalid_password_hint'});
      try {
        const { rows } = await pool.query(`INSERT INTO ast_cftv_dossiers (client_account_id, contract_id, location, model, manufacturer, serial_number, ip_address, warranty_until, installation_date, documentation_file_url, documentation_storage_key, notes, password_reference, password_storage_hint, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`, [client_account_id, contract_id, location, model, manufacturer, serial_number, ip_address, warranty_until, installation_date, documentation_file_url, documentation_storage_key, notes, password_reference, password_storage_hint, sess.identityId||null]);
        await auditLog({ action:'ast_cftv_dossier_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ location, model } });
        return json(res,201,rows[0]);
      } catch(e){
        if (e.code==='23505') return json(res,409,{error:'duplicate_storage_key'});
        throw e;
      }
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id;
      if (!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ast_cftv_dossiers WHERE id=$1`, [id]);
      if (!existing.length) return json(res,404,{error:'not_found'});
      const location = body.location ? String(body.location).trim() : existing[0].location;
      const model = body.model ? String(body.model).trim() : existing[0].model;
      const warranty_until = body.warranty_until !== undefined ? body.warranty_until : existing[0].warranty_until;
      const notes = body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : existing[0].notes;
      if (location.length<3 || location.length>200) return json(res,400,{error:'invalid_location'});
      if (model.length<3 || model.length>200) return json(res,400,{error:'invalid_model'});
      const { rows } = await pool.query(`UPDATE ast_cftv_dossiers SET location=$2, model=$3, warranty_until=$4, notes=$5, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, location, model, warranty_until, notes]);
      await auditLog({ action:'ast_cftv_dossier_update', actor:sess.identityId||'system', target:id, meta:{ location, model } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // AST-12 materiais limpeza consumo por local reposição comparação previsto
  const handleCleaningMaterials = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess || !requireRole(sess, ['admin','ti','rh','financeiro'])) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const { rows } = await pool.query(`SELECT cm.*, p.sku, p.name as product_name FROM ast_cleaning_materials cm JOIN ast_products p ON p.id=cm.product_id ORDER BY cm.period_start DESC LIMIT 200`);
      return json(res,200,{items:rows, note:'consumo por local reposição comparação previsto variance GENERATED'});
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const product_id = body.product_id;
      const location = String(body.location||'').trim();
      const expected_consumption = Number(body.expected_consumption);
      const actual_consumption = Number(body.actual_consumption);
      const period_start = body.period_start;
      const period_end = body.period_end;
      const needs_replacement = !!body.needs_replacement;
      if (!product_id) return json(res,400,{error:'missing_product_id'});
      if (location.length<3 || location.length>200) return json(res,400,{error:'invalid_location'});
      if (!Number.isFinite(expected_consumption) || expected_consumption<0) return json(res,400,{error:'invalid_expected'});
      if (!Number.isFinite(actual_consumption) || actual_consumption<0) return json(res,400,{error:'invalid_actual'});
      if (!period_start || !period_end) return json(res,400,{error:'missing_period'});
      if (new Date(period_end) < new Date(period_start)) return json(res,400,{error:'invalid_period_end_before_start'});
      try {
        const { rows } = await pool.query(`INSERT INTO ast_cleaning_materials (product_id, location, expected_consumption, actual_consumption, period_start, period_end, needs_replacement, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [product_id, location, expected_consumption, actual_consumption, period_start, period_end, needs_replacement, sess.identityId||null]);
        await auditLog({ action:'ast_cleaning_material_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ product_id, location, variance: rows[0].variance } });
        return json(res,201,rows[0]);
      } catch(e){
        if (e.code==='23505') return json(res,409,{error:'duplicate_period'});
        throw e;
      }
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  return { handleInventories, handleInventoryItems, handleServiceOrders, handleServiceOrderEvidences, handleMaintenancePlans, handleMaintenanceExecutions, handleCftvDossiers, handleCleaningMaterials };
}
