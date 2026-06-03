import Link from "next/link";

type RecentDocument = {
  id: string;
  originalName: string;
  fileType: string;
  status: string;
  chunkCount: number;
  createdAt: string;
};

type RecentKnowledgeItem = {
  id: string;
  knowledgeBaseId: string | null;
  title: string;
  sourceType: string;
  status: string;
  parseStatus: string;
  createdAt: string;
};

type KnowledgeProductionActivityProps = {
  documents: RecentDocument[];
  knowledge: RecentKnowledgeItem[];
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "手动录入",
  file: "文件导入",
  wiki: "Wiki 提炼",
  import: "外部导入",
  conversation: "对话沉淀",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatKnowledgeStatus(status: string): string {
  if (status === "pending") return "待审核";
  if (status === "confirmed") return "已确认";
  if (status === "rejected") return "已驳回";
  if (status === "active") return "可用";
  return status;
}

export function KnowledgeProductionActivity({
  documents,
  knowledge,
}: KnowledgeProductionActivityProps) {
  return (
    <section className="h-full min-h-[320px] rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            知识生产动态
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            从导入素材到生成知识的最新进展
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-900">
              最近新增素材
            </h3>
            <Link
              href="/documents"
              className="text-sm font-medium text-blue-600"
            >
              去导入
            </Link>
          </div>
          {documents.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 py-8 text-center text-sm text-zinc-400">
              暂无导入素材
            </p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {documents.slice(0, 3).map((document) => (
                <div key={document.id} className="flex items-center gap-3 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-semibold uppercase text-blue-600">
                    {document.fileType}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {document.originalName}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {document.status} · {document.chunkCount} 段 ·{" "}
                      {formatDate(document.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-900">
              最近生成知识
            </h3>
            <Link
              href="/candidates"
              className="text-sm font-medium text-blue-600"
            >
              去审核
            </Link>
          </div>
          {knowledge.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 py-8 text-center text-sm text-zinc-400">
              暂无生成知识
            </p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {knowledge.slice(0, 3).map((item) => (
                <div key={item.id} className="py-3">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {SOURCE_LABELS[item.sourceType] ?? item.sourceType} ·{" "}
                    {formatKnowledgeStatus(item.status)} ·{" "}
                    {formatDate(item.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
