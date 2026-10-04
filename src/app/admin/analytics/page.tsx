import AdminGate from "../AdminGate";
import { AnalyticsWorkspace } from "./AnalyticsWorkspace";

export const metadata = {
  title: "Analytics e experimentos | Grupo SEG System",
  robots: { index: false, follow: false },
};

export default function AnalyticsPage() {
  return (
    <AdminGate allowedRoles={["admin", "ti", "marcelo"]}>
      <AnalyticsWorkspace />
    </AdminGate>
  );
}
