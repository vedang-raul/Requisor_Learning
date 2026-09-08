"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Library,
  MonitorPlay, Trophy,FileCheck2 , ShieldCheck, ChevronsLeft, LogOut, ChevronDown, GraduationCap, ClipboardCheck, CircleUserRound,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { getCategoryMeta } from "@/components/category-icon";

// Flat list used by mobile-nav (courses excluded — handled by dropdown)
export const navItems = [
  { href: "/app/dashboard/",  label: "Dashboard",   icon: LayoutDashboard },
  { href: "/app/my-learning/",label: "My Learning", icon: MonitorPlay, learnerOnly: true },
  { href: "/app/badges/",     label: "Badges",      icon: Trophy, learnerOnly: true },
  { href: "/app/submissions/",label: "Submissions", icon: FileCheck2, learnerOnly: true },
  { href: "/app/tutor/",      label: "Tutor Workspace", icon: GraduationCap, tutorOnly: true },
  { href: "/app/tutor/assignment/", label: "Check Assignments", icon: ClipboardCheck, tutorOnly: true },
  { href: "/app/admin/",      label: "Admin Panel", icon: ShieldCheck, adminOnly: true },
  { href: "/app/settings/",   label: "Profile",    icon: CircleUserRound },
];

const springTransition = { type: "spring" as const, stiffness: 500, damping: 35 };

