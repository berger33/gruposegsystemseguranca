const CATEGORIES=['armazenamento','mensagens','ia','banco','infra','licencas','outro'];
const METRICS=['storage_gb','messages_count','ia_tokens','db_gb','bandwidth_gb','cpu_hours','api_calls','outro'];
const SEVERITIES=['info','warning','critical'];

function sanitize(v,max=2000){ if(typeof v!=='string') return ''; return v.trim().slice(0,max); }
function uuidRe(){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; }

export function createBudgetApi({ pool, auditLog, sameOrigin, requireSession, requireRole }){
  async function handleBudgets(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const category=url.searchParams.get('category');
      const active=url.searchParams.get('is_active');
      const cond=[]; const params=[]; let i=1;
      if(category && CATEGORIES.includes(category)){ cond.push(`category=$${i++}`); params.push(category); }
      if(active==='true'){ cond.push(`is_active=true`); } else if(active==='false'){ cond.push(`is_active=false`); }
      let sql='SELECT * FROM operational_budgets';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY period_start DESC LIMIT 200';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({budgets:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const name=sanitize(data.name,200); const category=String(data.category||'infra').toLowerCase();
      const period_start=data.period_start? String(data.period_start): null;
      const period_end=data.period_end? String(data.period_end): null;
      const budgeted_amount=data.budgeted_amount!=null? parseFloat(data.budgeted_amount): null;
      const currency=sanitize(data.currency||'BRL',10); const alert_threshold=parseInt(data.alert_threshold_percent,10)||80;
      const notes=sanitize(data.notes||'',2000);
      if(name.length<3){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'name_min_3'})); return; }
      if(!CATEGORIES.includes(category)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_category'})); return; }
      if(!period_start||!period_end){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'period_required'})); return; }
      const ps=new Date(period_start); const pe=new Date(period_end);
      if(isNaN(ps.getTime())||isNaN(pe.getTime())||pe<ps){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_period'})); return; }
      if(budgeted_amount==null||!Number.isFinite(budgeted_amount)||budgeted_amount<0){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_budgeted_amount'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO operational_budgets (name, category, period_start, period_end, budgeted_amount, currency, alert_threshold_percent, notes, created_by, created_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [name, category, ps.toISOString().slice(0,10), pe.toISOString().slice(0,10), budgeted_amount, currency, alert_threshold, notes||null, by, byId]);
      await auditLog({ action:'budget_create', actor: by, target: r.rows[0].id, meta:{ category, budgeted_amount } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({budget:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const actual_amount=data.actual_amount!=null? parseFloat(data.actual_amount): undefined;
      const is_active=data.is_active!=null? Boolean(data.is_active): undefined;
      const notes=data.notes!=null? sanitize(data.notes,2000): undefined;
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      const fields=[]; const vals=[]; let idx=1;
      if(actual_amount!=null){ if(!Number.isFinite(actual_amount)||actual_amount<0){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_actual_amount'})); return; } fields.push(`actual_amount=$${idx++}`); vals.push(actual_amount); }
      if(is_active!=null){ fields.push(`is_active=$${idx++}`); vals.push(is_active); }
      if(notes!==undefined){ fields.push(`notes=$${idx++}`); vals.push(notes||null); }
      fields.push(`updated_at=now()`); vals.push(id);
      if(fields.length===1){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'no_changes'})); return; }
      const r=await pool.query(`UPDATE operational_budgets SET ${fields.join(', ')} WHERE id=$${idx} RETURNING *`, vals);
      if(!r.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      // Check threshold and create alert if needed
      const b=r.rows[0];
      const pct = parseFloat(b.budgeted_amount)>0? (parseFloat(b.actual_amount)/parseFloat(b.budgeted_amount))*100 : 0;
      if(pct >= b.alert_threshold_percent){
        const sev = pct>=100? 'critical' : pct>=90? 'critical' : 'warning';
        await pool.query(`INSERT INTO usage_alerts (budget_id, metric, category, severity, title, message, threshold_value, current_value)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [b.id, 'outro', b.category, sev, `Orçamento ${b.name} em ${pct.toFixed(1)}%`, `Orçamento ${b.name} atingiu ${pct.toFixed(1)}% do limite ${b.budgeted_amount} ${b.currency}, atual ${b.actual_amount}`, b.budgeted_amount* b.alert_threshold_percent/100, b.actual_amount]);
      }
      await auditLog({ action:'budget_update', actor: sess.username||'unknown', target: id, meta:{ actual_amount } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({budget:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleMetrics(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const r=await pool.query('SELECT * FROM usage_metrics ORDER BY measured_at DESC LIMIT 200');
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({metrics:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const metric=String(data.metric||'storage_gb').toLowerCase(); const category=String(data.category||'armazenamento').toLowerCase();
      const value=data.value!=null? parseFloat(data.value): null; const unit=sanitize(data.unit||'count',20); const source=sanitize(data.source||'system',100);
      const details=data.details||null;
      if(!METRICS.includes(metric)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_metric'})); return; }
      if(!CATEGORIES.includes(category)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_category'})); return; }
      if(value==null||!Number.isFinite(value)||value<0){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_value'})); return; }
      const r=await pool.query(`INSERT INTO usage_metrics (metric, category, value, unit, source, details) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [metric, category, value, unit, source, details? JSON.stringify(details): null]);
      await auditLog({ action:'usage_metric_create', actor: sess.username||'unknown', target: r.rows[0].id, meta:{ metric, category, value } });
      // Check against budgets for same category current period and generate alert if needed
      const budgets=await pool.query(`SELECT * FROM operational_budgets WHERE category=$1 AND is_active=true AND period_start <= CURRENT_DATE AND period_end >= CURRENT_DATE`, [category]);
      for(const b of budgets.rows){
        // Simplified: if metric value exceeds budgeted_amount * threshold% (for storage_gb vs armazenamento budget)
        // We'll create alert if value > threshold
        const threshold = parseFloat(b.budgeted_amount) * b.alert_threshold_percent/100;
        if(value >= threshold){
          await pool.query(`INSERT INTO usage_alerts (budget_id, metric, category, severity, title, message, threshold_value, current_value)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [b.id, metric, category, value>=parseFloat(b.budgeted_amount)? 'critical':'warning', `Uso ${metric} em ${category} alto`, `Métrica ${metric} valor ${value}${unit} atingiu limite ${threshold} para orçamento ${b.name}`, threshold, value]);
        }
      }
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({metric:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleAlerts(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const r=await pool.query('SELECT * FROM usage_alerts ORDER BY created_at DESC LIMIT 200');
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({alerts:r.rows})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||'');
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      const by=sess.username||sess.user||'unknown';
      const r=await pool.query(`UPDATE usage_alerts SET is_acknowledged=true, acknowledged_by=$1, acknowledged_at=now() WHERE id=$2 RETURNING *`, [by, id]);
      if(!r.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      await auditLog({ action:'usage_alert_ack', actor: by, target: id });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({alert:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  return { handleBudgets, handleMetrics, handleAlerts };
}
