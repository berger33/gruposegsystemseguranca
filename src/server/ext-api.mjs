export function createExtApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const readJson = async (req) => { const chunks=[]; for await (const c of req) chunks.push(c); const raw=Buffer.concat(chunks).toString('utf8'); if(!raw) return {}; try{ return JSON.parse(raw);} catch{ return {}; } };
  const generateProtocol = (prefix) => { const d=new Date(); const y=d.getFullYear().toString(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); const rand=Math.random().toString(36).substring(2,6).toUpperCase(); return `${prefix}-${y}${m}${day}-${rand}`; };

  // EXT-01 frota
  const handleFleetVehicles = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM ext_fleet_vehicles ORDER BY plate ASC LIMIT 200`);
      return json(res,200,{items:rows, note:'frota propria existir historico/custo por veiculo alerta manutencao'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const plate=String(b.plate||'').trim();
      const model=String(b.model||'').trim();
      const manufacturer=b.manufacturer?String(b.manufacturer).trim():null;
      const year=b.year!=null?Number(b.year):null;
      const fuel_type=String(b.fuel_type||'flex').trim();
      const responsible_name=b.responsible_name?String(b.responsible_name).trim():null;
      const mileage=b.mileage!=null?Number(b.mileage):0;
      const cost_center=b.cost_center?String(b.cost_center).trim():null;
      const notes=b.notes?String(b.notes).trim():null;
      if(plate.length<3||plate.length>20) return json(res,400,{error:'invalid_plate'});
      if(model.length<3||model.length>200) return json(res,400,{error:'invalid_model'});
      if(manufacturer && (manufacturer.length<2||manufacturer.length>200)) return json(res,400,{error:'invalid_manufacturer'});
      if(year!=null && (!Number.isFinite(year)||year<1900||year>2100)) return json(res,400,{error:'invalid_year'});
      const validFuel=['gasolina','etanol','diesel','flex','eletrico','hibrido','outro'];
      if(!validFuel.includes(fuel_type)) return json(res,400,{error:'invalid_fuel_type'});
      if(responsible_name && (responsible_name.length<2||responsible_name.length>200)) return json(res,400,{error:'invalid_responsible'});
      if(!Number.isFinite(mileage)||mileage<0) return json(res,400,{error:'invalid_mileage'});
      if(cost_center && (cost_center.length<3||cost_center.length>100)) return json(res,400,{error:'invalid_cost_center'});
      if(notes && (notes.length<10||notes.length>1000)) return json(res,400,{error:'invalid_notes'});
      try{
        const { rows } = await pool.query(`INSERT INTO ext_fleet_vehicles (plate, model, manufacturer, year, fuel_type, responsible_name, responsible_identity, mileage, cost_center, notes, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [plate, model, manufacturer, year, fuel_type, responsible_name, sess.identityId||null, mileage, cost_center, notes, sess.identityId||null]);
        await auditLog({ action:'ext_fleet_vehicle_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ plate } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_plate'}); throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_fleet_vehicles WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const status=b.status?String(b.status).trim():existing[0].status;
      const validStatus=['disponivel','em_uso','em_manutencao','baixado','reservado'];
      if(!validStatus.includes(status)) return json(res,400,{error:'invalid_status'});
      const mileage=b.mileage!=null?Number(b.mileage):existing[0].mileage;
      const next_maintenance=b.next_maintenance_date!==undefined?b.next_maintenance_date:existing[0].next_maintenance_date;
      const { rows } = await pool.query(`UPDATE ext_fleet_vehicles SET status=$2, mileage=$3, next_maintenance_date=$4, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, status, mileage, next_maintenance]);
      await auditLog({ action:'ext_fleet_vehicle_update', actor:sess.identityId||'system', target:id, meta:{ status, mileage } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleFleetFuelLogs = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const vehicle_id=url.searchParams.get('vehicle_id');
      let q=`SELECT fl.*, v.plate FROM ext_fleet_fuel_logs fl JOIN ext_fleet_vehicles v ON v.id=fl.vehicle_id`;
      const params=[];
      if(vehicle_id){ params.push(vehicle_id); q+=` WHERE fl.vehicle_id=$${params.length}`; }
      q+=` ORDER BY fl.fuel_date DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const vehicle_id=b.vehicle_id;
      const fuel_date=b.fuel_date;
      const liters=Number(b.liters);
      const cost_cents=Number(b.cost_cents);
      const mileage=b.mileage!=null?Number(b.mileage):null;
      const station=b.station?String(b.station).trim():null;
      if(!vehicle_id) return json(res,400,{error:'missing_vehicle_id'});
      if(!fuel_date) return json(res,400,{error:'missing_fuel_date'});
      if(!Number.isFinite(liters)||liters<=0) return json(res,400,{error:'invalid_liters'});
      if(!Number.isFinite(cost_cents)||cost_cents<0) return json(res,400,{error:'invalid_cost'});
      if(mileage!=null && (!Number.isFinite(mileage)||mileage<0)) return json(res,400,{error:'invalid_mileage'});
      if(station && (station.length<3||station.length>200)) return json(res,400,{error:'invalid_station'});
      const { rows } = await pool.query(`INSERT INTO ext_fleet_fuel_logs (vehicle_id, fuel_date, liters, cost_cents, mileage, station, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [vehicle_id, fuel_date, liters, cost_cents, mileage, station, sess.identityId||null]);
      await auditLog({ action:'ext_fleet_fuel_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ vehicle_id, cost_cents } });
      return json(res,201,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleFleetMaintenanceLogs = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const vehicle_id=url.searchParams.get('vehicle_id');
      let q=`SELECT ml.*, v.plate FROM ext_fleet_maintenance_logs ml JOIN ext_fleet_vehicles v ON v.id=ml.vehicle_id`;
      const params=[];
      if(vehicle_id){ params.push(vehicle_id); q+=` WHERE ml.vehicle_id=$${params.length}`; }
      q+=` ORDER BY ml.performed_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const vehicle_id=b.vehicle_id;
      const maintenance_type=String(b.maintenance_type||'').trim();
      const description=String(b.description||'').trim();
      const cost_cents=Number(b.cost_cents);
      const mileage=b.mileage!=null?Number(b.mileage):null;
      const performed_at=b.performed_at;
      const next_due_date=b.next_due_date||null;
      if(!vehicle_id) return json(res,400,{error:'missing_vehicle_id'});
      if(maintenance_type.length<3||maintenance_type.length>100) return json(res,400,{error:'invalid_maintenance_type'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      if(!Number.isFinite(cost_cents)||cost_cents<0) return json(res,400,{error:'invalid_cost'});
      if(!performed_at) return json(res,400,{error:'missing_performed_at'});
      const { rows } = await pool.query(`INSERT INTO ext_fleet_maintenance_logs (vehicle_id, maintenance_type, description, cost_cents, mileage, performed_at, next_due_date, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [vehicle_id, maintenance_type, description, cost_cents, mileage, performed_at, next_due_date, sess.identityId||null]);
      // atualizar veículo last/next maintenance
      await pool.query(`UPDATE ext_fleet_vehicles SET last_maintenance_date=$2, next_maintenance_date=$3, updated_at=NOW() WHERE id=$1`, [vehicle_id, performed_at, next_due_date]);
      await auditLog({ action:'ext_fleet_maintenance_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ vehicle_id, maintenance_type } });
      return json(res,201,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleFleetDocuments = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const vehicle_id=url.searchParams.get('vehicle_id');
      let q=`SELECT * FROM ext_fleet_documents`;
      const params=[];
      if(vehicle_id){ params.push(vehicle_id); q+=` WHERE vehicle_id=$${params.length}`; }
      q+=` ORDER BY expiry_date ASC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const vehicle_id=b.vehicle_id;
      const document_type=String(b.document_type||'').trim();
      const document_number=b.document_number?String(b.document_number).trim():null;
      const expiry_date=b.expiry_date||null;
      const file_name=b.file_name?String(b.file_name).trim():null;
      const file_url=b.file_url?String(b.file_url).trim():null;
      const storage_key=b.storage_key?String(b.storage_key).trim():null;
      if(!vehicle_id) return json(res,400,{error:'missing_vehicle_id'});
      if(document_type.length<3||document_type.length>100) return json(res,400,{error:'invalid_document_type'});
      if(document_number && (document_number.length<3||document_number.length>200)) return json(res,400,{error:'invalid_document_number'});
      if(file_name && (file_name.length<1||file_name.length>500)) return json(res,400,{error:'invalid_file_name'});
      if(file_url && (file_url.length<5||file_url.length>1000)) return json(res,400,{error:'invalid_file_url'});
      if(storage_key && (storage_key.length<5||storage_key.length>500)) return json(res,400,{error:'invalid_storage_key'});
      try{
        const { rows } = await pool.query(`INSERT INTO ext_fleet_documents (vehicle_id, document_type, document_number, expiry_date, file_name, file_url, storage_key, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [vehicle_id, document_type, document_number, expiry_date, file_name, file_url, storage_key, sess.identityId||null]);
        await auditLog({ action:'ext_fleet_document_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ vehicle_id, document_type } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_storage_key'}); throw e; }
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // EXT-02 terceiros
  const handleThirdParties = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT tp.*, c.title as contract_title FROM ext_third_parties tp LEFT JOIN crm_contracts c ON c.id=tp.contract_id ORDER BY tp.name ASC LIMIT 200`);
      return json(res,200,{items:rows, note:'terceiro acessa so OS/contrato autorizado e perde acesso ao termino'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const name=String(b.name||'').trim();
      const document=b.document?String(b.document).trim():null;
      const category=b.category?String(b.category).trim():null;
      const contract_id=b.contract_id||null;
      const responsible_name=b.responsible_name?String(b.responsible_name).trim():null;
      const access_start=b.access_start||null;
      const access_end=b.access_end||null;
      const evaluation_score=b.evaluation_score!=null?Number(b.evaluation_score):null;
      const notes=b.notes?String(b.notes).trim():null;
      if(name.length<3||name.length>200) return json(res,400,{error:'invalid_name'});
      if(document && (document.length<3||document.length>30)) return json(res,400,{error:'invalid_document'});
      if(category && (category.length<3||category.length>100)) return json(res,400,{error:'invalid_category'});
      if(responsible_name && (responsible_name.length<2||responsible_name.length>200)) return json(res,400,{error:'invalid_responsible'});
      if(evaluation_score!=null && (!Number.isFinite(evaluation_score)||evaluation_score<0||evaluation_score>10)) return json(res,400,{error:'invalid_score'});
      if(notes && (notes.length<10||notes.length>1000)) return json(res,400,{error:'invalid_notes'});
      if(access_start && access_end && new Date(access_end) < new Date(access_start)) return json(res,400,{error:'invalid_access_period'});
      const { rows } = await pool.query(`INSERT INTO ext_third_parties (name, document, category, contract_id, responsible_name, responsible_identity, access_start, access_end, evaluation_score, notes, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [name, document, category, contract_id, responsible_name, sess.identityId||null, access_start, access_end, evaluation_score, notes, sess.identityId||null]);
      await auditLog({ action:'ext_third_party_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ name, contract_id } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_third_parties WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const status=b.status?String(b.status).trim():existing[0].status;
      const valid=['ativo','inativo','suspenso','encerrado'];
      if(!valid.includes(status)) return json(res,400,{error:'invalid_status'});
      const evaluation_score=b.evaluation_score!==undefined? (b.evaluation_score!=null?Number(b.evaluation_score):null) : existing[0].evaluation_score;
      const access_end=b.access_end!==undefined?b.access_end:existing[0].access_end;
      const { rows } = await pool.query(`UPDATE ext_third_parties SET status=$2, evaluation_score=$3, access_end=$4, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, status, evaluation_score, access_end]);
      // se encerrado, registrar log acesso perde acesso ao término
      if(status==='encerrado'){
        await pool.query(`INSERT INTO ext_third_party_access_logs (third_party_id, access_type, granted_by_identity, revoked_at, reason) VALUES ($1,'revogacao',$2,NOW(),$3)`, [id, sess.identityId||null, 'Terceiro encerrado perde acesso ao término']);
      }
      await auditLog({ action:'ext_third_party_update', actor:sess.identityId||'system', target:id, meta:{ status } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleThirdPartyDocuments = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const third_party_id=url.searchParams.get('third_party_id');
      let q=`SELECT * FROM ext_third_party_documents`;
      const params=[];
      if(third_party_id){ params.push(third_party_id); q+=` WHERE third_party_id=$${params.length}`; }
      q+=` ORDER BY expiry_date ASC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const third_party_id=b.third_party_id;
      const document_type=String(b.document_type||'').trim();
      const file_name=b.file_name?String(b.file_name).trim():null;
      const file_url=b.file_url?String(b.file_url).trim():null;
      const storage_key=b.storage_key?String(b.storage_key).trim():null;
      const expiry_date=b.expiry_date||null;
      if(!third_party_id) return json(res,400,{error:'missing_third_party_id'});
      if(document_type.length<3||document_type.length>100) return json(res,400,{error:'invalid_document_type'});
      if(file_name && (file_name.length<1||file_name.length>500)) return json(res,400,{error:'invalid_file_name'});
      if(file_url && (file_url.length<5||file_url.length>1000)) return json(res,400,{error:'invalid_file_url'});
      if(storage_key && (storage_key.length<5||storage_key.length>500)) return json(res,400,{error:'invalid_storage_key'});
      try{
        const { rows } = await pool.query(`INSERT INTO ext_third_party_documents (third_party_id, document_type, file_name, file_url, storage_key, expiry_date, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [third_party_id, document_type, file_name, file_url, storage_key, expiry_date, sess.identityId||null]);
        await auditLog({ action:'ext_third_party_document_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ third_party_id, document_type } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_storage_key'}); throw e; }
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // EXT-03 licitações
  const handleBiddingNotices = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM ext_bidding_notices ORDER BY deadline_date ASC LIMIT 200`);
      return json(res,200,{items:rows, note:'checklist e alerta por edital dossie versionado'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const title=String(b.title||'').trim();
      const description=String(b.description||'').trim();
      const edital_number=String(b.edital_number||'').trim();
      const publication_date=b.publication_date||null;
      const deadline_date=b.deadline_date||null;
      const responsible_name=b.responsible_name?String(b.responsible_name).trim():null;
      const estimated_value_cents=b.estimated_value_cents!=null?Number(b.estimated_value_cents):null;
      if(title.length<5||title.length>200) return json(res,400,{error:'invalid_title'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      if(edital_number.length<3||edital_number.length>200) return json(res,400,{error:'invalid_edital_number'});
      if(publication_date && deadline_date && new Date(deadline_date) < new Date(publication_date)) return json(res,400,{error:'invalid_deadline_before_publication'});
      if(responsible_name && (responsible_name.length<2||responsible_name.length>200)) return json(res,400,{error:'invalid_responsible'});
      if(estimated_value_cents!=null && (!Number.isFinite(estimated_value_cents)||estimated_value_cents<0)) return json(res,400,{error:'invalid_estimated_value'});
      const protocol=generateProtocol('LIC-EXT');
      try{
        const { rows } = await pool.query(`INSERT INTO ext_bidding_notices (protocol, title, description, edital_number, publication_date, deadline_date, responsible_name, estimated_value_cents, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [protocol, title, description, edital_number, publication_date, deadline_date, responsible_name, estimated_value_cents, sess.identityId||null]);
        await auditLog({ action:'ext_bidding_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ protocol, edital_number } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505'){ if(e.constraint && e.constraint.includes('edital_number')) return json(res,409,{error:'duplicate_edital_number'}); return json(res,409,{error:'duplicate_protocol'}); } throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      const result=b.result?String(b.result).trim():null;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ext_bidding_notices WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=status||existing[0].status;
      const valid=['rascunho','publicado','em_analise','homologado','vencido','cancelado','deserto'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      if(result && (result.length<10||result.length>2000)) return json(res,400,{error:'invalid_result'});
      const { rows } = await pool.query(`UPDATE ext_bidding_notices SET status=$2, result=$3, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus, result||existing[0].result]);
      await auditLog({ action:'ext_bidding_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleBiddingDocuments = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const bidding_id=url.searchParams.get('bidding_id');
      let q=`SELECT * FROM ext_bidding_documents`;
      const params=[];
      if(bidding_id){ params.push(bidding_id); q+=` WHERE bidding_id=$${params.length}`; }
      q+=` ORDER BY version DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const bidding_id=b.bidding_id;
      const document_type=String(b.document_type||'').trim();
      const file_name=String(b.file_name||'').trim();
      const file_url=String(b.file_url||'').trim();
      const storage_key=String(b.storage_key||'').trim();
      if(!bidding_id) return json(res,400,{error:'missing_bidding_id'});
      if(document_type.length<3||document_type.length>100) return json(res,400,{error:'invalid_document_type'});
      if(file_name.length<1||file_name.length>500) return json(res,400,{error:'invalid_file_name'});
      if(file_url.length<5||file_url.length>1000) return json(res,400,{error:'invalid_file_url'});
      if(storage_key.length<5||storage_key.length>500) return json(res,400,{error:'invalid_storage_key'});
      // versionamento
      const { rows: maxRows } = await pool.query(`SELECT COALESCE(MAX(version),0) as max_version FROM ext_bidding_documents WHERE bidding_id=$1`, [bidding_id]);
      const nextVersion=Number(maxRows[0].max_version)+1;
      try{
        const { rows } = await pool.query(`INSERT INTO ext_bidding_documents (bidding_id, document_type, file_name, file_url, storage_key, version, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [bidding_id, document_type, file_name, file_url, storage_key, nextVersion, sess.identityId||null]);
        await auditLog({ action:'ext_bidding_document_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ bidding_id, version: nextVersion } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_storage_key'}); throw e; }
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  // EXT-04 portal fornecedores
  const handleSupplierPortalQuotations = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
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
    const sess=requireSession(req);
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
    const sess=requireSession(req);
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
    const sess=requireSession(req);
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

  return { handleFleetVehicles, handleFleetFuelLogs, handleFleetMaintenanceLogs, handleFleetDocuments, handleThirdParties, handleThirdPartyDocuments, handleBiddingNotices, handleBiddingDocuments, handleSupplierPortalQuotations, handleQualityNonconformities, handleQualityActions, handleSatisfactionSurveys };
}
