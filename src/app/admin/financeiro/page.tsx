import type { Metadata } from "next";
import FinanceiroWorkspace from "./FinanceiroWorkspace";

export const metadata: Metadata = { title: "Financeiro | SEG System", robots: { index: false, follow: false } };
export default function FinanceiroPage() { return <FinanceiroWorkspace />; }
