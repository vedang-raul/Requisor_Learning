"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { useStore } from "@/lib/store";
import { GradientBlobs } from "@/components/gradient-blobs";
import { AiAssistant } from "@/components/ai-assistant";
import { OnboardingSurvey } from "@/components/onboarding-survey";

interface MeData {
  onboardingDone: boolean;
  dateOfBirth: string | null;
}

function Shell({ children }: { children: React.ReactNode }) {
  const { state, hydrated } = useStore();
  const router = useRouter();
  const [meData, setMeData] = useState<MeData | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);

  useEffect(() => {
    if (hydrated && !state.user) router.replace("/");
  }, [hydrated, state.user, router]);

  // Fetch onboarding status once the user is confirmed
  useEffect(() => {
    if (!hydrated || !state.user) return;
    fetch("/api/me")
      .then((r) => r.json())
      .then((data: MeData) => { setMeData(data); setMeLoaded(true); })
      .catch(() => setMeLoaded(true)); // fail open — don't block the app
  }, [hydrated, state.user]);

  // Plain white screen while session resolves or redirect is in-flight —
  // no skeleton structure means no layout shift (shake) during transitions.
  if (!hydrated || !state.user) {
    return <div className="min-h-screen bg-white" />;
  }

  const showSurvey = meLoaded && meData !== null && !meData.onboardingDone;

  return (
    <div className="relative flex min-h-screen animate-in fade-in duration-200">
      <GradientBlobs />
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
      <AiAssistant />
      {showSurvey && (
        <OnboardingSurvey
          hasDob={!!meData?.dateOfBirth}
          onComplete={() => setMeData((d) => d ? { ...d, onboardingDone: true } : d)}
        />
      )}
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
