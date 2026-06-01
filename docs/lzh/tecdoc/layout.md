# 管理后台整体布局技术文档

## 1. 文档目标

本文档基于 `docs/specs/layoutspec.md`，用于指导后续管理后台整体布局的真实实现。当前阶段只定义布局架构、路由承载、组件边界、状态流转和验收方式，不在本文档中扩展真实用户系统、权限体系、多租户或复杂业务页面。

整体布局需要服务后续知识库管理、知识文档、专家 Agent 等业务模块。业务页面只负责自身内容，通用导航、Header、Sidebar、页面容器和默认路由行为由布局层统一承担。

## 2. 当前项目基础

项目当前使用：

- Next.js 16 App Router，页面入口位于 `src/app/`。
- React 函数组件和 TypeScript。
- Tailwind CSS 与 shadcn/ui 风格组件。
- 后台布局 UI 风格使用 shadcn/ui 体系，优先复用 `src/components/ui/` 下已有组件。
- 图标统一使用 Lucide React 组件。当前项目 `package.json` 中已有 `lucide-react` 依赖，后续实现直接从 `lucide-react` 导入图标组件，不新增图标适配层或中间组件。
- 当前 `src/components/ui/button.tsx` 已存在，可优先用于侧边栏收缩按钮、导航按钮等基础交互。

后续实现应遵循仓库现有结构，不新增无关 UI 库或状态管理库。

## 3. 布局目标

后台页面采用固定的管理后台骨架：

```text
RootLayout
└── AdminShell
    ├── Sidebar
    └── Main Area
        ├── Header
        └── Main Content
```

目标能力：

- 所有后台业务页面在统一布局内渲染。
- 左侧 Sidebar 展示一级导航，并支持展开/收缩。
- Sidebar 顶部展示平台标题 `AI知识库管理平台`。
- Header 左侧展示当前页面标题。
- Header 右侧预留用户信息区域。
- Main Content 渲染当前路由对应的页面内容。
- `/` 默认重定向到 `/knowledge-bases`。
- `/knowledge-bases`、`/documents`、`/agents` 三个路由可访问。

## 4. 路由设计

| 页面       | 路由               | 当前阶段内容                                   |
| ---------- | ------------------ | ---------------------------------------------- |
| 默认入口   | `/`                | 重定向到 `/knowledge-bases`                    |
| 知识库管理 | `/knowledge-bases` | 展示知识库管理页面内容，后续承载知识库卡片列表 |
| 知识文档   | `/documents`       | 预留页面，占位内容                             |
| 专家 Agent | `/agents`          | 预留页面，占位内容                             |

推荐实现方式：

- `src/app/page.tsx` 使用 Next.js `redirect("/knowledge-bases")` 实现默认重定向。
- `src/app/knowledge-bases/page.tsx` 作为知识库管理页面入口。
- `src/app/documents/page.tsx` 作为知识文档预留页面入口。
- `src/app/agents/page.tsx` 作为专家 Agent 预留页面入口。
- 本次布局实现以本文档定义的路由为准，不需要兼容或保留历史命名页面路径。

当前项目的路由范围较小，暂不建议使用路由组强制改造目录结构。若后续后台路由增多，可再迁移为 `src/app/(admin)/...` 路由组。

## 5. 组件拆分

### 5.1 AdminShell

`AdminShell` 是后台页面统一容器，负责组合 Sidebar、Header 和 Main Content。

建议职责：

- 接收 `children`，渲染到 Main Content。
- 根据当前 pathname 计算当前页面元信息。
- 将当前页面标题传递给 Header。
- 控制整体布局尺寸、背景、滚动区域和响应式行为。

建议接口：

```ts
type AdminShellProps = {
  children: React.ReactNode;
};
```

由于需要读取当前路由并使用本地 `useState` 维护侧边栏展开/收缩状态，`AdminShell` 建议作为 Client Component。页面本身可以保持 Server Component，除非业务内容需要客户端交互。

