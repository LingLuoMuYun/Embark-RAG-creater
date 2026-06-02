import { prisma } from "@/lib/db";

import { notFound } from "./errors";

export async function deleteChunkService(id: string) {
  const current = await prisma.documentChunk.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!current) throw notFound("chunk not found");

  await prisma.documentChunk.delete({ where: { id } });

  return { id };
}

export async function updateChunkService(
  id: string,
  data: { content?: string; charStart?: number; charEnd?: number }
) {
  const current = await prisma.documentChunk.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!current) throw notFound("chunk not found");

  return prisma.documentChunk.update({
    where: { id },
    data: {
      ...(data.content !== undefined && { content: data.content }),
      ...(data.charStart !== undefined && { charStart: data.charStart }),
      ...(data.charEnd !== undefined && { charEnd: data.charEnd }),
    },
  });
}
