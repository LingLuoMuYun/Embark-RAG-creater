"use client";

import { FileText, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppStore } from "@/store";
import { DocumentChunksDialog } from "./document-chunks-dialog";
import { DocumentUploadZone } from "./document-upload-zone";
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  fetchRagDetail,
} from "./api";
import type { RagChunk, RagDoc } from "./types";
import {
  formatFileSize,
  getTotalChunkCount,
  normalizeRagChunk,
  normalizeRagDoc,
  normalizeRagItem,
  validateUploadFile,
} from "./utils";

type KnowledgeDocumentsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatDate(value: string) {
  if (value === "--") return "--";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
}

function getFileExtension(fileName: string) {
  const index = fileName.lastIndexOf(".");

  return index >= 0 ? fileName.slice(index).toLowerCase() : "";
}

function getSourceTypeFromFile(file: File) {
  const extension = getFileExtension(file.name);

  if (extension === ".md" || extension === ".markdown") return "markdown";
  if (extension === ".txt" || file.type.startsWith("text/")) return "text";

  return "file";
}

async function readFileAsKnowledgeText(file: File) {
  const sourceType = getSourceTypeFromFile(file);

  if (sourceType !== "text" && sourceType !== "markdown") return "";

  return file.text();
}

function createChunksFromText(rawContent: string) {
  const content = rawContent.trim();

  if (!content) return [];

  const chunkSize = 800;
  const chunkOverlap = 100;
  const step = chunkSize - chunkOverlap;
  const chunks: Array<{
    content: string;
    chunkIndex: number;
    startIndex: number;
    endIndex: number;
  }> = [];

  for (let startIndex = 0; startIndex < content.length; startIndex += step) {
    const endIndex = Math.min(startIndex + chunkSize, content.length);

    chunks.push({
      content: content.slice(startIndex, endIndex),
      chunkIndex: chunks.length,
      startIndex,
      endIndex,
    });

    if (endIndex >= content.length) break;
  }

  return chunks;
}

