import { PartnerBadge } from "@/components/layout/partner-badge";
import Link from "next/link";
import { RequisorAI } from "@/components/ui/requisor-ai";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-x-hidden bg-background p-4 font-sans text-zinc-900">
      <section className="w-full max-w-4xl">
        <div className="mb-8 text-center sm:mb-10">
          <Link
            href="/"
            className="focus-ring mb-6 inline-flex items-center gap-2 rounded-xl px-2 py-1 text-primary"
          >
            <img
              src="/requisor.png"
              alt="Alma 41 home"
              className="h-10 w-10 rounded-lg object-contain"
              width="40"
              height="40"
            />
            <span className="text-lg font-semibold">Alma 41 <span className="text-sm font-normal text-zinc-500">by <RequisorAI className="font-semibold text-zinc-700" /></span></span>
          </Link>
          <h1 className="text-2xl font-bold sm:text-3xl">Choose your login</h1>
          <p className="mt-2 text-sm text-zinc-600 sm:text-base">
            Select the workspace that matches your role.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <RoleCard
            href="/login/learners-login/"
            title="Learner (Student)"
            description="Access your courses, assignments, progress, and learning paths."
            action="Continue as learner"
            icon={<LearnerIcon />}
          />
          <RoleCard
            href="/login/tutors-login/"
            title="Tutor"
            description="Sign in to your educator workspace and manage your teaching tools."
            action="Continue as tutor"
            icon={<TutorIcon />}
          />
        </div>

        <div className="mt-8 text-center">
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Requisor © 2026. All rights reserved.
          </p>
          <PartnerBadge className="mt-4 justify-center border-t border-zinc-200 pt-3" />
        </div>
      </section>
    </main>
  );
}

function RoleCard({
  href,
  title,
  description,
  action,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  action: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="focus-ring group flex min-h-[260px] flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-primary/50 hover:shadow-glow sm:p-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </div>
        <span
          aria-hidden="true"
          className="text-xl text-zinc-400 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-primary"
        >
          →
        </span>
      </div>
      <div className="mt-7">
        <h2 className="text-xl font-bold text-zinc-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
      </div>
      <span className="mt-auto pt-7 text-sm font-medium text-primary">{action}</span>
    </Link>
  );
}

function LearnerIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-7 w-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9.5 12 5l9 4.5-9 4.5L3 9.5Z" />
      <path d="M6.5 11.5v4.1c0 1.3 2.5 2.8 5.5 2.8s5.5-1.5 5.5-2.8v-4.1" />
      <path d="M21 10v5" />
    </svg>
  );
}

function TutorIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-7 w-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5.5h16A1.5 1.5 0 0 1 21.5 7v10A1.5 1.5 0 0 1 20 18.5H4A1.5 1.5 0 0 1 2.5 17V7A1.5 1.5 0 0 1 4 5.5Z" />
      <path d="M8 21h8M12 18.5V21M7 9.5h10M7 13h6" />
    </svg>
  );
}