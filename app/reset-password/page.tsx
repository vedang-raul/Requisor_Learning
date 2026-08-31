"use client";

import { Suspense, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Turnstile } from "@marsidev/react-turnstile";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength } from "@/components/ui/password-strength";

// Cloudflare Turnstile — mirrors components/login-screen.tsx so both halves of
// the password-reset flow (request link, set new password) are gated together.
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

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const turnstileReadyRef = useRef(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaErrorCode, setCaptchaErrorCode] = useState<string | null>(null);

  const captchaFailureMessage = captchaErrorCode
    ? `Security check could not be completed (Cloudflare code ${captchaErrorCode}). Confirm the widget's site key and approved hostnames, then try again.`
    : CAPTCHA_FAILED_MESSAGE;

  /**
   * Request a token at submission time. The invisible widget runs in execution
   * mode, so no short-lived token is minted while the form is still being
   * filled in.
   */
  const getCaptchaToken = async (): Promise<string> => {
    for (let attempt = 0; attempt < 40 && !turnstileReadyRef.current; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!turnstileReadyRef.current) return "";

    const existing = turnstileRef.current?.getResponse() ?? captchaToken;
    if (existing) return existing;

    turnstileRef.current?.execute();
    try {
      const token = await turnstileRef.current?.getResponsePromise(10_000);
      return token ?? "";
    } catch {
      return "";
    }
  };

  /** Reset the single-use token once it has been handed to the reset request. */
  const resetCaptcha = () => {
    setCaptchaToken("");
    turnstileRef.current?.reset();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");

    if (CAPTCHA_ENABLED && !SITE_KEY) {
      setError(CAPTCHA_UNAVAILABLE_MESSAGE);
      return;
    }

    setLoading(true);
    const tok = CAPTCHA_ENABLED ? await getCaptchaToken() : "";
    if (CAPTCHA_ENABLED && !tok) {
      setError(captchaFailureMessage);
      setLoading(false);
      return;
    }
    if (CAPTCHA_ENABLED) resetCaptcha();
    try {
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, turnstileToken: tok }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error && /bot check|captcha|turnstile|security check/i.test(data.error)
            ? CAPTCHA_FAILED_MESSAGE
            : data.error ?? "Reset failed."
        );
      }
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
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium text-zinc-700">New password</label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <PasswordStrength password={password} />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm" className="text-xs font-medium text-zinc-700">Confirm password</label>
              <PasswordInput
                id="confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
              {confirm && password !== confirm && (
                <p className="text-xs text-red-500">Passwords don't match.</p>
              )}
            </div>

            {error && (
              <p className="flex items-start gap-1.5 text-xs text-red-600" role="alert">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Saving…" : <>Update password <ArrowRight className="h-4 w-4" /></>}
            </Button>

            {/* Cloudflare Turnstile — invisible bot-protection widget. Auto-executes
                on submit and resolves silently for legitimate users. */}
            {CAPTCHA_ENABLED && SITE_KEY && (
              <div aria-hidden="true" className="sr-only">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={SITE_KEY}
                  onWidgetLoad={() => {
                    turnstileReadyRef.current = true;
                    setCaptchaErrorCode(null);
                  }}
                  onSuccess={setCaptchaToken}
                  onExpire={() => setCaptchaToken("")}
                  onError={(errorCode) => {
                    turnstileReadyRef.current = false;
                    setCaptchaToken("");
                    setCaptchaErrorCode(errorCode);
                    console.warn("[turnstile] widget error:", errorCode);
                  }}
                  onUnsupported={() => {
                    turnstileReadyRef.current = false;
                    setCaptchaToken("");
                    setCaptchaErrorCode("unsupported-browser");
                    console.warn("[turnstile] browser is not supported");
                  }}
                  options={{
                    size: "invisible",
                    execution: "execute",
                    appearance: "execute",
                  }}
                />
              </div>
            )}
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
