import fs from "node:fs/promises";
import path from "node:path";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  getFileTypeFromName,
  parseFileContent,
  validateFileType,
  MAX_FILE_SIZE,
} from "@/lib/file-parser";
import { splitTextSemantic } from "@/lib/semantic-splitter";
import { splitTextIntoChunks, type TextChunk } from "@/lib/text-splitter";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

function containsTable(text: string): boolean {
  return /^\|.+\|$/m.test(text);
}

async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export type DocumentCreateInput = {
  originalName: string;
  fileType: string;
  fileSize: number;
};

export type DocumentListOptions = {
  page?: number;
  pageSize?: number;
  status?: string;
  hasCandidates?: boolean;
};

export async function createDocument(input: DocumentCreateInput) {
  return prisma.documentSource.create({
    data: {
      title: input.originalName,
      sourceType: "file",
      originalName: input.originalName,
      fileName: input.originalName,
      fileType: input.fileType,
      fileSize: input.fileSize,
      status: "uploading",
      parseStatus: "pending",
    },
  });
}

export async function updateDocumentStatus(
  id: string,
  status: string,
  extra?: { content?: string; errorMessage?: string }
) {
  const data: Prisma.DocumentSourceUpdateInput = { status };
  if (extra?.content !== undefined) {
    data.content = extra.content;
    data.rawContent = extra.content;
  }
  if (extra?.errorMessage !== undefined) data.errorMessage = extra.errorMessage;
  return prisma.documentSource.update({ where: { id }, data });
}

export async function getDocumentById(id: string) {
  return prisma.documentSource.findUnique({ where: { id } });
}

export async function listDocuments(options: DocumentListOptions = {}) {
  const { page = 1, pageSize = 20, status, hasCandidates } = options;

  const where: Prisma.DocumentSourceWhereInput = {};
  if (status) where.status = status;
  if (hasCandidates) where.chunks = { some: {} };

  const [items, total] = await Promise.all([
    prisma.documentSource.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        chunks: {
          select: { id: true },
        },
      },
    }),
    prisma.documentSource.count({ where }),
  ]);

  const normalizedItems = items.map((item) => ({
    ...item,
    candidatePending: 0,
    candidateConfirmed: item.chunks.length,
  }));

  return { items: normalizedItems, total, page, pageSize };
}

export async function deleteDocument(id: string) {
  const doc = await prisma.documentSource.findUnique({ where: { id } });
  if (!doc) return null;

  const filePath = path.join(UPLOAD_DIR, doc.id);
  try {
    await fs.unlink(filePath);
  } catch {
    // The physical file may not exist.
  }

  await prisma.documentSource.delete({ where: { id } });
  return doc;
}

export async function saveDocumentFile(
  id: string,
  buffer: Buffer
): Promise<void> {
  await ensureUploadDir();
  const filePath = path.join(UPLOAD_DIR, id);
  await fs.writeFile(filePath, buffer);
}

async function splitDocumentContent(content: string): Promise<TextChunk[]> {
  const hasTable = containsTable(content);
  const semanticChunks = hasTable ? null : await splitTextSemantic(content);
  return semanticChunks ?? splitTextIntoChunks(content);
}

async function replaceDocumentChunks(
  tx: Prisma.TransactionClient,
  documentSourceId: string,
  chunks: TextChunk[]
) {
  await tx.documentChunk.deleteMany({ where: { documentSourceId } });

  if (chunks.length === 0) return;

  await tx.documentChunk.createMany({
    data: chunks.map((chunk, index) => ({
      documentSourceId,
      chunkIndex: index,
      content: chunk.content,
      charStart: chunk.charStart,
      charEnd: chunk.charEnd,
      embedding: null,
      category: null,
      type: "note",
      status: "active",
    })),
  });
}

export async function parseDocument(id: string): Promise<{
  content: string;
  chunkCount: number;
}> {
  const doc = await prisma.documentSource.findUnique({ where: { id } });
  if (!doc) throw new Error(`Document not found: ${id}`);
  if (!doc.fileType || !validateFileType(doc.fileType)) {
    throw new Error(`Unsupported file type: ${doc.fileType}`);
  }

  await prisma.documentSource.update({
    where: { id },
    data: { status: "parsing", parseStatus: "processing" },
  });

  try {
    const filePath = path.join(UPLOAD_DIR, id);
    const buffer = await fs.readFile(filePath);
    const content = await parseFileContent(buffer, doc.fileType);

    if (doc.content === content && doc.status === "parsed") {
      await prisma.documentSource.update({
        where: { id },
        data: { status: "parsed", parseStatus: "success" },
      });
      return { content, chunkCount: doc.chunkCount };
    }

    const chunks = await splitDocumentContent(content);

    await prisma.$transaction(async (tx) => {
      await replaceDocumentChunks(tx, id, chunks);
      await tx.documentSource.update({
        where: { id },
        data: {
          status: "parsed",
          parseStatus: "success",
          content,
          rawContent: content,
          chunkCount: chunks.length,
        },
      });
    });

    return { content, chunkCount: chunks.length };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown parse error";
    await prisma.documentSource.update({
      where: { id },
      data: { status: "failed", parseStatus: "failed", errorMessage: message },
    });
    throw error;
  }
}

export async function updateDocumentContent(id: string, content: string) {
  const doc = await prisma.documentSource.findUnique({ where: { id } });
  if (!doc) return null;
  if (doc.content === content) return doc;

  const chunks = await splitDocumentContent(content);

  await prisma.$transaction(async (tx) => {
    await replaceDocumentChunks(tx, id, chunks);
    await tx.documentSource.update({
      where: { id },
      data: {
        content,
        rawContent: content,
        chunkCount: chunks.length,
        parseStatus: "success",
      },
    });
  });

  return prisma.documentSource.findUnique({ where: { id } });
}

export async function getDocumentChunks(documentSourceId: string) {
  return prisma.documentChunk.findMany({
    where: { documentSourceId },
    orderBy: { chunkIndex: "asc" },
  });
}

export async function getDocumentWithChunks(id: string) {
  return prisma.documentSource.findUnique({
    where: { id },
    include: {
      chunks: {
        orderBy: { chunkIndex: "asc" },
      },
    },
  });
}

export { MAX_FILE_SIZE, getFileTypeFromName };
