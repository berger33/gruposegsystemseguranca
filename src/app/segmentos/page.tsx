import Link from "next/link";
import { SEGMENT_EXAMPLES } from "@/lib/segment-examples";

export const metadata = {
  title: "Segmentos — Grupo SEG System",
  description: "Exemplos de espaços e perguntas para orientar seu contato, sem prometer disponibilidade ou cobertura.",
};

export default function SegmentosPage() {
  return (
    <main style={{ padding: 40, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>Fale sobre seu espaço</h1>
      <p>Estes são exemplos para qualificar um pedido. A equipe confirmará a disponibilidade, o serviço adequado, a cobertura e as condições antes de qualquer proposta.</p>
      <ul>
        {SEGMENT_EXAMPLES.map((segment) => (
          <li key={segment.key} style={{ marginBottom: 18 }}>
            <h2><Link href={`/segmentos/${segment.key}`}>{segment.name}</Link></h2>
            <p>{segment.question}</p>
          </li>
        ))}
      </ul>
      <p>Veja também os <Link href="/servicos">serviços do formulário</Link> ou <Link href="/contato">entre em contato</Link>.</p>
    </main>
  );
}
