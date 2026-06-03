# 管理后台整体布局技术文档

## 1. 文档目标

本文档基于 `docs/lzh/specs/layoutspec.md`，用于指导管理后台整体布局的真实实现。当前阶段只定义布局架构、路由承载、导航数据结构、组件边界、状态流转和验收方式，不扩展真实用户系统、权限体系、多租户或复杂业务页面。

整体布局需要服务数据总览、知识库管理、个人文档、知识文档、专家 Agent 和专家对话等业务模块。业务页面只负责自身内容，通用导航、Header、Sidebar、页面容器和默认路由行为由布局层统一承担。

## 2. 当前项目基础

项目当前使用：

- Next.js 16 App Router，页面入口位于 `src/app/`。
- React 函数组件和 TypeScript。
- Tailwind CSS 与 shadcn/ui 风格组件。
- 图标统一使用 `lucide-react`，不新增图标适配层或中间组件。
- 当前布局组件位于 `src/components/layout/`。
- 当前页面已存在 `/dashboard`、`/knowledge-bases`、`/knowledge-bases/[id]`、`/documents`、`/agents`、`/agents/chat`、`/personaldoc` 等入口。

后续实现应遵循仓库现有结构，不新增无关 UI 库或状态管理库。

## 3. 布局目标

后台页面采用固定的管理后台骨架：

```text
RootLayout
└── AdminShell
    ├── AdminSidebar
    └── Main Area
        ├── AdminHeader
        └── Main Content
```

目标能力：

- 所有后台业务页面在统一布局内渲染。
- 左侧 Sidebar 展示一级导航，并支持展开/收缩。
- `知识库` 是可展开父级导航，展开后展示 `知识库管理` 和 `个人文档` 两个子导航。
- Sidebar 顶部展示平台标题 `AI知识库管理平台`。
- Header 左侧展示当前页面标题。
- Header 右侧预留用户信息区域。
- Main Content 渲染当前路由对应的页面内容。
- `/` 默认重定向到 `/knowledge-bases`。
- `/knowledge-bases/[id]` 仍在知识库管理上下文中展示，不新增侧边栏项。
- `/agents/chat` 作为 `专家对话` 一级导航，不归入 `专家 Agent` 的选中态。

## 4. 路由设计

| 页面 | 路由 | 当前阶段内容 |
| --- | --- | --- |
| 默认入口 | `/` | 重定向到 `/knowledge-bases` |
| 数据总览 | `/dashboard` | 数据总览页面 |
| 知识库管理 | `/knowledge-bases` | 展示知识库卡片列表 |
| 知识库详情 | `/knowledge-bases/[id]` | 在知识库管理布局上下文内展示具体知识库详情 |
| 个人文档 | `/personaldoc` | 知识库父级下的子路由，当前阶段可预留 |
| 知识文档 | `/documents` | 预留或已有知识文档页面 |
| 专家 Agent | `/agents` | 专家 Agent 管理页面 |
| 专家对话 | `/agents/chat` | 专家对话页面，作为一级导航 |

推荐实现方式：

- `src/app/page.tsx` 使用 Next.js `redirect("/knowledge-bases")` 实现默认重定向。
- `src/app/knowledge-bases/page.tsx` 作为知识库管理页面入口。
- `src/app/knowledge-bases/[id]/page.tsx` 作为知识库详情页面入口。
- `src/app/personaldoc/page.tsx` 作为个人文档页面入口。
- `src/app/documents/page.tsx` 作为知识文档页面入口。
- `src/app/agents/page.tsx` 作为专家 Agent 页面入口。
- `src/app/agents/chat/page.tsx` 作为专家对话页面入口。

当前阶段不强制迁移为 `src/app/(admin)/...` 路由组。若后续后台路由继续增多，可在独立重构中迁移。

## 5. 组件拆分

### 5.1 AdminShell

`AdminShell` 是后台页面统一容器，负责组合 Sidebar、Header 和 Main Content。

职责：

- 接收 `children`，渲染到 Main Content。
- 通过 `usePathname()` 获取当前路径。
- 根据当前 pathname 计算 Header 标题和 Sidebar 选中状态。
- 持有 `sidebarOpen` 本地状态。
- 将当前路径和展开状态传递给 `AdminSidebar`。
- 将当前页面标题和切换函数传递给 `AdminHeader`。
- 控制整体布局尺寸、背景、滚动区域和响应式行为。

