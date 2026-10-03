import type { Metadata } from "next";
import FrotaWorkspace from "./FrotaWorkspace";

export const metadata: Metadata = {
  title: "Frota | SEG System",
  robots: { index: false, follow: false },
};

export default function FrotaPage() {
  return <FrotaWorkspace />;
}
