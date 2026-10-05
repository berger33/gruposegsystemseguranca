"use client";
import RagWidget from "@/components/RagWidget";
import AdminGate from "../../AdminGate";

function RhAssistentePageContent(){
  return (
    <main style={{ padding:24, maxWidth:900, margin:"0 auto", fontFamily:"system-ui, sans-serif" }}>
      <h1 style={{ fontSize:28 }}>Assistente RH</h1>
      <p style={{ fontSize:13, opacity:0.8 }}>Consulta apenas a base de RH aprovada e publicada.</p>

      <RagWidget ragKey="rh" title="RAG RH Andreia" description="RH cadastro profissional separado login, histórico cargo lotação remuneração autorizada, recrutamento vaga candidatos triagem entrevista, banco talentos, admissão checklist documentos validação exame treinamento, dossiê tipos versões validade pendências aprovador, desligamento checklist devolução revogação, férias períodos aquisitivo concessivo saldo programação conflito cobertura, afastamentos período retorno documentação restrita substituição, ponto justificativas divergências workflow correção fechamento competência, banco horas adicionais, benefícios elegibilidade solicitações conferência exportação fornecedor, adiantamentos reembolsos alçada comprovantes, saúde ocupacional agenda vencimentos documentos restritos, integração contabilidade SST, treinamento por cargo, competências, uniformes EPI, fechamento DP, holerites fonte autorizada, avaliações planos desenvolvimento, atendimento interno, indicadores" placeholder="Ex: como admitir colaborador? como programar férias? como consultar benefício? qual treinamento vence?" />

      <section style={{ marginTop:24, padding:12, background:"#f8fafc", borderRadius:6, fontSize:12 }}>
        Não inclua diagnósticos, informações médicas ou dados pessoais desnecessários nas perguntas ou na base.
      </section>
    </main>
  );
}

// F01: prévia bloqueada; acesso restrito a RH/admin conforme o escopo do módulo.
export default function RhAssistentePage() {
  return (
    <AdminGate allowedRoles={["rh", "admin"]}>
      <RhAssistentePageContent />
    </AdminGate>
  );
}
