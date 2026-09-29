// PUB-02: FAQ revisada, páginas por serviço e segmento, cases/imagens autorizados

export function createFaqApi(ctx) {
  // ctx: { json, getPool }

  async function handleList(req, res, url) {
    if (req.method !== "GET") {
      return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
    }

    const category = url.searchParams.get("category");
    const includeUnpublished = url.searchParams.get("includeUnpublished") === "true";

    try {
      const db = ctx.getPool();
      const conditions = [];
      const values = [];
      let idx = 1;
      if (!includeUnpublished) { conditions.push(`is_published = true`); }
      if (category) { conditions.push(`category = $${idx++}`); values.push(category); }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await db.query(`SELECT id, question, answer, category, is_published, order_index, created_at, updated_at FROM faq_entries ${where} ORDER BY order_index, created_at`, values);
      return ctx.json(res, 200, { faqs: result.rows, total: result.rows.length, source: "database" });
    } catch (e) {
      // Fallback estático quando DB não configurado
      const fallback = [
        { id: "q1", question: "Quais serviços a SEG System oferece?", answer: "Seis serviços validados: Segurança Desarmada, Monitoramento 24 Horas, Câmeras e CFTV, Portaria e Controle de Acesso, Limpeza e Conservação, Supervisão e Ronda.", category: "servicos", is_published: true, order_index: 1 },
        { id: "q2", question: "Como solicitar um orçamento?", answer: "Pelo site em /orcamento ou /simulador, com protocolo persistido.", category: "contratacao", is_published: true, order_index: 2 },
        { id: "q3", question: "Como funciona a visita técnica?", answer: "Estados: solicitada, em agendamento, confirmada, realizada, cancelada. Confirmação por pessoa responsável.", category: "visita", is_published: true, order_index: 3 },
      ].filter(f => {
        if (!includeUnpublished && !f.is_published) return false;
        if (category && f.category !== category) return false;
        return true;
      });
      return ctx.json(res, 200, { faqs: fallback, total: fallback.length, source: "fallback" });
    }
  }

  async function handleCases(req, res, url) {
    if (req.method !== "GET") {
      return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
    }

    const serviceId = url.searchParams.get("serviceId") || url.searchParams.get("service_id");
    const onlyAuthorized = url.searchParams.get("onlyAuthorized") !== "false";

    try {
      const db = ctx.getPool();
      const conditions = ["is_published = true"];
      const values = [];
      let idx = 1;
      if (onlyAuthorized) conditions.push("is_authorized = true");
      if (serviceId) { conditions.push(`service_id = $${idx++}`); values.push(serviceId); }
      const where = `WHERE ${conditions.join(" AND ")}`;
      const result = await db.query(`SELECT id, title, description, service_id, image_url, is_authorized, is_published, created_at FROM cases ${where} ORDER BY created_at DESC`, values);
      return ctx.json(res, 200, { cases: result.rows, total: result.rows.length, source: "database" });
    } catch {
      // Sem DB, retorna vazio — cases/imagens autorizados somente quando houver autorização formal
      return ctx.json(res, 200, { cases: [], total: 0, source: "fallback", note: "Cases/imagens autorizados somente com autorização formal em tabela cases (is_authorized)" });
    }
  }

  return { handleList, handleCases };
}
