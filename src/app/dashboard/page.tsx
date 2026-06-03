import { AdminShell } from "@/components/layout/admin-shell";
import { CategoryDistribution } from "@/features/analytics/components/category-distribution";
import { InsightCard } from "@/features/analytics/components/insight-card";
import { KnowledgeProductionActivity } from "@/features/analytics/components/knowledge-production-activity";
import { MyAgents } from "@/features/analytics/components/my-agents";
import { PlaceholderPanel } from "@/features/analytics/components/placeholder-panel";
import { StatusBreakdown } from "@/features/analytics/components/status-breakdown";
import { UsageTrendChart } from "@/features/analytics/components/usage-trend-chart";
import { getAnalyticsOverview } from "@/server/services/analytics.service";

export const dynamic = "force-dynamic";

function getGreeting() {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 11) return "上午好";
  if (hour >= 11 && hour < 14) return "中午好";
  if (hour >= 14 && hour < 18) return "下午好";
  return "晚上好";
}

export default async function DashboardPage() {
  const overview = await getAnalyticsOverview();
  const greeting = getGreeting();
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
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
            {greeting}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            今天想探索什么知识呢
          </p>
        </div>

        <InsightCard items={overview.insights} />

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <KnowledgeProductionActivity
            documents={overview.recentDocuments}
            knowledge={overview.recentKnowledge}
          />
          <MyAgents agents={overview.recentAgents} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <UsageTrendChart days={overview.usageTrend} />
          <PlaceholderPanel
            title="热门知识排行"
            emptyText="暂无热门知识数据"
            items={hotKnowledgeItems}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <StatusBreakdown
            title="文档状态分布"
            items={overview.statusBreakdown.documents}
          />
          <CategoryDistribution items={overview.categoryDistribution} />
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
