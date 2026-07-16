"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { useStore } from "@/lib/store";
import { Skeleton } from "@/components/ui/skeleton";
import { GradientBlobs } from "@/components/gradient-blobs";
import { AiAssistant } from "@/components/ai-assistant";

function Shell({ children }: { children: React.ReactNode }) {
  const { state, hydrated } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !state.user) router.replace("/");
  }, [hydrated, state.user, router]);

  if (!hydrated || !state.user) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-64 border-r border-zinc-200 p-4 md:block">
          <Skeleton className="h-10 w-full" />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (<Skeleton key={i} className="h-9 w-full" />))}
          </div>
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-10 w-1/3" />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-28 w-full" />))}
          </div>
          <Skeleton className="mt-6 h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen">
      <GradientBlobs />
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
      <AiAssistant />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <Shell children={children} />
    </Suspense>
  );
}
