"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, ChevronRight, Search, Sparkles, X, Zap, GraduationCap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { cn, formatMinutes } from "@/lib/utils";
import { Tag } from "@/components/ui/badge";
import { MobileNav } from "@/components/mobile-nav";

const crumbNames: Record<string, string> = {
  app: "Home", dashboard: "Dashboard", paths: "Learning Paths", course: "Course",
  learn: "Lesson", "my-learning": "My Learning", badges: "Badges", admin: "Admin", settings: "Settings",
};

const springHover = { type: "spring" as const, stiffness: 320, damping: 22 };

export function Topbar() {
  const { state, workspaceMode, markNotificationsRead } = useStore();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts: "/" or Ctrl/Cmd+K to search, Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName);
      if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") { setSearchOpen(false); setNotifOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: { type: "course" | "lesson"; title: string; sub: string; href: string }[] = [];
    for (const c of state.courses) {
      const courseHit = c.title.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q)) || c.tagline.toLowerCase().includes(q);
      if (courseHit) out.push({ type: "course", title: c.title, sub: `${c.lessons.length} lessons · ${c.tags.slice(0, 3).join(", ")}`, href: `/app/course/?slug=${c.slug}` });
      for (const l of c.lessons) {
        if (l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q)) {
          out.push({ type: "lesson", title: l.title, sub: `${c.title} · ${formatMinutes(l.durationMin)}`, href: `/app/learn/?course=${c.slug}&lesson=${l.id}` });
        }
      }
    }
    return out.slice(0, 8);
  }, [query, state.courses]);

  const allNotifications = useMemo(
    () => [...state.serverNotifications, ...state.notifications].sort((a, b) => (a.at < b.at ? 1 : -1)),
    [state.serverNotifications, state.notifications]
  );
  const unread = allNotifications.filter((n) => !n.read).length;
  const crumbs = (pathname ?? "").split("/").filter(Boolean);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white px-4 md:px-6">
      {/* Mobile navigation drawer */}
      <MobileNav />

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm text-zinc-500 sm:flex">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1"
          >
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
                <span className={cn("truncate", i === crumbs.length - 1 && "font-medium text-zinc-800")}>{crumbNames[c] ?? c}</span>
              </span>
            ))}
          </motion.div>
        </AnimatePresence>
      </nav>

      <div className="flex-1" />

      {/* Search trigger */}
      <motion.button
        onClick={() => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        className="focus-ring group flex h-9 w-full min-w-0 max-w-[240px] items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-700"
      >
        <motion.span whileHover={{ scale: 1.1 }} transition={springHover} className="inline-flex"><Search className="h-4 w-4" /></motion.span>
        <span className="flex-1 truncate text-left">Search courses, lessons…</span>
        <kbd className="hidden rounded-md border border-border bg-white px-1.5 py-0.5 text-[10px] text-zinc-500 lg:block">Ctrl K</kbd>
      </motion.button>

      {/* XP */}
      <motion.div whileHover={{ scale: 1.05 }} className="hidden items-center gap-2 lg:flex">
        <Tag tone="primary"><Zap className="h-3 w-3" />{state.xp} XP</Tag>
      </motion.div>
      {state.user?.role === "tutor" && (
        <Tag className="hidden sm:inline-flex" tone={workspaceMode === "student" ? "accent" : "primary"}>
          <GraduationCap className="h-3 w-3" />
          {workspaceMode === "student" ? "Student mode" : "Tutor mode"}
        </Tag>
      )}

      {/* Notifications */}
      <div className="relative">
        <motion.button
          onClick={() => { setNotifOpen((v) => !v); if (!notifOpen) markNotificationsRead(); }}
          aria-label="Notifications"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.94 }}
          className="focus-ring relative shrink-0 rounded-xl border border-border bg-white p-2 text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900"
        >
          <motion.span
            animate={unread > 0 ? { rotate: [0, -12, 12, -8, 8, 0] } : {}}
            transition={{ duration: 1, repeat: unread > 0 ? Infinity : 0, repeatDelay: 3 }}
            className="inline-flex"
          >
            <Bell className="h-4 w-4" />
          </motion.span>
          <AnimatePresence>
            {unread > 0 && (
              <motion.span
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={springHover}
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-r from-primary to-secondary text-[9px] font-bold text-white"
              >
                {unread}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
        <AnimatePresence>
          {notifOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className="glass-card absolute right-0 top-12 w-80 overflow-hidden p-0"
            >
              <div className="flex items-center gap-1.5 border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900">
                <Bell className="h-3.5 w-3.5 text-primary" />Notifications
              </div>
              <div className="max-h-80 overflow-y-auto">
                {allNotifications.length === 0 && (
                  <div className="flex flex-col items-center gap-2 p-6 text-center">
                    <motion.span animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
                      <Sparkles className="h-5 w-5 text-primary/50" />
                    </motion.span>
                    <p className="text-sm text-zinc-500">You&apos;re all caught up.</p>
                  </div>
                )}
                {allNotifications.slice(0, 10).map((n, i) => {
                  const Wrapper = n.link ? motion.button : motion.div;
                  return (
                    <Wrapper
                      key={n.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={n.link ? () => { setNotifOpen(false); router.push(n.link!); } : undefined}
                      className={cn(
                        "block w-full border-b border-zinc-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-zinc-50",
                        n.link && "cursor-pointer"
                      )}
                    >
                      <p className="text-sm font-medium text-zinc-900">{n.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-zinc-600">{n.body}</p>
                    </Wrapper>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Avatar */}
      <motion.div whileHover={{ scale: 1.08, rotate: -3 }} whileTap={{ scale: 0.94 }} transition={springHover}>
        <Link href="/app/settings/" title="Settings" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-sm font-bold text-white shadow-glow-sm transition-opacity hover:opacity-90">
          {(state.user?.name ?? "U").slice(0, 1).toUpperCase()}
        </Link>
      </motion.div>

      {/* Search overlay */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-24 backdrop-blur-sm"
            onClick={() => setSearchOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="glass-card w-full max-w-xl overflow-hidden p-0"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Global search"
            >
              <div className="flex items-center gap-3 border-b border-zinc-200 px-4">
                <Search className="h-4 w-4 text-zinc-500" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by course, lesson, topic or tag…"
                  className="h-12 flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none"
                />
                <motion.button whileHover={{ rotate: 90 }} whileTap={{ scale: 0.9 }} transition={springHover} onClick={() => setSearchOpen(false)} aria-label="Close search" className="text-zinc-500 hover:text-zinc-900">
                  <X className="h-4 w-4" />
                </motion.button>
              </div>
              <div className="max-h-96 overflow-y-auto p-2">
                <AnimatePresence mode="wait">
                  {query && results.length === 0 && (
                    <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-6 text-center text-sm text-zinc-500">
                      No results for &ldquo;{query}&rdquo;. Try a different topic or tag.
                    </motion.p>
                  )}
                  {!query && (
                    <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-6 text-center text-sm text-zinc-500">
                      Type to search across all learning paths, lessons, topics and tags.
                    </motion.p>
                  )}
                </AnimatePresence>
                {results.map((r, i) => (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    whileHover={{ x: 2 }}
                    onClick={() => { setSearchOpen(false); setQuery(""); router.push(r.href); }}
                    className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-zinc-100"
                  >
                    <Tag tone={r.type === "course" ? "primary" : "accent"}>{r.type}</Tag>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-900">{r.title}</span>
                      <span className="block truncate text-xs text-zinc-500">{r.sub}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-zinc-600 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}