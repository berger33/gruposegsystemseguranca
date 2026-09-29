// PLT-08: catálogo legado de backups NÃO verificados; nenhuma execução de backup ou restore aqui.
export function createBackupApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
  const BACKUP_TYPES = ['database','documents','full','incremental'];
  const BACKUP_STATUSES = ['pending','running','success','failed','expired','deleted'];
  // Não deixar status legado `success`/flag `is_restore_tested` ser consumido
  // como comprovação. Conservar os valores originais em campos explicitamente
  // históricos; nenhuma linha no banco é reescrita automaticamente.
  const unverifiedBackup = row => ({ ...row, recorded_status: row.status,
    recorded_is_restore_tested: !!row.is_restore_tested,
    status: 'unverified', is_restore_tested: false, verified_artifact: false });
  const unverifiedRestore = row => ({ ...row, recorded_status: row.status,
    status: 'unverified', verified_execution: false });

  function sanitizeText(s, max) {
    if (s == null) return null;
    if (typeof s !== 'string') return null;
    const t = s.trim();
    if (t.length === 0) return null;
    if (t.length > max) return null;
    return t;
  }

  async function handleBackupJobs(req, res) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (!['admin','ti'].includes(session.role)) return json(res, 403, { error: 'backup_restricted_admin_ti' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const type = url.searchParams.get('type');
        const status = url.searchParams.get('status');
        const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
        let conds = []; let vals = []; let idx = 1;
        if (type) {
          if (!BACKUP_TYPES.includes(type)) return json(res, 400, { error: 'invalid_backup_type' });
          conds.push(`backup_type = $${idx++}`); vals.push(type);
        }
        if (status) {
          if (!BACKUP_STATUSES.includes(status)) return json(res, 400, { error: 'invalid_status' });
          conds.push(`status = $${idx++}`); vals.push(status);
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const r = await pool.query(`SELECT * FROM backup_jobs ${where} ORDER BY created_at DESC LIMIT $${idx}`, [...vals, limit]);
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'backup_status',$3,'allowed','none')", [session.role, session.identityId || session.role, 'list']); } catch {}
        return json(res, 200, { backups: r.rows.map(unverifiedBackup), note: 'Registros históricos, inclusive status success/is_restore_tested, não comprovam arquivo, criptografia, retenção física nem restore.' });
      } catch (e) {
        console.error('backup list failed', e);
        return json(res, 503, { error: 'backup_unavailable' });
      }
    }

    if (req.method === 'POST') {
      // Não há executor/armazenamento real. Nunca criar job que vire sucesso
      // artificial, mesmo para admin/ti; o runner QA é deliberadamente separado.
      return json(res, 503, { error: 'backup_execution_unavailable', note: 'Nenhum arquivo de backup foi criado por esta API.' });
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleBackupById(req, res, backupId) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(backupId)) return json(res, 400, { error: 'invalid_backup_id' });
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (!['admin','ti'].includes(session.role)) return json(res, 403, { error: 'backup_restricted' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM backup_jobs WHERE id = $1', [backupId]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        const restores = await pool.query('SELECT * FROM backup_restores WHERE backup_job_id = $1 ORDER BY created_at DESC LIMIT 20', [backupId]);
        return json(res, 200, { backup: unverifiedBackup(r.rows[0]), restores: restores.rows.map(unverifiedRestore), note: 'Metadados históricos não comprovam backup ou restauração.' });
      } catch {
        return json(res, 503, { error: 'backup_unavailable' });
      }
    }

    if (req.method === 'PATCH' || req.method === 'DELETE') {
      // Não permitir promoção manual a success nem "exclusão" só de metadados.
      return json(res, 503, { error: 'backup_job_mutation_unavailable', note: 'Artefato físico não é gerenciado por esta API.' });
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH, DELETE' });
  }

  async function handleRestore(req, res) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (!['admin','ti'].includes(session.role)) return json(res, 403, { error: 'backup_restricted' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const backupJobId = url.searchParams.get('backup_job_id') || url.searchParams.get('backupJobId');
        let q = 'SELECT * FROM backup_restores ORDER BY created_at DESC LIMIT 100';
        let vals = [];
        if (backupJobId) {
          q = 'SELECT * FROM backup_restores WHERE backup_job_id = $1 ORDER BY created_at DESC LIMIT 100';
          vals = [backupJobId];
        }
        const r = await pool.query(q, vals);
        return json(res, 200, { restores: r.rows.map(unverifiedRestore), note: 'Registros históricos de restore não comprovam execução nem isolamento.' });
      } catch {
        return json(res, 503, { error: 'restore_unavailable' });
      }
    }

    if (req.method === 'POST') {
      // is_restore_tested e status históricos são metadados sem evidência;
      // nenhum restore pode ser executado/certificado por esta API.
      return json(res, 503, { error: 'restore_execution_unavailable', note: 'Nenhuma restauração foi iniciada por esta API.' });
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleRetention(req, res) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (!['admin','ti'].includes(session.role)) return json(res, 403, { error: 'retention_restricted' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM backup_retention_policies ORDER BY category');
        const expired = await pool.query(`SELECT COUNT(*)::int AS cnt FROM backup_jobs WHERE status = 'success' AND retention_until < NOW()`);
        return json(res, 200, { policies: r.rows, expired_count: expired.rows[0]?.cnt || 0, note: 'Políticas declarativas; não comprovam armazenamento, criptografia ou descarte físico.' });
      } catch {
        return json(res, 503, { error: 'retention_unavailable' });
      }
    }

    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      let body;
      try { body = await readJson(req, 5 * 1024); } catch { return json(res, 400, { error: 'invalid_json' }); }
      const category = sanitizeText(body?.category, 100);
      const retention_days = body?.retention_days || body?.retentionDays;
      const description = sanitizeText(body?.description, 1000);
      if (!category) return json(res, 400, { error: 'invalid_category' });
      const ret = parseInt(retention_days, 10);
      if (isNaN(ret) || ret < 1 || ret > 3650) return json(res, 400, { error: 'invalid_retention_days' });

      try {
        const pool = getPool();
        const up = await pool.query(
          `INSERT INTO backup_retention_policies (id, category, retention_days, description, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (category) DO UPDATE SET retention_days = EXCLUDED.retention_days, description = COALESCE(EXCLUDED.description, backup_retention_policies.description), updated_at = NOW()
           RETURNING *`,
          [crypto.randomUUID(), category, ret, description, session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'backup_retention_update',$3,'allowed','none')", [session.role, session.identityId || session.role, up.rows[0].id]); } catch {}
        return json(res, 200, { policy: up.rows[0], note: 'Política declarativa, não aplicada a arquivos físicos por esta API.' });
      } catch (e) {
        return json(res, 503, { error: 'retention_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST, PUT, PATCH' });
  }

  return { handleBackupJobs, handleBackupById, handleRestore, handleRetention };
}
