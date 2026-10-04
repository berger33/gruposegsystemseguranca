import type { Metadata } from "next";
import AdminHub from "./AdminHub";

export const metadata: Metadata = { title: "Área administrativa | SEG System", robots: { index: false, follow: false } };

// F01 — /admin deixa de ser 404: gate central de sessão + hub por papel.
export default function AdminPage() {
  return <AdminHub />;
}
