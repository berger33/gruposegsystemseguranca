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

  // EXT-06 satisfação foi transferida para src/server/ext-satisfaction-api.mjs
  // (migração 152), que endurece cli_satisfaction_surveys/
  // cli_satisfaction_action_plans (CLI-11) como fonte única. Esta rota legada
  // (ext_satisfaction_surveys, migração 085) preserva apenas leitura
  // histórica com o alias `items`; não mantém autoridade de escrita.
  //
  // Guarda em duas etapas como as demais jornadas EXT: 401 quando não há
  // sessão, 403 quando a sessão existe mas o papel não é autorizado ou a
  // origem não é confiável. Same-origin só é exigido em mutação (GET sempre
  // foi leitura e não deve recusar por origem, ao contrário do comportamento
  // anterior que misturava os dois).
  const handleSatisfactionSurveys = async (req,res) => {
    const sess = await requireSession(req);
    if (!sess) return json(res,401,{error:'unauthorized'});
    if (!requireRole(sess,['admin','ti'])) return json(res,403,{error:'forbidden_role'});
    if (req.method === 'GET') {
      const { rows } = await pool.query(`SELECT s.*, ca.display_name as client_name FROM ext_satisfaction_surveys s LEFT JOIN client_accounts ca ON ca.id=s.client_account_id ORDER BY s.created_at DESC LIMIT 200`);
      return json(res,200,{ items: rows, surveys: rows, canonical: '/api/ext/satisfaction/surveys', note: 'resposta gera acompanhamento sem expor funcionario' });
    }
    if (req.method === 'POST' || req.method === 'PATCH') {
      if (!sameOrigin(req)) return json(res,403,{error:'origin_forbidden'});
      return json(res,410,{error:'legacy_mutation_retired', canonical:'/api/ext/satisfaction/surveys'});
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  return { handleSatisfactionSurveys };
}
