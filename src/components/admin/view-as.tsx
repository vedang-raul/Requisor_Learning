"use client";

import { useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Eye, GraduationCap, Loader2, ShieldCheck, Undo2, UserCog, UserRound } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { VIEW_AS_DESTINATIONS, VIEW_AS_LABELS, VIEW_AS_PROVIDER, type ViewAsKind } from "@/lib/auth/view-as-shared";

/**
 * "View as" for super admins: switch into a reserved test account to see the
 * app as a student, tutor or university admin, then come back. The server
 * checks it's really a super admin each time (src/lib/auth/auth.ts).
 */
async function switchTo(kind: ViewAsKind | "back"): Promise<string | null> {
  const result = await signIn(VIEW_AS_PROVIDER, { kind, redirect: false });
  if (!result?.ok || result.error) return kind === "back" ? "Couldn't switch back. Sign in again as super admin." : "Couldn't switch accounts. Please try again.";
  window.location.assign(kind === "back" ? "/app/admin/" : VIEW_AS_DESTINATIONS[kind]);
  return null;
}

const ICONS: Record<ViewAsKind, typeof GraduationCap> = {
  student: GraduationCap,
  tutor: UserRound,
  "university-admin": UserCog,
};

/** On the super admin's Profile page. */
export function ViewAsCard() {
  const [busy, setBusy] = useState<ViewAsKind | null>(null);
  const [error, setError] = useState("");

  async function go(kind: ViewAsKind) {
    setBusy(kind);
    setError("");
    const problem = await switchTo(kind);
    if (problem) { setError(problem); setBusy(null); }
  }

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <div className="rounded-lg bg-primary/10 p-1.5"><Eye className="h-4 w-4 text-primary" aria-hidden="true" /></div>
        <CardTitle>View as</CardTitle>
      </div>
      <p className="mb-4 text-sm text-zinc-600">
        See Alma 41 exactly as a test student, tutor or university admin sees it. These are test accounts, never real people. A banner lets you switch back.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(VIEW_AS_LABELS) as ViewAsKind[]).map((kind) => {
          const Icon = ICONS[kind];
          return (
            <button
              key={kind}
              type="button"
              onClick={() => void go(kind)}
              disabled={busy !== null}
              className="focus-ring flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-800 transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
            >
              {busy === kind ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Icon className="h-4 w-4 text-primary" aria-hidden="true" />}
              {VIEW_AS_LABELS[kind]}
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}

/** Shown on every app page while a super admin is viewing as a test account. */
export function ViewingAsBanner() {
  const { data: session } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!session?.user?.viewingAs) return null;

  async function back() {
    setBusy(true);
    setError("");
    const problem = await switchTo("back");
    if (problem) { setError(problem); setBusy(false); }
  }

  return (
    <div role="status" className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-100 px-4 py-2 text-sm text-amber-950">
      <span>
        <Eye className="mr-1 inline h-4 w-4" aria-hidden="true" />
        You&apos;re viewing as <b>{session.user.name ?? session.user.email}</b>, a test account.
      </span>
      <button
        type="button"
        onClick={() => void back()}
        disabled={busy}
        className="focus-ring inline-flex items-center gap-1 rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-amber-50 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />}
        Back to super admin
        <ShieldCheck className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
      </button>
      {error && <span role="alert" className="text-red-700">{error}</span>}
    </div>
  );
}
