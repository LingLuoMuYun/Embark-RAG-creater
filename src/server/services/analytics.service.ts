import { prisma } from "@/lib/db";
import type { UsageLogCreateInput } from "@/features/analytics/analytics.validation";

const ACTIVITY_DAYS = 30;
const RECENT_DOCUMENT_LIMIT = 5;
const RECENT_KNOWLEDGE_LIMIT = 5;
const UNCATEGORIZED_CATEGORY_ID = "__uncategorized__";

export type AnalyticsOverview = Awaited<ReturnType<typeof getAnalyticsOverview>>;

type StatusCount = {
  status: string;
  count: number;
};

type ActivityDay = {
  date: string;
  count: number;
};

function toReferenceKey(reference: {
  knowledgeBaseId: string;
  knowledgeId: string;
  chunkId: string;
}) {
  return [
    reference.knowledgeBaseId,
    reference.knowledgeId,
    reference.chunkId,
  ].join(":");
}

function normalizeReferences(input: UsageLogCreateInput) {
  const references =
    input.references.length > 0
      ? input.references
      : input.contexts.map((context) => ({
          knowledgeBaseId: context.knowledgeBaseId,
          knowledgeId: context.knowledgeId,
          chunkId: context.chunkId,
          title: context.title,
          chunkType: context.chunkType,
        }));

  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = toReferenceKey(reference);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildActivityDays(documents: { createdAt: Date }[]): ActivityDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const counts = new Map<string, number>();
  for (const document of documents) {
    const key = toDateKey(document.createdAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from({ length: ACTIVITY_DAYS }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (ACTIVITY_DAYS - 1 - index));
    const key = toDateKey(date);

    return {
      date: key,
      count: counts.get(key) ?? 0,
    };
  });
}

function normalizeStatusCounts(
  values: Array<{ status: string; _count: { status: number } }>
): StatusCount[] {
  return values.map((item) => ({
    status: item.status,
    count: item._count.status,
  }));
}

export async function createUsageLog(input: UsageLogCreateInput) {
  const references = normalizeReferences(input);
  const noHit = input.contexts.length === 0 && references.length === 0;

  return prisma.usageLog.create({
    data: {
      source: "rag_retrieve",
      query: input.query,
      mode: input.mode,
      scope: JSON.stringify(input.scope),
      hitCount: references.length,
      noHit,
      references: {
        create: references.map((reference) => ({
          knowledgeBaseId: reference.knowledgeBaseId,
          knowledgeId: reference.knowledgeId,
          chunkId: reference.chunkId,
          title: reference.title,
          type: reference.chunkType,
          chunkType: reference.chunkType,
        })),
      },
    },
    include: {
      references: true,
    },
  });
}

export async function getHotKnowledge(limit = 10) {
  const items = await prisma.usageReference.groupBy({
    by: ["knowledgeBaseId", "knowledgeId", "title"],
    _count: {
      knowledgeId: true,
    },
    orderBy: {
      _count: {
        knowledgeId: "desc",
      },
    },
    take: limit,
  });

  return items.map((item) => ({
    knowledgeBaseId: item.knowledgeBaseId,
    knowledgeId: item.knowledgeId,
    title: item.title,
    hitCount: item._count.knowledgeId,
  }));
}

export async function getRecentKnowledge(limit = 10) {
  const documents = await prisma.documentSource.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      sourceType: true,
      status: true,
      parseStatus: true,
      createdAt: true,
      knowledgeBases: {
        take: 1,
        select: { knowledgeBaseId: true },
      },
    },
  });

  return documents.map((document) => ({
    id: document.id,
    knowledgeBaseId: document.knowledgeBases[0]?.knowledgeBaseId ?? null,
    title: document.title,
    sourceType: document.sourceType,
    status: document.status,
    parseStatus: document.parseStatus,
    createdAt: document.createdAt.toISOString(),
  }));
}

