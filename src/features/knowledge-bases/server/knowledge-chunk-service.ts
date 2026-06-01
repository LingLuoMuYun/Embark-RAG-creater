import { prisma } from "@/lib/db";

import { notFound } from "./errors";

export async function deleteChunkService(id: string) {
  const current = await prisma.knowledgeChunk.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!current) throw notFound("chunk not found");

  await prisma.knowledgeChunk.delete({ where: { id } });

  return { id };
}
