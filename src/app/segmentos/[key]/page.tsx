import Link from "next/link";
import { SEGMENT_EXAMPLES } from "@/lib/segment-examples.mjs";

type PageProps = { params: Promise<{ key: string }> };

export function generateStaticParams() {
  return SEGMENT_EXAMPLES.map(({ key }) => ({ key }));
}

export async function generateMetadata({ params }: PageProps) {
  const { key } = await params;
  const segment = SEGMENT_EXAMPLES.find((item) => item.key === key);
  return segment ? { title: `${segment.name} — Grupo SEG System` } : { title: "Segmento não encontrado" };
}

export default async function SegmentoDetailPage({ params }: PageProps) {
  const { key } = await params;
  const segment = SEGMENT_EXAMPLES.find((item) => item.key === key);
  if (!segment) {
    return <main style={{ padding: 40 }}><h1>Segmento não encontrado</h1><Link href="/segmentos">Voltar aos segmentos</Link></main>;
  }
  return (
    <main style={{ padding: 40, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <Link href="/segmentos">← Outros espaços</Link>
      <h1>{segment.name}</h1>
      <p>Para entender sua necessidade: {segment.question}</p>
      <p>A lista é ilustrativa. Serviços, cobertura, preços e prazos serão confirmados por uma pessoa da equipe após avaliação, sem confirmação automática de visita.</p>
      <Link href={`/orcamento?segmento=${encodeURIComponent(segment.key)}`}>Solicitar avaliação</Link>
    </main>
  );
}
