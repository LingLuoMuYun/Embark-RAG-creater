"use client";

import { Badge } from "@/components/ui/badge";
import type { RagChunk } from "@/features/knowledge-bases/types";

function parseTags(value?: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

type DocumentChunkListProps = {
  chunks: RagChunk[];
};

export function DocumentChunkList({ chunks }: DocumentChunkListProps) {
  if (chunks.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
        暂无分片数据
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {chunks.map((chunk) => {
        const tags = parseTags(chunk.suggestedTags);
        const charCount =
          typeof chunk.startIndex === "number" &&
          typeof chunk.endIndex === "number"
            ? Math.max(chunk.endIndex - chunk.startIndex, 0)
            : chunk.charCount;

        return (
          <article key={chunk.id} className="rounded-md border bg-muted/20 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">#{(chunk.chunkIndex ?? 0) + 1}</Badge>
              {chunk.chunkType ? (
                <Badge variant="secondary">{chunk.chunkType}</Badge>
              ) : null}
              {chunk.reviewStatus ? (
                <Badge variant="outline">{chunk.reviewStatus}</Badge>
              ) : null}
              {typeof charCount === "number" ? (
                <span className="text-xs text-muted-foreground">
                  {charCount} 字符
                </span>
              ) : null}
            </div>
            {chunk.title ? (
              <div className="mb-1 text-sm font-medium">{chunk.title}</div>
            ) : null}
            <p className="max-h-48 overflow-auto whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {chunk.content || "暂无内容"}
            </p>
            {chunk.suggestedCategory || tags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {chunk.suggestedCategory ? (
                  <span>{chunk.suggestedCategory}</span>
                ) : null}
                {tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
