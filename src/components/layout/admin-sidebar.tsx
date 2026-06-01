import Link from "next/link";
import { LibraryBig } from "lucide-react";

import { adminNavItems } from "@/components/layout/admin-nav";
import { cn } from "@/lib/utils";

export type AdminSidebarProps = {
  sidebarOpen: boolean;
  pathname: string;
};

export function AdminSidebar({ sidebarOpen, pathname }: AdminSidebarProps) {
  return (
    <aside
      className={cn(
        "flex min-h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        sidebarOpen ? "w-60" : "w-[72px]"
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b border-sidebar-border px-4",
          sidebarOpen ? "justify-start gap-2" : "justify-center"
        )}
      >
        <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <LibraryBig aria-hidden="true" className="size-4" />
        </div>
        {sidebarOpen ? (
          <span className="truncate text-sm font-semibold">
            AI知识库管理平台
          </span>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {adminNavItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.Icon;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center rounded-md text-sm font-medium transition-colors",
                sidebarOpen
                  ? "justify-start gap-2 px-3"
                  : "justify-center px-0",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              href={item.href}
              key={item.href}
              title={sidebarOpen ? undefined : item.label}
            >
              <Icon aria-hidden="true" className="size-4" />
              {sidebarOpen ? <span>{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
