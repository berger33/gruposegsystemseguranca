import crypto from 'node:crypto';

const TYPES=['vazamento_dados','acesso_nao_autorizado','perda_dados','indisponibilidade','malware','phishing','violacao_privacidade','outro'];
const SEVERITIES=['baixa','media','alta','critica'];
const STATUSES=['aberto','em_contencao','em_analise','em_remediacao','aguardando_comunicacao','comunicado','encerrado','reaberto'];
const EVIDENCE_TYPES=['log','print','relatorio','depoimento','arquivo','outro'];
const ACTION_TYPES=['contencao','erradicacao','recuperacao','comunicacao','analise','prevencao','outro'];
const ACTION_STATUS=['pendente','em_execucao','concluida','cancelada'];
const RECIPIENT_TYPES=['dpo','autoridade','titular','interno','cliente','outro'];

const ALLOWED_TRANSITIONS={
  aberto:['em_contencao','em_analise','encerrado'],
  em_contencao:['em_analise','em_remediacao','encerrado'],
  em_analise:['em_remediacao','aguardando_comunicacao','encerrado'],
  em_remediacao:['aguardando_comunicacao','comunicado','encerrado'],
  aguardando_comunicacao:['comunicado','encerrado'],
  comunicado:['encerrado','reaberto'],
  encerrado:['reaberto'],
  reaberto:['em_contencao','em_analise','em_remediacao'],
};

function sanitize(v,max=5000){ if(typeof v!=='string') return ''; return v.trim().slice(0,max); }
function uuidRe(){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; }
function isValidArrayEnum(arr, allowed){ return Array.isArray(arr) && arr.every(x=>allowed.includes(x)); }

