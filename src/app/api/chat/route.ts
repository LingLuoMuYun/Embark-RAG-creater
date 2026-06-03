import { NextRequest, NextResponse } from "next/server";

import { directChatRequestSchema } from "@/features/agent/agent-chat.validation";
import type { ChatCitation } from "@/features/agent/agent-chat.types";
import type { RagRetrieveResponse, RagRetrieveScope } from "@/features/rag/types";
import { prisma } from "@/lib/db";
import { buildAttachmentPromptContext } from "@/server/services/chat-attachment.service";
import {
  getOrCreateChatConversation,
  listRecentChatLlmMessages,
  mergeRecentMessages,
  persistChatExchange,
} from "@/server/services/chat-conversation.service";
import {
  RAG_CITATION_MIN_SCORE,
  shouldUseRagForMessage,
} from "@/server/services/rag/gating";
import { retrieveRagContexts } from "@/server/services/rag/retriever";
import {
  buildKnowledgeDocumentMap,
  formatKnowledgeDocumentToolResult,
  retrieveKnowledgeDocuments,
  type KnowledgeFile,
  type KnowledgeDocumentToolInput,
} from "@/server/services/knowledge-agent-document.service";
import {
  createChatCompletion,
  streamChatCompletion,
  type LlmMessage,
} from "@/server/services/agent/llm-client";

const encoder = new TextEncoder();

type ChatStreamStatus =
  | "retrieving"
  | "organizing"
  | "reading-documents"
  | "generating"
  | "failed";

