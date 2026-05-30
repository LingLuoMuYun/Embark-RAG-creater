export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
        <p className="mb-4 text-sm font-medium text-zinc-500">RAG Creater</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight">
          全栈 RAG 应用开发起点
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-600">
          当前项目已按 Next.js App Router 结构整理。后续页面入口放在
          <code className="mx-1 rounded bg-zinc-100 px-1.5 py-0.5 text-sm">
            src/app
          </code>
          ，业务模块放在
          <code className="mx-1 rounded bg-zinc-100 px-1.5 py-0.5 text-sm">
            src/features
          </code>
          。
        </p>
      </main>
    </div>
  );
}
