"use client";
// @deprecated — E3 (27/10/2026): este widget chamava `POST /api/ai/bot`, que o
// `server.mjs` responde 410 `legacy_ai_retired` desde a canonicalização para
// `POST /api/ai/answer`. Também enviava feedback a `/api/ai/rag/feedback`,
// outro contrato retirado. Como o componente é órfão (nenhuma rota o monta),
// ele virou um ALIAS DE COMPATIBILIDADE: preserva a assinatura e o import para
// não quebrar quem um dia o referencie, mas delega a interface ao `RagWidget`
// canônico, que já é usado em /contato, nos assistentes do cliente, RH e
// gestão e coberto pelo gate `npm run test:ai-rag-widget:pg`.
//
// O que MUDOU de verdade: protocolo, fila Ollama, modo beta, redirecionamento
// WhatsApp, config de desenvolvedor, custo/token e feedback legado deixaram de
// ser exibidos — nenhum deles existe no contrato canônico. A tela agora mostra
// a resposta, as fontes aprovadas e o motivo honesto (`empty_scope`,
// `no_relevant_source`, `ai_unavailable`) sem inventar modelo ou protocolo.
//
// Escopo privado continua BLOQUEADO aqui: este alias público não amplia escopo.
// Cada papel usa a própria página de assistente, onde a sessão é verificada.
//
// F14 (modelo real, corpus produtivo, custo e curadoria) segue pendente e
// depende de decisão do proprietário. Produção: NO-GO.

import RagWidget from "./RagWidget";

type Props = {
  defaultRagKey?: "cliente" | "rh" | "marcelo" | "publico";
  showDevConfig?: boolean;
};

export default function AiBotWidget({ defaultRagKey = "publico", showDevConfig = false }: Props) {
  // Mantido na assinatura apenas por compatibilidade de quem ainda passa a
  // prop. O painel de desenvolvedor legado lia /api/ai-bot-config (admin) e
  // não tem equivalente na canônica; não é mais renderizado.
  void showDevConfig;

  if (defaultRagKey !== "publico") {
    return (
      <section
        style={{
          border: "2px solid var(--ux-color-border)",
          borderRadius: 14,
          padding: 20,
          background: "var(--ux-color-surface)",
          marginTop: 20,
        }}
      >
        <h3>Bot {defaultRagKey} — indisponível nesta versão</h3>
        <p>
          Atendimento privado desativado até autorização e isolamento de dados serem comprovados.
          Use a página de assistente do papel correspondente, onde a sessão é verificada no servidor.
          Não envie dados pessoais ao bot público.
        </p>
      </section>
    );
  }

  return (
    <RagWidget
      ragKey="publico"
      title="Assistente de dúvidas"
      description="Respostas baseadas apenas em conteúdo público aprovado. Sem base publicada ou com o modelo local desligado, a resposta é de indisponibilidade — nunca inventada."
    />
  );
}
