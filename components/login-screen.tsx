"use client";

import { motion } from "framer-motion";
import { Lock, Mail, ArrowRight, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginScreen() {
  const { state, hydrated, login } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Already signed in? Straight to the dashboard.
  useEffect(() => {
    if (hydrated && state.user) router.replace("/app/dashboard/");
  }, [hydrated, state.user, router]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError("Enter a valid work email address.");
    if (password.length < 4) return setError("Password must be at least 4 characters.");
    setError("");
    setLoading(true);
    const name = email.split("@")[0].split(/[._-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    // Dummy auth — any credentials work in this demo build.
    setTimeout(() => {
      login(name, email);
      router.push("/app/dashboard/");
    }, 650);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-soft sm:p-10"
      >
        <div className="mb-8 text-center">
          <img src="/requisor.png" alt="Requisor logo" className="mx-auto mb-4 h-16 w-16 rounded-xl object-contain" />
          <h1 className="text-2xl font-bold">
            Requisor Learning
          </h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-2 flex items-center justify-center gap-1.5 text-sm text-zinc-600"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Welcome to your learning journey
          </motion.p>
        </div>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs font-medium text-zinc-700">Work email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input id="email" type="email" autoComplete="email" placeholder="you@requisor.io" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-medium text-zinc-700">Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" />
            </div>
          </div>

          {error && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-red-600" role="alert">
              {error}
            </motion.p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? (
              <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1 }}>Signing you in…</motion.span>
            ) : (
              <>Login <ArrowRight className="h-4 w-4" /></>
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-zinc-500">
          Demo build — any email &amp; password works. Internal use only ·{" "}
          <span className="text-zinc-600">Requisor © 2026</span>
        </p>
      </motion.div>
    </div>
  );
}
