export function createExtApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const readJson = async (req) => { const chunks=[]; for await (const c of req) chunks.push(c); const raw=Buffer.concat(chunks).toString('utf8'); if(!raw) return {}; try{ return JSON.parse(raw);} catch{ return {}; } };
  const generateProtocol = (prefix) => { const d=new Date(); const y=d.getFullYear().toString(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); const rand=Math.random().toString(36).substring(2,6).toUpperCase(); return `${prefix}-${y}${m}${day}-${rand}`; };

  // EXT-01 frota: os handlers legados foram substituídos pela jornada
  // canônica hardenada em src/server/ext-fleet-api.mjs (migração 147):
  // autorização por papel com 401/403 distintos, autoria derivada da sessão,
  // transação única negócio+evento+auditoria com 503/rollback, idempotência
  // por identidade e histórico imutável. As rotas /api/ext/fleet-* continuam
  // atendidas por aquele módulo (leitura) ou aposentadas (mutação legada).

  // EXT-02 terceiros: os handlers legados foram substituídos pela jornada
  // canônica hardenada em src/server/ext-third-party-api.mjs (migração 148):
  // autorização por papel com 401/403 distintos, autoria derivada da sessão,
  // contrato vinculado só após validação canônica, janela de acesso temporária
  // presa a OS/contrato autorizado com vigência derivada, avaliação com autor/
  // data/justificativa, transação única negócio+evento+auditoria com
  // 503/rollback, idempotência por identidade e histórico imutável. As rotas
  // /api/ext/third-part* continuam atendidas por aquele módulo (leitura) ou
  // aposentadas (mutação legada).

  // EXT-03 licitações: os handlers legados foram substituídos pela jornada
  // canônica hardenada em src/server/ext-bidding-api.mjs (migração 149):
  // autorização por papel com 401/403 distintos, autoria derivada da sessão,
  // máquina de estados com situação terminal final, prazos com fonte declarada
  // e substituição explícita, proposta versionada que o banco recusa fora do
  // prazo de entrega registrado, resultado só em edital encerrado e imutável,
  // checklist derivado do dossiê, alerta só com regra explícita, transação
  // única negócio+evento+auditoria com 503/rollback, idempotência por
  // identidade e histórico imutável. As rotas /api/ext/bidding-* continuam
  // atendidas por aquele módulo (leitura) ou aposentadas (mutação legada).

  // EXT-04 portal fornecedores
  const handleSupplierPortalQuotations = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT q.*, s.name as supplier_name, p.name as product_name FROM ext_supplier_portal_quotations q LEFT JOIN ast_suppliers s ON s.id=q.supplier_id LEFT JOIN ast_products p ON p.id=q.product_id ORDER BY q.created_at DESC LIMIT 200`);
      return json(res,200,{items:rows, note:'fornecedor nao ve concorrente nem dados de RH'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const supplier_id=b.supplier_id||null;
      const product_id=b.product_id||null;
      const quantity=Number(b.quantity);
      const unit_price_cents=Number(b.unit_price_cents);
      const total_price_cents=Number(b.total_price_cents);
      const notes=b.notes?String(b.notes).trim():null;
      const is_visible_to_supplier=!!b.is_visible_to_supplier;
      if(!Number.isFinite(quantity)||quantity<=0) return json(res,400,{error:'invalid_quantity'});
      if(!Number.isFinite(unit_price_cents)||unit_price_cents<0) return json(res,400,{error:'invalid_unit_price'});
      if(!Number.isFinite(total_price_cents)||total_price_cents<0) return json(res,400,{error:'invalid_total_price'});
      if(notes && (notes.length<10||notes.length>1000)) return json(res,400,{error:'invalid_notes'});
      const protocol=generateProtocol('FORN-EXT');
      const { rows } = await pool.query(`INSERT INTO ext_supplier_portal_quotations (protocol, supplier_id, product_id, quantity, unit_price_cents, total_price_cents, notes, is_visible_to_supplier, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [protocol, supplier_id, product_id, quantity, unit_price_cents, total_price_cents, notes, is_visible_to_supplier, sess.identityId||null]);
      await auditLog({ action:'ext_supplier_portal_quotation_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ protocol, supplier_id } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_supplier_portal_quotations WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=status||existing[0].status;
      const valid=['rascunho','enviado','em_analise','aprovado','rejeitado','cancelado'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      const { rows } = await pool.query(`UPDATE ext_supplier_portal_quotations SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus]);
      await auditLog({ action:'ext_supplier_portal_quotation_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // EXT-05 qualidade
  const handleQualityNonconformities = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM ext_quality_nonconformities ORDER BY created_at DESC LIMIT 200`);
      return json(res,200,{items:rows, note:'encerrar apenas com evidencia e responsavel'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const title=String(b.title||'').trim();
      const description=String(b.description||'').trim();
      const category=String(b.category||'').trim();
      const severity=String(b.severity||'media').trim();
      const responsible_name=b.responsible_name?String(b.responsible_name).trim():null;
      const related_contract_id=b.related_contract_id||null;
      if(title.length<5||title.length>200) return json(res,400,{error:'invalid_title'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      if(category.length<3||category.length>100) return json(res,400,{error:'invalid_category'});
      const validSev=['baixa','media','alta','critica'];
      if(!validSev.includes(severity)) return json(res,400,{error:'invalid_severity'});
      if(responsible_name && (responsible_name.length<2||responsible_name.length>200)) return json(res,400,{error:'invalid_responsible'});
      const protocol=generateProtocol('QUAL-EXT');
      const { rows } = await pool.query(`INSERT INTO ext_quality_nonconformities (protocol, title, description, category, severity, responsible_name, responsible_identity, related_contract_id, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [protocol, title, description, category, severity, responsible_name, sess.identityId||null, related_contract_id, sess.identityId||null]);
      await auditLog({ action:'ext_quality_nonconformity_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ protocol, severity } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_quality_nonconformities WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const status=b.status?String(b.status).trim():existing[0].status;
      const validStatus=['aberta','em_analise','em_acao_corretiva','verificacao','encerrada','reaberta'];
      if(!validStatus.includes(status)) return json(res,400,{error:'invalid_status'});
      const cause=b.cause?String(b.cause).trim():existing[0].cause;
      const corrective_action=b.corrective_action?String(b.corrective_action).trim():existing[0].corrective_action;
      const verification=b.verification?String(b.verification).trim():existing[0].verification;
      if(status==='encerrada'){
        if(!cause || cause.length<10) return json(res,400,{error:'cause_required_to_close'});
        if(!corrective_action || corrective_action.length<10) return json(res,400,{error:'corrective_action_required_to_close'});
        if(!verification || verification.length<10) return json(res,400,{error:'verification_required_to_close_encerrar_apenas_com_evidencia_e_responsavel'});
      }
      const responsible_name=b.responsible_name?String(b.responsible_name).trim():existing[0].responsible_name;
      const recurrence_count=b.recurrence_count!=null?Number(b.recurrence_count):existing[0].recurrence_count;
      const { rows } = await pool.query(`UPDATE ext_quality_nonconformities SET status=$2, cause=$3, corrective_action=$4, verification=$5, responsible_name=$6, recurrence_count=$7, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, status, cause, corrective_action, verification, responsible_name, recurrence_count]);
      await auditLog({ action:'ext_quality_nonconformity_update', actor:sess.identityId||'system', target:id, meta:{ status } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleQualityActions = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const nonconformity_id=url.searchParams.get('nonconformity_id');
      let q=`SELECT * FROM ext_quality_actions`;
      const params=[];
      if(nonconformity_id){ params.push(nonconformity_id); q+=` WHERE nonconformity_id=$${params.length}`; }
      q+=` ORDER BY due_date ASC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const nonconformity_id=b.nonconformity_id;
      const action_type=String(b.action_type||'').trim();
      const description=String(b.description||'').trim();
      const responsible_name=b.responsible_name?String(b.responsible_name).trim():null;
      const due_date=b.due_date||null;
      if(!nonconformity_id) return json(res,400,{error:'missing_nonconformity_id'});
      if(action_type.length<3||action_type.length>100) return json(res,400,{error:'invalid_action_type'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      if(responsible_name && (responsible_name.length<2||responsible_name.length>200)) return json(res,400,{error:'invalid_responsible'});
      const { rows } = await pool.query(`INSERT INTO ext_quality_actions (nonconformity_id, action_type, description, responsible_name, responsible_identity, due_date, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [nonconformity_id, action_type, description, responsible_name, sess.identityId||null, due_date, sess.identityId||null]);
      await auditLog({ action:'ext_quality_action_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ nonconformity_id, action_type } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_quality_actions WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=status||existing[0].status;
      const valid=['pendente','concluida','cancelada'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      const completed_at=nextStatus==='concluida'?new Date():null;
      const { rows } = await pool.query(`UPDATE ext_quality_actions SET status=$2, completed_at=$3 WHERE id=$1 RETURNING *`, [id, nextStatus, completed_at]);
      await auditLog({ action:'ext_quality_action_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // EXT-06 satisfação
  const handleSatisfactionSurveys = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT s.*, ca.name as client_name FROM ext_satisfaction_surveys s LEFT JOIN client_accounts ca ON ca.id=s.client_account_id ORDER BY s.created_at DESC LIMIT 200`);
      return json(res,200,{items:rows, note:'resposta gera acompanhamento sem expor funcionario'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const client_account_id=b.client_account_id||null;
      const contract_id=b.contract_id||null;
      const survey_type=String(b.survey_type||'pesquisa').trim();
      const score=b.score!=null?Number(b.score):null;
      const comment=b.comment?String(b.comment).trim():null;
      const recovery_task=b.recovery_task?String(b.recovery_task).trim():null;
      const validTypes=['pesquisa','csat','nps','outro'];
      if(!validTypes.includes(survey_type)) return json(res,400,{error:'invalid_survey_type'});
      if(score!=null && (!Number.isFinite(score)||score<0||score>10)) return json(res,400,{error:'invalid_score'});
      if(comment && (comment.length<10||comment.length>2000)) return json(res,400,{error:'invalid_comment'});
      if(recovery_task && (recovery_task.length<10||recovery_task.length>2000)) return json(res,400,{error:'invalid_recovery_task'});
      const protocol=generateProtocol('SAT-EXT');
      const { rows } = await pool.query(`INSERT INTO ext_satisfaction_surveys (protocol, client_account_id, contract_id, survey_type, score, comment, recovery_task, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [protocol, client_account_id, contract_id, survey_type, score, comment, recovery_task, sess.identityId||null]);
      await auditLog({ action:'ext_satisfaction_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ protocol, score } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      const recovery_task=b.recovery_task?String(b.recovery_task).trim():null;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_satisfaction_surveys WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=status||existing[0].status;
      const valid=['pendente','em_acompanhamento','concluida','cancelada'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      const nextRecovery=recovery_task!==null && recovery_task!==undefined?recovery_task:existing[0].recovery_task;
      if(nextRecovery && (nextRecovery.length<10||nextRecovery.length>2000)) return json(res,400,{error:'invalid_recovery_task'});
      const { rows } = await pool.query(`UPDATE ext_satisfaction_surveys SET status=$2, recovery_task=$3, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus, nextRecovery]);
      await auditLog({ action:'ext_satisfaction_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  return { handleSupplierPortalQuotations, handleQualityNonconformities, handleQualityActions, handleSatisfactionSurveys };
}
