"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { useStore } from "@/lib/store";
import { GradientBlobs } from "@/components/gradient-blobs";
import { AiAssistant } from "@/components/ai-assistant";

function Shell({ children }: { children: React.ReactNode }) {
  const { state, hydrated } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !state.user) router.replace("/");
  }, [hydrated, state.user, router]);

  // Plain white screen while session resolves or redirect is in-flight —
  // no skeleton structure means no layout shift (shake) during transitions.
  if (!hydrated || !state.user) {
    return <div className="min-h-screen bg-white" />;
  }

  return (
    <div className="relative flex min-h-screen animate-in fade-in duration-200">
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
