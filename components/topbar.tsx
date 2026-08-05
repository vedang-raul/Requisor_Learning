"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, ChevronRight, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { cn, formatMinutes } from "@/lib/utils";
import { Tag } from "@/components/ui/badge";
import { MobileNav } from "@/components/mobile-nav";

const crumbNames: Record<string, string> = {
  app: "Home", dashboard: "Dashboard", paths: "Learning Paths", course: "Course",
  learn: "Lesson", "my-learning": "My Learning", badges: "Badges", admin: "Admin", settings: "Settings",
};

export function Topbar() {
  const { state, markNotificationsRead } = useStore();
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

  const unread = state.notifications.filter((n) => !n.read).length;
  const crumbs = (pathname ?? "").split("/").filter(Boolean);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white px-4 md:px-6">
      {/* Mobile navigation drawer */}
      <MobileNav />

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm text-zinc-500 sm:flex">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
            <span className={cn("truncate", i === crumbs.length - 1 && "font-medium text-zinc-800")}>{crumbNames[c] ?? c}</span>
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Search trigger */}
      <button
        onClick={() => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="focus-ring group flex h-9 w-full min-w-0 max-w-[240px] items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-700"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 truncate text-left">Search courses, lessons…</span>
        <kbd className="hidden rounded-md border border-border bg-white px-1.5 py-0.5 text-[10px] text-zinc-500 lg:block">Ctrl K</kbd>
      </button>

      {/* XP */}
      <div className="hidden items-center gap-2 lg:flex">
        <Tag tone="primary"><Sparkles className="h-3 w-3" />{state.xp} XP</Tag>
      </div>

      {/* Notifications */}
      <div className="relative">
        <button
          onClick={() => { setNotifOpen((v) => !v); if (!notifOpen) markNotificationsRead(); }}
          aria-label="Notifications"
          className="focus-ring relative shrink-0 rounded-xl border border-border bg-white p-2 text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-r from-primary to-secondary text-[9px] font-bold text-white">{unread}</span>
          )}
        </button>
        <AnimatePresence>
          {notifOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className="glass-card absolute right-0 top-12 w-80 overflow-hidden p-0"
            >
              <div className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900">Notifications</div>
              <div className="max-h-80 overflow-y-auto">
                {state.notifications.length === 0 && <p className="p-4 text-sm text-zinc-500">You&apos;re all caught up.</p>}
                {state.notifications.slice(0, 10).map((n) => (
                  <div key={n.id} className="border-b border-zinc-100 px-4 py-3 last:border-0">
                    <p className="text-sm font-medium text-zinc-900">{n.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-600">{n.body}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Avatar */}
      <Link href="/app/settings/" title="Settings" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-sm font-bold text-white shadow-glow-sm transition hover:opacity-80">
        {(state.user?.name ?? "U").slice(0, 1).toUpperCase()}
      </Link>

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
                <button onClick={() => setSearchOpen(false)} aria-label="Close search" className="text-zinc-500 hover:text-zinc-900"><X className="h-4 w-4" /></button>
              </div>
              <div className="max-h-96 overflow-y-auto p-2">
                {query && results.length === 0 && (
                  <p className="p-6 text-center text-sm text-zinc-500">No results for &ldquo;{query}&rdquo;. Try a different topic or tag.</p>
                )}
                {!query && <p className="p-6 text-center text-sm text-zinc-500">Type to search across all learning paths, lessons, topics and tags.</p>}
                {results.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => { setSearchOpen(false); setQuery(""); router.push(r.href); }}
                    className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-zinc-100"
                  >
                    <Tag tone={r.type === "course" ? "primary" : "accent"}>{r.type}</Tag>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-900">{r.title}</span>
                      <span className="block truncate text-xs text-zinc-500">{r.sub}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-zinc-600" />
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
