"use client";

import type { RagDoc } from "@/features/knowledge-bases/types";

import { AssignmentDocumentItem } from "./assignment-document-item";

type AssignmentDocumentListProps = {
  title: string;
  description: string;
  emptyText: string;
  documents: RagDoc[];
  kind: "selected" | "available";
  expandedDocumentIds?: Set<string>;
  highlightedChunkId?: string | null;
  highlightedCategory?: string;
  highlightedTag?: string;
  searchKeyword?: string;
  onMove: (documentId: string) => void;
  onToggleDocument?: (documentId: string) => void;
};

export function AssignmentDocumentList({
  title,
  description,
  emptyText,
  documents,
  kind,
  expandedDocumentIds,
  highlightedChunkId,
  highlightedCategory,
  highlightedTag,
  searchKeyword,
  onMove,
  onToggleDocument,
}: AssignmentDocumentListProps) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {documents.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((document) => (
            <AssignmentDocumentItem
              key={document.id}
              document={document}
              kind={kind}
              expanded={expandedDocumentIds?.has(document.id)}
              highlightedChunkId={highlightedChunkId}
              highlightedCategory={highlightedCategory}
              highlightedTag={highlightedTag}
              searchKeyword={searchKeyword}
              onMove={onMove}
              onToggleExpanded={onToggleDocument}
            />
          ))}
        </div>
      )}
    </section>
  );
}
