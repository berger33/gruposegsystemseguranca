"use client";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";
import RagWidget from "@/components/RagWidget";
import AdminGate from "../../AdminGate";

function MarceloAssistentePageContent(){
  return (
    <UiTaskWorkspace style={{ padding:24, maxWidth:900, margin:"0 auto", fontFamily:"system-ui, sans-serif" }}>
      <h1 style={{ fontSize:28 }}>Assistente Marcelo</h1>
      <p style={{ fontSize:13, opacity:0.8 }}>Consulta a base de gestão aprovada e publicada; números operacionais continuam nas telas oficiais. O servidor confere sessão e papel em cada pergunta — assistente de outra área é negado, não apenas escondido no menu.</p>

      <RagWidget ragKey="marcelo" title="RAG Marcelo Administração" description="Administração meu dia pendências reais prioridade responsável ação, visão comercial leads novos oportunidades paradas propostas próximas ações, visão operacional cobertura ocorrências críticas SLA implantação, visão financeira fonte competência saldo vencimentos margem por contrato, contratos próximos renovar reclamações reincidentes risco perda justificado, aprovação unificada descontos compras despesas exceções alçadas valor/escopo, busca autorizada favoritos filtros salvos atalhos contexto, relatórios exportáveis agendados destinatários autorizados, configurações negócio versionadas catálogo preços alçadas conteúdo SLA preferências, metas cenários comparação prevista/realizada, trilha diário decisões CON-11, análises expansão qualidade oportunidades adicionais, indicadores conversão cobertura SLA margem inadimplência rotatividade previsão comercial" placeholder="Ex: quais leads novos? qual cobertura hoje? qual margem por contrato? quais contratos próximos renovar? quais aprovações pendentes?" />

      <section style={{ marginTop:24, padding:12, background:"#f8fafc", borderRadius:6, fontSize:12 }}>
        Respostas usam fontes publicadas da área de gestão; confirme decisões e valores nas telas oficiais.
      </section>

    </UiTaskWorkspace>
  );
}

// F01: assistente (prévia bloqueada) também exige sessão central do papel.
export default function MarceloAssistentePage() {
  return (
    <AdminGate allowedRoles={["marcelo", "admin"]}>
      <MarceloAssistentePageContent />
    </AdminGate>
  );
}