export function Sidebar() {
  const { state, workspaceMode, setWorkspaceMode, toggleSidebar, logout } = useStore();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const collapsed = state.sidebarCollapsed;
  const currentSlug = searchParams.get("slug");
  const navigationCourses = state.courses.map((course) => ({
    href: `/app/course/?slug=${encodeURIComponent(course.slug)}`,
    label: course.title,
    icon: getCategoryMeta(course.category).icon,
    slug: course.slug,
  }));

  const isOnCoursePage  = pathname?.startsWith("/app/course");
  const isOnPathsPage   = pathname?.startsWith("/app/paths");
  const learningActive  = isOnCoursePage || isOnPathsPage;

  // Auto-open dropdown when on a course or paths page; collapse when sidebar collapses
  const [coursesOpen, setCoursesOpen] = useState(learningActive);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  useEffect(() => {
    if (learningActive) setCoursesOpen(true);
  }, [learningActive]);

  useEffect(() => {
    if (collapsed) setCoursesOpen(false);
  }, [collapsed]);

  const topItems = [
    { href: "/app/dashboard/", label: "Dashboard", icon: LayoutDashboard },
  ];

  const bottomItems = navItems.filter(
    (item) => item.href !== "/app/dashboard/" &&
      (!("adminOnly" in item && item.adminOnly) || state.user?.role === "admin") &&
      (!("learnerOnly" in item && item.learnerOnly) || state.user?.role !== "tutor" || workspaceMode === "student") &&
      (!("tutorOnly" in item && item.tutorOnly) || state.user?.role === "admin" || (state.user?.role === "tutor" && workspaceMode === "tutor")) &&
      (!("employeeOnly" in item && item.employeeOnly) || state.user?.role === "employee")
  );
  const showLearnerNavigation = state.user?.role !== "tutor" || workspaceMode === "student";

  const switchWorkspaceMode = () => {
    const nextMode = workspaceMode === "tutor" ? "student" : "tutor";
    setWorkspaceMode(nextMode);
    if (nextMode === "student" && pathname?.startsWith("/app/tutor")) router.push("/app/dashboard/");
  };

  const renderItem = (item: { href: string; label: string; icon: React.ElementType }, index: number) => {
    const Icon = item.icon;
    const active =
      pathname === item.href ||
      pathname === item.href.replace(/\/$/, "") ||
      (item.href !== "/app/tutor/" && pathname?.startsWith(item.href) && item.href.length > 1);
    const isHovered = hoveredItem === item.href;

    return (
      <div
        key={item.label}
        onMouseEnter={() => setHoveredItem(item.href)}
        onMouseLeave={() => setHoveredItem((h) => (h === item.href ? null : h))}
      >
        <Link
          href={item.href}
          title={collapsed ? item.label : undefined}
          className={cn(
            "focus-ring group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm transition-colors duration-150",
            active ? "font-semibold text-white" : "font-medium text-zinc-600",
            collapsed && "justify-center px-2"
          )}
        >
          {/* Active background — plain CSS transition, no FLIP measurement */}
          <span
            className={cn(
              "absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/30 transition-opacity duration-200",
              active ? "opacity-100" : "opacity-0"
            )}
          />
          {/* Hover background */}
          <span
            className={cn(
              "absolute inset-0 rounded-xl bg-zinc-100 transition-opacity duration-150",
              !active && isHovered ? "opacity-100" : "opacity-0"
            )}
          />
          <span className="relative z-10 flex items-center justify-center">
            <Icon className={cn("h-[18px] w-[18px] shrink-0 text-zinc-500 transition-colors duration-200", active && "text-white", isHovered && !active && "text-zinc-900")} />
          </span>
          {!collapsed && (
            <span className={cn("relative z-10 truncate transition-colors duration-200", isHovered && !active && "text-zinc-900")}>
              {item.label}
            </span>
          )}
        </Link>
      </div>
    );
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 256 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r border-zinc-200 bg-card/95 backdrop-blur-sm md:flex"
    >
      {/* Logo */}
      <div className={cn("flex h-16 items-center gap-2.5 border-b border-zinc-200 px-4", collapsed && "justify-center px-2")}>
        <motion.img
          src="/requisor.png"
          alt="Requisor logo"
          whileHover={{ scale: 1.06, rotate: -2 }}
          transition={springTransition}
          className="h-9 w-9 shrink-0 rounded-lg object-contain shadow-sm"
        />
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.2 }}
              className="leading-tight"
            >
              <p className="text-sm font-bold text-zinc-900">Requisor</p>
              <p className="text-gradient text-[11px] font-semibold">Learning</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {/* Dashboard */}
        {topItems.map((item, i) => renderItem(item, i))}

        {/* Learning Paths + dropdown */}
        {showLearnerNavigation && <div>
          <button
            onClick={() => {
              router.push("/app/paths/");
              if (!collapsed) setCoursesOpen((o) => !o);
            }}
            onMouseEnter={() => setHoveredItem("__paths")}
            onMouseLeave={() => setHoveredItem((h) => (h === "__paths" ? null : h))}
            title={collapsed ? "Learning Paths" : undefined}
            className={cn(
              "focus-ring group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm transition-colors duration-150",
              learningActive ? "font-semibold text-white" : "font-medium text-zinc-600",
              collapsed && "justify-center px-2"
            )}
          >
            <span
              className={cn(
                "absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/30 transition-opacity duration-200",
                learningActive ? "opacity-100" : "opacity-0"
              )}
            />
            <span
              className={cn(
                "absolute inset-0 rounded-xl bg-zinc-100 transition-opacity duration-150",
                !learningActive && hoveredItem === "__paths" ? "opacity-100" : "opacity-0"
              )}
            />
            <span className="relative z-10 flex items-center justify-center">
              <Library className={cn("h-[18px] w-[18px] shrink-0 text-zinc-500 transition-colors duration-200", learningActive && "text-white", hoveredItem === "__paths" && !learningActive && "text-zinc-900")} />
            </span>
            {!collapsed && (
              <>
                <span className={cn("relative z-10 flex-1 truncate text-left transition-colors duration-200", hoveredItem === "__paths" && !learningActive && "text-zinc-900")}>
                  Learning Paths
                </span>
                <motion.span className="relative z-10" animate={{ rotate: coursesOpen ? 180 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }}>
                  <ChevronDown className={cn("h-3.5 w-3.5", learningActive ? "opacity-80" : "opacity-60")} />
                </motion.span>
              </>
            )}
          </button>

          {/* Course sub-items */}
          <AnimatePresence initial={false}>
            {coursesOpen && !collapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="mt-0.5 space-y-0.5 pl-4">
                  <div className="relative">
                    <div className="absolute left-1 top-0 h-full w-px bg-zinc-200" />
                    {navigationCourses.map((course) => {
                      const active = isOnCoursePage && currentSlug === course.slug;
                      const Icon = course.icon;
                      const isHov = hoveredItem === course.slug;
                      return (
                        <div key={course.slug}>
                          <Link
                            href={course.href}
                            onMouseEnter={() => setHoveredItem(course.slug)}
                            onMouseLeave={() => setHoveredItem((h) => (h === course.slug ? null : h))}
                            className={cn(
                              "focus-ring group relative flex items-center gap-2.5 rounded-lg py-2 pl-4 pr-3 text-sm transition-colors duration-200",
                              active ? "font-semibold text-primary" : "font-medium text-zinc-500 hover:text-zinc-900"
                            )}
                          >
                            <span
                              className={cn(
                                "absolute inset-0 rounded-lg border border-primary/20 bg-white shadow-sm transition-opacity duration-200",
                                active ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span
                              className={cn(
                                "absolute inset-0 rounded-lg bg-zinc-100 transition-opacity duration-150",
                                isHov && !active ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="relative z-10 flex items-center justify-center">
                              <Icon className={cn("h-[15px] w-[15px] shrink-0", active && "text-primary")} />
                            </span>
                            <span className="relative z-10 truncate">{course.label}</span>
                            {active && (
                              <span className="relative z-10 ml-auto h-1.5 w-1.5 rounded-full bg-gradient-to-br from-primary to-secondary" />
                            )}
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>}

        {/* Remaining items */}
        {bottomItems.map((item, i) => renderItem(item, i + 2))}
      </nav>

      {/* MSOE association */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            whileHover={{ y: -1 }}
            transition={{ duration: 0.2 }}
            className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2 transition-shadow duration-200 hover:shadow-sm"
          >
            <img src="/msoe-logo.png" alt="MSOE" className="h-7 w-7 shrink-0 object-contain" />
            <span className="text-[10px] leading-tight text-zinc-400">In association with<br /><span className="font-medium text-zinc-500">MSOE University</span></span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="space-y-1 border-t border-zinc-200 p-3">
        {state.user?.role === "tutor" && (
          <motion.button
            onClick={switchWorkspaceMode}
            whileHover={{ x: collapsed ? 0 : 2 }}
            whileTap={{ scale: 0.97 }}
            aria-label={workspaceMode === "tutor" ? "Switch to student mode" : "Switch to tutor mode"}
            title={collapsed ? (workspaceMode === "tutor" ? "Switch to student mode" : "Switch to tutor mode") : undefined}
            className={cn("focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-primary transition-colors duration-200 hover:bg-primary/10", collapsed && "justify-center px-2")}
          >
            <GraduationCap className="h-[18px] w-[18px]" />
            {!collapsed && (workspaceMode === "tutor" ? "Switch to student mode" : "Switch to tutor mode")}
          </motion.button>
        )}
        <motion.button
          onClick={() => { logout(); router.push("/"); }}
          whileHover={{ x: collapsed ? 0 : 2 }}
          whileTap={{ scale: 0.97 }}
          className={cn("focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-600 transition-colors duration-200 hover:bg-red-50 hover:text-red-600", collapsed && "justify-center px-2")}
        >
          <LogOut className="h-[18px] w-[18px]" />
          {!collapsed && "Log out"}
        </motion.button>
        <motion.button
          onClick={toggleSidebar}
          whileHover={{ x: collapsed ? 0 : 2 }}
          whileTap={{ scale: 0.97 }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn("focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-600 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-900", collapsed && "justify-center px-2")}
        >
          <motion.span animate={{ rotate: collapsed ? 180 : 0 }} transition={{ type: "spring", stiffness: 300, damping: 25 }}>
            <ChevronsLeft className="h-[18px] w-[18px]" />
          </motion.span>
          {!collapsed && "Collapse"}
        </motion.button>
      </div>
    </motion.aside>
  );
}