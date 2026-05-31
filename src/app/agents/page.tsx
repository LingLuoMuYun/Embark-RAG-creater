"use client";

import { useState } from "react";

import { AgentList } from "@/features/agent/components/agent-list";

export default function AgentsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-medium text-cyan-700">知识消费</p>
            <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
              专家 Agent
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              管理专家角色、知识边界、引用策略和发布前可用性检查。
            </p>
          </div>
          <a
            href="/agents/new"
            className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-cyan-800"
          >
            新建 Agent
          </a>
        </div>

        <div className="mb-4 rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-900">
          当前 Agent 使用通用 knowledgeScope 保存范围配置；知识库、RAG 和 LLM
          Wiki 接入完成后，可直接把 scope 转换给检索接口。
        </div>

        <AgentList
          refreshKey={refreshKey}
          onRefresh={() => setRefreshKey((key) => key + 1)}
        />
      </div>
    </main>
  );
}
