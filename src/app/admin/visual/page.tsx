import type { Metadata } from "next";
import VisualAdmin from "@/components/VisualAdmin";

export const metadata: Metadata = {
  title: "Aparência do site — Administração de demonstração | Grupo SEG System",
  description: "Prévia local da seleção dos dez layouts do site público.",
  robots: { index: false, follow: false },
};

export default function VisualAdminPage() {
  return <VisualAdmin />;
}
