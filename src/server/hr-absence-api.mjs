const ABSENCE_TYPE=['atestado_medico','licenca_maternidade','licenca_paternidade','acidente_trabalho','afastamento_inss','licenca_nao_remunerada','falta_justificada','outro'];
const ABSENCE_STATUS=['solicitado','em_analise','aprovado','rejeitado','em_afastamento','retornado','cancelado'];
const TIME_STATUS=['pendente','aprovado','divergente','em_correcao','corrigido','rejeitado'];
const TIME_SOURCE=['manual','importado','provedor','ajuste'];
const COMPETENCE_STATUS=['aberto','fechado','reaberto'];
const WORK_RULE_STATUS=['rascunho','em_revisao','aprovado','arquivado','rejeitado'];
const HOUR_BANK_STATUS=['aberto','fechado','arquivado'];
const MOVEMENT_TYPE=['extra','falta','adicional_noturno','adicional_periculosidade','compensacao','ajuste','feriado','outro'];

function sanitize(v,max=2000){ if(typeof v!=='string') return ''; return v.trim().slice(0,max); }
function uuidRe(){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; }

export function createHrAbsenceApi({ pool, auditLog, sameOrigin, requireSession, requireRole }){
  async function handleAbsences(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const employee_id=url.searchParams.get('employee_id'); const status=url.searchParams.get('status'); const type=url.searchParams.get('type');
      const view=url.searchParams.get('view'); // supervisor vs rh
      const cond=[]; const params=[]; let i=1;
      if(employee_id && uuidRe().test(employee_id)){ cond.push(`a.employee_id=$${i++}`); params.push(employee_id); }
      if(status && ABSENCE_STATUS.includes(status)){ cond.push(`a.status=$${i++}`); params.push(status); }
      if(type && ABSENCE_TYPE.includes(type)){ cond.push(`a.type=$${i++}`); params.push(type); }
      let sql='SELECT a.*, e.display_name as employee_name, e.lotacao FROM hr_absences a LEFT JOIN hr_employees e ON e.id=a.employee_id';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY a.start_date DESC LIMIT 200';
      const r=await pool.query(sql, params);
      let rows=r.rows;
      // Supervisor view apenas indisponibilidade/aptidão não diagnóstico
      if(view==='supervisor'){
        rows=rows.map(row=>({
          id: row.id,
          employee_id: row.employee_id,
          employee_name: row.employee_name,
          lotacao: row.lotacao,
          type: row.type,
          start_date: row.start_date,
          end_date: row.end_date,
          expected_return_date: row.expected_return_date,
          actual_return_date: row.actual_return_date,
          status: row.status,
          is_fit_for_duty: row.is_fit_for_duty,
          operational_notes: row.operational_notes,
          has_substitution: row.has_substitution,
          substitute_employee_name: row.substitute_employee_name,
          // não expor reason diagnóstico, apenas indisponibilidade/aptidão
          indisponibilidade: `${row.start_date?.toISOString?.()?.slice(0,10) || row.start_date} a ${row.end_date?.toISOString?.()?.slice(0,10) || row.end_date}`,
          aptidao_operacional: row.is_fit_for_duty===null? 'em_analise' : row.is_fit_for_duty? 'apto' : 'inapto',
          note: 'Supervisor vê apenas indisponibilidade/aptidão operacional necessária, não diagnóstico (HR-10)'
        }));
      } else {
        // RH view completa mas ainda medical_document restrito
        // Se não admin/ti/rh, já bloqueado acima
      }
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({absences:rows, view: view||'rh'})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const employee_id=String(data.employee_id||''); const type=String(data.type||'atestado_medico').toLowerCase();
      const start_date=String(data.start_date||''); const end_date=String(data.end_date||'');
      const expected_return_date=data.expected_return_date? String(data.expected_return_date): null;
      const reason=sanitize(data.reason||'',1000); const medical_url=data.medical_document_url? sanitize(data.medical_document_url,1000): null;
      const is_fit_for_duty=data.is_fit_for_duty!=null? Boolean(data.is_fit_for_duty): null;
      const operational_notes=sanitize(data.operational_notes||'',1000);
      const has_substitution=Boolean(data.has_substitution); const substitute_id=data.substitute_employee_id && uuidRe().test(String(data.substitute_employee_id))? String(data.substitute_employee_id): null;
      const substitute_name=sanitize(data.substitute_employee_name||'',200);
      if(!uuidRe().test(employee_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_employee_id'})); return; }
      if(!ABSENCE_TYPE.includes(type)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_type'})); return; }
      if(!start_date||!end_date){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'dates_required'})); return; }
      const sd=new Date(start_date); const ed=new Date(end_date);
      if(ed<sd){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'end_before_start'})); return; }
      const emp=await pool.query('SELECT * FROM hr_employees WHERE id=$1',[employee_id]);
      if(!emp.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'employee_not_found'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO hr_absences (employee_id, type, start_date, end_date, expected_return_date, reason, medical_document_url, is_fit_for_duty, operational_notes, has_substitution, substitute_employee_id, substitute_employee_name, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [employee_id, type, sd.toISOString().slice(0,10), ed.toISOString().slice(0,10), expected_return_date? new Date(expected_return_date).toISOString().slice(0,10): null, reason||null, medical_url, is_fit_for_duty, operational_notes||null, has_substitution, substitute_id, substitute_name||null, by, byId]);
      if(medical_url){
        await pool.query(`INSERT INTO hr_absence_documents (absence_id, doc_type, file_url, is_restricted, uploaded_by, uploaded_by_id) VALUES ($1,$2,$3,true,$4,$5)`, [r.rows[0].id, 'atestado', medical_url, by, byId]);
      }
      await auditLog({ action:'hr_absence_create', actor: by, target: r.rows[0].id, meta:{ employee_id, type, start_date, end_date, has_substitution } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({absence:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase();
      const actual_return_date=data.actual_return_date? String(data.actual_return_date): null;
      const is_fit_for_duty=data.is_fit_for_duty!=null? Boolean(data.is_fit_for_duty): undefined;
      const operational_notes=data.operational_notes!=null? sanitize(data.operational_notes,1000): undefined;
      const rejection_reason=data.rejection_reason? sanitize(data.rejection_reason,1000): null;
      const substitute_id=data.substitute_employee_id && uuidRe().test(String(data.substitute_employee_id))? String(data.substitute_employee_id): undefined;
      const substitute_name=data.substitute_employee_name!=null? sanitize(data.substitute_employee_name,200): undefined;
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(status && !ABSENCE_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      if(status==='rejeitado' && (!rejection_reason||rejection_reason.length<5)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'rejection_reason_required'})); return; }
      const cur=await pool.query('SELECT * FROM hr_absences WHERE id=$1',[id]);
      if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      let sql='UPDATE hr_absences SET updated_at=now()'; const params=[]; let idx=1;
      if(status){ sql+=`, status=$${idx++}`; params.push(status); if(status==='aprovado'){ sql+=`, approved_by=$${idx++}, approved_by_id=$${idx++}, approved_at=now()`; params.push(by, byId); } if(status==='rejeitado'){ sql+=`, rejection_reason=$${idx++}`; params.push(rejection_reason); } }
      if(actual_return_date){ sql+=`, actual_return_date=$${idx++}`; params.push(new Date(actual_return_date).toISOString().slice(0,10)); }
      if(is_fit_for_duty!==undefined){ sql+=`, is_fit_for_duty=$${idx++}`; params.push(is_fit_for_duty); }
      if(operational_notes!==undefined){ sql+=`, operational_notes=$${idx++}`; params.push(operational_notes||null); }
      if(substitute_id!==undefined){ sql+=`, substitute_employee_id=$${idx++}`; params.push(substitute_id||null); }
      if(substitute_name!==undefined){ sql+=`, substitute_employee_name=$${idx++}, has_substitution=true`; params.push(substitute_name||null); }
      if(params.length===0){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'no_changes'})); return; }
      sql+=` WHERE id=$${idx} RETURNING *`; params.push(id);
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({absence:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleTimeEntries(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const employee_id=url.searchParams.get('employee_id'); const competence=url.searchParams.get('competence'); const status=url.searchParams.get('status');
      const cond=[]; const params=[]; let i=1;
      if(employee_id && uuidRe().test(employee_id)){ cond.push(`employee_id=$${i++}`); params.push(employee_id); }
      if(competence){ cond.push(`competence=$${i++}`); params.push(competence); }
      if(status && TIME_STATUS.includes(status)){ cond.push(`status=$${i++}`); params.push(status); }
      let sql='SELECT * FROM hr_time_entries';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY entry_date DESC LIMIT 300';
      const r=await pool.query(sql, params);
      const closures=await pool.query('SELECT * FROM hr_time_competence_closures ORDER BY competence DESC LIMIT 20');
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({entries:r.rows, closures:closures.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      // Importação em lote ou criação manual
      const isImport=Array.isArray(data.entries);
      if(isImport){
        const competence=String(data.competence||'').trim();
        if(!competence || !/^\d{4}-\d{2}$/.test(competence)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_competence'})); return; }
        // Verifica fechamento
        const closure=await pool.query('SELECT * FROM hr_time_competence_closures WHERE competence=$1',[competence]);
        if(closure.rows.length && closure.rows[0].status==='fechado'){ res.writeHead(409,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'competence_closed', competence})); return; }
        const entries=data.entries.slice(0,500); // limite 500
        const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
        let imported=0; let divergences=0;
        for(const e of entries){
          const employee_id=String(e.employee_id||''); const entry_date=String(e.entry_date||'');
          const clock_in=e.clock_in? String(e.clock_in): null; const clock_out=e.clock_out? String(e.clock_out): null;
          const hours_worked=e.hours_worked!=null? parseFloat(e.hours_worked): null;
          const source=String(e.source||'importado').toLowerCase(); const justification=e.justification? sanitize(e.justification,1000): null;
          if(!uuidRe().test(employee_id)||!entry_date) continue;
          const emp=await pool.query('SELECT id FROM hr_employees WHERE id=$1',[employee_id]);
          if(!emp.rows.length) continue;
          // Detecta divergência: sem clock_in/out ou hours_worked >12 ou <4 etc
          let status='pendente'; let divergence_reason=null;
          if(!clock_in||!clock_out){ status='divergente'; divergence_reason='clock_in/out ausente'; divergences++; }
          else if(hours_worked!==null && (hours_worked>14 || hours_worked<2)){ status='divergente'; divergence_reason=`hours_worked ${hours_worked} fora faixa`; divergences++; }
          const comp=entry_date.slice(0,7);
          await pool.query(`INSERT INTO hr_time_entries (employee_id, entry_date, clock_in, clock_out, hours_worked, source, status, justification, divergence_reason, original_snapshot, is_imported, import_batch_id, competence, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13,$14) ON CONFLICT DO NOTHING`, [employee_id, new Date(entry_date).toISOString().slice(0,10), clock_in, clock_out, hours_worked, TIME_SOURCE.includes(source)? source: 'importado', status, justification, divergence_reason, JSON.stringify(e), data.import_batch_id||`batch-${competence}`, comp, by, byId]);
          imported++;
        }
        await auditLog({ action:'hr_time_entry_import', actor: by, target: competence, meta:{ imported, divergences, competence } });
        res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({imported, divergences, competence})); return;
      } else {
        const employee_id=String(data.employee_id||''); const entry_date=String(data.entry_date||'');
        const clock_in=data.clock_in? String(data.clock_in): null; const clock_out=data.clock_out? String(data.clock_out): null;
        const hours_worked=data.hours_worked!=null? parseFloat(data.hours_worked): null;
        const justification=sanitize(data.justification||'',1000); const competence=data.competence? String(data.competence): entry_date.slice(0,7);
        if(!uuidRe().test(employee_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_employee_id'})); return; }
        if(!entry_date){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'entry_date_required'})); return; }
        const emp=await pool.query('SELECT id FROM hr_employees WHERE id=$1',[employee_id]);
        if(!emp.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'employee_not_found'})); return; }
        const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
        const r=await pool.query(`INSERT INTO hr_time_entries (employee_id, entry_date, clock_in, clock_out, hours_worked, source, justification, competence, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,'manual',$6,$7,$8,$9) RETURNING *`, [employee_id, new Date(entry_date).toISOString().slice(0,10), clock_in, clock_out, hours_worked, justification||null, competence, by, byId]);
        res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({entry:r.rows[0]})); return;
      }
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase(); const justification=data.justification? sanitize(data.justification,1000): null;
      const divergence_reason=data.divergence_reason? sanitize(data.divergence_reason,1000): null;
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(status && !TIME_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const cur=await pool.query('SELECT * FROM hr_time_entries WHERE id=$1',[id]);
      if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      let sql='UPDATE hr_time_entries SET updated_at=now()'; const params=[]; let idx=1;
      if(status){ sql+=`, status=$${idx++}`; params.push(status); }
      if(justification!==null){ sql+=`, justification=$${idx++}`; params.push(justification); }
      if(divergence_reason!==null){ sql+=`, divergence_reason=$${idx++}`; params.push(divergence_reason); }
      sql+=`, corrected_by=$${idx++}, corrected_by_id=$${idx++}, corrected_at=now()`; params.push(by, byId);
      sql+=` WHERE id=$${idx} RETURNING *`; params.push(id);
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({entry:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleTimeCorrections(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const entry_id=new URL(req.url,'http://localhost').searchParams.get('entry_id');
      let sql='SELECT * FROM hr_time_corrections'; const params=[]; let i=1;
      if(entry_id && uuidRe().test(entry_id)){ sql+=` WHERE entry_id=$${i++}`; params.push(entry_id); }
      sql+=' ORDER BY created_at DESC LIMIT 200';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({corrections:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const entry_id=String(data.entry_id||''); const reason=sanitize(data.reason||'',1000);
      const new_data=data.new_data;
      if(!uuidRe().test(entry_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_entry_id'})); return; }
      if(reason.length<10){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'reason_min_10'})); return; }
      if(!new_data || typeof new_data!=='object'){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'new_data_required'})); return; }
      const cur=await pool.query('SELECT * FROM hr_time_entries WHERE id=$1',[entry_id]);
      if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'entry_not_found'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO hr_time_corrections (entry_id, employee_id, previous_data, new_data, reason, requested_by, requested_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [entry_id, cur.rows[0].employee_id, JSON.stringify(cur.rows[0]), JSON.stringify(new_data), reason, by, byId]);
      await pool.query(`UPDATE hr_time_entries SET status='em_correcao', updated_at=now() WHERE id=$1`, [entry_id]);
      await auditLog({ action:'hr_time_correction_request', actor: by, target: r.rows[0].id, meta:{ entry_id, employee_id:cur.rows[0].employee_id } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({correction:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase();
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!['solicitado','em_analise','aprovado','rejeitado','cancelado'].includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const cur=await pool.query('SELECT * FROM hr_time_corrections WHERE id=$1',[id]);
      if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`UPDATE hr_time_corrections SET status=$1, approved_by=$2, approved_by_id=$3, updated_at=now() WHERE id=$4 RETURNING *`, [status, by, byId, id]);
      if(status==='aprovado'){
        const new_data=typeof cur.rows[0].new_data==='string'? JSON.parse(cur.rows[0].new_data): cur.rows[0].new_data;
        // Aplica correção preservando original
        const entryCur=await pool.query('SELECT * FROM hr_time_entries WHERE id=$1',[cur.rows[0].entry_id]);
        if(entryCur.rows.length){
          const orig=entryCur.rows[0];
          if(!orig.original_snapshot){
            await pool.query(`UPDATE hr_time_entries SET original_snapshot=$1 WHERE id=$2`, [JSON.stringify(orig), orig.id]);
          }
          const clock_in=new_data.clock_in||orig.clock_in; const clock_out=new_data.clock_out||orig.clock_out;
          const hours_worked=new_data.hours_worked!=null? new_data.hours_worked: orig.hours_worked;
          await pool.query(`UPDATE hr_time_entries SET clock_in=$1, clock_out=$2, hours_worked=$3, status='corrigido', corrected_by=$4, corrected_by_id=$5, corrected_at=now(), updated_at=now() WHERE id=$6`, [clock_in, clock_out, hours_worked, by, byId, orig.id]);
        }
      }
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({correction:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleCompetenceClosures(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const r=await pool.query('SELECT * FROM hr_time_competence_closures ORDER BY competence DESC LIMIT 100');
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({closures:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const competence=String(data.competence||'').trim(); const action=String(data.action||'fechar').toLowerCase(); const reopen_reason=data.reopen_reason? sanitize(data.reopen_reason,1000): null; const notes=sanitize(data.notes||'',1000);
      if(!competence || !/^\d{4}-\d{2}$/.test(competence)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_competence'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      if(action==='fechar'){
        const count=await pool.query('SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE status=\'divergente\')::int as diverg FROM hr_time_entries WHERE competence=$1',[competence]);
        const total=count.rows[0]?.total||0; const diverg=count.rows[0]?.diverg||0;
        if(diverg>0){ res.writeHead(409,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'competence_has_divergences', divergences:diverg, total})); return; }
        const r=await pool.query(`INSERT INTO hr_time_competence_closures (competence, status, closed_by, closed_by_id, closed_at, total_entries, divergences_count, notes) VALUES ($1,'fechado',$2,$3,now(),$4,$5,$6) ON CONFLICT (competence) DO UPDATE SET status='fechado', closed_by=$2, closed_by_id=$3, closed_at=now(), total_entries=$4, divergences_count=$5, notes=$6, updated_at=now() RETURNING *`, [competence, by, byId, total, diverg, notes||null]);
        await auditLog({ action:'hr_competence_close', actor: by, target: competence, meta:{ total, diverg } });
        res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({closure:r.rows[0]})); return;
      }
      if(action==='reabrir'){
        if(!reopen_reason||reopen_reason.length<10){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'reopen_reason_min_10'})); return; }
        const r=await pool.query(`UPDATE hr_time_competence_closures SET status='reaberto', reopened_by=$1, reopened_by_id=$2, reopened_at=now(), reopen_reason=$3, notes=$4, updated_at=now() WHERE competence=$5 RETURNING *`, [by, byId, reopen_reason, notes||null, competence]);
        if(!r.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'closure_not_found'})); return; }
        await auditLog({ action:'hr_competence_reopen', actor: by, target: competence, meta:{ reopen_reason } });
        res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({closure:r.rows[0]})); return;
      }
      res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_action'})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleWorkRules(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const r=await pool.query('SELECT id, name, employment_type, convention_ref, version, validity_start, validity_end, approval_status, approved_at, rules, created_at FROM hr_work_rules ORDER BY name, version DESC LIMIT 200');
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({rules:r.rows, note:'HR-12 banco horas adicionais horas extras somente regras versionadas validadas vínculo/convenção não fixar 12x36/6x1 universal'})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const name=sanitize(data.name,200); const description=sanitize(data.description||'',2000); const employment_type=String(data.employment_type||'clt').toLowerCase();
      const convention_ref=sanitize(data.convention_ref||'',200); const validity_start=String(data.validity_start||''); const validity_end=data.validity_end? String(data.validity_end): null;
      const rules=data.rules;
      if(name.length<5){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'name_min_5'})); return; }
      if(!validity_start){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'validity_start_required'})); return; }
      if(!rules || typeof rules!=='object'){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'rules_required'})); return; }
      // Valida que não fixa 12x36/6x1 como universal
      const rulesStr=JSON.stringify(rules).toLowerCase();
      if(rulesStr.includes('12x36') && rulesStr.includes('universal')){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'cannot_fix_12x36_as_universal','note':'Não fixar 12x36/6x1 como regra universal, usar variável por convenção/escala'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const maxV=await pool.query('SELECT COALESCE(MAX(version),0)::int as max FROM hr_work_rules WHERE name=$1',[name]);
      const nextVersion=(maxV.rows[0]?.max||0)+1;
      const r=await pool.query(`INSERT INTO hr_work_rules (name, description, employment_type, convention_ref, version, validity_start, validity_end, rules, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [name, description||null, employment_type, convention_ref||null, nextVersion, new Date(validity_start).toISOString().slice(0,10), validity_end? new Date(validity_end).toISOString().slice(0,10): null, JSON.stringify(rules), by, byId]);
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({rule:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase(); const rejection_reason=data.rejection_reason? sanitize(data.rejection_reason,1000): null;
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!WORK_RULE_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      if(status==='rejeitado' && (!rejection_reason||rejection_reason.length<5)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'rejection_reason_required'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      let sql=`UPDATE hr_work_rules SET approval_status=$1, updated_at=now()`; const params=[status]; let idx=2;
      if(status==='aprovado'){ sql+=`, approved_by=$${idx++}, approved_by_id=$${idx++}, approved_at=now()`; params.push(by, byId); }
      if(status==='rejeitado'){ sql+=`, rejection_reason=$${idx++}`; params.push(rejection_reason); }
      sql+=` WHERE id=$${idx} RETURNING *`; params.push(id);
      const r=await pool.query(sql, params);
      if(!r.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      if(status==='aprovado') await auditLog({ action:'hr_work_rule_approve', actor: by, target: id, meta:{ name:r.rows[0].name, version:r.rows[0].version } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({rule:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleHourBank(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const employee_id=url.searchParams.get('employee_id'); const competence=url.searchParams.get('competence');
      const cond=[]; const params=[]; let i=1;
      if(employee_id && uuidRe().test(employee_id)){ cond.push(`employee_id=$${i++}`); params.push(employee_id); }
      if(competence){ cond.push(`competence=$${i++}`); params.push(competence); }
      let sql='SELECT * FROM hr_hour_bank';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY competence DESC LIMIT 200';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({hour_banks:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const employee_id=String(data.employee_id||''); const competence=String(data.competence||'').trim();
      const saldo_anterior=parseFloat(data.saldo_anterior)||0; const horas_extras=parseFloat(data.horas_extras)||0;
      const horas_falta=parseFloat(data.horas_falta)||0; const adicionais=parseFloat(data.adicionais)||0;
      const rule_id=data.rule_id && uuidRe().test(String(data.rule_id))? String(data.rule_id): null;
      const notes=sanitize(data.notes||'',1000);
      if(!uuidRe().test(employee_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_employee_id'})); return; }
      if(!competence || !/^\d{4}-\d{2}$/.test(competence)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_competence'})); return; }
      const emp=await pool.query('SELECT id FROM hr_employees WHERE id=$1',[employee_id]);
      if(!emp.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'employee_not_found'})); return; }
      let rule_version=null;
      if(rule_id){
        const rule=await pool.query('SELECT * FROM hr_work_rules WHERE id=$1',[rule_id]);
        if(!rule.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'rule_not_found'})); return; }
        if(rule.rows[0].approval_status!=='aprovado'){ res.writeHead(409,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'rule_not_approved','note':'Horas extras somente com regras versionadas e validadas'})); return; }
        rule_version=rule.rows[0].version;
      }
      const saldo_atual=saldo_anterior+horas_extras-horas_falta+adicionais;
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      try{
        const r=await pool.query(`INSERT INTO hr_hour_bank (employee_id, competence, saldo_anterior, horas_extras, horas_falta, adicionais, saldo_atual, rule_id, rule_version, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [employee_id, competence, saldo_anterior, horas_extras, horas_falta, adicionais, saldo_atual, rule_id, rule_version, notes||null, by, byId]);
        res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({hour_bank:r.rows[0]})); return;
      }catch(e){
        if(String(e).includes('duplicate')||String(e).includes('unique')){ res.writeHead(409,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_competence'})); return; }
        throw e;
      }
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase();
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!HOUR_BANK_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const r=await pool.query(`UPDATE hr_hour_bank SET status=$1, updated_at=now() WHERE id=$2 RETURNING *`, [status, id]);
      if(!r.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({hour_bank:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleHourMovements(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const hour_bank_id=url.searchParams.get('hour_bank_id'); const employee_id=url.searchParams.get('employee_id');
      const cond=[]; const params=[]; let i=1;
      if(hour_bank_id && uuidRe().test(hour_bank_id)){ cond.push(`hour_bank_id=$${i++}`); params.push(hour_bank_id); }
      if(employee_id && uuidRe().test(employee_id)){ cond.push(`employee_id=$${i++}`); params.push(employee_id); }
      let sql='SELECT * FROM hr_hour_bank_movements';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY movement_date DESC LIMIT 300';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({movements:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const hour_bank_id=String(data.hour_bank_id||''); const employee_id=String(data.employee_id||'');
      const movement_date=String(data.movement_date||''); const type=String(data.type||'extra').toLowerCase();
      const quantity=parseFloat(data.quantity)||0; const reason=sanitize(data.reason||'',1000);
      const rule_id=data.rule_id && uuidRe().test(String(data.rule_id))? String(data.rule_id): null;
      if(!uuidRe().test(hour_bank_id)||!uuidRe().test(employee_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_ids'})); return; }
      if(!MOVEMENT_TYPE.includes(type)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_type'})); return; }
      if(!movement_date){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'movement_date_required'})); return; }
      if(quantity<-24||quantity>24){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_quantity'})); return; }
      const bank=await pool.query('SELECT * FROM hr_hour_bank WHERE id=$1',[hour_bank_id]);
      if(!bank.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'hour_bank_not_found'})); return; }
      if(bank.rows[0].status==='fechado'){ res.writeHead(409,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'hour_bank_closed'})); return; }
      let rule_version=null;
      if(rule_id){
        const rule=await pool.query('SELECT * FROM hr_work_rules WHERE id=$1',[rule_id]);
        if(!rule.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'rule_not_found'})); return; }
        if(rule.rows[0].approval_status!=='aprovado'){ res.writeHead(409,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'rule_not_approved'})); return; }
        rule_version=rule.rows[0].version;
      }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO hr_hour_bank_movements (hour_bank_id, employee_id, movement_date, type, quantity, reason, rule_id, rule_version, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [hour_bank_id, employee_id, new Date(movement_date).toISOString().slice(0,10), type, quantity, reason||null, rule_id, rule_version, by, byId]);
      // Update saldo_atual
      await pool.query(`UPDATE hr_hour_bank SET saldo_atual=saldo_atual+$1, updated_at=now() WHERE id=$2`, [quantity, hour_bank_id]);
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({movement:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  return { handleAbsences, handleTimeEntries, handleTimeCorrections, handleCompetenceClosures, handleWorkRules, handleHourBank, handleHourMovements };
}
