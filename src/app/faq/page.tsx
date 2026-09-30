import { PUBLIC_SERVICES } from "@/lib/service-catalog.mjs";
import FaqAssistedWidget from "@/components/FaqAssistedWidget";

export const metadata = {
  title: "FAQ — Grupo SEG System",
  description: "Perguntas frequentes revisadas: serviços, contratação, visita técnica, preços, privacidade, cidades atendidas.",
};

const FAQ_STATIC = [
  {
    id: "q1",
    category: "servicos",
    question: "Quais serviços a SEG System oferece?",
    answer: "Oferecemos seis serviços validados: Segurança Desarmada, Monitoramento 24 Horas, Câmeras e CFTV, Portaria e Controle de Acesso, Limpeza e Conservação, Supervisão e Ronda. Cada serviço tem descrição, público e perguntas de qualificação no catálogo. Cerca elétrica ou novos serviços entram somente após validação comercial.",
  },
  {
    id: "q2",
    category: "contratacao",
    question: "Como solicitar um orçamento?",
    answer: "Você pode solicitar orçamento pelo site em /orcamento ou /simulador, informando tipo de imóvel, serviços de interesse e detalhes. O pedido gera um protocolo persistido e entra na fila de atendimento em /admin/leads. É necessário consentimento explícito. Origem e campanha são registradas para mensuração com minimização de dados.",
  },
  {
    id: "q3",
    category: "visita",
    question: "Como funciona a visita técnica?",
    answer: "A visita tem estados: solicitada, em agendamento, confirmada, realizada, cancelada. Após solicitar, nossa equipe entra em contato para agendar. A confirmação é feita por pessoa responsável — a notificação não promete horário sem reserva real. Você receberá confirmação apenas após agendamento efetivo.",
  },
  {
    id: "q4",
    category: "pagamento",
    question: "O preço é informado no site?",
    answer: "Não. O site não exibe preços fictícios. O orçamento é elaborado após qualificação e vistoria, com parâmetros de custos, tributos e margem versionados. Nenhuma promessa de preço de demonstração em produção.",
  },
  {
    id: "q5",
    category: "geral",
    question: "Como é garantida a privacidade dos meus dados?",
    answer: "Tratamos dados com minimização: nome, telefone, cidade/bairro, tipo de local, serviços, preferência de visita, detalhes opcionais e consentimento. Auditoria com retenção de 12 meses, sem segredos. Política de privacidade em /privacidade é minuta pendente de aprovação formal, site permanece noindex até homologação.",
  },
  {
    id: "q6",
    category: "geral",
    question: "Vocês atendem em quais cidades?",
    answer: "Atendemos principalmente Guarulhos e região metropolitana de São Paulo. Informe sua cidade/bairro no formulário para verificação de cobertura. Novos segmentos ou regiões entram somente após validação comercial.",
  },
];

export default function FaqPage() {
  return (
    <main style={{ padding: 40, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 32 }}>FAQ revisada — PUB-02</h1>
      <p style={{ opacity: 0.8 }}>Perguntas frequentes revisadas, com contato claro, sem invenção de preço, cobertura, licença ou prazo. Bot não promete horário sem reserva real. FAQ assistida e transferência humana quando implementado (PUB-05).</p>

      <section style={{ marginTop: 24 }}>
        {FAQ_STATIC.map((f) => (
          <details key={f.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: "12px 16px", marginBottom: 12, background: "#fff" }}>
            <summary style={{ fontWeight: 600, cursor: "pointer" }}>{f.question} <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 8 }}>[{f.category}]</span></summary>
            <p style={{ marginTop: 8, fontSize: 14 }}>{f.answer}</p>
          </details>
        ))}
      </section>

      <section style={{ marginTop: 32, padding: 16, borderLeft: "4px solid #0b5fff", background: "#f0f7ff" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Contato claro</h2>
        <p style={{ fontSize: 14, margin: "8px 0 0" }}>
          Endereço: Av. Armando Bei, 305 - Sala 01, Vila Nova Bonsucesso, Guarulhos, SP, 07175-000 (confirmado em proximo-passo.md, CNPJ pendente D-11)<br />
          Telefone: (11) 3437-2217<br />
          E-mail: contato@gruposegsystemseguranca.com.br (pendente confirmação)<br />
          Horário: Segunda a sexta, 08h às 18h<br />
          Site: <a href="/contato" style={{ color: "#0b5fff" }}>/contato</a> com formulário integrado à mesma API de leads.
        </p>
      </section>

      <FaqAssistedWidget />
      

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>Acessibilidade, navegação e desempenho — PUB-02</h2>
        <ul style={{ fontSize: 14 }}>
          <li>Navegação consistente, breadcrumbs, estados vazios explicam próxima ação</li>
          <li>Sem termos técnicos de implantação em jornadas de negócio</li>
          <li>Imagens e cases autorizados apenas quando houver autorização formal em tabela cases (is_authorized)</li>
          <li>SEO técnico, títulos, sitemap, redirects e verificação de domínio na liberação; noindex mantido em ambientes não produtivos</li>
          <li>Montador de pacote/comparador somente a partir de catálogo e regras aprovadas, sem preço demonstração em produção (PUB-09)</li>
          <li>Segmentos validados: <a href="/segmentos" style={{ color:"#0b5fff" }}>/segmentos</a> condominios, empresas, industrias com audience benefits validados</li>
          <li>FAQ assistida PUB-05: bot não inventa preço/cobertura/licença/prazo, transferência humana protocolo HND-PUB, base aprovada antes IA/RAG</li>
        </ul>
      </section>
    </main>
  );
}
