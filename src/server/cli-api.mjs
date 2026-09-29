/**
 * CLI-01..04 — APIs internas de metadados CLI v2. A sessão staff admin/ti é
 * obrigatória; o cookie do portal cliente não autoriza estes handlers.
 * Delegação por cliente, vínculo por recurso e streaming privado de arquivos
 * ainda NÃO foram homologados/implementados neste módulo.
 */

function validateUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function createCliApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  function send(res, status, data) { res.writeHead(status, headers); res.end(JSON.stringify(data)); }
  async function body(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return null; }
  }

  // ---- CLI-01 Entrada única e rotas antigas ----
  async function handleEntryPoints(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    // Sem vínculo por conta verificado nesta API; acesso global apenas admin/ti.
    if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
    if (req.method !== 'GET') return send(res,405,{error:'method_not_allowed'});
    try {
      const { rows } = await pool.query(`SELECT * FROM cli_entry_points ORDER BY is_primary DESC, path ASC`);
      return send(res,200,{ entryPoints: rows, primary: rows.find(r=>r.is_primary) });
    } catch (e) { console.error('entryPoints GET', e.message); return send(res,500,{error:'internal_error'}); }
  }

  async function handleOldRoutes(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    // Sem vínculo por conta verificado nesta API; acesso global apenas admin/ti.
    if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
    if (req.method === 'GET') {
      try {
        const { rows } = await pool.query(`SELECT * FROM cli_old_routes ORDER BY old_path ASC`);
        return send(res,200,{ oldRoutes: rows });
      } catch (e) { console.error('oldRoutes GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const old_path = (b.old_path||b.oldPath||'').trim();
      const new_path = (b.new_path||b.newPath||'').trim();
      if (!old_path || !new_path) return send(res,400,{error:'paths_required'});
      try {
        const { rows } = await pool.query(
          `INSERT INTO cli_old_routes (old_path, new_path, action, reason) VALUES ($1,$2,$3,$4) RETURNING *`,
          [old_path, new_path, b.action||'redirect', b.reason||null]
        );
        try { await auditLog({ action: 'cli_old_route_redirect', actor: sess.role, target: rows[0].id, meta: { old_path, new_path } }); } catch {}
        return send(res,201,{ oldRoute: rows[0] });
      } catch (e) {
        if (e.code==='23505') return send(res,409,{error:'duplicate_old_path'});
        console.error('oldRoutes POST', e.message); return send(res,500,{error:'internal_error'});
      }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  // ---- CLI-02 Contatos e papéis por conta/unidade/contrato ----
  async function handleClientContacts(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    // Sem vínculo por conta verificado nesta API; acesso global apenas admin/ti.
    if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const client_account_id = url.searchParams.get('client_account_id') || url.searchParams.get('account_id');
      const where=[]; const vals=[]; let i=1;
      if (client_account_id) { if (!validateUuid(client_account_id)) return send(res,400,{error:'invalid_account_id'}); where.push(`client_account_id=$${i++}`); vals.push(client_account_id); }
      const ws = where.length? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM cli_client_contacts ${ws} ORDER BY display_name ASC LIMIT 100`, vals);
        return send(res,200,{ contacts: rows });
      } catch (e) { console.error('cliContacts GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      // Delegação de cliente requer sessão/escopo próprios; este endpoint é staff-only.
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const client_account_id = b.client_account_id || b.accountId;
      if (!validateUuid(client_account_id)) return send(res,400,{error:'invalid_account_id'});
      const display_name = (b.display_name||b.displayName||'').trim();
      if (display_name.length<2 || display_name.length>200) return send(res,400,{error:'invalid_display_name', detail:'2..200'});
      const email = (b.email||'').trim().toLowerCase();
      if (!email || !email.includes('@') || email.length>320) return send(res,400,{error:'invalid_email'});
      const role = b.role || 'operacional';
      if (!['titular','financeiro','operacional','rh','comercial','tecnico','outro'].includes(role)) return send(res,400,{error:'invalid_role'});
      try {
        const { rows } = await pool.query(
          `INSERT INTO cli_client_contacts (client_account_id, identity_id, display_name, email, phone, role, status, can_delegate, delegated_by_contact_id, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [client_account_id, b.identity_id||b.identityId||null, display_name, email, b.phone||null, role, b.status||'pendente_convite', !!b.can_delegate, b.delegated_by_contact_id||b.delegatedByContactId||null, b.notes||null, sess.role]
        );
        try { await auditLog({ action: 'cli_contact_create', actor: sess.role, target: rows[0].id, meta: { client_account_id, email, role, can_delegate: rows[0].can_delegate } }); } catch {}
        return send(res,201,{ contact: rows[0] });
      } catch (e) {
        if (e.code==='23505') return send(res,409,{error:'duplicate_contact_email', detail:'email já cadastrado nesta conta'});
        console.error('cliContacts POST', e.message); return send(res,500,{error:'internal_error', detail:e.message});
      }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const id = b.id;
      if (!validateUuid(id)) return send(res,400,{error:'invalid_id'});
      try {
        const { rows } = await pool.query(
          `UPDATE cli_client_contacts SET role=COALESCE($1,role), status=COALESCE($2,status), can_delegate=COALESCE($3,can_delegate), phone=COALESCE($4,phone), notes=COALESCE($5,notes), updated_at=NOW() WHERE id=$6 RETURNING *`,
          [b.role||null, b.status||null, b.can_delegate??null, b.phone||null, b.notes||null, id]
        );
        if (!rows.length) return send(res,404,{error:'not_found'});
        return send(res,200,{ contact: rows[0] });
      } catch (e) { console.error('cliContacts PATCH', e.message); return send(res,500,{error:'internal_error'}); }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  async function handleContactScopes(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    // Sem vínculo por conta verificado nesta API; acesso global apenas admin/ti.
    if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const contact_id = url.searchParams.get('contact_id');
      const where=[]; const vals=[]; let i=1;
      if (contact_id) { if (!validateUuid(contact_id)) return send(res,400,{error:'invalid_contact_id'}); where.push(`contact_id=$${i++}`); vals.push(contact_id); }
      const ws = where.length? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM cli_contact_scopes ${ws} ORDER BY created_at DESC LIMIT 100`, vals);
        return send(res,200,{ scopes: rows });
      } catch (e) { console.error('contactScopes GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const contact_id = b.contact_id || b.contactId;
      if (!validateUuid(contact_id)) return send(res,400,{error:'invalid_contact_id'});
      const client_account_id = b.client_account_id || b.accountId;
      if (!validateUuid(client_account_id)) return send(res,400,{error:'invalid_account_id'});
      const role = b.role || 'operacional';
      if (!['titular','financeiro','operacional','rh','comercial','tecnico','outro'].includes(role)) return send(res,400,{error:'invalid_role'});
      // sem ampliação fora do próprio escopo: contact's account must match scope account
      try {
        const { rows: contact } = await pool.query(`SELECT client_account_id FROM cli_client_contacts WHERE id=$1`, [contact_id]);
        if (!contact.length) return send(res,404,{error:'contact_not_found'});
        if (contact[0].client_account_id !== client_account_id) {
          return send(res,400,{error:'scope_account_mismatch', detail:'sem ampliação fora do próprio escopo - conta do escopo deve ser mesma do contato'});
        }
        const { rows } = await pool.query(
          `INSERT INTO cli_contact_scopes (contact_id, client_account_id, unit_id, contract_id, role, can_delegate, delegated_by_contact_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [contact_id, client_account_id, b.unit_id||b.unitId||null, b.contract_id||b.contractId||null, role, !!b.can_delegate, b.delegated_by_contact_id||b.delegatedByContactId||null]
        );
        try { await auditLog({ action: 'cli_contact_scope_create', actor: sess.role, target: rows[0].id, meta: { contact_id, client_account_id, role } }); } catch {}
        return send(res,201,{ scope: rows[0] });
      } catch (e) {
        if (e.code==='23505') return send(res,409,{error:'duplicate_scope'});
        console.error('contactScopes POST', e.message); return send(res,500,{error:'internal_error', detail:e.message});
      }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  async function handleDelegateContact(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    // Sem vínculo por conta verificado nesta API; acesso global apenas admin/ti.
    if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
    if (req.method !== 'POST') return send(res,405,{error:'method_not_allowed'});
    if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
    const b = await body(req);
    if (!b) return send(res,400,{error:'invalid_json'});
    const delegator_contact_id = b.delegator_contact_id || b.delegatorContactId;
    const target_email = (b.target_email||b.targetEmail||'').trim().toLowerCase();
    if (!validateUuid(delegator_contact_id)) return send(res,400,{error:'invalid_delegator_contact_id'});
    if (!target_email || !target_email.includes('@')) return send(res,400,{error:'invalid_target_email'});
    try {
      // check delegator can_delegate true and same account
      const { rows: delegator } = await pool.query(`SELECT client_account_id, can_delegate, role FROM cli_client_contacts WHERE id=$1 AND status='ativo'`, [delegator_contact_id]);
      if (!delegator.length) return send(res,404,{error:'delegator_not_found'});
      if (!delegator[0].can_delegate) return send(res,403,{error:'delegation_not_authorized', detail:'delegação apenas se autorizada'});
      // check target not already exists outside scope? Ensure same account
      const client_account_id = delegator[0].client_account_id;
      // create new contact with delegated_by
      const { rows } = await pool.query(
        `INSERT INTO cli_client_contacts (client_account_id, display_name, email, role, status, can_delegate, delegated_by_contact_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [client_account_id, b.display_name||b.displayName||target_email.split('@')[0], target_email, b.role||'operacional', 'pendente_convite', false, delegator_contact_id, sess.role]
      );
      try { await auditLog({ action: 'cli_contact_delegate', actor: sess.role, target: rows[0].id, meta: { delegator_contact_id, client_account_id, target_email } }); } catch {}
      return send(res,201,{ contact: rows[0], note: 'delegação registrada por admin/ti; fluxo cliente v2 não habilitado' });
    } catch (e) {
      if (e.code==='23505') return send(res,409,{error:'duplicate_email'});
      console.error('delegate POST', e.message); return send(res,500,{error:'internal_error'});
    }
  }

  // ---- CLI-03 Contratos itens vigência escopo ----
  async function handleContractItems(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    // Sem vínculo por conta verificado nesta API; acesso global apenas admin/ti.
    if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const contract_id = url.searchParams.get('contract_id');
      const where=[]; const vals=[]; let i=1;
      if (contract_id) { if (!validateUuid(contract_id)) return send(res,400,{error:'invalid_contract_id'}); where.push(`contract_id=$${i++}`); vals.push(contract_id); }
      const ws = where.length? `WHERE ${where.join(' AND ')}` : '';
      try {
        // conteúdo técnico interno não publicado automaticamente: filter is_internal false for client role
        const isClient = (sess.role||'').toLowerCase()==='client' || (sess.kind||'').toLowerCase()==='client';
        const extra = isClient ? (where.length? ' AND is_internal=false' : 'WHERE is_internal=false') : '';
        const { rows } = await pool.query(`SELECT * FROM cli_contract_items ${ws} ${extra} ORDER BY title ASC LIMIT 100`, vals);
        return send(res,200,{ items: rows });
      } catch (e) { console.error('contractItems GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const contract_id = b.contract_id || b.contractId;
      if (!validateUuid(contract_id)) return send(res,400,{error:'invalid_contract_id'});
      const title = (b.title||'').trim();
      if (title.length<3 || title.length>200) return send(res,400,{error:'invalid_title', detail:'3..200'});
      try {
        const { rows } = await pool.query(
          `INSERT INTO cli_contract_items (contract_id, item_type, title, description, quantity, unit, is_internal)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [contract_id, b.item_type||b.itemType||'outro', title, b.description||null, b.quantity||null, b.unit||null, !!b.is_internal]
        );
        try { await auditLog({ action: 'cli_contract_item_create', actor: sess.role, target: rows[0].id, meta: { contract_id, title, is_internal: rows[0].is_internal } }); } catch {}
        return send(res,201,{ item: rows[0] });
      } catch (e) { console.error('contractItems POST', e.message); return send(res,500,{error:'internal_error'}); }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  async function handleContractScopes(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    // Sem vínculo por conta verificado nesta API; acesso global apenas admin/ti.
    if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const contract_id = url.searchParams.get('contract_id');
      const where=[]; const vals=[]; let i=1;
      if (contract_id) { if (!validateUuid(contract_id)) return send(res,400,{error:'invalid_contract_id'}); where.push(`contract_id=$${i++}`); vals.push(contract_id); }
      const ws = where.length? `WHERE ${where.join(' AND ')}` : '';
      try {
        const isClient = (sess.role||'').toLowerCase()==='client';
        const extra = isClient ? (where.length? ' AND is_internal=false' : 'WHERE is_internal=false') : '';
        const { rows } = await pool.query(`SELECT * FROM cli_contract_scopes ${ws} ${extra} ORDER BY created_at DESC LIMIT 100`, vals);
        return send(res,200,{ scopes: rows });
      } catch (e) { console.error('contractScopes GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const contract_id = b.contract_id || b.contractId;
      if (!validateUuid(contract_id)) return send(res,400,{error:'invalid_contract_id'});
      const client_account_id = b.client_account_id || b.accountId;
      if (!validateUuid(client_account_id)) return send(res,400,{error:'invalid_account_id'});
      const scope_description = (b.scope_description||b.scopeDescription||'').trim();
      if (scope_description.length<10 || scope_description.length>2000) return send(res,400,{error:'invalid_scope_description', detail:'10..2000'});
      try {
        const { rows } = await pool.query(
          `INSERT INTO cli_contract_scopes (contract_id, client_account_id, unit_id, post_id, scope_description, is_internal)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [contract_id, client_account_id, b.unit_id||b.unitId||null, b.post_id||b.postId||null, scope_description, !!b.is_internal]
        );
        try { await auditLog({ action: 'cli_contract_scope_create', actor: sess.role, target: rows[0].id, meta: { contract_id, client_account_id, is_internal: rows[0].is_internal } }); } catch {}
        return send(res,201,{ scope: rows[0] });
      } catch (e) { console.error('contractScopes POST', e.message); return send(res,500,{error:'internal_error'}); }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  async function handleContractVigencia(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    // Sem vínculo por conta verificado nesta API; acesso global apenas admin/ti.
    if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const contract_id = url.searchParams.get('contract_id');
      if (!contract_id || !validateUuid(contract_id)) return send(res,400,{error:'invalid_contract_id'});
      try {
        const { rows } = await pool.query(`SELECT * FROM cli_contract_vigencia WHERE contract_id=$1 ORDER BY starts_on DESC`, [contract_id]);
        return send(res,200,{ vigencias: rows });
      } catch (e) { console.error('vigencia GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const contract_id = b.contract_id || b.contractId;
      if (!validateUuid(contract_id)) return send(res,400,{error:'invalid_contract_id'});
      const starts_on = b.starts_on || b.startsOn;
      if (!starts_on) return send(res,400,{error:'starts_on_required'});
      const ends_on = b.ends_on || b.endsOn || null;
      if (ends_on && new Date(ends_on) < new Date(starts_on)) return send(res,400,{error:'invalid_dates', detail:'ends_on >= starts_on'});
      try {
        const { rows } = await pool.query(
          `INSERT INTO cli_contract_vigencia (contract_id, starts_on, ends_on, status, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [contract_id, starts_on, ends_on, b.status||'vigente', b.notes||null]
        );
        try { await auditLog({ action: 'cli_vigencia_create', actor: sess.role, target: rows[0].id, meta: { contract_id, starts_on, ends_on } }); } catch {}
        return send(res,201,{ vigencia: rows[0] });
      } catch (e) { console.error('vigencia POST', e.message); return send(res,500,{error:'internal_error'}); }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  // ---- CLI-04 Documentos categoria validade versão busca download privado autorização testada ----
  async function handleDocumentCategories(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    // Sem vínculo por conta verificado nesta API; acesso global apenas admin/ti.
    if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
    if (req.method !== 'GET') return send(res,405,{error:'method_not_allowed'});
    try {
      const { rows } = await pool.query(`SELECT * FROM cli_document_categories WHERE is_active=true ORDER BY name ASC`);
      return send(res,200,{ categories: rows });
    } catch (e) { console.error('docCat GET', e.message); return send(res,500,{error:'internal_error'}); }
  }

  async function handleClientDocumentsV2(req, res) {
    // requireSession recebe a sessão de staff (não o cookie do portal cliente).
    // Até existir autorização de cliente com escopo v2 comprovado, só admin/ti
    // podem consultar metadados, independentemente do alias da rota.
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const client_account_id = url.searchParams.get('client_account_id') || url.searchParams.get('account_id');
      const contract_id = url.searchParams.get('contract_id');
      const category = url.searchParams.get('category');
      const search = url.searchParams.get('search') || url.searchParams.get('q');
      const where=[]; const vals=[]; let i=1;
      // Metadados v2 são restritos a admin/ti. Alias /api/client/* NÃO é
      // homologação de escopo por conta/contrato nem serviço de download privado.
      if (client_account_id) {
        if (!validateUuid(client_account_id)) return send(res,400,{error:'invalid_account_id'});
        where.push(`client_account_id=$${i++}`); vals.push(client_account_id);
      }
      if (contract_id) { if (!validateUuid(contract_id)) return send(res,400,{error:'invalid_contract_id'}); where.push(`contract_id=$${i++}`); vals.push(contract_id); }
      if (category) { where.push(`category=$${i++}`); vals.push(category); }
      if (search) { where.push(`(title ILIKE $${i} OR description ILIKE $${i})`); vals.push(`%${search}%`); i++; }
      const ws = where.length? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM cli_client_documents_v2 ${ws} ORDER BY created_at DESC LIMIT 100`, vals);
        // log search
        try {
          if (search) {
            await pool.query(`INSERT INTO cli_document_access_logs (document_id, identity_id, access_type, was_authorized) VALUES ($1,$2,'search',true)`, [rows[0]?.id || '00000000-0000-0000-0000-000000000000', sess.identityId||null]);
          }
        } catch {}
        return send(res,200,{ documents: rows });
      } catch (e) { console.error('cliDocV2 GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const client_account_id = b.client_account_id || b.accountId;
      if (!validateUuid(client_account_id)) return send(res,400,{error:'invalid_account_id'});
      const title = (b.title||'').trim();
      if (title.length<3 || title.length>200) return send(res,400,{error:'invalid_title', detail:'3..200'});
      const file_name = (b.file_name||b.fileName||'').trim();
      if (file_name.length<1 || file_name.length>500) return send(res,400,{error:'invalid_file_name'});
      const file_url = (b.file_url||b.fileUrl||'').trim();
      if (file_url.length<5 || file_url.length>1000) return send(res,400,{error:'invalid_file_url'});
      const storage_key = (b.storage_key||b.storageKey||'').trim();
      if (storage_key.length<5 || storage_key.length>500) return send(res,400,{error:'invalid_storage_key'});
      const valid_from = b.valid_from || b.validFrom || null;
      const valid_to = b.valid_to || b.validTo || null;
      if (valid_from && valid_to && new Date(valid_to) < new Date(valid_from)) return send(res,400,{error:'invalid_validity', detail:'valid_to >= valid_from'});
      // Sem transação exclusiva no wrapper PGlite; não persistir uma escrita
      // sensível sem poder comprovar atomicidade da auditoria no mesmo banco.
      if (pool.__isPGlite || pool.__isPGliteProxy) return send(res,503,{error:'audited_write_requires_transactional_pg'});
      let client;
      let inTransaction = false;
      let auditFailed = false;
      try {
        client = await pool.connect();
        await client.query('BEGIN');
        inTransaction = true;
        const contractId = b.contract_id || b.contractId || null;
        if (contractId) {
          if (!validateUuid(contractId)) {
            await client.query('ROLLBACK'); inTransaction = false;
            return send(res,400,{error:'invalid_contract_id'});
          }
          const { rows: matching } = await client.query(
            'SELECT id FROM client_contracts WHERE id=$1 AND client_account_id=$2', [contractId, client_account_id]
          );
          if (!matching.length) {
            await client.query('ROLLBACK'); inTransaction = false;
            return send(res,400,{error:'contract_account_mismatch'});
          }
        }
        // Documento, versão inicial e auditoria são uma única operação.
        const { rows: maxRows } = await client.query(
          'SELECT MAX(version) AS mv FROM cli_client_documents_v2 WHERE client_account_id=$1 AND title=$2',
          [client_account_id, title]
        );
        const nextVersion = (maxRows[0]?.mv || 0) + 1;
        const { rows } = await client.query(
          `INSERT INTO cli_client_documents_v2 (client_account_id, contract_id, category, title, description, file_name, file_url, storage_key, version, status, valid_from, valid_to, is_internal, is_private, uploaded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
          [client_account_id, contractId, b.category||'outro', title, b.description||null, file_name, file_url, storage_key, nextVersion, b.status||'rascunho', valid_from, valid_to, !!b.is_internal, b.is_private!==false, sess.role]
        );
        await client.query(
          `INSERT INTO cli_document_versions (document_id, version, file_name, file_url, storage_key, uploaded_by, change_reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [rows[0].id, nextVersion, file_name, file_url, storage_key, sess.role, 'Criação inicial']
        );
        auditFailed = true;
        await client.query(
          'INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)',
          ['cli_document_create', sess.identityId || sess.role, rows[0].id,
            JSON.stringify({ client_account_id, version: nextVersion, is_internal: rows[0].is_internal })]
        );
        auditFailed = false;
        await client.query('COMMIT');
        inTransaction = false;
        return send(res,201,{ document: rows[0] });
      } catch (e) {
        if (inTransaction) {
          try { await client.query('ROLLBACK'); } catch { /* conexão já falhou; nunca responder sucesso */ }
        }
        if (auditFailed) return send(res,503,{error:'audit_unavailable'});
        if (e.code==='23505') return send(res,409,{error:'duplicate_document'});
        console.error('cliDocV2 POST failed', { code: e.code || 'unknown' });
        return send(res,503,{error:'write_unavailable'});
      } finally {
        client?.release();
      }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const id = b.id;
      if (!validateUuid(id)) return send(res,400,{error:'invalid_id'});
      const status = b.status;
      if (status && !['rascunho','publicado','arquivado','vencido','cancelado'].includes(status)) return send(res,400,{error:'invalid_status'});
      try {
        const { rows } = await pool.query(
          `UPDATE cli_client_documents_v2 SET status=COALESCE($1,status), valid_from=COALESCE($2,valid_from), valid_to=COALESCE($3,valid_to), is_internal=COALESCE($4,is_internal), title=COALESCE($5,title), description=COALESCE($6,description), updated_at=NOW() WHERE id=$7 RETURNING *`,
          [status||null, b.valid_from||b.validFrom||null, b.valid_to||b.validTo||null, b.is_internal??null, b.title||null, b.description||null, id]
        );
        if (!rows.length) return send(res,404,{error:'not_found'});
        return send(res,200,{ document: rows[0] });
      } catch (e) { console.error('cliDocV2 PATCH', e.message); return send(res,500,{error:'internal_error'}); }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  async function handleDocumentVersions(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const document_id = url.searchParams.get('document_id');
      if (!document_id || !validateUuid(document_id)) return send(res,400,{error:'invalid_document_id'});
      try {
        const { rows } = await pool.query(`SELECT * FROM cli_document_versions WHERE document_id=$1 ORDER BY version DESC`, [document_id]);
        return send(res,200,{ versions: rows });
      } catch (e) { console.error('docVersions GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const document_id = b.document_id || b.documentId;
      if (!validateUuid(document_id)) return send(res,400,{error:'invalid_document_id'});
      const file_name = (b.file_name||b.fileName||'').trim();
      const file_url = (b.file_url||b.fileUrl||'').trim();
      const storage_key = (b.storage_key||b.storageKey||'').trim();
      if (!file_name || !file_url || !storage_key) return send(res,400,{error:'file_required'});
      try {
        const { rows: maxRows } = await pool.query(`SELECT MAX(version) as mv FROM cli_document_versions WHERE document_id=$1`, [document_id]);
        const nextVersion = (maxRows[0]?.mv || 0) + 1;
        const { rows } = await pool.query(
          `INSERT INTO cli_document_versions (document_id, version, file_name, file_url, storage_key, uploaded_by, change_reason) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [document_id, nextVersion, file_name, file_url, storage_key, sess.role, b.change_reason||b.changeReason||null]
        );
        // update main doc version and file
        await pool.query(`UPDATE cli_client_documents_v2 SET version=$1, file_name=$2, file_url=$3, storage_key=$4, updated_at=NOW() WHERE id=$5`, [nextVersion, file_name, file_url, storage_key, document_id]);
        try { await auditLog({ action: 'cli_document_version_create', actor: sess.role, target: rows[0].id, meta: { document_id, version: nextVersion } }); } catch {}
        return send(res,201,{ version: rows[0] });
      } catch (e) { console.error('docVersions POST', e.message); return send(res,500,{error:'internal_error'}); }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  async function handleDocumentDownload(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
    if (req.method !== 'GET') return send(res,405,{error:'method_not_allowed'});
    const url = new URL(req.url, 'http://localhost');
    const document_id = url.searchParams.get('document_id') || url.searchParams.get('id');
    if (!document_id || !validateUuid(document_id)) return send(res,400,{error:'invalid_document_id'});
    try {
      const { rows } = await pool.query(`SELECT * FROM cli_client_documents_v2 WHERE id=$1`, [document_id]);
      if (!rows.length) return send(res,404,{error:'not_found'});
      const doc = rows[0];
      // Só staff admin/ti alcança este handler. Retorno ainda é metadado/URL,
      // não bytes privados; cliente deve usar fluxo legado com arquivo protegido.
      try {
        await pool.query(`INSERT INTO cli_document_access_logs (document_id, identity_id, access_type, was_authorized) VALUES ($1,$2,'download',true)`, [document_id, sess.identityId||null]);
      } catch {}
      try { await auditLog({ action: 'cli_document_download', actor: sess.role, target: document_id, meta: { client_account_id: doc.client_account_id } }); } catch {}
      return send(res,200,{ document: doc, download_url: doc.file_url, note: 'metadados para admin/ti; URL não é streaming privado nem comprovante de autorização na origem do arquivo' });
    } catch (e) { console.error('docDownload GET', e.message); return send(res,500,{error:'internal_error'}); }
  }

  async function handleDocumentAccessLogs(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    if (!requireRole(sess,['admin','ti'])) return send(res,403,{error:'forbidden'});
    if (req.method !== 'GET') return send(res,405,{error:'method_not_allowed'});
    const url = new URL(req.url, 'http://localhost');
    const document_id = url.searchParams.get('document_id');
    const where=[]; const vals=[]; let i=1;
    if (document_id) { if (!validateUuid(document_id)) return send(res,400,{error:'invalid_document_id'}); where.push(`document_id=$${i++}`); vals.push(document_id); }
    const ws = where.length? `WHERE ${where.join(' AND ')}` : '';
    try {
      const { rows } = await pool.query(`SELECT * FROM cli_document_access_logs ${ws} ORDER BY created_at DESC LIMIT 100`, vals);
      return send(res,200,{ accessLogs: rows });
    } catch (e) { console.error('accessLogs GET', e.message); return send(res,500,{error:'internal_error'}); }
  }

  return {
    handleEntryPoints,
    handleOldRoutes,
    handleClientContacts,
    handleContactScopes,
    handleDelegateContact,
    handleContractItems,
    handleContractScopes,
    handleContractVigencia,
    handleDocumentCategories,
    handleClientDocumentsV2,
    handleDocumentVersions,
    handleDocumentDownload,
    handleDocumentAccessLogs,
  };
}
