import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

import {
  getFileTypeFromName,
  parseFileContent,
  validateFileType,
  MAX_FILE_SIZE,
} from "@/lib/file-parser";
import { splitTextIntoChunks } from "@/lib/text-splitter";
import type { TextChunk } from "@/lib/text-splitter";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch {
    // directory already exists
  }
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
};

export async function createDocument(input: DocumentCreateInput) {
  const doc = await prisma.documentSource.create({
    data: {
      originalName: input.originalName,
      fileType: input.fileType,
      fileSize: input.fileSize,
      status: "uploading",
    },
  });
  return doc;
}

export async function updateDocumentStatus(
  id: string,
  status: string,
  extra?: { content?: string; errorMessage?: string }
) {
  const data: Prisma.DocumentSourceUpdateInput = { status };
  if (extra?.content !== undefined) data.content = extra.content;
  if (extra?.errorMessage !== undefined) data.errorMessage = extra.errorMessage;
  return prisma.documentSource.update({ where: { id }, data });
}

export async function getDocumentById(id: string) {
  return prisma.documentSource.findUnique({ where: { id } });
}

export async function listDocuments(options: DocumentListOptions = {}) {
  const { page = 1, pageSize = 20, status } = options;

  const where: Prisma.DocumentSourceWhereInput = {};
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    prisma.documentSource.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.documentSource.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function deleteDocument(id: string) {
  const doc = await prisma.documentSource.findUnique({ where: { id } });
  if (!doc) return null;

  // Try to delete the physical file if it exists
  const filePath = path.join(UPLOAD_DIR, doc.id);
  try {
    await fs.unlink(filePath);
  } catch {
    // file may not exist on disk
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

export async function parseDocument(id: string): Promise<{
  content: string;
  chunkCount: number;
}> {
  const doc = await prisma.documentSource.findUnique({ where: { id } });
  if (!doc) throw new Error(`Document not found: ${id}`);
  if (!validateFileType(doc.fileType)) {
    throw new Error(`Unsupported file type: ${doc.fileType}`);
  }

  // Update status to parsing
  await updateDocumentStatus(id, "parsing");

  try {
    // Read the saved file
    const filePath = path.join(UPLOAD_DIR, id);
    const buffer = await fs.readFile(filePath);

    const content = await parseFileContent(buffer, doc.fileType);

    // Split content into chunks
    const chunks = splitTextIntoChunks(content);

    // Delete old chunks and create new ones in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentSourceId: id } });

      if (chunks.length > 0) {
        await tx.documentChunk.createMany({
          data: chunks.map((chunk: TextChunk, index: number) => ({
            documentSourceId: id,
            chunkIndex: index,
            content: chunk.content,
            charStart: chunk.charStart,
            charEnd: chunk.charEnd,
          })),
        });
      }

      await tx.documentSource.update({
        where: { id },
        data: {
          status: "parsed",
          content,
          chunkCount: chunks.length,
        },
      });
    });

    return { content, chunkCount: chunks.length };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown parse error";
    await updateDocumentStatus(id, "failed", { errorMessage: message });
    throw error;
  }
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
