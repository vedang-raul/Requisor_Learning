"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Menu, X, Library, ChevronDown, GraduationCap } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { navItems } from "@/components/sidebar";
import { getCategoryMeta } from "@/components/category-icon";

export function MobileNav() {
  const { state, workspaceMode, setWorkspaceMode, logout } = useStore();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const currentSlug = searchParams.get("slug");
  const navigationCourses = state.courses.map((course) => ({
    href: `/app/course/?slug=${encodeURIComponent(course.slug)}`,
    label: course.title,
    icon: getCategoryMeta(course.category).icon,
    slug: course.slug,
  }));

  const isOnCoursePage = pathname?.startsWith("/app/course");
  const isOnPathsPage  = pathname?.startsWith("/app/paths");
  const learningActive = isOnCoursePage || isOnPathsPage;

  const [coursesOpen, setCoursesOpen] = useState(learningActive);
  useEffect(() => { if (learningActive) setCoursesOpen(true); }, [learningActive]);

  // Close the drawer whenever the route changes
  useEffect(() => { setOpen(false); }, [pathname, currentSlug]);

  const filteredItems = navItems.filter(
    (item) =>
      (!("adminOnly" in item && item.adminOnly) || state.user?.role === "admin") &&
      (!("learnerOnly" in item && item.learnerOnly) || state.user?.role !== "tutor" || workspaceMode === "student") &&
      (!("tutorOnly" in item && item.tutorOnly) || state.user?.role === "admin" || (state.user?.role === "tutor" && workspaceMode === "tutor")) &&
      (!("employeeOnly" in item && item.employeeOnly) || state.user?.role === "employee")
  );
  const showLearnerNavigation = state.user?.role !== "tutor" || workspaceMode === "student";

  const switchWorkspaceMode = () => {
    const nextMode = workspaceMode === "tutor" ? "student" : "tutor";
    setWorkspaceMode(nextMode);
    setOpen(false);
    if (nextMode === "student" && pathname?.startsWith("/app/tutor")) router.push("/app/dashboard/");
  };

  // Split: dashboard first, rest after Learning Paths
  const topItems    = filteredItems.filter((i) => i.href === "/app/dashboard/");
  const bottomItems = filteredItems.filter((i) => i.href !== "/app/dashboard/");

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="focus-ring shrink-0 rounded-xl border border-border bg-white p-2 text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
      >
        <Menu className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/30"
            onClick={() => setOpen(false)}
          >
            <motion.aside
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="flex h-full w-72 flex-col border-r border-zinc-200 bg-card"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Navigation menu"
            >
              <div className="flex h-16 items-center gap-2.5 border-b border-zinc-200 px-4">
                <img src="/requisor.png" alt="Requisor logo" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
                <div className="leading-tight">
                  <p className="text-sm font-bold text-zinc-900">Requisor</p>
                  <p className="text-gradient text-[11px] font-semibold">Learning</p>
                </div>
                <div className="flex-1" />
                <button onClick={() => setOpen(false)} aria-label="Close navigation menu" className="focus-ring rounded-lg p-1.5 text-zinc-500 hover:text-zinc-900">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
                {/* Dashboard */}
                {topItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname === item.href.replace(/\/$/, "");
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                        active ? "bg-primary/10 text-primary" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}

                {/* Learning Paths + dropdown */}
                {showLearnerNavigation && <div>
                  <button
                    onClick={() => {
                      router.push("/app/paths/");
                      setCoursesOpen((o) => !o);
                    }}
                    className={cn(
                      "focus-ring group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      learningActive ? "bg-primary/10 text-primary" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    )}
                  >
                    <Library className={cn("h-[18px] w-[18px] shrink-0", learningActive && "text-primary")} />
                    <span className="flex-1 truncate text-left">Learning Paths</span>
                    <motion.span animate={{ rotate: coursesOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </motion.span>
                  </button>

                  <AnimatePresence initial={false}>
                    {coursesOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="mt-0.5 pl-4">
                          <div className="relative">
                            <div className="absolute left-1 top-0 h-full w-px bg-zinc-200" />
                            {navigationCourses.map((course) => {
                              const active = isOnCoursePage && currentSlug === course.slug;
                              const Icon = course.icon;
                              return (
                                <Link
                                  key={course.slug}
                                  href={course.href}
                                  onClick={() => setOpen(false)}
                                  className={cn(
                                    "focus-ring flex items-center gap-2.5 rounded-lg py-2 pl-4 pr-3 text-sm font-medium transition-colors",
                                    active ? "text-primary" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                                  )}
                                >
                                  <Icon className={cn("h-[15px] w-[15px] shrink-0", active && "text-primary")} />
                                  <span className="truncate">{course.label}</span>
                                  {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>}

                {/* Remaining items */}
                {bottomItems.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    pathname === item.href.replace(/\/$/, "") ||
                    (item.href !== "/app/tutor/" && pathname?.startsWith(item.href) && item.href.length > 1);
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                        active ? "bg-primary/10 text-primary" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="space-y-1 border-t border-zinc-200 p-3">
                {state.user?.role === "tutor" && (
                  <button
                    onClick={switchWorkspaceMode}
                    className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-primary transition hover:bg-primary/10"
                  >
                    <GraduationCap className="h-[18px] w-[18px]" />
                    {workspaceMode === "tutor" ? "Switch to student mode" : "Switch to tutor mode"}
                  </button>
                )}
                <button
                  onClick={() => { setOpen(false); logout(); router.push("/"); }}
                  className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
                >
                  <LogOut className="h-[18px] w-[18px]" />
                  Log out
                </button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
