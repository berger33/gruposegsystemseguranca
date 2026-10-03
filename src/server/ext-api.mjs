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

  // EXT-04 fornecedores foi promovido para a jornada canônica hardenada em
  // src/server/ext-supplier-api.mjs (migração 150). Este módulo legado não
  // atende mais cotações: leitura/410 passam pelo módulo canônico.

  // EXT-05 qualidade foi transferida para src/server/ext-quality-api.mjs
  // (migração 151). Este módulo legado não mantém autoridade de escrita.

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

  return { handleSatisfactionSurveys };
}
