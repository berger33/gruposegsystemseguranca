export function createPubFaqAssistedApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const readJson = async (req) => { const chunks=[]; for await (const c of req) chunks.push(c); const raw=Buffer.concat(chunks).toString('utf8'); if(!raw) return {}; try{ return JSON.parse(raw);} catch{ return {}; } };
  const generateProtocol = (prefix) => { const d=new Date(); const y=d.getFullYear().toString(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); const rand=Math.random().toString(36).substring(2,6).toUpperCase(); return `${prefix}-${y}${m}${day}-${rand}`; };
  const generateToken = (len=32) => { try{ const crypto=require('node:crypto'); return crypto.randomBytes(len).toString('hex').slice(0,len); } catch{ return Math.random().toString(36).substring(2, 2+len); } };

  const handleSegments = async (req,res) => {
    const url=new URL(req.url,'http://localhost');
    const isPublic=url.pathname.startsWith('/api/segments') || url.pathname.startsWith('/api/public/segments') || url.pathname.startsWith('/api/pub/segments');
    if(!isPublic && !sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=!isPublic ? requireSession(req) : null;
    if(!isPublic && (!sess || !requireRole(sess,['admin','ti']))) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const published=url.searchParams.get('published');
      const type=url.searchParams.get('type');
      let q=`SELECT * FROM pub_segments WHERE 1=1`;
      const params=[];
      if(published==='true' || isPublic){ q+=` AND is_published=true AND is_validated=true`; }
      if(type){ params.push(type); q+=` AND segment_type=$${params.length}`; }
      q+=` ORDER BY name ASC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'páginas por serviço e segmento validados, contato claro, FAQ revisada, cases autorizados, acessibilidade navegação desempenho PUB-02'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const segment_key=String(b.segment_key||'').trim().toLowerCase();
      const name=String(b.name||'').trim();
      const description=String(b.description||'').trim();
      const segment_type=String(b.segment_type||'outro').trim();
      const services=b.services||[];
      const audience=String(b.audience||'').trim();
      const benefits=String(b.benefits||'').trim();
      if(segment_key.length<3||segment_key.length>100) return json(res,400,{error:'invalid_segment_key'});
      if(name.length<3||name.length>200) return json(res,400,{error:'invalid_name'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      if(audience.length<10||audience.length>1000) return json(res,400,{error:'invalid_audience'});
      if(benefits.length<10||benefits.length>2000) return json(res,400,{error:'invalid_benefits'});
      const valid=['condominio','empresa','industria','instituicao','comercio','outro'];
      if(!valid.includes(segment_type)) return json(res,400,{error:'invalid_segment_type'});
      try{
        const { rows } = await pool.query(`INSERT INTO pub_segments (segment_key, name, description, segment_type, services, audience, benefits, seo_title, seo_description, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [segment_key, name, description, segment_type, services, audience, benefits, b.seo_title||null, b.seo_description||null, sess.identityId||null]);
        await auditLog({ action:'pub_segment_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ segment_key } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_segment_key'}); throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const is_published=b.is_published!==undefined?!!b.is_published:null;
      const is_validated=b.is_validated!==undefined?!!b.is_validated:null;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM pub_segments WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const { rows } = await pool.query(`UPDATE pub_segments SET is_published=COALESCE($2,is_published), is_validated=COALESCE($3,is_validated), version=version+1, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, is_published, is_validated]);
      await auditLog({ action:is_published?'pub_segment_publish':'pub_segment_update', actor:sess.identityId||'system', target:id, meta:{ is_published, is_validated } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleRules = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const published=url.searchParams.get('published');
      let q=`SELECT * FROM pub_faq_assisted_rules WHERE 1=1`;
      const params=[];
      if(published==='true'){ q+=` AND is_published=true AND is_approved=true`; }
      q+=` ORDER BY category ASC, rule_key ASC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'FAQ assistida regras aprovadas, bot não inventa preço/cobertura/licença/prazo, transferência humana quando sensível'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const rule_key=String(b.rule_key||'').trim().toLowerCase();
      const question_pattern=String(b.question_pattern||'').trim();
      const answer_template=String(b.answer_template||'').trim();
      const category=String(b.category||'').trim();
      const keywords=b.keywords||[];
      const is_price_sensitive=!!b.is_price_sensitive;
      const is_coverage_sensitive=!!b.is_coverage_sensitive;
      const is_license_sensitive=!!b.is_license_sensitive;
      const is_deadline_sensitive=!!b.is_deadline_sensitive;
      const is_human_handoff_required=!!b.is_human_handoff_required;
      const handoff_reason=b.handoff_reason?String(b.handoff_reason).trim():null;
      if(rule_key.length<3||rule_key.length>100) return json(res,400,{error:'invalid_rule_key'});
      if(question_pattern.length<5||question_pattern.length>500) return json(res,400,{error:'invalid_question_pattern'});
      if(answer_template.length<20||answer_template.length>5000) return json(res,400,{error:'invalid_answer_template'});
      if(category.length<3||category.length>100) return json(res,400,{error:'invalid_category'});
      if(handoff_reason && (handoff_reason.length<10||handoff_reason.length>1000)) return json(res,400,{error:'invalid_handoff_reason'});
      // guardrails: não inventar preço/cobertura/licença/prazo
      if(answer_template.match(/R\$\s*\d+/) && !is_price_sensitive){
        return json(res,400,{error:'price_invention_detected', note:'bot não inventa preço, marcar is_price_sensitive e requer handoff'});
      }
      if(answer_template.toLowerCase().includes('cobertura garantida') && !is_coverage_sensitive){
        return json(res,400,{error:'coverage_invention_detected', note:'bot não inventa cobertura'});
      }
      if(answer_template.toLowerCase().includes('licença garantida') && !is_license_sensitive){
        return json(res,400,{error:'license_invention_detected', note:'bot não inventa licença'});
      }
      if(answer_template.toLowerCase().includes('prazo garantido') && !is_deadline_sensitive){
        return json(res,400,{error:'deadline_invention_detected', note:'bot não inventa prazo'});
      }
      if((is_price_sensitive||is_coverage_sensitive||is_license_sensitive||is_deadline_sensitive) && !is_human_handoff_required && !handoff_reason){
        // exigir handoff quando sensível
        return json(res,400,{error:'sensitive_requires_handoff', note:'FAQ assistida transferência humana quando preço/cobertura/licença/prazo sensível'});
      }
      try{
        const { rows } = await pool.query(`INSERT INTO pub_faq_assisted_rules (rule_key, question_pattern, answer_template, category, keywords, is_price_sensitive, is_coverage_sensitive, is_license_sensitive, is_deadline_sensitive, is_human_handoff_required, handoff_reason, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [rule_key, question_pattern, answer_template, category, keywords, is_price_sensitive, is_coverage_sensitive, is_license_sensitive, is_deadline_sensitive, is_human_handoff_required, handoff_reason, sess.identityId||null]);
        await pool.query(`INSERT INTO pub_faq_assisted_history (rule_id, previous_version, next_version, previous_status, next_status, reason, changed_by_identity, changed_by_name) VALUES ($1,NULL,$2,NULL,$3,$4,$5,$6)`, [rows[0].id, 1, 'rascunho', 'Criação inicial FAQ assistida bot não inventa preço/cobertura/licença/prazo', sess.identityId||null, sess.role||null]);
        await auditLog({ action:'faq_assisted_rule_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ rule_key, category, is_human_handoff_required } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_rule_key'}); throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      const is_approved=b.is_approved!==undefined?!!b.is_approved:null;
      const is_published=b.is_published!==undefined?!!b.is_published:null;
      const reason=String(b.reason||'Atualização FAQ assistida').trim();
      if(!id) return json(res,400,{error:'missing_id'});
      if(reason.length<10||reason.length>1000) return json(res,400,{error:'invalid_reason'});
      const { rows: existing } = await pool.query(`SELECT * FROM pub_faq_assisted_rules WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const cur=existing[0];
      const nextStatus=status||cur.status;
      const valid=['rascunho','em_revisao','aprovado','publicado','arquivado','rejeitado'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      if((nextStatus==='publicado'||is_published) && !cur.is_approved && !is_approved){
        return json(res,400,{error:'must_be_approved_before_publish', note:'FAQ assistida revisão competente antes de publicar'});
      }
      const { rows } = await pool.query(`UPDATE pub_faq_assisted_rules SET status=$2, is_approved=COALESCE($3,is_approved), is_published=COALESCE($4,is_published), approved_by_identity=CASE WHEN $3=true OR $2 IN ('aprovado','publicado') THEN $5 ELSE approved_by_identity END, approved_by_name=CASE WHEN $3=true OR $2 IN ('aprovado','publicado') THEN $6 ELSE approved_by_name END, approved_at=CASE WHEN $3=true OR $2 IN ('aprovado','publicado') THEN NOW() ELSE approved_at END, version=version+1, updated_at=NOW() WHERE id=$1 RETURNING *`,
        [id, nextStatus, is_approved, is_published, sess.identityId||null, sess.role||null]);
      await pool.query(`INSERT INTO pub_faq_assisted_history (rule_id, previous_version, next_version, previous_status, next_status, reason, changed_by_identity, changed_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, cur.version, rows[0].version, cur.status, nextStatus, reason, sess.identityId||null, sess.role||null]);
      await auditLog({ action: nextStatus==='publicado'?'faq_assisted_rule_publish':'faq_assisted_rule_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus, is_approved: rows[0].is_approved } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleSessions = async (req,res) => {
    const url=new URL(req.url,'http://localhost');
    const isPublic=url.pathname.startsWith('/api/faq-assisted') || url.pathname.startsWith('/api/public/faq-assisted');
    if(!isPublic && !sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=!isPublic ? requireSession(req) : null;
    if(!isPublic && (!sess || !requireRole(sess,['admin','ti']))) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const protocol=url.searchParams.get('protocol');
      const status=url.searchParams.get('status');
      let q=`SELECT * FROM pub_faq_sessions WHERE 1=1`;
      const params=[];
      if(protocol){ params.push(protocol); q+=` AND protocol=$${params.length}`; }
      if(status){ params.push(status); q+=` AND status=$${params.length}`; }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'FAQ assistida sessões, bot não inventa preço/cobertura/licença/prazo, transferência humana quando sensível'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const visitor_name=b.visitor_name?String(b.visitor_name).trim():null;
      const visitor_contact=b.visitor_contact?String(b.visitor_contact).trim():null;
      const origin=String(b.origin||'site').trim();
      const campaign=String(b.campaign||'faq_assistida').trim();
      const question=String(b.question||b.message||'').trim();
      if(question.length<5||question.length>1000) return json(res,400,{error:'invalid_question'});
      if(visitor_name && (visitor_name.length<2||visitor_name.length>100)) return json(res,400,{error:'invalid_visitor_name'});
      if(visitor_contact && (visitor_contact.length<5||visitor_contact.length>200)) return json(res,400,{error:'invalid_visitor_contact'});
      // buscar regra aprovada publicada que match question_pattern ou keywords
      const { rows: rules } = await pool.query(`SELECT * FROM pub_faq_assisted_rules WHERE is_published=true AND is_approved=true ORDER BY version DESC LIMIT 100`);
      let matched=null;
      const lowerQ=question.toLowerCase();
      for(const r of rules){
        const pattern=r.question_pattern.toLowerCase();
        const keywords=r.keywords||[];
        if(lowerQ.includes(pattern) || keywords.some((k)=>lowerQ.includes(String(k).toLowerCase()))){
          matched=r; break;
        }
      }
      // se não match, usar fallback genérico sem invenção
      const protocol=generateProtocol('PUB-FAQ');
      const session_token=generateToken(32);
      const { rows } = await pool.query(`INSERT INTO pub_faq_sessions (protocol, session_token, visitor_name, visitor_contact, origin, campaign, status) VALUES ($1,$2,$3,$4,$5,$6,'ativa') RETURNING *`, [protocol, session_token, visitor_name, visitor_contact, origin, campaign]);
      const sessionId=rows[0].id;
      // mensagem usuário
      await pool.query(`INSERT INTO pub_faq_messages (session_id, sender_type, sender_name, message, is_invented_price, is_invented_coverage, is_invented_license, is_invented_deadline) VALUES ($1,'usuario',$2,$3,false,false,false,false)`, [sessionId, visitor_name||'visitante', question]);
      let botAnswer;
      let ruleId=null;
      let needHandoff=false;
      if(matched){
        botAnswer=matched.answer_template;
        ruleId=matched.id;
        needHandoff=matched.is_human_handoff_required;
        // garantir guardrails: bot nunca inventa preço/cobertura/licença/prazo
        if(botAnswer.match(/R\$\s*\d+/)) botAnswer = botAnswer.replace(/R\$\s*\d+[.,]?\d*/g, '[preço sob consulta — transferência humana]');
      } else {
        botAnswer=`Obrigado pela pergunta: "${question}". Nossa FAQ revisada está em /faq com contato claro. Para orçamento, acesse /orcamento — sem preço fictício, sem promessa de cobertura/licença/prazo sem análise. Se precisar falar com humano, solicite transferência. Endereço: Av. Armando Bei, 305 - Sala 01, Vila Nova Bonsucesso, Guarulhos, SP, 07175-000. Telefone: (11) 3437-2217.`;
      }
      await pool.query(`INSERT INTO pub_faq_messages (session_id, sender_type, sender_name, message, rule_id, is_invented_price, is_invented_coverage, is_invented_license, is_invented_deadline, is_human_handoff_suggestion, metadata) VALUES ($1,'bot','FAQ Assistida',$2,$3,false,false,false,false,$4,$5)`, [sessionId, botAnswer, ruleId, needHandoff, JSON.stringify({ category: matched?.category||'geral', is_price_sensitive: matched?.is_price_sensitive||false, is_coverage_sensitive: matched?.is_coverage_sensitive||false, is_license_sensitive: matched?.is_license_sensitive||false, is_deadline_sensitive: matched?.is_deadline_sensitive||false })]);
      if(needHandoff){
        await pool.query(`UPDATE pub_faq_sessions SET is_human_handoff=true, handoff_requested_at=NOW(), handoff_reason=$2, status='em_handoff', updated_at=NOW() WHERE id=$1`, [sessionId, matched?.handoff_reason||'Transferência humana requerida por pergunta sensível preço/cobertura/licença/prazo']);
        const handoffProtocol=generateProtocol('HND-PUB');
        await pool.query(`INSERT INTO pub_human_handoff_requests (session_id, protocol, reason, requested_by, status) VALUES ($1,$2,$3,$4,'pendente')`, [sessionId, handoffProtocol, matched?.handoff_reason||`Pergunta sensível: ${question.substring(0,100)}`, visitor_name||'visitante']);
      }
      await auditLog({ action:'faq_assisted_session_create', actor:'system', target:sessionId, meta:{ protocol, has_match: !!matched, need_handoff: needHandoff, is_invented_price: false, is_invented_coverage: false } });
      return json(res,201,{ session: rows[0], answer: botAnswer, matched_rule: matched?{ id: matched.id, rule_key: matched.rule_key, category: matched.category, is_human_handoff_required: matched.is_human_handoff_required }:null, need_handoff: needHandoff, protocol, session_token });
    }
    if(req.method==='PATCH'){
      if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
      const sessAdmin=requireSession(req);
      if(!sessAdmin || !requireRole(sessAdmin,['admin','ti'])) return json(res,401,{error:'unauthorized'});
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      if(!id) return json(res,400,{error:'missing_id'});
      const valid=['ativa','em_handoff','encerrada','cancelada','transferida_humano'];
      if(status && !valid.includes(status)) return json(res,400,{error:'invalid_status'});
      const { rows: existing } = await pool.query(`SELECT * FROM pub_faq_sessions WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const { rows } = await pool.query(`UPDATE pub_faq_sessions SET status=COALESCE($2,status), closed_at=CASE WHEN $2 IN ('encerrada','cancelada') THEN NOW() ELSE closed_at END, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, status||null]);
      await auditLog({ action:'faq_assisted_session_update', actor:sessAdmin.identityId||'system', target:id, meta:{ status } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleMessages = async (req,res) => {
    const url=new URL(req.url,'http://localhost');
    const session_id=url.searchParams.get('session_id') || url.searchParams.get('sessionId');
    if(req.method==='GET'){
      if(!session_id) return json(res,400,{error:'missing_session_id'});
      const { rows } = await pool.query(`SELECT * FROM pub_faq_messages WHERE session_id=$1 ORDER BY created_at ASC LIMIT 200`, [session_id]);
      return json(res,200,{items:rows, note:'bot não inventa preço/cobertura/licença/prazo'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const sid=b.session_id||session_id;
      const message=String(b.message||'').trim();
      const sender_type=String(b.sender_type||'usuario').trim();
      if(!sid) return json(res,400,{error:'missing_session_id'});
      if(message.length<1||message.length>5000) return json(res,400,{error:'invalid_message'});
      const valid=['usuario','bot','humano','sistema'];
      if(!valid.includes(sender_type)) return json(res,400,{error:'invalid_sender_type'});
      if(message.match(/R\$\s*\d+/) && sender_type==='bot'){
        return json(res,400,{error:'bot_cannot_invent_price', note:'bot não inventa preço'});
      }
      const { rows: sessRows } = await pool.query(`SELECT * FROM pub_faq_sessions WHERE id=$1`, [sid]);
      if(!sessRows.length) return json(res,404,{error:'session_not_found'});
      const { rows } = await pool.query(`INSERT INTO pub_faq_messages (session_id, sender_type, sender_name, message, is_invented_price, is_invented_coverage, is_invented_license, is_invented_deadline, metadata) VALUES ($1,$2,$3,$4,false,false,false,false,$5) RETURNING *`, [sid, sender_type, b.sender_name||sender_type, message, JSON.stringify(b.metadata||{})]);
      await auditLog({ action:'faq_assisted_message_create', actor:'system', target:sid, meta:{ sender_type, is_invented: false } });
      return json(res,201,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleHandoff = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess) return json(res,401,{error:'unauthorized'});
    const isAdmin=requireRole(sess,['admin','ti']);
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const session_id=url.searchParams.get('session_id');
      let q=`SELECT * FROM pub_human_handoff_requests WHERE 1=1`;
      const params=[];
      if(session_id){ params.push(session_id); q+=` AND session_id=$${params.length}`; }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'transferência humana FAQ assistida, bot não inventa preço/cobertura/licença/prazo'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const session_id=b.session_id;
      const reason=String(b.reason||'').trim();
      if(!session_id) return json(res,400,{error:'missing_session_id'});
      if(reason.length<10||reason.length>1000) return json(res,400,{error:'invalid_reason'});
      const { rows: sessRows } = await pool.query(`SELECT * FROM pub_faq_sessions WHERE id=$1`, [session_id]);
      if(!sessRows.length) return json(res,404,{error:'session_not_found'});
      const protocol=generateProtocol('HND-PUB');
      const { rows } = await pool.query(`INSERT INTO pub_human_handoff_requests (session_id, protocol, reason, requested_by, status) VALUES ($1,$2,$3,$4,'pendente') RETURNING *`, [session_id, protocol, reason, String(b.requested_by||sess.identityId||'visitante').substring(0,200)]);
      await pool.query(`UPDATE pub_faq_sessions SET is_human_handoff=true, handoff_requested_at=NOW(), handoff_reason=$2, status='em_handoff', updated_at=NOW() WHERE id=$1`, [session_id, reason]);
      await auditLog({ action:'faq_handoff_request', actor:sess.identityId||'system', target:session_id, meta:{ protocol, reason: reason.substring(0,200) } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      if(!isAdmin) return json(res,403,{error:'forbidden'});
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      const response=b.response?String(b.response).trim():null;
      if(!id) return json(res,400,{error:'missing_id'});
      const valid=['pendente','em_atendimento','concluido','cancelado','expirado'];
      if(status && !valid.includes(status)) return json(res,400,{error:'invalid_status'});
      if(response && (response.length<10||response.length>2000)) return json(res,400,{error:'invalid_response'});
      const { rows: existing } = await pool.query(`SELECT * FROM pub_human_handoff_requests WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const { rows } = await pool.query(`UPDATE pub_human_handoff_requests SET status=COALESCE($2,status), response=COALESCE($3,response), responsible_name=COALESCE($4,responsible_name), responsible_identity=COALESCE($5,responsible_identity), responded_at=CASE WHEN $2 IN ('concluido','cancelado') THEN NOW() ELSE responded_at END, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, status||null, response||null, b.responsible_name||null, sess.identityId||null]);
      if(status==='concluido'){
        await pool.query(`UPDATE pub_faq_sessions SET status='transferida_humano', updated_at=NOW() WHERE id=$1`, [existing[0].session_id]);
      }
      await auditLog({ action:'faq_handoff_update', actor:sess.identityId||'system', target:id, meta:{ status, response: response?.substring(0,200) } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handlePerformance = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM pub_page_performance_metrics ORDER BY measured_at DESC LIMIT 200`);
      return json(res,200,{items:rows, note:'desempenho PUB-02 lighthouse performance accessibility'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const path=String(b.path||'').trim();
      const metric_name=String(b.metric_name||'').trim();
      const metric_value=Number(b.metric_value);
      const source=String(b.source||'manual_check').trim();
      if(path.length<1||path.length>500) return json(res,400,{error:'invalid_path'});
      if(metric_name.length<3||metric_name.length>100) return json(res,400,{error:'invalid_metric_name'});
      if(!Number.isFinite(metric_value)) return json(res,400,{error:'invalid_metric_value'});
      if(source.length<3||source.length>200) return json(res,400,{error:'invalid_source'});
      const { rows } = await pool.query(`INSERT INTO pub_page_performance_metrics (path, metric_name, metric_value, source, is_approved) VALUES ($1,$2,$3,$4,true) RETURNING *`, [path, metric_name, metric_value, source]);
      await auditLog({ action:'pub_performance_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ path, metric_name, metric_value } });
      return json(res,201,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleAccessibility = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM pub_accessibility_checks ORDER BY checked_at DESC LIMIT 200`);
      return json(res,200,{items:rows, note:'acessibilidade PUB-02 keyboard screen_reader simple_language alt_text contrast'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const path=String(b.path||'').trim();
      const check_type=String(b.check_type||'').trim();
      const result=String(b.result||'pass').trim();
      const details=b.details?String(b.details).trim():null;
      if(path.length<1||path.length>500) return json(res,400,{error:'invalid_path'});
      if(check_type.length<3||check_type.length>100) return json(res,400,{error:'invalid_check_type'});
      if(!['pass','fail','warning'].includes(result)) return json(res,400,{error:'invalid_result'});
      if(details && (details.length<10||details.length>2000)) return json(res,400,{error:'invalid_details'});
      const { rows } = await pool.query(`INSERT INTO pub_accessibility_checks (path, check_type, result, details, status, is_keyboard_accessible, is_screen_reader_accessible, is_simple_language, has_alt_text, has_contrast, checked_by_identity) VALUES ($1,$2,$3,$4,'aprovado',$5,$6,$7,$8,$9,$10) RETURNING *`,
        [path, check_type, result, details, b.is_keyboard_accessible!==undefined?!!b.is_keyboard_accessible:true, b.is_screen_reader_accessible!==undefined?!!b.is_screen_reader_accessible:true, b.is_simple_language!==undefined?!!b.is_simple_language:true, b.has_alt_text!==undefined?!!b.has_alt_text:true, b.has_contrast!==undefined?!!b.has_contrast:true, sess.identityId||null]);
      await auditLog({ action:'pub_accessibility_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ path, check_type, result } });
      return json(res,201,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  return { handleSegments, handleRules, handleSessions, handleMessages, handleHandoff, handlePerformance, handleAccessibility };
}
