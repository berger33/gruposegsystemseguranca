import type { Metadata } from "next";
import CrmWorkspace from "./CrmWorkspace";

export const metadata: Metadata = {
  title: "CRM | SEG System",
  robots: { index: false, follow: false },
};

export default function AdminCrmPage() {
  return <CrmWorkspace />;
}
