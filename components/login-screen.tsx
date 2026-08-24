"use client";

import { motion } from "framer-motion";
import { Mail, ArrowRight, User, CheckCircle2, AlertCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Turnstile } from "@marsidev/react-turnstile";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength } from "@/components/ui/password-strength";
import { cn } from "@/lib/utils";

type Mode = "login" | "signup" | "forgot";

// Cloudflare Turnstile public site key. The integration is disabled by
// default until both the client flag and server flag are enabled.
const CAPTCHA_ENABLED = process.env.NEXT_PUBLIC_TURNSTILE_ENABLED === "true";
const SITE_KEY =
  CAPTCHA_ENABLED
    ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ??
      (process.env.NODE_ENV === "production"
        ? ""
        : "1x00000000000000000000AA")
    : "";
const CAPTCHA_UNAVAILABLE_MESSAGE =
  "Security verification is not configured. Please contact support.";
const CAPTCHA_FAILED_MESSAGE =
  "Security check could not be completed. Please try again.";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export function LoginScreen() {
  const { state, hydrated } = useStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [position, setPosition] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  // Cloudflare Turnstile — invisible bot-protection challenge.
  // The widget auto-executes when the component mounts and stores the token
  // in state.  Each token is single-use: after a submission the widget resets
  // and immediately re-executes so a fresh token is ready for the next action.
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [captchaToken, setCaptchaToken] = useState<string>("");

  // Already signed in? Straight to the dashboard.
  useEffect(() => {
    if (hydrated && state.user) router.replace("/app/dashboard/");
  }, [hydrated, state.user, router]);

  // Surface verification / auth redirect messages.
  useEffect(() => {
    const verify = searchParams.get("verify");
    const authError = searchParams.get("error");
    if (verify === "success") setNotice("Email verified! You can log in now.");
    else if (verify === "expired") setError("That verification link has expired. Sign up again to get a new one.");
    else if (verify === "invalid") setError("Invalid verification link.");
    else if (authError) {
      const googleErrors: Record<string, string> = {
        GoogleSignInFailed:
          "Google sign-in couldn't be completed. Use a verified Google account, or use your password if you already have one.",
      };
      setError(
        googleErrors[authError] ??
          (authError === "AccessDenied" ? "Access denied." : "Sign-in failed. Please try again.")
      );
    }
  }, [searchParams]);

  const validEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

  /** Safely parse JSON from a fetch Response — returns null if the body is HTML or unparseable. */
  const safeJson = async (res: Response): Promise<Record<string, string> | null> => {
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) return null;
    try { return await res.json(); } catch { return null; }
  };

  const authErrorMessage = (authError: string): string => {
    if (/bot check|captcha|turnstile|security check/i.test(authError)) {
      return CAPTCHA_FAILED_MESSAGE;
    }
    if (/configuration|config error/i.test(authError)) {
      return CAPTCHA_UNAVAILABLE_MESSAGE;
    }
    return authError;
  };

  /**
   * Consume the current CAPTCHA token for one request and reset the widget
   * so a fresh token is ready for the next submission.
   * Returns the token string (may be empty if the widget hasn't resolved yet).
   */
  const consumeToken = (): string => {
    const tok = captchaToken;
    setCaptchaToken("");
    turnstileRef.current?.reset();
    return tok;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!validEmail(email)) return setError("Enter a valid work email address.");

    if (mode === "forgot") {
      if (CAPTCHA_ENABLED && !SITE_KEY) {
        setError(CAPTCHA_UNAVAILABLE_MESSAGE);
        return;
      }
      const tok = CAPTCHA_ENABLED ? consumeToken() : "";
      if (CAPTCHA_ENABLED && !tok) {
        setError("Security check is loading — please try again in a moment.");
        turnstileRef.current?.execute();
        return;
      }
      setLoading(true);
      try {
        const res = await fetch("/api/forgot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, turnstileToken: tok }),
        });
        const data = await safeJson(res);
        if (!res.ok) {
          setError(
            data?.error && /bot check|captcha|turnstile|security check/i.test(data.error)
              ? CAPTCHA_FAILED_MESSAGE
              : data?.error ?? "Something went wrong. Please try again."
          );
        }
        else setNotice("If that email has an account, a reset link is on its way from support@requisor.io.");
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (password.length < 8) return setError("Password must be at least 8 characters.");

    if (CAPTCHA_ENABLED && !SITE_KEY) {
      setError(CAPTCHA_UNAVAILABLE_MESSAGE);
      return;
    }

    const tok = CAPTCHA_ENABLED ? consumeToken() : "";
    if (CAPTCHA_ENABLED && !tok) {
      setError("Security check is loading — please try again in a moment.");
      turnstileRef.current?.execute();
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        if (!name.trim()) {
          setError("Enter your full name.");
          setLoading(false);
          return;
        }
        if (!employmentType) {
          setError("Select your employment type.");
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError("Passwords don't match.");
          setLoading(false);
          return;
        }
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password, employmentType, position, turnstileToken: tok }),
        });
        const data = await safeJson(res);
        if (!res.ok) {
          setError(
            data?.error && /bot check|captcha|turnstile|security check/i.test(data.error)
              ? CAPTCHA_FAILED_MESSAGE
              : data?.error ?? "Signup failed. Please try again."
          );
        }
        else {
          setNotice("Account created! Check your inbox — we sent a verification link from support@requisor.io.");
          setMode("login");
          setPassword("");
          setConfirmPassword("");
        }
      } else {
        // credentials login — NextAuth includes extra signIn() fields in the
        // POST body so the server can extract and verify turnstileToken.
        const res = await signIn("credentials", {
          email,
          password,
          redirect: false,
          turnstileToken: tok,
        });
        if (res?.error) {
          setError(
            res.error === "EMAIL_NOT_VERIFIED"
              ? "Please verify your email first — check your inbox for the link from support@requisor.io."
              : res.error === "CredentialsSignin"
                ? "Invalid email or password."
                : authErrorMessage(res.error)
          );
        } else {
          router.push("/app/dashboard/");
        }
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setError("");
    if (CAPTCHA_ENABLED && !SITE_KEY) {
      setError(CAPTCHA_UNAVAILABLE_MESSAGE);
      return;
    }

    const tok = CAPTCHA_ENABLED ? consumeToken() : "";
    if (CAPTCHA_ENABLED && !tok) {
      setError("Security check is loading — please try again in a moment.");
      turnstileRef.current?.execute();
      return;
    }
    setLoading(true);
    try {
      // Verify the CAPTCHA token server-side before initiating the Google
      // OAuth redirect.  The actual authentication still happens on Google's
      // servers; this step stops bots from automating the redirect initiation.
      const res = await fetch("/api/auth/google-initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tok }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        setError(
          data?.error && /configuration|config error/i.test(data.error)
            ? CAPTCHA_UNAVAILABLE_MESSAGE
            : CAPTCHA_FAILED_MESSAGE
        );
        setLoading(false);
        return;
      }
      void signIn("google", { callbackUrl: "/app/dashboard/" });
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-soft sm:p-10"
      >
        <div className="mb-6 text-center">
          <img src="/requisor.png" alt="Requisor logo" className="mx-auto mb-4 h-24 w-24 rounded-xl object-contain" />
          <h1 className="text-2xl font-bold">Requisor Learning</h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-2 flex items-center justify-center gap-1.5 text-sm text-zinc-600"
          >
            {mode === "forgot" ? "Reset your password" : "Welcome to your learning journey"}
          </motion.p>
        </div>

        {mode !== "forgot" && (
          <div className="mb-6 grid grid-cols-2 rounded-xl bg-zinc-100 p-1 text-sm font-medium">
            {(["login", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(""); setNotice(""); }}
                className={cn(
                  "focus-ring rounded-lg py-2 transition",
                  mode === m ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                )}
              >
                {m === "login" ? "Log in" : "Create account"}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4" noValidate>
          {mode === "signup" && (
            <>
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-xs font-medium text-zinc-700">Full name</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input id="name" autoComplete="name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="pl-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="employmentType" className="text-xs font-medium text-zinc-700">Type</label>
                <select
                  id="employmentType"
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Select type…</option>
                  <option value="intern">Intern</option>
                  <option value="job">Employee</option>
                  <option value="student">Student</option>
                  <option value="faculty">Faculty</option>
                </select>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs font-medium text-zinc-700">Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input id="email" type="email" autoComplete="email" placeholder="you@requisor.io" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" />
            </div>
          </div>

          {mode !== "forgot" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-medium text-zinc-700">Password</label>
                {mode === "login" && (
                  <button type="button" onClick={() => { setMode("forgot"); setError(""); setNotice(""); }} className="focus-ring text-xs font-medium text-primary hover:underline">
                    Forgot password?
                  </button>
                )}
              </div>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
              {mode === "signup" && <PasswordStrength password={password} />}
            </div>
          )}

          {mode === "signup" && (
            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="text-xs font-medium text-zinc-700">Confirm password</label>
              <PasswordInput
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500">Passwords don&apos;t match.</p>
              )}
            </div>
          )}

          {error && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-1.5 text-xs text-red-600" role="alert">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}
            </motion.p>
          )}
          {notice && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-1.5 text-xs text-emerald-600" role="status">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{notice}
            </motion.p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? (
              <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
                {mode === "signup" ? "Creating your account…" : mode === "forgot" ? "Sending…" : "Signing you in…"}
              </motion.span>
            ) : mode === "signup" ? (
              <>Create account <ArrowRight className="h-4 w-4" /></>
            ) : mode === "forgot" ? (
              <>Send reset link <ArrowRight className="h-4 w-4" /></>
            ) : (
              <>Login <ArrowRight className="h-4 w-4" /></>
            )}
          </Button>
        </form>

        {mode === "forgot" ? (
          <button type="button" onClick={() => { setMode("login"); setError(""); setNotice(""); }} className="focus-ring mt-4 w-full text-center text-xs font-medium text-primary hover:underline">
            ← Back to login
          </button>
        ) : (
          <>
            <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-zinc-400">
              <span className="h-px flex-1 bg-zinc-200" />or<span className="h-px flex-1 bg-zinc-200" />
            </div>
            <button
              type="button"
              onClick={google}
              disabled={loading}
              className="focus-ring flex w-full items-center justify-center gap-2.5 rounded-xl border border-zinc-300 bg-white py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </>
        )}

        {/* Cloudflare Turnstile — invisible bot-protection widget.
            Rendered as a visually hidden element; the widget auto-executes on
            mount and resolves silently for legitimate users.  After each form
            submission the widget is reset and re-executes to keep a fresh
            token ready for the next action. */}
        {CAPTCHA_ENABLED && SITE_KEY && (
          <div aria-hidden="true" className="sr-only">
            <Turnstile
              ref={turnstileRef}
              siteKey={SITE_KEY}
              onSuccess={setCaptchaToken}
              onExpire={() => setCaptchaToken("")}
              onError={() => setCaptchaToken("")}
              options={{ size: "invisible" } as object}
            />
          </div>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-zinc-500">
           Requisor © 2026. All rights reserved.
        </p>

        <div className="mt-4 flex items-center justify-center gap-2.5">
          <img src="/msoe-logo.png" alt="Milwaukee School of Engineering" className="h-8 w-8 object-contain " />
          <span className="text-[11px] text-zinc-400 leading-tight">In association with<br /><span className="font-medium text-zinc-500">Milwaukee School of Engineering</span></span>
        </div>
      </motion.div>
    </div>
  );
}
