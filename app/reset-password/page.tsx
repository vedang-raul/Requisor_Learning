"use client";

import { Suspense, useState } from "react";
import { motion } from "framer-motion";
import { Lock, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Reset failed.");
      else {
        setDone(true);
        setTimeout(() => router.push("/"), 2500);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-soft sm:p-10"
      >
        <div className="mb-6 text-center">
          <img src="/requisor.png" alt="Requisor logo" className="mx-auto mb-4 h-14 w-14 rounded-xl object-contain" />
          <h1 className="text-xl font-bold">Set a new password</h1>
        </div>

        {done ? (
          <p className="flex items-center justify-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Password updated! Redirecting to login…
          </p>
        ) : !token ? (
          <p className="flex items-center justify-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" /> Invalid reset link. Request a new one from the login page.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            {[
              { id: "password", label: "New password", value: password, set: setPassword },
              { id: "confirm", label: "Confirm password", value: confirm, set: setConfirm },
            ].map((f) => (
              <div key={f.id} className="space-y-1.5">
                <label htmlFor={f.id} className="text-xs font-medium text-zinc-700">{f.label}</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input id={f.id} type="password" autoComplete="new-password" placeholder="••••••••" value={f.value} onChange={(e) => f.set(e.target.value)} className="pl-10" />
                </div>
              </div>
            ))}
            {error && (
              <p className="flex items-start gap-1.5 text-xs text-red-600" role="alert">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Saving…" : <>Update password <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
