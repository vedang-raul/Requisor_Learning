"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProgramBuilder } from "@/components/tutor/program-builder";
import { PageTransition } from "@/components/ui/motion";
import { useStore } from "@/lib/store";

/**
 * The Program Builder, on its own page in the sidebar: an employer's need →
 * curriculum (saved as a draft Curriculum Blueprint course) → priced proposal.
 * The AI assistant opens this page when it drives the builder.
 */
export default function ProgramBuilderPage() {
  const { state, hydrated } = useStore();
  const router = useRouter();
  useEffect(() => {
    if (hydrated && state.user && state.user.role !== "tutor" && state.user.role !== "admin") router.replace("/app/dashboard/");
  }, [hydrated, router, state.user]);

  if (!state.user || (state.user.role !== "tutor" && state.user.role !== "admin")) return null;
  return (
    <PageTransition>
      <ProgramBuilder
        key={state.user.email}
        owner={state.user.email}
        // Opens the blueprint course in the Tutor Workspace's My Courses.
        onOpenCourse={(slug) => router.push(`/app/tutor/?course=${encodeURIComponent(slug)}`)}
      />
    </PageTransition>
  );
}
