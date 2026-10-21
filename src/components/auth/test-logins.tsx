"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

const PROVIDER = "public-test-accounts";
const OPTIONS = [
  { kind: "student", label: "Log in as test student", destination: "/app/dashboard/" },
  { kind: "tutor", label: "Log in as test tutor", destination: "/app/tutor/" },
  { kind: "university-admin", label: "Log in as test university admin", destination: "/app/admin/" },
  { kind: "super-admin", label: "Log in as test super admin", destination: "/app/admin/" },
] as const;

/** Public shortcuts, visible only when the server explicitly enables them. */
export function TestLogins({ disabled = false }: { disabled?: boolean }) {
  const [available, setAvailable] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/providers/", { cache: "no-store", signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(providers => {
        if (!controller.signal.aborted) setAvailable(Boolean(providers?.[PROVIDER] && providers?.["dev-tutor"]));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (!available) return null;
  const busy = disabled || pending !== null;
  async function login(option: typeof OPTIONS[number]) {
    if (busy) return;
    setError("");
    setPending(option.kind);
    try {
      const provider = option.kind === "tutor" ? "dev-tutor" : PROVIDER;
      const result = await signIn(provider, { kind: option.kind, redirect: false, callbackUrl: option.destination });
      if (!result?.ok || result.error) {
        setError("Test login is unavailable. Please try again later.");
        return;
      }
      window.location.assign(option.destination);
    } catch {
      setError("Test login is unavailable. Please try again later.");
    } finally {
      setPending(null);
    }
  }
  return (
    <section aria-label="Test logins" className="mt-3 min-w-0 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3">
      <p className="text-center text-[11px] leading-4 text-amber-900">Testing shortcuts — no password needed</p>
      {OPTIONS.map(option => (
        <button
          key={option.kind}
          type="button"
          onClick={() => void login(option)}
          disabled={busy}
          className="focus-ring mt-2 min-h-11 w-full rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === option.kind ? "Signing in…" : option.label}
        </button>
      ))}
      {error && <p role="alert" className="mt-2 text-xs text-red-800">{error}</p>}
    </section>
  );
}