### 5.2 Sidebar

`Sidebar` 负责展示后台一级导航。

导航项固定为：

| 标题 | 路由 | Header 标题 | lucide-react 图标组件 |
| --- | --- | --- | --- |
| 知识库 | `/knowledge-bases` | `知识库管理` | `BrainCircuit` |
| 知识文档 | `/documents` | `知识文档` | `FolderKanban` |
| 专家 Agent | `/agents` | `专家 Agent` | `Bot` |

建议职责：

- 顶部展示平台品牌区，图标使用 `lucide-react` 的 `LibraryBig`，标题为 `AI知识库管理平台`。
- 展示三个一级导航项。
- 点击导航项时使用 Next.js `Link` 跳转。
- 根据当前 pathname 标记选中状态。
- 根据 `sidebarOpen` 切换展开/收缩显示。
- 通过 props 接收 `sidebarOpen`，不直接读取全局状态，也不负责触发收缩/展开。

收缩态建议：

- 侧边栏宽度缩小，例如展开为 `240px`，收缩为 `72px`。
- 展开时显示品牌图标、平台标题、导航图标和导航名称。
- 收缩时只显示图标，隐藏平台标题和导航名称。
- 导航项仍然可点击。
- 收缩态下品牌区只保留 `LibraryBig` 图标。
- 所有图标直接使用 `lucide-react` 组件，不使用自定义图标适配组件，也不使用文字首字母替代。

### 5.3 Header

`Header` 负责展示当前页面标题和用户信息占位。

建议职责：

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

建议职责：

- 提供统一内边距和背景。
- 保持页面内容区域可滚动。
- 不直接写入知识库、文档、Agent 的复杂业务逻辑。
- 业务页面内部自行实现搜索、筛选、表格、卡片、空状态等功能。

当前阶段：

- `/knowledge-bases` 先展示基础占位内容，只验证布局、路由和页面承载能力。
- 真实知识库列表、知识库卡片、接口请求和数据加载留给后续知识库模块实现。
- `/documents` 和 `/agents` 仅展示简洁占位，不接入 API、表单或真实数据。

## 6. 页面标题映射

建议在布局组件附近定义集中式页面元信息，避免 Header 与 Sidebar 各自维护一份标题配置。

```ts
const adminNavItems = [
  {
    label: "知识库",
    title: "知识库管理",
    href: "/knowledge-bases",
    Icon: BrainCircuit,
  },
  {
    label: "知识文档",
    title: "知识文档",
    href: "/documents",
    Icon: FolderKanban,
  },
  {
    label: "专家 Agent",
    title: "专家 Agent",
    href: "/agents",
    Icon: Bot,
  },
];
```

示例导入：

```ts
import {
  Bot,
  BrainCircuit,
  FolderKanban,
  LibraryBig,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
```

标题规则：

- pathname 命中 `/knowledge-bases` 时，Header 显示 `知识库管理`。
- pathname 命中 `/documents` 时，Header 显示 `知识文档`。
- pathname 命中 `/agents` 时，Header 显示 `专家 Agent`。
- 未命中时可显示默认标题 `知识库管理`，但正常路由应尽量避免进入未知状态。

若后续出现详情页，例如 `/knowledge-bases/[id]`，可使用前缀匹配将其归属到知识库导航项。

## 7. 侧边栏状态

当前布局不使用全局状态管理侧边栏展开/收缩。

侧边栏状态应维护在布局组件本地：

```ts
const [sidebarOpen, setSidebarOpen] = useState(true);
```

建议职责分配：

- `AdminShell` 持有 `sidebarOpen` 状态。
- `AdminShell` 定义 `toggleSidebar` 或直接向下传递 `setSidebarOpen`。
- `Sidebar` 通过 props 接收当前展开状态和切换回调。
- `Header` 接收当前展开状态和切换回调，用于在页面标题旁展示 Sidebar 收缩/展开按钮。

建议接口：

