"use client";

import { FileText, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

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
import type { RagChunk, RagDoc } from "./types";
import {
  createMockChunksForDocument,
  createMockDocumentFromFile,
  formatFileSize,
  getTotalChunkCount,
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
  const updateItem = useAppStore((state) => state.updateItem);

  const [uploadError, setUploadError] = useState<string | null>(null);
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

  function syncCounts(
    nextDocs: RagDoc[],
    nextChunks: Record<string, RagChunk[]>
  ) {
    if (!selectedId) return;

    updateItem(selectedId, {
      documentCount: nextDocs.length,
      chunkCount: getTotalChunkCount(nextChunks),
    });
  }

  function handleFilesSelected(files: FileList | File[]) {
    const validationError = validateUploadFile({
      files,
      selectedDocs: safeDocs,
    });

    if (validationError) {
      setUploadError(validationError);
      return;
    }

    const [file] = Array.from(files);
    const doc = createMockDocumentFromFile(file);
    const chunks = createMockChunksForDocument(doc);
    const nextDocs = [...safeDocs, doc];
    const nextChunks = {
      ...chunksByDocumentId,
      [doc.id]: chunks,
    };

    setUploadError(null);
    setSelectedDocs(nextDocs);
    setChunksByDocumentId(nextChunks);
    syncCounts(nextDocs, nextChunks);
  }

  function openChunksDialog(doc: RagDoc) {
    const chunks = chunksByDocumentId[doc.id] ?? [];

    setActiveChunkDoc(doc);
    setSelectedChunks(chunks);
    setChunksDialogOpen(true);
  }

  function confirmDeleteDocument() {
    if (!deleteDocTarget) return;

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
              onFilesSelected={handleFilesSelected}
            />

            <Card>
              <CardHeader>
                <CardTitle>知识文档</CardTitle>
                <CardDescription>
                  当前 {safeDocs.length} 个文档，{totalChunkCount} 个模拟分片
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {safeDocs.length === 0 ? (
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
              {deleteDocTarget?.name ?? "未命名文档"}」吗？删除后该文档和关联模拟分片会从当前知识库中移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDeleteDocument}
            >
              确认删除
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
