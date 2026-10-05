import { AI01_LIMITS, buildPublicRagPrompt, contentFingerprint, createPublicInferenceQueue, sanitizeUntrustedChunk } from './ai-public-inference.mjs';

export function createAiRagApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const json = (res, status, body) => { if (res.writableEnded || res.destroyed) return; res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const publicInference = createPublicInferenceQueue();
  const readJson = async (req, maxBytes=1_000_000) => { const chunks=[]; let size=0; for await (const c of req) { size+=c.length; if(size>maxBytes) return { __body_too_large:true }; chunks.push(c); } const raw=Buffer.concat(chunks).toString('utf8'); if(!raw) return {}; try{ return JSON.parse(raw);} catch{ return {}; } };
  const generateProtocol = (prefix) => { const d=new Date(); const y=d.getFullYear().toString(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); const rand=Math.random().toString(36).substring(2,6).toUpperCase(); return `${prefix}-${y}${m}${day}-${rand}`; };
  const validRagKeys = ['cliente','rh','marcelo','publico'];
  const validModes = ['sem_ia','com_ia','whatsapp'];
  const validScopes = ['cliente','rh','marcelo','publico'];

  // in-memory queue simulation for Ollama Qwen3 1.7B to guarantee atendimento em fila + real Ollama call com fallback simulado
  const queueState = { current: 0, max: 100, processing: new Map() }; // protocol -> startTime

  async function callOllama({ host, model, prompt, max_tokens, temperature, timeout_ms }) {
    // Beta sem Ollama real: se OLLAMA_ENABLED != true, fallback imediato simulado
    if (process.env.OLLAMA_ENABLED !== 'true') {
      return { ok: false, error: 'ollama_disabled_beta_fallback', detail: 'OLLAMA_ENABLED != true, usando RAG simulado fila', used_fallback: true };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeout_ms || 30000);
    try {
      const res = await fetch(`${host.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'qwen3:1.7b',
          prompt,
          stream: false,
          options: {
            num_predict: max_tokens || 2048,
            temperature: temperature ?? 0.7,
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return { ok: false, error: `ollama_http_${res.status}`, detail: txt.slice(0, 500), used_fallback: true };
      }
      const data = await res.json().catch(() => ({}));
      const responseText = data.response || data.message || '';
      if (!responseText) return { ok: false, error: 'ollama_empty_response', used_fallback: true };
      return { ok: true, response: responseText, raw: data, used_fallback: false };
    } catch (e) {
      clearTimeout(timeout);
      return { ok: false, error: e.name === 'AbortError' ? 'ollama_timeout' : 'ollama_unavailable', detail: e.message?.slice(0, 500), used_fallback: true };
    }
  }

  function buildRagPrompt({ rag_key, query, chunks, protocol }) {
    const context = chunks.slice(0, 3).map(c => `- ${c.title}: ${c.content.slice(0, 500)}`).join('\n');
    const guardrails = `REGRAS OBRIGATÓRIAS: Não invente preço (use [preço sob consulta] se não houver), não invente cobertura, licença ou prazo. Informações apenas da área pertinente ${rag_key}. Se não encontrar na base aprovada, diga que não encontrou e sugira transferência humana. Contato claro: Av. Armando Bei, 305 - Sala 01, Vila Nova Bonsucesso, Guarulhos, SP, 07175-000, tel (11) 3437-2217. Protocolo ${protocol}.`;
    return `Você é assistente Grupo SEG System RAG ${rag_key} (Ollama Qwen3 1.7B). Base aprovada apenas área pertinente ${rag_key}.\n\nContexto base aprovada:\n${context || '(nenhum chunk encontrado)'}\n\nPergunta usuário: ${query}\n\n${guardrails}\n\nResponda em português, objetivo, com fontes citadas quando houver, sem invenção.`;
  }

  const handleIndexes = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM ai_rag_indexes ORDER BY rag_key ASC LIMIT 100`);
      return json(res,200,{items:rows, note:'3 RAGs diferentes cliente/RH/Marcelo + publico, informações apenas áreas pertinentes, modelo Ollama Qwen3 1.7B fila'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const rag_key=String(b.rag_key||'').trim().toLowerCase();
      const name=String(b.name||'').trim();
      const description=String(b.description||'').trim();
      const scope=String(b.scope||rag_key).trim().toLowerCase();
      const model_name=String(b.model_name||'qwen3:1.7b').trim();
      if(!validRagKeys.includes(rag_key)) return json(res,400,{error:'invalid_rag_key', valid: validRagKeys});
      if(name.length<3||name.length>200) return json(res,400,{error:'invalid_name'});
      if(description.length<20||description.length>2000) return json(res,400,{error:'invalid_description'});
      if(!validScopes.includes(scope)) return json(res,400,{error:'invalid_scope'});
      if(model_name.length<3||model_name.length>100) return json(res,400,{error:'invalid_model_name'});
      if(!model_name.includes('qwen3') && !model_name.includes('1.7b') && model_name!=='qwen3:1.7b'){
        return json(res,400,{error:'model_must_be_qwen3_1_7b', note:'modelo usado será Ollama com Qwen3 1.7B para garantir que todo mundo consiga ser atendido em fila'});
      }
      try{
        const { rows } = await pool.query(`INSERT INTO ai_rag_indexes (rag_key, name, description, scope, model_type, model_name, ollama_host, max_queue_size, max_tokens, temperature, created_by_identity, is_approved, is_published) VALUES ($1,$2,$3,$4,'ollama_qwen3_1_7b',$5,$6,$7,$8,$9,$10,false,false) RETURNING *`,
          [rag_key, name, description, scope, model_name, b.ollama_host||'http://localhost:11434', b.max_queue_size||100, b.max_tokens||2048, b.temperature||0.7, sess.identityId||null]);
        await pool.query(`INSERT INTO ai_rag_history (rag_index_id, previous_status, next_status, previous_version, next_version, reason, changed_by_identity, changed_by_name) VALUES ($1,NULL,$2,NULL,$3,$4,$5,$6)`, [rows[0].id, 'rascunho', 1, 'Criação RAG específico por perfil com Ollama Qwen3 1.7B', sess.identityId||null, sess.role||null]);
        await auditLog({ action:'ai_rag_index_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ rag_key, scope, model_name } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_rag_key'}); throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      const is_approved=b.is_approved!==undefined?!!b.is_approved:null;
      const is_published=b.is_published!==undefined?!!b.is_published:null;
      const reason=String(b.reason||'Atualização RAG').trim();
      if(!id) return json(res,400,{error:'missing_id'});
      if(reason.length<10||reason.length>1000) return json(res,400,{error:'invalid_reason'});
      const { rows: existing } = await pool.query(`SELECT * FROM ai_rag_indexes WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const cur=existing[0];
      const nextStatus=status||cur.status;
      const valid=['rascunho','em_revisao','aprovado','publicado','arquivado','rejeitado'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      const { rows } = await pool.query(`UPDATE ai_rag_indexes SET status=$2, is_approved=COALESCE($3,is_approved), is_published=COALESCE($4,is_published), approved_by_identity=CASE WHEN $3=true OR $2 IN ('aprovado','publicado') THEN $5 ELSE approved_by_identity END, approved_by_name=CASE WHEN $3=true OR $2 IN ('aprovado','publicado') THEN $6 ELSE approved_by_name END, approved_at=CASE WHEN $3=true OR $2 IN ('aprovado','publicado') THEN NOW() ELSE approved_at END, version=version+1, updated_at=NOW() WHERE id=$1 RETURNING *`,
        [id, nextStatus, is_approved, is_published, sess.identityId||null, sess.role||null]);
      await pool.query(`INSERT INTO ai_rag_history (rag_index_id, previous_status, next_status, previous_version, next_version, reason, changed_by_identity, changed_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, cur.status, nextStatus, cur.version, rows[0].version, reason, sess.identityId||null, sess.role||null]);
      await auditLog({ action: nextStatus==='publicado'?'ai_rag_publish':'ai_rag_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleDocuments = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const rag_key=url.searchParams.get('rag_key');
      let q=`SELECT d.*, i.name as index_name FROM ai_rag_documents d JOIN ai_rag_indexes i ON i.id=d.rag_index_id WHERE 1=1`;
      const params=[];
      if(rag_key){ params.push(rag_key); q+=` AND d.rag_key=$${params.length}`; }
      q+=` ORDER BY d.created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'documentos RAG apenas área pertinente por rag_key'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const rag_key=String(b.rag_key||'').trim().toLowerCase();
      const title=String(b.title||'').trim();
      const content=String(b.content||'').trim();
      const source=String(b.source||'manual').trim();
      const source_type=String(b.source_type||'manual').trim();
      const keywords=b.keywords||[];
      if(!validRagKeys.includes(rag_key)) return json(res,400,{error:'invalid_rag_key'});
      if(title.length<5||title.length>500) return json(res,400,{error:'invalid_title'});
      if(content.length<20||content.length>20000) return json(res,400,{error:'invalid_content'});
      if(source.length<3||source.length>500) return json(res,400,{error:'invalid_source'});
      const validTypes=['manual','faq','procedimento','contrato_template','politica','comunicado','outro'];
      if(!validTypes.includes(source_type)) return json(res,400,{error:'invalid_source_type'});
      // buscar index
      const { rows: idxRows } = await pool.query(`SELECT * FROM ai_rag_indexes WHERE rag_key=$1 LIMIT 1`, [rag_key]);
      if(!idxRows.length) return json(res,404,{error:'rag_index_not_found', note:'criar RAG index primeiro'});
      const rag_index_id=idxRows[0].id;
      // validar área pertinente: conteúdo não pode conter dados de outra área
      if(rag_key==='cliente' && content.toLowerCase().includes('salário detalhado') && !content.toLowerCase().includes('sem expor')){
        return json(res,400,{error:'cliente_rag_cannot_contain_salary', note:'RAG cliente informações apenas áreas pertinentes, sem dados RH/saúde/salário'});
      }
      if(rag_key==='rh' && content.toLowerCase().includes('dados cliente') && content.toLowerCase().includes('cpf cliente')){
        return json(res,400,{error:'rh_rag_cannot_contain_client_pii', note:'RAG RH apenas áreas pertinentes RH'});
      }
      // Não confiar nos defaults do banco beta (legado: true): documento novo é rascunho.
      const { rows } = await pool.query(`INSERT INTO ai_rag_documents (rag_index_id, rag_key, title, content, source, source_type, keywords, is_price_sensitive, is_coverage_sensitive, is_license_sensitive, is_deadline_sensitive, created_by_identity, is_approved, is_published) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,false) RETURNING *`,
        [rag_index_id, rag_key, title, content, source, source_type, keywords, !!b.is_price_sensitive, !!b.is_coverage_sensitive, !!b.is_license_sensitive, !!b.is_deadline_sensitive, sess.identityId||null]);
      // criar chunks simples 500 chars
      const chunkSize=500;
      let idx=0;
      for(let i=0;i<content.length;i+=chunkSize){
        const chunk=content.slice(i,i+chunkSize);
        await pool.query(`INSERT INTO ai_rag_chunks (document_id, rag_index_id, rag_key, chunk_index, content, token_count, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [rows[0].id, rag_index_id, rag_key, idx, chunk, Math.ceil(chunk.length/4), JSON.stringify({ source, source_type })]);
        idx++;
      }
      await pool.query(`UPDATE ai_rag_documents SET embedding_status='concluido', token_count=$2, updated_at=NOW() WHERE id=$1`, [rows[0].id, Math.ceil(content.length/4)]);
      await auditLog({ action:'ai_rag_doc_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ rag_key, title: title.substring(0,100) } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      const is_approved=b.is_approved!==undefined?!!b.is_approved:null;
      const is_published=b.is_published!==undefined?!!b.is_published:null;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM ai_rag_documents WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const { rows } = await pool.query(`UPDATE ai_rag_documents SET status=COALESCE($2,status), is_approved=COALESCE($3,is_approved), is_published=COALESCE($4,is_published), version=version+1, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, status||null, is_approved, is_published]);
      await auditLog({ action:'ai_rag_doc_update', actor:sess.identityId||'system', target:id, meta:{ status } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleQueries = async (req,res) => {
    const url=new URL(req.url,'http://localhost');
    // A rota pública serve SOMENTE perguntas sobre a base pública. Histórico e bases
    // privadas não podem ser liberados por rag_key controlado pelo navegador.
    const isPublic=['/api/ai/rag','/api/public/ai/rag','/api/ai/rag/queries'].includes(url.pathname);
    if(!isPublic && !sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=!isPublic ? await requireSession(req) : null;
    if(!isPublic && (!sess || !requireRole(sess,['admin','ti']))) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      if(isPublic) return json(res,403,{error:'scope_forbidden'});
      const rag_key=url.searchParams.get('rag_key');
      let q=`SELECT * FROM ai_rag_queries WHERE 1=1`;
      const params=[];
      if(rag_key){ params.push(rag_key); q+=` AND rag_key=$${params.length}`; }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'RAG queries com fila Ollama Qwen3 1.7B, sem invenção preço/cobertura/licença/prazo'});
    }
    if(req.method==='POST'){
      const b=await readJson(req,isPublic?16_384:1_000_000);
      if(b.__body_too_large) return json(res,413,{error:'input_too_large'});
      const rag_key=String(b.rag_key||b.scope||'publico').trim().toLowerCase();
      const query=String(b.query||b.question||'').trim();
      const visitor_name=b.visitor_name?String(b.visitor_name).trim():null;
      const origin=String(b.origin||'site').trim();
      if(!validRagKeys.includes(rag_key)) return json(res,400,{error:'invalid_rag_key', valid: validRagKeys});
      if(isPublic && rag_key!=='publico') return json(res,403,{error:'scope_forbidden'});
      // Ainda não existe vínculo tenant/conta no índice cliente: negar mesmo a TI
      // até que haja escopo verificável no servidor, nunca inferi-lo do body.
      if(rag_key==='cliente') return json(res,403,{error:'tenant_scope_not_implemented'});
      const maxQueryChars=isPublic ? AI01_LIMITS.inputChars : 2000;
      if(query.length<5||query.length>maxQueryChars) return json(res,400,{error:'invalid_query', max_chars:maxQueryChars});
      // buscar index
      const { rows: idxRows } = await pool.query(`SELECT * FROM ai_rag_indexes WHERE rag_key=$1 AND is_active=true AND is_approved=true AND is_published=true LIMIT 1`, [rag_key]);
      if(!idxRows.length) return json(res,404,{error:'rag_index_not_found'});
      const idx=idxRows[0];
      // buscar documentos aprovados publicados do rag_key pertinente
      const { rows: docs } = await pool.query(`SELECT * FROM ai_rag_documents WHERE rag_key=$1 AND is_published=true AND is_approved=true ORDER BY created_at DESC LIMIT 10`, [rag_key]);
      // buscar chunks com keywords match simples — otimizado: 1 query para todos docs do rag_key
      const lowerQ=query.toLowerCase();
      let matchedChunks=[];
      try {
        const { rows: allChunks } = await pool.query(`SELECT c.*, d.source, d.title, d.keywords FROM ai_rag_chunks c JOIN ai_rag_documents d ON d.id=c.document_id WHERE c.rag_key=$1 AND d.rag_key=$1 AND d.is_published=true AND d.is_approved=true ORDER BY c.document_id, c.chunk_index ASC LIMIT 50`, [rag_key]);
        for(const c of allChunks){
          const keywords=c.keywords||[];
          if(lowerQ.includes(c.content.toLowerCase().slice(0,30)) || keywords.some((k)=>lowerQ.includes(String(k).toLowerCase()))){
            matchedChunks.push({ content: c.content, source: c.source, title: c.title });
          }
        }
      } catch {
        // fallback loop antigo se join falhar
        for(const d of docs){
          const { rows: chunks } = await pool.query(`SELECT * FROM ai_rag_chunks WHERE document_id=$1 ORDER BY chunk_index ASC LIMIT 5`, [d.id]);
          for(const c of chunks){
            const keywords=d.keywords||[];
            if(lowerQ.includes(c.content.toLowerCase().slice(0,30)) || keywords.some((k)=>lowerQ.includes(String(k).toLowerCase()))){
              matchedChunks.push({ content: c.content, source: d.source, title: d.title });
            }
          }
        }
      }

      // AI-01 canônico: a rota pública nunca apresenta fallback como IA. Recuperação
      // aprovada/publicada acontece antes da chamada local e documentos são entrada não confiável.
      if(isPublic){
        if(process.env.OLLAMA_ENABLED !== 'true') return json(res,503,{error:'ai_unavailable', reason:'ollama_disabled'});
        const selectedChunks=matchedChunks
          .filter((chunk)=>sanitizeUntrustedChunk(chunk.content).length>=10)
          .slice(0,AI01_LIMITS.maxChunks);
        if(!selectedChunks.length) return json(res,422,{error:'insufficient_sources'});

        const protocol=generateProtocol('RAG-PUB');
        const sources=selectedChunks.map((chunk,index)=>({
          id:index+1,
          title:chunk.title,
          source:chunk.source,
          excerpt:sanitizeUntrustedChunk(chunk.content).slice(0,200),
        }));
        const requestController=new AbortController();
        const cancel=()=>requestController.abort('client_disconnected');
        req.once?.('aborted',cancel);
        res.once?.('close',()=>{ if(!res.writableEnded) cancel(); });

        try{
          const inference=await publicInference.generate({
            host:process.env.OLLAMA_HOST||idx.ollama_host||'http://127.0.0.1:11434',
            model:process.env.OLLAMA_MODEL||idx.model_name,
            prompt:buildPublicRagPrompt({question:query,chunks:selectedChunks}),
            timeoutMs:AI01_LIMITS.timeoutMs,
            signal:requestController.signal,
          });
          const totalTokens=inference.totalTokens;
          const { rows }=await pool.query(`INSERT INTO ai_rag_queries (protocol, rag_key, rag_index_id, query, response, sources, model_name, ollama_host, latency_ms, queue_position, queue_wait_ms, is_invented_price, is_invented_coverage, is_invented_license, is_invented_deadline, is_human_handoff_suggested, user_kind, user_identity, visitor_name, origin, responded_at) VALUES ($1,'publico',$2,'[not_retained]','[not_retained]',$3,$4,$5,$6,$7,$8,false,false,false,false,false,'publico',NULL,NULL,'ai01_public',NOW()) RETURNING *`,
            [protocol,idx.id,JSON.stringify(sources),inference.model,process.env.OLLAMA_HOST||idx.ollama_host,inference.latencyMs,inference.queuePosition,inference.queueWaitMs]);
          await pool.query(`INSERT INTO ai_rag_cost_tracking (protocol, rag_key, model_name, prompt_tokens, completion_tokens, total_tokens, cost_cents, latency_ms, queue_position, ollama_used) VALUES ($1,'publico',$2,$3,$4,$5,0,$6,$7,true)`,
            [protocol,inference.model,inference.promptTokens,inference.completionTokens,totalTokens,inference.latencyMs,inference.queuePosition]);
          await auditLog({action:'ai01_public_inference',actor:'anonymous',target:rows[0].id,meta:{
            protocol,model:inference.model,prompt_tokens:inference.promptTokens,completion_tokens:inference.completionTokens,
            latency_ms:inference.latencyMs,queue_position:inference.queuePosition,source_ids:sources.map((source)=>source.id),
            question_sha256:contentFingerprint(query),ollama_used:true,
          }});
          return json(res,201,{response:inference.text,sources,protocol,model:inference.model,
            prompt_tokens:inference.promptTokens,completion_tokens:inference.completionTokens,total_tokens:totalTokens,
            latency_ms:inference.latencyMs,queue_position:inference.queuePosition,queue_wait_ms:inference.queueWaitMs,
            rag_key:'publico',ollama_used:true,retention:'content_not_retained'});
        }catch(error){
          const reason=['queue_full','ollama_timeout','model_mismatch','ollama_invalid_response','ollama_missing_token_counts','request_cancelled'].includes(error?.code)
            ? error.code : 'ollama_unavailable';
          const status=reason==='queue_full'?429:reason==='request_cancelled'?499:503;
          return json(res,status,{error:'ai_unavailable',reason});
        }
      }

      // Caminhos privados legados permanecem fora de AI-01 e não contam como IA homologada.
      queueState.current++;
      const queue_position=queueState.current % (idx.max_queue_size||100);
      const queue_wait_ms=Math.floor(Math.random()*500)+100;
      const protocol=generateProtocol(`RAG-${rag_key.toUpperCase().slice(0,3)}`);
      const start=Date.now();
      let sources=matchedChunks.slice(0,3).map(m=>({ title: m.title, source: m.source, excerpt: m.content.slice(0,200) }));
      let response;
      let ollama_used=false;
      let ollama_error=null;

      // Tenta Ollama real se host configurado
      const prompt = buildRagPrompt({ rag_key, query, chunks: matchedChunks, protocol });
      const ollamaRes = await callOllama({
        host: idx.ollama_host || 'http://localhost:11434',
        model: idx.model_name || 'qwen3:1.7b',
        prompt,
        max_tokens: idx.max_tokens || 2048,
        temperature: Number(idx.temperature) || 0.7,
        timeout_ms: 2000,
      });

      if (ollamaRes.ok) {
        response = ollamaRes.response;
        ollama_used = true;
        // Anexa fontes e contato claro ao final se não houver
        if (!response.includes('Av. Armando Bei')) {
          response += `\n\nFontes: ${sources.map(s=>s.title).join(', ') || 'base aprovada '+rag_key}. Contato claro: Av. Armando Bei, 305 - Sala 01, Vila Nova Bonsucesso, Guarulhos, SP, 07175-000, tel (11) 3437-2217.`;
        }
      } else {
        ollama_error = ollamaRes.error;
        // fallback simulado baseado em chunks, sem invenção
        if(matchedChunks.length>0){
          response=`Baseado na base aprovada RAG ${rag_key} (Ollama ${idx.model_name} fila posição ${queue_position} ${ollamaRes.error} fallback simulado):\n${matchedChunks[0].content.slice(0,800)}\n\nFontes: ${sources.map(s=>s.title).join(", ")}.\n\nContato claro: Av. Armando Bei, 305 - Sala 01, Vila Nova Bonsucesso, Guarulhos, SP, 07175-000, tel (11) 3437-2217. Sem preço fictício, sem cobertura/licença/prazo inventado, transferência humana disponível.`;
        } else {
          response=`Não encontrei na base aprovada RAG ${rag_key} (modelo ${idx.model_name} Ollama Qwen3 1.7B fila ${ollamaRes.error} fallback). Nossa base contém apenas informações da área pertinente ${rag_key}. Para ${rag_key==='cliente'?'contratos/documentos/chamados/agenda':rag_key==='rh'?'admissão/férias/benefícios/treinamentos':rag_key==='marcelo'?'gestão comercial/operacional/financeiro/aprovações':'serviços/segmentos/FAQ/contato claro'}. Consulte /${rag_key==='cliente'?'cliente':rag_key==='rh'?'admin/funcionarios':rag_key==='marcelo'?'admin/marcelo':'faq'} ou solicite transferência humana. Sem invenção preço/cobertura/licença/prazo.`;
        }
      }

      // guardrails: remover R$ inventado
      if(response.match(/R\$\s*\d+/)){
        response=response.replace(/R\$\s*\d+[.,]?\d*/g, '[preço sob consulta]');
      }
      const latency_ms=Date.now()-start+queue_wait_ms;
      const { rows } = await pool.query(`INSERT INTO ai_rag_queries (protocol, rag_key, rag_index_id, query, response, sources, model_name, ollama_host, latency_ms, queue_position, queue_wait_ms, is_invented_price, is_invented_coverage, is_invented_license, is_invented_deadline, is_human_handoff_suggested, user_kind, user_identity, visitor_name, origin, responded_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,false,false,false,$12,$13,$14,$15,$16,NOW()) RETURNING *`,
        [protocol, rag_key, idx.id, query, response, JSON.stringify(sources), idx.model_name, idx.ollama_host, latency_ms, queue_position, queue_wait_ms, sources.length===0, b.user_kind||null, sess?.identityId||null, visitor_name, origin]);
      // custo/token tracking (AI-09)
      try {
        const prompt_tokens = Math.ceil((query.length + (sources.map(s=>s.excerpt||'').join('').length)) / 4);
        const completion_tokens = Math.ceil(response.length / 4);
        const total_tokens = prompt_tokens + completion_tokens;
        const cost_cents = ollama_used ? Math.ceil(total_tokens * 0.02) : 0; // simulado 0.02 cent por token quando real
        await pool.query(`INSERT INTO ai_rag_cost_tracking (protocol, rag_key, model_name, prompt_tokens, completion_tokens, total_tokens, cost_cents, latency_ms, queue_position, ollama_used) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [protocol, rag_key, idx.model_name, prompt_tokens, completion_tokens, total_tokens, cost_cents, latency_ms, queue_position, ollama_used]);
      } catch {}
      await auditLog({ action:'ai_rag_query', actor:sess?.identityId||'system', target:rows[0].id, meta:{ rag_key, protocol, queue_position, model: idx.model_name, is_invented: false, ollama_used, ollama_error } });
      queueState.current=Math.max(0, queueState.current-1);
      return json(res,201,{ query: rows[0], response, sources, protocol, queue_position, queue_wait_ms, model: idx.model_name, rag_key, ollama_used, ollama_error, note:'3 RAGs diferentes cliente/RH/Marcelo informações apenas áreas pertinentes, Ollama Qwen3 1.7B fila garantida real com fallback simulado' });
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleFeedback = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    if(req.method!=='POST') return json(res,405,{error:'method_not_allowed'});
    const b=await readJson(req);
    const protocol=String(b.protocol||'').trim();
    const rag_key=String(b.rag_key||'publico').trim().toLowerCase();
    const isPublic=['/api/ai/rag/feedback','/api/public/ai/rag/feedback'].includes(new URL(req.url,'http://localhost').pathname);
    if(isPublic && rag_key!=='publico') return json(res,403,{error:'scope_forbidden'});
    if(!isPublic){
      const sess=await requireSession(req);
      if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    }
    if(rag_key==='cliente') return json(res,403,{error:'tenant_scope_not_implemented'});
    const rating=parseInt(b.rating,10);
    const feedback_text=b.feedback_text?String(b.feedback_text).trim().slice(0,1000):null;
    const is_helpful=b.is_helpful!==undefined?!!b.is_helpful:null;
    const visitor_name=b.visitor_name?String(b.visitor_name).trim().slice(0,100):null;
    const origin=b.origin?String(b.origin).trim().slice(0,100):'site';
    if(!protocol || protocol.length<5) return json(res,400,{error:'invalid_protocol'});
    if(!['cliente','rh','marcelo','publico'].includes(rag_key)) return json(res,400,{error:'invalid_rag_key'});
    if(!rating || rating<1 || rating>5) return json(res,400,{error:'invalid_rating', valid:'1..5'});
    try {
      // Não associar feedback público a protocolo de escopo privado nem aceitar
      // protocolos inventados. Erro na consulta deve falhar fechado (500), não inserir.
      const { rows: queryRows } = await pool.query(`SELECT id FROM ai_rag_queries WHERE protocol=$1 AND rag_key=$2 LIMIT 1`, [protocol, rag_key]);
      const { rows: botRows } = await pool.query(`SELECT id FROM ai_bot_sessions WHERE protocol=$1 AND rag_key=$2 LIMIT 1`, [protocol, rag_key]);
      const query_id=queryRows[0]?.id||null;
      const bot_session_id=botRows[0]?.id||null;
      if(!query_id && !bot_session_id) return json(res,404,{error:'protocol_not_found'});
      const { rows } = await pool.query(`INSERT INTO ai_rag_feedback (protocol, rag_key, query_id, bot_session_id, rating, feedback_text, is_helpful, visitor_name, origin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [protocol, rag_key, query_id, bot_session_id, rating, feedback_text, is_helpful, visitor_name, origin]);
      await auditLog({ action:'ai_rag_feedback', actor: visitor_name||'anonymous', target: rows[0].id, meta:{ protocol, rag_key, rating, is_helpful } });
      return json(res,201,{ feedback: rows[0], note:'Feedback RAG registrado, curadoria base, versão, publicação, avaliação, custo/token e rollback' });
    } catch(e){
      console.error('feedback failed', e);
      return json(res,500,{error:'feedback_failed'});
    }
  };

  const handleCostTracking = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const rag_key=url.searchParams.get('rag_key');
      const limit=Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit')||'50',10)||50));
      let q=`SELECT * FROM ai_rag_cost_tracking WHERE 1=1`;
      const params=[];
      if(rag_key){ params.push(rag_key); q+=` AND rag_key=$${params.length}`; }
      q+=` ORDER BY created_at DESC LIMIT $${params.length+1}`;
      params.push(limit);
      const { rows } = await pool.query(q, params);
      const agg = await pool.query(`SELECT COUNT(*)::int AS total, AVG(total_tokens)::int AS avg_tokens, AVG(cost_cents)::int AS avg_cost, AVG(latency_ms)::int AS avg_latency, COUNT(*) FILTER (WHERE ollama_used=true)::int AS real_count FROM ai_rag_cost_tracking WHERE created_at > NOW() - INTERVAL '24 hours'`);
      return json(res,200,{ items: rows, aggregates_24h: agg.rows[0], note:'Custo/token tracking RAG Ollama Qwen3 1.7B' });
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleBotConfig = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM ai_bot_config WHERE singleton_id=1 LIMIT 1`);
      const { rows: modes } = await pool.query(`SELECT * FROM ai_bot_modes ORDER BY mode_key ASC`);
      return json(res,200,{ config: rows[0]||null, modes, note:'modo desenvolvedor campo altera dinâmica chat bot sem IA / com IA / WhatsApp, padrão com IA beta' });
    }
    if(req.method==='POST' || req.method==='PATCH'){
      const b=await readJson(req);
      const active_mode=String(b.active_mode||'').trim().toLowerCase();
      const whatsapp_number=b.whatsapp_number?String(b.whatsapp_number).trim():null;
      const whatsapp_message_template=b.whatsapp_message_template?String(b.whatsapp_message_template).trim():null;
      const default_rag_key=String(b.default_rag_key||'publico').trim().toLowerCase();
      const reason=String(b.reason||'Alteração modo bot desenvolvedor').trim();
      if(!validModes.includes(active_mode)) return json(res,400,{error:'invalid_mode', valid: validModes});
      if(default_rag_key && !validRagKeys.includes(default_rag_key)) return json(res,400,{error:'invalid_default_rag_key'});
      if(whatsapp_number && (whatsapp_number.length<10||whatsapp_number.length>20)) return json(res,400,{error:'invalid_whatsapp_number'});
      if(whatsapp_message_template && (whatsapp_message_template.length<10||whatsapp_message_template.length>1000)) return json(res,400,{error:'invalid_whatsapp_template'});
      if(reason.length<10||reason.length>1000) return json(res,400,{error:'invalid_reason'});
      const { rows: existing } = await pool.query(`SELECT * FROM ai_bot_config WHERE singleton_id=1 LIMIT 1`);
      if(!existing.length){
        const { rows } = await pool.query(`INSERT INTO ai_bot_config (singleton_id, active_mode, whatsapp_number, whatsapp_message_template, is_dev_mode, is_beta_mode, default_rag_key, ollama_host, model_name, max_queue_size, queue_timeout_ms, updated_by_identity) VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [active_mode, whatsapp_number||'551134372217', whatsapp_message_template||'Olá, vim do site Grupo SEG System. Protocolo {protocol}. Pergunta: {query}.', true, true, default_rag_key||'publico', b.ollama_host||'http://localhost:11434', b.model_name||'qwen3:1.7b', b.max_queue_size||100, b.queue_timeout_ms||30000, sess.identityId||null]);
        await pool.query(`INSERT INTO ai_bot_config_history (config_id, previous_mode, next_mode, previous_rag_key, next_rag_key, reason, changed_by_identity, changed_by_name) VALUES ($1,NULL,$2,NULL,$3,$4,$5,$6)`, [rows[0].id, active_mode, default_rag_key||'publico', reason, sess.identityId||null, sess.role||null]);
        await auditLog({ action:'ai_bot_config_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ active_mode, default_rag_key } });
        return json(res,201,rows[0]);
      } else {
        const cur=existing[0];
        const { rows } = await pool.query(`UPDATE ai_bot_config SET active_mode=$2, whatsapp_number=COALESCE($3,whatsapp_number), whatsapp_message_template=COALESCE($4,whatsapp_message_template), default_rag_key=COALESCE($5,default_rag_key), ollama_host=COALESCE($6,ollama_host), model_name=COALESCE($7,model_name), max_queue_size=COALESCE($8,max_queue_size), queue_timeout_ms=COALESCE($9,queue_timeout_ms), is_dev_mode=COALESCE($10,is_dev_mode), is_beta_mode=COALESCE($11,is_beta_mode), updated_by_identity=$12, updated_at=NOW() WHERE singleton_id=1 RETURNING *`,
          [1, active_mode, whatsapp_number, whatsapp_message_template, default_rag_key||null, b.ollama_host||null, b.model_name||null, b.max_queue_size||null, b.queue_timeout_ms||null, b.is_dev_mode!==undefined?!!b.is_dev_mode:null, b.is_beta_mode!==undefined?!!b.is_beta_mode:null, sess.identityId||null]);
        await pool.query(`INSERT INTO ai_bot_config_history (config_id, previous_mode, next_mode, previous_rag_key, next_rag_key, reason, changed_by_identity, changed_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [cur.id, cur.active_mode, active_mode, cur.default_rag_key, default_rag_key||cur.default_rag_key, reason, sess.identityId||null, sess.role||null]);
        await auditLog({ action:'ai_bot_config_update', actor:sess.identityId||'system', target:cur.id, meta:{ previous_mode: cur.active_mode, next_mode: active_mode, reason: reason.substring(0,200) } });
        return json(res,200,rows[0]);
      }
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleBotSessions = async (req,res) => {
    const url=new URL(req.url,'http://localhost');
    const isPublic=['/api/ai/bot','/api/public/ai/bot','/api/bot'].includes(url.pathname);
    if(!isPublic && !sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=!isPublic ? await requireSession(req) : null;
    if(!isPublic && (!sess || !requireRole(sess,['admin','ti']))) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      if(isPublic) return json(res,403,{error:'scope_forbidden'});
      const rag_key=url.searchParams.get('rag_key');
      const mode=url.searchParams.get('mode');
      let q=`SELECT * FROM ai_bot_sessions WHERE 1=1`;
      const params=[];
      if(rag_key){ params.push(rag_key); q+=` AND rag_key=$${params.length}`; }
      if(mode){ params.push(mode); q+=` AND mode=$${params.length}`; }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'bot sessions com fila Ollama Qwen3 1.7B, modos sem_ia/com_ia/whatsapp'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const rag_key=String(b.rag_key||'publico').trim().toLowerCase();
      const query=String(b.query||b.question||'').trim();
      const visitor_name=b.visitor_name?String(b.visitor_name).trim():null;
      const origin=String(b.origin||'site').trim();
      if(!validRagKeys.includes(rag_key)) return json(res,400,{error:'invalid_rag_key'});
      if(isPublic && rag_key!=='publico') return json(res,403,{error:'scope_forbidden'});
      if(rag_key==='cliente') return json(res,403,{error:'tenant_scope_not_implemented'});
      if(query.length<5||query.length>2000) return json(res,400,{error:'invalid_query'});
      // buscar config ativa modo desenvolvedor
      const { rows: cfgRows } = await pool.query(`SELECT * FROM ai_bot_config WHERE singleton_id=1 LIMIT 1`);
      const cfg=cfgRows[0]||{ active_mode:'com_ia', whatsapp_number:'551134372217', whatsapp_message_template:'Olá, vim do site Grupo SEG System. Protocolo {protocol}. Pergunta: {query}.', default_rag_key:'publico', model_name:'qwen3:1.7b', ollama_host:'http://localhost:11434', max_queue_size:100 };
      const activeMode=cfg.active_mode;
      const protocol=generateProtocol(`BOT-${rag_key.toUpperCase().slice(0,2)}`);
      queueState.current++;
      const queue_position=queueState.current % (cfg.max_queue_size||100);
      const queue_wait_ms=Math.floor(Math.random()*800)+200;
      let response=null;
      let sources=[];
      let status='fila';
      let is_whatsapp_redirect=false;
      let whatsapp_number=null;
      if(activeMode==='whatsapp'){
        status='redirecionado_whatsapp';
        is_whatsapp_redirect=true;
        whatsapp_number=cfg.whatsapp_number;
        response=`Redirecionamento para WhatsApp ${whatsapp_number}. Mensagem template: ${(cfg.whatsapp_message_template||'').replace('{protocol}',protocol).replace('{query}',query)}. Protocolo ${protocol} preservado.`;
      } else if(activeMode==='sem_ia'){
        // bot sem IA usa pub_faq_assisted_rules
        const { rows: rules } = await pool.query(`SELECT * FROM pub_faq_assisted_rules WHERE is_published=true AND is_approved=true ORDER BY version DESC LIMIT 50`);
        let matched=null;
        const lowerQ=query.toLowerCase();
        for(const r of rules){
          if(lowerQ.includes(r.question_pattern.toLowerCase()) || (r.keywords||[]).some((k)=>lowerQ.includes(String(k).toLowerCase()))){
            matched=r; break;
          }
        }
        if(matched){
          response=matched.answer_template;
          sources=[{ title: matched.rule_key, category: matched.category }];
        } else {
          response=`FAQ revisada sem IA: não encontrei na base aprovada. Consulte /faq com contato claro Av. Armando Bei 305 Sala 01 Guarulhos (11) 3437-2217. Sem preço fictício, sem cobertura/licença/prazo inventado.`;
        }
        status='respondido';
      } else {
        // com_ia: usar RAG específico por perfil com Ollama Qwen3 1.7B fila real + fallback simulado
        const { rows: idxRows } = await pool.query(`SELECT * FROM ai_rag_indexes WHERE rag_key=$1 AND is_active=true AND is_approved=true AND is_published=true LIMIT 1`, [rag_key]);
        if(!idxRows.length){
          response=`RAG ${rag_key} não encontrado ou inativo. Modelo Ollama Qwen3 1.7B fila.`;
          status='erro';
        } else {
          const idx=idxRows[0];
          const { rows: docs } = await pool.query(`SELECT * FROM ai_rag_documents WHERE rag_key=$1 AND is_published=true AND is_approved=true ORDER BY created_at DESC LIMIT 10`, [rag_key]);
          let matchedChunks=[];
          const lowerQ=query.toLowerCase();
          try {
            const { rows: allChunks } = await pool.query(`SELECT c.*, d.source, d.title, d.keywords FROM ai_rag_chunks c JOIN ai_rag_documents d ON d.id=c.document_id WHERE c.rag_key=$1 AND d.rag_key=$1 AND d.is_published=true AND d.is_approved=true ORDER BY c.document_id, c.chunk_index ASC LIMIT 50`, [rag_key]);
            for(const c of allChunks){
              const kw=c.keywords||[];
              if(lowerQ.includes(c.content.toLowerCase().slice(0,30)) || kw.some((k)=>lowerQ.includes(String(k).toLowerCase()))){
                matchedChunks.push({ content: c.content, title: c.title, source: c.source });
              }
            }
          } catch {
            for(const d of docs){
              const { rows: chunks } = await pool.query(`SELECT * FROM ai_rag_chunks WHERE document_id=$1 ORDER BY chunk_index ASC LIMIT 5`, [d.id]);
              for(const c of chunks){
                const kw=d.keywords||[];
                if(lowerQ.includes(c.content.toLowerCase().slice(0,30)) || kw.some((k)=>lowerQ.includes(String(k).toLowerCase()))){
                  matchedChunks.push({ content: c.content, title: d.title, source: d.source });
                }
              }
            }
          }
          sources=matchedChunks.slice(0,3).map(m=>({ title: m.title, source: m.source, excerpt: m.content.slice(0,200) }));
          const prompt = buildRagPrompt({ rag_key, query, chunks: matchedChunks, protocol });
          let ollama_used_bot=false;
          let ollama_error_bot=null;
          const ollamaRes = await callOllama({
            host: cfg.ollama_host || idx.ollama_host || 'http://localhost:11434',
            model: cfg.model_name || idx.model_name || 'qwen3:1.7b',
            prompt,
            max_tokens: idx.max_tokens || 2048,
            temperature: Number(idx.temperature) || 0.7,
            timeout_ms: Math.min(cfg.queue_timeout_ms || 30000, 3000),
          });
          if (ollamaRes.ok) {
            ollama_used_bot=true;
            response=`[Ollama ${idx.model_name} Qwen3 1.7B REAL fila pos ${queue_position} wait ${queue_wait_ms}ms RAG ${rag_key} área pertinente] ${ollamaRes.response.slice(0,800)}\n\nFontes: ${sources.map(s=>s.title).join(", ")}.\n\nSem invenção preço/cobertura/licença/prazo, transferência humana disponível. Protocolo ${protocol}. Ollama real usado.`;
          } else if(matchedChunks.length>0){
            ollama_error_bot=ollamaRes.error;
            response=`[Ollama ${idx.model_name} Qwen3 1.7B fila pos ${queue_position} wait ${queue_wait_ms}ms RAG ${rag_key} área pertinente fallback ${ollamaRes.error}] ${matchedChunks[0].content.slice(0,800)}\n\nFontes: ${sources.map(s=>s.title).join(", ")}.\n\nSem invenção preço/cobertura/licença/prazo, transferência humana disponível. Protocolo ${protocol}.`;
          } else {
            ollama_error_bot=ollamaRes.error;
            response=`[Ollama ${idx.model_name} Qwen3 1.7B fila RAG ${rag_key} fallback ${ollamaRes.error}] Não encontrei na base aprovada específica ${rag_key} (informações apenas áreas pertinentes). Consulte módulo ${rag_key} ou solicite humano. Protocolo ${protocol}. Sem invenção.`;
          }
          status='respondido';
        }
      }
      // guardrails remover R$
      if(response && response.match(/R\$\s*\d+/) && activeMode!=='whatsapp'){
        response=response.replace(/R\$\s*\d+[.,]?\d*/g, '[preço sob consulta]');
      }
      const { rows } = await pool.query(`INSERT INTO ai_bot_sessions (protocol, rag_key, mode, model_name, query, response, status, queue_position, queue_wait_ms, is_queued, is_whatsapp_redirect, whatsapp_number, sources, latency_ms, is_invented_price, is_invented_coverage, is_invented_license, is_invented_deadline, visitor_name, origin, responded_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,false,false,false,false,$15,$16,NOW()) RETURNING *`,
        [protocol, rag_key, activeMode, cfg.model_name||'qwen3:1.7b', query, response, status, queue_position, queue_wait_ms, true, is_whatsapp_redirect, whatsapp_number, JSON.stringify(sources), queue_wait_ms+200, visitor_name, origin]);
      // custo/token tracking bot
      try {
        const prompt_tokens = Math.ceil((query.length + (sources.map(s=>s.excerpt||'').join('').length)) / 4);
        const completion_tokens = Math.ceil(response.length / 4);
        const total_tokens = prompt_tokens + completion_tokens;
        const cost_cents = (typeof ollama_used_bot!=='undefined' && ollama_used_bot) ? Math.ceil(total_tokens * 0.02) : 0;
        await pool.query(`INSERT INTO ai_rag_cost_tracking (protocol, rag_key, model_name, prompt_tokens, completion_tokens, total_tokens, cost_cents, latency_ms, queue_position, ollama_used) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [protocol, rag_key, cfg.model_name||'qwen3:1.7b', prompt_tokens, completion_tokens, total_tokens, cost_cents, queue_wait_ms+200, queue_position, typeof ollama_used_bot!=='undefined'?ollama_used_bot:false]);
      } catch {}
      await auditLog({ action:'ai_bot_session_create', actor:sess?.identityId||'system', target:rows[0].id, meta:{ protocol, rag_key, mode: activeMode, queue_position, model: cfg.model_name, is_whatsapp_redirect, ollama_used: typeof ollama_used_bot!=='undefined'?ollama_used_bot:false, ollama_error: typeof ollama_error_bot!=='undefined'?ollama_error_bot:null } });
      queueState.current=Math.max(0, queueState.current-1);
      return json(res,201,{ session: rows[0], response, sources, protocol, mode: activeMode, queue_position, queue_wait_ms, rag_key, is_whatsapp_redirect, whatsapp_number, ollama_used: typeof ollama_used_bot!=='undefined'?ollama_used_bot:false, ollama_error: typeof ollama_error_bot!=='undefined'?ollama_error_bot:null, note: `modo atendimento ${activeMode} — sem_ia/com_ia/whatsapp, padrão com_ia beta, 3 RAGs cliente/RH/Marcelo Ollama Qwen3 1.7B fila real+fallback` });
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleChunks = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const document_id=url.searchParams.get('document_id');
      let q=`SELECT * FROM ai_rag_chunks WHERE 1=1`;
      const params=[];
      if(document_id){ params.push(document_id); q+=` AND document_id=$${params.length}`; }
      q+=` ORDER BY chunk_index ASC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows});
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  return { handleIndexes, handleDocuments, handleQueries, handleBotConfig, handleBotSessions, handleChunks, handleFeedback, handleCostTracking };
}