```ts
type AdminSidebarProps = {
  sidebarOpen: boolean;
};

type AdminHeaderProps = {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};
```

收缩/展开按钮规则：

- 按钮放在 Header 左侧页面标题旁边。
- `sidebarOpen` 为 `true` 时，按钮图标使用 `lucide-react` 的 `PanelRightOpen`。
- `sidebarOpen` 为 `false` 时，按钮图标使用 `lucide-react` 的 `PanelRightClose`。
- 按钮只负责切换本地 `sidebarOpen` 状态，不触发路由跳转。

约束：

- 不要把 `sidebarOpen` 写入 Zustand。
- 不要把 Header 标题写入全局 store，标题可由当前路由派生。
- 不要把预留页面占位状态写入全局 store。

## 8. 视觉与交互约定

后台页面应保持清晰、简洁、信息密度适中。

建议布局：

- 页面高度使用 `min-h-screen`。
- Sidebar 固定在左侧，与主区域形成横向布局。
- Header 固定在主区域顶部，维持统一高度。
- Main Content 填充剩余空间并允许内容滚动。
- 导航选中状态应通过背景、文字颜色或左侧强调条明确表达。
- Hover、Focus、Disabled 等状态沿用 shadcn/ui 与 Tailwind 现有风格。
- 按钮、导航交互和占位区域优先使用 shadcn/ui 风格，保持圆角、边框、颜色和状态表达一致。
- 图标尺寸应稳定，避免收缩/展开时引发布局跳动。

响应式建议：

- 桌面端默认展开 Sidebar。
- 第一版只保证桌面端完整可用，移动端不作为验收重点。
- 小屏端可以复用收缩态，不强制实现抽屉式移动端导航。

## 9. 预留页面设计

`/documents` 和 `/agents` 当前阶段为预留页面。

要求：

- 必须渲染在 AdminShell 内。
- Header 标题必须与页面一致。
- 主体区域展示简洁占位内容。
- 不实现真实业务数据、接口请求、复杂表单或权限逻辑。

占位内容示例：

- `知识文档`：提示后续用于管理知识文档、导入内容和查看解析结果。
- `专家 Agent`：提示后续用于配置专家 Agent 和关联知识库。

占位内容应短而明确，不做营销式介绍页。

## 10. 暂不实现范围

当前阶段明确不实现：

- 真实用户系统。
- 真实头像数据。
- 登录、退出、鉴权和权限控制。
- 多租户隔离。
- 复杂面包屑。
- 多级菜单。
- 文档和 Agent 的真实 CRUD。
- API 联调。
- 数据库 schema 调整。

若后续业务模块需要这些能力，应在对应模块 spec 中单独设计。

## 11. 建议文件落点

后续真实实现时，建议新增或调整以下文件：

```text
src/app/page.tsx
src/app/knowledge-bases/page.tsx
src/app/documents/page.tsx
src/app/agents/page.tsx
src/components/layout/admin-shell.tsx
src/components/layout/admin-sidebar.tsx
src/components/layout/admin-header.tsx
src/components/layout/admin-nav.ts
```

说明：

- `admin-nav.ts` 存放导航与页面标题映射。
- `admin-shell.tsx` 组合整体布局。
- `admin-sidebar.tsx` 处理导航、lucide-react 图标、展开/收缩显示和选中状态。
- `admin-header.tsx` 处理标题与用户信息占位。
- 业务页面不重复实现 Header 和 Sidebar。

如果实际实现时发现组件粒度过细，也可以合并为更少文件，但应保持导航配置集中、布局职责清晰。

## 12. 数据流与渲染流程

进入 `/knowledge-bases` 的推荐流程：

```text
用户访问 /
→ src/app/page.tsx 重定向到 /knowledge-bases
→ /knowledge-bases/page.tsx 渲染页面内容
→ 页面内容包裹在 AdminShell 内
→ AdminShell 根据 pathname 解析当前页面元信息
→ Header 显示 知识库管理
→ Sidebar 高亮 知识库
→ Main Content 显示知识库管理内容
```

