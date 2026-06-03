"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { AdminShell } from "@/components/layout/admin-shell";
import type {
  ChatCitation,
  ChatMessageDTO,
} from "@/features/agent/agent-chat.types";

type AgentItem = {
  id: string;
  name: string;
  description?: string | null;
  answerStyle: string;
  status: string;
};

type UiMessage = Omit<ChatMessageDTO, "id" | "createdAt"> & {
  id: string;
  pending?: boolean;
};

type ChatMode = "openai" | "agent" | "rag-openai" | "rag-agent";

type AgentListResponse = {
  success: boolean;
  data?: {
    items: AgentItem[];
  };
  error?: {
    message?: string;
  };
};

type MessageListResponse = {
  success: boolean;
  data?: ChatMessageDTO[];
};

const CHAT_MODE_OPTIONS: Array<{ value: ChatMode; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "agent", label: "Agent" },
  { value: "rag-openai", label: "RAG + OpenAI" },
  { value: "rag-agent", label: "RAG + Agent" },
];

export default function AgentChatPage() {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [agentId, setAgentId] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("openai");
  const [menuOpen, setMenuOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const localMessageIdRef = useRef(0);
  const shouldAutoScrollRef = useRef(true);

  const currentAgent = useMemo(
    () => agents.find((agent) => agent.id === agentId),
    [agents, agentId]
  );
  const currentChatMode = useMemo(
    () =>
      CHAT_MODE_OPTIONS.find((option) => option.value === chatMode) ??
      CHAT_MODE_OPTIONS[0],
    [chatMode]
  );
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is intentionally used for long chat histories.
  const messageVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 120,
    overscan: 6,
    getItemKey: (index) => messages[index]?.id ?? index,
  });

  useEffect(() => {
    const initialAgentId = new URLSearchParams(window.location.search).get(
      "agentId"
    );

    fetch("/api/agents?status=active")
      .then((res) => res.json())
      .then((json: AgentListResponse) => {
        if (!json.success || !json.data) {
          throw new Error(json.error?.message || "加载 Agent 失败");
        }

        const items = json.data.items;
        setAgents(items);
        setAgentId((current) => {
          if (current) return current;
          if (initialAgentId && items.some((agent) => agent.id === initialAgentId)) {
            return initialAgentId;
          }
          return items[0]?.id || "";
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "加载 Agent 失败");
      });
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    fetch(`/api/conversations/${conversationId}/messages`)
      .then((res) => res.json())
      .then((json: MessageListResponse) => {
        if (json.success && json.data) {
          setMessages(
            json.data.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              citations: message.citations,
            }))
          );
        }
      })
      .catch(() => undefined);
  }, [conversationId]);

  useEffect(() => {
    if (shouldAutoScrollRef.current && messages.length > 0) {
      messageVirtualizer.scrollToIndex(messages.length - 1, {
        align: "end",
      });
    }
  }, [messages, messageVirtualizer]);

  function handleMessageScroll() {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceToBottom < 120;
  }

  async function sendMessage() {
    const message = input.trim();
    if (!message || loading) return;

    setError(null);
    setLoading(true);
    setInput("");
    shouldAutoScrollRef.current = true;
    localMessageIdRef.current += 1;
    const localId = localMessageIdRef.current;

    const userMessage: UiMessage = {
      id: `user-${localId}`,
      role: "user",
      content: message,
      citations: [],
    };
    const assistantMessage: UiMessage = {
      id: `assistant-${localId}`,
      role: "assistant",
      content: "",
      citations: [],
      pending: true,
    };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    const requiresAgent = chatMode === "agent" || chatMode === "rag-agent";
    if (requiresAgent && !agentId) {
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMessage.id
            ? {
                ...item,
                content: "当前模式需要先创建并启用一个 Agent。",
                pending: false,
              }
            : item
        )
      );
      setLoading(false);
      return;
    }

    try {
      const endpoint =
        chatMode === "rag-agent" ? `/api/agents/${agentId}/chat` : "/api/chat";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          conversationId,
          ...(agentId ? { agentId } : {}),
          chatMode,
          llmInterface: "openai",
        }),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message || "发送失败");
      }

      await readSseStream(res.body, {
        meta: (data) => {
          if (data.conversationId) setConversationId(data.conversationId);
        },
        token: (token) => {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessage.id
                ? { ...item, content: item.content + token }
                : item
            )
          );
        },
        citations: (citations) => {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessage.id ? { ...item, citations } : item
            )
          );
        },
        error: (data) => {
          throw new Error(data.message || "回答生成失败");
        },
      });

      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMessage.id ? { ...item, pending: false } : item
        )
      );
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "回答生成失败";
      setError(messageText);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMessage.id
            ? {
                ...item,
                content: `生成失败：${messageText}`,
                pending: false,
              }
            : item
        )
      );
    } finally {
      setLoading(false);
    }
  }

  function startNewConversation() {
    setConversationId(undefined);
    setMessages([]);
    setError(null);
    shouldAutoScrollRef.current = true;
  }

  return (
    <AdminShell>
      <div className="flex min-h-[calc(100vh-7rem)] bg-zinc-50 text-zinc-900">


        <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-zinc-200 bg-white px-4 py-3 md:px-6">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-zinc-500">当前 Agent</p>
              <h2 className="truncate text-xl font-semibold">
                {currentAgent?.name || "请选择一个启用的 Agent"}
              </h2>
            </div>
            <button
              type="button"
              onClick={startNewConversation}
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 md:hidden"
            >
              新会话
            </button>
          </div>
        </header>

        <section
          ref={scrollContainerRef}
          onScroll={handleMessageScroll}
          className="flex-1 overflow-y-auto px-4 py-6 md:px-8"
        >
          <div className="mx-auto max-w-3xl">
            {messages.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-sm leading-6 text-zinc-500">
                输入问题后，系统会组装多轮记忆与 RAG 检索上下文，再生成带引用的回答。
              </div>
            ) : (
              <div
                className="relative w-full"
                style={{
                  height: `${messageVirtualizer.getTotalSize()}px`,
                }}
              >
                {messageVirtualizer.getVirtualItems().map((virtualItem) => {
                  const message = messages[virtualItem.index];
                  if (!message) return null;

                  return (
                    <div
                      key={virtualItem.key}
                      ref={messageVirtualizer.measureElement}
                      data-index={virtualItem.index}
                      className="absolute left-0 top-0 w-full py-2"
                      style={{
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <MessageBubble message={message} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <footer className="border-t border-zinc-200 bg-white px-4 py-4 md:px-8">
          <div className="mx-auto max-w-3xl">
            {error && (
              <p className="mb-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <div className="relative shrink-0">
                <button
                  type="button"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                  disabled={loading}
                  className="flex h-12 w-36 flex-col justify-center rounded-md border border-zinc-200 bg-white px-3 text-left outline-none hover:bg-zinc-50 focus:border-cyan-500 disabled:cursor-not-allowed disabled:bg-zinc-100"
                >
                  <span className="truncate text-xs font-medium text-zinc-800">
                    {currentChatMode.label}
                  </span>
                  <span className="truncate text-[11px] text-zinc-400">
                    {currentAgent?.name || "无 Agent"}
                  </span>
                </button>
                {menuOpen && (
                  <div className="absolute bottom-14 left-0 z-20 w-64 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
                    <div className="p-2">
                      {CHAT_MODE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setChatMode(option.value);
                            setMenuOpen(false);
                          }}
                          className={`w-full rounded-md px-2 py-2 text-left text-xs ${
                            option.value === chatMode
                              ? "bg-cyan-50 text-cyan-800"
                              : "text-zinc-700 hover:bg-zinc-50"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="输入问题，Enter 发送，Shift + Enter 换行"
                className="min-h-12 flex-1 resize-none rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="rounded-md bg-cyan-700 px-5 py-2 text-sm font-medium text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {loading ? "生成中" : "发送"}
              </button>
            </div>
          </div>
        </footer>
        </main>
      </div>
    </AdminShell>
  );
}

function MessageBubble({ message }: { message: UiMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-6 ${
          isUser ? "bg-cyan-700 text-white" : "border border-zinc-200 bg-white"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">
          {message.content || (message.pending ? "正在生成..." : "")}
        </div>
        {!isUser && message.citations.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
            <p className="text-xs font-medium text-zinc-500">引用来源</p>
            {message.citations.map((citation) => (
              <div
                key={`${citation.refId}-${citation.chunkId}`}
                className="rounded-md bg-zinc-50 p-3 text-xs text-zinc-600"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-zinc-800">
                    [{citation.refId}] {citation.title}
                  </span>
                  <span>{citation.score.toFixed(2)}</span>
                </div>
                <p className="mt-1 line-clamp-3">{citation.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function readSseStream(
  body: ReadableStream<Uint8Array>,
  handlers: {
    meta: (data: { conversationId?: string }) => void;
    token: (token: string) => void;
    citations: (citations: ChatCitation[]) => void;
    error: (data: { message?: string }) => void;
  }
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const eventText of events) {
      const lines = eventText.split("\n");
      const event = lines
        .find((line) => line.startsWith("event:"))
        ?.slice(6)
        .trim();
      const dataText = lines
        .find((line) => line.startsWith("data:"))
        ?.slice(5)
        .trim();

      if (!event || !dataText) continue;
      const data = JSON.parse(dataText);

      if (event === "meta") handlers.meta(data);
      if (event === "token") handlers.token(data);
      if (event === "citations") handlers.citations(data);
      if (event === "error") handlers.error(data);
    }
  }
}