export function createIncidentApi({ pool, auditLog, sameOrigin, requireSession, requireRole }){
  async function handleIncidents(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const type=url.searchParams.get('type'); const severity=url.searchParams.get('severity'); const status=url.searchParams.get('status');
      const cond=[]; const params=[]; let i=1;
      if(type && TYPES.includes(type)){ cond.push(`incident_type=$${i++}`); params.push(type); }
      if(severity && SEVERITIES.includes(severity)){ cond.push(`severity=$${i++}`); params.push(severity); }
      if(status && STATUSES.includes(status)){ cond.push(`status=$${i++}`); params.push(status); }
      let sql='SELECT * FROM security_incidents';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY detected_at DESC LIMIT 200';
      const r=await pool.query(sql,params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({incidents:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const incident_type=String(data.incident_type||'').toLowerCase();
      const severity=String(data.severity||'media').toLowerCase();
      const title=sanitize(data.title,200);
      const description=sanitize(data.description,5000);
      const affected_data_categories=Array.isArray(data.affected_data_categories)? data.affected_data_categories.filter((x)=>['identificacao','contato','localizacao','profissional','financeiro','tecnico','comportamental','sensivel','outro'].includes(x)) : [];
      const affected_records_estimate=data.affected_records_estimate!=null? parseInt(data.affected_records_estimate,10): null;
      const affected_systems=Array.isArray(data.affected_systems)? data.affected_systems.map((s)=>sanitize(String(s),200)).filter(Boolean).slice(0,20): [];
      const responsible_name=sanitize(data.responsible_name||'',200);
      const responsible_id=sanitize(data.responsible_id||'',80);
      if(!TYPES.includes(incident_type)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_type'})); return; }
      if(!SEVERITIES.includes(severity)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_severity'})); return; }
      if(title.length<10){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'title_min_10'})); return; }
      if(description.length<20){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'description_min_20'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO security_incidents (incident_type, severity, title, description, affected_data_categories, affected_records_estimate, affected_systems, responsible_name, responsible_id, created_by, created_by_id, updated_by, updated_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$10,$11) RETURNING *`,
        [incident_type, severity, title, description, affected_data_categories, affected_records_estimate, affected_systems, responsible_name||null, responsible_id||null, by, byId]);
      await pool.query(`INSERT INTO incident_history (incident_id, previous_status, next_status, reason, changed_by, changed_by_id) VALUES ($1,$2,$3,$4,$5,$6)`, [r.rows[0].id, null, 'aberto', 'Abertura incidente', by, byId]);
      await auditLog({ action:'incident_create', actor: by, target: r.rows[0].id, meta:{ incident_type, severity } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({incident:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleIncidentById(req,res,id){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
    const cur=await pool.query('SELECT * FROM security_incidents WHERE id=$1',[id]);
    if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
    if(req.method==='GET'){
      const evid=await pool.query('SELECT * FROM incident_evidences WHERE incident_id=$1 ORDER BY collected_at DESC LIMIT 100',[id]);
      const acts=await pool.query('SELECT * FROM incident_actions WHERE incident_id=$1 ORDER BY created_at DESC LIMIT 100',[id]);
      const comms=await pool.query('SELECT * FROM incident_communications WHERE incident_id=$1 ORDER BY created_at DESC LIMIT 100',[id]);
      const hist=await pool.query('SELECT * FROM incident_history WHERE incident_id=$1 ORDER BY created_at DESC LIMIT 100',[id]);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({incident:cur.rows[0], evidences:evid.rows, actions:acts.rows, communications:comms.rows, history:hist.rows})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const next_status=data.next_status? String(data.next_status).toLowerCase(): null;
      const reason=sanitize(data.reason||'',2000);
      const root_cause=data.root_cause!=null? sanitize(data.root_cause,2000): undefined;
      const impact_assessment=data.impact_assessment!=null? sanitize(data.impact_assessment,2000): undefined;
      const remediation_plan=data.remediation_plan!=null? sanitize(data.remediation_plan,2000): undefined;
      const lessons_learned=data.lessons_learned!=null? sanitize(data.lessons_learned,2000): undefined;
      const responsible_name=data.responsible_name!=null? sanitize(data.responsible_name,200): undefined;
      const responsible_id=data.responsible_id!=null? sanitize(data.responsible_id,80): undefined;
      const containment_lead_name=data.containment_lead_name!=null? sanitize(data.containment_lead_name,200): undefined;
      const containment_lead_id=data.containment_lead_id!=null? sanitize(data.containment_lead_id,80): undefined;
      const severity=data.severity? String(data.severity).toLowerCase(): null;
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const prev=cur.rows[0].status;
      if(next_status){
        if(!STATUSES.includes(next_status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
        if(prev!==next_status){
          const allowed=ALLOWED_TRANSITIONS[prev]||[];
          if(!allowed.includes(next_status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_transition', allowed})); return; }
        }
        if((next_status==='em_contencao' || next_status==='em_remediacao') && !containment_lead_name && !cur.rows[0].containment_lead_name){
          // require containment lead for containment
          // allow but warn - we enforce for em_contencao
          if(next_status==='em_contencao' && !containment_lead_name){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'containment_lead_required'})); return; }
        }
        if(next_status==='encerrado' && !root_cause && !cur.rows[0].root_cause){
          res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'root_cause_required_for_close'})); return;
        }
      }
      if(severity && !SEVERITIES.includes(severity)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_severity'})); return; }
      // Build update
      const fields=[]; const vals=[]; let idx=1;
      if(next_status){ fields.push(`status=$${idx++}`); vals.push(next_status); if(next_status==='em_contencao'){ fields.push(`contained_at=COALESCE(contained_at, now())`); } if(next_status==='encerrado'){ fields.push(`resolved_at=now()`); } }
      if(severity){ fields.push(`severity=$${idx++}`); vals.push(severity); }
      if(root_cause!==undefined){ fields.push(`root_cause=$${idx++}`); vals.push(root_cause||null); }
      if(impact_assessment!==undefined){ fields.push(`impact_assessment=$${idx++}`); vals.push(impact_assessment||null); }
      if(remediation_plan!==undefined){ fields.push(`remediation_plan=$${idx++}`); vals.push(remediation_plan||null); }
      if(lessons_learned!==undefined){ fields.push(`lessons_learned=$${idx++}`); vals.push(lessons_learned||null); }
      if(responsible_name!==undefined){ fields.push(`responsible_name=$${idx++}`); vals.push(responsible_name||null); }
      if(responsible_id!==undefined){ fields.push(`responsible_id=$${idx++}`); vals.push(responsible_id||null); }
      if(containment_lead_name!==undefined){ fields.push(`containment_lead_name=$${idx++}`); vals.push(containment_lead_name||null); }
      if(containment_lead_id!==undefined){ fields.push(`containment_lead_id=$${idx++}`); vals.push(containment_lead_id||null); }
      fields.push(`updated_by=$${idx++}`); vals.push(by);
      fields.push(`updated_by_id=$${idx++}`); vals.push(byId);
      fields.push(`updated_at=now()`);
      if(fields.length===2){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'no_changes'})); return; }
      vals.push(id);
      const sql=`UPDATE security_incidents SET ${fields.join(', ')} WHERE id=$${idx} RETURNING *`;
      const r=await pool.query(sql, vals);
      if(next_status && prev!==next_status){
        await pool.query(`INSERT INTO incident_history (incident_id, previous_status, next_status, reason, changed_by, changed_by_id) VALUES ($1,$2,$3,$4,$5,$6)`, [id, prev, next_status, reason||null, by, byId]);
        const actionMap={ em_contencao:'incident_contain', encerrado:'incident_close' };
        await auditLog({ action: actionMap[next_status]||'incident_update', actor: by, target: id, meta:{ previous: prev, next: next_status } });
      } else {
        await auditLog({ action:'incident_update', actor: by, target: id });
      }
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({incident:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleEvidences(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const incident_id=String(data.incident_id||'');
      const evidence_type=String(data.evidence_type||'log').toLowerCase();
      const title=sanitize(data.title,200);
      const description=sanitize(data.description||'',2000);
      const file_reference=sanitize(data.file_reference||'',500);
      if(!uuidRe().test(incident_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_incident_id'})); return; }
      if(!EVIDENCE_TYPES.includes(evidence_type)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_evidence_type'})); return; }
      if(title.length<3){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'title_min_3'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const checksum=file_reference? crypto.createHash('sha256').update(file_reference).digest('hex').slice(0,32): null;
      const r=await pool.query(`INSERT INTO incident_evidences (incident_id, evidence_type, title, description, file_reference, checksum, collected_by, collected_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [incident_id, evidence_type, title, description||null, file_reference||null, checksum, by, byId]);
      await auditLog({ action:'incident_evidence_add', actor: by, target: incident_id, meta:{ evidence_id: r.rows[0].id } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({evidence:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleActions(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const incident_id=String(data.incident_id||'');
      const action_type=String(data.action_type||'contencao').toLowerCase();
      const title=sanitize(data.title,200);
      const description=sanitize(data.description,2000);
      const assigned_to_name=sanitize(data.assigned_to_name||'',200);
      const assigned_to_id=sanitize(data.assigned_to_id||'',80);
      const due_at=data.due_at? String(data.due_at): null;
      if(!uuidRe().test(incident_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_incident_id'})); return; }
      if(!ACTION_TYPES.includes(action_type)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_action_type'})); return; }
      if(title.length<3){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'title_min_3'})); return; }
      if(description.length<10){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'description_min_10'})); return; }
      let due=null; if(due_at){ const d=new Date(due_at); if(isNaN(d.getTime())){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_due_at'})); return; } due=d.toISOString(); }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO incident_actions (incident_id, action_type, title, description, assigned_to_name, assigned_to_id, due_at, created_by, created_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [incident_id, action_type, title, description, assigned_to_name||null, assigned_to_id||null, due, by, byId]);
      await auditLog({ action:'incident_action_create', actor: by, target: incident_id, meta:{ action_id: r.rows[0].id } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({action:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||'');
      const status=String(data.status||'').toLowerCase();
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!ACTION_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const by=sess.username||sess.user||'unknown';
      const r=await pool.query(`UPDATE incident_actions SET status=$1, completed_at=CASE WHEN $1='concluida' THEN now() ELSE completed_at END, updated_at=now() WHERE id=$2 RETURNING *`, [status, id]);
      if(!r.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      if(status==='concluida') await auditLog({ action:'incident_action_complete', actor: by, target: r.rows[0].incident_id, meta:{ action_id: id } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({action:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleCommunications(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const incident_id=String(data.incident_id||'');
      const recipient_type=String(data.recipient_type||'').toLowerCase();
      const recipient_contact=sanitize(data.recipient_contact||'',320);
      const subject=sanitize(data.subject,200);
      const content=sanitize(data.content,5000);
      if(!uuidRe().test(incident_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_incident_id'})); return; }
      if(!RECIPIENT_TYPES.includes(recipient_type)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_recipient_type'})); return; }
      if(subject.length<5){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'subject_min_5'})); return; }
      if(content.length<20){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'content_min_20'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO incident_communications (incident_id, recipient_type, recipient_contact, subject, content, sent_by, sent_by_id, sent_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7, now()) RETURNING *`, [incident_id, recipient_type, recipient_contact||null, subject, content, by, byId]);
      // Update incident notification flags
      if(recipient_type==='dpo') await pool.query(`UPDATE security_incidents SET dpo_notified=true, dpo_notified_at=now(), updated_at=now() WHERE id=$1`, [incident_id]);
      if(recipient_type==='autoridade') await pool.query(`UPDATE security_incidents SET authority_notified=true, authority_notified_at=now(), updated_at=now() WHERE id=$1`, [incident_id]);
      if(recipient_type==='titular') await pool.query(`UPDATE security_incidents SET data_subjects_notified=true, data_subjects_notified_at=now(), updated_at=now() WHERE id=$1`, [incident_id]);
      await auditLog({ action:'incident_communicate', actor: by, target: incident_id, meta:{ recipient_type } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({communication:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  return { handleIncidents, handleIncidentById, handleEvidences, handleActions, handleCommunications };
}
