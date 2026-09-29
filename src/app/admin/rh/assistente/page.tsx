"use client";
import RagWidget from "@/components/RagWidget";
import AiBotWidget from "@/components/AiBotWidget";

export default function RhAssistentePage(){
  return (
    <main style={{ padding:24, maxWidth:900, margin:"0 auto", fontFamily:"system-ui, sans-serif" }}>
      <h1 style={{ fontSize:28 }}>Assistente RH — acesso privado pendente</h1>
      <p style={{ fontSize:13, opacity:0.8 }}>A prévia deste módulo não está habilitada para consultas. Os componentes abaixo explicam o bloqueio. Autorização por papel, base aprovada e isolamento de dados ainda requerem testes em ambiente dedicado.</p>

      <AiBotWidget defaultRagKey="rh" showDevConfig={false} />

      <RagWidget ragKey="rh" title="RAG RH Andreia" description="RH cadastro profissional separado login, histórico cargo lotação remuneração autorizada, recrutamento vaga candidatos triagem entrevista, banco talentos, admissão checklist documentos validação exame treinamento, dossiê tipos versões validade pendências aprovador, desligamento checklist devolução revogação, férias períodos aquisitivo concessivo saldo programação conflito cobertura, afastamentos período retorno documentação restrita substituição, ponto justificativas divergências workflow correção fechamento competência, banco horas adicionais, benefícios elegibilidade solicitações conferência exportação fornecedor, adiantamentos reembolsos alçada comprovantes, saúde ocupacional agenda vencimentos documentos restritos, integração contabilidade SST, treinamento por cargo, competências, uniformes EPI, fechamento DP, holerites fonte autorizada, avaliações planos desenvolvimento, atendimento interno, indicadores" placeholder="Ex: como admitir colaborador? como programar férias? como consultar benefício? qual treinamento vence?" />

      <section style={{ marginTop:24, padding:12, background:"#f8fafc", borderRadius:6, fontSize:12 }}>
        <strong>Critérios pendentes (não homologados):</strong> RAG RH apenas área pertinente RH, sem dados cliente PII, sem diagnóstico médico exposto, modelo qwen3:1.7b Ollama host http://localhost:11434 queue 100, fila garante todo mundo atendido, guardrails sem invenção preço/cobertura/licença/prazo, protocolo RAG-RH-YYYYMMDD-XXXX, BOT-RH-YYYYMMDD-XXXX.
      </section>
    </main>
  );
}
