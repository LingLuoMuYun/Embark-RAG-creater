import { AdminShell } from "@/components/layout/admin-shell";
import { ActivityHeatmap } from "@/features/analytics/components/activity-heatmap";
import { CategoryDistribution } from "@/features/analytics/components/category-distribution";
import { PlaceholderPanel } from "@/features/analytics/components/placeholder-panel";
import { RecentDocuments } from "@/features/analytics/components/recent-documents";
import { RecentKnowledgeList } from "@/features/analytics/components/recent-knowledge-list";
import { StatCard } from "@/features/analytics/components/stat-card";
import { StatusBreakdown } from "@/features/analytics/components/status-breakdown";
import { getAnalyticsOverview } from "@/server/services/analytics.service";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const overview = await getAnalyticsOverview();
  const { totals } = overview;
  const hotKnowledgeItems = overview.hotKnowledge.map((item) => ({
    id: item.knowledgeId,
    title: item.title,
    meta: `${item.hitCount.toLocaleString("zh-CN")} 次命中`,
  }));
  const knowledgeGapItems = overview.knowledgeGaps.map((item) => ({
    id: item.query,
    title: item.query,
    meta: `${item.count.toLocaleString("zh-CN")} 次未命中`,
  }));

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="mb-1 text-sm font-medium text-zinc-500">
            知识闭环与数据分析
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Dashboard 数据总览
          </h1>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="文档总数"
            value={totals.documents}
            description={`其中 ${totals.parsedDocuments.toLocaleString(
              "zh-CN"
            )} 个已解析`}
          />
          <StatCard
            label="文档分段"
            value={totals.documentChunks}
            description="文档解析后生成的文本 chunks"
          />
          <StatCard
            label="知识库"
            value={totals.knowledgeBases}
            description={`${totals.knowledgeDocuments.toLocaleString(
              "zh-CN"
            )} 个知识文档`}
          />
          <StatCard
            label="Agent"
            value={totals.agents}
            description={`${totals.activeAgents.toLocaleString(
              "zh-CN"
            )} 个已启用`}
          />
          <StatCard
            label="检索日志"
            value={totals.usageLogs}
            description="系统记录的知识检索事件"
          />
          <StatCard
            label="知识缺口"
            value={totals.noHitQueries}
            description="RAG 未命中的用户问题数量"
          />
          <StatCard
            label="待确认知识"
            value={totals.pendingKnowledge}
            description="status 为 pending 的知识条目"
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <ActivityHeatmap days={overview.documentActivity} />
          <RecentDocuments documents={overview.recentDocuments} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <StatusBreakdown
            title="文档状态分布"
            items={overview.statusBreakdown.documents}
          />
          <StatusBreakdown
            title="Agent 状态分布"
            items={overview.statusBreakdown.agents}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <RecentKnowledgeList items={overview.recentKnowledge} />
          <CategoryDistribution items={overview.categoryDistribution} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <PlaceholderPanel
            title="热门知识排行"
            emptyText="暂无热门知识数据"
            items={hotKnowledgeItems}
          />
          <PlaceholderPanel
            title="知识缺口"
            emptyText="暂无知识缺口数据"
            items={knowledgeGapItems}
          />
        </div>
      </div>
    </AdminShell>
  );
}
