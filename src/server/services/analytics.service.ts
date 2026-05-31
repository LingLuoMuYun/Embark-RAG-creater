import { prisma } from "@/lib/db";
import type { UsageLogCreateInput } from "@/features/analytics/analytics.validation";

const ACTIVITY_DAYS = 30;
const RECENT_DOCUMENT_LIMIT = 5;

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
  // Prefer explicit references from B's retrieve response. If a caller only
  // sends contexts, derive reference records from those contexts for analytics.
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
  // Empty contexts and references mean the user question did not hit knowledge.
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
    knowledgeDocuments,
    knowledgeChunks,
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
  ] = await Promise.all([
    prisma.documentSource.count(),
    prisma.documentSource.count({ where: { status: "parsed" } }),
    prisma.documentChunk.count(),
    prisma.knowledgeBase.count(),
    prisma.knowledgeDocument.count(),
    prisma.knowledgeChunk.count(),
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
  ]);

  return {
    totals: {
      documents: totalDocuments,
      parsedDocuments,
      documentChunks,
      knowledgeBases,
      knowledgeDocuments,
      knowledgeChunks,
      agents,
      activeAgents,
      usageLogs,
      noHitQueries,
    },
    statusBreakdown: {
      documents: normalizeStatusCounts(documentStatusGroups),
      agents: normalizeStatusCounts(agentStatusGroups),
    },
    recentDocuments: recentDocuments.map((document) => ({
      ...document,
      createdAt: document.createdAt.toISOString(),
    })),
    documentActivity: buildActivityDays(activityDocuments),
    hotKnowledge,
    knowledgeGaps,
  };
}
