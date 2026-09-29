import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AccessPanel from "./AccessPanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Roteiro local de homologação — Grupo SEG System",
  robots: { index: false, follow: false, nocache: true },
};

// No QA route, demo account or credentials are available in the normal preview.
// The runner explicitly enables this route on its loopback-only disposable PG server.
export default function QAModuleIndex() {
  if (process.env.QA_HOMOLOGATION_MODE !== "true" ||
      process.env.BIND_HOST !== "127.0.0.1" ||
      process.env.QA_PGLITE_ONLY === "true" ||
      !/^postgres(?:ql)?:\/\/[^/]*@127\.0\.0\.1:\d+\/seg_qa_homologacao$/.test(process.env.DATABASE_URL || "")) notFound();
  const blocks = [
    { id: "QA-HOM-002", group: "Sessão TI / Marcelo", title: "Pedidos do site", href: "/admin/leads", state: "Operacional no recorte QA", note: "Entrar antes aqui ou usar a chave temporária do terminal. Cadastrar somente pedidos fictícios. RH deve receber 403 na API." },
    { id: "QA-HOM-003", group: "Sessão TI / Marcelo", title: "Administração de clientes", href: "/admin/clientes", state: "Operacional no recorte QA", note: "Contas fictícias A e B; cliente A só pode ver A. Entrada administrativa por sessão TI ou chave Marcelo." },
    { id: "QA-HOM-004", group: "Cliente A", title: "Área real do cliente", href: "/cliente/entrar", state: "Operacional no recorte QA", note: "Entre com cliente.a.qa@example.invalid e a senha temporária; o vínculo apenas com empresa A já está pronto." },
    { id: "CRM-01..10", group: "TI / administração", title: "CRM", href: "/admin/crm", state: "Interface/APIs não homologadas", note: "A tela existe e as tabelas foram migradas; executar manualmente cadastro/funil e anotar falhas. Não declarar aprovado só por abrir." },
    { id: "TI", group: "TI", title: "TI / segurança", href: "/admin/ti", state: "Protótipo descritivo", note: "Cartões de funcionalidades previstas; os 21 componentes de TI não estão ligados a esta página." },
    { id: "ADM", group: "Marcelo", title: "Gestão Marcelo", href: "/admin/marcelo", state: "Protótipo descritivo", note: "Os cartões não implementam dashboard executivo, finanças ou aprovações." },
    { id: "HR-01..24", group: "RH", title: "Funcionários / RH", href: "/admin/funcionarios", state: "Em modelagem", note: "Página informativa. A conta RH confirma autenticação e proibição de acessar contas de cliente e leads; não homologa folha, ponto nem CLT." },
    { id: "RAG-SEG-001", group: "RH", title: "Assistente RH", href: "/admin/rh/assistente", state: "Bloqueado", note: "Consultas privadas pendentes; não inserir prontuários, salários ou qualquer dado real." },
    { id: "RAG-SEG-001", group: "Marcelo", title: "Assistente Marcelo", href: "/admin/marcelo/assistente", state: "Bloqueado", note: "Consultas privadas pendentes; não usar como ferramenta de gestão." },
    { id: "CLI-14", group: "Público", title: "Configuração do portal", href: "/admin/portal", state: "Protótipo sem efeito", note: "Opções mudam apenas na tela, sem alterar autenticação ou permissões reais." },
    { id: "PUB-07", group: "Público", title: "Aparência", href: "/admin/visual", state: "Prévia visual", note: "Demonstra layouts; não equivale a publicar tema ou homologar editor." },
  ];
  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
      <header style={{ borderBottom: "2px solid #173a65", paddingBottom: 12 }}>
        <small>AMBIENTE DESCARTÁVEL · DADOS FICTÍCIOS · NÃO PRODUÇÃO</small>
        <h1>Roteiro de homologação local</h1>
        <p>Esta página só aparece quando o runner QA inicia um PostgreSQL novo em 127.0.0.1. O ZIP anterior com PGlite não a habilita. Aqui, <strong>abrir uma tela não é aprovar uma funcionalidade</strong>.</p>
      </header>
      <AccessPanel />
      <h2>Módulos e limites</h2>
      <p>Execute os casos identificados, registre resultado e evidência; status “interface/APIs não homologadas” significa <strong>pendente de prova</strong>. Nunca use dados reais.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {blocks.map((block, index) => (
          <article key={`${block.id}-${index}`} style={{ border: "1px solid #9baaba", padding: 16, borderRadius: 8 }}>
            <small>{block.id} · {block.group}</small>
            <h3 style={{ margin: "6px 0" }}><a href={block.href}>{block.title} →</a></h3>
            <strong>{block.state}</strong><p>{block.note}</p>
          </article>
        ))}
      </div>
      <p>Para a matriz completa de 222 requisitos e bloqueios, leia <code>docs/RELATORIO-PENDENCIAS-COMPLETO.md</code> na pasta extraída. O roteiro executável está em <code>LEIA-ME-HOMOLOGACAO.md</code>. Testes de produção, carga, invasão e regras legais/fiscais não estão autorizados por este pacote.</p>
    </main>
  );
}
