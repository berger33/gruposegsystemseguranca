"use client";
import RagWidget from "@/components/RagWidget";

export default function ClienteAssistentePage(){
  return (
    <main style={{ padding:24, maxWidth:900, margin:"0 auto", fontFamily:"system-ui, sans-serif" }}>
      <h1 style={{ fontSize:28 }}>Assistente Cliente</h1>
      <p style={{ fontSize:13, opacity:0.8 }}>Respostas baseadas em documentos publicados para as contas vinculadas ao seu acesso. O vínculo é conferido no servidor a cada pergunta; sem vínculo ativo, a consulta retorna ausência de conteúdo publicado — nunca conteúdo de outra conta.</p>

      <RagWidget ragKey="cliente" title="RAG Cliente" description="Portal cliente com entrada única, contratos itens vigência escopo claro, documentos categoria validade versão download privado, chamados protocolo SLA, agenda visita, relatórios execução, cobranças somente financeiro integrado, solicitação serviço adicional gera oportunidade CRM, satisfação, renovação, modos convite, segurança conta MFA, reclamação colaborador canal restrito" placeholder="Ex: como consultar meus contratos? como baixar documento? como abrir chamado? qual status minha fatura?" />

      <section style={{ marginTop:24, padding:12, background:"#f8fafc", borderRadius:6, fontSize:12 }}>
        O assistente não substitui os registros oficiais. Sem trecho publicado relacionado, ele informa a ausência e o modelo local não é chamado — nada é inventado para preencher a tela.
      </section>
    </main>
  );
}
