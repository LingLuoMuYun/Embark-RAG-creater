import { NextRequest, NextResponse } from "next/server";

import { agentIdSchema } from "@/features/agent/agent.validation";
import { agentChatRequestSchema } from "@/features/agent/agent-chat.validation";
import {
  prepareAgentChat,
  streamAndPersistAgentAnswer,
} from "@/server/services/agent/agent-chat.service";

const encoder = new TextEncoder();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idParsed = agentIdSchema.safeParse({ id });
  if (!idParsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid agent id" },
      },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = agentChatRequestSchema.safeParse(body);
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
        const prepared = await prepareAgentChat({
          agentId: idParsed.data.id,
          conversationId: parsed.data.conversationId,
          message: parsed.data.message,
          llmInterface: parsed.data.llmInterface,
        });

        send("meta", {
          conversationId: prepared.conversation.id,
          agentId: prepared.agent.id,
        });
        send("citations", prepared.citations);

        await streamAndPersistAgentAnswer({
          conversationId: prepared.conversation.id,
          userMessage: parsed.data.message,
          messages: prepared.messages,
          citations: prepared.citations,
          llmInterface: parsed.data.llmInterface,
          onToken: (token) => send("token", token),
        });

        send("done", { ok: true });
      } catch (error) {
        send("error", {
          code: "CHAT_ERROR",
          message: error instanceof Error ? error.message : "Agent chat failed",
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
