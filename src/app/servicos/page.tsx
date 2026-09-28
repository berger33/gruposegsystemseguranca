import Link from "next/link";
import { PUBLIC_SERVICES } from "@/lib/service-catalog.mjs";

export const metadata = {
  title: "Serviços — Grupo SEG System",
  description: "Conheça os serviços apresentados pelo Grupo SEG System e solicite uma avaliação sem preços ou prazos presumidos.",
};

export default function ServicosPage() {
  return (
    <main style={{ padding: 40, maxWidth: 1000, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>Serviços</h1>
      <p>Conheça as opções do catálogo usado pelo formulário de pedidos. Escopo, cobertura, disponibilidade, preço e prazo dependem de avaliação e confirmação humana; a página não representa uma proposta contratual.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {PUBLIC_SERVICES.map((service) => (
          <article key={service.name} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
            <h2>{service.name}</h2>
            <p>{service.short}</p>
            <p><strong>Para entendermos sua necessidade:</strong> {service.question}</p>
            <Link href={`/servicos/${encodeURIComponent(service.name)}`}>Conhecer este serviço</Link>
          </article>
        ))}
      </div>
      <p style={{ marginTop: 24 }}>Quer conversar com a equipe? <Link href="/orcamento">Solicite uma avaliação</Link> ou <Link href="/contato">entre em contato</Link>.</p>
    </main>
  );
}
