"use client";
import RagWidget from "@/components/RagWidget";
import AiBotWidget from "@/components/AiBotWidget";

export default function ClienteAssistentePage(){
  return (
    <main style={{ padding:24, maxWidth:900, margin:"0 auto", fontFamily:"system-ui, sans-serif" }}>
      <h1 style={{ fontSize:28 }}>Assistente Cliente — acesso privado pendente</h1>
      <p style={{ fontSize:13, opacity:0.8 }}>A prévia deste módulo não está habilitada para consultas. Os componentes abaixo explicam o bloqueio. Autorização por papel, base aprovada e isolamento de dados ainda requerem testes em ambiente dedicado.</p>

      <AiBotWidget defaultRagKey="cliente" showDevConfig={false} />

      <RagWidget ragKey="cliente" title="RAG Cliente" description="Portal cliente com entrada única, contratos itens vigência escopo claro, documentos categoria validade versão download privado, chamados protocolo SLA, agenda visita, relatórios execução, cobranças somente financeiro integrado, solicitação serviço adicional gera oportunidade CRM, satisfação, renovação, modos convite, segurança conta MFA, reclamação colaborador canal restrito" placeholder="Ex: como consultar meus contratos? como baixar documento? como abrir chamado? qual status minha fatura?" />

      <section style={{ marginTop:24, padding:12, background:"#f8fafc", borderRadius:6, fontSize:12 }}>
        <strong>Critérios pendentes (não homologados):</strong> RAG cliente apenas área pertinente cliente, sem RH/saúde/salário, sem dados outra conta, modelo qwen3:1.7b Ollama host http://localhost:11434 queue 100, fila garante todo mundo atendido, guardrails sem invenção preço/cobertura/licença/prazo, protocolo RAG-CLI-YYYYMMDD-XXXX, BOT-CL-YYYYMMDD-XXXX.
      </section>
    </main>
  );
}
