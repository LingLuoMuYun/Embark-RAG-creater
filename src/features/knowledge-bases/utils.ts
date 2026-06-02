import type {
  KnowledgeBaseFormValues,
  RagIconName,
  RagChunk,
  RagDoc,
  RagListItem,
  RagStatus,
  SortDirection,
  SortField,
  StatusFilter,
} from "./types";

// 判断接口返回值是否可按普通对象读取字段。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// 从未知值中提取非空字符串，失败时使用兜底值。
function toStringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

// 从未知值中提取有限数字，失败时使用兜底值。
function toNumberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// 将接口状态值规整为前端支持的知识库状态。
function toStatus(value: unknown): RagStatus {
  return value === "active" || value === "disabled" ? value : "disabled";
}

// RAG 知识库可选图标及其展示文案、颜色样式。
export const RAG_ICON_OPTIONS = [
  { value: "Database", label: "数据库", className: "text-blue-600 bg-blue-50" },
  {
    value: "BookOpen",
    label: "知识",
    className: "text-emerald-600 bg-emerald-50",
  },
  { value: "FileText", label: "文档", className: "text-cyan-600 bg-cyan-50" },
  { value: "Folder", label: "文件夹", className: "text-yellow-600 bg-yellow-50" },
  { value: "Archive", label: "归档", className: "text-orange-600 bg-orange-50" },
  { value: "Brain", label: "智能", className: "text-purple-600 bg-purple-50" },
  { value: "Bot", label: "Agent", className: "text-indigo-600 bg-indigo-50" },
  {
    value: "GraduationCap",
    label: "学习",
    className: "text-pink-600 bg-pink-50",
  },
  {
    value: "BriefcaseBusiness",
    label: "业务",
    className: "text-slate-600 bg-slate-50",
  },
  { value: "Lightbulb", label: "经验", className: "text-amber-600 bg-amber-50" },
] as const satisfies readonly {
  value: RagIconName;
  label: string;
  className: string;
}[];

export function isRagIconName(value: unknown): value is RagIconName {
  return RAG_ICON_OPTIONS.some((option) => option.value === value);
}

// 将未知图标值归一化为合法图标名。
export function normalizeRagIcon(value: unknown): RagIconName {
  return isRagIconName(value) ? value : "Database";
}

// 获取图标配置，非法图标值会回退到默认配置。
export function getRagIconOption(icon: unknown) {
  const normalized = normalizeRagIcon(icon);

  return (
    RAG_ICON_OPTIONS.find((option) => option.value === normalized) ??
    RAG_ICON_OPTIONS[0]
  );
}

