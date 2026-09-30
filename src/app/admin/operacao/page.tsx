import type { Metadata } from "next";
import OperacaoWorkspace from "./OperacaoWorkspace";

export const metadata: Metadata = {
  title: "Operação | SEG System",
  robots: { index: false, follow: false },
};

export default function OperacaoPage() {
  return <OperacaoWorkspace />;
}
