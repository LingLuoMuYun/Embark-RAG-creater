"use client";

import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RagChunk, RagDoc } from "./types";

type DocumentChunksDialogProps = {
  open: boolean;
  document: RagDoc | null;
  chunks: RagChunk[];
  onOpenChange: (open: boolean) => void;
};

function formatDate(value?: string) {
  if (!value || value === "--") return "--";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
}

export function DocumentChunksDialog({
  open,
  document,
  chunks,
  onOpenChange,
}: DocumentChunksDialogProps) {
  const safeChunks = Array.isArray(chunks) ? chunks : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>知识分片 - {document?.name ?? "未命名文档"}</DialogTitle>
        </DialogHeader>

        {safeChunks.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              暂无知识分片
            </CardContent>
          </Card>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
            {safeChunks.map((chunk, index) => (
              <Card key={chunk.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <FileText />
                      分片 {index + 1}
                    </span>
                    <Badge variant="outline">
                      {chunk.charCount ?? chunk.content.length} 字符
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-sm leading-6">
                    {chunk.content || "暂无内容"}
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Token：{chunk.tokenCount ?? 0}</span>
                    <span>创建时间：{formatDate(chunk.createdAt)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
