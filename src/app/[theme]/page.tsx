import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicSite from "@/components/PublicSite";
import { THEMES, type Theme } from "@/lib/themes";

export function generateStaticParams() {
  return THEMES.filter(theme => theme.id !== "classico").map(theme => ({ theme: theme.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ theme: string }> }): Promise<Metadata> {
  const { theme } = await params;
  const found = THEMES.find(item => item.id === theme);
  return { title: found ? `Prévia ${found.name} | Grupo SEG System` : "Interface não encontrada" };
}

export default async function ThemePage({ params }: { params: Promise<{ theme: string }> }) {
  const { theme } = await params;
  const found = THEMES.find(item => item.id === theme && item.id !== "classico");
  if (!found) notFound();
  return <PublicSite initialTheme={found.id as Theme} />;
}
