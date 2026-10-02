// ADM-01..12 — painel funcional do Marcelo.
//
// Regras desta camada (todas decididas no servidor, nunca no navegador):
//
//  * Autorização e escopo são resolvidos aqui: `marcelo`/`admin` leem e
//    decidem; `ti` é estritamente somente leitura; qualquer outro papel e o
//    anônimo são negados antes de qualquer consulta.
//  * Indicador é SEMPRE calculado a partir de registro canônico, com período,
//    fonte e data-base explícitos na resposta. Falha de leitura NUNCA vira
//    zero nem lista vazia: o indicador volta `indisponivel` com valor nulo e o
//    detalhamento responde 503.
//  * Todo indicador tem detalhamento (`drilldown`) que devolve os registros
//    reais e o caminho canônico de cada um; o registro é lido pela mesma
//    autorização, com projeção de colunas (nenhum dado sensível a mais).
//  * Escrita sensível, histórico e auditoria acontecem na MESMA transação.
//    Auditoria indisponível responde 503 e reverte tudo.
//  * Nada externo: sem PSP, banco, SMTP, emissão, pagamento ou envio real.
//    "Relatório" e "destinatário" são internos e sintéticos.

import { createHash } from 'node:crypto';

export function createAdmPanelApi({ pool, auditLog, sameOrigin, requireSession }) {
  const send = (res, code, body, headers = {}) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  };
  const readJson = async req => new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (error) { reject(error); } });
  });
  const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const isoDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
  const text = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : null;
  const isAuditUnavailable = error => error?.code === '42P01' || /audit_log/i.test(String(error?.message || ''));
  const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

  const WRITE_ROLES = new Set(['admin', 'marcelo']);
  const READ_ROLES = new Set(['admin', 'marcelo', 'ti']);
  const role = sess => String(sess?.role || sess?.userRole || '').toLowerCase();

  // Autorização: anônimo 401, papel indevido 403, TI somente leitura.
  const authorize = async (req, res, { write = false } = {}) => {
    let sess = null;
    try { sess = await requireSession(req); } catch { sess = null; }
    if (!sess) { send(res, 401, { error: 'unauthorized' }); return null; }
    const current = role(sess);
    if (!READ_ROLES.has(current)) { send(res, 403, { error: 'forbidden' }); return null; }
    if (write) {
      if (!sameOrigin(req)) { send(res, 403, { error: 'forbidden_origin' }); return null; }
      if (!WRITE_ROLES.has(current)) { send(res, 403, { error: 'read_only' }); return null; }
      if (!uuid(sess.identityId)) { send(res, 401, { error: 'unauthorized' }); return null; }
    }
    return sess;
  };

  const periodFrom = url => {
    const start = url.searchParams.get('period_start');
    const end = url.searchParams.get('period_end');
    if (start !== null && !isoDate(start)) return { error: 'invalid_period_start' };
    if (end !== null && !isoDate(end)) return { error: 'invalid_period_end' };
    const today = new Date().toISOString().slice(0, 10);
    const resolvedEnd = end || today;
    const resolvedStart = start || `${resolvedEnd.slice(0, 4)}-01-01`;
    if (resolvedStart > resolvedEnd) return { error: 'invalid_period_range' };
    return { start: resolvedStart, end: resolvedEnd };
  };

  // ---------------------------------------------------------------------
  // Registro canônico: cada tipo aponta para a tabela real e devolve apenas
  // as colunas necessárias ao painel (ADM-08 "limitar dados" vale aqui também).
  // ---------------------------------------------------------------------
  const RECORD_KINDS = {
    fin_expense: { table: 'fin_expenses', columns: ['id', 'protocol', 'expense_type', 'category', 'description', 'amount_cents', 'status', 'requester_name', 'requester_identity', 'approver_name', 'created_at'], path: '/admin/financeiro' },
    fin_receivable: { table: 'fin_accounts_receivable', columns: ['id', 'protocol', 'competence_date', 'due_date', 'amount_cents', 'amount_paid_cents', 'amount_remaining_cents', 'status', 'contract_id', 'created_at'], path: '/admin/financeiro' },
    fin_payable: { table: 'fin_accounts_payable', columns: ['id', 'protocol', 'competence_date', 'due_date', 'amount_cents', 'status', 'supplier_id', 'created_at'], path: '/admin/financeiro' },
    // ADM-04 "margem por contrato": o registro canônico é o resultado gerencial
    // de FIN-09 (margem calculada no servidor; base incompleta declarada).
    fin_management_result: { table: 'fin_management_results', columns: ['id', 'protocol', 'contract_id', 'competence_date', 'revenue_received_cents', 'costs_cents', 'margin_cents', 'margin_percent', 'is_complete', 'incomplete_reason', 'status', 'created_at'], path: '/admin/financeiro' },
    cli_ticket: { table: 'cli_tickets_v2', columns: ['id', 'protocol', 'title', 'status', 'priority', 'sla_due_at', 'responsible_name', 'created_at'], path: '/admin/clientes' },
    ops_occurrence: { table: 'ops_occurrence_book', columns: ['id', 'protocol', 'title', 'category', 'severity', 'status', 'responsible_name', 'occurred_at'], path: '/admin/operacao' },
    public_lead: { table: 'public_leads', columns: ['id', 'request_kind', 'city', 'property_type', 'status', 'created_at'], path: '/admin/leads' },
    crm_opportunity: { table: 'crm_opportunities', columns: ['id', 'title', 'responsible_name', 'estimated_value', 'next_action', 'next_action_date', 'priority', 'created_at'], path: '/admin/crm' },
    crm_proposal: { table: 'crm_proposals', columns: ['id', 'title', 'status', 'version', 'total_price', 'created_at'], path: '/admin/comercial' },
    crm_implantation: { table: 'crm_contract_implantations', columns: ['id', 'contract_id', 'status', 'started_at', 'created_at'], path: '/admin/contratos' },
    crm_renewal: { table: 'crm_renewals', columns: ['id', 'title', 'status', 'renewal_date', 'previous_value', 'new_value', 'responsible_name', 'created_at'], path: '/admin/contratos' },
    crm_discount_request: { table: 'crm_discount_requests', columns: ['id', 'requested_discount_percent', 'original_price', 'discounted_price', 'status', 'requester_name', 'requester_id', 'created_at'], path: '/admin/comercial' },
  };
  const recordPath = kind => RECORD_KINDS[kind]?.path || null;

  // ---------------------------------------------------------------------
  // Indicadores: cada cartão tem UMA consulta canônica, que serve tanto ao
  // número quanto ao detalhamento. Não existe cartão sem origem nem indicador
  // sem registro por trás.
  // ---------------------------------------------------------------------
  const INDICATORS = [
    {
      code: 'ADM-01.pendencias', requirement: 'ADM-01', label: 'Meu dia — pendências reais', unit: 'count',
      sources: ['fin_expenses', 'cli_tickets_v2', 'ops_occurrence_book'], period_field: 'data de abertura do registro',
      base: `
        SELECT 'fin_expense' AS record_kind, e.id AS record_id, e.protocol AS record_label,
               e.description AS record_detail, 'alta' AS priority, e.requester_name AS responsible,
               e.created_at AS reference_at, e.amount_cents::bigint AS amount_cents
          FROM fin_expenses e
         WHERE e.status = 'pendente' AND e.created_at::date BETWEEN $1 AND $2
        UNION ALL
        SELECT 'cli_ticket', t.id, t.protocol, t.title, t.priority::text, COALESCE(t.responsible_name, 'Sem responsável atribuído'),
               t.created_at, NULL::bigint
          FROM cli_tickets_v2 t
         WHERE t.status IN ('aberto','em_atendimento') AND t.created_at::date BETWEEN $1 AND $2
        UNION ALL
        SELECT 'ops_occurrence', o.id, o.protocol, o.title, o.severity::text, COALESCE(o.responsible_name, 'Sem responsável atribuído'),
               o.occurred_at, NULL::bigint
          FROM ops_occurrence_book o
         WHERE o.status IN ('aberto','em_analise','em_tratamento') AND o.severity IN ('alta','critica')
           AND o.occurred_at::date BETWEEN $1 AND $2`,
    },
    {
      code: 'ADM-02.leads_novos', requirement: 'ADM-02', label: 'Comercial — leads novos', unit: 'count',
      sources: ['public_leads'], period_field: 'data de entrada do lead',
      base: `
        SELECT 'public_lead' AS record_kind, l.id AS record_id, l.city AS record_label,
               l.property_type AS record_detail, 'media' AS priority, 'Comercial' AS responsible,
               l.created_at AS reference_at, NULL::bigint AS amount_cents
          FROM public_leads l
         WHERE l.status = 'new' AND l.created_at::date BETWEEN $1 AND $2`,
    },
    {
      code: 'ADM-02.oportunidades_paradas', requirement: 'ADM-02', label: 'Comercial — oportunidades paradas', unit: 'count',
      sources: ['crm_opportunities', 'crm_contracts'], period_field: 'data de criação da oportunidade',
      base: `
        SELECT 'crm_opportunity' AS record_kind, o.id AS record_id, o.title AS record_label,
               COALESCE(o.next_action, 'Sem próxima ação registrada') AS record_detail, o.priority AS priority,
               COALESCE(o.responsible_name, 'Sem responsável atribuído') AS responsible,
               o.created_at AS reference_at, (o.estimated_value * 100)::bigint AS amount_cents
          FROM crm_opportunities o
         WHERE (o.next_action_date IS NULL OR o.next_action_date::date < $2)
           AND NOT EXISTS (SELECT 1 FROM crm_contracts c WHERE c.opportunity_id = o.id)
           AND o.created_at::date BETWEEN $1 AND $2`,
    },
    {
      code: 'ADM-02.propostas', requirement: 'ADM-02', label: 'Comercial — propostas do período', unit: 'cents',
      sources: ['crm_proposals'], period_field: 'data de criação da proposta',
      base: `
        SELECT 'crm_proposal' AS record_kind, p.id AS record_id, p.title AS record_label,
               p.status::text AS record_detail, 'media' AS priority, COALESCE(p.created_by, 'Comercial') AS responsible,
               p.created_at AS reference_at, (p.total_price * 100)::bigint AS amount_cents
          FROM crm_proposals p
         WHERE p.created_at::date BETWEEN $1 AND $2`,
    },
    {
      code: 'ADM-03.ocorrencias_criticas', requirement: 'ADM-03', label: 'Operação — ocorrências críticas abertas', unit: 'count',
      sources: ['ops_occurrence_book'], period_field: 'data da ocorrência',
      base: `
        SELECT 'ops_occurrence' AS record_kind, o.id AS record_id, o.protocol AS record_label,
               o.title AS record_detail, o.severity::text AS priority,
               COALESCE(o.responsible_name, 'Sem responsável atribuído') AS responsible,
               o.occurred_at AS reference_at, NULL::bigint AS amount_cents
          FROM ops_occurrence_book o
         WHERE o.severity IN ('alta','critica') AND o.status IN ('aberto','em_analise','em_tratamento')
           AND o.occurred_at::date BETWEEN $1 AND $2`,
    },
    {
      code: 'ADM-03.sla_estourado', requirement: 'ADM-03', label: 'Operação — SLA estourado em chamados', unit: 'count',
      sources: ['cli_tickets_v2'], period_field: 'data de abertura do chamado',
      base: `
        SELECT 'cli_ticket' AS record_kind, t.id AS record_id, t.protocol AS record_label,
               t.title AS record_detail, t.priority::text AS priority,
               COALESCE(t.responsible_name, 'Sem responsável atribuído') AS responsible,
               t.created_at AS reference_at, NULL::bigint AS amount_cents
          FROM cli_tickets_v2 t
         WHERE t.sla_due_at IS NOT NULL AND t.sla_due_at < NOW()
           AND t.status IN ('aberto','em_atendimento','aguardando_cliente')
           AND t.created_at::date BETWEEN $1 AND $2`,
    },
    {
      code: 'ADM-03.implantacoes_pendentes', requirement: 'ADM-03', label: 'Operação — implantações em aberto', unit: 'count',
      sources: ['crm_contract_implantations'], period_field: 'data de criação da implantação',
      base: `
        SELECT 'crm_implantation' AS record_kind, i.id AS record_id, i.contract_id::text AS record_label,
               i.status::text AS record_detail, 'media' AS priority, COALESCE(i.created_by, 'Operação') AS responsible,
               i.created_at AS reference_at, NULL::bigint AS amount_cents
          FROM crm_contract_implantations i
         WHERE i.status IN ('planejada','em_andamento') AND i.created_at::date BETWEEN $1 AND $2`,
    },
    {
      code: 'ADM-04.recebiveis_vencidos', requirement: 'ADM-04', label: 'Financeiro — recebíveis vencidos em aberto', unit: 'cents',
      sources: ['fin_accounts_receivable'], period_field: 'vencimento do recebível',
      base: `
        SELECT 'fin_receivable' AS record_kind, r.id AS record_id, r.protocol AS record_label,
               r.status::text AS record_detail, 'alta' AS priority, 'Financeiro' AS responsible,
               r.due_date::timestamptz AS reference_at, r.amount_remaining_cents::bigint AS amount_cents
          FROM fin_accounts_receivable r
         WHERE r.due_date BETWEEN $1 AND $2 AND r.due_date < CURRENT_DATE
           AND r.amount_remaining_cents > 0
           AND r.status IN ('pendente','parcial','vencido','em_disputa','renegociado')`,
    },
    {
      code: 'ADM-04.pagaveis_a_vencer', requirement: 'ADM-04', label: 'Financeiro — pagáveis a vencer no período', unit: 'cents',
      sources: ['fin_accounts_payable'], period_field: 'vencimento do pagável',
      base: `
        SELECT 'fin_payable' AS record_kind, p.id AS record_id, p.protocol AS record_label,
               p.status::text AS record_detail, 'media' AS priority, 'Financeiro' AS responsible,
               p.due_date::timestamptz AS reference_at, p.amount_cents::bigint AS amount_cents
          FROM fin_accounts_payable p
         WHERE p.due_date BETWEEN $1 AND $2 AND p.status IN ('pendente','aprovado','vencido')`,
    },
    {
      // ADM-04 "margem por contrato": o painel não calcula margem — ele expõe o
      // resultado canônico de FIN-09 (fin_management_results), cujo percentual é
      // derivado no banco (computed_margin_percent) e cuja base incompleta é
      // declarada com motivo. Rascunhos e arquivados ficam fora da visão
      // executiva; 'incompleto' entra com sua declaração, nunca com zero.
      code: 'ADM-04.margem_por_contrato', requirement: 'ADM-04', label: 'Financeiro — contratos com margem por competência', unit: 'count',
      sources: ['fin_management_results'], period_field: 'competência do resultado gerencial',
      base: `
        SELECT 'fin_management_result' AS record_kind, m.id AS record_id, m.protocol AS record_label,
               CASE WHEN m.is_complete THEN 'margem calculada no servidor (' || m.margin_percent::text || '%)'
                    ELSE COALESCE(m.incomplete_reason, 'margem incompleta') END AS record_detail,
               CASE WHEN m.is_complete THEN 'media' ELSE 'baixa' END AS priority,
               'Financeiro' AS responsible,
               m.competence_date::timestamptz AS reference_at, m.margin_cents::bigint AS amount_cents
          FROM fin_management_results m
         WHERE m.status IN ('incompleto','em_revisao','aprovado')
           AND m.competence_date::date BETWEEN $1 AND $2`,
    },
    {
      code: 'ADM-05.renovacoes', requirement: 'ADM-05', label: 'Contratos — renovações a tratar', unit: 'count',
      sources: ['crm_renewals'], period_field: 'data prevista de renovação',
      base: `
        SELECT 'crm_renewal' AS record_kind, n.id AS record_id, n.title AS record_label,
               n.status::text AS record_detail, 'alta' AS priority,
               COALESCE(n.responsible_name, 'Sem responsável atribuído') AS responsible,
               COALESCE(n.renewal_date, n.forecast_date)::timestamptz AS reference_at,
               (n.new_value * 100)::bigint AS amount_cents
          FROM crm_renewals n
         WHERE COALESCE(n.renewal_date, n.forecast_date) BETWEEN $1 AND $2
           AND n.status IN ('planejada','em_negociacao','proposta_enviada')`,
    },
    {
      code: 'ADM-06.aprovacoes_pendentes', requirement: 'ADM-06', label: 'Aprovações pendentes (despesas, compras e descontos)', unit: 'cents',
      sources: ['fin_expenses', 'crm_discount_requests'], period_field: 'data da solicitação',
      base: `
        SELECT 'fin_expense' AS record_kind, e.id AS record_id, e.protocol AS record_label,
               e.expense_type::text AS record_detail, 'alta' AS priority, e.requester_name AS responsible,
               e.created_at AS reference_at, e.amount_cents::bigint AS amount_cents
          FROM fin_expenses e
         WHERE e.status = 'pendente' AND e.created_at::date BETWEEN $1 AND $2
        UNION ALL
        SELECT 'crm_discount_request', d.id, COALESCE(d.requester_name, 'Solicitante não informado'),
               'desconto solicitado ' || d.requested_discount_percent::text || '%', 'alta',
               COALESCE(d.requester_name, 'Solicitante não informado'), d.created_at,
               ((d.original_price - d.discounted_price) * 100)::bigint
          FROM crm_discount_requests d
         WHERE d.status IN ('solicitado','em_analise') AND d.created_at::date BETWEEN $1 AND $2`,
    },
    {
      code: 'ADM-12.oportunidades_expansao', requirement: 'ADM-12', label: 'Expansão — oportunidades abertas com valor estimado', unit: 'cents',
      sources: ['crm_opportunities'], period_field: 'data de criação da oportunidade',
      note: 'valor estimado da oportunidade: estimativa comercial registrada, não resultado realizado',
      base: `
        SELECT 'crm_opportunity' AS record_kind, o.id AS record_id, o.title AS record_label,
               COALESCE(o.origin, 'origem não informada') AS record_detail, o.priority AS priority,
               COALESCE(o.responsible_name, 'Sem responsável atribuído') AS responsible,
               o.created_at AS reference_at, (o.estimated_value * 100)::bigint AS amount_cents
          FROM crm_opportunities o
         WHERE o.estimated_value IS NOT NULL AND o.estimated_value > 0
           AND NOT EXISTS (SELECT 1 FROM crm_contracts c WHERE c.opportunity_id = o.id)
           AND o.created_at::date BETWEEN $1 AND $2`,
    },
  ];
  const indicatorByCode = new Map(INDICATORS.map(item => [item.code, item]));

  const describeIndicator = item => ({
    code: item.code,
    requirement: item.requirement,
    label: item.label,
    unit: item.unit,
    source: { tables: item.sources, period_field: item.period_field, kind: 'registro_canonico' },
    note: item.note || null,
    drilldown: { endpoint: '/api/adm/panel/drilldown', param: 'indicator' },
  });

  // ADM-01..06/12 — números calculados; falha de leitura é declarada, não zerada.
  const handleIndicators = async (req, res) => {
    const sess = await authorize(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const period = periodFrom(url);
    if (period.error) return send(res, 400, { error: period.error });
    const asOf = new Date().toISOString();
    const indicators = [];
    for (const item of INDICATORS) {
      const described = { ...describeIndicator(item), period: { start: period.start, end: period.end }, as_of: asOf };
      try {
        const { rows } = await pool.query(
          `SELECT count(*)::int AS record_count, SUM(amount_cents)::bigint AS amount_cents FROM (${item.base}) AS indicator_base`,
          [period.start, period.end],
        );
        const recordCount = rows[0].record_count;
        const amount = rows[0].amount_cents === null ? null : Number(rows[0].amount_cents);
        indicators.push({
          ...described,
          status: 'ok',
          value: { record_count: recordCount, amount_cents: recordCount === 0 ? null : amount },
          empty_reason: recordCount === 0 ? 'sem_registro_canonico_no_periodo' : null,
          unavailable_reason: null,
        });
      } catch {
        // Uma fonte ilegível jamais é apresentada como zero.
        indicators.push({ ...described, status: 'indisponivel', value: null, empty_reason: null, unavailable_reason: 'falha_de_leitura_da_fonte_canonica' });
      }
    }
    return send(res, 200, {
      period: { start: period.start, end: period.end },
      as_of: asOf,
      scope: { role: role(sess), can_decide: WRITE_ROLES.has(role(sess)) },
      indicators,
      unavailable_count: indicators.filter(item => item.status === 'indisponivel').length,
      synthetic: true,
    });
  };

  // Detalhamento de qualquer indicador: lista filtrada de registros reais.
  const handleDrilldown = async (req, res) => {
    const sess = await authorize(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const code = url.searchParams.get('indicator');
    const item = indicatorByCode.get(code || '');
    if (!item) return send(res, 400, { error: 'unknown_indicator' });
    const period = periodFrom(url);
    if (period.error) return send(res, 400, { error: period.error });
    try {
      const { rows } = await pool.query(
        `SELECT * FROM (${item.base}) AS indicator_base ORDER BY reference_at DESC NULLS LAST LIMIT 200`,
        [period.start, period.end],
      );
      return send(res, 200, {
        indicator: describeIndicator(item),
        period: { start: period.start, end: period.end },
        as_of: new Date().toISOString(),
        record_count: rows.length,
        records: rows.map(row => ({
          record_kind: row.record_kind,
          record_id: row.record_id,
          record_label: row.record_label,
          record_detail: row.record_detail,
          priority: row.priority,
          responsible: row.responsible,
          reference_at: row.reference_at,
          amount_cents: row.amount_cents === null ? null : Number(row.amount_cents),
          canonical: { api: `/api/adm/panel/record?kind=${row.record_kind}&id=${row.record_id}`, table: RECORD_KINDS[row.record_kind]?.table || null, path: recordPath(row.record_kind) },
        })),
      });
    } catch {
      // Falha de leitura não é lista vazia.
      return send(res, 503, { error: 'drilldown_source_unavailable' });
    }
  };

  // Registro canônico real por trás do cartão.
  const handleRecord = async (req, res) => {
    const sess = await authorize(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const kind = url.searchParams.get('kind');
    const id = url.searchParams.get('id');
    const definition = RECORD_KINDS[kind || ''];
    if (!definition) return send(res, 400, { error: 'unknown_record_kind' });
    if (!uuid(id)) return send(res, 400, { error: 'invalid_id' });
    try {
      const { rows } = await pool.query(`SELECT ${definition.columns.join(',')} FROM ${definition.table} WHERE id=$1`, [id]);
      if (!rows.length) return send(res, 404, { error: 'not_found' });
      return send(res, 200, {
        record_kind: kind,
        source_table: definition.table,
        canonical_path: definition.path,
        projected_columns: definition.columns,
        record: rows[0],
        as_of: new Date().toISOString(),
      });
    } catch {
      return send(res, 503, { error: 'record_source_unavailable' });
    }
  };

  // ---------------------------------------------------------------------
  // ADM-06 — decisão unificada sobre o registro canônico de origem.
  // ---------------------------------------------------------------------
  const decisionFailure = (res, error) => {
    if (isAuditUnavailable(error)) return send(res, 503, { error: 'audit_unavailable' });
    if (error?.code === '23505') return send(res, 409, { error: 'duplicate_decision' });
    if (error?.code === '23514') {
      const message = String(error?.message || '');
      if (message.includes('fin_expense_approval_authority_exceeded')) return send(res, 403, { error: 'approval_authority_exceeded' });
      if (message.includes('fin_expense_segregation_required') || message.includes('adm_panel_decision_segregation')) return send(res, 403, { error: 'requester_cannot_decide' });
      return send(res, 400, { error: 'invalid_decision' });
    }
    console.error('ADM_PANEL_DECISION_FAILED', error?.code || '', String(error?.message || error).slice(0, 300));
    return send(res, 500, { error: 'internal' });
  };

  const handleDecisions = async (req, res) => {
    if (req.method === 'GET') {
      const sess = await authorize(req, res); if (!sess) return;
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const sourceId = url.searchParams.get('source_id');
      if (sourceId !== null && !uuid(sourceId)) return send(res, 400, { error: 'invalid_source_id' });
      try {
        const { rows } = await pool.query(
          `SELECT * FROM adm_panel_decisions${sourceId ? ' WHERE source_id=$1' : ''} ORDER BY created_at DESC LIMIT 200`,
          sourceId ? [sourceId] : [],
        );
        return send(res, 200, { decisions: rows });
      } catch { return send(res, 503, { error: 'decision_source_unavailable' }); }
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
    const sess = await authorize(req, res, { write: true }); if (!sess) return;
    let body; try { body = await readJson(req); } catch { return send(res, 400, { error: 'invalid_json' }); }
    const actor = sess.identityId;
    const sourceKind = body.source_kind;
    const sourceId = body.source_id;
    const decision = body.decision;
    const reason = text(body.reason, 10, 1000);
    const idempotencyKey = text(body.idempotency_key, 8, 200);
    if (!['fin_expense', 'crm_discount_request'].includes(sourceKind)) return send(res, 400, { error: 'invalid_source_kind' });
    if (!uuid(sourceId)) return send(res, 400, { error: 'invalid_source_id' });
    if (!['aprovada', 'rejeitada'].includes(decision)) return send(res, 400, { error: 'invalid_decision' });
    if (!reason) return send(res, 400, { error: 'reason_10_1000_required' });
    if (!idempotencyKey) return send(res, 400, { error: 'idempotency_key_8_200_required' });
    const requestFingerprint = fingerprint({ sourceKind, sourceId, decision, reason });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Concorrência: a chave serializa os retries simultâneos do mesmo pedido.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [idempotencyKey]);
      const replay = await client.query('SELECT * FROM adm_panel_decisions WHERE idempotency_key=$1', [idempotencyKey]);
      if (replay.rows.length) {
        const existing = replay.rows[0];
        await client.query('COMMIT');
        if (existing.request_fingerprint !== requestFingerprint) return send(res, 409, { error: 'idempotency_key_conflict' });
        return send(res, 200, { decision: existing, idempotent_replay: true });
      }

      const authorityRow = await client.query(
        'SELECT max_amount_cents, allow_self_approval FROM fin_expense_approval_authorities WHERE identity_id=$1 AND is_active=true FOR UPDATE',
        [actor],
      );
      const authority = authorityRow.rows[0] || null;

      let amountCents = 0;
      let requesterIdentity = null;
      let previousStatus = null;
      let nextStatus = null;

      if (sourceKind === 'fin_expense') {
        const found = await client.query('SELECT * FROM fin_expenses WHERE id=$1 FOR UPDATE', [sourceId]);
        if (!found.rows.length) { await client.query('ROLLBACK'); return send(res, 404, { error: 'source_not_found' }); }
        const expense = found.rows[0];
        if (expense.status !== 'pendente') { await client.query('ROLLBACK'); return send(res, 409, { error: 'source_not_pending' }); }
        amountCents = Number(expense.amount_cents);
        requesterIdentity = expense.requester_identity;
        previousStatus = expense.status;
        nextStatus = decision === 'aprovada' ? 'aprovado' : 'rejeitado';
        if (requesterIdentity === actor && !(authority && authority.allow_self_approval === true)) { await client.query('ROLLBACK'); return send(res, 403, { error: 'requester_cannot_decide' }); }
        if (decision === 'aprovada' && (!authority || amountCents > Number(authority.max_amount_cents))) { await client.query('ROLLBACK'); return send(res, 403, { error: 'approval_authority_exceeded' }); }
        const identity = await client.query('SELECT display_name FROM auth_identities WHERE id=$1', [actor]);
        const approverName = identity.rows[0]?.display_name || 'Aprovador autenticado';
        await client.query(
          `UPDATE fin_expenses SET status=$1::fin_expense_status, approver_name=$2, approver_identity=$3::uuid,
             approved_at=CASE WHEN $1::text='aprovado' THEN NOW() ELSE NULL END,
             approved_by_identity=CASE WHEN $1::text='aprovado' THEN $3::uuid ELSE NULL END,
             approval_limit_cents=CASE WHEN $1::text='aprovado' THEN $6::bigint ELSE NULL END,
             rejection_reason=CASE WHEN $1::text='rejeitado' THEN $4::text ELSE NULL END,
             is_segregated=true, segregation_checked=true
           WHERE id=$5::uuid`,
          [nextStatus, approverName, actor, decision === 'rejeitada' ? reason : null, sourceId,
           decision === 'aprovada' ? Number(authority.max_amount_cents) : null],
        );
        await client.query(
          `INSERT INTO fin_expense_history (expense_id,previous_status,next_status,previous_amount,next_amount,changed_by_identity,reason,is_segregation_verified,authority_limit_cents,requester_identity,approver_identity)
           VALUES ($1,$2,$3,$4,$4,$5,$6,true,$7,$8,$5)`,
          [sourceId, previousStatus, nextStatus, amountCents, actor, reason, decision === 'aprovada' ? Number(authority.max_amount_cents) : null, requesterIdentity],
        );
      } else {
        const found = await client.query('SELECT * FROM crm_discount_requests WHERE id=$1 FOR UPDATE', [sourceId]);
        if (!found.rows.length) { await client.query('ROLLBACK'); return send(res, 404, { error: 'source_not_found' }); }
        const request = found.rows[0];
        if (!['solicitado', 'em_analise'].includes(request.status)) { await client.query('ROLLBACK'); return send(res, 409, { error: 'source_not_pending' }); }
        amountCents = Math.round((Number(request.original_price) - Number(request.discounted_price)) * 100);
        requesterIdentity = request.requester_id;
        previousStatus = request.status;
        nextStatus = decision === 'aprovada' ? 'aprovado' : 'rejeitado';
        if (requesterIdentity === actor && !(authority && authority.allow_self_approval === true)) { await client.query('ROLLBACK'); return send(res, 403, { error: 'requester_cannot_decide' }); }
        if (decision === 'aprovada' && (!authority || amountCents > Number(authority.max_amount_cents))) { await client.query('ROLLBACK'); return send(res, 403, { error: 'approval_authority_exceeded' }); }
        const identity = await client.query('SELECT display_name FROM auth_identities WHERE id=$1', [actor]);
        await client.query(
          `UPDATE crm_discount_requests SET status=$1::crm_discount_request_status, approver_id=$2::uuid, approver_name=$3::text, approver_role=$4::text,
             approved_at=CASE WHEN $1::text='aprovado' THEN NOW() ELSE NULL END,
             rejected_at=CASE WHEN $1::text='rejeitado' THEN NOW() ELSE NULL END,
             rejection_reason=CASE WHEN $1::text='rejeitado' THEN $5::text ELSE NULL END
           WHERE id=$6::uuid`,
          [nextStatus, actor, identity.rows[0]?.display_name || 'Aprovador autenticado', role(sess), decision === 'rejeitada' ? reason : null, sourceId],
        );
      }

      const appliedLimit = decision === 'aprovada' ? Number(authority.max_amount_cents) : null;
      const inserted = await client.query(
        `INSERT INTO adm_panel_decisions (source_kind,source_id,decision,reason,amount_cents,authority_limit_cents,requester_identity,decided_by_identity,idempotency_key,request_fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [sourceKind, sourceId, decision, reason, amountCents, appliedLimit, requesterIdentity, actor, idempotencyKey, requestFingerprint],
      );
      await client.query(
        `INSERT INTO adm_panel_decision_history (decision_id,source_kind,source_id,previous_status,next_status,amount_cents,authority_limit_cents,changed_by_identity,reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [inserted.rows[0].id, sourceKind, sourceId, previousStatus, nextStatus, amountCents, appliedLimit, actor, reason],
      );
      await auditLog({
        action: decision === 'aprovada' ? 'adm_panel_decision_approve' : 'adm_panel_decision_reject',
        actor, target: sourceId,
        meta: { source_kind: sourceKind, amount_cents: amountCents, authority_limit_cents: appliedLimit, idempotency_key: idempotencyKey },
        client,
      });
      await client.query('COMMIT');
      return send(res, 201, { decision: inserted.rows[0], source_status: nextStatus });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      return decisionFailure(res, error);
    } finally { client.release(); }
  };

  // ---------------------------------------------------------------------
  // ADM-07 — busca/favoritos/filtros/atalhos sempre no escopo da sessão.
  // ---------------------------------------------------------------------
  const handleWorkspace = async (req, res) => {
    if (req.method === 'GET') {
      const sess = await authorize(req, res); if (!sess) return;
      const owner = uuid(sess.identityId) ? sess.identityId : null;
      if (!owner) return send(res, 401, { error: 'unauthorized' });
      try {
        const [favorites, filters, shortcuts] = await Promise.all([
          pool.query('SELECT * FROM adm_search_favorites WHERE user_identity=$1 ORDER BY created_at DESC LIMIT 200', [owner]),
          pool.query('SELECT * FROM adm_saved_filters WHERE user_identity=$1 ORDER BY created_at DESC LIMIT 200', [owner]),
          pool.query('SELECT * FROM adm_shortcuts WHERE user_identity=$1 ORDER BY created_at DESC LIMIT 200', [owner]),
        ]);
        return send(res, 200, { scope_identity: owner, favorites: favorites.rows, filters: filters.rows, shortcuts: shortcuts.rows });
      } catch { return send(res, 503, { error: 'workspace_source_unavailable' }); }
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
    const sess = await authorize(req, res, { write: true }); if (!sess) return;
    let body; try { body = await readJson(req); } catch { return send(res, 400, { error: 'invalid_json' }); }
    const actor = sess.identityId;
    const kind = body.kind;
    if (!['favorite', 'filter', 'shortcut'].includes(kind)) return send(res, 400, { error: 'invalid_kind' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let row;
      if (kind === 'favorite') {
        const query = text(body.query, 2, 500);
        const moduleName = text(body.module, 2, 100);
        if (!query || !moduleName) { await client.query('ROLLBACK'); return send(res, 400, { error: 'query_and_module_required' }); }
        row = (await client.query(
          `INSERT INTO adm_search_favorites (user_identity,query,module,filters,is_favorite) VALUES ($1,$2,$3,$4,true)
           ON CONFLICT (user_identity,query,module) DO UPDATE SET filters=EXCLUDED.filters, is_favorite=true RETURNING *`,
          [actor, query, moduleName, JSON.stringify(body.filters || {})],
        )).rows[0];
      } else if (kind === 'filter') {
        const filterName = text(body.filter_name, 3, 200);
        const moduleName = text(body.module, 2, 100);
        if (!filterName || !moduleName) { await client.query('ROLLBACK'); return send(res, 400, { error: 'filter_name_and_module_required' }); }
        row = (await client.query(
          `INSERT INTO adm_saved_filters (user_identity,filter_name,module,filters,is_shared) VALUES ($1,$2,$3,$4,false)
           ON CONFLICT (user_identity,filter_name,module) DO UPDATE SET filters=EXCLUDED.filters RETURNING *`,
          [actor, filterName, moduleName, JSON.stringify(body.filters || {})],
        )).rows[0];
      } else {
        const shortcutName = text(body.shortcut_name, 3, 200);
        const context = text(body.context, 3, 500);
        const target = text(body.url, 5, 500);
        if (!shortcutName || !context || !target) { await client.query('ROLLBACK'); return send(res, 400, { error: 'shortcut_fields_required' }); }
        if (!target.startsWith('/admin/')) { await client.query('ROLLBACK'); return send(res, 400, { error: 'shortcut_url_must_be_internal' }); }
        row = (await client.query(
          `INSERT INTO adm_shortcuts (user_identity,shortcut_name,context,url,is_favorite) VALUES ($1,$2,$3,$4,true)
           ON CONFLICT (user_identity,shortcut_name) DO UPDATE SET context=EXCLUDED.context, url=EXCLUDED.url RETURNING *`,
          [actor, shortcutName, context, target],
        )).rows[0];
      }
      await auditLog({ action: `adm_panel_workspace_${kind}`, actor, target: row.id, meta: { kind }, client });
      await client.query('COMMIT');
      return send(res, 201, { kind, item: row, scope_identity: actor });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      if (isAuditUnavailable(error)) return send(res, 503, { error: 'audit_unavailable' });
      return send(res, 500, { error: 'internal' });
    } finally { client.release(); }
  };

  // ---------------------------------------------------------------------
  // ADM-08 — relatório gerado do indicador canônico, limitado e auditado.
  // Nenhum envio externo: o destinatário é uma identidade interna autorizada.
  // ---------------------------------------------------------------------
  const REPORT_LIMITED_FIELDS = ['record_count', 'amount_cents', 'period_start', 'period_end', 'indicator_code'];
  const generateProtocol = () => {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    return `REL-ADM-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  };

  const handleReports = async (req, res) => {
    if (req.method === 'GET') {
      const sess = await authorize(req, res); if (!sess) return;
      try {
        const { rows } = await pool.query('SELECT * FROM adm_reports WHERE idempotency_key IS NOT NULL ORDER BY created_at DESC LIMIT 200');
        return send(res, 200, { reports: rows });
      } catch { return send(res, 503, { error: 'report_source_unavailable' }); }
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
    const sess = await authorize(req, res, { write: true }); if (!sess) return;
    let body; try { body = await readJson(req); } catch { return send(res, 400, { error: 'invalid_json' }); }
    const actor = sess.identityId;
    const indicatorCode = body.indicator_code;
    const item = indicatorByCode.get(indicatorCode || '');
    if (!item) return send(res, 400, { error: 'unknown_indicator' });
    const title = text(body.title, 5, 200);
    if (!title) return send(res, 400, { error: 'title_5_200_required' });
    const idempotencyKey = text(body.idempotency_key, 8, 200);
    if (!idempotencyKey) return send(res, 400, { error: 'idempotency_key_8_200_required' });
    if (!isoDate(body.period_start) || !isoDate(body.period_end)) return send(res, 400, { error: 'invalid_period' });
    if (body.period_start > body.period_end) return send(res, 400, { error: 'invalid_period_range' });
    const recipient = body.recipient_identity ?? null;
    if (recipient !== null && !uuid(recipient)) return send(res, 400, { error: 'invalid_recipient_identity' });
    const requestFingerprint = fingerprint({ indicatorCode, title, start: body.period_start, end: body.period_end, recipient });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [idempotencyKey]);
      const replay = await client.query('SELECT * FROM adm_reports WHERE idempotency_key=$1', [idempotencyKey]);
      if (replay.rows.length) {
        const existing = replay.rows[0];
        await client.query('COMMIT');
        if (existing.request_fingerprint !== requestFingerprint) return send(res, 409, { error: 'idempotency_key_conflict' });
        return send(res, 200, { report: existing, idempotent_replay: true });
      }
      if (recipient) {
        const allowed = await client.query(
          `SELECT p.role FROM auth_staff_profiles p JOIN auth_identities i ON i.id = p.identity_id
            WHERE p.identity_id=$1 AND i.status='active'`,
          [recipient],
        );
        if (!allowed.rows.length || !READ_ROLES.has(String(allowed.rows[0].role || '').toLowerCase())) {
          await client.query('ROLLBACK');
          return send(res, 403, { error: 'recipient_not_authorized' });
        }
      }
      // Totais vêm do mesmo cálculo canônico do cartão; nada é digitado.
      let totals;
      try {
        const computed = await client.query(
          `SELECT count(*)::int AS record_count, SUM(amount_cents)::bigint AS amount_cents FROM (${item.base}) AS indicator_base`,
          [body.period_start, body.period_end],
        );
        totals = {
          indicator_code: item.code,
          record_count: computed.rows[0].record_count,
          amount_cents: computed.rows[0].amount_cents === null ? null : Number(computed.rows[0].amount_cents),
          period_start: body.period_start,
          period_end: body.period_end,
        };
      } catch {
        await client.query('ROLLBACK');
        return send(res, 503, { error: 'report_indicator_source_unavailable' });
      }
      const asOf = new Date().toISOString();
      const inserted = await client.query(
        `INSERT INTO adm_reports (protocol,report_type,title,period_start,period_end,filters,totals,status,generated_at,is_limited,limited_fields,created_by_identity,idempotency_key,request_fingerprint,recipient_identity,source_tables,as_of)
         VALUES ($1,'outro',$2,$3,$4,$5,$6,'gerado',NOW(),true,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [generateProtocol(), title, body.period_start, body.period_end, JSON.stringify({ indicator_code: item.code }), JSON.stringify(totals), REPORT_LIMITED_FIELDS, actor, idempotencyKey, requestFingerprint, recipient, item.sources, asOf],
      );
      await client.query(
        `INSERT INTO adm_report_logs (report_id,action,actor_identity,meta) VALUES ($1,'report_generate',$2,$3)`,
        [inserted.rows[0].id, actor, JSON.stringify({ indicator_code: item.code, recipient_identity: recipient })],
      );
      await auditLog({ action: 'adm_panel_report_generate', actor, target: inserted.rows[0].id, meta: { indicator_code: item.code, idempotency_key: idempotencyKey, recipient_identity: recipient }, client });
      await client.query('COMMIT');
      return send(res, 201, { report: inserted.rows[0] });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      if (isAuditUnavailable(error)) return send(res, 503, { error: 'audit_unavailable' });
      if (error?.code === '23505') return send(res, 409, { error: 'duplicate_idempotency_key' });
      return send(res, 500, { error: 'internal' });
    } finally { client.release(); }
  };

  const handleReportDownload = async (req, res) => {
    const sess = await authorize(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const id = url.searchParams.get('id');
    if (!uuid(id)) return send(res, 400, { error: 'invalid_id' });
    const actor = uuid(sess.identityId) ? sess.identityId : null;
    if (!actor) return send(res, 401, { error: 'unauthorized' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM adm_reports WHERE id=$1', [id]);
      if (!found.rows.length) { await client.query('ROLLBACK'); return send(res, 404, { error: 'not_found' }); }
      const report = found.rows[0];
      if (report.status !== 'gerado') { await client.query('ROLLBACK'); return send(res, 409, { error: 'report_not_generated' }); }
      if (report.created_by_identity !== actor && report.recipient_identity !== actor) {
        await client.query('ROLLBACK');
        return send(res, 403, { error: 'recipient_not_authorized' });
      }
      await client.query(
        `INSERT INTO adm_report_logs (report_id,action,actor_identity,meta) VALUES ($1,'report_download',$2,$3)`,
        [id, actor, JSON.stringify({ limited_fields: report.limited_fields })],
      );
      await auditLog({ action: 'adm_panel_report_download', actor, target: id, meta: { protocol: report.protocol }, client });
      await client.query('COMMIT');
      return send(res, 200, {
        protocol: report.protocol,
        title: report.title,
        period: { start: report.period_start, end: report.period_end },
        as_of: report.as_of,
        source_tables: report.source_tables,
        is_limited: report.is_limited,
        limited_fields: report.limited_fields,
        totals: report.totals,
        synthetic: true,
      });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      if (isAuditUnavailable(error)) return send(res, 503, { error: 'audit_unavailable' });
      return send(res, 500, { error: 'internal' });
    } finally { client.release(); }
  };

  // ---------------------------------------------------------------------
  // ADM-09 — configuração de negócio versionada: nova versão preserva a
  // anterior, exige motivo e grava histórico + auditoria na mesma transação.
  // ---------------------------------------------------------------------
  const handleBusinessConfigs = async (req, res) => {
    if (req.method === 'GET') {
      const sess = await authorize(req, res); if (!sess) return;
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const configKey = url.searchParams.get('config_key');
      try {
        const { rows } = await pool.query(
          `SELECT * FROM adm_business_configs${configKey ? ' WHERE config_key=$1' : ''} ORDER BY config_key ASC, version DESC LIMIT 200`,
          configKey ? [configKey] : [],
        );
        return send(res, 200, { configs: rows });
      } catch { return send(res, 503, { error: 'config_source_unavailable' }); }
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
    const sess = await authorize(req, res, { write: true }); if (!sess) return;
    let body; try { body = await readJson(req); } catch { return send(res, 400, { error: 'invalid_json' }); }
    const actor = sess.identityId;
    const configKey = text(body.config_key, 3, 200);
    const category = text(body.category, 3, 100);
    const reason = text(body.reason, 10, 1000);
    if (!configKey) return send(res, 400, { error: 'config_key_3_200_required' });
    if (!category) return send(res, 400, { error: 'category_3_100_required' });
    if (!reason) return send(res, 400, { error: 'reason_10_1000_required' });
    if (body.config_value === null || typeof body.config_value !== 'object' || Array.isArray(body.config_value)) return send(res, 400, { error: 'config_value_object_required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`adm-config-${configKey}`]);
      const current = await client.query('SELECT * FROM adm_business_configs WHERE config_key=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE', [configKey]);
      const previous = current.rows[0] || null;
      const nextVersion = previous ? previous.version + 1 : 1;
      if (previous) await client.query('UPDATE adm_business_configs SET is_active=false WHERE id=$1', [previous.id]);
      const inserted = await client.query(
        `INSERT INTO adm_business_configs (config_key,config_value,version,status,description,category,is_active,created_by_identity,supersedes_id)
         VALUES ($1,$2,$3,'aprovado',$4,$5,true,$6,$7) RETURNING *`,
        [configKey, JSON.stringify(body.config_value), nextVersion, text(body.description, 10, 1000), category, actor, previous ? previous.id : null],
      );
      await client.query(
        `INSERT INTO adm_business_config_history (config_id,config_key,previous_version,next_version,previous_value,next_value,changed_by_identity,reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [inserted.rows[0].id, configKey, previous ? previous.version : null, nextVersion, previous ? previous.config_value : null, JSON.stringify(body.config_value), actor, reason],
      );
      await auditLog({ action: 'adm_panel_business_config_version', actor, target: inserted.rows[0].id, meta: { config_key: configKey, version: nextVersion }, client });
      await client.query('COMMIT');
      return send(res, 201, { config: inserted.rows[0], previous_version: previous ? previous.version : null });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      if (isAuditUnavailable(error)) return send(res, 503, { error: 'audit_unavailable' });
      if (error?.code === '23505') return send(res, 409, { error: 'duplicate_config_version' });
      return send(res, 500, { error: 'internal' });
    } finally { client.release(); }
  };

  // ---------------------------------------------------------------------
  // ADM-10 — meta (estimativa aprovada) x realizado (registro canônico).
  // Os dois nunca são somados nem apresentados como o mesmo número.
  // ---------------------------------------------------------------------
  const handleGoals = async (req, res) => {
    const sess = await authorize(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const period = periodFrom(url);
    if (period.error) return send(res, 400, { error: period.error });
    let goals;
    try {
      goals = (await pool.query(
        `SELECT id,title,period_start,period_end,target_value,target_type,status,responsible_name
           FROM crm_goals WHERE status IN ('ativo','atingida','nao_atingida') AND period_start <= $2 AND period_end >= $1
           ORDER BY period_start DESC LIMIT 200`,
        [period.start, period.end],
      )).rows;
    } catch { return send(res, 503, { error: 'goal_source_unavailable' }); }
    const asOf = new Date().toISOString();
    const result = [];
    for (const goal of goals) {
      let realized = null;
      let unavailableReason = null;
      try {
        const computed = await pool.query(
          `SELECT count(*)::int AS record_count, SUM(total_price)::numeric AS realized_value
             FROM crm_contracts WHERE status='ativo' AND created_at::date BETWEEN $1 AND $2`,
          [goal.period_start.toISOString ? goal.period_start.toISOString().slice(0, 10) : goal.period_start, goal.period_end.toISOString ? goal.period_end.toISOString().slice(0, 10) : goal.period_end],
        );
        realized = {
          value: computed.rows[0].record_count === 0 ? null : Number(computed.rows[0].realized_value),
          record_count: computed.rows[0].record_count,
          source: 'crm_contracts.total_price',
          as_of: asOf,
          empty_reason: computed.rows[0].record_count === 0 ? 'sem_contrato_canonico_no_periodo' : null,
        };
      } catch { unavailableReason = 'falha_de_leitura_da_fonte_canonica'; }
      result.push({
        goal_id: goal.id,
        title: goal.title,
        period: { start: goal.period_start, end: goal.period_end },
        target: { value: Number(goal.target_value), kind: 'estimativa', is_estimate: true, source: 'crm_goals.target_value' },
        realized: unavailableReason ? null : realized,
        realized_status: unavailableReason ? 'indisponivel' : 'ok',
        unavailable_reason: unavailableReason,
        comparison_note: 'meta é estimativa aprovada; realizado é soma de contratos canônicos. Os dois nunca são apresentados como o mesmo número.',
      });
    }
    return send(res, 200, { period: { start: period.start, end: period.end }, as_of: asOf, goals: result });
  };

  // ---------------------------------------------------------------------
  // ADM-11 — diário de decisões CON-11 conforme permissão, com acesso
  // registrado na mesma transação da auditoria (fail-closed).
  // ---------------------------------------------------------------------
  const RESTRICTED_VISIBILITY = new Set(['restrito', 'diretoria']);
  const handleDecisionDiary = async (req, res) => {
    const sess = await authorize(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
    const actor = uuid(sess.identityId) ? sess.identityId : null;
    if (!actor) return send(res, 401, { error: 'unauthorized' });
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const contractId = url.searchParams.get('contract_id');
    if (contractId !== null && !uuid(contractId)) return send(res, 400, { error: 'invalid_contract_id' });
    const canSeeRestricted = WRITE_ROLES.has(role(sess));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const params = [];
      let where = 'WHERE 1=1';
      if (contractId) { params.push(contractId); where += ` AND contract_id=$${params.length}`; }
      if (!canSeeRestricted) where += ` AND visibility NOT IN ('restrito','diretoria')`;
      const { rows } = await client.query(
        `SELECT id,contract_id,title,decision,category,visibility,responsible_name,decision_date,created_at
           FROM crm_management_diary ${where} ORDER BY decision_date DESC LIMIT 200`,
        params,
      );
      for (const row of rows) {
        await client.query(
          `INSERT INTO adm_management_diary_access (diary_id,accessor_identity,access_type) VALUES ($1,$2,'painel_marcelo_leitura')`,
          [row.id, actor],
        );
      }
      await auditLog({ action: 'adm_panel_diary_read', actor, target: contractId || null, meta: { entries: rows.length, restricted_visible: canSeeRestricted }, client });
      await client.query('COMMIT');
      return send(res, 200, {
        entries: rows,
        restricted_visible: canSeeRestricted,
        hidden_visibilities: canSeeRestricted ? [] : [...RESTRICTED_VISIBILITY],
        as_of: new Date().toISOString(),
      });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      if (isAuditUnavailable(error)) return send(res, 503, { error: 'audit_unavailable' });
      return send(res, 503, { error: 'diary_source_unavailable' });
    } finally { client.release(); }
  };

  // ---------------------------------------------------------------------
  // ADM-12 — análises alimentadas pelos módulos reais. Nenhum número é
  // inventado: cada bloco declara fonte e data-base, e a ausência de análise
  // registrada é declarada como ausência, não como resultado.
  // ---------------------------------------------------------------------
  const EXPANSION_BLOCKS = [
    { key: 'oportunidades_abertas', label: 'Oportunidades abertas com valor estimado', sources: ['crm_opportunities'], sql: `SELECT count(*)::int AS record_count, SUM(estimated_value)::numeric AS total_value FROM crm_opportunities o WHERE o.estimated_value IS NOT NULL AND o.created_at::date BETWEEN $1 AND $2 AND NOT EXISTS (SELECT 1 FROM crm_contracts c WHERE c.opportunity_id=o.id)`, kind: 'estimativa' },
    { key: 'contratos_ativos', label: 'Contratos ativos no período', sources: ['crm_contracts'], sql: `SELECT count(*)::int AS record_count, SUM(total_price)::numeric AS total_value FROM crm_contracts WHERE status='ativo' AND created_at::date BETWEEN $1 AND $2`, kind: 'realizado' },
    { key: 'qualidade_ocorrencias', label: 'Ocorrências operacionais registradas', sources: ['ops_occurrence_book'], sql: `SELECT count(*)::int AS record_count, NULL::numeric AS total_value FROM ops_occurrence_book WHERE occurred_at::date BETWEEN $1 AND $2`, kind: 'realizado' },
  ];

  const handleExpansion = async (req, res) => {
    const sess = await authorize(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const period = periodFrom(url);
    if (period.error) return send(res, 400, { error: period.error });
    const asOf = new Date().toISOString();
    const blocks = [];
    for (const block of EXPANSION_BLOCKS) {
      try {
        const { rows } = await pool.query(block.sql, [period.start, period.end]);
        const recordCount = rows[0].record_count;
        blocks.push({
          key: block.key, label: block.label, kind: block.kind, source: { tables: block.sources }, as_of: asOf,
          status: 'ok',
          value: { record_count: recordCount, total_value: recordCount === 0 || rows[0].total_value === null ? null : Number(rows[0].total_value) },
          empty_reason: recordCount === 0 ? 'sem_registro_canonico_no_periodo' : null,
          unavailable_reason: null,
        });
      } catch {
        blocks.push({ key: block.key, label: block.label, kind: block.kind, source: { tables: block.sources }, as_of: asOf, status: 'indisponivel', value: null, empty_reason: null, unavailable_reason: 'falha_de_leitura_da_fonte_canonica' });
      }
    }
    let analyses = [];
    let analysesStatus = 'ok';
    try {
      analyses = (await pool.query('SELECT id,title,analysis_type,is_estimate,is_real_data,source_tables,computed_as_of,created_at FROM adm_expansion_analyses ORDER BY created_at DESC LIMIT 100')).rows;
    } catch { analysesStatus = 'indisponivel'; }
    return send(res, 200, {
      period: { start: period.start, end: period.end },
      as_of: asOf,
      blocks,
      analyses,
      analyses_status: analysesStatus,
      analyses_empty_reason: analysesStatus === 'ok' && analyses.length === 0 ? 'sem_analise_registrada' : null,
      note: 'estimativa e resultado são blocos distintos; nenhum número é digitado no painel.',
    });
  };

  return {
    handleIndicators,
    handleDrilldown,
    handleRecord,
    handleDecisions,
    handleWorkspace,
    handleReports,
    handleReportDownload,
    handleBusinessConfigs,
    handleGoals,
    handleDecisionDiary,
    handleExpansion,
  };
}
