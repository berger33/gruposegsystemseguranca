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
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${y}${m}${day}-${rand}`;
  };

  const validateUuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  async function recordAuditTx(client, { action, actor, target, meta }) {
    await client.query(
      `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
      [action, actor || 'system', target || null, meta ? JSON.stringify(meta) : null]
    );
  }

  async function validateContractScope(clientOrPool, contractId, clientAccountId) {
    if (!contractId) return { ok: true };
    const { rows } = await clientOrPool.query(
      `SELECT id, company_id, status FROM crm_contracts WHERE id = $1`,
      [contractId]
    );
    if (!rows.length) return { ok: false, error: 'contract_not_found', status: 404 };
    const c = rows[0];
    const operationalStatuses = ['ativo', 'implantacao', 'em_aprovacao', 'vigente'];
    if (!operationalStatuses.includes(c.status)) {
      return { ok: false, error: 'contract_not_operational', status: 409 };
    }
    return { ok: true, contract: c };
  }

  async function validatePrivateDocumentScope(clientOrPool, clientDocumentId, contractId) {
    if (!clientDocumentId) return { ok: true };
    if (!validateUuid(clientDocumentId)) return { error: 'invalid_document_id', status: 400 };
    const doc = await clientOrPool.query(
      `SELECT id, contract_id, client_account_id FROM client_documents WHERE id = $1`,
      [clientDocumentId]
    );
    if (!doc.rows[0]) return { error: 'document_not_found', status: 404 };
    if (contractId) {
      const portal = await clientOrPool.query(
        `SELECT client_contract_id FROM crm_contract_portal_links WHERE contract_id = $1`,
        [contractId]
      );
      const portalContractId = portal.rows[0]?.client_contract_id;
      if (doc.rows[0].contract_id && portalContractId && doc.rows[0].contract_id !== portalContractId) {
        return { error: 'document_scope_violation', status: 403 };
      }
    }
    return { ok: true, doc: doc.rows[0] };
  }

  // AST-07: Inventário Físico, Divergências e Ajuste Aprovado
  const handleInventories = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const { rows } = await pool.query(`SELECT * FROM ast_inventories ORDER BY created_at DESC LIMIT 200`);
      return json(res, 200, { items: rows });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const title = String(body.title || '').trim();
      const description = String(body.description || '').trim();
      const location = String(body.location || '').trim();
      const contract_id = body.contract_id || null;
      const post_id = body.post_id || null;

      if (title.length < 5 || title.length > 200) return json(res, 400, { error: 'invalid_title' });
      if (description.length < 10 || description.length > 2000) return json(res, 400, { error: 'invalid_description' });
      if (location.length < 3 || location.length > 200) return json(res, 400, { error: 'invalid_location' });

      if (contract_id) {
        const cScope = await validateContractScope(pool, contract_id);
        if (!cScope.ok) return json(res, cScope.status, { error: cScope.error });
      }

      const protocol = generateProtocol('INV-AST');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO ast_inventories (protocol, title, description, location, contract_id, post_id, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [protocol, title, description, location, contract_id, post_id, sess.identityId || null]
        );

        await client.query(
          `INSERT INTO ast_inventory_history (inventory_id, previous_status, next_status, changed_by_identity, reason)
           VALUES ($1, NULL, $2, $3, $4)`,
          [rows[0].id, 'rascunho', sess.identityId || null, 'Criação de inventário físico com contagem e divergências']
        );

        await recordAuditTx(client, {
          action: 'ast_inventory_create',
          actor: sess.identityId || 'system',
          target: rows[0].id,
          meta: { protocol, location, title }
        });

        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleInventories POST error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id;
      const next_status = body.status ? String(body.status).trim() : null;
      const reason = body.reason ? String(body.reason).trim() : 'Atualização de inventário';

      if (!id || !next_status) return json(res, 400, { error: 'missing_id_or_status' });
      if (reason.length < 10 || reason.length > 1000) return json(res, 400, { error: 'invalid_reason' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: existing } = await client.query(`SELECT * FROM ast_inventories WHERE id=$1 FOR UPDATE`, [id]);
        if (!existing.length) {
          await client.query('ROLLBACK');
          return json(res, 404, { error: 'not_found' });
        }
        const prev = existing[0].status;
        if (prev === 'aprovado' && next_status === 'aprovado') {
          await client.query('ROLLBACK');
          return json(res, 400, { error: 'inventory_already_approved' });
        }

        const valid = ['rascunho', 'em_contagem', 'divergente', 'ajustado', 'aprovado', 'cancelado'];
        if (!valid.includes(next_status)) {
          await client.query('ROLLBACK');
          return json(res, 400, { error: 'invalid_status' });
        }

        let approved_by = existing[0].approved_by_identity;
        let approved_at = existing[0].approved_at;
        if (next_status === 'aprovado') {
          approved_by = sess.identityId || null;
          approved_at = new Date();
        }

        const { rows } = await client.query(
          `UPDATE ast_inventories SET status=$2, approved_by_identity=$3, approved_at=$4, updated_at=NOW() WHERE id=$1 RETURNING *`,
          [id, next_status, approved_by, approved_at]
        );

        await client.query(
          `INSERT INTO ast_inventory_history (inventory_id, previous_status, next_status, changed_by_identity, reason)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, prev, next_status, sess.identityId || null, reason]
        );

        // Se aprovado, aplicar ajustes transacionais de estoque
        if (next_status === 'aprovado') {
          const { rows: items } = await client.query(
            `SELECT ii.*, p.stock_current FROM ast_inventory_items ii JOIN ast_products p ON p.id=ii.product_id WHERE ii.inventory_id=$1 AND ii.is_approved=true FOR UPDATE OF p`,
            [id]
          );
          for (const it of items) {
            const targetQty = it.adjustment_quantity != null ? it.adjustment_quantity : it.counted_quantity;
            const diff = targetQty - it.expected_quantity;
            if (diff !== 0) {
              const movType = diff > 0 ? 'entrada' : 'saida';
              const reqQty = Math.abs(diff);

              if (movType === 'saida' && it.stock_current < reqQty) {
                await client.query('ROLLBACK');
                return json(res, 400, { error: 'insufficient_stock_for_adjustment', product_id: it.product_id, available: it.stock_current, required: reqQty });
              }

              await client.query(
                `INSERT INTO ast_stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, contract_id, created_by_identity)
                 VALUES ($1,$2,$3,$4,'inventario',$5,$6,$7)`,
                [it.product_id, movType, reqQty, `Ajuste de inventário ${existing[0].protocol} aprovado: esperado ${it.expected_quantity} -> apurado ${targetQty}`, existing[0].protocol, existing[0].contract_id, sess.identityId || null]
              );
            }
          }
        }

        await recordAuditTx(client, {
          action: 'ast_inventory_status_update',
          actor: sess.identityId || 'system',
          target: id,
          meta: { from: prev, to: next_status }
        });

        await client.query('COMMIT');
        return json(res, 200, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleInventories PATCH error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  const handleInventoryItems = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const inventory_id = url.searchParams.get('inventory_id');
      if (!inventory_id) return json(res, 400, { error: 'missing_inventory_id' });
      const { rows } = await pool.query(
        `SELECT ii.*, p.sku, p.name as product_name FROM ast_inventory_items ii JOIN ast_products p ON p.id=ii.product_id WHERE ii.inventory_id=$1 ORDER BY p.name ASC`,
        [inventory_id]
      );
      return json(res, 200, { items: rows });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const inventory_id = body.inventory_id;
      const product_id = body.product_id;
      const expected_quantity = Number(body.expected_quantity);
      const counted_quantity = Number(body.counted_quantity);
      const adjustment_quantity = body.adjustment_quantity != null ? Number(body.adjustment_quantity) : null;
      const adjustment_reason = body.adjustment_reason ? String(body.adjustment_reason).trim() : null;
      const is_approved = !!body.is_approved;

      if (!inventory_id || !product_id) return json(res, 400, { error: 'missing_inventory_or_product' });
      if (!Number.isFinite(expected_quantity) || expected_quantity < 0) return json(res, 400, { error: 'invalid_expected_quantity' });
      if (!Number.isFinite(counted_quantity) || counted_quantity < 0) return json(res, 400, { error: 'invalid_counted_quantity' });
      if (adjustment_quantity != null && (!Number.isFinite(adjustment_quantity) || adjustment_quantity < 0)) return json(res, 400, { error: 'invalid_adjustment_quantity' });
      if (adjustment_reason && (adjustment_reason.length < 10 || adjustment_reason.length > 1000)) return json(res, 400, { error: 'invalid_adjustment_reason' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO ast_inventory_items (inventory_id, product_id, expected_quantity, counted_quantity, adjustment_quantity, adjustment_reason, is_approved)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [inventory_id, product_id, expected_quantity, counted_quantity, adjustment_quantity, adjustment_reason, is_approved]
        );
        await recordAuditTx(client, { action: 'ast_inventory_item_create', actor: sess.identityId || 'system', target: rows[0].id, meta: { inventory_id, product_id } });
        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') return json(res, 409, { error: 'duplicate_product_in_inventory' });
        console.error('handleInventoryItems POST error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id;
      if (!id) return json(res, 400, { error: 'missing_id' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: existing } = await client.query(`SELECT * FROM ast_inventory_items WHERE id=$1 FOR UPDATE`, [id]);
        if (!existing.length) {
          await client.query('ROLLBACK');
          return json(res, 404, { error: 'not_found' });
        }
        const counted_quantity = body.counted_quantity != null ? Number(body.counted_quantity) : existing[0].counted_quantity;
        const adjustment_quantity = body.adjustment_quantity !== undefined ? (body.adjustment_quantity != null ? Number(body.adjustment_quantity) : null) : existing[0].adjustment_quantity;
        const adjustment_reason = body.adjustment_reason !== undefined ? (body.adjustment_reason ? String(body.adjustment_reason).trim() : null) : existing[0].adjustment_reason;
        const is_approved = body.is_approved !== undefined ? !!body.is_approved : existing[0].is_approved;

        if (!Number.isFinite(counted_quantity) || counted_quantity < 0) {
          await client.query('ROLLBACK');
          return json(res, 400, { error: 'invalid_counted_quantity' });
        }
        if (adjustment_quantity != null && (!Number.isFinite(adjustment_quantity) || adjustment_quantity < 0)) {
          await client.query('ROLLBACK');
          return json(res, 400, { error: 'invalid_adjustment_quantity' });
        }

        const { rows } = await client.query(
          `UPDATE ast_inventory_items SET counted_quantity=$2, adjustment_quantity=$3, adjustment_reason=$4, is_approved=$5 WHERE id=$1 RETURNING *`,
          [id, counted_quantity, adjustment_quantity, adjustment_reason, is_approved]
        );
        await recordAuditTx(client, { action: 'ast_inventory_item_update', actor: sess.identityId || 'system', target: id, meta: { counted_quantity, adjustment_quantity, is_approved } });
        await client.query('COMMIT');
        return json(res, 200, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleInventoryItems PATCH error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  // AST-08: Ordens de Serviço (OS) com consumo atômico de materiais
  const handleServiceOrders = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const { rows } = await pool.query(
        `SELECT so.*, ca.display_name as client_name
         FROM ast_service_orders so
         LEFT JOIN client_accounts ca ON ca.id=so.client_account_id
         ORDER BY so.created_at DESC LIMIT 200`
      );
      return json(res, 200, { items: rows });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const title = String(body.title || '').trim();
      const description = String(body.description || '').trim();
      const requester_name = String(body.requester_name || '').trim();
      const client_account_id = body.client_account_id || null;
      const contract_id = body.contract_id || null;
      const post_id = body.post_id || null;
      const unit_id = body.unit_id || null;
      const technician_name = body.technician_name ? String(body.technician_name).trim() : null;
      const technician_identity = body.technician_identity || null;
      const priority = String(body.priority || 'media').trim();
      const scheduled_at = body.scheduled_at || null;
      const diagnosis = body.diagnosis ? String(body.diagnosis).trim() : null;
      const checklist = Array.isArray(body.checklist) ? body.checklist : [];
      const parts = Array.isArray(body.parts) ? body.parts : [];

      if (title.length < 5 || title.length > 200) return json(res, 400, { error: 'invalid_title' });
      if (description.length < 10 || description.length > 2000) return json(res, 400, { error: 'invalid_description' });
      if (requester_name.length < 2 || requester_name.length > 200) return json(res, 400, { error: 'invalid_requester_name' });
      const validPrio = ['baixa', 'media', 'alta', 'critica'];
      if (!validPrio.includes(priority)) return json(res, 400, { error: 'invalid_priority' });

      if (contract_id) {
        const cScope = await validateContractScope(pool, contract_id, client_account_id);
        if (!cScope.ok) return json(res, cScope.status, { error: cScope.error });
      }

      const protocol = generateProtocol('OS-AST');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO ast_service_orders (protocol, title, description, requester_name, requester_identity, client_account_id, contract_id, post_id, unit_id, technician_name, technician_identity, priority, scheduled_at, diagnosis, checklist, parts, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
          [protocol, title, description, requester_name, sess.identityId || null, client_account_id, contract_id, post_id, unit_id, technician_name, technician_identity, priority, scheduled_at, diagnosis, JSON.stringify(checklist), JSON.stringify(parts), sess.identityId || null]
        );

        await client.query(
          `INSERT INTO ast_service_order_history (service_order_id, previous_status, next_status, changed_by_identity, reason)
           VALUES ($1, NULL, $2, $3, $4)`,
          [rows[0].id, 'rascunho', sess.identityId || null, 'Abertura de ordem de serviço']
        );

        await recordAuditTx(client, {
          action: 'ast_service_order_create',
          actor: sess.identityId || 'system',
          target: rows[0].id,
          meta: { protocol, title, priority, contract_id }
        });

        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleServiceOrders POST error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id;
      const next_status = body.status ? String(body.status).trim() : null;
      const reason = body.reason ? String(body.reason).trim() : 'Atualização de ordem de serviço';

      if (!id || !next_status) return json(res, 400, { error: 'missing_id_or_status' });
      if (reason.length < 10 || reason.length > 1000) return json(res, 400, { error: 'invalid_reason' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: existing } = await client.query(`SELECT * FROM ast_service_orders WHERE id=$1 FOR UPDATE`, [id]);
        if (!existing.length) {
          await client.query('ROLLBACK');
          return json(res, 404, { error: 'not_found' });
        }
        const current = existing[0];
        const prev = current.status;

        if (prev === 'concluida' && next_status === 'concluida') {
          await client.query('ROLLBACK');
          return json(res, 400, { error: 'os_already_concluded' });
        }

        const valid = ['rascunho', 'aberta', 'em_execucao', 'aguardando_peca', 'aguardando_aprovacao', 'concluida', 'cancelada'];
        if (!valid.includes(next_status)) {
          await client.query('ROLLBACK');
          return json(res, 400, { error: 'invalid_status' });
        }

        const execution_notes = body.execution_notes ? String(body.execution_notes).trim() : current.execution_notes;
        const diagnosis = body.diagnosis !== undefined ? (body.diagnosis ? String(body.diagnosis).trim() : null) : current.diagnosis;
        const technician_name = body.technician_name ? String(body.technician_name).trim() : current.technician_name;
        const parts = Array.isArray(body.parts) ? body.parts : (Array.isArray(current.parts) ? current.parts : []);

        // Validação obrigatória para conclusão de OS
        if (next_status === 'concluida') {
          if (!technician_name && !current.technician_identity) {
            await client.query('ROLLBACK');
            return json(res, 400, { error: 'technician_required_for_completion' });
          }
          if (!execution_notes || execution_notes.length < 10) {
            await client.query('ROLLBACK');
            return json(res, 400, { error: 'execution_notes_required_for_completion' });
          }

          // Baixa de materiais/peças consumidos exatamente uma vez
          if (parts && parts.length > 0) {
            for (const part of parts) {
              const partQty = Number(part.quantity);
              if (part.product_id && partQty > 0) {
                const { rows: prodRows } = await client.query(`SELECT id, stock_current FROM ast_products WHERE id=$1 FOR UPDATE`, [part.product_id]);
                if (!prodRows.length) {
                  await client.query('ROLLBACK');
                  return json(res, 404, { error: 'part_product_not_found', product_id: part.product_id });
                }
                if (prodRows[0].stock_current < partQty) {
                  await client.query('ROLLBACK');
                  return json(res, 400, { error: 'insufficient_stock_for_parts', product_id: part.product_id, available: prodRows[0].stock_current, required: partQty });
                }

                await client.query(
                  `INSERT INTO ast_stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, contract_id, created_by_identity)
                   VALUES ($1, 'saida', $2, $3, 'ordem_servico', $4, $5, $6)`,
                  [part.product_id, partQty, `Consumo de peça em OS ${current.protocol}`, current.protocol, current.contract_id, sess.identityId || null]
                );
              }
            }
          }
        }

        const { rows } = await client.query(
          `UPDATE ast_service_orders SET status=$2, execution_notes=$3, diagnosis=$4, technician_name=$5, parts=$6, updated_at=NOW() WHERE id=$1 RETURNING *`,
          [id, next_status, execution_notes, diagnosis, technician_name, JSON.stringify(parts)]
        );

        await client.query(
          `INSERT INTO ast_service_order_history (service_order_id, previous_status, next_status, changed_by_identity, reason)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, prev, next_status, sess.identityId || null, reason]
        );

        await recordAuditTx(client, {
          action: 'ast_service_order_status_update',
          actor: sess.identityId || 'system',
          target: id,
          meta: { from: prev, to: next_status }
        });

        await client.query('COMMIT');
        return json(res, 200, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleServiceOrders PATCH error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  // AST-09: Evidências Privadas de OS com Escopo L02
  const handleServiceOrderEvidences = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const service_order_id = url.searchParams.get('service_order_id');
      let q = `SELECT * FROM ast_service_order_evidences`;
      const params = [];
      if (service_order_id) {
        params.push(service_order_id);
        q += ` WHERE service_order_id=$${params.length}`;
      }
      q += ` ORDER BY created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res, 200, { items: rows });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const service_order_id = body.service_order_id;
      const client_document_id = body.client_document_id || null;
      const evidence_type = String(body.evidence_type || '').trim();
      const file_name = String(body.file_name || '').trim();
      const file_url = String(body.file_url || '').trim();
      const storage_key = String(body.storage_key || '').trim();
      const before_after = String(body.before_after || 'depois').trim();
      const is_client_visible = !!body.is_client_visible;
      const warranty_until = body.warranty_until || null;
      const cost_cents = body.cost_cents != null ? Number(body.cost_cents) : null;

      if (!service_order_id) return json(res, 400, { error: 'missing_service_order_id' });
      if (evidence_type.length < 3 || evidence_type.length > 100) return json(res, 400, { error: 'invalid_evidence_type' });
      if (file_name.length < 1 || file_name.length > 500) return json(res, 400, { error: 'invalid_file_name' });
      if (!['antes', 'depois', 'outro'].includes(before_after)) return json(res, 400, { error: 'invalid_before_after' });

      // Validação de escopo de documento privado do L02
      const { rows: soRows } = await pool.query(`SELECT id, contract_id FROM ast_service_orders WHERE id=$1`, [service_order_id]);
      if (!soRows.length) return json(res, 404, { error: 'service_order_not_found' });

      if (client_document_id) {
        const docScope = await validatePrivateDocumentScope(pool, client_document_id, soRows[0].contract_id);
        if (!docScope.ok) return json(res, docScope.status, { error: docScope.error });
      }

      const generatedKey = storage_key || `ast-os-evid-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const generatedUrl = file_url || `/private/docs/${generatedKey}`;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO ast_service_order_evidences (service_order_id, client_document_id, evidence_type, file_name, file_url, storage_key, before_after, is_client_visible, warranty_until, cost_cents, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [service_order_id, client_document_id, evidence_type, file_name, generatedUrl, generatedKey, before_after, is_client_visible, warranty_until, cost_cents, sess.identityId || null]
        );
        await recordAuditTx(client, { action: 'ast_os_evidence_create', actor: sess.identityId || 'system', target: rows[0].id, meta: { service_order_id, evidence_type, is_client_visible } });
        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') return json(res, 409, { error: 'duplicate_storage_key' });
        console.error('handleServiceOrderEvidences POST error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id;
      if (!id) return json(res, 400, { error: 'missing_id' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: existing } = await client.query(`SELECT * FROM ast_service_order_evidences WHERE id=$1 FOR UPDATE`, [id]);
        if (!existing.length) {
          await client.query('ROLLBACK');
          return json(res, 404, { error: 'not_found' });
        }
        const is_approved = body.is_approved !== undefined ? !!body.is_approved : existing[0].is_approved;
        const is_client_visible = body.is_client_visible !== undefined ? !!body.is_client_visible : existing[0].is_client_visible;

        if (is_client_visible && !is_approved) {
          await client.query('ROLLBACK');
          return json(res, 400, { error: 'client_visible_requires_approved' });
        }

        const { rows } = await client.query(
          `UPDATE ast_service_order_evidences SET is_approved=$2, is_client_visible=$3, approved_by_identity=$4, approved_at=$5 WHERE id=$1 RETURNING *`,
          [id, is_approved, is_client_visible, is_approved ? sess.identityId || null : null, is_approved ? new Date() : null]
        );
        await recordAuditTx(client, { action: 'ast_os_evidence_approve', actor: sess.identityId || 'system', target: id, meta: { is_approved, is_client_visible } });
        await client.query('COMMIT');
        return json(res, 200, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleServiceOrderEvidences PATCH error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  // AST-10: Planos de Manutenção Preventiva / Corretiva & Execuções
  const handleMaintenancePlans = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const asset_id = url.searchParams.get('asset_id');
      let q = `SELECT mp.*, a.serial_number FROM ast_maintenance_plans mp JOIN ast_serialized_assets a ON a.id=mp.asset_id`;
      const params = [];
      if (asset_id) {
        params.push(asset_id);
        q += ` WHERE mp.asset_id=$${params.length}`;
      }
      q += ` ORDER BY mp.next_due_date ASC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res, 200, { items: rows });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const asset_id = body.asset_id;
      const maintenance_type = String(body.maintenance_type || 'preventiva').trim();
      const title = String(body.title || '').trim();
      const description = String(body.description || '').trim();
      const periodicity_days = Number(body.periodicity_days);
      const next_due_date = body.next_due_date;
      const alert_days_before = body.alert_days_before != null ? Number(body.alert_days_before) : 7;
      const contract_id = body.contract_id || null;
      const post_id = body.post_id || null;

      if (!asset_id) return json(res, 400, { error: 'missing_asset_id' });
      if (title.length < 5 || title.length > 200) return json(res, 400, { error: 'invalid_title' });
      if (description.length < 10 || description.length > 2000) return json(res, 400, { error: 'invalid_description' });
      if (!Number.isFinite(periodicity_days) || periodicity_days <= 0) return json(res, 400, { error: 'invalid_periodicity_days' });
      if (!next_due_date) return json(res, 400, { error: 'missing_next_due_date' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO ast_maintenance_plans (asset_id, maintenance_type, title, description, periodicity_days, next_due_date, alert_days_before, contract_id, post_id, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [asset_id, maintenance_type, title, description, periodicity_days, next_due_date, alert_days_before, contract_id, post_id, sess.identityId || null]
        );
        await recordAuditTx(client, { action: 'ast_maintenance_plan_create', actor: sess.identityId || 'system', target: rows[0].id, meta: { asset_id, maintenance_type, next_due_date } });
        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleMaintenancePlans POST error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id;
      const status = body.status ? String(body.status).trim() : null;
      if (!id) return json(res, 400, { error: 'missing_id' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: existing } = await client.query(`SELECT * FROM ast_maintenance_plans WHERE id=$1 FOR UPDATE`, [id]);
        if (!existing.length) {
          await client.query('ROLLBACK');
          return json(res, 404, { error: 'not_found' });
        }
        const next_status = status || existing[0].status;
        const valid = ['agendada', 'em_execucao', 'concluida', 'atrasada', 'cancelada'];
        if (!valid.includes(next_status)) {
          await client.query('ROLLBACK');
          return json(res, 400, { error: 'invalid_status' });
        }
        const next_due_date = body.next_due_date || existing[0].next_due_date;
        const { rows } = await client.query(
          `UPDATE ast_maintenance_plans SET status=$2, next_due_date=$3, updated_at=NOW() WHERE id=$1 RETURNING *`,
          [id, next_status, next_due_date]
        );
        await recordAuditTx(client, { action: 'ast_maintenance_plan_update', actor: sess.identityId || 'system', target: id, meta: { status: next_status } });
        await client.query('COMMIT');
        return json(res, 200, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleMaintenancePlans PATCH error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  const handleMaintenanceExecutions = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const plan_id = url.searchParams.get('plan_id');
      let q = `SELECT * FROM ast_maintenance_executions`;
      const params = [];
      if (plan_id) {
        params.push(plan_id);
        q += ` WHERE plan_id=$${params.length}`;
      }
      q += ` ORDER BY executed_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res, 200, { items: rows });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const plan_id = body.plan_id;
      const asset_id = body.asset_id;
      const executed_at = body.executed_at;
      const executed_by_name = String(body.executed_by_name || '').trim();
      const result = String(body.result || '').trim();
      const next_due_date = body.next_due_date || null;
      const cost_cents = body.cost_cents != null ? Number(body.cost_cents) : null;
      const evidence_file_url = body.evidence_file_url ? String(body.evidence_file_url).trim() : null;
      const evidence_storage_key = body.evidence_storage_key ? String(body.evidence_storage_key).trim() : null;

      if (!plan_id || !asset_id) return json(res, 400, { error: 'missing_plan_or_asset' });
      if (!executed_at) return json(res, 400, { error: 'missing_executed_at' });
      if (executed_by_name.length < 2 || executed_by_name.length > 200) return json(res, 400, { error: 'invalid_executed_by_name' });
      if (result.length < 10 || result.length > 2000) return json(res, 400, { error: 'invalid_result' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO ast_maintenance_executions (plan_id, asset_id, executed_at, executed_by_name, executed_by_identity, result, next_due_date, cost_cents, evidence_file_url, evidence_storage_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [plan_id, asset_id, executed_at, executed_by_name, sess.identityId || null, result, next_due_date, cost_cents, evidence_file_url, evidence_storage_key]
        );

        if (next_due_date) {
          await client.query(`UPDATE ast_maintenance_plans SET last_executed_at=$2, next_due_date=$3, status='agendada', updated_at=NOW() WHERE id=$1`, [plan_id, executed_at, next_due_date]);
        } else {
          await client.query(`UPDATE ast_maintenance_plans SET last_executed_at=$2, status='concluida', updated_at=NOW() WHERE id=$1`, [plan_id, executed_at]);
        }

        await recordAuditTx(client, { action: 'ast_maintenance_execution_create', actor: sess.identityId || 'system', target: rows[0].id, meta: { plan_id, asset_id, executed_at } });
        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleMaintenanceExecutions POST error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  // AST-11: Dossiê Técnico CFTV com Proteção de Senha e Localização Autorizada
  const handleCftvDossiers = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const { rows } = await pool.query(`SELECT * FROM ast_cftv_dossiers ORDER BY created_at DESC LIMIT 200`);
      return json(res, 200, { items: rows, note: 'senhas de equipamentos fora do cadastro/log comum apenas referencia segura' });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const client_account_id = body.client_account_id || null;
      const contract_id = body.contract_id || null;
      const post_id = body.post_id || null;
      const unit_id = body.unit_id || null;
      const location = String(body.location || '').trim();
      const model = String(body.model || '').trim();
      const manufacturer = body.manufacturer ? String(body.manufacturer).trim() : null;
      const serial_number = body.serial_number ? String(body.serial_number).trim() : null;
      const ip_address = body.ip_address ? String(body.ip_address).trim() : null;
      const warranty_until = body.warranty_until || null;
      const installation_date = body.installation_date || null;
      const documentation_file_name = body.documentation_file_name ? String(body.documentation_file_name).trim() : null;
      const documentation_file_url = body.documentation_file_url ? String(body.documentation_file_url).trim() : null;
      const documentation_storage_key = body.documentation_storage_key ? String(body.documentation_storage_key).trim() : null;
      const notes = body.notes ? String(body.notes).trim() : null;
      const password_reference = body.password_reference ? String(body.password_reference).trim() : null;
      const password_storage_hint = body.password_storage_hint ? String(body.password_storage_hint).trim() : null;

      // Segurança: proibir senhas em texto puro
      if (body.plain_password || body.password) {
        return json(res, 400, { error: 'plaintext_password_prohibited', detail: 'Senhas de equipamentos CFTV não podem ser salvas em texto puro. Utilize password_reference ou cofre seguro.' });
      }

      if (location.length < 3 || location.length > 200) return json(res, 400, { error: 'invalid_location' });
      if (model.length < 3 || model.length > 200) return json(res, 400, { error: 'invalid_model' });

      if (contract_id) {
        const cScope = await validateContractScope(pool, contract_id, client_account_id);
        if (!cScope.ok) return json(res, cScope.status, { error: cScope.error });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO ast_cftv_dossiers (client_account_id, contract_id, post_id, unit_id, location, model, manufacturer, serial_number, ip_address, warranty_until, installation_date, documentation_file_name, documentation_file_url, documentation_storage_key, notes, password_reference, password_storage_hint, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
          [client_account_id, contract_id, post_id, unit_id, location, model, manufacturer, serial_number, ip_address, warranty_until, installation_date, documentation_file_name, documentation_file_url, documentation_storage_key, notes, password_reference, password_storage_hint, sess.identityId || null]
        );
        await recordAuditTx(client, { action: 'ast_cftv_dossier_create', actor: sess.identityId || 'system', target: rows[0].id, meta: { location, model } });
        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleCftvDossiers POST error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id;
      if (!id) return json(res, 400, { error: 'missing_id' });

      if (body.plain_password || body.password) {
        return json(res, 400, { error: 'plaintext_password_prohibited' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: existing } = await client.query(`SELECT * FROM ast_cftv_dossiers WHERE id=$1 FOR UPDATE`, [id]);
        if (!existing.length) {
          await client.query('ROLLBACK');
          return json(res, 404, { error: 'not_found' });
        }
        const location = body.location ? String(body.location).trim() : existing[0].location;
        const model = body.model ? String(body.model).trim() : existing[0].model;
        const warranty_until = body.warranty_until !== undefined ? body.warranty_until : existing[0].warranty_until;
        const notes = body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : existing[0].notes;

        const { rows } = await client.query(
          `UPDATE ast_cftv_dossiers SET location=$2, model=$3, warranty_until=$4, notes=$5, updated_at=NOW() WHERE id=$1 RETURNING *`,
          [id, location, model, warranty_until, notes]
        );
        await recordAuditTx(client, { action: 'ast_cftv_dossier_update', actor: sess.identityId || 'system', target: id, meta: { location, model } });
        await client.query('COMMIT');
        return json(res, 200, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleCftvDossiers PATCH error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  // AST-12: Materiais de Limpeza e Comparação com Previsto
  const handleCleaningMaterials = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const { rows } = await pool.query(
        `SELECT cm.*, p.sku, p.name as product_name FROM ast_cleaning_materials cm JOIN ast_products p ON p.id=cm.product_id ORDER BY cm.period_start DESC LIMIT 200`
      );
      return json(res, 200, { items: rows, note: 'consumo por local reposição comparação previsto variance GENERATED' });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const product_id = body.product_id;
      const location = String(body.location || '').trim();
      const expected_consumption = Number(body.expected_consumption);
      const actual_consumption = Number(body.actual_consumption);
      const period_start = body.period_start;
      const period_end = body.period_end;
      const needs_replacement = !!body.needs_replacement;
      const contract_id = body.contract_id || null;
      const post_id = body.post_id || null;

      if (!product_id) return json(res, 400, { error: 'missing_product_id' });
      if (location.length < 3 || location.length > 200) return json(res, 400, { error: 'invalid_location' });
      if (!Number.isFinite(expected_consumption) || expected_consumption < 0) return json(res, 400, { error: 'invalid_expected' });
      if (!Number.isFinite(actual_consumption) || actual_consumption < 0) return json(res, 400, { error: 'invalid_actual' });
      if (!period_start || !period_end) return json(res, 400, { error: 'missing_period' });
      if (new Date(period_end) < new Date(period_start)) return json(res, 400, { error: 'invalid_period_end_before_start' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO ast_cleaning_materials (product_id, location, expected_consumption, actual_consumption, period_start, period_end, needs_replacement, contract_id, post_id, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [product_id, location, expected_consumption, actual_consumption, period_start, period_end, needs_replacement, contract_id, post_id, sess.identityId || null]
        );
        await recordAuditTx(client, { action: 'ast_cleaning_material_create', actor: sess.identityId || 'system', target: rows[0].id, meta: { product_id, location, variance: rows[0].variance } });
        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') return json(res, 409, { error: 'duplicate_period' });
        console.error('handleCleaningMaterials POST error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  return {
    handleInventories,
    handleInventoryItems,
    handleServiceOrders,
    handleServiceOrderEvidences,
    handleMaintenancePlans,
    handleMaintenanceExecutions,
    handleCftvDossiers,
    handleCleaningMaterials
  };
}