建议接口：

```ts
type AdminShellProps = {
  children: React.ReactNode;
};
```

由于需要读取当前路由并维护侧边栏展开/收缩状态，`AdminShell` 应作为 Client Component。页面本身可以保持 Server Component，除非业务内容需要客户端交互。

### 5.2 AdminSidebar

`AdminSidebar` 负责展示后台导航、父子菜单、选中态和收缩态。

职责：

- 顶部展示平台品牌区，图标使用 `LibraryBig`，标题为 `AI知识库管理平台`。
- 展示一级导航：`数据总览`、`知识库`、`知识文档`、`专家 Agent`、`专家对话`。
- 将 `知识库` 渲染为可展开父级项。
- 点击 `知识库` 父级项时跳转到 `/knowledge-bases`。
- 当 pathname 位于 `/knowledge-bases`、`/knowledge-bases/[id]` 或 `/personaldoc` 时，展开 `知识库` 子导航。
- 展开后展示 `知识库管理` 和 `个人文档` 两个子导航。
- 根据当前 pathname 标记父级和子级选中状态。
- 根据 `sidebarOpen` 切换展开/收缩显示。

建议接口：

```ts
type AdminSidebarProps = {
  sidebarOpen: boolean;
  pathname: string;
};
```

收缩态建议：

- 展开宽度使用现有 `w-60`，收缩宽度使用现有 `w-[72px]`。
- 展开时显示品牌图标、平台标题、导航图标和导航名称。
- 收缩时只显示一级导航图标，隐藏平台标题、一级导航名称和子导航文本。
- 收缩态下仍应能点击一级导航。
- 收缩态下可以不展开子导航列表，但不能丢失当前路由选中态。

### 5.3 AdminHeader

`AdminHeader` 负责展示当前页面标题、侧边栏切换按钮和用户信息占位。

职责：

- 左侧显示 Sidebar 收缩/展开按钮。
- 左侧显示当前页面标题。
- 右侧显示用户信息占位区域。
- 不读取真实用户数据。
- 不实现登录、退出、设置页、权限入口等真实逻辑。

用户信息占位建议包含：

- 圆形头像占位。
- 用户名占位，例如 `管理员`。
- 可选的设置入口图标或按钮，但不绑定真实功能。

### 5.4 Main Content

`Main Content` 负责承载业务页面。

职责：

- 提供统一内边距和背景。
- 保持页面内容区域可滚动。
- 不直接写入知识库、文档、Agent 的复杂业务逻辑。
- 业务页面内部自行实现搜索、筛选、表格、卡片、空状态等功能。

知识库详情承载规则：

- `/knowledge-bases` 展示知识库卡片列表。
- 点击知识库卡片进入 `/knowledge-bases/[id]`。
- `/knowledge-bases/[id]` 不脱离 AdminShell。
- 详情页在 Main Content 内替换卡片列表区域。
- 详情页不新增侧边栏项，使用页面内部返回按钮回到 `/knowledge-bases`。

## 6. 导航数据模型

导航配置应集中在 `src/components/layout/admin-nav.ts`，Header 标题和 Sidebar 渲染共用同一份配置。

建议类型：

```ts
import type { LucideIcon } from "lucide-react";

export type AdminNavChildItem = {
  label: string;
  title: string;
  href: string;
  Icon: LucideIcon;
  match?: "exact" | "prefix";
  activePatterns?: string[];
};

export type AdminNavItem = {
  label: string;
  title: string;
  href: string;
  Icon: LucideIcon;
  match?: "exact" | "prefix";
  activePatterns?: string[];
  children?: AdminNavChildItem[];
};
```

