export function createExtAdvancedApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const readJson = async (req) => { const chunks=[]; for await (const c of req) chunks.push(c); const raw=Buffer.concat(chunks).toString('utf8'); if(!raw) return {}; try{ return JSON.parse(raw);} catch{ return {}; } };
  const generateProtocol = (prefix) => { const d=new Date(); const y=d.getFullYear().toString(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); const rand=Math.random().toString(36).substring(2,6).toUpperCase(); return `${prefix}-${y}${m}${day}-${rand}`; };

  // EXT-07 compliance
  const handleComplianceDocuments = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      // Leitura legada autorizada com projeção minimizada: sem storage_key,
      // sem URL privada e sem número documental completo. O alias `items` é
      // preservado para o cliente legado.
      const { rows } = await pool.query(`SELECT id, protocol, title, compliance_type, status,
          obligation_id, origin, issue_date, expiry_date, version_no, is_private, created_at,
          CASE WHEN document_number IS NULL THEN NULL
               WHEN char_length(document_number) <= 4 THEN '***'
               ELSE '***' || right(document_number, 4) END AS document_number_masked
        FROM ext_compliance_documents ORDER BY expiry_date ASC LIMIT 200`);
      return json(res,200,{items:rows, projection:'minimizada',
        canonical:'/api/ext/compliance/*',
        file_boundary:'referencia_declarada_nao_arquivo_verificado',
        note:'vencimento gera tarefa e documento privado'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const title=String(b.title||'').trim();
      const description=String(b.description||'').trim();
      const compliance_type=String(b.compliance_type||'outro').trim();
      const document_number=b.document_number?String(b.document_number).trim():null;
      const issuer=b.issuer?String(b.issuer).trim():null;
      const responsible_name=b.responsible_name?String(b.responsible_name).trim():null;
      const issue_date=b.issue_date||null;
      const expiry_date=b.expiry_date||null;
      const file_name=b.file_name?String(b.file_name).trim():null;
      const file_url=b.file_url?String(b.file_url).trim():null;
      const storage_key=b.storage_key?String(b.storage_key).trim():null;
      if(title.length<5||title.length>200) return json(res,400,{error:'invalid_title'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      const validTypes=['licenca','certidao','seguro','alvara','outro'];
      if(!validTypes.includes(compliance_type)) return json(res,400,{error:'invalid_compliance_type'});
      if(document_number && (document_number.length<3||document_number.length>200)) return json(res,400,{error:'invalid_document_number'});
      if(issuer && (issuer.length<3||issuer.length>200)) return json(res,400,{error:'invalid_issuer'});
      if(responsible_name && (responsible_name.length<2||responsible_name.length>200)) return json(res,400,{error:'invalid_responsible'});
      if(issue_date && expiry_date && new Date(expiry_date) < new Date(issue_date)) return json(res,400,{error:'invalid_expiry_before_issue'});
      if(file_name && (file_name.length<1||file_name.length>500)) return json(res,400,{error:'invalid_file_name'});
      if(file_url && (file_url.length<5||file_url.length>1000)) return json(res,400,{error:'invalid_file_url'});
      if(storage_key && (storage_key.length<5||storage_key.length>500)) return json(res,400,{error:'invalid_storage_key'});
      const protocol=generateProtocol('COMP-EXT');
      try{
        const { rows } = await pool.query(`INSERT INTO ext_compliance_documents (protocol, title, description, compliance_type, document_number, issuer, responsible_name, responsible_identity, issue_date, expiry_date, file_name, file_url, storage_key, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [protocol, title, description, compliance_type, document_number, issuer, responsible_name, sess.identityId||null, issue_date, expiry_date, file_name, file_url, storage_key, sess.identityId||null]);
        await auditLog({ action:'ext_compliance_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ protocol, compliance_type } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505'){ if(e.constraint && e.constraint.includes('storage_key')) return json(res,409,{error:'duplicate_storage_key'}); return json(res,409,{error:'duplicate_protocol'}); } throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_compliance_documents WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=status||existing[0].status;
      const valid=['vigente','a_vencer','vencida','em_renovacao','cancelada'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      const { rows } = await pool.query(`UPDATE ext_compliance_documents SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus]);
      await auditLog({ action:'ext_compliance_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // EXT-08 base conhecimento
  const handleKnowledgeBase = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const status=url.searchParams.get('status');
      let q=`SELECT * FROM ext_knowledge_base`;
      const params=[];
      if(status){ params.push(status); q+=` WHERE status=$${params.length}`; }
      q+=` ORDER BY category ASC, slug ASC, version DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'usuario encontra apenas conteudo de seu escopo'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const slug=String(b.slug||'').trim().toLowerCase();
      const title=String(b.title||'').trim();
      const content=String(b.content||'').trim();
      const category=String(b.category||'').trim();
      const tags=b.tags||[];
      const access_roles=b.access_roles||[];
      if(slug.length<3||slug.length>200) return json(res,400,{error:'invalid_slug'});
      if(title.length<5||title.length>200) return json(res,400,{error:'invalid_title'});
      if(content.length<50||content.length>20000) return json(res,400,{error:'invalid_content'});
      if(category.length<3||category.length>100) return json(res,400,{error:'invalid_category'});
      const { rows: maxRows } = await pool.query(`SELECT COALESCE(MAX(version),0) as max_version FROM ext_knowledge_base WHERE slug=$1`, [slug]);
      const nextVersion=Number(maxRows[0].max_version)+1;
      const { rows } = await pool.query(`INSERT INTO ext_knowledge_base (slug, title, content, category, version, tags, access_roles, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [slug, title, content, category, nextVersion, tags, access_roles, sess.identityId||null]);
      await pool.query(`INSERT INTO ext_knowledge_base_history (kb_id, previous_version, next_version, change_summary, changed_by_identity) VALUES ($1,NULL,$2,$3,$4)`, [rows[0].id, nextVersion, 'Criação inicial base conhecimento procedimentos versionados busca acesso ciência', sess.identityId||null]);
      await auditLog({ action:'ext_kb_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ slug, version: nextVersion } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      const content=b.content?String(b.content).trim():null;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_knowledge_base WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=status||existing[0].status;
      const valid=['rascunho','em_revisao','aprovado','publicado','arquivado'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      if(content && (content.length<50||content.length>20000)) return json(res,400,{error:'invalid_content'});
      let rows;
      if(content && content!==existing[0].content){
        // nova versão
        const { rows: maxRows } = await pool.query(`SELECT COALESCE(MAX(version),0) as max_version FROM ext_knowledge_base WHERE slug=$1`, [existing[0].slug]);
        const nextVersion=Number(maxRows[0].max_version)+1;
        const newRows = await pool.query(`INSERT INTO ext_knowledge_base (slug, title, content, category, version, tags, access_roles, status, is_published, published_at, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [existing[0].slug, existing[0].title, content, existing[0].category, nextVersion, existing[0].tags, existing[0].access_roles, nextStatus, nextStatus==='publicado', nextStatus==='publicado'?new Date():null, sess.identityId||null]);
        rows=newRows.rows;
        await pool.query(`INSERT INTO ext_knowledge_base_history (kb_id, previous_version, next_version, change_summary, changed_by_identity) VALUES ($1,$2,$3,$4,$5)`, [rows[0].id, existing[0].version, nextVersion, b.change_summary||'Atualização conteúdo base conhecimento', sess.identityId||null]);
      } else {
        const upd = await pool.query(`UPDATE ext_knowledge_base SET status=$2, is_published=$3, published_at=$4, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus, nextStatus==='publicado', nextStatus==='publicado'?new Date():null]);
        rows=upd.rows;
      }
      await auditLog({ action:'ext_kb_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // EXT-09 expansão/unidades
  const handleExpansionPlans = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM ext_expansion_plans ORDER BY created_at DESC LIMIT 200`);
      return json(res,200,{items:rows, note:'premissas e fonte visiveis sem projecao vendida como certeza'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const title=String(b.title||'').trim();
      const description=String(b.description||'').trim();
      const premises=String(b.premises||'').trim();
      const target_location=String(b.target_location||'').trim();
      const capacity=b.capacity!=null?Number(b.capacity):null;
      const estimated_cost_cents=b.estimated_cost_cents!=null?Number(b.estimated_cost_cents):null;
      const estimated_revenue_cents=b.estimated_revenue_cents!=null?Number(b.estimated_revenue_cents):null;
      if(title.length<5||title.length>200) return json(res,400,{error:'invalid_title'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      if(premises.length<10||premises.length>2000) return json(res,400,{error:'invalid_premises'});
      if(target_location.length<3||target_location.length>200) return json(res,400,{error:'invalid_target_location'});
      if(capacity!=null && (!Number.isFinite(capacity)||capacity<0)) return json(res,400,{error:'invalid_capacity'});
      if(estimated_cost_cents!=null && (!Number.isFinite(estimated_cost_cents)||estimated_cost_cents<0)) return json(res,400,{error:'invalid_cost'});
      if(estimated_revenue_cents!=null && (!Number.isFinite(estimated_revenue_cents)||estimated_revenue_cents<0)) return json(res,400,{error:'invalid_revenue'});
      const protocol=generateProtocol('EXP-EXT');
      const { rows } = await pool.query(`INSERT INTO ext_expansion_plans (protocol, title, description, premises, target_location, capacity, estimated_cost_cents, estimated_revenue_cents, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [protocol, title, description, premises, target_location, capacity, estimated_cost_cents, estimated_revenue_cents, sess.identityId||null]);
      await auditLog({ action:'ext_expansion_plan_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ protocol, target_location } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_expansion_plans WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=status||existing[0].status;
      const valid=['rascunho','em_analise','aprovado','rejeitado','em_execucao','concluido','cancelado'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      const { rows } = await pool.query(`UPDATE ext_expansion_plans SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus]);
      await auditLog({ action:'ext_expansion_plan_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleExpansionScenarios = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const plan_id=url.searchParams.get('plan_id');
      let q=`SELECT * FROM ext_expansion_scenarios`;
      const params=[];
      if(plan_id){ params.push(plan_id); q+=` WHERE plan_id=$${params.length}`; }
      q+=` ORDER BY scenario_name ASC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const plan_id=b.plan_id;
      const scenario_name=String(b.scenario_name||'').trim();
      const premises=String(b.premises||'').trim();
      const projected_cost_cents=b.projected_cost_cents!=null?Number(b.projected_cost_cents):null;
      const projected_revenue_cents=b.projected_revenue_cents!=null?Number(b.projected_revenue_cents):null;
      if(!plan_id) return json(res,400,{error:'missing_plan_id'});
      if(scenario_name.length<3||scenario_name.length>200) return json(res,400,{error:'invalid_scenario_name'});
      if(premises.length<10||premises.length>2000) return json(res,400,{error:'invalid_premises'});
      if(projected_cost_cents!=null && (!Number.isFinite(projected_cost_cents)||projected_cost_cents<0)) return json(res,400,{error:'invalid_cost'});
      if(projected_revenue_cents!=null && (!Number.isFinite(projected_revenue_cents)||projected_revenue_cents<0)) return json(res,400,{error:'invalid_revenue'});
      try{
        const { rows } = await pool.query(`INSERT INTO ext_expansion_scenarios (plan_id, scenario_name, premises, projected_cost_cents, projected_revenue_cents) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [plan_id, scenario_name, premises, projected_cost_cents, projected_revenue_cents]);
        await auditLog({ action:'ext_expansion_scenario_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ plan_id, scenario_name } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_scenario_name'}); throw e; }
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // EXT-10 continuidade operacional
  const handleContinuityPlans = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT cp.*, ca.name as client_name FROM ext_continuity_plans cp LEFT JOIN client_accounts ca ON ca.id=cp.client_account_id ORDER BY cp.next_test_due ASC LIMIT 200`);
      return json(res,200,{items:rows, note:'simulado documentado com responsaveis'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const title=String(b.title||'').trim();
      const description=String(b.description||'').trim();
      const client_account_id=b.client_account_id||null;
      const contract_id=b.contract_id||null;
      const post_id=b.post_id?String(b.post_id).trim():null;
      const contacts=b.contacts||[];
      const contingency_steps=b.contingency_steps||[];
      const recovery_steps=b.recovery_steps||[];
      const responsible_name=b.responsible_name?String(b.responsible_name).trim():null;
      const last_tested_at=b.last_tested_at||null;
      const next_test_due=b.next_test_due||null;
      if(title.length<5||title.length>200) return json(res,400,{error:'invalid_title'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      if(post_id && (post_id.length<3||post_id.length>200)) return json(res,400,{error:'invalid_post_id'});
      if(responsible_name && (responsible_name.length<2||responsible_name.length>200)) return json(res,400,{error:'invalid_responsible'});
      const protocol=generateProtocol('CONT-EXT');
      const { rows } = await pool.query(`INSERT INTO ext_continuity_plans (protocol, title, description, client_account_id, contract_id, post_id, contacts, contingency_steps, recovery_steps, responsible_name, responsible_identity, last_tested_at, next_test_due, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [protocol, title, description, client_account_id, contract_id, post_id, JSON.stringify(contacts), JSON.stringify(contingency_steps), JSON.stringify(recovery_steps), responsible_name, sess.identityId||null, last_tested_at, next_test_due, sess.identityId||null]);
      await auditLog({ action:'ext_continuity_plan_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ protocol } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_continuity_plans WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=status||existing[0].status;
      const valid=['rascunho','aprovado','em_teste','testado','desatualizado','arquivado'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      const { rows } = await pool.query(`UPDATE ext_continuity_plans SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus]);
      await auditLog({ action:'ext_continuity_plan_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // EXT-11 analytics/A-B
  const handleAnalyticsExperiments = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM ext_analytics_experiments ORDER BY created_at DESC LIMIT 200`);
      return json(res,200,{items:rows, note:'experimento reversivel resultado sem dados inventados'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const hypothesis=String(b.hypothesis||'').trim();
      const description=String(b.description||'').trim();
      const variant_a=String(b.variant_a||'').trim();
      const variant_b=String(b.variant_b||'').trim();
      const metric_name=String(b.metric_name||'').trim();
      if(hypothesis.length<20||hypothesis.length>2000) return json(res,400,{error:'invalid_hypothesis'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      if(variant_a.length<3||variant_a.length>200) return json(res,400,{error:'invalid_variant_a'});
      if(variant_b.length<3||variant_b.length>200) return json(res,400,{error:'invalid_variant_b'});
      if(metric_name.length<3||metric_name.length>100) return json(res,400,{error:'invalid_metric_name'});
      const protocol=generateProtocol('AB-EXT');
      const { rows } = await pool.query(`INSERT INTO ext_analytics_experiments (protocol, hypothesis, description, variant_a, variant_b, metric_name, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [protocol, hypothesis, description, variant_a, variant_b, metric_name, sess.identityId||null]);
      await auditLog({ action:'ext_analytics_experiment_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ protocol, metric_name } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      const result_a_value=b.result_a_value!=null?Number(b.result_a_value):null;
      const result_b_value=b.result_b_value!=null?Number(b.result_b_value):null;
      const winner=b.winner?String(b.winner).trim():null;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_analytics_experiments WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=status||existing[0].status;
      const valid=['rascunho','em_execucao','concluido','cancelado','arquivado'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      if(winner && !['A','B','empate','inconclusivo'].includes(winner)) return json(res,400,{error:'invalid_winner'});
      const { rows } = await pool.query(`UPDATE ext_analytics_experiments SET status=$2, result_a_value=$3, result_b_value=$4, winner=$5, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus, result_a_value!=null?result_a_value:existing[0].result_a_value, result_b_value!=null?result_b_value:existing[0].result_b_value, winner||existing[0].winner]);
      await auditLog({ action:'ext_analytics_experiment_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus, winner } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // EXT-12 editor visual avançado
  const handleVisualTokens = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM ext_visual_tokens ORDER BY token_key ASC, version DESC LIMIT 200`);
      return json(res,200,{items:rows, note:'permissao real recarga consistente e rollback'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const token_key=String(b.token_key||'').trim();
      const token_value=b.token_value||{};
      const category=String(b.category||'').trim();
      if(token_key.length<3||token_key.length>200) return json(res,400,{error:'invalid_token_key'});
      if(category.length<3||category.length>100) return json(res,400,{error:'invalid_category'});
      const { rows: maxRows } = await pool.query(`SELECT COALESCE(MAX(version),0) as max_version FROM ext_visual_tokens WHERE token_key=$1`, [token_key]);
      const nextVersion=Number(maxRows[0].max_version)+1;
      const { rows } = await pool.query(`INSERT INTO ext_visual_tokens (token_key, token_value, category, version, created_by_identity) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [token_key, JSON.stringify(token_value), category, nextVersion, sess.identityId||null]);
      await pool.query(`INSERT INTO ext_editor_history (token_id, previous_version, next_version, change_summary, changed_by_identity) VALUES ($1,NULL,$2,$3,$4)`, [rows[0].id, nextVersion, 'Criação token visual versionado', sess.identityId||null]);
      await auditLog({ action:'ext_visual_token_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ token_key, version: nextVersion } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      const token_value=b.token_value;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_visual_tokens WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=status||existing[0].status;
      const valid=['rascunho','em_revisao','aprovado','publicado','arquivado','revertido'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      let rows;
      if(token_value && JSON.stringify(token_value)!==JSON.stringify(existing[0].token_value)){
        const { rows: maxRows } = await pool.query(`SELECT COALESCE(MAX(version),0) as max_version FROM ext_visual_tokens WHERE token_key=$1`, [existing[0].token_key]);
        const nextVersion=Number(maxRows[0].max_version)+1;
        const newRows = await pool.query(`INSERT INTO ext_visual_tokens (token_key, token_value, category, version, status, is_published, published_at, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [existing[0].token_key, JSON.stringify(token_value), existing[0].category, nextVersion, nextStatus, nextStatus==='publicado', nextStatus==='publicado'?new Date():null, sess.identityId||null]);
        rows=newRows.rows;
        await pool.query(`INSERT INTO ext_editor_history (token_id, previous_version, next_version, change_summary, changed_by_identity) VALUES ($1,$2,$3,$4,$5)`, [rows[0].id, existing[0].version, nextVersion, b.change_summary||'Atualização token visual', sess.identityId||null]);
      } else {
        const upd = await pool.query(`UPDATE ext_visual_tokens SET status=$2, is_published=$3, published_at=$4, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus, nextStatus==='publicado', nextStatus==='publicado'?new Date():null]);
        rows=upd.rows;
      }
      await auditLog({ action:'ext_visual_token_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleVisualLayouts = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM ext_visual_layouts ORDER BY layout_key ASC, version DESC LIMIT 200`);
      return json(res,200,{items:rows});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const layout_key=String(b.layout_key||'').trim();
      const layout_data=b.layout_data||{};
      if(layout_key.length<3||layout_key.length>200) return json(res,400,{error:'invalid_layout_key'});
      const { rows: maxRows } = await pool.query(`SELECT COALESCE(MAX(version),0) as max_version FROM ext_visual_layouts WHERE layout_key=$1`, [layout_key]);
      const nextVersion=Number(maxRows[0].max_version)+1;
      const { rows } = await pool.query(`INSERT INTO ext_visual_layouts (layout_key, layout_data, version, preview_url, created_by_identity) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [layout_key, JSON.stringify(layout_data), nextVersion, b.preview_url||null, sess.identityId||null]);
      await pool.query(`INSERT INTO ext_editor_history (layout_id, previous_version, next_version, change_summary, changed_by_identity) VALUES ($1,NULL,$2,$3,$4)`, [rows[0].id, nextVersion, 'Criação layout visual versionado', sess.identityId||null]);
      await auditLog({ action:'ext_visual_layout_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ layout_key, version: nextVersion } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      const layout_data=b.layout_data;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_visual_layouts WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=status||existing[0].status;
      const valid=['rascunho','em_revisao','aprovado','publicado','arquivado','revertido'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      let rows;
      if(layout_data && JSON.stringify(layout_data)!==JSON.stringify(existing[0].layout_data)){
        const { rows: maxRows } = await pool.query(`SELECT COALESCE(MAX(version),0) as max_version FROM ext_visual_layouts WHERE layout_key=$1`, [existing[0].layout_key]);
        const nextVersion=Number(maxRows[0].max_version)+1;
        const newRows = await pool.query(`INSERT INTO ext_visual_layouts (layout_key, layout_data, version, status, is_published, published_at, preview_url, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [existing[0].layout_key, JSON.stringify(layout_data), nextVersion, nextStatus, nextStatus==='publicado', nextStatus==='publicado'?new Date():null, b.preview_url||existing[0].preview_url, sess.identityId||null]);
        rows=newRows.rows;
        await pool.query(`INSERT INTO ext_editor_history (layout_id, previous_version, next_version, change_summary, changed_by_identity) VALUES ($1,$2,$3,$4,$5)`, [rows[0].id, existing[0].version, nextVersion, b.change_summary||'Atualização layout visual', sess.identityId||null]);
      } else {
        const upd = await pool.query(`UPDATE ext_visual_layouts SET status=$2, is_published=$3, published_at=$4, preview_url=$5, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus, nextStatus==='publicado', nextStatus==='publicado'?new Date():null, b.preview_url||existing[0].preview_url]);
        rows=upd.rows;
      }
      await auditLog({ action:'ext_visual_layout_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  return { handleComplianceDocuments, handleKnowledgeBase, handleExpansionPlans, handleExpansionScenarios, handleContinuityPlans, handleAnalyticsExperiments, handleVisualTokens, handleVisualLayouts };
}