点击 Sidebar 导航的推荐流程：

```text
用户点击 知识文档
→ Link 跳转到 /documents
→ AdminShell 获取 pathname=/documents
→ Header 标题更新为 知识文档
→ Sidebar 高亮 知识文档
→ Main Content 显示知识文档预留页面
```

收缩 Sidebar 的推荐流程：

```text
用户点击收缩按钮
→ Header 调用 onToggleSidebar()
→ AdminShell 本地 useState 更新 sidebarOpen
→ Sidebar 根据 sidebarOpen 切换宽度和文字显示
→ 展开时显示图标和名称
→ 收缩时只显示图标
→ Main Area 自动占据剩余空间
```

## 13. 错误与边界处理

当前阶段布局层需要处理的边界较少：

- 未知路由不在本布局 spec 范围内，可由 Next.js 默认 404 处理。
- Header 标题未匹配时应有兜底标题，避免页面出现空标题。
- Sidebar 收缩状态不应影响导航可点击性。
- Sidebar 收缩时不得显示导航文字或平台标题，只保留图标。
- 用户信息区域只是占位，不应触发真实请求或报错。
- 页面内容为空时应展示占位，而不是空白主区域。

## 14. 验收标准

后续实现完成后，应按以下标准检查：

1. 访问 `/` 后能够重定向到 `/knowledge-bases`。
2. `/knowledge-bases`、`/documents`、`/agents` 均可访问。
3. 三个页面都在统一后台布局内渲染。
4. 页面包含 Header、Sidebar、Main Content 三段结构。
5. 进入 `/knowledge-bases` 时，Header 显示 `知识库管理`。
6. 进入 `/documents` 时，Header 显示 `知识文档`。
7. 进入 `/agents` 时，Header 显示 `专家 Agent`。
8. Sidebar 包含 `知识库`、`知识文档`、`专家 Agent` 三个导航项。
9. 点击 Sidebar 导航项后能跳转到对应路由。
10. 当前路由对应的导航项有明确选中状态。
11. Sidebar 支持展开和收缩。
12. Sidebar 收缩后导航仍可点击。
13. Sidebar 顶部展开时显示 `LibraryBig` 图标和 `AI知识库管理平台` 标题。
14. Sidebar 收缩时只显示图标，不显示平台标题和导航名称。
15. `知识库` 导航图标使用 `BrainCircuit`。
16. `知识文档` 导航图标使用 `FolderKanban`。
17. `专家 Agent` 导航图标使用 `Bot`。
18. Sidebar 收缩/展开按钮位于 Header 左侧页面标题旁边。
19. Sidebar 打开状态时，收缩/展开按钮图标使用 `PanelRightOpen`。
20. Sidebar 关闭状态时，收缩/展开按钮图标使用 `PanelRightClose`。
21. Header 右侧保留用户信息占位区域。
22. `/knowledge-bases`、`/documents` 和 `/agents` 不接入真实业务数据，只展示预留内容。
23. 第一版只验收桌面端布局，移动端不作为验收重点。
24. 实现不修改 Prisma schema，不接入真实鉴权。

## 15. 验证建议

真实实现完成后建议运行：

```bash
npm run lint
npm run build
```

人工检查建议：

- 在浏览器访问 `/`，确认跳转结果。
- 依次点击三个 Sidebar 导航项，确认路由、Header 标题和选中状态同步变化。
- 点击 Header 标题旁的 Sidebar 收缩/展开按钮，确认打开状态使用 `PanelRightOpen`，关闭状态使用 `PanelRightClose`。
- 确认 Sidebar 展开时显示图标和名称，收缩时只显示图标，且布局没有重叠或不可点击区域。
- 检查 `/knowledge-bases`、`/documents` 和 `/agents` 是否为占位页面，且没有误触发接口请求。

如果项目尚未配置自动化测试，不应声称测试已通过。验证失败时应记录失败命令和关键错误。
