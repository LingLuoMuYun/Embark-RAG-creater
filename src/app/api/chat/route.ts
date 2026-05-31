import { NextRequest, NextResponse } from "next/server";

import { directChatRequestSchema } from "@/features/agent/agent-chat.validation";
import type { ChatCitation } from "@/features/agent/agent-chat.types";
import type { RagRetrieveResponse } from "@/features/rag/types";
import { prisma } from "@/lib/db";
import { retrieveRagContexts } from "@/server/services/rag/retriever";
import {
  streamChatCompletion,
  type LlmMessage,
} from "@/server/services/agent/llm-client";

const encoder = new TextEncoder();

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = directChatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0].message,
        },
      },
      { status: 400 }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const prepared = await prepareDirectChat(parsed.data);
        send("citations", prepared.citations);

        await streamChatCompletion(
          prepared.messages,
          (token) => send("token", token),
          "openai"
        );

        send("done", { ok: true });
      } catch (error) {
        send("error", {
          code: "CHAT_ERROR",
          message: error instanceof Error ? error.message : "Chat failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function prepareDirectChat(input: {
  message: string;
  agentId?: string;
  chatMode: "openai" | "agent" | "rag-openai" | "rag-agent";
}): Promise<{ messages: LlmMessage[]; citations: ChatCitation[] }> {
  if (input.chatMode === "agent") {
    const agent = await getActiveAgent(input.agentId);
    return {
      messages: [
        {
          role: "system",
          content: agent.systemPrompt || "你是一个专业、可靠的专家 Agent。",
        },
        {
          role: "user",
          content: input.message,
        },
      ],
      citations: [],
    };
  }

  if (input.chatMode === "rag-openai") {
    const retrieve = await retrieveOpenaiContext(input.message);
    return {
      messages: buildRagOnlyMessages(input.message, retrieve),
      citations: toCitations(retrieve),
    };
  }

  return {
    messages: [
      {
        role: "system",
        content: "你是一个通用 AI 助手。请直接回答用户问题。",
      },
      {
        role: "user",
        content: input.message,
      },
    ],
    citations: [],
  };
}

async function getActiveAgent(agentId?: string) {
  if (!agentId) {
    throw new Error("Agent 模式需要先创建并启用一个 Agent");
  }

  const agent = await prisma.expertAgent.findUnique({
    where: { id: agentId },
  });

  if (!agent) throw new Error("Agent 不存在");
  if (agent.status !== "active") throw new Error("Agent 未启用");
  return agent;
}

async function retrieveOpenaiContext(
  query: string
): Promise<RagRetrieveResponse> {
  const knowledgeBases = await prisma.knowledgeBase.findMany({
    where: { status: "active" },
    select: { id: true },
  });
  const knowledgeBaseIds = knowledgeBases.map((item) => item.id);

  return retrieveRagContexts({
    query,
    mode: "balanced",
    scope: {
      knowledgeBaseIds:
        knowledgeBaseIds.length > 0 ? knowledgeBaseIds : ["kb_001", "kb_rag"],
    },
  });
}

function buildRagOnlyMessages(
  userMessage: string,
  retrieve: RagRetrieveResponse
): LlmMessage[] {
  return [
    {
      role: "system",
      content: `你是一个基于知识库上下文回答问题的 AI 助手。

知识库检索结果：
${retrieve.llmContext || "未检索到相关知识。"}

要求：
1. 优先基于知识库检索结果回答。
2. 如果使用某段知识，请用 [ref_x] 标注引用。
3. 如果知识库没有可靠依据，请明确说明没有找到可靠依据。
4. 不要编造引用编号。`,
    },
    {
      role: "user",
      content: userMessage,
    },
  ];
}

function toCitations(retrieve: RagRetrieveResponse): ChatCitation[] {
  return retrieve.contexts.map((context, index) => {
    const reference = retrieve.references.find(
      (item) => item.chunkId === context.chunkId
    );

    return {
      refId: reference?.refId ?? `ref_${index + 1}`,
      chunkId: context.chunkId,
      knowledgeId: context.knowledgeId,
      documentId: context.knowledgeId,
      knowledgeBaseId: context.knowledgeBaseId,
      title: context.title,
      content: context.content,
      chunkType: context.chunkType,
      score: context.score,
    };
  });
}