建议配置：

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
```

注意：

- `专家对话` 必须放在 `专家 Agent` 之外，作为一级导航。
- 如果使用线性查找标题，应优先匹配更具体路径，避免 `/agents/chat` 被 `/agents` 抢先命中。
- `专家 Agent` 建议使用 `match: "exact"`，确保 `/agents/chat` 不选中它。
- `知识库管理` 使用 `match: "prefix"`，让 `/knowledge-bases/[id]` 归属到该子导航。

## 7. 路由匹配与标题规则

建议在 `admin-nav.ts` 中实现集中式匹配函数。

```ts
function matchHref(pathname: string, href: string, match: "exact" | "prefix" = "prefix") {
  if (match === "exact") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
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

export function isNavChildActive(item: AdminNavChildItem, pathname: string) {
  const patternActive = item.activePatterns?.some((pattern) =>
    matchHref(pathname, pattern)
  );

  return patternActive ?? matchHref(pathname, item.href, item.match);
}
```

Header 标题解析建议：

```ts
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

标题规则：

- pathname 命中 `/knowledge-bases` 或 `/knowledge-bases/[id]` 时，Header 显示 `知识库管理`。
- pathname 命中 `/personaldoc` 时，Header 显示 `个人文档`。
- pathname 命中 `/documents` 时，Header 显示 `知识文档`。
- pathname 命中 `/agents` 时，Header 显示 `专家 Agent`。
- pathname 命中 `/agents/chat` 时，Header 显示 `专家对话`。
- 未命中时显示兜底标题 `知识库管理`，但正常路由应尽量避免进入未知状态。

## 8. 侧边栏展开状态

当前布局不使用全局状态管理侧边栏展开/收缩。

侧边栏状态应维护在布局组件本地：

```ts
const [sidebarOpen, setSidebarOpen] = React.useState(true);
```

职责分配：

- `AdminShell` 持有 `sidebarOpen` 状态。
- `AdminShell` 定义 `onToggleSidebar`。
- `AdminSidebar` 通过 props 接收当前展开状态和 pathname。
- `AdminHeader` 接收当前展开状态和切换回调，用于在页面标题旁展示 Sidebar 收缩/展开按钮。

建议接口：

```ts
type AdminHeaderProps = {
  title: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};
```

收缩/展开按钮规则：

- 按钮放在 Header 左侧页面标题旁边。
- `sidebarOpen` 为 `true` 时，按钮图标使用 `PanelRightOpen`。
- `sidebarOpen` 为 `false` 时，按钮图标使用 `PanelRightClose`。
- 按钮只负责切换本地 `sidebarOpen` 状态，不触发路由跳转。

约束：

- 不要把 `sidebarOpen` 写入 Zustand。
- 不要把 Header 标题写入全局 store，标题可由当前路由派生。
- 不要把预留页面占位状态写入全局 store。

## 9. 视觉与交互约定

后台页面应保持清晰、简洁、信息密度适中。

建议布局：

- 页面高度使用 `min-h-screen`。
- Sidebar 固定在左侧，与主区域形成横向布局。
- Header 固定在主区域顶部，维持统一高度。
- Main Content 填充剩余空间并允许内容滚动。
- 导航选中状态应通过背景、文字颜色或左侧强调条明确表达。
- 知识库父级展开时，子导航应在父级下方缩进展示。
- Hover、Focus、Disabled 等状态沿用 shadcn/ui 与 Tailwind 现有风格。
- 按钮、导航交互和占位区域优先使用 shadcn/ui 风格。
- 图标尺寸应稳定，避免收缩/展开时引发布局跳动。

响应式建议：

- 桌面端默认展开 Sidebar。
- 第一版只保证桌面端完整可用，移动端不作为验收重点。
- 小屏端可以复用收缩态，不强制实现抽屉式移动端导航。

## 10. 预留页面设计

`/personaldoc` 和 `/documents` 当前阶段可以作为预留页面；如果现有页面已实现部分内容，应保留现有内容并确保在 AdminShell 内渲染。

要求：

- 必须渲染在 AdminShell 内。
- Header 标题必须与页面一致。
- 主体区域展示简洁占位内容或已有业务内容。
- 不为预留页面新增真实业务数据、接口请求、复杂表单或权限逻辑。

占位内容建议：

- `个人文档`：提示后续用于管理个人导入、上传和整理的文档。
- `知识文档`：提示后续用于管理知识文档、导入内容和查看解析结果。

占位内容应短而明确，不做营销式介绍页。

## 11. 暂不实现范围

当前阶段明确不实现：

- 真实用户系统。
- 真实头像数据。
- 登录、退出、鉴权和权限控制。
- 多租户隔离。
- 复杂面包屑。
- 个人文档的完整业务能力。
- 除知识库父级外的复杂多级菜单。
- 文档和 Agent 的真实 CRUD 扩展。
- API 联调。
- 数据库 schema 调整。

若后续业务模块需要这些能力，应在对应模块 spec 中单独设计。

## 12. 建议文件落点

后续真实实现时，建议新增或调整以下文件：

```text
src/app/page.tsx
src/app/dashboard/page.tsx
src/app/knowledge-bases/page.tsx
src/app/knowledge-bases/[id]/page.tsx
src/app/personaldoc/page.tsx
src/app/documents/page.tsx
src/app/agents/page.tsx
src/app/agents/chat/page.tsx
src/components/layout/admin-shell.tsx
src/components/layout/admin-sidebar.tsx
src/components/layout/admin-header.tsx
src/components/layout/admin-nav.ts
```

说明：

- `admin-nav.ts` 存放导航、子导航、页面标题映射和路由匹配函数。
- `admin-shell.tsx` 组合整体布局并持有 Sidebar 展开状态。
- `admin-sidebar.tsx` 处理导航、父子菜单、图标、展开/收缩显示和选中状态。
- `admin-header.tsx` 处理标题、Sidebar 切换按钮与用户信息占位。
- 业务页面不重复实现 Header 和 Sidebar。

如果实际实现时发现组件粒度过细，也可以合并为更少文件，但应保持导航配置集中、布局职责清晰。

## 13. 数据流与渲染流程

进入知识库管理的推荐流程：

```text
用户访问 /
→ src/app/page.tsx 重定向到 /knowledge-bases
→ /knowledge-bases/page.tsx 渲染页面内容
→ 页面内容包裹在 AdminShell 内
→ AdminShell 根据 pathname 解析当前页面元信息
→ Header 显示 知识库管理
→ Sidebar 展开 知识库 父级
→ Sidebar 高亮 知识库管理 子项
→ Main Content 显示知识库卡片列表
```

进入知识库详情的推荐流程：

```text
用户点击知识库卡片
→ 跳转到 /knowledge-bases/[id]
→ AdminShell 根据 pathname 解析当前页面元信息
→ Header 显示 知识库管理
→ Sidebar 展开 知识库 父级
→ Sidebar 将 知识库管理 视为当前上下文
→ Main Content 从卡片列表切换为知识库详情
→ 用户通过详情页内部返回按钮回到 /knowledge-bases
```

进入专家对话的推荐流程：

```text
用户点击 专家对话
→ Link 跳转到 /agents/chat
→ AdminShell 获取 pathname=/agents/chat
→ Header 标题更新为 专家对话
→ Sidebar 高亮 专家对话
→ Sidebar 不高亮 专家 Agent
→ Main Content 显示专家对话页面
```

进入个人文档的推荐流程：

```text
用户点击 知识库 父级下的 个人文档
→ Link 跳转到 /personaldoc
→ AdminShell 获取 pathname=/personaldoc
→ Header 标题更新为 个人文档
→ Sidebar 展开 知识库 父级
→ Sidebar 高亮 个人文档 子项
→ Main Content 显示个人文档页面
```

收缩 Sidebar 的推荐流程：

```text
用户点击收缩按钮
→ Header 调用 onToggleSidebar()
→ AdminShell 本地 useState 更新 sidebarOpen
→ Sidebar 根据 sidebarOpen 切换宽度和文字显示
→ 展开时显示图标和名称
→ 收缩时只显示一级导航图标
→ Main Area 自动占据剩余空间
```

## 14. 错误与边界处理

当前阶段布局层需要处理的边界：

- 未知路由不在本布局 spec 范围内，可由 Next.js 默认 404 处理。
- Header 标题未匹配时应有兜底标题，避免页面出现空标题。
- Sidebar 收缩状态不应影响一级导航可点击性。
- Sidebar 收缩时不得显示导航文字或平台标题，只保留一级导航图标。
- `/agents/chat` 不得被 `/agents` 的前缀匹配错误选中。
- `/knowledge-bases/[id]` 不得在 Sidebar 中产生独立导航项。
- 用户信息区域只是占位，不应触发真实请求或报错。
- 页面内容为空时应展示占位，而不是空白主区域。

## 15. 验收标准

后续实现完成后，应按以下标准检查：

1. 访问 `/` 后能够重定向到 `/knowledge-bases`。
2. `/dashboard`、`/knowledge-bases`、`/knowledge-bases/[id]`、`/personaldoc`、`/documents`、`/agents`、`/agents/chat` 均可在 AdminShell 内访问。
3. 页面包含 Header、Sidebar、Main Content 三段结构。
4. Sidebar 包含 `数据总览`、`知识库`、`知识文档`、`专家 Agent`、`专家对话` 五个一级导航。
5. `专家对话` 路由为 `/agents/chat`，icon 使用 `MessageSquareMore`。
6. `知识库` 是可展开父级导航，点击父级默认进入 `/knowledge-bases`。
7. `知识库` 展开后展示 `知识库管理` 和 `个人文档` 两个子导航。
8. `知识库管理` 子导航路由为 `/knowledge-bases`，icon 使用 `SquareLibrary`。
9. `个人文档` 子导航路由为 `/personaldoc`，icon 使用 `NotebookTabs`。
10. 进入 `/knowledge-bases` 时，Header 显示 `知识库管理`，Sidebar 展开 `知识库` 并选中 `知识库管理`。
11. 进入 `/knowledge-bases/[id]` 时，Header 显示 `知识库管理`，Sidebar 不新增详情页导航项。
12. 进入 `/personaldoc` 时，Header 显示 `个人文档`，Sidebar 展开 `知识库` 并选中 `个人文档`。
13. 进入 `/agents` 时，Header 显示 `专家 Agent`，Sidebar 选中 `专家 Agent`。
14. 进入 `/agents/chat` 时，Header 显示 `专家对话`，Sidebar 选中 `专家对话`，不选中 `专家 Agent`。
15. Sidebar 支持展开和收缩。
16. Sidebar 收缩后一级导航仍可点击。
17. Sidebar 顶部展开时显示 `LibraryBig` 图标和 `AI知识库管理平台` 标题。
18. Sidebar 收缩时只显示图标，不显示平台标题和导航名称。
19. Sidebar 收缩/展开按钮位于 Header 左侧页面标题旁边。
20. Sidebar 打开状态时，收缩/展开按钮图标使用 `PanelRightOpen`。
21. Sidebar 关闭状态时，收缩/展开按钮图标使用 `PanelRightClose`。
22. Header 右侧保留用户信息占位区域。
23. `/knowledge-bases/[id]` 通过 Main Content 替换知识库列表区域展示详情，并通过页面内部返回按钮回到 `/knowledge-bases`。
24. 第一版只验收桌面端布局，移动端不作为验收重点。
25. 实现不修改 Prisma schema，不接入真实鉴权。

## 16. 验证建议

真实实现完成后建议运行：

```bash
npm run lint
npm run build
```

人工检查建议：

- 在浏览器访问 `/`，确认跳转到 `/knowledge-bases`。
- 依次点击 Sidebar 一级导航，确认路由、Header 标题和选中状态同步变化。
- 点击 `知识库`，确认默认进入 `/knowledge-bases`，并展开 `知识库管理`、`个人文档` 子导航。
- 点击知识库卡片进入 `/knowledge-bases/[id]`，确认页面仍在 AdminShell 内，且 Sidebar 不出现详情页导航项。
- 点击 `个人文档`，确认进入 `/personaldoc`，Header 显示 `个人文档`。
- 点击 `专家对话`，确认进入 `/agents/chat`，Header 显示 `专家对话`，Sidebar 不选中 `专家 Agent`。
- 点击 Header 标题旁的 Sidebar 收缩/展开按钮，确认打开状态使用 `PanelRightOpen`，关闭状态使用 `PanelRightClose`。
- 确认 Sidebar 展开时显示图标和名称，收缩时只显示一级图标，且布局没有重叠或不可点击区域。

如果项目尚未配置自动化测试，不应声称测试已通过。验证失败时应记录失败命令和关键错误。
