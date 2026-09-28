"use client";
import RagWidget from "@/components/RagWidget";
import AiBotWidget from "@/components/AiBotWidget";

export default function MarceloAssistentePage(){
  return (
    <main style={{ padding:24, maxWidth:900, margin:"0 auto", fontFamily:"system-ui, sans-serif" }}>
      <h1 style={{ fontSize:28 }}>Assistente Marcelo — acesso privado pendente</h1>
      <p style={{ fontSize:13, opacity:0.8 }}>A prévia deste módulo não está habilitada para consultas. Os componentes abaixo explicam o bloqueio. Autorização por papel, base aprovada e isolamento de dados ainda requerem testes em ambiente dedicado.</p>

      <AiBotWidget defaultRagKey="marcelo" showDevConfig={true} />

      <RagWidget ragKey="marcelo" title="RAG Marcelo Administração" description="Administração meu dia pendências reais prioridade responsável ação, visão comercial leads novos oportunidades paradas propostas próximas ações, visão operacional cobertura ocorrências críticas SLA implantação, visão financeira fonte competência saldo vencimentos margem por contrato, contratos próximos renovar reclamações reincidentes risco perda justificado, aprovação unificada descontos compras despesas exceções alçadas valor/escopo, busca autorizada favoritos filtros salvos atalhos contexto, relatórios exportáveis agendados destinatários autorizados, configurações negócio versionadas catálogo preços alçadas conteúdo SLA preferências, metas cenários comparação prevista/realizada, trilha diário decisões CON-11, análises expansão qualidade oportunidades adicionais, indicadores conversão cobertura SLA margem inadimplência rotatividade previsão comercial" placeholder="Ex: quais leads novos? qual cobertura hoje? qual margem por contrato? quais contratos próximos renovar? quais aprovações pendentes?" />

      <section style={{ marginTop:24, padding:12, background:"#f8fafc", borderRadius:6, fontSize:12 }}>
        <strong>Critérios pendentes (não homologados):</strong> RAG Marcelo apenas área pertinente gestão negócio, sem segredos técnicos ou saúde irrestrita, sem PII sensível, modelo qwen3:1.7b Ollama host http://localhost:11434 queue 100, fila garante todo mundo atendido, guardrails sem invenção preço/cobertura/licença/prazo, protocolo RAG-MAR-YYYYMMDD-XXXX, BOT-MA-YYYYMMDD-XXXX, modo desenvolvedor altera dinâmica sem_ia/com_ia/whatsapp padrão com_ia beta.
      </section>

      <section style={{ marginTop:16, padding:12, border:"1px solid #7c3aed", borderRadius:6, background:"#f5f3ff", fontSize:12 }}>
        <strong>Modo desenvolvedor — campo administrador altera dinâmica:</strong>
        <ul>
          <li><strong>sem_ia:</strong> chatbot sem IA baseado em pub_faq_assisted_rules aprovadas, sem LLM, sem invenção</li>
          <li><strong>com_ia (padrão beta):</strong> chatbot com IA RAG específico por perfil Ollama Qwen3 1.7B fila, base aprovada apenas área pertinente</li>
          <li><strong>whatsapp:</strong> redirecionamento para WhatsApp número configurado 551134372217 template com {"{protocol} {query}"}</li>
        </ul>
        <p>Configuração em /admin/ti seção AI RAG + bot modes — singleton_id=1 active_mode com_ia padrão beta, is_dev_mode true is_beta_mode true default_rag_key publico, histórico imutável ai_bot_config_history.</p>
      </section>
    </main>
  );
}