export async function getCategoryDistribution() {
  const [categories, chunkGroups, totalChunks] = await Promise.all([
    prisma.knowledgeCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.documentChunk.groupBy({
      by: ["category"],
      where: { category: { not: null } },
      _count: { category: true },
    }),
    prisma.documentChunk.count(),
  ]);

  const countByCategoryName = new Map(
    chunkGroups.map((group) => [group.category ?? "", group._count.category])
  );
  const categorizedCount = Array.from(countByCategoryName.values()).reduce(
    (sum, count) => sum + count,
    0
  );
  const items = categories.map((category) => ({
    categoryId: category.id,
    name: category.name,
    color: category.color,
    count: countByCategoryName.get(category.name) ?? 0,
  }));

  for (const [category, count] of countByCategoryName) {
    if (!items.some((item) => item.name === category)) {
      items.push({
        categoryId: category,
        name: category,
        color: null,
        count,
      });
    }
  }

  if (totalChunks - categorizedCount > 0) {
    items.push({
      categoryId: UNCATEGORIZED_CATEGORY_ID,
      name: "未分类",
      color: null,
      count: totalChunks - categorizedCount,
    });
  }

  return items;
}

export async function getKnowledgeGaps(limit = 10) {
  const items = await prisma.usageLog.groupBy({
    by: ["query"],
    where: {
      noHit: true,
    },
    _count: {
      query: true,
    },
    orderBy: {
      _count: {
        query: "desc",
      },
    },
    take: limit,
  });

  return items.map((item) => ({
    query: item.query,
    count: item._count.query,
  }));
}

export async function getAnalyticsOverview() {
  const activityStart = new Date();
  activityStart.setHours(0, 0, 0, 0);
  activityStart.setDate(activityStart.getDate() - (ACTIVITY_DAYS - 1));

  const [
    totalDocuments,
    parsedDocuments,
    documentChunks,
    knowledgeBases,
    agents,
    activeAgents,
    usageLogs,
    noHitQueries,
    documentStatusGroups,
    agentStatusGroups,
    recentDocuments,
    activityDocuments,
    hotKnowledge,
    knowledgeGaps,
    pendingKnowledge,
    recentKnowledge,
    categoryDistribution,
  ] = await Promise.all([
    prisma.documentSource.count(),
    prisma.documentSource.count({ where: { status: "parsed" } }),
    prisma.documentChunk.count(),
    prisma.knowledgeBase.count(),
    prisma.expertAgent.count(),
    prisma.expertAgent.count({ where: { status: "active" } }),
    prisma.usageLog.count(),
    prisma.usageLog.count({ where: { noHit: true } }),
    prisma.documentSource.groupBy({
      by: ["status"],
      _count: { status: true },
      orderBy: { status: "asc" },
    }),
    prisma.expertAgent.groupBy({
      by: ["status"],
      _count: { status: true },
      orderBy: { status: "asc" },
    }),
    prisma.documentSource.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_DOCUMENT_LIMIT,
      select: {
        id: true,
        title: true,
        originalName: true,
        fileType: true,
        status: true,
        chunkCount: true,
        createdAt: true,
      },
    }),
    prisma.documentSource.findMany({
      where: {
        createdAt: {
          gte: activityStart,
        },
      },
      select: {
        createdAt: true,
      },
    }),
    getHotKnowledge(5),
    getKnowledgeGaps(5),
    prisma.documentSource.count({ where: { status: "pending" } }),
    getRecentKnowledge(RECENT_KNOWLEDGE_LIMIT),
    getCategoryDistribution(),
  ]);

  return {
    totals: {
      documents: totalDocuments,
      parsedDocuments,
      documentChunks,
      knowledgeBases,
      knowledgeDocuments: totalDocuments,
      knowledgeChunks: documentChunks,
      agents,
      activeAgents,
      usageLogs,
      noHitQueries,
      pendingKnowledge,
    },
    statusBreakdown: {
      documents: normalizeStatusCounts(documentStatusGroups),
      agents: normalizeStatusCounts(agentStatusGroups),
    },
    recentDocuments: recentDocuments.map((document) => ({
      ...document,
      originalName: document.originalName ?? document.title,
      fileType: document.fileType ?? "unknown",
      createdAt: document.createdAt.toISOString(),
    })),
    documentActivity: buildActivityDays(activityDocuments),
    hotKnowledge,
    knowledgeGaps,
    recentKnowledge,
    categoryDistribution,
  };
}
