"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Clock, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Where someone waits after asking to join a university with an email that
 * isn't on its list (see membershipForNewAccount). src/middleware.ts sends
 * every app page here and blocks every data API until the university admin
 * approves them. The session is re-checked every 20 seconds; once approved
 * they're taken into the app.
 */
const RECHECK_MS = 20_000;

export default function PendingApprovalPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const pending = session?.user?.pending === true;

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
    // A full page load, not router.replace: the client router remembers that
    // the dashboard redirected here while pending and would bounce straight
    // back. It also starts the app fresh now that they're a member.
    else if (status === "authenticated" && !pending) window.location.replace("/app/dashboard/");
  }, [status, pending, router]);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void update(), RECHECK_MS);
    return () => clearInterval(timer);
  }, [pending, update]);

  if (!pending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="Loading" />
      </main>
    );
  }

  const university = session?.user?.pendingUniversity;
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-6 text-center shadow-sm sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <Clock className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-zinc-900">Waiting for approval</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Your request to join {university ? <strong className="text-zinc-900">{university}</strong> : "your university"} has
          been sent to its university admin. You&apos;ll be able to sign in to your courses as soon as they approve it, and
          we&apos;ll email you at <strong className="text-zinc-900">{session?.user?.email}</strong>.
        </p>
        <p className="mt-3 text-xs text-zinc-500">
          Signing up with your university email next time gets you in straight away.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => void signOut({ callbackUrl: "/" })}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </main>
  );
}
