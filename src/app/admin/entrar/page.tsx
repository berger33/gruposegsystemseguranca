import type { Metadata } from "next";
import { Suspense } from "react";
import AdminLoginClient from "./AdminLoginClient";

export const metadata: Metadata = { title: "Entrada da equipe | SEG System", robots: { index: false, follow: false } };

// F01 — entrada canônica do staff. O parâmetro `next` é lido no cliente
// (useSearchParams exige Suspense na página estática).
export default function AdminEntryPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginClient />
    </Suspense>
  );
}
