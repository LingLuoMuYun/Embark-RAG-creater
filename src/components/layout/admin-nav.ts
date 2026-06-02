import {
  Bot,
  BrainCircuit,
  FolderKanban,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";

export type AdminNavItem = {
  label: string;
  title: string;
  href: string;
  Icon: LucideIcon;
};

export const adminNavItems = [
  {
    label: "数据总览",
    title: "Dashboard 数据总览",
    href: "/dashboard",
    Icon: LayoutDashboard,
  },
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
] satisfies AdminNavItem[];

export function getAdminPageTitle(pathname: string) {
  return (
    adminNavItems.find((item) => pathname.startsWith(item.href))?.title ??
    "知识库管理"
  );
}
