import type { Metadata } from "next";
import Layout01 from "@/components/Layout01";

export const metadata: Metadata = {
  title: "Layout 01 — Institucional clássica | Grupo SEG System",
  description: "Prévia visual original da proposta institucional clássica do Grupo SEG System.",
};

export default function Layout01Page() {
  return <Layout01 />;
}
