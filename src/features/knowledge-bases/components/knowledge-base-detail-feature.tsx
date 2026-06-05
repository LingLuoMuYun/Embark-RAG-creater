"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  FolderOpen,
  Search as SearchIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KnowledgeSearchBox, SearchHighlight } from "@/features/knowledge";
import {
  bindKnowledgeBaseDocuments,
  fetchDocumentChunks,
  fetchKnowledgeSourceDocuments,
  fetchRagDetail,
  unbindKnowledgeBaseDocuments,
} from "@/features/knowledge-bases/api";
import type { RagChunk, RagDoc } from "@/features/knowledge-bases/types";
import {
  normalizeRagChunk,
  normalizeRagDoc,
} from "@/features/knowledge-bases/utils";

import { DocumentAssignmentPanel } from "./document-assignment-panel";
import { DocumentChunksDialog } from "./document-chunks-dialog";
import { KnowledgeItemsPanel } from "./knowledge-items-panel";
import {
  getDefaultKnowledgeBaseDetailFilter,
  isDefaultKnowledgeBaseDetailFilter,
  KnowledgeBaseDetailFilterBar,
  type KnowledgeBaseDetailFilterValue,
} from "./knowledge-base-detail-filter-bar";

type DetailRecord = {
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
  documents?: unknown[];
};

type SearchMatchedField =
  | "documentTitle"
  | "fileName"
  | "chunkTitle"
  | "chunkContent";

type KnowledgeKeywordSearchResult = {
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
};

const MATCHED_FIELD_LABELS: Record<SearchMatchedField, string> = {
  documentTitle: "文档标题",
  fileName: "文件名",
  chunkTitle: "知识标题",
  chunkContent: "正文内容",
};

function isDetailRecord(value: unknown): value is DetailRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value
  );
}

function difference(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((id) => !rightSet.has(id));
}

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;

  const leftSet = new Set(left);
  return right.every((id) => leftSet.has(id));
}

