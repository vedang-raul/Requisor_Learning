"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { navItems } from "@/components/sidebar";

export function MobileNav() {
  const { logout } = useStore();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const currentSlug = searchParams.get("slug");

  // Close the drawer whenever the route changes
  useEffect(() => { setOpen(false); }, [pathname, currentSlug]);

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

              <div className="border-t border-zinc-200 p-3">
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
