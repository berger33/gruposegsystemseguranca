import type { Metadata } from "next";
import SiteWorkspace from "./SiteWorkspace";

export const metadata: Metadata = {
  title: "Site público | SEG System",
  robots: { index: false, follow: false },
};

export default function AdminSitePage() {
  return <SiteWorkspace />;
}