// 生成前端临时 ID，用于兜底数据和本地模拟数据。
export function createClientId() {
  return `kb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 将接口或模拟数据归一化为知识库列表项。
export function normalizeRagItem(input: unknown): RagListItem {
  const item = isRecord(input) ? input : {};

  return {
    id: toStringValue(item.id, createClientId()),
    name: toStringValue(item.name, "未命名知识库"),
    description: toStringValue(item.description, "暂无描述"),
    icon: normalizeRagIcon(item.icon),
    documentCount: toNumberValue(item.documentCount, 0),
    chunkCount: toNumberValue(item.chunkCount, 0),
    topK: toNumberValue(item.topK, 0),
    similarityThreshold: toNumberValue(item.similarityThreshold, 0),
    status: toStatus(item.status),
    updatedAt: toStringValue(item.updatedAt, "--"),
  };
}

// 将未知列表响应归一化为知识库列表。
export function normalizeRagItems(input: unknown): RagListItem[] {
  const list = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray(input.data)
      ? input.data
      : [];

  return list.map(normalizeRagItem);
}

// 统计知识库总数、启用数和禁用数。
export function getKnowledgeBaseStats(items: RagListItem[]) {
  return {
    total: items.length,
    active: items.filter((item) => item.status === "active").length,
    disabled: items.filter((item) => item.status === "disabled").length,
  };
}

// 按关键词、状态筛选知识库，并按指定字段和方向排序。
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

// 校验知识库创建和编辑表单，返回首个错误信息。
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

// 单个上传文件大小上限：20MB。
export const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;

// 前端允许上传的文件扩展名。
export const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".markdown",
];

// 前端允许上传的 MIME 类型，空 MIME 时会以扩展名兜底。
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

// 获取文件扩展名，用于上传格式校验。
function getFileExtension(fileName: string) {
  const index = fileName.lastIndexOf(".");

  return index >= 0 ? fileName.slice(index).toLowerCase() : "";
}

// 将字节数格式化为适合界面展示的文件大小。
export function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

// 校验上传文件数量、格式、大小和当前知识库内的文件名重复。
export function validateUploadFile(params: {
  files: FileList | File[];
  selectedDocs: RagDoc[];
}) {
  const files = Array.from(params.files);

  if (files.length === 0) return "请选择要上传的文件";
  if (files.length > 1) return "当前仅支持一次上传 1 个文件";

  const file = files[0];
  const extension = getFileExtension(file.name);
  const validExtension = ALLOWED_EXTENSIONS.includes(extension);
  const validMime =
    !file.type || ALLOWED_MIME_TYPES.includes(file.type) || validExtension;

  if (!validExtension || !validMime) {
    return "仅支持 PDF、DOCX、TXT、Markdown 文件";
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return "文件大小不能超过 20MB";
  }

  const duplicated = params.selectedDocs.some((doc) => doc.name === file.name);

  if (duplicated) {
    return "当前知识库已存在同名文档";
  }

  return null;
}

// 根据上传文件生成本地模拟文档数据。
export function createMockDocumentFromFile(file: File): RagDoc {
  return {
    id: createClientId(),
    name: file.name,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
}

// 为模拟文档生成本地知识分片数据。
export function createMockChunksForDocument(doc: RagDoc): RagChunk[] {
  const count = 2 + Math.floor(Math.random() * 2);

  return Array.from({ length: count }, (_, index) => {
    const content = `这是从 ${doc.name} 生成的模拟知识分片 ${index + 1}。`;

    return {
      id: createClientId(),
      documentId: doc.id,
      content,
      charCount: content.length,
      tokenCount: Math.ceil(content.length / 2),
      createdAt: new Date().toISOString(),
    };
  });
}

// 汇总所有文档下的分片总数。
export function getTotalChunkCount(
  chunksByDocumentId: Record<string, RagChunk[]>
) {
  return Object.values(chunksByDocumentId).reduce(
    (sum, chunks) => sum + chunks.length,
    0
  );
}

// 将接口或模拟数据归一化为知识文档。
export function normalizeRagDoc(input: unknown): RagDoc {
  const item = isRecord(input) ? input : {};

  return {
    id: typeof item.id === "string" ? item.id : createClientId(),
    name:
      typeof item.name === "string" && item.name.trim()
        ? item.name
        : "未命名文档",
    size: toNumberValue(item.size, 0),
    uploadedAt:
      typeof item.uploadedAt === "string" && item.uploadedAt.trim()
        ? item.uploadedAt
        : "--",
    sourceType:
      typeof item.sourceType === "string" ? item.sourceType : undefined,
    fileType:
      typeof item.fileType === "string" ? item.fileType : undefined,
    rawContent:
      typeof item.rawContent === "string" ? item.rawContent : undefined,
    status:
      typeof item.status === "string" ? item.status : undefined,
    chunks: Array.isArray(item.chunks)
      ? item.chunks.map(normalizeRagChunk)
      : undefined,
  };
}

// 将接口或模拟数据归一化为知识分片。
export function normalizeRagChunk(input: unknown): RagChunk {
  const item = isRecord(input) ? input : {};
  const content =
    typeof item.content === "string" && item.content.trim()
      ? item.content
      : "暂无内容";

  return {
    id: typeof item.id === "string" ? item.id : createClientId(),
    documentId: typeof item.documentId === "string" ? item.documentId : "",
    content,
    charCount: toNumberValue(item.charCount, content.length),
    tokenCount:
      typeof item.tokenCount === "number" && Number.isFinite(item.tokenCount)
        ? item.tokenCount
        : undefined,
    createdAt:
      typeof item.createdAt === "string" && item.createdAt.trim()
        ? item.createdAt
        : "--",
    chunkType:
      typeof item.chunkType === "string" ? item.chunkType : undefined,
    title:
      typeof item.title === "string" ? item.title : undefined,
    suggestedCategory:
      typeof item.suggestedCategory === "string" ? item.suggestedCategory : undefined,
    suggestedTags:
      typeof item.suggestedTags === "string" ? item.suggestedTags : undefined,
    knowledgeType:
      typeof item.knowledgeType === "string" ? item.knowledgeType : undefined,
    reviewStatus:
      typeof item.reviewStatus === "string" ? item.reviewStatus : undefined,
  };
}
