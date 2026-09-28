export function createOriginMetricsApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const readJson = async (req) => { const chunks=[]; for await (const c of req) chunks.push(c); const raw=Buffer.concat(chunks).toString('utf8'); if(!raw) return {}; try{ return JSON.parse(raw);} catch{ return {}; } };
  const hashValue = (v) => { try{ const crypto=require('node:crypto'); return crypto.createHash('sha256').update(String(v)).digest('hex'); } catch{ return null; } };

  const handleOriginMetrics = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const origin=url.searchParams.get('origin');
      let q=`SELECT * FROM pub_origin_metrics WHERE 1=1`;
      const params=[];
      if(origin){ params.push(origin); q+=` AND origin=$${params.length}`; }
      q+=` ORDER BY period_start DESC, conversion_rate DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'mensuração origem e conversão com minimização de dados'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const origin=String(b.origin||'').trim();
      const campaign=b.campaign?String(b.campaign).trim():null;
      const channel=b.channel?String(b.channel).trim():null;
      const period_start=b.period_start||null;
      const period_end=b.period_end||null;
      const total_leads=b.total_leads!=null?Number(b.total_leads):0;
      const converted_leads=b.converted_leads!=null?Number(b.converted_leads):0;
      const total_opportunities=b.total_opportunities!=null?Number(b.total_opportunities):0;
      const total_contracts=b.total_contracts!=null?Number(b.total_contracts):0;
      const notes=b.notes?String(b.notes).trim():null;
      if(origin.length<3||origin.length>100) return json(res,400,{error:'invalid_origin'});
      if(campaign && (campaign.length<3||campaign.length>100)) return json(res,400,{error:'invalid_campaign'});
      if(channel && (channel.length<1||channel.length>100)) return json(res,400,{error:'invalid_channel'});
      if(!period_start||!period_end) return json(res,400,{error:'missing_period'});
      if(new Date(period_end) < new Date(period_start)) return json(res,400,{error:'invalid_period_end_before_start'});
      if(!Number.isFinite(total_leads)||total_leads<0) return json(res,400,{error:'invalid_total_leads'});
      if(!Number.isFinite(converted_leads)||converted_leads<0) return json(res,400,{error:'invalid_converted'});
      if(converted_leads>total_leads) return json(res,400,{error:'converted_exceeds_total'});
      if(notes && (notes.length<10||notes.length>1000)) return json(res,400,{error:'invalid_notes'});
      try{
        const { rows } = await pool.query(`INSERT INTO pub_origin_metrics (origin, campaign, channel, period_start, period_end, total_leads, converted_leads, total_opportunities, total_contracts, is_minimized, notes, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11) RETURNING *`,
          [origin, campaign, channel, period_start, period_end, total_leads, converted_leads, total_opportunities, total_contracts, notes, sess.identityId||null]);
        await auditLog({ action:'origin_metric_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ origin, campaign } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_period_origin'}); throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM pub_origin_metrics WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const total_leads=b.total_leads!=null?Number(b.total_leads):existing[0].total_leads;
      const converted_leads=b.converted_leads!=null?Number(b.converted_leads):existing[0].converted_leads;
      if(converted_leads>total_leads) return json(res,400,{error:'converted_exceeds_total'});
      const { rows } = await pool.query(`UPDATE pub_origin_metrics SET total_leads=$2, converted_leads=$3, total_opportunities=$4, total_contracts=$5, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, total_leads, converted_leads, b.total_opportunities!=null?Number(b.total_opportunities):existing[0].total_opportunities, b.total_contracts!=null?Number(b.total_contracts):existing[0].total_contracts]);
      await auditLog({ action:'origin_metric_update', actor:sess.identityId||'system', target:id, meta:{ total_leads, converted_leads } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleConversionEvents = async (req,res) => {
    if(req.method==='GET'){
      if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
      const sess=requireSession(req);
      if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
      const url=new URL(req.url,'http://localhost');
      const origin=url.searchParams.get('origin');
      let q=`SELECT * FROM pub_conversion_events WHERE is_minimized=true`;
      const params=[];
      if(origin){ params.push(origin); q+=` AND origin=$${params.length}`; }
      q+=` ORDER BY occurred_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'eventos conversão minimização dados sem IP/user_agent original apenas hash'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const event_type=String(b.event_type||'lead_received').trim();
      const origin=b.origin?String(b.origin).trim():null;
      const campaign=b.campaign?String(b.campaign).trim():null;
      const channel=b.channel?String(b.channel).trim():null;
      const lead_id=b.lead_id||null;
      const opportunity_id=b.opportunity_id||null;
      const contract_id=b.contract_id||null;
      const ip=b.ip||b.ip_hash||'';
      const ua=b.user_agent||b.user_agent_hash||'';
      const valid=['lead_received','lead_converted','opportunity_created','proposal_sent','contract_created','visit_confirmed','outro'];
      if(!valid.includes(event_type)) return json(res,400,{error:'invalid_event_type'});
      if(origin && (origin.length<3||origin.length>100)) return json(res,400,{error:'invalid_origin'});
      if(campaign && (campaign.length<3||campaign.length>100)) return json(res,400,{error:'invalid_campaign'});
      const ip_hash=ip?hashValue(ip):null;
      const ua_hash=ua?hashValue(ua):null;
      const { rows } = await pool.query(`INSERT INTO pub_conversion_events (event_type, origin, campaign, channel, lead_id, opportunity_id, contract_id, is_minimized, ip_hash, user_agent_hash, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10) RETURNING *`,
        [event_type, origin, campaign, channel, lead_id, opportunity_id, contract_id, ip_hash, ua_hash, JSON.stringify(b.metadata||{})]);
      await auditLog({ action:'conversion_event_create', actor:'system', target:rows[0].id, meta:{ event_type, origin, is_minimized: true } });
      return json(res,201,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleAbTests = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const status=url.searchParams.get('status');
      let q=`SELECT * FROM pub_ab_tests WHERE 1=1`;
      const params=[];
      if(status){ params.push(status); q+=` AND status=$${params.length}`; }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'testes A/B somente após tráfego hipótese e tratamento de dados definidos minimização'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const test_key=String(b.test_key||'').trim().toLowerCase();
      const hypothesis=String(b.hypothesis||'').trim();
      const description=String(b.description||'').trim();
      const variant_a=b.variant_a||{};
      const variant_b=b.variant_b||{};
      const metric_name=String(b.metric_name||'').trim();
      const traffic_required=b.traffic_required!=null?Number(b.traffic_required):100;
      const treatment=String(b.treatment||'').trim();
      if(test_key.length<3||test_key.length>100) return json(res,400,{error:'invalid_test_key'});
      if(hypothesis.length<20||hypothesis.length>2000) return json(res,400,{error:'invalid_hypothesis'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      if(metric_name.length<3||metric_name.length>200) return json(res,400,{error:'invalid_metric_name'});
      if(!Number.isFinite(traffic_required)||traffic_required<10) return json(res,400,{error:'invalid_traffic_required'});
      if(treatment.length<10||treatment.length>2000) return json(res,400,{error:'invalid_treatment'});
      try{
        const { rows } = await pool.query(`INSERT INTO pub_ab_tests (test_key, hypothesis, description, variant_a, variant_b, metric_name, traffic_required, treatment, privacy_compliance_note, is_privacy_compliant, created_by_identity, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11) RETURNING *`,
          [test_key, hypothesis, description, JSON.stringify(variant_a), JSON.stringify(variant_b), metric_name, traffic_required, treatment, 'teste A/B com minimização de dados, hipótese e tratamento definidos, sem dados pessoais', sess.identityId||null, sess.role||null]);
        await pool.query(`INSERT INTO pub_ab_test_history (test_id, previous_status, next_status, reason, changed_by_identity, changed_by_name) VALUES ($1,NULL,$2,$3,$4,$5)`, [rows[0].id, 'rascunho', 'Criação inicial A/B hipótese e tratamento definidos minimização', sess.identityId||null, sess.role||null]);
        await auditLog({ action:'ab_test_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ test_key, hypothesis: hypothesis.substring(0,100) } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_test_key'}); throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      const winner=b.winner?String(b.winner).trim():null;
      const result_data=b.result_data;
      const reason=String(b.reason||'Atualização A/B').trim();
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM pub_ab_tests WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const cur=existing[0];
      const nextStatus=status||cur.status;
      const valid=['rascunho','em_revisao','aprovado','em_execucao','concluido','cancelado','arquivado'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      if(winner && !['A','B','empate','inconclusivo'].includes(winner)) return json(res,400,{error:'invalid_winner'});
      if(nextStatus==='em_execucao' && cur.traffic_required<10) return json(res,400,{error:'traffic_required_not_met', note:'testes A/B somente após tráfego hipótese e tratamento definidos'});
      if(reason.length<10||reason.length>1000) return json(res,400,{error:'invalid_reason'});
      const { rows } = await pool.query(`UPDATE pub_ab_tests SET status=$2, winner=COALESCE($3,winner), result_data=COALESCE($4,result_data), version=version+1, approved_by_identity=CASE WHEN $2 IN ('aprovado','em_execucao') THEN $5 ELSE approved_by_identity END, approved_by_name=CASE WHEN $2 IN ('aprovado','em_execucao') THEN $6 ELSE approved_by_name END, approved_at=CASE WHEN $2 IN ('aprovado','em_execucao') THEN NOW() ELSE approved_at END, started_at=CASE WHEN $2='em_execucao' THEN NOW() ELSE started_at END, concluded_at=CASE WHEN $2='concluido' THEN NOW() ELSE concluded_at END, updated_at=NOW() WHERE id=$1 RETURNING *`,
        [id, nextStatus, winner||null, result_data?JSON.stringify(result_data):null, sess.identityId||null, sess.role||null]);
      await pool.query(`INSERT INTO pub_ab_test_history (test_id, previous_status, next_status, reason, changed_by_identity, changed_by_name) VALUES ($1,$2,$3,$4,$5,$6)`, [id, cur.status, nextStatus, reason, sess.identityId||null, sess.role||null]);
      const actionMap={ rascunho:'ab_test_update', em_revisao:'ab_test_update', aprovado:'ab_test_approve', em_execucao:'ab_test_start', concluido:'ab_test_conclude', cancelado:'ab_test_update', arquivado:'ab_test_update' };
      await auditLog({ action:actionMap[nextStatus]||'ab_test_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus, winner, reason: reason.substring(0,200) } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  return { handleOriginMetrics, handleConversionEvents, handleAbTests };
}
