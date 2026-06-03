"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Search as SearchIcon,
  Database,
  BookOpen,
  FileText,
  Folder,
  Archive,
  Brain,
  Bot,
  GraduationCap,
  BriefcaseBusiness,
  Lightbulb,
  ChevronDown,
  ChevronRight,
  File,
  Tag,
  Hash,
  Clock,
  AlertCircle,
} from "lucide-react";
import { KnowledgeSearchBox, SearchHighlight } from "@/features/knowledge";
import {
  getDefaultKnowledgeBaseDetailFilter,
  isDefaultKnowledgeBaseDetailFilter,
  KnowledgeBaseDetailFilterBar,
  type KnowledgeBaseDetailFilterValue,
} from "@/features/knowledge-bases/components/knowledge-base-detail-filter-bar";

// ===== 类型 =====

interface ChunkItem {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  status: string;
  startIndex: number;
  endIndex: number;
  chunkType?: string;
  title?: string | null;
  suggestedCategory?: string | null;
  suggestedTags?: string | null;
  knowledgeType?: string | null;
  reviewStatus?: string | null;
  createdAt?: string;
}

interface DocItem {
  id: string;
  title: string;
  name: string;
  sourceType: string;
  fileName: string | null;
  fileSize: number;
  size: number;
  rawContent: string | null;
  status: string;
  uploadedAt: string;
  chunks: ChunkItem[];
}

interface KBDetail {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  similarityThreshold: number;
  topK: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  documents: DocItem[];
}

type SearchMatchedField =
  | "documentTitle"
  | "fileName"
  | "chunkTitle"
  | "chunkContent";

interface KnowledgeKeywordSearchResult {
  id: string;
  type: "document" | "chunk";
  title: string;
  snippet: string;
  score: number;
  matchedField: SearchMatchedField;
  documentId: string;
  documentTitle: string;
  chunkId?: string;
  chunkIndex?: number;
  chunkType?: string;
  reviewStatus?: string | null;
  updatedAt: string;
}

// ===== 工具函数 =====

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Database,
  BookOpen,
  FileText,
  Folder,
  Archive,
  Brain,
  Bot,
  GraduationCap,
  BriefcaseBusiness,
  Lightbulb,
};

const ICON_COLORS: Record<string, string> = {
  blue: "text-blue-600 bg-blue-50",
  emerald: "text-emerald-600 bg-emerald-50",
  cyan: "text-cyan-600 bg-cyan-50",
  yellow: "text-yellow-600 bg-yellow-50",
  orange: "text-orange-600 bg-orange-50",
  purple: "text-purple-600 bg-purple-50",
  indigo: "text-indigo-600 bg-indigo-50",
  pink: "text-pink-600 bg-pink-50",
  slate: "text-slate-600 bg-slate-50",
  amber: "text-amber-600 bg-amber-50",
  gray: "text-gray-600 bg-gray-50",
};

const TYPE_LABELS: Record<string, string> = {
  faq: "问答",
  concept: "概念",
  procedure: "步骤",
  note: "注意",
  summary: "总结",
};

const TYPE_COLORS: Record<string, string> = {
  faq: "bg-amber-100 text-amber-700",
  concept: "bg-blue-100 text-blue-700",
  procedure: "bg-green-100 text-green-700",
  note: "bg-orange-100 text-orange-700",
  summary: "bg-purple-100 text-purple-700",
};

const MATCHED_FIELD_LABELS: Record<SearchMatchedField, string> = {
  documentTitle: "文档标题",
  fileName: "文件名",
  chunkTitle: "知识标题",
  chunkContent: "正文内容",
};