function formatDate(value?: string) {
  if (!value) return "--";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function chunkMatchesFilter(
  chunk: RagChunk,
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

function getFilterOptions(documents: RagDoc[]) {
  const categories = new Set<string>();
  const tags = new Set<string>();

  for (const document of documents) {
    for (const chunk of document.chunks ?? []) {
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
  documents: RagDoc[],
  filter: KnowledgeBaseDetailFilterValue
) {
  if (isDefaultKnowledgeBaseDetailFilter(filter)) return documents;

  return documents.flatMap((document) => {
    const chunks = (document.chunks ?? []).filter((chunk) =>
      chunkMatchesFilter(chunk, filter)
    );

    if (chunks.length === 0) return [];
    return {
      ...document,
      chunks,
    };
  });
}

function getSearchErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "搜索失败";
  if (
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  if ("message" in payload && typeof payload.message === "string") {
    return payload.message;
  }
  return "搜索失败";
}

export function KnowledgeBaseDetailFeature() {
  const router = useRouter();
  const params = useParams();
  const knowledgeBaseId = String(params.id ?? "");

  const [detail, setDetail] = React.useState<DetailRecord | null>(null);
  const [selectedDocuments, setSelectedDocuments] = React.useState<RagDoc[]>([]);
  const [availableDocuments, setAvailableDocuments] = React.useState<RagDoc[]>(
    []
  );
  const [initialSelectedDocumentIds, setInitialSelectedDocumentIds] =
    React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [removingItem, setRemovingItem] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<"knowledge-items" | "documents">("knowledge-items");

  const [searchKeyword, setSearchKeyword] = React.useState("");
  const [submittedSearchKeyword, setSubmittedSearchKeyword] =
    React.useState("");
  const [searchResults, setSearchResults] = React.useState<
    KnowledgeKeywordSearchResult[]
  >([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");
  const [highlightedChunkId, setHighlightedChunkId] = React.useState<
    string | null
  >(null);
  const [chunkDialogOpen, setChunkDialogOpen] = React.useState(false);
  const [chunkDialogDocument, setChunkDialogDocument] =
    React.useState<RagDoc | null>(null);
  const [chunkDialogChunks, setChunkDialogChunks] = React.useState<RagChunk[]>(
    []
  );
  const [chunkDialogLoading, setChunkDialogLoading] = React.useState(false);
  const [chunkDialogError, setChunkDialogError] = React.useState<string | null>(
    null
  );
  const [detailFilter, setDetailFilter] =
    React.useState<KnowledgeBaseDetailFilterValue>(
      getDefaultKnowledgeBaseDetailFilter()
    );

  const selectedIds = React.useMemo(
    () => selectedDocuments.map((document) => document.id),
    [selectedDocuments]
  );
  const dirty = React.useMemo(
    () => !sameIds(selectedIds, initialSelectedDocumentIds),
    [initialSelectedDocumentIds, selectedIds]
  );
  const filterOptions = React.useMemo(
    () => getFilterOptions(selectedDocuments),
    [selectedDocuments]
  );
  const filteredSelectedDocuments = React.useMemo(
    () => getFilteredDocuments(selectedDocuments, detailFilter),
    [detailFilter, selectedDocuments]
  );
  const hasActiveDetailFilter =
    !isDefaultKnowledgeBaseDetailFilter(detailFilter);
  const filteredChunkCount = filteredSelectedDocuments.reduce(
    (sum, document) => sum + (document.chunks?.length ?? 0),
    0
  );
  const highlightedCategory =
    detailFilter.suggestedCategory === "all"
      ? undefined
      : detailFilter.suggestedCategory;
  const highlightedTag =
    detailFilter.suggestedTag === "all" ? undefined : detailFilter.suggestedTag;

  const loadData = React.useCallback(async () => {
    if (!knowledgeBaseId) return;

    setLoading(true);
    setError(null);

    try {
      const [detailInput, sourceInput] = await Promise.all([
        fetchRagDetail(knowledgeBaseId),
        fetchKnowledgeSourceDocuments(),
      ]);

      if (!isDetailRecord(detailInput)) {
        throw new Error("知识库详情数据格式异常");
      }

      const selected = Array.isArray(detailInput.documents)
        ? detailInput.documents.map(normalizeRagDoc)
        : [];
      const selectedIdSet = new Set(selected.map((document) => document.id));
      const sourceDocuments = Array.isArray(sourceInput)
        ? sourceInput.map(normalizeRagDoc)
        : [];
      const available = sourceDocuments.filter(
        (document) =>
          document.status === "parsed" &&
          document.activeStatus === "active" &&
          !selectedIdSet.has(document.id)
      );

      setDetail(detailInput);
      setSelectedDocuments(selected);
      setAvailableDocuments(available);
      setInitialSelectedDocumentIds(selected.map((document) => document.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "知识库详情加载失败");
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId]);

  React.useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      setSearchKeyword("");
      setSubmittedSearchKeyword("");
      setSearchResults([]);
      setSearchError("");
      setHighlightedChunkId(null);
      setDetailFilter(getDefaultKnowledgeBaseDetailFilter());
      setChunkDialogOpen(false);
      setChunkDialogDocument(null);
      setChunkDialogChunks([]);
      setChunkDialogLoading(false);
      setChunkDialogError(null);
    }, 0);

    return () => window.clearTimeout(resetTimer);
  }, [knowledgeBaseId]);

  React.useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, [loadData]);

  function clearKeywordSearch() {
    setSearchKeyword("");
    setSubmittedSearchKeyword("");
    setSearchResults([]);
    setSearchError("");
    setHighlightedChunkId(null);
  }

  function handleSearchInputChange(value: string) {
    setSearchKeyword(value);
    if (!value.trim()) {
      setSubmittedSearchKeyword("");
      setSearchResults([]);
      setSearchError("");
      setHighlightedChunkId(null);
    }
  }

  async function runKeywordSearch(keyword: string) {
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
        `/api/rag-management/knowledge-bases/${knowledgeBaseId}/search?${params}`
      );
      const payload: unknown = await response.json();

      if (
        !response.ok ||
        !payload ||
        typeof payload !== "object" ||
        !("success" in payload) ||
        payload.success !== true
      ) {
        throw new Error(getSearchErrorMessage(payload));
      }

      const data =
        "data" in payload && payload.data && typeof payload.data === "object"
          ? payload.data
          : {};
      const results =
        "results" in data && Array.isArray(data.results)
          ? data.results
          : [];

      setSearchResults(results as KnowledgeKeywordSearchResult[]);
    } catch (caught) {
      setSearchResults([]);
      setSearchError(caught instanceof Error ? caught.message : "搜索失败");
    } finally {
      setSearchLoading(false);
    }
  }

  function handleEnableDocument(documentId: string) {
    const document = availableDocuments.find((item) => item.id === documentId);
    if (!document || saving) return;

    setAvailableDocuments((current) =>
      current.filter((item) => item.id !== documentId)
    );
    setSelectedDocuments((current) => [...current, document]);
  }

  function handleRemoveDocument(documentId: string) {
    const document = selectedDocuments.find((item) => item.id === documentId);
    if (!document || saving) return;

    setSelectedDocuments((current) =>
      current.filter((item) => item.id !== documentId)
    );
    setAvailableDocuments((current) => [document, ...current]);
  }

  function handleDetailFilterChange(nextFilter: KnowledgeBaseDetailFilterValue) {
    setDetailFilter(nextFilter);
    setHighlightedChunkId(null);

  }

  async function handleSaveAssignments() {
    if (!dirty || saving || !knowledgeBaseId) return;

    const currentIds = selectedDocuments.map((document) => document.id);
    const toAdd = difference(currentIds, initialSelectedDocumentIds);
    const toRemove = difference(initialSelectedDocumentIds, currentIds);

    if (toAdd.length === 0 && toRemove.length === 0) return;

    setSaving(true);
    setError(null);

    try {
      if (toAdd.length > 0) {
        await bindKnowledgeBaseDocuments(knowledgeBaseId, toAdd);
      }

      if (toRemove.length > 0) {
        await unbindKnowledgeBaseDocuments(knowledgeBaseId, toRemove);
      }

      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "文档配置保存失败");
    } finally {
      setSaving(false);
    }
  }

  // 从知识库移除单条知识条目（禁用 + 清 embedding）
  async function handleRemoveKnowledgeItem(item: { id: string }) {
    if (!knowledgeBaseId || removingItem) return;

    setRemovingItem(true);
    setError(null);

    try {
      const res = await fetch(`/api/knowledge/candidates/${item.id}/remove-from-kb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message ?? "移除失败");
      }

      await loadData();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "移除知识条目失败"
      );
    } finally {
      setRemovingItem(false);
    }
  }

  function isSearchResultVisible(result: KnowledgeKeywordSearchResult) {
    if (isDefaultKnowledgeBaseDetailFilter(detailFilter)) return true;

    const document = selectedDocuments.find(
      (item) => item.id === result.documentId
    );
    if (!document) return false;

    if (result.type === "document") {
      return (document.chunks ?? []).some((chunk) =>
        chunkMatchesFilter(chunk, detailFilter)
      );
    }

    const chunk = (document.chunks ?? []).find(
      (item) => item.id === result.chunkId
    );
    return chunk ? chunkMatchesFilter(chunk, detailFilter) : false;
  }

  function handleSearchResultClick(result: KnowledgeKeywordSearchResult) {
    if (!isSearchResultVisible(result)) {
      setDetailFilter(getDefaultKnowledgeBaseDetailFilter());
    }

    if (result.type === "chunk" && result.chunkId) {
      setHighlightedChunkId(result.chunkId);
      const document = selectedDocuments.find(
        (item) => item.id === result.documentId
      );
      if (document) {
        void handleViewChunks(document, result.chunkId);
      }
      return;
    }

    setHighlightedChunkId(null);
    scrollToElement(`document-${result.documentId}`);
  }

  async function handleViewChunks(document: RagDoc, chunkId?: string) {
    setChunkDialogDocument(document);
    setChunkDialogOpen(true);
    setChunkDialogError(null);
    setHighlightedChunkId(chunkId ?? null);

    if (Array.isArray(document.chunks)) {
      setChunkDialogChunks(document.chunks);
      setChunkDialogLoading(false);
      return;
    }

    setChunkDialogChunks([]);
    setChunkDialogLoading(true);

    try {
      const input = await fetchDocumentChunks({ documentId: document.id });
      const chunks = Array.isArray(input) ? input.map(normalizeRagChunk) : [];
      setChunkDialogChunks(chunks);
    } catch (caught) {
      setChunkDialogError(
        caught instanceof Error ? caught.message : "分片加载失败"
      );
    } finally {
      setChunkDialogLoading(false);
    }
  }

  function scrollToElement(id: string) {
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  }

  const selectedControls = (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <KnowledgeSearchBox
        value={searchKeyword}
        placeholder="搜索当前知识库内的文档标题、文件名或正文关键词"
        loading={searchLoading}
        disabled={selectedDocuments.length === 0}
        onChange={handleSearchInputChange}
        onSearch={(keyword) => void runKeywordSearch(keyword)}
        onClear={clearKeywordSearch}
      />

      {(submittedSearchKeyword || searchLoading || searchError) && (
        <div className="rounded-lg border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <SearchIcon className="size-3.5" />
              <span>
                {searchLoading ? "搜索中..." : `搜索结果：${searchResults.length} 条`}
              </span>
            </div>
            {submittedSearchKeyword ? (
              <span className="max-w-[240px] truncate text-xs text-muted-foreground">
                “{submittedSearchKeyword}”
              </span>
            ) : null}
          </div>

          {searchError ? (
            <div className="px-3 py-4 text-sm text-destructive">
              {searchError}
            </div>
          ) : searchLoading ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              正在检索当前知识库...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              没有找到匹配的文档或知识分片
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto p-2">
              {searchResults.map((result) => {
                const isKnowledgeResult = result.chunkType === "knowledge";
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
                    className="w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-muted"
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
                      <span className="truncate text-sm font-medium">
                        <SearchHighlight
                          text={result.title}
                          keyword={submittedSearchKeyword}
                        />
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      <SearchHighlight
                        text={result.snippet}
                        keyword={submittedSearchKeyword}
                      />
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>
                        命中：{MATCHED_FIELD_LABELS[result.matchedField]}
                      </span>
                      {result.type === "chunk" &&
                      result.chunkIndex !== undefined ? (
                        <span>#{result.chunkIndex + 1}</span>
                      ) : null}
                      <span className="truncate">{result.documentTitle}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <KnowledgeBaseDetailFilterBar
        value={detailFilter}
        categories={filterOptions.categories}
        tags={filterOptions.tags}
        disabled={selectedDocuments.length === 0}
        onChange={handleDetailFilterChange}
        onReset={() => setHighlightedChunkId(null)}
      />

      {hasActiveDetailFilter ? (
        <div className="text-xs text-muted-foreground">
          筛选后 {filteredSelectedDocuments.length} 篇文档 /{" "}
          {filteredChunkCount} 个分片
        </div>
      ) : null}
    </div>
  );

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <Button
        type="button"
        variant="ghost"
        className="px-0 text-muted-foreground"
        onClick={() => router.push("/knowledge-bases")}
      >
        <ArrowLeft data-icon="inline-start" />
        返回知识库列表
      </Button>

      {error ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
          <AlertCircle className="size-4" />
          {error}
        </div>
      ) : null}

      {detail && !loading ? (
        <Card>
          <CardHeader>
            <CardTitle>{detail.name}</CardTitle>
            <CardDescription>
              {detail.description || "暂无描述"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-4">
            <div>状态：{detail.status}</div>
            <div>TopK：{detail.topK}</div>
            <div>相似度阈值：{detail.similarityThreshold}</div>
            <div>更新时间：{formatDate(detail.updatedAt)}</div>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="rounded-md border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
          正在加载知识库详情...
        </div>
      ) : detail ? (
        <>
          {/* Tab 切换 */}
          <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
            <button
              onClick={() => setActiveTab("knowledge-items")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "knowledge-items"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BookOpen className="size-4" />
              知识条目
            </button>
            <button
              onClick={() => setActiveTab("documents")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "documents"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FolderOpen className="size-4" />
              文档管理
            </button>
          </div>

          {/* 知识条目面板 */}
          {activeTab === "knowledge-items" && (
            <KnowledgeItemsPanel
              documents={selectedDocuments}
              onRemoveItem={handleRemoveKnowledgeItem}
              removing={removingItem}
            />
          )}

          {/* 文档管理面板 */}
          {activeTab === "documents" && (
            <>
              <DocumentAssignmentPanel
                availableDocuments={availableDocuments}
                dirty={dirty}
                onEnable={handleEnableDocument}
                onRemove={handleRemoveDocument}
                onSave={() => void handleSaveAssignments()}
                onViewChunks={(document) => void handleViewChunks(document)}
                saving={saving}
                selectedControls={selectedControls}
                selectedDocuments={filteredSelectedDocuments}
                selectedEmptyText={
                  selectedDocuments.length === 0
                    ? "当前 RAG 暂未引用文档，可以从待选文档中启用。"
                    : "没有符合筛选条件的已引用文档。"
                }
              />
              <DocumentChunksDialog
                open={chunkDialogOpen}
                document={chunkDialogDocument}
                chunks={chunkDialogChunks}
                loading={chunkDialogLoading}
                error={chunkDialogError}
                highlightedChunkId={highlightedChunkId}
                highlightedCategory={highlightedCategory}
                highlightedTag={highlightedTag}
                searchKeyword={submittedSearchKeyword}
                onOpenChange={setChunkDialogOpen}
              />
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
