# 管理后台布局调整变更任务

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/lzh/specs/layoutspec.md` 和 `docs/lzh/tecdoc/layout.md` 调整管理后台侧边栏、标题匹配和路由承载关系。

**Architecture:** 继续沿用现有 `AdminShell`、`AdminHeader`、`AdminSidebar`、`admin-nav.ts` 的布局边界。把导航配置升级为支持一级导航、知识库子导航、精确/前缀匹配和统一标题解析，由 `AdminSidebar` 负责渲染父子菜单。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Tailwind CSS、lucide-react。

---

## 0. 变更范围

本次只处理管理后台布局导航相关改动。

需要修改：

- `src/components/layout/admin-nav.ts`
- `src/components/layout/admin-sidebar.tsx`
- `src/app/personaldoc/page.tsx`

需要检查但不一定修改：

- `src/components/layout/admin-shell.tsx`
- `src/components/layout/admin-header.tsx`
- `src/app/page.tsx`
- `src/app/knowledge-bases/page.tsx`
- `src/app/knowledge-bases/[id]/page.tsx`
- `src/app/agents/chat/page.tsx`

不修改：

- Prisma schema
- 数据库迁移
- API Route
- 鉴权、权限、多租户逻辑
- `src/generated/prisma/`

---

## Task 1: 升级导航配置和路由匹配

**Files:**

- Modify: `src/components/layout/admin-nav.ts`

- [ ] **Step 1: 替换导航类型、配置和匹配函数**

将 `src/components/layout/admin-nav.ts` 更新为以下结构：

```ts
import {
  Bot,
  BrainCircuit,
  FolderKanban,
  LayoutDashboard,
  MessageSquareMore,
  NotebookTabs,
  SquareLibrary,
  type LucideIcon,
} from "lucide-react";

export type NavMatchMode = "exact" | "prefix";

export type AdminNavChildItem = {
  label: string;
  title: string;
  href: string;
  Icon: LucideIcon;
  match?: NavMatchMode;
  activePatterns?: string[];
};

export type AdminNavItem = {
  label: string;
  title: string;
  href: string;
  Icon: LucideIcon;
  match?: NavMatchMode;
  activePatterns?: string[];
  children?: AdminNavChildItem[];
};

export const adminNavItems = [
  {
    label: "数据总览",
    title: "Dashboard 数据总览",
    href: "/dashboard",
    Icon: LayoutDashboard,
    match: "prefix",
  },
  {
    label: "知识库",
    title: "知识库管理",
    href: "/knowledge-bases",
    Icon: BrainCircuit,
    activePatterns: ["/knowledge-bases", "/personaldoc"],
    children: [
      {
        label: "知识库管理",
        title: "知识库管理",
        href: "/knowledge-bases",
        Icon: SquareLibrary,
        match: "prefix",
      },
      {
        label: "个人文档",
        title: "个人文档",
        href: "/personaldoc",
        Icon: NotebookTabs,
        match: "prefix",
      },
    ],
  },
  {
    label: "知识文档",
    title: "知识文档",
    href: "/documents",
    Icon: FolderKanban,
    match: "prefix",
  },
  {
    label: "专家 Agent",
    title: "专家 Agent",
    href: "/agents",
    Icon: Bot,
    match: "exact",
  },
  {
    label: "专家对话",
    title: "专家对话",
    href: "/agents/chat",
    Icon: MessageSquareMore,
    match: "prefix",
  },
] satisfies AdminNavItem[];

