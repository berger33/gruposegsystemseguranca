export function createExtReportingApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const readJson = async (req) => { const chunks=[]; for await (const c of req) chunks.push(c); const raw=Buffer.concat(chunks).toString('utf8'); if(!raw) return {}; try{ return JSON.parse(raw);} catch{ return {}; } };
  const generateProtocol = (prefix) => { const d=new Date(); const y=d.getFullYear().toString(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); const rand=Math.random().toString(36).substring(2,6).toUpperCase(); return `${prefix}-${y}${m}${day}-${rand}`; };

  // EXT-13 relatorio programado
  const handlePeriodicReports = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM ext_periodic_reports ORDER BY created_at DESC LIMIT 200`);
      return json(res,200,{items:rows, note:'relatorio gerado apenas de dados reais escopo cliente autorizado sem dado inventado sem dado nao autorizado'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const title=String(b.title||'').trim();
      const description=String(b.description||'').trim();
      const report_type=String(b.report_type||'mensal').trim();
      const period_start=b.period_start||null;
      const period_end=b.period_end||null;
      const filters=b.filters||{};
      const recipient_emails=b.recipient_emails||[];
      if(title.length<5||title.length>200) return json(res,400,{error:'invalid_title'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      const validTypes=['diario','semanal','mensal','trimestral','anual','sob_demanda'];
      if(!validTypes.includes(report_type)) return json(res,400,{error:'invalid_report_type'});
      if(period_start && period_end && new Date(period_end) < new Date(period_start)) return json(res,400,{error:'invalid_period'});
      if(recipient_emails && Array.isArray(recipient_emails) && recipient_emails.length>0){
        for(const em of recipient_emails){ if(typeof em!=='string'||!em.includes('@')) return json(res,400,{error:'invalid_recipient_email'}); }
      }
      const protocol=generateProtocol('RELP-EXT');
      const { rows } = await pool.query(`INSERT INTO ext_periodic_reports (protocol, title, description, report_type, period_start, period_end, filters, recipient_emails, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [protocol, title, description, report_type, period_start, period_end, JSON.stringify(filters), recipient_emails, sess.identityId||null]);
      await pool.query(`INSERT INTO ext_periodic_report_logs (report_id, action, actor_identity) VALUES ($1,'criacao',$2)`, [rows[0].id, sess.identityId||null]);
      await auditLog({ action:'ext_periodic_report_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ protocol, report_type } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      const totals=b.totals;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_periodic_reports WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=status||existing[0].status;
      const valid=['rascunho','gerando','gerado','enviado','falhou','cancelado'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      const generated_at=nextStatus==='gerado'?new Date():existing[0].generated_at;
      const { rows } = await pool.query(`UPDATE ext_periodic_reports SET status=$2, totals=$3, generated_at=$4, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus, totals?JSON.stringify(totals):existing[0].totals, generated_at]);
      await pool.query(`INSERT INTO ext_periodic_report_logs (report_id, action, actor_identity) VALUES ($1,$2,$3)`, [id, nextStatus, sess.identityId||null]);
      await auditLog({ action:'ext_periodic_report_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // EXT-14 inteligencia comercial
  const handleCommercialIntelligence = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM ext_commercial_intelligence ORDER BY created_at DESC LIMIT 200`);
      return json(res,200,{items:rows, note:'justificativa obrigatoria uso bloqueado sem aprovacao humana'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const title=String(b.title||'').trim();
      const description=String(b.description||'').trim();
      const intel_type=String(b.intel_type||'mercado').trim();
      const source_module=String(b.source_module||'').trim();
      const score=b.score!=null?Number(b.score):null;
      const justification=String(b.justification||'').trim();
      const related_client_id=b.related_client_id||null;
      const related_contract_id=b.related_contract_id||null;
      if(title.length<5||title.length>200) return json(res,400,{error:'invalid_title'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      const validTypes=['mercado','cliente','concorrente','tendencia','risco','oportunidade'];
      if(!validTypes.includes(intel_type)) return json(res,400,{error:'invalid_intel_type'});
      if(source_module.length<3||source_module.length>100) return json(res,400,{error:'invalid_source_module'});
      if(score!=null && (!Number.isFinite(score)||score<0||score>10)) return json(res,400,{error:'invalid_score'});
      if(justification.length<10||justification.length>2000) return json(res,400,{error:'invalid_justification_justificativa_obrigatoria'});
      const protocol=generateProtocol('INTEL-EXT');
      const { rows } = await pool.query(`INSERT INTO ext_commercial_intelligence (protocol, title, description, intel_type, source_module, score, justification, related_client_id, related_contract_id, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [protocol, title, description, intel_type, source_module, score, justification, related_client_id, related_contract_id, sess.identityId||null]);
      await auditLog({ action:'ext_commercial_intelligence_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ protocol, intel_type } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      const is_human_approved=b.is_human_approved;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_commercial_intelligence WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=status||existing[0].status;
      const valid=['rascunho','em_analise','aprovada','rejeitada','arquivada','em_uso'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      if(nextStatus==='em_uso' && !existing[0].is_human_approved && is_human_approved!==true) return json(res,400,{error:'human_approval_required_uso_bloqueado_sem_aprovacao_humana'});
      const approved=is_human_approved!=null?!!is_human_approved:existing[0].is_human_approved;
      const approved_at=approved&&!existing[0].approved_at?new Date():existing[0].approved_at;
      const { rows } = await pool.query(`UPDATE ext_commercial_intelligence SET status=$2, is_human_approved=$3, approved_by_identity=$4, approved_at=$5, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus, approved, approved?sess.identityId||null:existing[0].approved_by_identity, approved_at]);
      await auditLog({ action:'ext_commercial_intelligence_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus, approved } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // EXT-15 emergencial apoio
  const handleEmergencyChannels = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM ext_emergency_channels ORDER BY name ASC LIMIT 200`);
      return json(res,200,{items:rows, note:'testar recebimento e atendimento antes disponibilizar'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const name=String(b.name||'').trim();
      const channel_type=String(b.channel_type||'').trim();
      const recipient_contact=String(b.recipient_contact||'').trim();
      const availability=b.availability||'24x7';
      const escalation=b.escalation||[];
      const description=b.description?String(b.description).trim():null;
      if(name.length<3||name.length>200) return json(res,400,{error:'invalid_name'});
      const validTypes=['telefone','whatsapp','email','sms','push','radio','outro'];
      if(!validTypes.includes(channel_type)) return json(res,400,{error:'invalid_channel_type'});
      if(recipient_contact.length<5||recipient_contact.length>500) return json(res,400,{error:'invalid_recipient_contact'});
      if(description && (description.length<10||description.length>2000)) return json(res,400,{error:'invalid_description'});
      const { rows } = await pool.query(`INSERT INTO ext_emergency_channels (name, channel_type, recipient_contact, availability, escalation, description, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [name, channel_type, recipient_contact, JSON.stringify(availability), JSON.stringify(escalation), description, sess.identityId||null]);
      await auditLog({ action:'ext_emergency_channel_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ name, channel_type } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      const is_tested=b.is_tested;
      const test_result=b.test_result?String(b.test_result).trim():null;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_emergency_channels WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=status||existing[0].status;
      const valid=['ativo','inativo','em_teste','falhou','suspenso'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      if(is_tested===true && !test_result) return json(res,400,{error:'test_result_required'});
      const tested=is_tested!=null?!!is_tested:existing[0].is_tested;
      const last_tested=tested?new Date():existing[0].last_tested_at;
      const { rows } = await pool.query(`UPDATE ext_emergency_channels SET status=$2, is_tested=$3, last_tested_at=$4, test_result=$5, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus, tested, last_tested, test_result||existing[0].test_result]);
      await auditLog({ action:'ext_emergency_channel_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus, tested } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleEmergencyTests = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const channel_id=url.searchParams.get('channel_id');
      let q=`SELECT * FROM ext_emergency_tests`;
      const params=[];
      if(channel_id){ params.push(channel_id); q+=` WHERE channel_id=$${params.length}`; }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const channel_id=b.channel_id;
      const test_type=String(b.test_type||'').trim();
      const result=b.result?String(b.result).trim():null;
      if(!channel_id) return json(res,400,{error:'missing_channel_id'});
      if(test_type.length<3||test_type.length>100) return json(res,400,{error:'invalid_test_type'});
      if(result && (result.length<3||result.length>2000)) return json(res,400,{error:'invalid_result'});
      const { rows } = await pool.query(`INSERT INTO ext_emergency_tests (channel_id, test_type, result, created_by_identity) VALUES ($1,$2,$3,$4) RETURNING *`, [channel_id, test_type, result, sess.identityId||null]);
      // marcar canal como testado se sucesso
      if(result && (result.toLowerCase().includes('sucesso')||result.toLowerCase().includes('ok')||result.toLowerCase().includes('recebido'))){
        await pool.query(`UPDATE ext_emergency_channels SET is_tested=true, last_tested_at=NOW(), test_result=$2, updated_at=NOW() WHERE id=$1`, [channel_id, result]);
      }
      await auditLog({ action:'ext_emergency_test_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ channel_id, test_type } });
      return json(res,201,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // EXT-16 central monitoramento / vídeo — projeto separado, privacidade
  // aprovada antes da implantação.
  //
  // Alinhamento com a migração 087 (defeito corrigido nesta fatia): a tabela
  // `ext_central_projects` exige protocolo e avaliação de privacidade
  // OBRIGATÓRIA (20..2000) e guarda as duas aprovações — não existe coluna de
  // status neste recurso. O handler anterior inseria sem protocolo, mandava
  // `client_account_id` (coluna inexistente) e atualizava `status`,
  // `privacy_approved_at` e `privacy_approved_by_identity` (inexistentes):
  // todo POST/PATCH devolvia 500. A tela agora registra somente o que o
  // servidor realmente grava.
  const handleCentralProjects = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM ext_central_projects ORDER BY created_at DESC LIMIT 200`);
      return json(res,200,{items:rows, note:'projeto separado privacidade aprovada antes implantacao'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const title=String(b.title||'').trim();
      const description=String(b.description||'').trim();
      const scope=String(b.scope||'').trim();
      const provider=b.provider?String(b.provider).trim():null;
      const privacy_assessment=String(b.privacy_assessment||'').trim();
      if(title.length<5||title.length>200) return json(res,400,{error:'invalid_title'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      if(scope.length<10||scope.length>2000) return json(res,400,{error:'invalid_scope'});
      if(provider && (provider.length<3||provider.length>200)) return json(res,400,{error:'invalid_provider'});
      // Avaliação de privacidade é obrigatória neste recurso (NOT NULL na 087).
      if(privacy_assessment.length<20||privacy_assessment.length>2000) return json(res,400,{error:'invalid_privacy_assessment'});
      const protocol=generateProtocol('CENT-EXT');
      const { rows } = await pool.query(`INSERT INTO ext_central_projects (protocol, title, description, scope, provider, privacy_assessment, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [protocol, title, description, scope, provider, privacy_assessment, sess.identityId||null]);
      await auditLog({ action:'ext_central_project_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ protocol, scope } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_central_projects WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const current=existing[0];
      const privacyApproved=b.is_privacy_approved!=null?!!b.is_privacy_approved:current.is_privacy_approved;
      const approved=b.is_approved!=null?!!b.is_approved:current.is_approved;
      // Regra de negócio preservada: implantação exige privacidade aprovada.
      if(approved && !privacyApproved) return json(res,400,{error:'privacy_approval_required_projeto_separado_privacidade_aprovada'});
      const { rows } = await pool.query(`UPDATE ext_central_projects SET is_privacy_approved=$2, is_approved=$3, approved_by_identity=CASE WHEN $3 THEN COALESCE(approved_by_identity,$4::uuid) ELSE approved_by_identity END, approved_at=CASE WHEN $3 AND approved_at IS NULL THEN NOW() ELSE approved_at END, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, privacyApproved, approved, sess.identityId||null]);
      await auditLog({ action:'ext_central_project_update', actor:sess.identityId||'system', target:id, meta:{ privacyApproved, approved } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // EXT-17 biometria facial — projeto separado, não coleta por padrão.
  //
  // Alinhamento com a migração 087 (defeito corrigido nesta fatia): o handler
  // anterior inseria sem `protocol` (NOT NULL), validava impacto/base legal em
  // faixas diferentes das do banco e atualizava `collection_active` quando a
  // coluna se chama `is_collection_active`; além disso oferecia estados que não
  // existem no enum `ext_biometry_status`. Todo POST/PATCH devolvia 500.
  const handleBiometryProjects = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM ext_biometry_projects ORDER BY created_at DESC LIMIT 200`);
      return json(res,200,{items:rows, note:'biometria projeto separado privacidade aprovada nao coletar por padrao collection_active requer is_approved'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const title=String(b.title||'').trim();
      const description=String(b.description||'').trim();
      // Compatibilidade: o protótipo enviava `outra`; o enum do banco é `outro`.
      const rawType=String(b.biometry_type||'facial').trim();
      const biometry_type=rawType==='outra'?'outro':rawType;
      const necessity=String(b.necessity||'').trim();
      const impact_assessment=String(b.impact_assessment||'').trim();
      const legal_basis=String(b.legal_basis||'').trim();
      // A tabela não tem coluna de conta do cliente: o vínculo fica no
      // contrato/projeto correspondente. O campo é aceito e ignorado para não
      // quebrar consumidores antigos do protótipo.

      if(title.length<5||title.length>200) return json(res,400,{error:'invalid_title'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      if(!['facial','digital','iris','voz','outro'].includes(biometry_type)) return json(res,400,{error:'invalid_biometry_type'});
      if(necessity.length<20||necessity.length>2000) return json(res,400,{error:'invalid_necessity'});
      if(impact_assessment.length<20||impact_assessment.length>2000) return json(res,400,{error:'invalid_impact_assessment'});
      if(legal_basis.length<10||legal_basis.length>1000) return json(res,400,{error:'invalid_legal_basis'});
      const protocol=generateProtocol('BIO-EXT');
      const { rows } = await pool.query(`INSERT INTO ext_biometry_projects (protocol, title, description, biometry_type, necessity, impact_assessment, legal_basis, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [protocol, title, description, biometry_type, necessity, impact_assessment, legal_basis, sess.identityId||null]);
      await auditLog({ action:'ext_biometry_project_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ protocol, biometry_type } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_biometry_projects WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const current=existing[0];
      const nextStatus=b.status?String(b.status).trim():current.status;
      const valid=['rascunho','em_avaliacao','aprovado','rejeitado','em_implementacao','ativo','desativado'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      const approved=b.is_approved!=null?!!b.is_approved:current.is_approved;
      const collectionActive=b.collection_active!=null?!!b.collection_active:current.is_collection_active;
      // Regras preservadas: coleta e status ativo exigem projeto aprovado.
      if(collectionActive && !approved) return json(res,400,{error:'collection_requires_approval_nao_coletar_biometria_por_padrao'});
      if(nextStatus==='ativo' && !approved) return json(res,400,{error:'approval_required_biometria_projeto_separado_privacidade_aprovada'});
      const { rows } = await pool.query(`UPDATE ext_biometry_projects SET status=$2::ext_biometry_status, is_approved=$3, approved_by_identity=CASE WHEN $3 THEN COALESCE(approved_by_identity,$5::uuid) ELSE approved_by_identity END, approved_at=CASE WHEN $3 AND approved_at IS NULL THEN NOW() ELSE approved_at END, is_collection_active=$4, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus, approved, collectionActive, sess.identityId||null]);
      await auditLog({ action:'ext_biometry_project_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus, approved, collectionActive } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // AI-10 automações determinísticas — vencimentos, distribuição de tarefa e
  // cobrança interna antes de qualquer agente autônomo (AI-01..09 desligados).
  //
  // Alinhamento com a migração 087 (defeito corrigido nesta fatia): as tabelas
  // são `ai_deterministic_automations`/`ai_automation_logs` (o handler antigo
  // consultava `ext_ai_*`, que não existe) e não há coluna de agendamento. Os
  // estados válidos são os do enum `ai_automation_status`. Todo GET/POST
  // devolvia 500.
  const handleAiAutomations = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM ai_deterministic_automations ORDER BY name ASC LIMIT 200`);
      return json(res,200,{items:rows, note:'AI-10 automacao deterministica vencimentos distribuicao tarefas cobranca interna antes agentes autonomos AI-01..09 desligado'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const name=String(b.name||'').trim();
      const description=String(b.description||'').trim();
      // Compatibilidade com o protótipo (`outra`); o enum do banco é `outro`.
      const rawType=String(b.automation_type||'vencimento').trim();
      const automation_type=rawType==='outra'?'outro':rawType;
      const rules=b.rules||{};
      if(name.length<3||name.length>200) return json(res,400,{error:'invalid_name'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      const validTypes=['vencimento','distribuicao_tarefa','cobranca_interna','escalonamento','outro'];
      if(!validTypes.includes(automation_type)) return json(res,400,{error:'invalid_automation_type'});
      const { rows } = await pool.query(`INSERT INTO ai_deterministic_automations (name, description, automation_type, rules, created_by_identity) VALUES ($1,$2,$3::ai_automation_type,$4,$5) RETURNING *`, [name, description, automation_type, JSON.stringify(rules), sess.identityId||null]);
      await auditLog({ action:'ext_ai_automation_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ name, automation_type } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ai_deterministic_automations WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=b.status?String(b.status).trim():existing[0].status;
      const valid=['rascunho','ativa','pausada','desativada','falha'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      const { rows } = await pool.query(`UPDATE ai_deterministic_automations SET status=$2::ai_automation_status, is_active=CASE WHEN $2='ativa' THEN true WHEN $2 IN ('pausada','desativada','falha','rascunho') THEN false ELSE is_active END, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus]);
      await auditLog({ action:'ext_ai_automation_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleAiAutomationLogs = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const automation_id=url.searchParams.get('automation_id');
      let q=`SELECT * FROM ai_automation_logs`;
      const params=[];
      if(automation_id){ params.push(automation_id); q+=` WHERE automation_id=$${params.length}`; }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'registro manual e auditavel; a tela nao executa a automacao'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const automation_id=b.automation_id;
      const action=String(b.action||'').trim();
      const result=String(b.result||'').trim();
      const target_type=b.target_type?String(b.target_type).trim():null;
      const target_id=b.target_id?String(b.target_id).trim():null;
      const is_error=b.success!=null?!b.success:false;
      if(!automation_id) return json(res,400,{error:'missing_automation_id'});
      if(action.length<3||action.length>200) return json(res,400,{error:'invalid_action'});
      // `result` é NOT NULL e 10..1000 na 087: sem ele não há registro de execução.
      if(result.length<10||result.length>1000) return json(res,400,{error:'invalid_result'});
      if(target_type && (target_type.length<3||target_type.length>100)) return json(res,400,{error:'invalid_target_type'});
      if(target_id && (target_id.length<3||target_id.length>200)) return json(res,400,{error:'invalid_target_id'});
      const { rows } = await pool.query(`INSERT INTO ai_automation_logs (automation_id, action, target_type, target_id, result, is_error) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [automation_id, action, target_type, target_id, result, is_error]);
      // Contadores: execução registrada atualiza run_count e error_count.
      await pool.query(`UPDATE ai_deterministic_automations SET run_count=run_count+1, error_count=error_count + CASE WHEN $2 THEN 1 ELSE 0 END, last_run_at=NOW(), last_error=CASE WHEN $2 THEN $3 ELSE last_error END, updated_at=NOW() WHERE id=$1`, [automation_id, is_error, result]);
      await auditLog({ action:'ext_ai_automation_log_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ automation_id, is_error } });
      return json(res,201,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  return { handlePeriodicReports, handleCommercialIntelligence, handleEmergencyChannels, handleEmergencyTests, handleCentralProjects, handleBiometryProjects, handleAiAutomations, handleAiAutomationLogs };
}
