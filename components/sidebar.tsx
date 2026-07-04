"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Library, Bot, BarChart3, Package, Shield,
  MonitorPlay, Trophy, Settings, ShieldCheck, ChevronsLeft, LogOut,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

export const navItems = [
  { href: "/app/dashboard/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/paths/", label: "Learning Paths", icon: Library },
  { href: "/app/course/?slug=agentic-ai", label: "Agentic AI", icon: Bot, slug: "agentic-ai" },
  { href: "/app/course/?slug=data-analytics", label: "Data Analytics", icon: BarChart3, slug: "data-analytics" },
  { href: "/app/course/?slug=product-management", label: "Product Management", icon: Package, slug: "product-management" },
  { href: "/app/course/?slug=cyber-security", label: "Cyber Security", icon: Shield, slug: "cyber-security" },
  { href: "/app/my-learning/", label: "My Learning", icon: MonitorPlay },
  { href: "/app/badges/", label: "Badges", icon: Trophy },
  { href: "/app/admin/", label: "Admin Panel", icon: ShieldCheck },
  { href: "/app/settings/", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const { state, toggleSidebar, logout } = useStore();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const collapsed = state.sidebarCollapsed;
  const currentSlug = searchParams.get("slug");

  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 256 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r border-zinc-200 bg-card md:flex"
    >
      {/* Logo */}
      <div className={cn("flex h-16 items-center gap-2.5 border-b border-zinc-200 px-4", collapsed && "justify-center px-2")}>
        <img src="/requisor.png" alt="Requisor logo" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
        {!collapsed && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="leading-tight">
            <p className="text-sm font-bold text-zinc-900">Requisor</p>
            <p className="text-gradient text-[11px] font-semibold">Learning</p>
          </motion.div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {navItems.map((item) => {
          const isCoursePage = pathname?.startsWith("/app/course");
          const active = item.slug
            ? isCoursePage && currentSlug === item.slug
            : pathname === item.href || pathname === item.href.replace(/\/$/, "") || (pathname?.startsWith(item.href) && item.href !== "/app/course/");
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "focus-ring group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                active ? "bg-primary/10 text-primary" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                collapsed && "justify-center px-2"
              )}
            >
              {active && (
                <motion.span layoutId="nav-pill" className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-primary to-secondary" />
              )}
              <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110", active && "text-primary")} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="space-y-1 border-t border-zinc-200 p-3">
        <button
          onClick={() => { logout(); router.push("/"); }}
          className={cn("focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900", collapsed && "justify-center px-2")}
        >
          <LogOut className="h-[18px] w-[18px]" />
          {!collapsed && "Log out"}
        </button>
        <button
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn("focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900", collapsed && "justify-center px-2")}
        >
          <motion.span animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.3 }}>
            <ChevronsLeft className="h-[18px] w-[18px]" />
          </motion.span>
          {!collapsed && "Collapse"}
        </button>
      </div>
    </motion.aside>
  );
}
