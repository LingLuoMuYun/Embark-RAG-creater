import { AdminShell } from "@/components/layout/admin-shell";

export default function PersonalDocPage() {
  return (
    <AdminShell>
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">知识笔记</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            用于后续管理个人导入、上传和整理的文档。
          </p>
        </div>
      </section>
    </AdminShell>
  );
}
