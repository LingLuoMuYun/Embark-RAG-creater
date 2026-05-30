import { AdminShell } from "@/components/layout/admin-shell";
import { KnowledgeBaseManagement } from "@/features/knowledge-bases/knowledge-base-management";

export default function KnowledgeBasesPage() {
  return (
    <AdminShell>
      <KnowledgeBaseManagement />
    </AdminShell>
  );
}
