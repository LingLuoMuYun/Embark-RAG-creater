"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RagDoc } from "@/features/knowledge-bases/types";
import { formatFileSize } from "@/features/knowledge-bases/utils";

import { DocumentChunkList } from "./document-chunk-list";

function formatDate(value?: string) {
  if (!value || value === "--") return "--";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
}

type AssignmentDocumentItemProps = {
  document: RagDoc;
  kind: "selected" | "available";
  onMove: (documentId: string) => void;
};

export function AssignmentDocumentItem({
  document,
  kind,
  onMove,
}: AssignmentDocumentItemProps) {
  const [expanded, setExpanded] = React.useState(false);
  const chunks = document.chunks ?? [];
  const canShowChunks = kind === "selected";

  return (
    <article className="rounded-md border bg-background p-3">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-2">
              <div>
                <div className="truncate text-sm font-medium">
                  {document.title ?? document.name}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {document.originalName || document.fileName || "无原始文件名"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{document.fileType ?? "file"}</Badge>
                <Badge variant="outline">
                  {document.sourceType ?? "manual"}
                </Badge>
                <Badge variant="secondary">
                  {document.status ?? "pending"}
                </Badge>
                <Badge variant="secondary">
                  {document.activeStatus ?? "active"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>Chunks: {document.chunkCount ?? chunks.length}</span>
                <span>
                  大小: {formatFileSize(document.fileSize ?? document.size)}
                </span>
                <span>
                  更新: {formatDate(document.updatedAt ?? document.uploadedAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {canShowChunks ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? (
                <ChevronDown data-icon="inline-start" />
              ) : (
                <ChevronRight data-icon="inline-start" />
              )}
              分片
            </Button>
          ) : null}
          <Button
            type="button"
            variant={kind === "selected" ? "outline" : "default"}
            size="sm"
            onClick={() => onMove(document.id)}
          >
            {kind === "selected" ? "移除" : "启用"}
          </Button>
        </div>
      </div>
      {canShowChunks && expanded ? (
        <div className="mt-3 border-t pt-3">
          <DocumentChunkList chunks={chunks} />
        </div>
      ) : null}
    </article>
  );
}
