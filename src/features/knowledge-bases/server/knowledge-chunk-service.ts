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
