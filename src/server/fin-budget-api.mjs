import { createHash } from 'node:crypto';

export function createFinBudgetApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const generateProtocol = (prefix) => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const rnd = Math.random().toString(36).substring(2,6).toUpperCase();
    return `${prefix}-${y}${m}${day}-${rnd}`;
  };

  const send = (res, code, body) => {
    res.writeHead(code, {'Content-Type':'application/json'});
    res.end(JSON.stringify(body));
  };
  const getSession = async (req) => { try { return await requireSession(req); } catch { return null; } };
  const normalizeRole = (sess) => String(sess?.role || sess?.userRole || '').toLowerCase();
  const checkAuth = async (req, res) => {
    const sess = await getSession(req);
    if (!sess) { send(res, 401, {error:'unauthorized'}); return null; }
    const allowed = ['admin','ti','financeiro','finance'];
    let ok = false;
    try { ok = Boolean(requireRole?.(sess, allowed)); } catch { ok = false; }
    const r = normalizeRole(sess);
    if (!ok && !allowed.includes(r)) { send(res, 403, {error:'forbidden'}); return null; }
    return sess;
  };
  const readJson = async (req) => new Promise((resolve, reject) => {
    let data=''; req.on('data', c=> data+=c); req.on('end', ()=> { try { resolve(data?JSON.parse(data):{}); } catch(e){ reject(e); } });
  });

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const BUDGET_STATUSES = new Set(['rascunho','em_revisao','aprovado','rejeitado','arquivado']);
  const SCENARIO_TYPES = new Set(['conservador','base','otimista','expansao','pessimista']);
  const BUDGET_TRANSITIONS = {
    rascunho: new Set(['em_revisao']),
    em_revisao: new Set(['aprovado','rejeitado']),
    aprovado: new Set(['arquivado']),  // aprovado -> em_revisao só por revisão explícita (action 'revise')
    rejeitado: new Set(['arquivado']),
    arquivado: new Set([]),
  };
  // FIN-14/15/16 — allowlists e transições controladas espelhando as guardas
  // de banco acrescentadas pela migração 133 (aditiva).
  const EXPORT_STATUSES = new Set(['pendente','gerando','gerado','falhou','expirado']);
  const EXPORT_TRANSITIONS = {
    pendente: new Set(['gerando','falhou']),
    gerando: new Set(['gerado','falhou']),
    gerado: new Set(['expirado']),
    falhou: new Set(['pendente']),
    expirado: new Set([]),
  };
  const CLOSURE_STATUSES = new Set(['aberta','fechada','reaberta','bloqueada']);
  const CLOSURE_ACTIONS = new Set(['reopen','close']);
  const CLOSURE_TRANSITIONS = {
    aberta: new Set(['fechada']),
    fechada: new Set(['reaberta']),
    reaberta: new Set(['fechada']),
    bloqueada: new Set([]),
  };
  const PROVISION_STATUSES = new Set(['provisionada','em_revisao','revisada','paga','cancelada']);
  const PROVISION_TRANSITIONS = {
    provisionada: new Set(['em_revisao','cancelada']),
    em_revisao: new Set(['revisada','cancelada']),
    revisada: new Set(['em_revisao','paga','cancelada']),
    paga: new Set([]),
    cancelada: new Set([]),
  };
  const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);
  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const canonicalJson = (value) => {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (isPlainObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  };
  const fingerprint = (value) => createHash('sha256').update(canonicalJson(value)).digest('hex');
  const isIsoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  const cleanText = (value) => typeof value === 'string' ? value.trim() : '';
  const textInRange = (value, min, max) => value.length >= min && value.length <= max;
  // Campo textual opcional: ausente vira null; presente precisa caber na faixa
  // do CHECK correspondente, para a resposta HTTP nunca vazar detalhe SQL.
  const optionalText = (value, min, max) => {
    if (value === undefined || value === null) return { ok:true, value:null };
    if (typeof value !== 'string') return { ok:false, value:null };
    const text = value.trim();
    if (!text) return { ok:true, value:null };
    return textInRange(text, min, max) ? { ok:true, value:text } : { ok:false, value:null };
  };
  const parseNullableCents = (value) => {
    if (value === undefined || value === null || value === '') return { ok:true, value:null };
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= 0 ? { ok:true, value:n } : { ok:false, value:null };
  };
  const parseNullablePercent = (value) => {
    if (value === undefined || value === null || value === '') return { ok:true, value:null };
    const n = Number(value);
    return Number.isFinite(n) && n >= -100 && n <= 100 ? { ok:true, value:n } : { ok:false, value:null };
  };
  const isAuditUnavailable = (error) => error?.code === '42P01' || /audit_log/i.test(String(error?.message || ''));
  const dbFailure = (res, error, options = {}) => {
    if (isAuditUnavailable(error)) return send(res, 503, {error:'audit_unavailable'});
    if (error?.code === '23505') return send(res, 409, {error: options.duplicate || 'duplicate'});
    if (error?.code === '23503') return send(res, 400, {error:'invalid_reference'});
    if (error?.code === '23514' || error?.code === '22P02' || error?.code === '22007') return send(res, 400, {error: options.invalid || 'invalid'});
    if (error?.code === 'P0001') {
      const msg = String(error.message || '');
      if (msg.includes('fin_budget_invalid_transition')) return send(res, 409, {error:'invalid_status_transition'});
      if (msg.includes('fin_budget_approval_requires_auditor')) return send(res, 400, {error:'approval_requires_identity_and_date'});
      if (msg.includes('fin_budget_history_immutable')) return send(res, 409, {error:'history_immutable'});
      if (msg.includes('fin_export_invalid_transition')) return send(res, 409, {error:'invalid_status_transition'});
      if (msg.includes('fin_export_generated_requires_storage_key')) return send(res, 400, {error:'storage_key_required_for_gerado'});
      if (msg.includes('fin_export_log_immutable')) return send(res, 409, {error:'history_immutable'});
      if (msg.includes('fin_closure_invalid_transition')) return send(res, 409, {error:'invalid_status_transition'});
      if (msg.includes('fin_closure_reopen_requires_authorization')) return send(res, 400, {error:'authorized_by_required'});
      if (msg.includes('fin_report_version_immutable')) return send(res, 409, {error:'history_immutable'});
      if (msg.includes('fin_commission_auto_pay_forbidden')) return send(res, 400, {error:'auto_paid_forbidden_nao_pagar_automaticamente'});
      if (msg.includes('fin_commission_invalid_transition')) return send(res, 409, {error:'invalid_status_transition'});
      if (msg.includes('fin_commission_payment_requires_review')) return send(res, 409, {error:'payment_requires_review'});
      if (msg.includes('fin_commission_provision_history is immutable')) return send(res, 409, {error:'history_immutable'});
      return send(res, 400, {error: options.invalid || 'invalid'});
    }
    return send(res, 500, {error:'internal'});
  };
  const guardMutation = (req, res, sess) => {
    if (req.method === 'GET') return false;
    if (!sameOrigin(req)) { send(res, 403, {error:'forbidden_origin'}); return true; }
    if (normalizeRole(sess) === 'ti') { send(res, 403, {error:'read_only'}); return true; }
    return false;
  };

  // --- FIN-13 (fatia aditiva) -----------------------------------------------
  // Orçamento aprovado é conteúdo congelado: edição ordinária é recusada e só
  // uma revisão explícita (motivo + autor + nova versão) retira a aprovação.
  // A margem percentual nunca vem do navegador: o banco calcula a partir de
  // receita e custo, e a constraint confere o que foi gravado.
  const BUDGET_CONTENT_FIELDS = ['title','description','premises','period_start','period_end','total_revenue_cents','total_cost_cents'];
  const BUDGET_EVENTS = new Set(['criacao','edicao','revisao','decisao']);
  const asIsoDate = (value) => {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  };
  const asCents = (value) => (value === null || value === undefined || value === '' ? null : Number(value));
  const hasField = (body, key) => Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;
  // Impressão do conteúdo da criação: é ela que permite aceitar o retry igual
  // e recusar a mesma chave com conteúdo diferente.
  const budgetFingerprint = (payload) => createHash('sha256').update(JSON.stringify([
    payload.title, payload.description, payload.premises,
    payload.period_start, payload.period_end,
    payload.total_revenue_cents, payload.total_cost_cents,
  ])).digest('hex');
  // Ator, evento e motivo viajam na MESMA transação da escrita: o gatilho de
  // histórico registra identidade real em vez de deduzir pelo aprovador.
  const setBudgetContext = async (client, { actor, event, reason }) => {
    await client.query(
      `SELECT set_config('seg.fin_budget_actor',$1,true),
              set_config('seg.fin_budget_event',$2,true),
              set_config('seg.fin_budget_reason',$3,true)`,
      [actor || '', BUDGET_EVENTS.has(event) ? event : '', (reason || '').slice(0, 1000)]
    );
  };
  const budgetGuardFailure = (res, error) => {
    const msg = String(error?.message || '');
    if (msg.includes('fin_budget_approved_content_locked')) return send(res, 409, {error:'approved_budget_locked_requires_revision'});
    if (msg.includes('fin_budget_revision_requires_reason_author_and_version')) return send(res, 400, {error:'revision_reason_10_1000_required'});
    if (msg.includes('fin_budget_archived_locked')) return send(res, 409, {error:'budget_archived_locked'});
    if (msg.includes('fin_budget_version_only_changes_on_revision')) return send(res, 409, {error:'invalid_version_change'});
    if (msg.includes('fin_budget_approval_must_be_cleared')) return send(res, 409, {error:'approval_must_be_cleared'});
    return null;
  };

  const handleBudgets = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (guardMutation(req, res, sess)) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const status = url.searchParams.get('status');
      if (status && !BUDGET_STATUSES.has(status)) return send(res, 400, {error:'invalid_status'});
      let q = `SELECT * FROM fin_budgets WHERE 1=1`; const params=[]; let idx=1;
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY period_start DESC LIMIT 200`;
      try { const { rows } = await pool.query(q, params); return send(res, 200, { budgets: rows }); }
      catch { return send(res, 500, {error:'internal'}); }
    }
    if (req.method === 'POST') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const idempotencyKey = cleanText(body.idempotency_key);
      if (!textInRange(idempotencyKey, 8, 200)) return send(res, 400, {error:'idempotency_key_8_200'});
      const title = cleanText(body.title);
      const description = cleanText(body.description);
      const premises = cleanText(body.premises);
      const period_start = body.period_start;
      const period_end = body.period_end;
      const total_revenue = parseNullableCents(body.total_revenue_cents);
      const total_cost = parseNullableCents(body.total_cost_cents);
      if (body.projected_margin_percent !== undefined || body.total_margin_percent !== undefined) {
        return send(res, 400, {error:'margin_percent_not_accepted_calculated_from_revenue_and_cost'});
      }
      if (!textInRange(title, 5, 200)) return send(res, 400, {error:'title_5_200'});
      if (!textInRange(description, 10, 2000)) return send(res, 400, {error:'description_10_2000'});
      if (!textInRange(premises, 10, 2000)) return send(res, 400, {error:'premises_10_2000_required_nao_prometer_resultado'});
      if (!isIsoDate(period_start) || !isIsoDate(period_end)) return send(res, 400, {error:'period_required'});
      if (new Date(`${period_end}T00:00:00Z`) < new Date(`${period_start}T00:00:00Z`)) return send(res, 400, {error:'period_end_gte_start'});
      if (!total_revenue.ok || !total_cost.ok) return send(res, 400, {error:'amount_cents_gte_0'});
      const fingerprint = budgetFingerprint({
        title, description, premises, period_start, period_end,
        total_revenue_cents: total_revenue.value, total_cost_cents: total_cost.value,
      });
      const replay = (row) => row.content_fingerprint !== fingerprint
        ? send(res, 409, {error:'idempotency_key_conflict'})
        : send(res, 200, { budget: row, idempotent_replay: true, note:'orcamento_ja_registrado_para_a_chave_de_idempotencia' });
      const protocol = generateProtocol('ORC-FIN');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const existing = await client.query(`SELECT * FROM fin_budgets WHERE idempotency_key=$1`, [idempotencyKey]);
        if (existing.rows.length) { await client.query('ROLLBACK'); return replay(existing.rows[0]); }
        await setBudgetContext(client, {
          actor: sess.identityId || null,
          event: 'criacao',
          reason: `Criação do orçamento gerencial ${protocol} com premissas explícitas; estimativa sem promessa de resultado`,
        });
        const { rows } = await client.query(
          `INSERT INTO fin_budgets (protocol, title, description, premises, period_start, period_end, total_revenue_cents, total_cost_cents, created_by_identity, idempotency_key, content_fingerprint, version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1) RETURNING *`,
          [protocol, title, description, premises, period_start, period_end, total_revenue.value, total_cost.value, sess.identityId||null, idempotencyKey, fingerprint]
        );
        await auditLog({ action:'fin_budget_create', actor: sess.identityId||'unknown', target: rows[0].id, meta:{ protocol, is_estimate:true, premises_explicit:true, idempotency_key: idempotencyKey, version:1 }, client });
        await client.query('COMMIT');
        return send(res, 201, { budget: rows[0], note:'orcamento_gerencial_premissas_explicitas_nao_prometer_resultado' });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        // Retry concorrente: quem perdeu a corrida do índice único relê a linha
        // vencedora em vez de duplicar o orçamento.
        if (e?.code === '23505' && String(e.constraint || e.detail || '').includes('idempotency')) {
          try {
            const raced = await pool.query(`SELECT * FROM fin_budgets WHERE idempotency_key=$1`, [idempotencyKey]);
            if (raced.rows.length) return replay(raced.rows[0]);
          } catch { /* cai no tratamento padrão abaixo */ }
        }
        const guarded = budgetGuardFailure(res, e); if (guarded) return guarded;
        return dbFailure(res, e, { duplicate:'duplicate_budget', invalid:'invalid_budget' });
      } finally { client.release(); }
    }
    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const id = body.id;
      if (!isUuid(id)) return send(res, 400, {error:'invalid_id'});
      if (body.total_margin_percent !== undefined) return send(res, 400, {error:'margin_percent_not_accepted_calculated_from_revenue_and_cost'});
      const action = body.action === undefined || body.action === null ? null : String(body.action);
      if (action !== null && action !== 'revise') return send(res, 400, {error:'invalid_action'});
      // Toda mutação precisa de motivo: é o que o histórico imutável guarda.
      const reason = cleanText(body.reason);
      if (!textInRange(reason, 10, 1000)) return send(res, 400, {error:'reason_10_1000_required'});
      const revisionReason = optionalText(body.revision_reason, 10, 1000);
      if (!revisionReason.ok) return send(res, 400, {error:'revision_reason_10_1000_required'});
      if (action === 'revise' && !revisionReason.value) return send(res, 400, {error:'revision_reason_10_1000_required'});
      if (action === 'revise' && !sess.identityId) return send(res, 400, {error:'revision_requires_identity'});
      if (hasField(body, 'period_start') && !isIsoDate(body.period_start)) return send(res, 400, {error:'period_required'});
      if (hasField(body, 'period_end') && !isIsoDate(body.period_end)) return send(res, 400, {error:'period_required'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query(`SELECT * FROM fin_budgets WHERE id=$1 FOR UPDATE`, [id]);
        if (!found.rows.length) { await client.query('ROLLBACK'); return send(res, 404, {error:'not_found'}); }
        const previous = found.rows[0];
        if (previous.status === 'arquivado') { await client.query('ROLLBACK'); return send(res, 409, {error:'budget_archived_locked'}); }

        const title = hasField(body, 'title') ? cleanText(body.title) : previous.title;
        const description = hasField(body, 'description') ? cleanText(body.description) : previous.description;
        const premises = hasField(body, 'premises') ? cleanText(body.premises) : previous.premises;
        const periodStart = hasField(body, 'period_start') ? body.period_start : asIsoDate(previous.period_start);
        const periodEnd = hasField(body, 'period_end') ? body.period_end : asIsoDate(previous.period_end);
        const totalRevenue = hasField(body, 'total_revenue_cents') ? parseNullableCents(body.total_revenue_cents) : { ok:true, value: asCents(previous.total_revenue_cents) };
        const totalCost = hasField(body, 'total_cost_cents') ? parseNullableCents(body.total_cost_cents) : { ok:true, value: asCents(previous.total_cost_cents) };
        if (!textInRange(title, 5, 200)) { await client.query('ROLLBACK'); return send(res, 400, {error:'title_5_200'}); }
        if (!textInRange(description, 10, 2000)) { await client.query('ROLLBACK'); return send(res, 400, {error:'description_10_2000'}); }
        if (!textInRange(premises, 10, 2000)) { await client.query('ROLLBACK'); return send(res, 400, {error:'premises_10_2000_required_nao_prometer_resultado'}); }
        if (!totalRevenue.ok || !totalCost.ok) { await client.query('ROLLBACK'); return send(res, 400, {error:'amount_cents_gte_0'}); }
        if (new Date(`${periodEnd}T00:00:00Z`) < new Date(`${periodStart}T00:00:00Z`)) { await client.query('ROLLBACK'); return send(res, 400, {error:'period_end_gte_start'}); }
        const contentChanged = title !== previous.title
          || description !== previous.description
          || premises !== previous.premises
          || periodStart !== asIsoDate(previous.period_start)
          || periodEnd !== asIsoDate(previous.period_end)
          || totalRevenue.value !== asCents(previous.total_revenue_cents)
          || totalCost.value !== asCents(previous.total_cost_cents);

        if (action === 'revise') {
          // Revisão explícita: preserva a versão anterior no histórico, retira
          // a aprovação e devolve o orçamento para nova aprovação.
          if (previous.status !== 'aprovado') { await client.query('ROLLBACK'); return send(res, 409, {error:'revision_requires_approved_budget'}); }
          await setBudgetContext(client, { actor: sess.identityId, event:'revisao', reason: revisionReason.value });
          const { rows } = await client.query(
            `UPDATE fin_budgets
                SET status='em_revisao', version=version+1, title=$1, description=$2, premises=$3,
                    period_start=$4, period_end=$5, total_revenue_cents=$6, total_cost_cents=$7,
                    approved_by_identity=NULL, approved_at=NULL,
                    revision_reason=$8, revised_by_identity=$9, revised_at=NOW(), updated_at=NOW()
              WHERE id=$10 RETURNING *`,
            [title, description, premises, periodStart, periodEnd, totalRevenue.value, totalCost.value, revisionReason.value, sess.identityId, id]
          );
          await auditLog({ action:'fin_budget_revise', actor: sess.identityId, target: id, meta:{
            protocol: previous.protocol, previous_status: previous.status, next_status: rows[0].status,
            previous_version: previous.version, next_version: rows[0].version,
            revision_reason: revisionReason.value, reason, approval_revoked: true, is_estimate: true,
          }, client });
          await client.query('COMMIT');
          return send(res, 200, { budget: rows[0], note:'revisao_registrada_versao_anterior_preservada_exige_nova_aprovacao' });
        }

        let nextStatus = previous.status;
        if (body.status !== undefined && body.status !== null) {
          if (!BUDGET_STATUSES.has(body.status)) { await client.query('ROLLBACK'); return send(res, 400, {error:'invalid_status'}); }
          nextStatus = body.status;
          if (previous.status === 'aprovado' && nextStatus === 'em_revisao') {
            await client.query('ROLLBACK'); return send(res, 409, {error:'revision_required_use_action_revise'});
          }
          if (nextStatus !== previous.status && !BUDGET_TRANSITIONS[previous.status]?.has(nextStatus)) {
            await client.query('ROLLBACK'); return send(res, 409, {error:'invalid_status_transition'});
          }
        }
        // Achado 1: conteúdo de orçamento aprovado não muda por edição comum.
        if (previous.status === 'aprovado' && contentChanged) {
          await client.query('ROLLBACK'); return send(res, 409, {error:'approved_budget_locked_requires_revision'});
        }
        let approvedBy = previous.approved_by_identity;
        let approvedAt = previous.approved_at;
        if (nextStatus === 'aprovado' && previous.status !== 'aprovado') {
          if (!sess.identityId) { await client.query('ROLLBACK'); return send(res, 400, {error:'approval_requires_identity_and_date'}); }
          approvedBy = sess.identityId;
          approvedAt = new Date();
        }
        const statusChanged = nextStatus !== previous.status;
        await setBudgetContext(client, {
          actor: sess.identityId || null,
          event: statusChanged ? 'decisao' : 'edicao',
          reason,
        });
        const { rows } = await client.query(
          `UPDATE fin_budgets
              SET status=$1, title=$2, description=$3, premises=$4,
                  period_start=$5, period_end=$6,
                  total_revenue_cents=$7, total_cost_cents=$8,
                  approved_by_identity=$9, approved_at=$10, updated_at=NOW()
            WHERE id=$11 RETURNING *`,
          [nextStatus, title, description, premises, periodStart, periodEnd, totalRevenue.value, totalCost.value, approvedBy, approvedAt, id]
        );
        await auditLog({ action:'fin_budget_update', actor: sess.identityId||'unknown', target: id, meta:{
          protocol: previous.protocol, previous_status: previous.status, next_status: rows[0].status,
          version: rows[0].version, content_changed: contentChanged, reason, is_estimate:true,
          creates_no_financial_obligation: true,
        }, client });
        await client.query('COMMIT');
        const approvalNote = rows[0].status === 'aprovado' && statusChanged
          ? 'aprovacao_gerencial_registrada_nao_gera_cobranca_pagamento_nem_obrigacao_automatica'
          : 'alteracao_registrada_com_motivo_e_historico';
        return send(res, 200, { budget: rows[0], note: approvalNote });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        const guarded = budgetGuardFailure(res, e); if (guarded) return guarded;
        return dbFailure(res, e, { duplicate:'duplicate_budget', invalid:'invalid_budget' });
      } finally { client.release(); }
    }
    return send(res, 405, {error:'method_not_allowed'});
  };

  // Histórico imutável do orçamento: criação, edição, revisão e decisão, com
  // snapshot completo, versões, autor real, data e motivo.
  const handleBudgetHistory = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res, 405, {error:'method_not_allowed'});
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const budget_id = url.searchParams.get('budget_id');
    if (budget_id && !isUuid(budget_id)) return send(res, 400, {error:'invalid_budget_id'});
    let q = `SELECT id, budget_id, event_type, previous_status, next_status, version_before, version_after,
                    changed_by_identity, changed_at, reason, metadata, snapshot_before, snapshot_after
               FROM fin_budget_history WHERE 1=1`;
    const params=[]; let idx=1;
    if (budget_id) { q+=` AND budget_id=$${idx++}`; params.push(budget_id); }
    q += budget_id ? ` ORDER BY changed_at ASC LIMIT 200` : ` ORDER BY changed_at DESC LIMIT 200`;
    try { const { rows } = await pool.query(q, params); return send(res, 200, { history: rows }); }
    catch { return send(res, 500, {error:'internal'}); }
  };

  const handleBudgetScenarios = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (guardMutation(req, res, sess)) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const budget_id = url.searchParams.get('budget_id');
      const scenario_type = url.searchParams.get('scenario_type');
      if (budget_id && !isUuid(budget_id)) return send(res, 400, {error:'invalid_budget_id'});
      if (scenario_type && !SCENARIO_TYPES.has(scenario_type)) return send(res, 400, {error:'invalid_scenario_type'});
      let q = `SELECT * FROM fin_budget_scenarios WHERE 1=1`; const params=[]; let idx=1;
      if (budget_id) { q+=` AND budget_id=$${idx++}`; params.push(budget_id); }
      if (scenario_type) { q+=` AND scenario_type=$${idx++}`; params.push(scenario_type); }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      try { const { rows } = await pool.query(q, params); return send(res, 200, { scenarios: rows }); }
      catch { return send(res, 500, {error:'internal'}); }
    }
    if (req.method === 'POST') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const budget_id = body.budget_id;
      const scenario_type = body.scenario_type || 'base';
      const title = cleanText(body.title);
      const premises = cleanText(body.premises);
      const projected_revenue = parseNullableCents(body.projected_revenue_cents);
      const projected_cost = parseNullableCents(body.projected_cost_cents);
      // Achado 2: a margem não é um dado de entrada. Receita e custo são.
      if (body.projected_margin_percent !== undefined && body.projected_margin_percent !== null && body.projected_margin_percent !== '') {
        return send(res, 400, {error:'margin_percent_not_accepted_calculated_from_revenue_and_cost'});
      }
      if (body.computed_margin_percent !== undefined || body.margin_basis !== undefined || body.margin_source !== undefined) {
        return send(res, 400, {error:'margin_percent_not_accepted_calculated_from_revenue_and_cost'});
      }
      if (!isUuid(budget_id)) return send(res, 400, {error:'invalid_budget_id'});
      if (!SCENARIO_TYPES.has(scenario_type)) return send(res, 400, {error:'invalid_scenario_type'});
      if (!textInRange(title, 5, 200)) return send(res, 400, {error:'title_5_200'});
      if (!textInRange(premises, 10, 2000)) return send(res, 400, {error:'premises_10_2000_required_cenario_expansao_premissas_explicitas'});
      if (!projected_revenue.ok || !projected_cost.ok) return send(res, 400, {error:'amount_cents_gte_0'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const budget = await client.query(`SELECT id, protocol, status FROM fin_budgets WHERE id=$1 FOR UPDATE`, [budget_id]);
        if (!budget.rows.length) { await client.query('ROLLBACK'); return send(res, 404, {error:'budget_not_found'}); }
        const dup = await client.query(`SELECT id FROM fin_budget_scenarios WHERE budget_id=$1 AND scenario_type=$2 FOR UPDATE`, [budget_id, scenario_type]);
        if (dup.rows.length) { await client.query('ROLLBACK'); return send(res, 409, {error:'duplicate_scenario_type_for_budget'}); }
        // O percentual gravado é derivado no próprio banco; receita zero e base
        // incompleta ficam sem percentual, com margin_basis explicando. Os
        // valores conhecidos (receita ou custo) são preservados como vieram.
        const { rows } = await client.query(
          `INSERT INTO fin_budget_scenarios (budget_id, scenario_type, title, premises, projected_revenue_cents, projected_cost_cents, projected_margin_percent, margin_source, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,
             CASE
               WHEN $5::bigint IS NULL OR $6::bigint IS NULL OR $5::bigint = 0 THEN NULL
               WHEN round((($5::numeric - $6::numeric) * 100) / $5::numeric, 2) BETWEEN -100 AND 100
                 THEN round((($5::numeric - $6::numeric) * 100) / $5::numeric, 2)
               ELSE NULL
             END,
             'servidor_calculado',$7) RETURNING *`,
          [budget_id, scenario_type, title, premises, projected_revenue.value, projected_cost.value, sess.identityId||null]
        );
        await auditLog({ action:'fin_budget_scenario_create', actor: sess.identityId||'unknown', target: rows[0].id, meta:{
          budget_id, scenario_type, is_estimate:true, premises_explicit:true,
          margin_basis: rows[0].margin_basis, margin_source:'servidor_calculado',
          computed_margin_percent: rows[0].computed_margin_percent,
        }, client });
        await client.query('COMMIT');
        return send(res, 201, { scenario: rows[0], note:'cenario_estimativa_identificada_margem_calculada_no_servidor_nao_prometer_resultado' });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        if (e?.code === '23514' && String(e.constraint || '').includes('margin_percent_matches_base')) {
          return send(res, 400, {error:'margin_percent_not_accepted_calculated_from_revenue_and_cost'});
        }
        return dbFailure(res, e, { duplicate:'duplicate_scenario_type_for_budget', invalid:'invalid_scenario' });
      } finally { client.release(); }
    }
    return send(res, 405, {error:'method_not_allowed'});
  };

  const handleExports = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (guardMutation(req, res, sess)) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const status = url.searchParams.get('status');
      if (status && !EXPORT_STATUSES.has(status)) return send(res, 400, {error:'invalid_status'});
      let q = `SELECT * FROM fin_exports WHERE 1=1`; const params=[]; let idx=1;
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      try { const { rows } = await pool.query(q, params); return send(res, 200, { exports: rows }); }
      catch { return send(res, 500, {error:'internal'}); }
    }
    if (req.method === 'POST') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const period_start = body.period_start;
      const period_end = body.period_end;
      if (!isIsoDate(period_start) || !isIsoDate(period_end)) return send(res, 400, {error:'period_required'});
      if (new Date(`${period_end}T00:00:00Z`) < new Date(`${period_start}T00:00:00Z`)) return send(res, 400, {error:'period_end_gte_start'});
      if (!isPlainObject(body.filters ?? {})) return send(res, 400, {error:'filters_object_required'});
      if (!isPlainObject(body.totals ?? {})) return send(res, 400, {error:'totals_object_required'});
      const filters = body.filters ?? {};
      const totals = body.totals ?? {};
      const file_name = optionalText(body.file_name, 1, 500);
      const file_url = optionalText(body.file_url, 5, 1000);
      const storage_key = optionalText(body.storage_key, 5, 500);
      if (!file_name.ok) return send(res, 400, {error:'file_name_1_500'});
      if (!file_url.ok) return send(res, 400, {error:'file_url_5_1000'});
      if (!storage_key.ok) return send(res, 400, {error:'storage_key_5_500'});
      const totalRecords = parseNullableCents(body.total_records);
      const totalAmount = parseNullableCents(body.total_amount_cents);
      if (!totalRecords.ok || !totalAmount.ok) return send(res, 400, {error:'totals_gte_0'});
      if (body.is_accountant_limited === false) return send(res, 400, {error:'accountant_limited_required'});
      const protocol = generateProtocol('EXP-FIN');
      const requestFingerprint = fingerprint({ period_start, period_end, filters, totals, total_records:totalRecords.value ?? 0, total_amount_cents:totalAmount.value ?? 0, file_name:file_name.value, file_url:file_url.value, storage_key:storage_key.value });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inserted = await client.query(
          `INSERT INTO fin_exports (protocol, period_start, period_end, filters, totals, total_records, total_amount_cents, file_name, file_url, storage_key, is_accountant_limited, access_role, requested_by_identity, status, request_fingerprint)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,'contador',$11,'pendente',$12)
           ON CONFLICT (storage_key) DO NOTHING RETURNING *`,
          [protocol, period_start, period_end, JSON.stringify(filters), JSON.stringify(totals), totalRecords.value ?? 0, totalAmount.value ?? 0, file_name.value, file_url.value, storage_key.value, sess.identityId||null, requestFingerprint]
        );
        if (!inserted.rows.length) {
          const replay = storage_key.value ? await client.query(`SELECT * FROM fin_exports WHERE storage_key=$1`, [storage_key.value]) : { rows:[] };
          await client.query('ROLLBACK');
          if (replay.rows[0]?.request_fingerprint === requestFingerprint) return send(res, 200, { export: replay.rows[0], idempotent_replay:true });
          return send(res, 409, {error:'idempotency_key_reused_with_different_payload'});
        }
        const rows = inserted.rows;
        await client.query(
          `INSERT INTO fin_export_logs (export_id, action, actor_identity, meta) VALUES ($1,$2,$3,$4)`,
          [rows[0].id, 'export_create', sess.identityId||null, JSON.stringify({ period_start, period_end, filters, totals, is_accountant_limited:true })]
        );
        await auditLog({ action:'fin_export_create', actor: sess.identityId||'unknown', target: rows[0].id, meta:{ protocol, period_start, period_end, is_accountant_limited:true, access_role:'contador' }, client });
        await client.query('COMMIT');
        return send(res, 201, { export: rows[0], idempotent_replay:false, note:'exportacao_periodo_trilha_filtros_totais_conciliaveis_acesso_limitado_contador' });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        return dbFailure(res, e, { duplicate:'duplicate_storage_key', invalid:'invalid_export' });
      } finally { client.release(); }
    }
    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const id = body.id;
      if (!isUuid(id)) return send(res, 400, {error:'invalid_id'});
      if (body.is_accountant_limited === false) return send(res, 400, {error:'accountant_limited_required'});
      const file_name = optionalText(body.file_name, 1, 500);
      const file_url = optionalText(body.file_url, 5, 1000);
      const storage_key = optionalText(body.storage_key, 5, 500);
      if (!file_name.ok) return send(res, 400, {error:'file_name_1_500'});
      if (!file_url.ok) return send(res, 400, {error:'file_url_5_1000'});
      if (!storage_key.ok) return send(res, 400, {error:'storage_key_5_500'});
      if (body.totals !== undefined && body.totals !== null && !isPlainObject(body.totals)) return send(res, 400, {error:'totals_object_required'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query(`SELECT * FROM fin_exports WHERE id=$1 FOR UPDATE`, [id]);
        if (!found.rows.length) { await client.query('ROLLBACK'); return send(res, 404, {error:'not_found'}); }
        const previous = found.rows[0];
        let nextStatus = previous.status;
        if (body.status !== undefined && body.status !== null) {
          if (!EXPORT_STATUSES.has(body.status)) { await client.query('ROLLBACK'); return send(res, 400, {error:'invalid_status'}); }
          nextStatus = body.status;
          if (nextStatus !== previous.status && !EXPORT_TRANSITIONS[previous.status]?.has(nextStatus)) {
            await client.query('ROLLBACK'); return send(res, 409, {error:'invalid_status_transition'});
          }
        }
        const nextStorageKey = storage_key.value ?? previous.storage_key;
        if (nextStatus === 'gerado' && !nextStorageKey) {
          await client.query('ROLLBACK'); return send(res, 400, {error:'storage_key_required_for_gerado'});
        }
        if (storage_key.value && storage_key.value !== previous.storage_key) {
          const dup = await client.query(`SELECT id FROM fin_exports WHERE storage_key=$1 AND id<>$2 FOR UPDATE`, [storage_key.value, id]);
          if (dup.rows.length) { await client.query('ROLLBACK'); return send(res, 409, {error:'duplicate_storage_key'}); }
        }
        const { rows } = await client.query(
          `UPDATE fin_exports
              SET status=$1::fin_export_status, file_name=COALESCE($2,file_name), file_url=COALESCE($3,file_url), storage_key=COALESCE($4,storage_key),
                  totals=COALESCE($5::jsonb,totals),
                  generated_at=CASE WHEN $1::text='gerado' THEN COALESCE(generated_at, NOW()) ELSE generated_at END,
                  expires_at=CASE WHEN $1::text='gerado' THEN COALESCE(expires_at, NOW()+INTERVAL '30 days') ELSE expires_at END,
                  updated_at=NOW()
            WHERE id=$6 RETURNING *`,
          [nextStatus, file_name.value, file_url.value, storage_key.value, body.totals === undefined || body.totals === null ? null : JSON.stringify(body.totals), id]
        );
        await client.query(
          `INSERT INTO fin_export_logs (export_id, action, actor_identity, meta) VALUES ($1,$2,$3,$4)`,
          [id, 'export_update', sess.identityId||null, JSON.stringify({ previous_status: previous.status, next_status: rows[0].status })]
        );
        await auditLog({ action:'fin_export_update', actor: sess.identityId||'unknown', target: id, meta:{ protocol: previous.protocol, previous_status: previous.status, next_status: rows[0].status, is_accountant_limited:true }, client });
        await client.query('COMMIT');
        return send(res, 200, { export: rows[0] });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        return dbFailure(res, e, { duplicate:'duplicate_storage_key', invalid:'invalid_export' });
      } finally { client.release(); }
    }
    return send(res, 405, {error:'method_not_allowed'});
  };

  const handleExportDownload = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res, 405, {error:'method_not_allowed'});
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const id = url.searchParams.get('id');
    if (!isUuid(id)) return send(res, 400, {error:'invalid_id'});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(`SELECT * FROM fin_exports WHERE id=$1 FOR UPDATE`, [id]);
      const row = found.rows[0];
      if (!row) { await client.query('ROLLBACK'); return send(res, 404, {error:'not_found'}); }
      if (row.status !== 'gerado') { await client.query('ROLLBACK'); return send(res, 409, {error:'export_not_generated'}); }
      if (!row.is_accountant_limited || row.access_role !== 'contador') { await client.query('ROLLBACK'); return send(res, 403, {error:'accountant_scope_required'}); }
      if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) { await client.query('ROLLBACK'); return send(res, 410, {error:'export_expired'}); }
      await client.query(`INSERT INTO fin_export_logs (export_id, action, actor_identity, meta) VALUES ($1,'export_download',$2,$3)`, [id, sess.identityId||null, JSON.stringify({ limited_scope:true, access_role:'contador' })]);
      await auditLog({ action:'fin_export_download', actor:sess.identityId||'unknown', target:id, meta:{ protocol:row.protocol, limited_scope:true, access_role:'contador' }, client });
      await client.query('COMMIT');
      const artifact = { protocol:row.protocol, period_start:row.period_start, period_end:row.period_end, filters:row.filters, totals:row.totals, total_records:row.total_records, total_amount_cents:row.total_amount_cents, generated_at:row.generated_at };
      const safeName = String(row.file_name || `${row.protocol}.json`).replace(/[^a-zA-Z0-9._-]/g, '_');
      res.writeHead(200, { 'Content-Type':'application/json', 'Content-Disposition':`attachment; filename="${safeName}"`, 'Cache-Control':'private, no-store' });
      return res.end(JSON.stringify(artifact));
    } catch(e) {
      try { await client.query('ROLLBACK'); } catch {}
      return dbFailure(res, e);
    } finally { client.release(); }
  };

  const handleExportLogs = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res, 405, {error:'method_not_allowed'});
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const export_id = url.searchParams.get('export_id');
    if (export_id && !isUuid(export_id)) return send(res, 400, {error:'invalid_export_id'});
    let q = `SELECT * FROM fin_export_logs WHERE 1=1`; const params=[]; let idx=1;
    if (export_id) { q+=` AND export_id=$${idx++}`; params.push(export_id); }
    q+=` ORDER BY created_at DESC LIMIT 200`;
    try { const { rows } = await pool.query(q, params); return send(res, 200, { logs: rows }); }
    catch { return send(res, 500, {error:'internal'}); }
  };

  const handleClosures = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (guardMutation(req, res, sess)) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const status = url.searchParams.get('status');
      if (status && !CLOSURE_STATUSES.has(status)) return send(res, 400, {error:'invalid_status'});
      let q = `SELECT * FROM fin_competence_closures WHERE 1=1`; const params=[]; let idx=1;
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY competence_date DESC LIMIT 200`;
      try { const { rows } = await pool.query(q, params); return send(res, 200, { closures: rows }); }
      catch { return send(res, 500, {error:'internal'}); }
    }
    if (req.method === 'POST') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const competence_date = body.competence_date;
      if (!isIsoDate(competence_date)) return send(res, 400, {error:'competence_date_required'});
      const notes = optionalText(body.notes, 10, 2000);
      if (!notes.ok) return send(res, 400, {error:'notes_10_2000'});
      const totals = isPlainObject(body.totals) ? body.totals : {};
      const requestFingerprint = fingerprint({ competence_date, notes:notes.value, totals });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inserted = await client.query(
          `INSERT INTO fin_competence_closures (competence_date, status, closed_by_identity, closed_at, notes, request_fingerprint)
           VALUES ($1,'fechada',$2,NOW(),$3,$4)
           ON CONFLICT (competence_date) DO NOTHING RETURNING *`,
          [competence_date, sess.identityId||null, notes.value, requestFingerprint]
        );
        if (!inserted.rows.length) {
          const replay = await client.query(`SELECT * FROM fin_competence_closures WHERE competence_date=$1`, [competence_date]);
          await client.query('ROLLBACK');
          if (replay.rows[0]?.request_fingerprint === requestFingerprint) return send(res, 200, { closure:replay.rows[0], idempotent_replay:true });
          return send(res, 409, {error:'idempotency_key_reused_with_different_payload'});
        }
        const rows = inserted.rows;
        await client.query(
          `INSERT INTO fin_report_versions (closure_id, version, report_type, data, totals, is_preserved, created_by_identity)
           VALUES ($1,1,'fechamento_competencia',$2,$3,true,$4)`,
          [rows[0].id, JSON.stringify({ competence_date, status:'fechada', closed_by: sess.identityId||null }), JSON.stringify(totals), sess.identityId||null]
        );
        await auditLog({ action:'fin_closure_create', actor: sess.identityId||'unknown', target: rows[0].id, meta:{ competence_date, status:'fechada', version:1 }, client });
        await client.query('COMMIT');
        return send(res, 201, { closure: rows[0], idempotent_replay:false, note:'fechamento_competencia_preservar_versoes_relatorio' });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        return dbFailure(res, e, { duplicate:'duplicate_competence', invalid:'invalid_closure' });
      } finally { client.release(); }
    }
    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const id = body.id;
      const action = body.action;
      if (!isUuid(id)) return send(res, 400, {error:'invalid_id'});
      if (!CLOSURE_ACTIONS.has(action)) return send(res, 400, {error:'invalid_action'});
      const reason = cleanText(action === 'reopen' ? body.reopen_reason : body.close_reason);
      if (!textInRange(reason, 10, 1000)) {
        return send(res, 400, {error: action === 'reopen' ? 'reopen_reason_10_1000_required_reabertura_autorizada' : 'close_reason_10_1000_required'});
      }
      const authorizedBy = action === 'reopen' ? (sess.identityId ?? null) : null;
      if (action === 'reopen') {
        if (!authorizedBy) return send(res, 400, {error:'authorized_by_required'});
        if (!isUuid(authorizedBy)) return send(res, 400, {error:'invalid_authorized_by_identity'});
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query(`SELECT * FROM fin_competence_closures WHERE id=$1 FOR UPDATE`, [id]);
        if (!found.rows.length) { await client.query('ROLLBACK'); return send(res, 404, {error:'not_found'}); }
        const previous = found.rows[0];
        const nextStatus = action === 'reopen' ? 'reaberta' : 'fechada';
        if (!CLOSURE_TRANSITIONS[previous.status]?.has(nextStatus)) {
          await client.query('ROLLBACK'); return send(res, 409, {error:'invalid_status_transition'});
        }
        const updated = action === 'reopen'
          ? await client.query(
              `UPDATE fin_competence_closures
                  SET status='reaberta', reopened_by_identity=$1, reopened_at=NOW(), reopen_reason=$2,
                      authorized_by_identity=$3, authorized_at=NOW(), updated_at=NOW()
                WHERE id=$4 RETURNING *`,
              [sess.identityId||null, reason, authorizedBy, id]
            )
          : await client.query(
              `UPDATE fin_competence_closures
                  SET status='fechada', closed_by_identity=$1, closed_at=NOW(), updated_at=NOW()
                WHERE id=$2 RETURNING *`,
              [sess.identityId||null, id]
            );
        const maxVer = await client.query(`SELECT COALESCE(MAX(version),0)+1 AS next FROM fin_report_versions WHERE closure_id=$1`, [id]);
        const nextVersion = maxVer.rows[0].next;
        await client.query(
          `INSERT INTO fin_report_versions (closure_id, version, report_type, data, totals, is_preserved, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,true,$6)`,
          [
            id,
            nextVersion,
            action === 'reopen' ? 'reabertura_competencia' : 'fechamento_competencia',
            JSON.stringify({ previous_status: previous.status, next_status: nextStatus, reason, authorized_by: authorizedBy }),
            JSON.stringify(isPlainObject(body.totals) ? body.totals : {}),
            sess.identityId||null,
          ]
        );
        await auditLog({
          action: action === 'reopen' ? 'fin_closure_reopen' : 'fin_closure_close',
          actor: sess.identityId||'unknown',
          target: id,
          meta:{ previous_status: previous.status, next_status: nextStatus, reason, authorized_by: authorizedBy, version: nextVersion },
          client,
        });
        await client.query('COMMIT');
        return send(res, 200, { closure: updated.rows[0], version: nextVersion, note:'reabertura_autorizada_preservar_versoes_relatorio' });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        return dbFailure(res, e, { duplicate:'duplicate_competence', invalid:'invalid_closure' });
      } finally { client.release(); }
    }
    return send(res, 405, {error:'method_not_allowed'});
  };

  const handleReportVersions = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res, 405, {error:'method_not_allowed'});
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const closure_id = url.searchParams.get('closure_id');
    if (closure_id && !isUuid(closure_id)) return send(res, 400, {error:'invalid_closure_id'});
    let q = `SELECT * FROM fin_report_versions WHERE 1=1`; const params=[]; let idx=1;
    if (closure_id) { q+=` AND closure_id=$${idx++}`; params.push(closure_id); }
    q+=` ORDER BY version DESC LIMIT 200`;
    try { const { rows } = await pool.query(q, params); return send(res, 200, { versions: rows }); }
    catch { return send(res, 500, {error:'internal'}); }
  };

  const handleCommissionProvisions = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (guardMutation(req, res, sess)) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const rule_id = url.searchParams.get('rule_id');
      const status = url.searchParams.get('status');
      if (rule_id && !isUuid(rule_id)) return send(res, 400, {error:'invalid_rule_id'});
      if (status && !PROVISION_STATUSES.has(status)) return send(res, 400, {error:'invalid_status'});
      let q = `SELECT * FROM fin_commission_provisions WHERE 1=1`; const params=[]; let idx=1;
      if (rule_id) { q+=` AND rule_id=$${idx++}`; params.push(rule_id); }
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY provision_date DESC LIMIT 200`;
      try { const { rows } = await pool.query(q, params); return send(res, 200, { provisions: rows }); }
      catch { return send(res, 500, {error:'internal'}); }
    }
    if (req.method === 'POST') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      if (body.is_auto_paid === true) return send(res, 400, {error:'auto_paid_forbidden_nao_pagar_automaticamente'});
      if (body.status !== undefined && body.status !== null && body.status !== 'provisionada') return send(res, 400, {error:'initial_status_must_be_provisionada'});
      const optionalIds = { rule_id: body.rule_id ?? null, commission_id: body.commission_id ?? null, contract_id: body.contract_id ?? null };
      for (const [key, value] of Object.entries(optionalIds)) {
        if (value !== null && !isUuid(value)) return send(res, 400, {error:`invalid_${key}`});
      }
      const provision_date = body.provision_date ?? new Date().toISOString().slice(0,10);
      if (!isIsoDate(provision_date)) return send(res, 400, {error:'invalid_provision_date'});
      const amount = parseNullableCents(body.amount_cents);
      if (!amount.ok || amount.value === null) return send(res, 400, {error:'amount_cents_gte_0'});
      const notes = optionalText(body.notes, 10, 2000);
      if (!notes.ok) return send(res, 400, {error:'notes_10_2000'});
      const idempotencyKey = optionalText(body.idempotency_key, 8, 200);
      if (!idempotencyKey.ok) return send(res, 400, {error:'idempotency_key_8_200'});
      const requestFingerprint = fingerprint({ ...optionalIds, provision_date, amount_cents:amount.value, notes:notes.value });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inserted = await client.query(
          `INSERT INTO fin_commission_provisions (rule_id, commission_id, contract_id, provision_date, amount_cents, provisioned_by_identity, notes, is_auto_paid, status, idempotency_key, request_fingerprint)
           VALUES ($1,$2,$3,$4,$5,$6,$7,false,'provisionada',$8,$9)
           ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING *`,
          [optionalIds.rule_id, optionalIds.commission_id, optionalIds.contract_id, provision_date, amount.value, sess.identityId||null, notes.value, idempotencyKey.value, requestFingerprint]
        );
        if (!inserted.rows.length) {
          const replay = idempotencyKey.value ? await client.query(`SELECT * FROM fin_commission_provisions WHERE idempotency_key=$1`, [idempotencyKey.value]) : { rows:[] };
          await client.query('ROLLBACK');
          if (replay.rows[0]?.request_fingerprint === requestFingerprint) return send(res, 200, { provision:replay.rows[0], idempotent_replay:true, note:'nao_pagar_automaticamente' });
          return send(res, 409, {error:'idempotency_key_reused_with_different_payload'});
        }
        const rows = inserted.rows;
        await client.query(
          `INSERT INTO fin_commission_provision_history (provision_id, previous_status, next_status, previous_amount, next_amount, changed_by_identity, reason, is_auto_paid_attempt)
           VALUES ($1,NULL,'provisionada',NULL,$2,$3,$4,false)`,
          [rows[0].id, amount.value, sess.identityId||null, 'Provisão de comissão ligada à regra CRM-25; revisão manual obrigatória, sem pagamento automático']
        );
        await auditLog({ action:'fin_commission_provision_create', actor: sess.identityId||'unknown', target: rows[0].id, meta:{ rule_id: optionalIds.rule_id, commission_id: optionalIds.commission_id, amount_cents: amount.value, is_auto_paid:false }, client });
        await client.query('COMMIT');
        return send(res, 201, { provision: rows[0], idempotent_replay:false, note:'comissoes_ligadas_regra_CRM25_provisao_revisao_nao_pagar_automaticamente' });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        return dbFailure(res, e, { duplicate:'duplicate_provision', invalid:'invalid_provision' });
      } finally { client.release(); }
    }
    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const id = body.id;
      if (!isUuid(id)) return send(res, 400, {error:'invalid_id'});
      if (body.is_auto_paid === true) return send(res, 400, {error:'auto_paid_forbidden_nao_pagar_automaticamente'});
      const reason = cleanText(body.reason);
      if (!textInRange(reason, 10, 1000)) return send(res, 400, {error:'reason_10_1000_required'});
      if (body.status === undefined || body.status === null) return send(res, 400, {error:'status_required'});
      if (!PROVISION_STATUSES.has(body.status)) return send(res, 400, {error:'invalid_status'});
      const nextStatus = body.status;
      const revisionReason = optionalText(body.revision_reason, 10, 1000);
      if (!revisionReason.ok) return send(res, 400, {error:'revision_reason_10_1000_required'});
      if ((nextStatus === 'em_revisao' || nextStatus === 'revisada') && !revisionReason.value) {
        return send(res, 400, {error:'revision_reason_10_1000_required'});
      }
      if (nextStatus === 'paga' && body.manual_payment_confirmation !== true) {
        return send(res, 400, {error:'manual_payment_confirmation_required_nao_pagar_automaticamente'});
      }
      const amount = body.amount_cents === undefined || body.amount_cents === null ? { ok:true, value:null } : parseNullableCents(body.amount_cents);
      if (!amount.ok) return send(res, 400, {error:'amount_cents_gte_0'});
      const notes = optionalText(body.notes, 10, 2000);
      if (!notes.ok) return send(res, 400, {error:'notes_10_2000'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query(`SELECT * FROM fin_commission_provisions WHERE id=$1 FOR UPDATE`, [id]);
        if (!found.rows.length) { await client.query('ROLLBACK'); return send(res, 404, {error:'not_found'}); }
        const previous = found.rows[0];
        if (nextStatus !== previous.status && !PROVISION_TRANSITIONS[previous.status]?.has(nextStatus)) {
          await client.query('ROLLBACK');
          return send(res, 409, {error: nextStatus === 'paga' ? 'payment_requires_review' : 'invalid_status_transition'});
        }
        if (nextStatus === 'paga' && previous.status !== 'revisada') {
          await client.query('ROLLBACK'); return send(res, 409, {error:'payment_requires_review'});
        }
        if (previous.status === 'paga' && nextStatus !== 'paga') {
          await client.query('ROLLBACK'); return send(res, 409, {error:'invalid_status_transition'});
        }
        const { rows } = await client.query(
          `UPDATE fin_commission_provisions
              SET status=$1::fin_commission_provision_status,
                  amount_cents=COALESCE($2::bigint,amount_cents),
                  revision_reason=COALESCE($3::text,revision_reason),
                  reviewed_by_identity=CASE WHEN $1::text IN ('em_revisao','revisada') THEN $4::uuid ELSE reviewed_by_identity END,
                  reviewed_at=CASE WHEN $1::text IN ('em_revisao','revisada') THEN NOW() ELSE reviewed_at END,
                  paid_at=CASE WHEN $1::text='paga' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
                  paid_by_identity=CASE WHEN $1::text='paga' THEN $4::uuid ELSE paid_by_identity END,
                  notes=COALESCE($5::text,notes),
                  is_auto_paid=false,
                  updated_at=NOW()
            WHERE id=$6 RETURNING *`,
          [nextStatus, amount.value, revisionReason.value, sess.identityId||null, notes.value, id]
        );
        await client.query(
          `INSERT INTO fin_commission_provision_history (provision_id, previous_status, next_status, previous_amount, next_amount, changed_by_identity, reason, is_auto_paid_attempt)
           VALUES ($1,$2,$3,$4,$5,$6,$7,false)`,
          [id, previous.status, rows[0].status, previous.amount_cents, rows[0].amount_cents, sess.identityId||null, reason]
        );
        await auditLog({
          action: nextStatus === 'paga' ? 'fin_commission_provision_pay' : 'fin_commission_provision_review',
          actor: sess.identityId||'unknown',
          target: id,
          meta:{ previous_status: previous.status, next_status: rows[0].status, reason, is_auto_paid:false, manual_payment_confirmation: nextStatus === 'paga' },
          client,
        });
        await client.query('COMMIT');
        return send(res, 200, { provision: rows[0], note:'registro_manual_de_baixa_sem_pagamento_automatico_nem_gateway_real' });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        return dbFailure(res, e, { duplicate:'duplicate_provision', invalid:'invalid_provision' });
      } finally { client.release(); }
    }
    return send(res, 405, {error:'method_not_allowed'});
  };

  const handleCommissionProvisionHistory = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res, 405, {error:'method_not_allowed'});
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const provision_id = url.searchParams.get('provision_id');
    if (provision_id && !isUuid(provision_id)) return send(res, 400, {error:'invalid_provision_id'});
    let q = `SELECT * FROM fin_commission_provision_history WHERE 1=1`; const params=[]; let idx=1;
    if (provision_id) { q+=` AND provision_id=$${idx++}`; params.push(provision_id); }
    q+=` ORDER BY created_at DESC LIMIT 200`;
    try { const { rows } = await pool.query(q, params); return send(res, 200, { history: rows }); }
    catch { return send(res, 500, {error:'internal'}); }
  };

  return {
    handleBudgets,
    handleBudgetHistory,
    handleBudgetScenarios,
    handleExports,
    handleExportDownload,
    handleExportLogs,
    handleClosures,
    handleReportVersions,
    handleCommissionProvisions,
    handleCommissionProvisionHistory,
  };
}
