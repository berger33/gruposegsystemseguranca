import type { Metadata } from "next";
import TerceirosWorkspace from "./TerceirosWorkspace";

export const metadata: Metadata = {
  title: "Terceiros | SEG System",
  robots: { index: false, follow: false },
};

export default function TerceirosPage() {
  return <TerceirosWorkspace />;
}
