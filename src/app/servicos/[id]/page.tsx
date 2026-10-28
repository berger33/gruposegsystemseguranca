import Link from "next/link";
import { PUBLIC_SERVICES, findService } from "@/lib/service-catalog.mjs";

type PageProps = { params: Promise<{ id: string }> };

// Next 16: `generateMetadata` recebe params com o segmento JÁ decodificado,
// enquanto o componente da página recebe o segmento ainda codificado pela URL
// (ex.: "Seguran%C3%A7a%20Desarmada"). Sem esta normalização, findService falha
// e os links da listagem exibem "Serviço não encontrado". Decodificar com
// fallback cobre os dois formatos sem alterar a rota pública nem o catálogo.
function decodeParam(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function generateStaticParams() {
  return PUBLIC_SERVICES.map((service) => ({ id: service.name }));
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const service = findService(decodeParam(id));
  return service
    ? { title: `${service.name} — Grupo SEG System`, description: service.short }
    : { title: "Serviço não encontrado" };
}

export default async function ServicoDetailPage({ params }: PageProps) {
  const { id } = await params;
  const service = findService(decodeParam(id));
  if (!service) {
    return <main style={{ padding: 40 }}><h1>Serviço não encontrado</h1><Link href="/servicos">Voltar aos serviços</Link></main>;
  }

  return (
    <main style={{ padding: 40, maxWidth: 860, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <Link href="/servicos">← Todos os serviços</Link>
      <h1>{service.name}</h1>
      <p>{service.short}</p>
      <h2>Conte-nos sobre sua necessidade</h2>
      <p>{service.question}</p>
      <p>O atendimento confirmará escopo, cobertura, preço e prazo. Não há orçamento nem visita confirmados automaticamente.</p>
      <p><Link href={`/orcamento?servico=${encodeURIComponent(service.name)}`}>Solicitar avaliação</Link> · <Link href="/contato">Contato</Link></p>
    </main>
  );
}
