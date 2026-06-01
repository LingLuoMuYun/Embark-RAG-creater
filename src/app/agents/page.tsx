import { AdminShell } from "@/components/layout/admin-shell";

export default function AgentsPage() {
  return (
    <AdminShell>
      <section className="max-w-4xl">
        <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
          <p className="text-sm font-medium text-muted-foreground">
            专家 Agent
          </p>
          <h2 className="mt-2 text-xl font-semibold">专家 Agent 占位页</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            后续将在此配置专家 Agent 并关联知识库。当前阶段不接入真实业务数据、表单或接口。
          </p>
        </div>
      </section>
    </AdminShell>
  );
}