export function matchHref(
  pathname: string,
  href: string,
  match: NavMatchMode = "prefix"
) {
  if (match === "exact") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavChildActive(
  item: AdminNavChildItem,
  pathname: string
) {
  const patternActive = item.activePatterns?.some((pattern) =>
    matchHref(pathname, pattern)
  );

  return patternActive ?? matchHref(pathname, item.href, item.match);
}

export function isNavItemActive(item: AdminNavItem, pathname: string) {
  const selfActive =
    item.activePatterns?.some((pattern) => matchHref(pathname, pattern)) ??
    matchHref(pathname, item.href, item.match);

  const childActive = item.children?.some((child) =>
    isNavChildActive(child, pathname)
  );

  return Boolean(selfActive || childActive);
}

export function getAdminPageTitle(pathname: string) {
  for (const item of adminNavItems) {
    for (const child of item.children ?? []) {
      if (isNavChildActive(child, pathname)) {
        return child.title;
      }
    }
  }

  const activeItem = adminNavItems.find((item) =>
    matchHref(pathname, item.href, item.match)
  );

  return activeItem?.title ?? "知识库管理";
}
```

- [ ] **Step 2: 运行 TypeScript/ESLint 快速检查**

Run:

```bash
npm run lint
```

Expected:

```text
> rag-creater@0.1.0 lint
> eslint
```

命令应以 exit code 0 结束。若失败，先修复与 `src/components/layout/admin-nav.ts` 相关的类型或 lint 错误；不要顺手修复无关模块。

- [ ] **Step 3: 提交本任务**

```bash
git add src/components/layout/admin-nav.ts
git commit -m "feat: update admin navigation model"
```

---

## Task 2: 改造侧边栏父子导航渲染

**Files:**

- Modify: `src/components/layout/admin-sidebar.tsx`

- [ ] **Step 1: 更新导入**

将导入更新为：

```ts
import Link from "next/link";
import { LibraryBig } from "lucide-react";

import {
  adminNavItems,
  isNavChildActive,
  isNavItemActive,
} from "@/components/layout/admin-nav";
import { cn } from "@/lib/utils";
```

- [ ] **Step 2: 替换 `<nav>` 内部渲染逻辑**

保留现有 `<aside>`、品牌区和宽度 class。将 `<nav className="flex flex-1 flex-col gap-1 px-3 py-4">...</nav>` 替换为：

```tsx
<nav className="flex flex-1 flex-col gap-1 px-3 py-4">
  {adminNavItems.map((item) => {
    const active = isNavItemActive(item, pathname);
    const Icon = item.Icon;
    const expanded = sidebarOpen && active && item.children?.length;

    return (
      <div className="flex flex-col gap-1" key={item.href}>
        <Link
          aria-current={active && !item.children ? "page" : undefined}
          className={cn(
            "flex h-9 items-center rounded-md text-sm font-medium transition-colors",
            sidebarOpen ? "justify-start gap-2 px-3" : "justify-center px-0",
            active
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
          href={item.href}
          title={sidebarOpen ? undefined : item.label}
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {sidebarOpen ? <span className="truncate">{item.label}</span> : null}
        </Link>

        {expanded ? (
          <div className="ml-4 flex flex-col gap-1 border-l border-sidebar-border pl-2">
            {item.children?.map((child) => {
              const childActive = isNavChildActive(child, pathname);
              const ChildIcon = child.Icon;

              return (
                <Link
                  aria-current={childActive ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors",
                    childActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                  href={child.href}
                  key={child.href}
                >
                  <ChildIcon aria-hidden="true" className="size-4 shrink-0" />
                  <span className="truncate">{child.label}</span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  })}
</nav>
```

- [ ] **Step 3: 检查收缩态行为**

Run:

```bash
npm run lint
```

Expected: exit code 0。

Manual check after dev server starts in Task 5:

- Sidebar 展开时，`知识库` 下能看到 `知识库管理` 和 `个人文档`。
- Sidebar 收缩时，只显示一级导航 icon。
- `/agents/chat` 只选中 `专家对话`，不选中 `专家 Agent`。

- [ ] **Step 4: 提交本任务**

```bash
git add src/components/layout/admin-sidebar.tsx
git commit -m "feat: render admin sidebar children"
```

---

## Task 3: 确认个人文档预留页在布局内可用

**Files:**

- Modify if needed: `src/app/personaldoc/page.tsx`

- [ ] **Step 1: 检查现有页面**

Run:

```bash
Get-Content -Encoding utf8 -Path src/app/personaldoc/page.tsx
```

Expected: 文件存在，导出默认 React 页面组件。

- [ ] **Step 2: 若页面不是可用预留页，则替换为以下最小实现**

仅在现有页面缺失、报错或明显不符合预留页要求时修改：

```tsx
export default function PersonalDocPage() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">个人文档</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          用于后续管理个人导入、上传和整理的文档。
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 检查页面是否不引入额外业务依赖**

确认 `src/app/personaldoc/page.tsx` 不新增真实 API 请求、Prisma 调用、鉴权逻辑或全局状态。

- [ ] **Step 4: 提交本任务**

如果文件有改动：

```bash
git add src/app/personaldoc/page.tsx
git commit -m "feat: add personal document placeholder"
```

如果文件无需改动：

```bash
git status --short
```

Expected: 没有与 `src/app/personaldoc/page.tsx` 相关的未提交改动。

---

## Task 4: 检查知识库详情页布局归属

**Files:**

- Inspect: `src/app/knowledge-bases/[id]/page.tsx`
- Inspect: `src/features/knowledge-bases/index.tsx`

- [ ] **Step 1: 确认知识库卡片跳转到详情页**

Run:

```bash
rg "knowledge-bases/\\$\\{|/knowledge-bases/\\$\\{" src/features/knowledge-bases src/app/knowledge-bases
```

Expected: 能看到从知识库列表跳转到 `/knowledge-bases/${item.id}` 的代码。

- [ ] **Step 2: 确认详情页内部有返回列表按钮**

Run:

```bash
rg "router.push\\(\"/knowledge-bases\"\\)|返回" src/app/knowledge-bases/[id]/page.tsx
```

Expected: 能看到返回 `/knowledge-bases` 的按钮或逻辑。

- [ ] **Step 3: 不为详情页新增侧边栏项**

确认 `src/components/layout/admin-nav.ts` 中没有 `/knowledge-bases/[id]` 独立导航项。详情页应由 `知识库管理` 子项的 `match: "prefix"` 归属。

- [ ] **Step 4: 若 Task 4 仅检查无改动，不提交**

Run:

```bash
git status --short
```

Expected: Task 4 不产生文件改动。

---

## Task 5: 构建验证和人工验收

**Files:**

- No source edits expected.

- [ ] **Step 1: 运行 lint**

Run:

```bash
npm run lint
```

Expected: exit code 0。

- [ ] **Step 2: 运行 build**

Run:

```bash
npm run build
```

Expected:

```text
✓ Compiled successfully
Finished TypeScript
```

命令应以 exit code 0 结束。

- [ ] **Step 3: 启动开发服务器**

Run:

```bash
npm run dev
```

Expected: Next.js dev server 启动并输出本地访问地址。若默认端口被占用，使用 Next.js 提示的可用端口。

- [ ] **Step 4: 手工检查路由和标题**

在浏览器检查：

- 访问 `/`，确认跳转到 `/knowledge-bases`。
- 访问 `/knowledge-bases`，Header 显示 `知识库管理`，Sidebar 展开 `知识库` 并选中 `知识库管理`。
- 访问 `/knowledge-bases/[id]`，Header 显示 `知识库管理`，Sidebar 不出现详情页独立导航项。
- 访问 `/personaldoc`，Header 显示 `个人文档`，Sidebar 展开 `知识库` 并选中 `个人文档`。
- 访问 `/agents`，Header 显示 `专家 Agent`，Sidebar 选中 `专家 Agent`。
- 访问 `/agents/chat`，Header 显示 `专家对话`，Sidebar 选中 `专家对话`，不选中 `专家 Agent`。

- [ ] **Step 5: 手工检查收缩态**

在浏览器检查：

- 点击 Header 左侧收缩按钮。
- Sidebar 展开时显示平台标题、一级导航文字和知识库子导航。
- Sidebar 收缩时隐藏平台标题、导航文字和子导航文本，只保留一级导航 icon。
- 收缩态一级导航仍可点击。
- 页面内容和 Header 不发生明显重叠。

- [ ] **Step 6: 最终状态检查**

Run:

```bash
git status --short
```

Expected: 只包含本次有意修改的文件，且不包含 `.next/`、`node_modules/`、`src/generated/prisma/` 等生成产物。

---

## 任务覆盖自检

本计划覆盖以下要求：

- `专家对话` 是一级导航，路由 `/agents/chat`，icon `MessageSquareMore`。
- `知识库` 是可展开父级导航，默认跳转 `/knowledge-bases`。
- `知识库管理` 子导航路由 `/knowledge-bases`，icon `SquareLibrary`。
- `个人文档` 子导航路由 `/personaldoc`，icon `NotebookTabs`。
- `/knowledge-bases/[id]` 归属 `知识库管理`，不新增侧边栏项。
- `/agents/chat` 不被 `/agents` 错误匹配。
- Header 标题由当前路由派生。
- Sidebar 展开/收缩仍由 `AdminShell` 本地状态控制。
- 不修改 Prisma schema，不接入真实鉴权。
