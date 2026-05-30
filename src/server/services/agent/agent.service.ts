import { prisma } from "@/lib/db";
import type { ExpertAgent, Prisma } from "@/generated/prisma/client";

import {
  parseAgentKnowledgeScope,
  stringifyAgentKnowledgeScope,
  type AgentCreateInput,
  type AgentListQuery,
  type AgentUpdateInput,
} from "@/features/agent/agent.validation";

export type AgentDTO = Omit<ExpertAgent, "knowledgeScope"> & {
  knowledgeScope: ReturnType<typeof parseAgentKnowledgeScope>;
};

export async function createAgent(input: AgentCreateInput): Promise<AgentDTO> {
  const agent = await prisma.expertAgent.create({
    data: {
      name: input.name,
      description: input.description,
      answerStyle: input.answerStyle,
      knowledgeScope: stringifyAgentKnowledgeScope(input.knowledgeScope),
      showReferences: input.showReferences,
      allowKnowledgeCapture: input.allowKnowledgeCapture,
      status: input.status,
      systemPrompt: input.systemPrompt,
    },
  });

  return toAgentDTO(agent);
}

export async function listAgents(options: AgentListQuery) {
  const { page, pageSize, status, keyword } = options;

  const where: Prisma.ExpertAgentWhereInput = {};
  if (status) {
    where.status = status;
  }
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { description: { contains: keyword } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.expertAgent.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.expertAgent.count({ where }),
  ]);

  return {
    items: items.map(toAgentDTO),
    total,
    page,
    pageSize,
  };
}

export async function getAgentById(id: string): Promise<AgentDTO | null> {
  const agent = await prisma.expertAgent.findUnique({ where: { id } });
  return agent ? toAgentDTO(agent) : null;
}

export async function updateAgent(
  id: string,
  input: AgentUpdateInput
): Promise<AgentDTO | null> {
  const current = await prisma.expertAgent.findUnique({ where: { id } });
  if (!current) return null;

  const data: Prisma.ExpertAgentUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.answerStyle !== undefined) data.answerStyle = input.answerStyle;
  if (input.knowledgeScope !== undefined) {
    data.knowledgeScope = stringifyAgentKnowledgeScope(input.knowledgeScope);
  }
  if (input.showReferences !== undefined) {
    data.showReferences = input.showReferences;
  }
  if (input.allowKnowledgeCapture !== undefined) {
    data.allowKnowledgeCapture = input.allowKnowledgeCapture;
  }
  if (input.status !== undefined) data.status = input.status;
  if (input.systemPrompt !== undefined) data.systemPrompt = input.systemPrompt;

  const agent = await prisma.expertAgent.update({
    where: { id },
    data,
  });

  return toAgentDTO(agent);
}

export async function deleteAgent(id: string): Promise<AgentDTO | null> {
  const current = await prisma.expertAgent.findUnique({ where: { id } });
  if (!current) return null;

  const agent = await prisma.expertAgent.delete({ where: { id } });
  return toAgentDTO(agent);
}

function toAgentDTO(agent: ExpertAgent): AgentDTO {
  return {
    ...agent,
    knowledgeScope: parseAgentKnowledgeScope(agent.knowledgeScope),
  };
}
