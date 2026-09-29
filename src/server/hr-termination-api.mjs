const TERMINATION_TYPE=['pedido_demissao','dispensa_sem_justa','dispensa_com_justa','termino_contrato','acordo','outro'];
const TERMINATION_STATUS=['planejado','em_andamento','concluido','cancelado'];
const VACATION_PERIOD_STATUS=['aquisitivo','em_concessivo','concedido','vencido','cancelado','arquivado'];
const VACATION_REQUEST_STATUS=['solicitado','em_analise','aprovado','rejeitado','cancelado','concedido'];

function sanitize(v,max=2000){ if(typeof v!=='string') return ''; return v.trim().slice(0,max); }
function uuidRe(){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; }

export function createHrTerminationApi({ pool, auditLog, sameOrigin, requireSession, requireRole, employeeSessionStore }){
  async function handleTerminations(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const employee_id=url.searchParams.get('employee_id'); const status=url.searchParams.get('status');
      const cond=[]; const params=[]; let i=1;
      if(employee_id && uuidRe().test(employee_id)){ cond.push(`employee_id=$${i++}`); params.push(employee_id); }
      if(status && TERMINATION_STATUS.includes(status)){ cond.push(`status=$${i++}`); params.push(status); }
      let sql='SELECT * FROM hr_terminations';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY termination_date DESC LIMIT 200';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({terminations:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const employee_id=String(data.employee_id||''); const type=String(data.type||'pedido_demissao').toLowerCase();
      const termination_date=String(data.termination_date||''); const last_work_date=data.last_work_date? String(data.last_work_date): null;
      const reason=sanitize(data.reason||'',2000); const responsible_name=sanitize(data.responsible_name||'',200); const notes=sanitize(data.notes||'',2000);
      const cargo=data.cargo? sanitize(data.cargo,100): null;
      if(!uuidRe().test(employee_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_employee_id'})); return; }
      if(!TERMINATION_TYPE.includes(type)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_type'})); return; }
      if(!termination_date){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'termination_date_required'})); return; }
      if(reason.length<10){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'reason_min_10'})); return; }
      const emp=await pool.query('SELECT * FROM hr_employees WHERE id=$1',[employee_id]);
      if(!emp.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'employee_not_found'})); return; }
      // Find checklist for cargo
      let checklist_id=null;
      const cargoSearch=cargo||emp.rows[0].cargo;
      const cl=await pool.query('SELECT id FROM hr_termination_checklists WHERE cargo=$1 AND is_active=true ORDER BY version DESC LIMIT 1',[cargoSearch]);
      if(cl.rows.length) checklist_id=cl.rows[0].id;
      else { const cl2=await pool.query(`SELECT id FROM hr_termination_checklists WHERE cargo='geral' AND is_active=true ORDER BY version DESC LIMIT 1`); if(cl2.rows.length) checklist_id=cl2.rows[0].id; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO hr_terminations (employee_id, checklist_id, type, termination_date, last_work_date, reason, responsible_name, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [employee_id, checklist_id, type, new Date(termination_date).toISOString().slice(0,10), last_work_date? new Date(last_work_date).toISOString().slice(0,10): null, reason, responsible_name||null, notes||null, by, byId]);
      if(checklist_id){
        const items=await pool.query('SELECT id FROM hr_termination_items WHERE checklist_id=$1 ORDER BY order_index',[checklist_id]);
        for(const it of items.rows){
          await pool.query(`INSERT INTO hr_termination_progress (termination_id, item_id) VALUES ($1,$2) ON CONFLICT (termination_id, item_id) DO NOTHING`, [r.rows[0].id, it.id]);
        }
      }
      await auditLog({ action:'hr_termination_create', actor: by, target: r.rows[0].id, meta:{ employee_id, type } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({termination:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase();
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!TERMINATION_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const cur=await pool.query('SELECT * FROM hr_terminations WHERE id=$1',[id]);
      if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      // Check progress if concluido
      if(status==='concluido'){
        const prog=await pool.query(`SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE status='concluido' OR status='nao_aplicavel')::int as done FROM hr_termination_progress WHERE termination_id=$1`, [id]);
        const total=prog.rows[0]?.total||0; const done=prog.rows[0]?.done||0;
        if(total>0 && done<total){
          // Allow but warn? For HR-07, bloqueios claros, but we require all required items concluido
          const reqIncomplete=await pool.query(`SELECT COUNT(*)::int as c FROM hr_termination_progress p JOIN hr_termination_items i ON i.id=p.item_id WHERE p.termination_id=$1 AND i.is_required=true AND p.status NOT IN ('concluido','nao_aplicavel')`, [id]);
          if(reqIncomplete.rows[0]?.c>0){ res.writeHead(409,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'termination_steps_incomplete', required_incomplete:reqIncomplete.rows[0].c, total, done})); return; }
        }
      }
      let sql=`UPDATE hr_terminations SET status=$1, updated_at=now()`; const params=[status]; let idx=2;
      if(status==='concluido'){ sql+=`, completed_at=now()`; }
      sql+=` WHERE id=$${idx} RETURNING *`; params.push(id);
      const r=await pool.query(sql, params);
      if(status==='concluido'){
        // Update employee status to desligado, preserve histórico laboral
        const empCur=await pool.query('SELECT * FROM hr_employees WHERE id=$1',[cur.rows[0].employee_id]);
        if(empCur.rows.length){
          await pool.query(`UPDATE hr_employees SET status='desligado', updated_by=$1, updated_by_id=$2, updated_at=now() WHERE id=$3`, [by, byId, cur.rows[0].employee_id]);
          await pool.query(`INSERT INTO hr_employee_history (employee_id, previous_cargo, next_cargo, previous_status, next_status, effective_date, reason, changed_by, changed_by_id) VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8)`, [cur.rows[0].employee_id, empCur.rows[0].cargo, empCur.rows[0].status, 'desligado', cur.rows[0].termination_date, cur.rows[0].reason||'Desligamento concluído checklist', by, byId]);
        }
        // UPDATE hr_employees dispara a revogação L03 no banco antes da resposta.
        await auditLog({ action:'hr_termination_complete', actor: by, target: id, meta:{ employee_id:cur.rows[0].employee_id } });
      }
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({termination:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleTerminationById(req,res,id){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
    const term=await pool.query('SELECT * FROM hr_terminations WHERE id=$1',[id]);
    if(!term.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
    const progress=await pool.query(`SELECT p.*, i.title, i.category, i.is_required FROM hr_termination_progress p JOIN hr_termination_items i ON i.id=p.item_id WHERE p.termination_id=$1 ORDER BY i.order_index`, [id]);
    res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({termination:term.rows[0], progress:progress.rows}));
  }

  async function handleTerminationProgress(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase(); const notes=data.notes? sanitize(data.notes,1000): null;
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!['pendente','em_andamento','concluido','nao_aplicavel'].includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const by=sess.username||sess.user||'unknown';
      const r=await pool.query(`UPDATE hr_termination_progress SET status=$1, notes=COALESCE($2, notes), completed_at=CASE WHEN $1='concluido' THEN now() ELSE completed_at END, completed_by=$3, updated_at=now() WHERE id=$4 RETURNING *`, [status, notes, by, id]);
      if(!r.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({progress:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleStatusPolicies(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const r=await pool.query('SELECT * FROM hr_status_policies ORDER BY status');
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({policies:r.rows, note:'HR-08 mudança status afastado/suspenso/desligado efeito permissões alocação conforme política sem automatizar sanção trabalhista'})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleVacationPeriods(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const employee_id=url.searchParams.get('employee_id'); const status=url.searchParams.get('status');
      const cond=[]; const params=[]; let i=1;
      if(employee_id && uuidRe().test(employee_id)){ cond.push(`employee_id=$${i++}`); params.push(employee_id); }
      if(status && VACATION_PERIOD_STATUS.includes(status)){ cond.push(`status=$${i++}`); params.push(status); }
      let sql='SELECT * FROM hr_vacation_periods';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY aquisitivo_start DESC LIMIT 200';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({periods:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const employee_id=String(data.employee_id||''); const aquisitivo_start=String(data.aquisitivo_start||''); const aquisitivo_end=String(data.aquisitivo_end||'');
      const concessivo_start=String(data.concessivo_start||''); const concessivo_end=String(data.concessivo_end||'');
      const saldo_total=parseInt(data.saldo_total_dias)||30; const saldo_usado=parseInt(data.saldo_usado_dias)||0;
      const is_imported=Boolean(data.is_imported); const is_validated=Boolean(data.is_validated); const notes=sanitize(data.notes||'',1000);
      if(!uuidRe().test(employee_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_employee_id'})); return; }
      if(!aquisitivo_start||!aquisitivo_end||!concessivo_start||!concessivo_end){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'dates_required'})); return; }
      if(saldo_total<0||saldo_total>60||saldo_usado<0||saldo_usado>saldo_total){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_saldo'})); return; }
      const emp=await pool.query('SELECT id FROM hr_employees WHERE id=$1',[employee_id]);
      if(!emp.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'employee_not_found'})); return; }
      const saldo_restante=saldo_total-salvo_usado();
      function salvo_usado(){ return saldo_usado; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO hr_vacation_periods (employee_id, aquisitivo_start, aquisitivo_end, concessivo_start, concessivo_end, saldo_total_dias, saldo_usado_dias, saldo_restante_dias, is_imported, is_validated, validated_by, validated_by_id, validated_at, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`, [employee_id, new Date(aquisitivo_start).toISOString().slice(0,10), new Date(aquisitivo_end).toISOString().slice(0,10), new Date(concessivo_start).toISOString().slice(0,10), new Date(concessivo_end).toISOString().slice(0,10), saldo_total, saldo_usado, saldo_total-salvo_usado(), is_imported, is_validated, is_validated? by: null, is_validated? byId: null, is_validated? new Date(): null, notes||null, by, byId]);
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({period:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase(); const is_validated=data.is_validated;
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(status && !VACATION_PERIOD_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      let sql='UPDATE hr_vacation_periods SET updated_at=now()'; const params=[]; let idx=1;
      if(status){ sql+=`, status=$${idx++}`; params.push(status); }
      if(is_validated===true){ sql+=`, is_validated=true, validated_by=$${idx++}, validated_by_id=$${idx++}, validated_at=now()`; params.push(by, byId); }
      if(params.length===0){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'no_changes'})); return; }
      sql+=` WHERE id=$${idx} RETURNING *`; params.push(id);
      const r=await pool.query(sql, params);
      if(!r.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({period:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleVacationRequests(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const employee_id=url.searchParams.get('employee_id'); const status=url.searchParams.get('status');
      const cond=[]; const params=[]; let i=1;
      if(employee_id && uuidRe().test(employee_id)){ cond.push(`employee_id=$${i++}`); params.push(employee_id); }
      if(status && VACATION_REQUEST_STATUS.includes(status)){ cond.push(`status=$${i++}`); params.push(status); }
      let sql='SELECT * FROM hr_vacation_requests';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY start_date DESC LIMIT 200';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({requests:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const employee_id=String(data.employee_id||''); const period_id=data.period_id && uuidRe().test(String(data.period_id))? String(data.period_id): null;
      const start_date=String(data.start_date||''); const end_date=String(data.end_date||''); const notes=sanitize(data.notes||'',1000);
      if(!uuidRe().test(employee_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_employee_id'})); return; }
      if(!start_date||!end_date){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'dates_required'})); return; }
      const sd=new Date(start_date); const ed=new Date(end_date);
      if(ed<sd){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'end_before_start'})); return; }
      const dias=Math.ceil((ed.getTime()-sd.getTime())/86400000)+1;
      if(dias<1||dias>60){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_dias'})); return; }
      const emp=await pool.query('SELECT * FROM hr_employees WHERE id=$1',[employee_id]);
      if(!emp.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'employee_not_found'})); return; }
      // Check saldo if period_id provided
      if(period_id){
        const per=await pool.query('SELECT * FROM hr_vacation_periods WHERE id=$1',[period_id]);
        if(!per.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'period_not_found'})); return; }
        if(per.rows[0].saldo_restante_dias < dias){ res.writeHead(409,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'insufficient_saldo', restante:per.rows[0].saldo_restante_dias, solicitado:dias})); return; }
      }
      // Check conflito cobertura: verifica se existe outra solicitação aprovada no mesmo período para mesmo cargo/lotação? Simplificado: busca solicitações aprovadas com datas sobrepostas
      const conflict=await pool.query(`SELECT id, employee_id, start_date, end_date FROM hr_vacation_requests WHERE employee_id=$1 AND status IN ('aprovado','concedido') AND NOT (end_date < $2 OR start_date > $3)`, [employee_id, sd.toISOString().slice(0,10), ed.toISOString().slice(0,10)]);
      let has_conflict=conflict.rows.length>0; let conflict_details=has_conflict? `Conflito com solicitações existentes ${conflict.rows.map(r=>r.id.slice(0,8)).join(',')}`: null;
      // Also check cobertura por lotação: se outro funcionário mesma lotação já em férias no período, alerta
      if(emp.rows[0].lotacao){
        const lotConflict=await pool.query(`SELECT vr.id FROM hr_vacation_requests vr JOIN hr_employees e ON e.id=vr.employee_id WHERE e.lotacao=$1 AND vr.employee_id!=$2 AND vr.status IN ('aprovado','concedido') AND NOT (vr.end_date < $3 OR vr.start_date > $4) LIMIT 5`, [emp.rows[0].lotacao, employee_id, sd.toISOString().slice(0,10), ed.toISOString().slice(0,10)]);
        if(lotConflict.rows.length>0){ has_conflict=true; conflict_details=(conflict_details||'')+` | Conflito cobertura lotação ${emp.rows[0].lotacao} com ${lotConflict.rows.length} solicitações`; }
      }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO hr_vacation_requests (employee_id, period_id, start_date, end_date, dias, has_coverage_conflict, conflict_details, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [employee_id, period_id, sd.toISOString().slice(0,10), ed.toISOString().slice(0,10), dias, has_conflict, conflict_details, notes||null, by, byId]);
      await auditLog({ action:'hr_vacation_request', actor: by, target: r.rows[0].id, meta:{ employee_id, dias, has_coverage_conflict:has_conflict } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({request:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase(); const rejection_reason=data.rejection_reason? sanitize(data.rejection_reason,1000): null;
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!VACATION_REQUEST_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      if(status==='rejeitado' && (!rejection_reason||rejection_reason.length<5)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'rejection_reason_required'})); return; }
      const cur=await pool.query('SELECT * FROM hr_vacation_requests WHERE id=$1',[id]);
      if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      let sql=`UPDATE hr_vacation_requests SET status=$1, updated_at=now()`; const params=[status]; let idx=2;
      if(status==='rejeitado'){ sql+=`, rejection_reason=$${idx++}`; params.push(rejection_reason); }
      if(status==='aprovado'){ sql+=`, approved_by=$${idx++}, approved_by_id=$${idx++}, approved_at=now()`; params.push(by, byId); }
      sql+=` WHERE id=$${idx} RETURNING *`; params.push(id);
      const r=await pool.query(sql, params);
      if(status==='aprovado' && cur.rows[0].period_id){
        // Update saldo usado
        await pool.query(`UPDATE hr_vacation_periods SET saldo_usado_dias=saldo_usado_dias+$1, saldo_restante_dias=saldo_total_dias-(saldo_usado_dias+$1), updated_at=now() WHERE id=$2`, [cur.rows[0].dias, cur.rows[0].period_id]);
      }
      if(status==='aprovado') await auditLog({ action:'hr_vacation_approve', actor: by, target: id, meta:{ employee_id:cur.rows[0].employee_id, dias:cur.rows[0].dias } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({request:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  return { handleTerminations, handleTerminationById, handleTerminationProgress, handleStatusPolicies, handleVacationPeriods, handleVacationRequests };
}