function formatFileSize(size: number) {
  if (!size || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function chunkMatchesFilter(
  chunk: ChunkItem,
  filter: KnowledgeBaseDetailFilterValue
) {
  const isKnowledge = chunk.chunkType === "knowledge";

  if (filter.chunkType === "text" && isKnowledge) return false;
  if (filter.chunkType === "knowledge" && !isKnowledge) return false;
  if (
    filter.reviewStatus !== "all" &&
    chunk.reviewStatus !== filter.reviewStatus
  ) {
    return false;
  }
  if (
    filter.suggestedCategory !== "all" &&
    chunk.suggestedCategory !== filter.suggestedCategory
  ) {
    return false;
  }
  if (
    filter.suggestedTag !== "all" &&
    !parseTags(chunk.suggestedTags).includes(filter.suggestedTag)
  ) {
    return false;
  }

  return true;
}

function getFilterOptions(documents: DocItem[]) {
  const categories = new Set<string>();
  const tags = new Set<string>();

  for (const document of documents) {
    for (const chunk of document.chunks) {
      if (chunk.suggestedCategory) {
        categories.add(chunk.suggestedCategory);
      }
      for (const tag of parseTags(chunk.suggestedTags)) {
        tags.add(tag);
      }
    }
  }

  return {
    categories: Array.from(categories).sort((a, b) => a.localeCompare(b)),
    tags: Array.from(tags).sort((a, b) => a.localeCompare(b)),
  };
}

function getFilteredDocuments(
  documents: DocItem[],
  filter: KnowledgeBaseDetailFilterValue
) {
  return documents.flatMap((document) => {
    const chunks = document.chunks.filter((chunk) =>
      chunkMatchesFilter(chunk, filter)
    );

    if (chunks.length === 0) return [];
    return {
      ...document,
      chunks,
    };
  });
}

function FilterEmptyIcon() {
  return (
    <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
      <Hash className="h-4 w-4 text-gray-400" />
    </div>
  );
}

export default function KnowledgeBaseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const kbId = params.id as string;

  const [kb, setKb] = useState<KBDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [searchKeyword, setSearchKeyword] = useState("");
  const [submittedSearchKeyword, setSubmittedSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<
    KnowledgeKeywordSearchResult[]
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [highlightedChunkId, setHighlightedChunkId] = useState<string | null>(
    null
  );
  const [detailFilter, setDetailFilter] =
    useState<KnowledgeBaseDetailFilterValue>(
      getDefaultKnowledgeBaseDetailFilter()
    );

  useEffect(() => {
    if (!kbId) return;
    setLoading(true);
    setError("");
    setSearchKeyword("");
    setSubmittedSearchKeyword("");
    setSearchResults([]);
    setSearchError("");
    setHighlightedChunkId(null);
    setDetailFilter(getDefaultKnowledgeBaseDetailFilter());
    fetch(`/api/rag-management/knowledge-bases/${kbId}/tree`)
      .then((res) => res.json())
      .then((json) => {
        // 兼容 { success, data } 和直接对象
        const data = json?.data ?? json;
        if (data && typeof data === "object" && data.id) {
          setKb(data as KBDetail);
        } else {
          setError("知识库不存在或加载失败");
        }
      })
      .catch(() => setError("加载失败，请检查网络"))
      .finally(() => setLoading(false));
  }, [kbId]);

  const filterOptions = useMemo(
    () => getFilterOptions(kb?.documents ?? []),
    [kb]
  );

  const filteredDocuments = useMemo(
    () => getFilteredDocuments(kb?.documents ?? [], detailFilter),
    [detailFilter, kb]
  );

  const hasActiveDetailFilter =
    !isDefaultKnowledgeBaseDetailFilter(detailFilter);
  const filteredChunkCount = filteredDocuments.reduce(
    (sum, document) => sum + document.chunks.length,
    0
  );

  const toggleDoc = (docId: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const expandAll = () => {
    if (!kb) return;
    setExpandedDocs(new Set(filteredDocuments.map((d) => d.id)));
  };

  const collapseAll = () => {
    setExpandedDocs(new Set());
  };

  const runKeywordSearch = async (keyword: string) => {
    const trimmedKeyword = keyword.trim();
    setSearchKeyword(keyword);
    setHighlightedChunkId(null);

    if (!trimmedKeyword) {
      clearKeywordSearch();
      return;
    }

    setSubmittedSearchKeyword(trimmedKeyword);
    setSearchLoading(true);
    setSearchError("");

    try {
      const params = new URLSearchParams({
        keyword: trimmedKeyword,
        limit: "10",
      });
      const response = await fetch(
        `/api/rag-management/knowledge-bases/${kbId}/search?${params}`
      );
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.message ?? "搜索失败");
      }

      setSearchResults(json.data.results ?? []);
    } catch (error) {
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : "搜索失败");
    } finally {
      setSearchLoading(false);
    }
  };

  const clearKeywordSearch = () => {
    setSearchKeyword("");
    setSubmittedSearchKeyword("");
    setSearchResults([]);
    setSearchError("");
    setHighlightedChunkId(null);
  };

  const isSearchResultVisible = (result: KnowledgeKeywordSearchResult) => {
    if (!kb || isDefaultKnowledgeBaseDetailFilter(detailFilter)) return true;

    const document = kb.documents.find((item) => item.id === result.documentId);
    if (!document) return false;

    if (result.type === "document") {
      return document.chunks.some((chunk) =>
        chunkMatchesFilter(chunk, detailFilter)
      );
    }

    const chunk = document.chunks.find((item) => item.id === result.chunkId);
    return chunk ? chunkMatchesFilter(chunk, detailFilter) : false;
  };

  const handleSearchResultClick = (result: KnowledgeKeywordSearchResult) => {
    if (!isSearchResultVisible(result)) {
      setDetailFilter(getDefaultKnowledgeBaseDetailFilter());
    }

    setExpandedDocs((prev) => {
      const next = new Set(prev);
      next.add(result.documentId);
      return next;
    });

    if (result.type === "chunk" && result.chunkId) {
      setHighlightedChunkId(result.chunkId);
      scrollToElement(`chunk-${result.chunkId}`);
      return;
    }

    setHighlightedChunkId(null);
    scrollToElement(`document-${result.documentId}`);
  };

  const scrollToElement = (id: string) => {
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  };

  // ===== 渲染 =====

  const KBIcon = ICON_MAP[kb?.icon ?? ""] ?? Database;
  const iconColorClass = ICON_COLORS[kb?.color ?? ""] ?? ICON_COLORS.blue;

  const totalChunks = kb
    ? kb.documents.reduce((sum, d) => sum + d.chunks.length, 0)
    : 0;
  const knowledgeChunks = kb
    ? kb.documents.reduce(
        (sum, d) =>
          sum +
          d.chunks.filter((c) => c.chunkType === "knowledge").length,
        0
      )
    : 0;
  const textChunks = totalChunks - knowledgeChunks;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* 顶部导航 */}
        <button
          onClick={() => router.push("/knowledge-bases")}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          返回知识库列表
        </button>

        {/* 加载状态 */}
        {loading && (
          <div className="text-center py-16 text-gray-400">
            <div className="h-8 w-8 mx-auto mb-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            加载中...
          </div>
        )}

        {/* 错误状态 */}
        {error && !loading && (
          <div className="text-center py-16">
            <AlertCircle className="h-8 w-8 mx-auto mb-3 text-red-400" />
            <p className="text-gray-500">{error}</p>
            <button
              onClick={() => router.push("/knowledge-bases")}
              className="mt-3 text-sm text-blue-600 hover:text-blue-700"
            >
              返回知识库列表
            </button>
          </div>
        )}

        {/* 主体内容 */}
        {kb && !loading && (
          <>
            {/* KB 信息头 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-start gap-4">
                <div
                  className={`flex items-center justify-center h-14 w-14 rounded-xl ${iconColorClass}`}
                >
                  <KBIcon className="h-7 w-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-xl font-bold text-gray-900">
                      {kb.name}
                    </h1>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                        kb.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {kb.status === "active" ? "启用" : "禁用"}
                    </span>
                  </div>
                  {kb.description && (
                    <p className="text-gray-500 text-sm mt-1">{kb.description}</p>
                  )}
                  <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      {kb.documents.length} 个文档
                    </span>
                    <span className="flex items-center gap-1">
                      <Hash className="h-3.5 w-3.5" />
                      {totalChunks} 个分片
                    </span>
                    <span className="flex items-center gap-1 text-blue-500">
                      <Brain className="h-3.5 w-3.5" />
                      {knowledgeChunks} 条知识
                    </span>
                    <span className="flex items-center gap-1">
                      <File className="h-3.5 w-3.5" />
                      {textChunks} 个文本段
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      更新于 {new Date(kb.updatedAt).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-2 text-xs text-gray-400">
                    <span>TopK: {kb.topK}</span>
                    <span>|</span>
                    <span>相似度阈值: {kb.similarityThreshold}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 文档列表 */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">
                  知识文档 ({kb.documents.length})
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={expandAll}
                    className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50"
                  >
                    全部展开
                  </button>
                  <button
                    onClick={collapseAll}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                  >
                    全部折叠
                  </button>
                </div>
              </div>

              <div className="px-6 py-4 border-b border-gray-100">
                <KnowledgeSearchBox
                  value={searchKeyword}
                  placeholder="搜索当前知识库内的文档标题、文件名或正文关键词"
                  loading={searchLoading}
                  onChange={setSearchKeyword}
                  onSearch={runKeywordSearch}
                  onClear={clearKeywordSearch}
                />

                {(submittedSearchKeyword || searchLoading || searchError) && (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <SearchIcon className="h-3.5 w-3.5" />
                        <span>
                          {searchLoading
                            ? "搜索中..."
                            : `搜索结果：${searchResults.length} 条`}
                        </span>
                      </div>
                      {submittedSearchKeyword && (
                        <span className="max-w-[240px] truncate text-xs text-gray-400">
                          “{submittedSearchKeyword}”
                        </span>
                      )}
                    </div>

                    {searchError ? (
                      <div className="px-3 py-4 text-sm text-red-600">
                        {searchError}
                      </div>
                    ) : searchLoading ? (
                      <div className="px-3 py-4 text-sm text-gray-400">
                        正在检索当前知识库...
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-gray-400">
                        没有找到匹配的文档或知识分片
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto p-2">
                        {searchResults.map((result) => {
                          const isKnowledgeResult =
                            result.chunkType === "knowledge";
                          const resultTypeLabel =
                            result.type === "document"
                              ? "文档"
                              : isKnowledgeResult
                                ? "AI 知识"
                                : "文本分片";

                          return (
                            <button
                              key={result.id}
                              type="button"
                              onClick={() => handleSearchResultClick(result)}
                              className="w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-white hover:shadow-sm"
                            >
                              <div className="mb-1 flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                                    isKnowledgeResult
                                      ? "bg-blue-100 text-blue-700"
                                      : result.type === "document"
                                        ? "bg-gray-100 text-gray-700"
                                        : "bg-emerald-100 text-emerald-700"
                                  }`}
                                >
                                  {resultTypeLabel}
                                </span>
                                <span className="truncate text-sm font-medium text-gray-900">
                                  <SearchHighlight
                                    text={result.title}
                                    keyword={submittedSearchKeyword}
                                  />
                                </span>
                              </div>
                              <p className="line-clamp-2 text-xs leading-relaxed text-gray-500">
                                <SearchHighlight
                                  text={result.snippet}
                                  keyword={submittedSearchKeyword}
                                />
                              </p>
                              <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-400">
                                <span>
                                  命中：
                                  {MATCHED_FIELD_LABELS[result.matchedField]}
                                </span>
                                {result.type === "chunk" &&
                                  result.chunkIndex !== undefined && (
                                    <span>#{result.chunkIndex + 1}</span>
                                  )}
                                <span className="truncate">
                                  {result.documentTitle}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-3">
                  <KnowledgeBaseDetailFilterBar
                    value={detailFilter}
                    categories={filterOptions.categories}
                    tags={filterOptions.tags}
                    onChange={setDetailFilter}
                    onReset={() => setHighlightedChunkId(null)}
                  />
                </div>

                {hasActiveDetailFilter && (
                  <div className="mt-2 text-xs text-gray-400">
                    筛选后 {filteredDocuments.length} 篇文档 /{" "}
                    {filteredChunkCount} 个分片
                  </div>
                )}
              </div>

              {kb.documents.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">暂无文档</p>
                  <p className="text-xs mt-1">
                    通过文档管理上传并提炼知识，审核确认后选择本知识库入库
                  </p>
                </div>
              ) : filteredDocuments.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <FilterEmptyIcon />
                  <p className="text-sm">没有符合筛选条件的知识片段</p>
                  <p className="text-xs mt-1">
                    可以重置筛选条件，或调整内容类型、状态、分类和标签
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredDocuments.map((doc) => {
                    const isExpanded = expandedDocs.has(doc.id);
                    const docKnowledgeCount = doc.chunks.filter(
                      (c) => c.chunkType === "knowledge"
                    ).length;
                    const docTextCount = doc.chunks.filter(
                      (c) => c.chunkType !== "knowledge"
                    ).length;

                    return (
                      <div key={doc.id} id={`document-${doc.id}`}>
                        {/* 文档卡片头部 */}
                        <button
                          onClick={() => toggleDoc(doc.id)}
                          className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
                        >
                          <span className="text-gray-400">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </span>
                          <FileText className="h-5 w-5 text-gray-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 text-sm truncate">
                                {doc.fileName || doc.title || doc.name}
                              </span>
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 text-xs rounded ${
                                  doc.status === "parsed"
                                    ? "bg-green-100 text-green-600"
                                    : doc.status === "parsing"
                                      ? "bg-yellow-100 text-yellow-600"
                                      : doc.status === "failed"
                                        ? "bg-red-100 text-red-600"
                                        : "bg-gray-100 text-gray-500"
                                }`}
                              >
                                {doc.status}
                              </span>
                            </div>
                            <div className="flex gap-3 mt-0.5 text-xs text-gray-400">
                              <span>{formatFileSize(doc.fileSize)}</span>
                              <span>{doc.sourceType === "file" ? "文件导入" : doc.sourceType}</span>
                              {docKnowledgeCount > 0 && (
                                <span className="text-blue-500">
                                  {docKnowledgeCount} 条知识
                                </span>
                              )}
                              <span>{doc.chunks.length} 个分片</span>
                            </div>
                          </div>
                        </button>

                        {/* 展开的 chunks 列表 */}
                        {isExpanded && (
                          <div className="bg-gray-50 border-t border-gray-100 px-6 py-4">
                            {/* 原始内容预览 */}
                            {doc.rawContent && (
                              <details className="mb-4 group">
                                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-500 select-none">
                                  查看原始文本 ({doc.rawContent.length} 字)
                                </summary>
                                <pre className="mt-2 p-3 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto">
                                  {doc.rawContent.slice(0, 2000)}
                                  {doc.rawContent.length > 2000 && (
                                    <span className="text-gray-400">
                                      ...（仅显示前 2000 字）
                                    </span>
                                  )}
                                </pre>
                              </details>
                            )}

                            {/* Chunks */}
                            <div className="space-y-2">
                              <p className="text-xs text-gray-400 mb-2">
                                分片列表（{doc.chunks.length}）
                              </p>
                              {doc.chunks.map((chunk) => {
                                const isKnowledge =
                                  chunk.chunkType === "knowledge";
                                const tags = isKnowledge
                                  ? parseTags(chunk.suggestedTags)
                                  : [];

                                return (
                                  <div
                                    key={chunk.id}
                                    id={`chunk-${chunk.id}`}
                                    className={`p-3 rounded-lg border text-sm ${
                                      highlightedChunkId === chunk.id
                                        ? "bg-blue-50 border-blue-300 ring-2 ring-blue-200"
                                        : isKnowledge
                                        ? "bg-blue-50/50 border-blue-100"
                                        : "bg-white border-gray-200"
                                    }`}
                                  >
                                    {/* Chunk 头部元数据 */}
                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                      <span className="text-xs text-gray-400">
                                        #{chunk.chunkIndex + 1}
                                      </span>
                                      {isKnowledge ? (
                                        <>
                                          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
                                            <Brain className="h-3 w-3" />
                                            知识
                                          </span>
                                          {chunk.knowledgeType && (
                                            <span
                                              className={`inline-flex items-center px-1.5 py-0.5 text-xs rounded-full ${
                                                TYPE_COLORS[
                                                  chunk.knowledgeType
                                                ] ?? "bg-gray-100 text-gray-600"
                                              }`}
                                            >
                                              {TYPE_LABELS[
                                                chunk.knowledgeType
                                              ] ?? chunk.knowledgeType}
                                            </span>
                                          )}
                                          {chunk.reviewStatus && (
                                            <span
                                              className={`text-xs px-1.5 py-0.5 rounded-full ${
                                                chunk.reviewStatus === "confirmed"
                                                  ? "bg-green-100 text-green-600"
                                                  : chunk.reviewStatus === "pending"
                                                    ? "bg-yellow-100 text-yellow-600"
                                                    : "bg-red-100 text-red-600"
                                              }`}
                                            >
                                              {chunk.reviewStatus === "confirmed"
                                                ? "已确认"
                                                : chunk.reviewStatus === "pending"
                                                  ? "待审核"
                                                  : chunk.reviewStatus === "rejected"
                                                    ? "已驳回"
                                                    : chunk.reviewStatus}
                                            </span>
                                          )}
                                        </>
                                      ) : (
                                        <span className="text-xs text-gray-400">
                                          文本段
                                        </span>
                                      )}
                                      <span className="text-xs text-gray-300">
                                        {chunk.endIndex - chunk.startIndex} 字符
                                      </span>
                                    </div>

                                    {/* Chunk 标题 */}
                                    {chunk.title && (
                                      <h4 className="font-medium text-gray-800 text-sm mb-1">
                                        {chunk.title}
                                      </h4>
                                    )}

                                    {/* Chunk 内容 */}
                                    <p className="text-gray-600 leading-relaxed text-sm whitespace-pre-wrap">
                                      {chunk.content}
                                    </p>

                                    {/* 知识元数据 */}
                                    {isKnowledge && (
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {chunk.suggestedCategory && (
                                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                            <Folder className="h-3 w-3" />
                                            {chunk.suggestedCategory}
                                          </span>
                                        )}
                                        {tags.length > 0 && (
                                          <div className="flex flex-wrap gap-1">
                                            <Tag className="h-3 w-3 text-gray-400 mt-0.5" />
                                            {tags.map((tag) => (
                                              <span
                                                key={tag}
                                                className="inline-flex items-center px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                                              >
                                                {tag}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {doc.chunks.length === 0 && (
                                <p className="text-xs text-gray-400 text-center py-4">
                                  暂无分片数据
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
