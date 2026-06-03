import type {
  ChatCitation,
  ChatKnowledgeFile,
  ChatMessageDTO,
} from "@/features/agent/agent-chat.types";
import { prisma } from "@/lib/db";
import type { LlmMessage } from "@/server/services/agent/llm-client";
import type { KnowledgeFile } from "@/server/services/knowledge-agent-document.service";

const RECENT_CHAT_MESSAGE_LIMIT = 8;

export async function getOrCreateChatConversation(input: {
  conversationId?: string;
  message: string;
  mode: string;
  agentId?: string;
}) {
  if (input.conversationId) {
    const existing = await prisma.chatConversation.findUnique({
      where: { id: input.conversationId },
    });

    if (existing) return existing;
  }

  return prisma.chatConversation.create({
    data: {
      title: createConversationTitle(input.message),
      mode: input.mode,
      agentId: input.agentId,
    },
  });
}

export async function listChatConversationMessages(
  conversationId: string
): Promise<ChatMessageDTO[] | null> {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { id: true },
  });

  if (!conversation) return null;

  const messages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  return messages.map((message) => ({
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
    citations: parseJsonArray<ChatCitation>(message.citationsJson),
    knowledgeFiles: parseJsonArray<ChatKnowledgeFile>(
      message.knowledgeFilesJson
    ),
    createdAt: message.createdAt.toISOString(),
  }));
}

export async function listRecentChatLlmMessages(
  conversationId: string
): Promise<LlmMessage[]> {
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: RECENT_CHAT_MESSAGE_LIMIT,
  });

  return messages
    .reverse()
    .map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
    }));
}

export async function persistChatExchange(input: {
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
  citations?: ChatCitation[];
  knowledgeFiles?: KnowledgeFile[];
}) {
  await prisma.$transaction(async (tx) => {
    await tx.chatMessage.create({
      data: {
        conversationId: input.conversationId,
        role: "user",
        content: input.userMessage,
      },
    });

    await tx.chatMessage.create({
      data: {
        conversationId: input.conversationId,
        role: "assistant",
        content: input.assistantMessage,
        citationsJson: input.citations
          ? JSON.stringify(input.citations)
          : undefined,
        knowledgeFilesJson: input.knowledgeFiles
          ? JSON.stringify(input.knowledgeFiles)
          : undefined,
      },
    });

    await tx.chatConversation.update({
      where: { id: input.conversationId },
      data: { updatedAt: new Date() },
    });
  });
}

export function mergeRecentMessages(
  messages: LlmMessage[],
  recentMessages: LlmMessage[]
): LlmMessage[] {
  if (recentMessages.length === 0) return messages;

  const [systemMessage, ...rest] = messages;
  const currentUserMessage = rest[rest.length - 1];
  const middleMessages = rest.slice(0, -1);

  if (!systemMessage || systemMessage.role !== "system" || !currentUserMessage) {
    return [...recentMessages, ...messages];
  }

  return [
    systemMessage,
    ...middleMessages,
    ...recentMessages,
    currentUserMessage,
  ];
}

function createConversationTitle(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return "新对话";
  return normalized.length > 24 ? `${normalized.slice(0, 24)}...` : normalized;
}

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