type RagSummary = {
  status: "not-applicable" | "skipped" | "hit" | "miss";
  citationCount: number;
};

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
        if (request.signal.aborted) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // The client may have stopped the stream between tokens.
        }
      };

      try {
        const conversation = await getOrCreateChatConversation({
          conversationId: parsed.data.conversationId,
          message: parsed.data.message,
          mode: parsed.data.chatMode,
          agentId: parsed.data.agentId,
        });
        const recentMessages = await listRecentChatLlmMessages(conversation.id);

        send("meta", {
          conversationId: conversation.id,
        });
        send("status", {
          status:
            parsed.data.chatMode === "rag-openai" ? "retrieving" : "organizing",
        } satisfies { status: ChatStreamStatus });

        if (parsed.data.chatMode === "knowledge-agent") {
          const result = await streamKnowledgeAgentChat(
            parsed.data,
            send,
            recentMessages,
            request.signal
          );
          await persistChatExchange({
            conversationId: conversation.id,
            userMessage: parsed.data.message,
            assistantMessage: result.answer,
            citations: [],
            knowledgeFiles: result.knowledgeFiles,
          });
          send("done", { ok: true });
          return;
        }

        const prepared = await prepareDirectChat(
          parsed.data,
          request.nextUrl.origin,
          recentMessages
        );
        send("rag-summary", prepared.ragSummary);
        send("citations", prepared.citations);
        send("status", { status: "organizing" } satisfies {
          status: ChatStreamStatus;
        });
        send("status", { status: "generating" } satisfies {
          status: ChatStreamStatus;
        });

        const answer = await streamChatCompletion(
          prepared.messages,
          (token) => send("token", token),
          parsed.data.llmInterface ?? "openai",
          { signal: request.signal }
        );
        await persistChatExchange({
          conversationId: conversation.id,
          userMessage: parsed.data.message,
          assistantMessage: answer,
          citations: prepared.citations,
        });

        send("done", { ok: true });
      } catch (error) {
        if (request.signal.aborted || (error as Error).name === "AbortError") {
          return;
        }

        send("status", { status: "failed" } satisfies {
          status: ChatStreamStatus;
        });
        send("error", {
          code: "CHAT_ERROR",
          message: error instanceof Error ? error.message : "Chat failed",
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Client may have already closed the stream.
        }
      }
    },
    cancel() {
      // The client controls cancellation through request.signal.
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

async function prepareDirectChat(
  input: {
    message: string;
    agentId?: string;
    chatMode: "openai" | "agent" | "knowledge-agent" | "rag-openai";
    attachmentIds?: string[];
  },
  origin: string,
  recentMessages: LlmMessage[]
): Promise<{
  messages: LlmMessage[];
  citations: ChatCitation[];
  ragSummary: RagSummary;
}> {
  const attachmentContext = await buildAttachmentPromptContext(
    input.attachmentIds
  );

  if (input.chatMode === "agent") {
    const agent = await getActiveAgent(input.agentId);
    return {
      messages: mergeRecentMessages(
        buildAgentMessages({
          userMessage: input.message,
          systemPrompt: agent.systemPrompt,
          attachmentContext,
        }),
        recentMessages
      ),
      citations: [],
      ragSummary: { status: "not-applicable", citationCount: 0 },
    };
  }

  if (input.chatMode === "rag-openai") {
    const shouldUseKnowledgeBase = shouldUseRagForMessage(input.message);
    if (!shouldUseKnowledgeBase) {
      return {
        messages: mergeRecentMessages(
          buildPlainChatMessages(input.message, attachmentContext),
          recentMessages
        ),
        citations: [],
        ragSummary: { status: "skipped", citationCount: 0 },
      };
    }

    const { retrieve, scope } = await retrieveOpenaiContext(input.message);
    const citations = toCitations(retrieve);
    await reportRagUsage({
      origin,
      query: input.message,
      scope,
      retrieve,
    });

    return {
      messages: mergeRecentMessages(
        buildRagOnlyMessages(input.message, retrieve, attachmentContext),
        recentMessages
      ),
      citations,
      ragSummary: {
        status: citations.length > 0 ? "hit" : "miss",
        citationCount: citations.length,
      },
    };
  }

  return {
    messages: mergeRecentMessages(
      buildPlainChatMessages(input.message, attachmentContext),
      recentMessages
    ),
    citations: [],
    ragSummary: { status: "not-applicable", citationCount: 0 },
  };
}

async function streamKnowledgeAgentChat(
  input: {
    message: string;
    attachmentIds?: string[];
    llmInterface?: "default" | "openai" | "local";
  },
  send: (event: string, data: unknown) => void,
  recentMessages: LlmMessage[],
  signal?: AbortSignal
): Promise<{ answer: string; knowledgeFiles: KnowledgeFile[] }> {
  const attachmentContext = await buildAttachmentPromptContext(
    input.attachmentIds
  );
  const documentMap = await buildKnowledgeDocumentMap();
  const probeMessages = mergeRecentMessages(
    buildKnowledgeAgentMessages({
      userMessage: input.message,
      attachmentContext,
      documentMap: documentMap.text,
    }),
    recentMessages
  );

  send("rag-summary", {
    status: "not-applicable",
    citationCount: 0,
  } satisfies RagSummary);
  send("citations", []);
  send("status", { status: "organizing" } satisfies {
    status: ChatStreamStatus;
  });

  const llmInterface = input.llmInterface ?? "openai";
  const firstResponse = await createChatCompletion(probeMessages, llmInterface, {
    signal,
  });
  const toolInput = parseRetrieveFilesAction(firstResponse);

  if (!toolInput) {
    send("status", { status: "generating" } satisfies {
      status: ChatStreamStatus;
    });
    send("token", firstResponse);
    return { answer: firstResponse, knowledgeFiles: [] };
  }

  send("status", { status: "reading-documents" } satisfies {
    status: ChatStreamStatus;
  });
  const toolResult = await retrieveKnowledgeDocuments(toolInput);
  const knowledgeFiles = toolResult.files.map((file) => ({
    id: file.id,
    title: file.title,
    chunkCount: file.chunkCount,
  }));
  send(
    "knowledge-files",
    knowledgeFiles
  );

  const finalMessages: LlmMessage[] = [
    ...probeMessages,
    {
      role: "assistant",
      content: firstResponse,
    },
    {
      role: "user",
      content: `${formatKnowledgeDocumentToolResult(toolResult)}

请基于上面的 retrieve_files 工具结果回答用户原始问题。不要再次输出 <|Action|>，也不要声称读取了正式知识库或向量检索结果。`,
    },
  ];

  send("status", { status: "generating" } satisfies {
    status: ChatStreamStatus;
  });
  const answer = await streamChatCompletion(
    finalMessages,
    (token) => send("token", token),
    llmInterface,
    { signal }
  );

  return { answer, knowledgeFiles };
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
): Promise<{ retrieve: RagRetrieveResponse; scope: RagRetrieveScope }> {
  const knowledgeBases = await prisma.knowledgeBase.findMany({
    where: { status: "active" },
    select: { id: true },
  });
  const knowledgeBaseIds = knowledgeBases.map((item) => item.id);
  const scope = {
    knowledgeBaseIds:
      knowledgeBaseIds.length > 0 ? knowledgeBaseIds : ["kb_001", "kb_rag"],
  };

  const retrieve = await retrieveRagContexts({
    query,
    mode: "balanced",
    scope,
  });

  return { retrieve, scope };
}

async function reportRagUsage(input: {
  origin: string;
  query: string;
  scope: RagRetrieveScope;
  retrieve: RagRetrieveResponse;
}) {
  try {
    const response = await fetch(`${input.origin}/api/usage/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: input.query,
        mode: "balanced",
        scope: input.scope,
        contexts: input.retrieve.contexts,
        references: input.retrieve.references,
      }),
    });

    if (!response.ok) {
      console.warn("Failed to report RAG usage log", {
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    console.warn("Failed to report RAG usage log", error);
  }
}

function buildPlainChatMessages(
  userMessage: string,
  attachmentContext: string
): LlmMessage[] {
  return [
    {
      role: "system",
      content: `你是一个通用 AI 助手。请直接回答用户问题。

${renderAttachmentInstruction(attachmentContext)}`,
    },
    {
      role: "user",
      content: userMessage,
    },
  ];
}

function buildKnowledgeAgentMessages(input: {
  userMessage: string;
  attachmentContext: string;
  documentMap: string;
}): LlmMessage[] {
  return [
    {
      role: "system",
      content: `你是一个 Knowledge Agent，负责帮助用户围绕知识库建设、知识消费、知识整理和知识问答策略进行对话。

当前能力边界：
1. 你当前只能读取“文档导入/解析”模块中已解析完成的导入文档。
2. 你不能读取正式知识库、数据库表或向量检索结果，不要声称已经检索或引用了正式知识库。
3. 如果用户的问题需要具体文档依据，请根据文档地图选择相关文档，并输出 retrieve_files 工具调用。
4. 如果文档地图没有相关文档，请直接说明没有找到可读取依据，并建议用户先上传并解析文档。
5. 如果本轮有附件内容，可以把附件作为当前对话上下文使用，但不要把附件说成已经进入知识库。
6. 回答应偏向可执行方案，例如知识库结构、消费链路、Agent 设计、Prompt 设计、评估方式和落地步骤。

可用文档地图：
${input.documentMap}

当你需要读取导入文档时，只输出以下格式，不要输出其他内容：
<|Action|> retrieve_files
<|Action Input|> {"documents":["documentId 或标题"]}

工具调用限制：
1. documents 最多 3 项。
2. 优先使用文档地图中的 documentId。
3. 读取工具返回结果后，再基于已读取内容回答。

${renderAttachmentInstruction(input.attachmentContext)}`,
    },
    {
      role: "user",
      content: input.userMessage,
    },
  ];
}

function buildAgentMessages(input: {
  userMessage: string;
  systemPrompt: string | null;
  attachmentContext: string;
}): LlmMessage[] {
  return [
    {
      role: "system",
      content: `${input.systemPrompt || "你是一个专业、可靠的专家 Agent。"}

${renderAttachmentInstruction(input.attachmentContext)}`,
    },
    {
      role: "user",
      content: input.userMessage,
    },
  ];
}

function buildRagOnlyMessages(
  userMessage: string,
  retrieve: RagRetrieveResponse,
  attachmentContext: string
): LlmMessage[] {
  return [
    {
      role: "system",
      content: `你是一个基于知识库上下文回答问题的 AI 助手。

${renderAttachmentInstruction(attachmentContext)}

知识库检索结果：
${retrieve.llmContext || "未检索到相关知识。"}

要求：
1. 优先理解用户问题和本轮附件内容。
2. 涉及业务知识时，优先基于知识库检索结果回答。
3. 如果使用某段知识库内容，请用 [ref_x] 标注引用。
4. 如果知识库没有可靠依据，请明确说明没有找到可靠依据。
5. 不要编造引用编号。`,
    },
    {
      role: "user",
      content: userMessage,
    },
  ];
}

function renderAttachmentInstruction(attachmentContext: string): string {
  if (!attachmentContext) {
    return "本轮用户没有上传附件。";
  }

  return `${attachmentContext}

附件使用规则：
1. 当用户要求总结、解释、提取或分析附件时，优先使用附件内容。
2. 附件内容只作为当前对话上下文，不代表已经进入业务知识库。
3. 不要把附件内容标注为知识库引用来源。`;
}

function toCitations(retrieve: RagRetrieveResponse): ChatCitation[] {
  return retrieve.contexts
    .filter((context) => context.score >= RAG_CITATION_MIN_SCORE)
    .map((context, index) => {
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

function parseRetrieveFilesAction(text: string): KnowledgeDocumentToolInput | null {
  const actionMatch = text.match(/<\|Action\|>\s*retrieve_files/i);
  if (!actionMatch) return null;

  const inputMatch = text.match(
    /<\|Action Input\|>\s*([\s\S]*?)(?:\n\s*<\||$)/
  );
  if (!inputMatch) return null;

  try {
    const parsed = JSON.parse(inputMatch[1].trim()) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as { documents?: unknown }).documents)
    ) {
      return null;
    }

    return {
      documents: (parsed as { documents: unknown[] }).documents.filter(
        (document): document is string => typeof document === "string"
      ),
    };
  } catch {
    return null;
  }
}
