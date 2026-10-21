"use client";

import { useEffect, useId, useState } from "react";
import { signIn } from "next-auth/react";

const PROVIDER = "protected-test-accounts";
const OPTIONS = [
  { kind: "student", label: "Log in as test student", destination: "/app/dashboard/" },
  { kind: "university-admin", label: "Log in as test university admin", destination: "/app/admin/" },
  { kind: "super-admin", label: "Log in as test super admin", destination: "/app/admin/" },
] as const;

/** Password is held only while entering it and is sent directly to NextAuth over HTTPS. */
export function ProtectedTestLogins({ disabled = false }: { disabled?: boolean }) {
  const id = useId();
  const [available, setAvailable] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/providers/", { cache: "no-store", signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(providers => { if (!controller.signal.aborted) setAvailable(Boolean(providers?.[PROVIDER])); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (!available) return null;
  const busy = disabled || pending !== null;
  async function login(option: typeof OPTIONS[number]) {
    if (busy) return;
    setError("");
    if (password.length < 16 || password.length > 256) {
      setError("Enter the configured test password (at least 16 characters).");
      return;
    }
    setPending(option.kind);
    try {
      const result = await signIn(PROVIDER, { kind: option.kind, password, redirect: false, callbackUrl: option.destination });
      setPassword("");
      if (!result?.ok || result.error) {
        setError("Test login failed. Check the password or try again later.");
        return;
      }
      window.location.assign(option.destination);
    } catch {
      setPassword("");
      setError("Test login is unavailable. Please try again later.");
    } finally {
      setPending(null);
    }
  }
  return (
    <section aria-label="Password-protected test accounts" className="mt-3 min-w-0 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3">
      <p className="text-center text-xs font-semibold text-amber-900">Protected test accounts</p>
      <p className="mt-1 text-center text-[11px] leading-4 text-amber-900">
        Admin access can change live data. Use only for authorized testing.
      </p>
      <label htmlFor={id} className="mt-3 block text-xs font-medium text-amber-900">Test password</label>
      <input
        id={id}
        type="password"
        autoComplete="off"
        value={password}
        onChange={e => setPassword(e.target.value)}
        disabled={busy}
        maxLength={256}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="focus-ring mt-1 min-h-11 w-full min-w-0 rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm text-zinc-900"
      />
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
      {error && <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-red-800">{error}</p>}
    </section>
  );
}
