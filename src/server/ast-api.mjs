export function createAstApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
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

  // AST-01: Fornecedores
  const handleSuppliers = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const { rows } = await pool.query(`SELECT * FROM ast_suppliers ORDER BY name ASC LIMIT 200`);
      return json(res, 200, { items: rows });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const name = String(body.name || '').trim();
      const document = body.document ? String(body.document).trim() : null;
      const contact_name = body.contact_name ? String(body.contact_name).trim() : null;
      const contact_email = body.contact_email ? String(body.contact_email).trim() : null;
      const address = body.address ? String(body.address).trim() : null;
      const category = body.category ? String(body.category).trim() : null;

      if (name.length < 3 || name.length > 200) return json(res, 400, { error: 'invalid_name' });
      if (document && (document.length < 3 || document.length > 30)) return json(res, 400, { error: 'invalid_document' });
      if (contact_name && (contact_name.length < 2 || contact_name.length > 200)) return json(res, 400, { error: 'invalid_contact_name' });
      if (contact_email && (contact_email.length < 5 || contact_email.length > 320)) return json(res, 400, { error: 'invalid_contact_email' });
      if (address && (address.length < 10 || address.length > 500)) return json(res, 400, { error: 'invalid_address' });
      if (category && (category.length < 3 || category.length > 100)) return json(res, 400, { error: 'invalid_category' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO ast_suppliers (name, document, contact_name, contact_email, address, category, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [name, document, contact_name, contact_email, address, category, sess.identityId || null]
        );
        await recordAuditTx(client, { action: 'ast_supplier_create', actor: sess.identityId || 'system', target: rows[0].id, meta: { name } });
        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') return json(res, 409, { error: 'duplicate_name' });
        console.error('handleSuppliers POST error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  // AST-01: Produtos / SKU
  const handleProducts = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const category = url.searchParams.get('category');
      let q = `SELECT p.*, s.name as supplier_name FROM ast_products p LEFT JOIN ast_suppliers s ON s.id=p.supplier_id`;
      const params = [];
      if (category) {
        params.push(category);
        q += ` WHERE p.category=$${params.length}`;
      }
      q += ` ORDER BY p.name ASC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res, 200, { items: rows });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const sku = String(body.sku || '').trim();
      const name = String(body.name || '').trim();
      const description = String(body.description || '').trim();
      const category = String(body.category || '').trim();
      const unit_measure = String(body.unit_measure || '').trim();
      const cost_cents = body.cost_cents != null ? Number(body.cost_cents) : 0;
      const sale_price_cents = body.sale_price_cents != null ? Number(body.sale_price_cents) : 0;
      const stock_min = body.stock_min != null ? Number(body.stock_min) : 0;
      const location = body.location ? String(body.location).trim() : null;
      const supplier_id = body.supplier_id || null;

      if (sku.length < 3 || sku.length > 100) return json(res, 400, { error: 'invalid_sku' });
      if (name.length < 3 || name.length > 200) return json(res, 400, { error: 'invalid_name' });
      if (description.length < 10 || description.length > 2000) return json(res, 400, { error: 'invalid_description' });
      if (category.length < 3 || category.length > 100) return json(res, 400, { error: 'invalid_category' });
      if (unit_measure.length < 2 || unit_measure.length > 50) return json(res, 400, { error: 'invalid_unit' });
      if (!Number.isFinite(cost_cents) || cost_cents < 0) return json(res, 400, { error: 'invalid_cost' });
      if (!Number.isFinite(sale_price_cents) || sale_price_cents < 0) return json(res, 400, { error: 'invalid_sale_price' });
      if (!Number.isFinite(stock_min) || stock_min < 0) return json(res, 400, { error: 'invalid_stock_min' });
      if (location && (location.length < 3 || location.length > 200)) return json(res, 400, { error: 'invalid_location' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO ast_products (sku, name, description, category, unit_measure, cost_cents, sale_price_cents, stock_min, location, supplier_id, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [sku, name, description, category, unit_measure, cost_cents, sale_price_cents, stock_min, location, supplier_id, sess.identityId || null]
        );
        await recordAuditTx(client, { action: 'ast_product_create', actor: sess.identityId || 'system', target: rows[0].id, meta: { sku, name } });
        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') return json(res, 409, { error: 'duplicate_sku' });
        console.error('handleProducts POST error:', e);
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
        const { rows: existing } = await client.query(`SELECT * FROM ast_products WHERE id=$1 FOR UPDATE`, [id]);
        if (!existing.length) {
          await client.query('ROLLBACK');
          return json(res, 404, { error: 'not_found' });
        }
        const name = body.name ? String(body.name).trim() : existing[0].name;
        const description = body.description ? String(body.description).trim() : existing[0].description;
        const category = body.category ? String(body.category).trim() : existing[0].category;
        const unit_measure = body.unit_measure ? String(body.unit_measure).trim() : existing[0].unit_measure;
        const cost_cents = body.cost_cents != null ? Number(body.cost_cents) : existing[0].cost_cents;
        const sale_price_cents = body.sale_price_cents != null ? Number(body.sale_price_cents) : existing[0].sale_price_cents;
        const stock_min = body.stock_min != null ? Number(body.stock_min) : existing[0].stock_min;
        const location = body.location != null ? String(body.location).trim() : existing[0].location;
        const supplier_id = body.supplier_id !== undefined ? body.supplier_id : existing[0].supplier_id;

        if (name.length < 3 || name.length > 200) {
          await client.query('ROLLBACK');
          return json(res, 400, { error: 'invalid_name' });
        }
        if (description.length < 10 || description.length > 2000) {
          await client.query('ROLLBACK');
          return json(res, 400, { error: 'invalid_description' });
        }

        const { rows } = await client.query(
          `UPDATE ast_products SET name=$2, description=$3, category=$4, unit_measure=$5, cost_cents=$6, sale_price_cents=$7, stock_min=$8, location=$9, supplier_id=$10, updated_at=NOW() WHERE id=$1 RETURNING *`,
          [id, name, description, category, unit_measure, cost_cents, sale_price_cents, stock_min, location, supplier_id]
        );
        await recordAuditTx(client, { action: 'ast_product_update', actor: sess.identityId || 'system', target: id, meta: { name } });
        await client.query('COMMIT');
        return json(res, 200, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleProducts PATCH error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  // AST-02: Movimentos de Estoque (Entradas, Saídas, Ajustes, Transferências)
  const handleStockMovements = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const product_id = url.searchParams.get('product_id');
      let q = `SELECT m.*, p.sku, p.name as product_name FROM ast_stock_movements m JOIN ast_products p ON p.id=m.product_id`;
      const params = [];
      if (product_id) {
        params.push(product_id);
        q += ` WHERE m.product_id=$${params.length}`;
      }
      q += ` ORDER BY m.created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res, 200, { items: rows, note: 'saldo derivado de movimentos consistentes stock_current atualizado via trigger' });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const product_id = body.product_id;
      const movement_type = String(body.movement_type || '').trim();
      const quantity = Number(body.quantity);
      const reason = String(body.reason || '').trim();
      const reference_type = body.reference_type ? String(body.reference_type).trim() : null;
      const reference_id = body.reference_id ? String(body.reference_id).trim() : null;
      const from_location = body.from_location ? String(body.from_location).trim() : null;
      const to_location = body.to_location ? String(body.to_location).trim() : null;
      const contract_id = body.contract_id || null;
      const client_account_id = body.client_account_id || null;

      if (!product_id) return json(res, 400, { error: 'missing_product_id' });
      const validTypes = ['entrada', 'saida', 'transferencia', 'ajuste', 'reserva', 'liberacao', 'conversao', 'cancelamento'];
      if (!validTypes.includes(movement_type)) return json(res, 400, { error: 'invalid_movement_type' });
      if (!Number.isFinite(quantity) || quantity === 0) return json(res, 400, { error: 'invalid_quantity' });
      if (reason.length < 10 || reason.length > 1000) return json(res, 400, { error: 'invalid_reason' });
      if (reference_type && (reference_type.length < 3 || reference_type.length > 100)) return json(res, 400, { error: 'invalid_reference_type' });
      if (reference_id && (reference_id.length < 3 || reference_id.length > 200)) return json(res, 400, { error: 'invalid_reference_id' });

      // Validação de escopo de contrato se informado
      if (contract_id) {
        const cScope = await validateContractScope(pool, contract_id, client_account_id);
        if (!cScope.ok) return json(res, cScope.status, { error: cScope.error });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Bloqueio pessimista para garantir consistência sob concorrência
        const { rows: prodRows } = await client.query(`SELECT id, stock_current FROM ast_products WHERE id=$1 FOR UPDATE`, [product_id]);
        if (!prodRows.length) {
          await client.query('ROLLBACK');
          return json(res, 404, { error: 'product_not_found' });
        }
        const currentStock = prodRows[0].stock_current;

        // Se for saída ou ajuste negativo, garantir que não fica negativo
        if (movement_type === 'saida' || (movement_type === 'ajuste' && quantity < 0)) {
          const reqQty = Math.abs(quantity);
          if (currentStock < reqQty) {
            await client.query('ROLLBACK');
            return json(res, 400, { error: 'insufficient_stock', current: currentStock, requested: reqQty });
          }
        }

        const { rows } = await client.query(
          `INSERT INTO ast_stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, from_location, to_location, contract_id, client_account_id, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [product_id, movement_type, quantity, reason, reference_type, reference_id, from_location, to_location, contract_id, client_account_id, sess.identityId || null]
        );

        await recordAuditTx(client, {
          action: 'ast_stock_movement_create',
          actor: sess.identityId || 'system',
          target: rows[0].id,
          meta: { product_id, movement_type, quantity, contract_id }
        });

        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleStockMovements POST error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  // AST-03: Reservas para Proposta / Implantação
  const handleReservations = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const status = url.searchParams.get('status');
      let q = `SELECT r.*, p.sku, p.name as product_name, p.stock_current FROM ast_reservations r JOIN ast_products p ON p.id=r.product_id`;
      const params = [];
      if (status) {
        params.push(status);
        q += ` WHERE r.status=$${params.length}`;
      }
      q += ` ORDER BY r.created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res, 200, { items: rows, note: 'reserva para proposta/implantacao sem confundir reserva com saida liberacao em cancelamento' });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const product_id = body.product_id;
      const quantity = Number(body.quantity);
      const reservation_type = String(body.reservation_type || 'outro').trim();
      const reference_type = String(body.reference_type || '').trim();
      const reference_id = String(body.reference_id || '').trim();
      const expires_at = body.expires_at || null;
      const contract_id = body.contract_id || null;
      const client_account_id = body.client_account_id || null;

      if (!product_id) return json(res, 400, { error: 'missing_product_id' });
      if (!Number.isFinite(quantity) || quantity <= 0) return json(res, 400, { error: 'invalid_quantity' });
      if (reference_type.length < 3 || reference_type.length > 100) return json(res, 400, { error: 'invalid_reference_type' });
      if (reference_id.length < 3 || reference_id.length > 200) return json(res, 400, { error: 'invalid_reference_id' });
      const validResTypes = ['proposta', 'implantacao', 'os', 'manutencao', 'outro'];
      if (!validResTypes.includes(reservation_type)) return json(res, 400, { error: 'invalid_reservation_type' });

      if (contract_id) {
        const cScope = await validateContractScope(pool, contract_id, client_account_id);
        if (!cScope.ok) return json(res, cScope.status, { error: cScope.error });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Trava do produto com FOR UPDATE
        const { rows: prodRows } = await client.query(`SELECT id, stock_current FROM ast_products WHERE id=$1 FOR UPDATE`, [product_id]);
        if (!prodRows.length) {
          await client.query('ROLLBACK');
          return json(res, 404, { error: 'product_not_found' });
        }
        const stockCurrent = prodRows[0].stock_current;

        // Soma de reservas ativas
        const { rows: reservedRows } = await client.query(
          `SELECT COALESCE(SUM(quantity), 0) as total_reserved FROM ast_reservations WHERE product_id=$1 AND status='reservado'`,
          [product_id]
        );
        const totalReserved = Number(reservedRows[0].total_reserved);
        const available = stockCurrent - totalReserved;

        if (available < quantity) {
          await client.query('ROLLBACK');
          return json(res, 400, { error: 'insufficient_available_stock', available, current: stockCurrent, reserved: totalReserved });
        }

        const { rows } = await client.query(
          `INSERT INTO ast_reservations (product_id, quantity, reservation_type, reference_type, reference_id, expires_at, contract_id, client_account_id, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [product_id, quantity, reservation_type, reference_type, reference_id, expires_at, contract_id, client_account_id, sess.identityId || null]
        );

        await client.query(
          `INSERT INTO ast_stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, contract_id, client_account_id, created_by_identity)
           VALUES ($1, 'reserva', $2, $3, $4, $5, $6, $7, $8)`,
          [product_id, quantity, `Reserva ${reservation_type} para ${reference_type} ${reference_id} sem confundir com saída`, reference_type, reference_id, contract_id, client_account_id, sess.identityId || null]
        );

        await recordAuditTx(client, {
          action: 'ast_reservation_create',
          actor: sess.identityId || 'system',
          target: rows[0].id,
          meta: { product_id, quantity, reservation_type, reference_type, reference_id }
        });

        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') return json(res, 409, { error: 'duplicate_reservation' });
        console.error('handleReservations POST error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id;
      const action = String(body.action || '').trim(); // liberar, converter, cancelar
      if (!id || !action) return json(res, 400, { error: 'missing_id_or_action' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: existing } = await client.query(`SELECT * FROM ast_reservations WHERE id=$1 FOR UPDATE`, [id]);
        if (!existing.length) {
          await client.query('ROLLBACK');
          return json(res, 404, { error: 'not_found' });
        }
        const r = existing[0];
        if (r.status !== 'reservado') {
          await client.query('ROLLBACK');
          return json(res, 400, { error: 'reservation_not_active', current_status: r.status });
        }

        let nextStatus = null;
        let movementType = null;
        let reason = '';
        let updateFields = `status=$2, updated_at=NOW()`;

        if (action === 'liberar') {
          nextStatus = 'liberado';
          movementType = 'liberacao';
          reason = `Liberação de reserva ${r.id} para recomposição de disponibilidade`;
          updateFields += `, released_at=NOW()`;
        } else if (action === 'converter') {
          nextStatus = 'convertido';
          movementType = 'conversao';
          reason = `Conversão de reserva ${r.id} em baixa definitiva`;
          updateFields += `, converted_at=NOW()`;
        } else if (action === 'cancelar') {
          nextStatus = 'cancelado';
          movementType = 'cancelamento';
          reason = `Cancelamento de reserva ${r.id}`;
          updateFields += `, canceled_at=NOW()`;
        } else {
          await client.query('ROLLBACK');
          return json(res, 400, { error: 'invalid_action' });
        }

        const { rows } = await client.query(`UPDATE ast_reservations SET ${updateFields} WHERE id=$1 RETURNING *`, [id, nextStatus]);

        await client.query(
          `INSERT INTO ast_stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, contract_id, client_account_id, created_by_identity)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [r.product_id, movementType, r.quantity, reason, r.reference_type, r.reference_id, r.contract_id, r.client_account_id, sess.identityId || null]
        );

        if (nextStatus === 'convertido') {
          // Conversão gera saída real de estoque
          await client.query(
            `INSERT INTO ast_stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, contract_id, client_account_id, created_by_identity)
             VALUES ($1, 'saida', $2, $3, $4, $5, $6, $7, $8)`,
            [r.product_id, r.quantity, `Saída efetiva por conversão de reserva ${r.id}`, r.reference_type, r.reference_id, r.contract_id, r.client_account_id, sess.identityId || null]
          );
        }

        await recordAuditTx(client, {
          action: `ast_reservation_${action}`,
          actor: sess.identityId || 'system',
          target: id,
          meta: { previous_status: r.status, next_status: nextStatus, product_id: r.product_id, quantity: r.quantity }
        });

        await client.query('COMMIT');
        return json(res, 200, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleReservations PATCH error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  // AST-04: Ativos Serializados
  const handleSerializedAssets = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const status = url.searchParams.get('status');
      const client_account_id = url.searchParams.get('client_account_id');
      const contract_id = url.searchParams.get('contract_id');
      let q = `SELECT a.*, p.sku, p.name as product_name FROM ast_serialized_assets a JOIN ast_products p ON p.id=a.product_id WHERE 1=1`;
      const params = [];
      if (status) {
        params.push(status);
        q += ` AND a.status=$${params.length}`;
      }
      if (client_account_id) {
        params.push(client_account_id);
        q += ` AND a.client_account_id=$${params.length}`;
      }
      if (contract_id) {
        params.push(contract_id);
        q += ` AND a.contract_id=$${params.length}`;
      }
      q += ` ORDER BY a.created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res, 200, { items: rows });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const product_id = body.product_id;
      const serial_number = String(body.serial_number || '').trim();
      const client_account_id = body.client_account_id || null;
      const contract_id = body.contract_id || null;
      const unit_id = body.unit_id || null;
      const post_id = body.post_id || null;
      const employee_identity = body.employee_identity || null;
      const owner_type = String(body.owner_type || '').trim();
      const owner_name = String(body.owner_name || '').trim();
      const warranty_until = body.warranty_until || null;
      const status = body.status ? String(body.status).trim() : 'disponivel';
      const custody_term_file_name = body.custody_term_file_name ? String(body.custody_term_file_name).trim() : null;
      const custody_term_file_url = body.custody_term_file_url ? String(body.custody_term_file_url).trim() : null;
      const custody_term_storage_key = body.custody_term_storage_key ? String(body.custody_term_storage_key).trim() : null;
      const notes = body.notes ? String(body.notes).trim() : null;

      if (!product_id) return json(res, 400, { error: 'missing_product_id' });
      if (serial_number.length < 3 || serial_number.length > 200) return json(res, 400, { error: 'invalid_serial_number' });
      if (owner_type.length < 3 || owner_type.length > 100) return json(res, 400, { error: 'invalid_owner_type' });
      if (owner_name.length < 2 || owner_name.length > 200) return json(res, 400, { error: 'invalid_owner_name' });
      const validStatus = ['disponivel', 'em_uso', 'em_manutencao', 'perdido', 'avariado', 'devolvido', 'reservado', 'baixado'];
      if (!validStatus.includes(status)) return json(res, 400, { error: 'invalid_status' });

      if (contract_id) {
        const cScope = await validateContractScope(pool, contract_id, client_account_id);
        if (!cScope.ok) return json(res, cScope.status, { error: cScope.error });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO ast_serialized_assets (product_id, serial_number, client_account_id, contract_id, unit_id, post_id, employee_identity, owner_type, owner_name, warranty_until, status, custody_term_file_name, custody_term_file_url, custody_term_storage_key, notes, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
          [product_id, serial_number, client_account_id, contract_id, unit_id, post_id, employee_identity, owner_type, owner_name, warranty_until, status, custody_term_file_name, custody_term_file_url, custody_term_storage_key, notes, sess.identityId || null]
        );
        await recordAuditTx(client, { action: 'ast_asset_create', actor: sess.identityId || 'system', target: rows[0].id, meta: { serial_number, product_id, status } });
        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') {
          if (e.constraint && e.constraint.includes('serial_number')) return json(res, 409, { error: 'duplicate_serial_number' });
          if (e.constraint && e.constraint.includes('storage_key')) return json(res, 409, { error: 'duplicate_storage_key' });
          return json(res, 409, { error: 'duplicate_asset' });
        }
        console.error('handleSerializedAssets POST error:', e);
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
        const { rows: existing } = await client.query(`SELECT * FROM ast_serialized_assets WHERE id=$1 FOR UPDATE`, [id]);
        if (!existing.length) {
          await client.query('ROLLBACK');
          return json(res, 404, { error: 'not_found' });
        }
        const status = body.status ? String(body.status).trim() : existing[0].status;
        const client_account_id = body.client_account_id !== undefined ? body.client_account_id : existing[0].client_account_id;
        const contract_id = body.contract_id !== undefined ? body.contract_id : existing[0].contract_id;
        const unit_id = body.unit_id !== undefined ? body.unit_id : existing[0].unit_id;
        const post_id = body.post_id !== undefined ? body.post_id : existing[0].post_id;
        const employee_identity = body.employee_identity !== undefined ? body.employee_identity : existing[0].employee_identity;
        const owner_type = body.owner_type ? String(body.owner_type).trim() : existing[0].owner_type;
        const owner_name = body.owner_name ? String(body.owner_name).trim() : existing[0].owner_name;
        const warranty_until = body.warranty_until !== undefined ? body.warranty_until : existing[0].warranty_until;
        const notes = body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : existing[0].notes;

        const validStatus = ['disponivel', 'em_uso', 'em_manutencao', 'perdido', 'avariado', 'devolvido', 'reservado', 'baixado'];
        if (!validStatus.includes(status)) {
          await client.query('ROLLBACK');
          return json(res, 400, { error: 'invalid_status' });
        }

        const { rows } = await client.query(
          `UPDATE ast_serialized_assets SET status=$2, client_account_id=$3, contract_id=$4, unit_id=$5, post_id=$6, employee_identity=$7, owner_type=$8, owner_name=$9, warranty_until=$10, notes=$11, updated_at=NOW() WHERE id=$1 RETURNING *`,
          [id, status, client_account_id, contract_id, unit_id, post_id, employee_identity, owner_type, owner_name, warranty_until, notes]
        );
        await recordAuditTx(client, { action: 'ast_asset_update', actor: sess.identityId || 'system', target: id, meta: { previous_status: existing[0].status, next_status: status } });
        await client.query('COMMIT');
        return json(res, 200, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleSerializedAssets PATCH error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  // AST-05: Entregas, Devoluções e Custódia (Termo de Guarda)
  const handleDeliveries = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const asset_id = url.searchParams.get('asset_id');
      let q = `SELECT d.*, a.serial_number FROM ast_deliveries d JOIN ast_serialized_assets a ON a.id=d.asset_id`;
      const params = [];
      if (asset_id) {
        params.push(asset_id);
        q += ` WHERE d.asset_id=$${params.length}`;
      }
      q += ` ORDER BY d.created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res, 200, { items: rows });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const asset_id = body.asset_id;
      const delivery_type = String(body.delivery_type || '').trim();
      const delivered_to_name = String(body.delivered_to_name || '').trim();
      const delivered_to_identity = body.delivered_to_identity || null;
      const condition_before = body.condition_before ? String(body.condition_before).trim() : null;
      const condition_after = body.condition_after ? String(body.condition_after).trim() : null;
      const photos = Array.isArray(body.photos) ? body.photos : [];
      const conference_notes = body.conference_notes ? String(body.conference_notes).trim() : null;

      if (!asset_id) return json(res, 400, { error: 'missing_asset_id' });
      const validTypes = ['entrega', 'devolucao', 'avaria', 'perda', 'conferencia', 'transferencia'];
      if (!validTypes.includes(delivery_type)) return json(res, 400, { error: 'invalid_delivery_type' });
      if (delivered_to_name.length < 2 || delivered_to_name.length > 200) return json(res, 400, { error: 'invalid_delivered_to_name' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: assetRows } = await client.query(`SELECT * FROM ast_serialized_assets WHERE id=$1 FOR UPDATE`, [asset_id]);
        if (!assetRows.length) {
          await client.query('ROLLBACK');
          return json(res, 404, { error: 'asset_not_found' });
        }
        const asset = assetRows[0];

        // Impedir duas guardas ativas incompatíveis: não entregar ativo já em uso
        if (delivery_type === 'entrega' && asset.status === 'em_uso') {
          await client.query('ROLLBACK');
          return json(res, 409, { error: 'asset_already_in_use', detail: 'Ativo já se encontra em uso por outro custodiante' });
        }

        let newAssetStatus = asset.status;
        if (delivery_type === 'entrega') newAssetStatus = 'em_uso';
        else if (delivery_type === 'devolucao') newAssetStatus = 'disponivel';
        else if (delivery_type === 'avaria') newAssetStatus = 'avariado';
        else if (delivery_type === 'perda') newAssetStatus = 'perdido';

        await client.query(
          `UPDATE ast_serialized_assets SET status=$2, employee_identity=$3, updated_at=NOW() WHERE id=$1`,
          [asset_id, newAssetStatus, delivery_type === 'entrega' ? delivered_to_identity : null]
        );

        const { rows } = await client.query(
          `INSERT INTO ast_deliveries (asset_id, delivery_type, delivered_to_name, delivered_to_identity, delivered_by_identity, condition_before, condition_after, photos, conference_notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [asset_id, delivery_type, delivered_to_name, delivered_to_identity, sess.identityId || null, condition_before, condition_after, JSON.stringify(photos), conference_notes]
        );

        await recordAuditTx(client, {
          action: 'ast_delivery_create',
          actor: sess.identityId || 'system',
          target: rows[0].id,
          meta: { asset_id, delivery_type, delivered_to_name, new_status: newAssetStatus }
        });

        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleDeliveries POST error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  // AST-06: Requisições e Compras Internas Sintéticas
  const handleRequisitions = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const { rows } = await pool.query(
        `SELECT r.*, p.sku, p.name as product_name FROM ast_requisitions r LEFT JOIN ast_products p ON p.id=r.product_id ORDER BY r.created_at DESC LIMIT 200`
      );
      return json(res, 200, { items: rows });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const product_id = body.product_id || null;
      const quantity = Number(body.quantity);
      const requester_name = String(body.requester_name || '').trim();
      const urgency = String(body.urgency || 'media').trim();
      const reason = String(body.reason || '').trim();
      const contract_id = body.contract_id || null;
      const unit_id = body.unit_id || null;

      if (!Number.isFinite(quantity) || quantity <= 0) return json(res, 400, { error: 'invalid_quantity' });
      if (requester_name.length < 2 || requester_name.length > 200) return json(res, 400, { error: 'invalid_requester_name' });
      if (reason.length < 10 || reason.length > 1000) return json(res, 400, { error: 'invalid_reason' });
      const validUrg = ['baixa', 'media', 'alta', 'critica'];
      if (!validUrg.includes(urgency)) return json(res, 400, { error: 'invalid_urgency' });

      if (contract_id) {
        const cScope = await validateContractScope(pool, contract_id);
        if (!cScope.ok) return json(res, cScope.status, { error: cScope.error });
      }

      const protocol = generateProtocol('REQ-AST');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO ast_requisitions (protocol, product_id, quantity, requester_name, requester_identity, urgency, reason, contract_id, unit_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [protocol, product_id, quantity, requester_name, sess.identityId || null, urgency, reason, contract_id, unit_id]
        );

        await client.query(
          `INSERT INTO ast_requisition_history (requisition_id, previous_status, next_status, previous_quantity, next_quantity, changed_by_identity, reason)
           VALUES ($1, NULL, $2, NULL, $3, $4, $5)`,
          [rows[0].id, 'rascunho', quantity, sess.identityId || null, 'Criação de requisição interna de materiais']
        );

        await recordAuditTx(client, {
          action: 'ast_requisition_create',
          actor: sess.identityId || 'system',
          target: rows[0].id,
          meta: { protocol, quantity, urgency }
        });

        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleRequisitions POST error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id;
      const next_status = body.status ? String(body.status).trim() : null;
      const reason = body.reason ? String(body.reason).trim() : 'Atualização de status de requisição';

      if (!id || !next_status) return json(res, 400, { error: 'missing_id_or_status' });
      if (reason.length < 10 || reason.length > 1000) return json(res, 400, { error: 'invalid_reason' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: existing } = await client.query(`SELECT * FROM ast_requisitions WHERE id=$1 FOR UPDATE`, [id]);
        if (!existing.length) {
          await client.query('ROLLBACK');
          return json(res, 404, { error: 'not_found' });
        }
        const prev = existing[0].status;
        const valid = ['rascunho', 'em_cotacao', 'cotado', 'aprovado', 'rejeitado', 'pedido', 'recebido_parcial', 'recebido_total', 'cancelado'];
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
          `UPDATE ast_requisitions SET status=$2, approved_by_identity=$3, approved_at=$4, updated_at=NOW() WHERE id=$1 RETURNING *`,
          [id, next_status, approved_by, approved_at]
        );

        await client.query(
          `INSERT INTO ast_requisition_history (requisition_id, previous_status, next_status, previous_quantity, next_quantity, changed_by_identity, reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [id, prev, next_status, existing[0].quantity, existing[0].quantity, sess.identityId || null, reason]
        );

        await recordAuditTx(client, {
          action: 'ast_requisition_status_update',
          actor: sess.identityId || 'system',
          target: id,
          meta: { from: prev, to: next_status }
        });

        await client.query('COMMIT');
        return json(res, 200, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleRequisitions PATCH error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  // AST-06: Cotações Internas
  const handleQuotations = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const requisition_id = url.searchParams.get('requisition_id');
      let q = `SELECT q.*, s.name as supplier_name FROM ast_quotations q JOIN ast_suppliers s ON s.id=q.supplier_id`;
      const params = [];
      if (requisition_id) {
        params.push(requisition_id);
        q += ` WHERE q.requisition_id=$${params.length}`;
      }
      q += ` ORDER BY q.total_price_cents ASC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res, 200, { items: rows });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const requisition_id = body.requisition_id;
      const supplier_id = body.supplier_id;
      const unit_price_cents = Number(body.unit_price_cents);
      const total_price_cents = Number(body.total_price_cents);
      const delivery_days = body.delivery_days != null ? Number(body.delivery_days) : null;
      const notes = body.notes ? String(body.notes).trim() : null;

      if (!requisition_id || !supplier_id) return json(res, 400, { error: 'missing_requisition_or_supplier' });
      if (!Number.isFinite(unit_price_cents) || unit_price_cents < 0) return json(res, 400, { error: 'invalid_unit_price' });
      if (!Number.isFinite(total_price_cents) || total_price_cents < 0) return json(res, 400, { error: 'invalid_total_price' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO ast_quotations (requisition_id, supplier_id, unit_price_cents, total_price_cents, delivery_days, notes, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [requisition_id, supplier_id, unit_price_cents, total_price_cents, delivery_days, notes, sess.identityId || null]
        );
        await recordAuditTx(client, { action: 'ast_quotation_create', actor: sess.identityId || 'system', target: rows[0].id, meta: { requisition_id, supplier_id, total_price_cents } });
        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') return json(res, 409, { error: 'duplicate_quotation' });
        console.error('handleQuotations POST error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id;
      const is_selected = body.is_selected;
      if (!id) return json(res, 400, { error: 'missing_id' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: existing } = await client.query(`SELECT * FROM ast_quotations WHERE id=$1 FOR UPDATE`, [id]);
        if (!existing.length) {
          await client.query('ROLLBACK');
          return json(res, 404, { error: 'not_found' });
        }
        if (is_selected) {
          // Desmarcar outras cotações da mesma requisição
          await client.query(`UPDATE ast_quotations SET is_selected=false WHERE requisition_id=$1`, [existing[0].requisition_id]);
        }
        const { rows } = await client.query(`UPDATE ast_quotations SET is_selected=$2 WHERE id=$1 RETURNING *`, [id, !!is_selected]);
        await recordAuditTx(client, { action: 'ast_quotation_select', actor: sess.identityId || 'system', target: id, meta: { is_selected } });
        await client.query('COMMIT');
        return json(res, 200, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handleQuotations PATCH error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  // AST-06: Pedidos de Compra Internos Sintéticos
  const handlePurchaseOrders = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const { rows } = await pool.query(
        `SELECT o.*, s.name as supplier_name, r.protocol as requisition_protocol
         FROM ast_purchase_orders o
         LEFT JOIN ast_suppliers s ON s.id=o.supplier_id
         LEFT JOIN ast_requisitions r ON r.id=o.requisition_id
         ORDER BY o.created_at DESC LIMIT 200`
      );
      return json(res, 200, { items: rows, note: 'fluxo sintetico de compras internas rotulado' });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const requisition_id = body.requisition_id || null;
      const supplier_id = body.supplier_id || null;
      const total_amount_cents = Number(body.total_amount_cents);
      const file_url = body.file_url ? String(body.file_url).trim() : null;
      const storage_key = body.storage_key ? String(body.storage_key).trim() : null;
      const payable_id = body.payable_id || null;
      const notes = body.notes ? String(body.notes).trim() : null;

      if (!Number.isFinite(total_amount_cents) || total_amount_cents < 0) return json(res, 400, { error: 'invalid_total_amount' });

      const protocol = generateProtocol('PED-AST');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO ast_purchase_orders (protocol, requisition_id, supplier_id, total_amount_cents, file_url, storage_key, payable_id, notes, is_synthetic_flow, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) RETURNING *`,
          [protocol, requisition_id, supplier_id, total_amount_cents, file_url, storage_key, payable_id, notes, sess.identityId || null]
        );

        await client.query(
          `INSERT INTO ast_order_history (order_id, previous_status, next_status, previous_amount, next_amount, changed_by_identity, reason)
           VALUES ($1, NULL, $2, NULL, $3, $4, $5)`,
          [rows[0].id, 'rascunho', total_amount_cents, sess.identityId || null, 'Criação de pedido interno de compra sintético']
        );

        await recordAuditTx(client, {
          action: 'ast_order_create',
          actor: sess.identityId || 'system',
          target: rows[0].id,
          meta: { protocol, total_amount_cents, is_synthetic_flow: true }
        });

        await client.query('COMMIT');
        return json(res, 201, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handlePurchaseOrders POST error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id;
      const next_status = body.status ? String(body.status).trim() : null;
      const reason = body.reason ? String(body.reason).trim() : 'Atualização de pedido';

      if (!id || !next_status) return json(res, 400, { error: 'missing_id_or_status' });
      if (reason.length < 10 || reason.length > 1000) return json(res, 400, { error: 'invalid_reason' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: existing } = await client.query(`SELECT * FROM ast_purchase_orders WHERE id=$1 FOR UPDATE`, [id]);
        if (!existing.length) {
          await client.query('ROLLBACK');
          return json(res, 404, { error: 'not_found' });
        }
        const prev = existing[0].status;
        const valid = ['rascunho', 'enviado', 'recebido_parcial', 'recebido_total', 'cancelado'];
        if (!valid.includes(next_status)) {
          await client.query('ROLLBACK');
          return json(res, 400, { error: 'invalid_status' });
        }

        const { rows } = await client.query(`UPDATE ast_purchase_orders SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, next_status]);

        await client.query(
          `INSERT INTO ast_order_history (order_id, previous_status, next_status, previous_amount, next_amount, changed_by_identity, reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [id, prev, next_status, existing[0].total_amount_cents, existing[0].total_amount_cents, sess.identityId || null, reason]
        );

        // Se recebido_total e possui requisição com produto vinculado, gera entrada atômica de estoque
        if (next_status === 'recebido_total' && existing[0].requisition_id) {
          const { rows: reqRows } = await client.query(`SELECT product_id, quantity, contract_id FROM ast_requisitions WHERE id=$1`, [existing[0].requisition_id]);
          if (reqRows.length && reqRows[0].product_id) {
            await client.query(
              `INSERT INTO ast_stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, contract_id, created_by_identity)
               VALUES ($1, 'entrada', $2, $3, 'pedido', $4, $5, $6)`,
              [reqRows[0].product_id, reqRows[0].quantity, `Entrada automática por recebimento total de pedido ${existing[0].protocol}`, existing[0].protocol, reqRows[0].contract_id, sess.identityId || null]
            );
          }
        }

        await recordAuditTx(client, {
          action: 'ast_order_status_update',
          actor: sess.identityId || 'system',
          target: id,
          meta: { from: prev, to: next_status }
        });

        await client.query('COMMIT');
        return json(res, 200, rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handlePurchaseOrders PATCH error:', e);
        return json(res, 503, { error: 'persistence_failed' });
      } finally {
        client.release();
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  };

  const handleRequisitionHistory = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    const url = new URL(req.url, 'http://localhost');
    const requisition_id = url.searchParams.get('requisition_id');
    if (!requisition_id) return json(res, 400, { error: 'missing_requisition_id' });
    const { rows } = await pool.query(`SELECT * FROM ast_requisition_history WHERE requisition_id=$1 ORDER BY created_at DESC`, [requisition_id]);
    return json(res, 200, { items: rows });
  };

  const handleOrderHistory = async (req, res) => {
    if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
    const sess = await requireSession(req);
    if (!sess) return json(res, 401, { error: 'unauthorized' });
    if (!requireRole(sess, ['admin', 'ti', 'rh', 'financeiro', 'supervisor'])) return json(res, 403, { error: 'forbidden' });

    const url = new URL(req.url, 'http://localhost');
    const order_id = url.searchParams.get('order_id');
    if (!order_id) return json(res, 400, { error: 'missing_order_id' });
    const { rows } = await pool.query(`SELECT * FROM ast_order_history WHERE order_id=$1 ORDER BY created_at DESC`, [order_id]);
    return json(res, 200, { items: rows });
  };

  return {
    handleSuppliers,
    handleProducts,
    handleStockMovements,
    handleReservations,
    handleSerializedAssets,
    handleDeliveries,
    handleRequisitions,
    handleQuotations,
    handlePurchaseOrders,
    handleRequisitionHistory,
    handleOrderHistory
  };
}
