"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Library, Bot, BarChart3, Package, Shield,
  MonitorPlay, Trophy, Settings, ShieldCheck, ChevronsLeft, LogOut, ChevronDown,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export const courses = [
  { href: "/app/course/?slug=agentic-ai",        label: "Agentic AI",         icon: Bot,     slug: "agentic-ai" },
  { href: "/app/course/?slug=data-analytics",    label: "Data Analytics",     icon: BarChart3, slug: "data-analytics" },
  { href: "/app/course/?slug=product-management",label: "Product Management", icon: Package, slug: "product-management" },
  { href: "/app/course/?slug=cyber-security",    label: "Cyber Security",     icon: Shield,  slug: "cyber-security" },
];

// Flat list used by mobile-nav (courses excluded — handled by dropdown)
export const navItems = [
  { href: "/app/dashboard/",  label: "Dashboard",   icon: LayoutDashboard },
  { href: "/app/my-learning/",label: "My Learning", icon: MonitorPlay },
  { href: "/app/badges/",     label: "Badges",      icon: Trophy },
  { href: "/app/admin/",      label: "Admin Panel", icon: ShieldCheck, adminOnly: true },
  { href: "/app/settings/",   label: "Settings",    icon: Settings },
];

const springTransition = { type: "spring" as const, stiffness: 500, damping: 35 };

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  show: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: 0.03 * i, duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export function Sidebar() {
  const { state, toggleSidebar, logout } = useStore();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const collapsed = state.sidebarCollapsed;
  const currentSlug = searchParams.get("slug");

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
    (item) => item.href !== "/app/dashboard/" && (!("adminOnly" in item && item.adminOnly) || state.user?.role === "admin")
  );

  const renderItem = (item: { href: string; label: string; icon: React.ElementType }, index: number) => {
    const Icon = item.icon;
    const active =
      pathname === item.href ||
      pathname === item.href.replace(/\/$/, "") ||
      (pathname?.startsWith(item.href) && item.href.length > 1);
    const isHovered = hoveredItem === item.href;

    return (
      <motion.div
        key={item.label}
        custom={index}
        variants={itemVariants}
        initial="hidden"
        animate="show"
        onHoverStart={() => setHoveredItem(item.href)}
        onHoverEnd={() => setHoveredItem((h) => (h === item.href ? null : h))}
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
          {active && (
            <motion.span
              layoutId="sidebar-active-bg"
              transition={springTransition}
              className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/30"
            />
          )}
          <AnimatePresence>
            {!active && isHovered && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 rounded-xl bg-zinc-100"
              />
            )}
          </AnimatePresence>
          <motion.span
            className="relative z-10 flex items-center justify-center"
            animate={{ scale: active ? 1.05 : isHovered ? 1.12 : 1, rotate: isHovered && !active ? -4 : 0 }}
            transition={springTransition}
          >
            <Icon className={cn("h-[18px] w-[18px] shrink-0 text-zinc-500 transition-colors duration-200", active && "text-white", isHovered && !active && "text-zinc-900")} />
          </motion.span>
          {!collapsed && (
            <span className={cn("relative z-10 truncate transition-colors duration-200", isHovered && !active && "text-zinc-900")}>
              {item.label}
            </span>
          )}
        </Link>
      </motion.div>
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
        <motion.div custom={1} variants={itemVariants} initial="hidden" animate="show">
          <motion.button
            onClick={() => {
              router.push("/app/paths/");
              if (!collapsed) setCoursesOpen((o) => !o);
            }}
            onHoverStart={() => setHoveredItem("__paths")}
            onHoverEnd={() => setHoveredItem((h) => (h === "__paths" ? null : h))}
            whileTap={{ scale: 0.98 }}
            title={collapsed ? "Learning Paths" : undefined}
            className={cn(
              "focus-ring group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm transition-colors duration-150",
              learningActive ? "font-semibold text-white" : "font-medium text-zinc-600",
              collapsed && "justify-center px-2"
            )}
          >
            {learningActive && (
              <motion.span
                layoutId="sidebar-active-bg"
                transition={springTransition}
                className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/30"
              />
            )}
            <AnimatePresence>
              {!learningActive && hoveredItem === "__paths" && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 rounded-xl bg-zinc-100"
                />
              )}
            </AnimatePresence>
            <motion.span
              className="relative z-10 flex items-center justify-center"
              animate={{
                scale: learningActive ? 1.05 : hoveredItem === "__paths" ? 1.12 : 1,
                rotate: hoveredItem === "__paths" && !learningActive ? -4 : 0,
              }}
              transition={springTransition}
            >
              <Library className={cn("h-[18px] w-[18px] shrink-0 text-zinc-500 transition-colors duration-200", learningActive && "text-white", hoveredItem === "__paths" && !learningActive && "text-zinc-900")} />
            </motion.span>
            {!collapsed && (
              <>
                <span className={cn("relative z-10 flex-1 truncate text-left transition-colors duration-200", hoveredItem === "__paths" && !learningActive && "text-zinc-900")}>
                  Learning Paths
                </span>
                <motion.span className="relative z-10" animate={{ rotate: coursesOpen ? 180 : 0 }} transition={{ duration: 0.25, ease: "easeInOut" }}>
                  <ChevronDown className={cn("h-3.5 w-3.5", learningActive ? "opacity-80" : "opacity-60")} />
                </motion.span>
              </>
            )}
          </motion.button>

          {/* Course sub-items */}
          <AnimatePresence initial={false}>
            {coursesOpen && !collapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-0.5 space-y-0.5 pl-4">
                  {/* left connector line */}
                  <div className="relative">
                    <motion.div
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.3, delay: 0.05 }}
                      style={{ transformOrigin: "top" }}
                      className="absolute left-1 top-0 h-full w-px bg-zinc-200"
                    />
                    {courses.map((course, i) => {
                      const active = isOnCoursePage && currentSlug === course.slug;
                      const Icon = course.icon;
                      return (
                        <motion.div
                          key={course.slug}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2, delay: 0.05 + i * 0.04 }}
                        >
                          <Link
                            href={course.href}
                            onMouseEnter={() => setHoveredItem(course.slug)}
                            onMouseLeave={() => setHoveredItem((h) => (h === course.slug ? null : h))}
                            className={cn(
                              "focus-ring group relative flex items-center gap-2.5 rounded-lg py-2 pl-4 pr-3 text-sm transition-colors duration-200",
                              active ? "font-semibold text-primary" : "font-medium text-zinc-500 hover:text-zinc-900"
                            )}
                          >
                            {active && (
                              <motion.span
                                layoutId="course-active-bg"
                                transition={springTransition}
                                className="absolute inset-0 rounded-lg border border-primary/20 bg-white shadow-sm"
                              />
                            )}
                            <AnimatePresence>
                              {hoveredItem === course.slug && !active && (
                                <motion.span
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.15 }}
                                  className="absolute inset-0 rounded-lg bg-zinc-100"
                                />
                              )}
                            </AnimatePresence>
                            <motion.span
                              className="relative z-10 flex items-center justify-center"
                              animate={{ scale: active ? 1.1 : hoveredItem === course.slug ? 1.15 : 1 }}
                              transition={springTransition}
                            >
                              <Icon className={cn("h-[15px] w-[15px] shrink-0", active && "text-primary")} />
                            </motion.span>
                            <span className="relative z-10 truncate">{course.label}</span>
                            {active && (
                              <motion.span
                                layoutId="course-active-dot"
                                transition={springTransition}
                                className="relative z-10 ml-auto h-1.5 w-1.5 rounded-full bg-gradient-to-br from-primary to-secondary"
                              />
                            )}
                          </Link>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

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