export function KnowledgeDocumentsDialog({
  open,
  onOpenChange,
}: KnowledgeDocumentsDialogProps) {
  const selectedId = useAppStore((state) => state.selectedId);
  const selected = useAppStore((state) => state.selected);
  const selectedDocs = useAppStore((state) => state.selectedDocs);
  const selectedChunks = useAppStore((state) => state.selectedChunks);
  const setSelectedDocs = useAppStore((state) => state.setSelectedDocs);
  const setSelectedChunks = useAppStore((state) => state.setSelectedChunks);
  const setSelected = useAppStore((state) => state.setSelected);
  const updateItem = useAppStore((state) => state.updateItem);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteDocTarget, setDeleteDocTarget] = useState<RagDoc | null>(null);
  const [chunksDialogOpen, setChunksDialogOpen] = useState(false);
  const [activeChunkDoc, setActiveChunkDoc] = useState<RagDoc | null>(null);
  const [chunksByDocumentId, setChunksByDocumentId] = useState<
    Record<string, RagChunk[]>
  >({});

  const safeDocs = Array.isArray(selectedDocs) ? selectedDocs : [];
  const totalChunkCount = useMemo(
    () => getTotalChunkCount(chunksByDocumentId),
    [chunksByDocumentId]
  );

  const syncCounts = useCallback(
    (nextDocs: RagDoc[], nextChunks: Record<string, RagChunk[]>) => {
      if (!selectedId) return;

      updateItem(selectedId, {
        documentCount: nextDocs.length,
        chunkCount: getTotalChunkCount(nextChunks),
      });
    },
    [selectedId, updateItem]
  );

  useEffect(() => {
    if (!open || !selectedId) return;

    let ignore = false;

    async function loadDocuments() {
      if (!selectedId) return;

      setDocumentsLoading(true);
      setDocumentsError(null);

      try {
        const detail = await fetchRagDetail(selectedId);
        const detailRecord =
          detail && typeof detail === "object"
            ? (detail as Record<string, unknown>)
            : {};
        const docsInput = Array.isArray(detailRecord.documents)
          ? detailRecord.documents
          : [];
        const docs = docsInput.map(normalizeRagDoc);
        const nextChunks = docsInput.reduce<Record<string, RagChunk[]>>(
          (acc, docInput) => {
            const doc = normalizeRagDoc(docInput);
            const record =
              docInput && typeof docInput === "object"
                ? (docInput as Record<string, unknown>)
                : {};
            const chunks = Array.isArray(record.chunks)
              ? record.chunks.map(normalizeRagChunk)
              : [];

            acc[doc.id] = chunks;
            return acc;
          },
          {}
        );

        if (ignore) return;

        setSelected(normalizeRagItem(detail));
        setSelectedDocs(docs);
        setChunksByDocumentId(nextChunks);
        syncCounts(docs, nextChunks);
      } catch (error) {
        console.error("Failed to load knowledge base documents.", error);

        if (!ignore) {
          setDocumentsError("知识文档加载失败，请稍后重试");
        }
      } finally {
        if (!ignore) {
          setDocumentsLoading(false);
        }
      }
    }

    loadDocuments();

    return () => {
      ignore = true;
    };
  }, [open, selectedId, setSelected, setSelectedDocs, syncCounts]);

  async function handleFilesSelected(files: FileList | File[]) {
    if (!selectedId) return;

    const validationError = validateUploadFile({
      files,
      selectedDocs: safeDocs,
    });

    if (validationError) {
      setUploadError(validationError);
      return;
    }

    const [file] = Array.from(files);
    setUploading(true);
    setUploadError(null);

    try {
      const rawContent = await readFileAsKnowledgeText(file);
      const chunks = createChunksFromText(rawContent);
      const document = await createKnowledgeDocument({
        title: file.name,
        sourceType: getSourceTypeFromFile(file),
        fileName: file.name,
        mimeType: file.type || undefined,
        fileSize: file.size,
        rawContent,
        parseStatus: rawContent ? "success" : "pending",
        status: "active",
        knowledgeBaseIds: [selectedId],
        chunks,
      });
      const doc = normalizeRagDoc(document);
      const normalizedChunks =
        document && typeof document === "object"
          ? Array.isArray((document as Record<string, unknown>).chunks)
            ? ((document as Record<string, unknown>).chunks as unknown[]).map(
                normalizeRagChunk
              )
            : []
          : [];
      const nextDocs = [...safeDocs, doc];
      const nextChunks = {
        ...chunksByDocumentId,
        [doc.id]: normalizedChunks,
      };

      setSelectedDocs(nextDocs);
      setChunksByDocumentId(nextChunks);
      syncCounts(nextDocs, nextChunks);
    } catch (error) {
      console.error("Failed to upload document.", error);
      setUploadError("文档上传失败，请稍后重试");
    } finally {
      setUploading(false);
    }
  }

  function openChunksDialog(doc: RagDoc) {
    const chunks = chunksByDocumentId[doc.id] ?? [];

    setActiveChunkDoc(doc);
    setSelectedChunks(chunks);
    setChunksDialogOpen(true);
  }

  async function confirmDeleteDocument() {
    if (!deleteDocTarget) return;

    setDeleteSubmitting(true);

    try {
      await deleteKnowledgeDocument(deleteDocTarget.id);

      const nextDocs = safeDocs.filter((doc) => doc.id !== deleteDocTarget.id);
      const nextChunks = { ...chunksByDocumentId };

      delete nextChunks[deleteDocTarget.id];

      const currentChunksBelongToDeletedDoc = selectedChunks.some(
        (chunk) => chunk.documentId === deleteDocTarget.id
      );

      setSelectedDocs(nextDocs);
      setChunksByDocumentId(nextChunks);

      if (currentChunksBelongToDeletedDoc) {
        setSelectedChunks([]);
        setActiveChunkDoc(null);
        setChunksDialogOpen(false);
      }

      syncCounts(nextDocs, nextChunks);
      setDeleteDocTarget(null);
    } catch (error) {
      console.error("Failed to delete document.", error);
      setDocumentsError("文档删除失败，请稍后重试");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>查看知识 - {selected?.name ?? "未命名知识库"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <DocumentUploadZone
              error={uploadError}
              uploading={uploading}
              onFilesSelected={handleFilesSelected}
            />

            {documentsError ? (
              <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                {documentsError}
              </div>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>知识文档</CardTitle>
                <CardDescription>
                  当前 {safeDocs.length} 个文档，{totalChunkCount} 个分片
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {documentsLoading ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    正在加载知识文档...
                  </div>
                ) : safeDocs.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    暂无知识文档，上传文件后将在这里展示文档
                  </div>
                ) : (
                  safeDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[1fr_auto]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText />
                          <span className="truncate text-sm font-medium">
                            {doc.name || "未命名文档"}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>大小：{formatFileSize(doc.size)}</span>
                          <span>上传时间：{formatDate(doc.uploadedAt)}</span>
                          <Badge variant="outline">
                            {(chunksByDocumentId[doc.id] ?? []).length} 分片
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openChunksDialog(doc)}
                        >
                          分片
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteDocTarget(doc)}
                        >
                          <Trash2 data-icon="inline-start" />
                          删除
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteDocTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeleteDocTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除文档</AlertDialogTitle>
            <AlertDialogDescription>
              确定要从「{selected?.name ?? "未命名知识库"}」中删除「
              {deleteDocTarget?.name ?? "未命名文档"}」吗？删除后该文档和关联分片会从数据库中移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDeleteDocument}
            >
              {deleteSubmitting ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DocumentChunksDialog
        open={chunksDialogOpen}
        document={activeChunkDoc}
        chunks={selectedChunks}
        onOpenChange={setChunksDialogOpen}
      />
    </>
  );
}
