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
    { id: "CRM-01..10", group: "TI / administração", title: "CRM", href: "/admin/crm", state: "Operacional em gates; UAT pendente", note: "Cadastro, funil, tarefas, cadências, visitas e a cadeia lead→contrato→implantação têm gates PostgreSQL/HTTP. Falta percorrer a jornada por papel com dados fictícios e registrar o aceite." },
    { id: "TI", group: "TI", title: "TI / segurança", href: "/admin/ti", state: "Console real + protótipos restantes", note: "TiConsole já monta 16 ferramentas reais (as 12 anteriores + Dependências/PLT-14, Documentação de manutenção/PLT-18, Orçamento e uso/PLT-16 e Ambientes e isolamento/PLT-17, todas promovidas com prova), cada uma com teste focal. A aba de ambientes é inventário declarativo: não conecta nem configura produção (NO-GO). Restam 42 componentes antigos sem rota (25 outros estão em workspaces); o inventário reproduzível é docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.csv, com as promoções registradas no JSON. São protótipos documentados, sem prova de autorização, e não devem ser ligados em massa." },
    { id: "ADM", group: "Marcelo", title: "Gestão Marcelo", href: "/admin/marcelo", state: "Painel real (aceite L07)", note: "MarceloPanel consulta /api/adm/panel/* com papel e origem decididos no servidor. FIN-01..16 e ADM-01..12 têm aceite humano registrado em 02/10; a homologação das telas por perfil ainda não foi feita." },
    { id: "HR-01..24", group: "RH", title: "Funcionários / RH", href: "/admin/funcionarios", state: "Operacional; validação legal pendente", note: "RhWorkspace e portal do funcionário estão ligados às APIs /api/admin/hr/* e /api/employee/*. Ponto, documentos, solicitações, folha e ajustes têm gates. Regras de CLT, convenções, Portaria 671 e eSocial exigem parecer de contador/advogado." },
    { id: "RAG-SEG-001", group: "RH", title: "Assistente RH", href: "/admin/rh/assistente", state: "Escopo privado ativo; modelo desligado", note: "RagWidget usa /api/ai/answer com sessão, papel e escopo verificados no servidor. Sem base publicada ou OLLAMA_ENABLED=true a resposta é indisponibilidade honesta, nunca inventada. Não inserir dados reais." },
    { id: "RAG-SEG-001", group: "Marcelo", title: "Assistente Marcelo", href: "/admin/marcelo/assistente", state: "Escopo privado ativo; modelo desligado", note: "Mesmo contrato do assistente RH, com escopo marcelo. Homologação humana dos cinco perfis do RAG beta ainda pendente." },
    { id: "CLI-14", group: "Público", title: "Configuração do portal", href: "/admin/portal", state: "Protótipo sem persistência", note: "Os três modos de cadastro são comparados apenas na tela; ainda não gravam configuração nem alteram autenticação/permissões. A segurança real do portal já é decidida no servidor." },
    { id: "PUB-07", group: "Público", title: "Aparência do site", href: "/admin/aparencia", state: "Galeria e publicação auditada", note: "Compara layouts e publica uma escolha com permissão, confirmação e registro de auditoria." },
  ];
  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
      <header style={{ borderBottom: "2px solid #173a65", paddingBottom: 12 }}>
        <small>AMBIENTE DESCARTÁVEL · DADOS FICTÍCIOS · NÃO PRODUÇÃO</small>
        <h1>Roteiro de homologação local</h1>
        <p>Esta página só aparece quando o runner QA inicia um PostgreSQL novo em 127.0.0.1. O ZIP anterior com PGlite não a habilita. Aqui, <strong>abrir uma tela não é aprovar uma funcionalidade</strong>.</p>
        <p><strong>Índice reconciliado em 26/10/2026 sobre a main <code>6b4212d</code> (PR #298)</strong>: os blocos abaixo foram corrigidos porque ainda descreviam TI, Marcelo, RH e os assistentes como protótipos bloqueados. Os estados atuais continuam sem aceite humano e sem homologação; consulte <code>docs/STATUS-VIGENTE.md</code> para a fila vigente.</p>
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
