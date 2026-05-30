import type {
  KnowledgeBaseFormValues,
  RagListItem,
  RagStatus,
  SortDirection,
  SortField,
  StatusFilter,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function toNumberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStatus(value: unknown): RagStatus {
  return value === "active" || value === "disabled" ? value : "disabled";
}

export function createClientId() {
  return `kb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeRagItem(input: unknown): RagListItem {
  const item = isRecord(input) ? input : {};

  return {
    id: toStringValue(item.id, createClientId()),
    name: toStringValue(item.name, "未命名知识库"),
    description: toStringValue(item.description, "暂无描述"),
    icon: typeof item.icon === "string" ? item.icon : undefined,
    documentCount: toNumberValue(item.documentCount, 0),
    chunkCount: toNumberValue(item.chunkCount, 0),
    topK: toNumberValue(item.topK, 0),
    chunkSize: toNumberValue(item.chunkSize, 0),
    similarityThreshold: toNumberValue(item.similarityThreshold, 0),
    status: toStatus(item.status),
    updatedAt: toStringValue(item.updatedAt, "--"),
  };
}

export function normalizeRagItems(input: unknown): RagListItem[] {
  const list = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray(input.data)
      ? input.data
      : [];

  return list.map(normalizeRagItem);
}

export function getKnowledgeBaseStats(items: RagListItem[]) {
  return {
    total: items.length,
    active: items.filter((item) => item.status === "active").length,
    disabled: items.filter((item) => item.status === "disabled").length,
  };
}

export function filterAndSortRagItems(params: {
  items: RagListItem[];
  keyword: string;
  statusFilter: StatusFilter;
  sortField: SortField;
  sortDirection: SortDirection;
}) {
  const keyword = params.keyword.trim().toLowerCase();

  const filtered = params.items
    .filter((item) => {
      if (!keyword) return true;

      return (
        item.name.toLowerCase().includes(keyword) ||
        item.description.toLowerCase().includes(keyword)
      );
    })
    .filter((item) => {
      if (!params.statusFilter || params.statusFilter === "all") return true;
      return item.status === params.statusFilter;
    });

  return [...filtered].sort((left, right) => {
    const factor = params.sortDirection === "desc" ? -1 : 1;

    if (params.sortField === "documentCount") {
      return (left.documentCount - right.documentCount) * factor;
    }

    return (
      (new Date(left.updatedAt).getTime() -
        new Date(right.updatedAt).getTime()) *
      factor
    );
  });
}

export function validateKnowledgeBaseForm(params: {
  values: KnowledgeBaseFormValues;
  items: RagListItem[];
  editingId?: string | null;
}) {
  const name = params.values.name.trim();

  if (!name) return "知识库名称不能为空";
  if (!Number.isInteger(params.values.topK) || params.values.topK <= 0) {
    return "TopK 必须为正整数";
  }
  if (
    !Number.isInteger(params.values.chunkSize) ||
    params.values.chunkSize <= 0
  ) {
    return "分片大小必须为正整数";
  }
  if (
    params.values.similarityThreshold < 0 ||
    params.values.similarityThreshold > 1
  ) {
    return "相似度阈值必须在 0 到 1 之间";
  }

  const duplicated = params.items.some(
    (item) => item.id !== params.editingId && item.name.trim() === name
  );

  if (duplicated) return "知识库名称不能重复";

  return null;
}
