"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { signIn } from "next-auth/react";
import { Turnstile } from "@marsidev/react-turnstile";
import type { TurnstileInstance } from "@marsidev/react-turnstile";

type View = "login" | "signup" | "success";
type PasswordField = "loginPassword" | "signupPassword" | "signupConfirm";
type Direction = "forward" | "back";

const VIEW_ORDER: Record<View, number> = { login: 0, signup: 1, success: 2 };
const CAPTCHA_ENABLED = process.env.NEXT_PUBLIC_TURNSTILE_ENABLED === "true";
const SITE_KEY = CAPTCHA_ENABLED ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "" : "";
const DEV_BYPASS_ENABLED = process.env.NODE_ENV !== "production";

interface SuccessCopy {
  title: string;
  body: string;
}

const COPY: Record<"login" | "signup", { subtitle: string; switchLead: string; switchAction: string }> = {
  login: {
    subtitle: "Sign in to your educator workspace",
    switchLead: "New here? ",
    switchAction: "Create a tutor account",
  },
  signup: {
    subtitle: "Join as a tutor",
    switchLead: "Already a tutor? ",
    switchAction: "Log in",
  },
};

export default function TutorAuth() {
  const [view, setView] = useState<View>("login");
  const [direction, setDirection] = useState<Direction>("forward");
  const [entering, setEntering] = useState<View | null>(null);
  const [submitting, setSubmitting] = useState<false | "login" | "signup" | "google" | "dev-tutor">(false);
  const [googleError, setGoogleError] = useState("");
  const [formError, setFormError] = useState("");
  const [successCopy, setSuccessCopy] = useState<SuccessCopy>({
    title: "Welcome back",
    body: "You're signed in to the tutor workspace.",
  });
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({
    loginPassword: false,
    signupPassword: false,
    signupConfirm: false,
  });

  const viewportRef = useRef<HTMLDivElement>(null);
  const loginRef = useRef<HTMLFormElement>(null);
  const signupRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const turnstileReadyRef = useRef(false);
  const [captchaToken, setCaptchaToken] = useState("");

  useLayoutEffect(() => {
    const el =
      view === "login" ? loginRef.current : view === "signup" ? signupRef.current : successRef.current;
    const vp = viewportRef.current;
    if (el && vp) vp.style.height = `${el.offsetHeight}px`;
  }, [view]);

  function go(next: View) {
    if (next === view) return;
    setGoogleError("");
    setFormError("");
    const dir: Direction = VIEW_ORDER[next] > VIEW_ORDER[view] ? "forward" : "back";
    setDirection(dir);
    setEntering(next);
    setView(next);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntering(null));
    });
  }

  function togglePassword(field: PasswordField) {
    setVisible((v) => ({ ...v, [field]: !v[field] }));
  }

  async function getCaptchaToken(): Promise<string> {
    if (!CAPTCHA_ENABLED) return "";

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
  }

  async function handleGoogle() {
    setGoogleError("");
    if (CAPTCHA_ENABLED && !SITE_KEY) {
      setGoogleError("Security verification is not configured. Please contact support.");
      return;
    }

    setSubmitting("google");
    const token = await getCaptchaToken();
    if (CAPTCHA_ENABLED && !token) {
      setGoogleError("Security check could not be completed. Please try again.");
      setSubmitting(false);
      return;
    }

    if (CAPTCHA_ENABLED) {
      setCaptchaToken("");
      turnstileRef.current?.reset();
    }

    try {
      const response = await fetch("/api/auth/google-initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, accountType: "tutor" }),
      });

      if (!response.ok) {
        setGoogleError("Security check could not be completed. Please try again.");
        setSubmitting(false);
        return;
      }

      void signIn("google", { callbackUrl: "/app/tutor/" });
    } catch {
      setGoogleError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    setSubmitting("login");
    const fields = new FormData(e.currentTarget);
    const token = await getCaptchaToken();
    if (CAPTCHA_ENABLED && !token) {
      setFormError("Security check could not be completed. Please try again.");
      setSubmitting(false);
      return;
    }
    try {
      const result = await signIn("credentials", {
        email: String(fields.get("email") ?? ""),
        password: String(fields.get("password") ?? ""),
        turnstileToken: token,
        redirect: false,
      });
      if (result?.error) {
        setFormError(
          result.error === "EMAIL_NOT_VERIFIED"
            ? "Please verify your email before logging in."
            : "Invalid email or password."
        );
        setSubmitting(false);
        return;
      }
      window.location.assign("/app/tutor/");
    } catch {
      setFormError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  async function handleDevTutor() {
    setFormError("");
    setSubmitting("dev-tutor");
    try {
      const result = await signIn("dev-tutor", {
        callbackUrl: "/app/tutor/",
        redirect: false,
      });
      if (result?.error) {
        setFormError("Development tutor access is unavailable.");
        setSubmitting(false);
        return;
      }
      window.location.assign("/app/tutor/");
    } catch {
      setFormError("Development tutor access is unavailable.");
      setSubmitting(false);
    }
  }

  async function handleSignup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    const fields = new FormData(e.currentTarget);
    const password = String(fields.get("password") ?? "");
    if (password !== String(fields.get("confirmPassword") ?? "")) {
      setFormError("Passwords don't match.");
      return;
    }
    setSubmitting("signup");
    const token = await getCaptchaToken();
    if (CAPTCHA_ENABLED && !token) {
      setFormError("Security check could not be completed. Please try again.");
      setSubmitting(false);
      return;
    }
    try {
      const subject = String(fields.get("subject") ?? "");
      const university = String(fields.get("university") ?? "");
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(fields.get("name") ?? ""),
          email: String(fields.get("email") ?? ""),
          password,
          // Tutor-specific profile fields map to the existing required
          // learner schema without granting any privileged role client-side.
          employmentType: "faculty",
          position: [subject, university].filter(Boolean).join(" — "),
          accountType: "tutor",
          turnstileToken: token,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setFormError(data?.error ?? "Signup failed. Please try again.");
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      setSuccessCopy({
        title: "Check your email",
        body: "Your tutor account was created. Verify your email before logging in.",
      });
      go("success");
    } catch {
      setFormError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  function panelClasses(name: View): string {
    const base =
      "flex flex-col gap-4 transition-all duration-[420ms] ease-[cubic-bezier(.65,0,.35,1)]";
    const isActive = name === view;
    const forwardOffset = "translate-x-6";
    const backOffset = "-translate-x-6";

    if (isActive) {
      if (entering === name) {
        const offset = direction === "forward" ? forwardOffset : backOffset;
        return `${base} relative opacity-0 ${offset} pointer-events-none`;
      }
      return `${base} relative opacity-100 translate-x-0 pointer-events-auto`;
    }
    const offset = direction === "forward" ? backOffset : forwardOffset;
    return `${base} absolute inset-x-0 top-0 opacity-0 ${offset} pointer-events-none`;
  }

  const activeCopy = view === "signup" ? COPY.signup : COPY.login;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-x-hidden bg-background p-4 font-sans text-zinc-900">

      <style>{`
        @keyframes ta-drift-a { 0%,100%{ transform: translate(0,0) scale(1); } 50%{ transform: translate(40px,30px) scale(1.08); } }
        @keyframes ta-drift-b { 0%,100%{ transform: translate(0,0) scale(1); } 50%{ transform: translate(-30px,-25px) scale(1.06); } }
        @keyframes ta-card-in { from{ opacity:0; transform: translateY(22px) scale(.985);} to{ opacity:1; transform:none; } }

        @keyframes ta-badge-in { from{ opacity:0; transform: translateY(6px) scale(.97);} to{ opacity:1; transform:none; } }
        @keyframes ta-badge-glow { 0%,100%{ box-shadow: 0 0 0 0 rgba(35,174,151,0);} 50%{ box-shadow: 0 0 0 6px rgba(35,174,151,0.08);} }
        @keyframes ta-draw-circle { to{ stroke-dashoffset:0; } }
        @keyframes ta-draw-check { to{ stroke-dashoffset:0; } }
        @keyframes ta-spin { to{ transform: rotate(360deg); } }
        .ta-card { animation: ta-card-in .7s cubic-bezier(.34,1.56,.64,1) .05s both; }

        .ta-check-circle { stroke-dasharray:76; stroke-dashoffset:76; animation: ta-draw-circle .5s cubic-bezier(.65,0,.35,1) forwards; }
        .ta-check-path { stroke-dasharray:20; stroke-dashoffset:20; animation: ta-draw-check .35s cubic-bezier(.65,0,.35,1) .45s forwards; }
        .ta-spinner { animation: ta-spin .7s linear infinite; }
        .ta-link { background-image: linear-gradient(currentColor, currentColor); background-position: 0 100%; background-repeat: no-repeat; background-size: 0% 1.5px; transition: background-size .25s cubic-bezier(.65,0,.35,1); }
        .ta-link:hover { background-size: 100% 1.5px; }
        @media (prefers-reduced-motion: reduce) {
          .ta-card, .ta-mascot, .ta-mascot:hover, .ta-blob-a, .ta-blob-b, .ta-badge { animation: none !important; }
        }
      `}</style>

      <div className="relative z-10 w-full max-w-md">
        <div className="ta-card rounded-2xl border border-zinc-200 bg-white p-8 shadow-soft sm:p-10">

          <div className="flex justify-center">
            <img src="/requisor.png" alt="Requisor logo" className="mx-auto mb-4 h-24 w-24 rounded-xl object-contain" width="96" height="96" />
          </div>

          <h1 className="text-center text-2xl font-bold [text-wrap:balance]">
            Requisor Learning
          </h1>
          <p className="mt-2 mb-6 min-h-[18px] text-center text-sm text-zinc-600">
            {activeCopy.subtitle}
          </p>

          {/* tabs */}
          <div className="relative mb-6 grid grid-cols-2 rounded-xl bg-zinc-100 p-1 text-sm font-medium">
            <div
              className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm transition-transform duration-[380ms] ease-[cubic-bezier(.65,0,.35,1)]"
              style={{ transform: view === "signup" ? "translateX(100%)" : "translateX(0)" }}
            />
            <button
              type="button"
              onClick={() => go("login")}
              aria-selected={view === "login"}
              role="tab"
              className={`focus-ring relative z-10 rounded-lg py-2 transition ${
                view !== "signup" ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => go("signup")}
              aria-selected={view === "signup"}
              role="tab"
              className={`focus-ring relative z-10 rounded-lg py-2 transition ${
                view === "signup" ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Create account
            </button>
          </div>

          {/* viewport */}
          <div
            ref={viewportRef}
            className="relative overflow-hidden transition-[height] duration-[380ms] ease-[cubic-bezier(.65,0,.35,1)]"
          >
            {/* LOGIN */}
            <form ref={loginRef} className={panelClasses("login")} onSubmit={handleLogin} noValidate>
              <Field label="Email">
                <IconInput icon={<MailIcon />} name="email" type="email" placeholder="you@requisor.io" autoComplete="email" required />
              </Field>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <label className="text-xs font-medium text-zinc-700" htmlFor="tutor-login-password">
                    Password
                  </label>
                  <a href="#" className="focus-ring ta-link pb-px text-xs font-medium text-primary">
                    Forgot password?
                  </a>
                </div>
                <IconInput
                  id="tutor-login-password"
                  name="password"
                  icon={<LockIcon />}
                  type={visible.loginPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  trailing={
                    <EyeToggle
                      shown={visible.loginPassword}
                      onClick={() => togglePassword("loginPassword")}
                    />
                  }
                />
              </div>

              <SubmitButton loading={submitting === "login"} label="Login" />
               {formError && <p className="text-xs text-red-600" role="alert">{formError}</p>}

              <Divider />
              <GoogleButton loading={submitting === "google"} onClick={handleGoogle} />
              {googleError && <p className="text-xs text-red-600" role="alert">{googleError}</p>}
              {DEV_BYPASS_ENABLED && (
                <div className="mt-1 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3">
                  <p className="text-center text-[11px] leading-4 text-amber-800">Development-only shortcut</p>
                  <button
                    type="button"
                    onClick={() => void handleDevTutor()}
                    disabled={Boolean(submitting)}
                    className="focus-ring mt-2 w-full rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting === "dev-tutor" ? "Opening tutor workspace…" : "Use development tutor access"}
                  </button>
                </div>
              )}

            </form>

            {/* SIGNUP */}
            <form ref={signupRef} className={panelClasses("signup")} onSubmit={handleSignup} noValidate>
              <Field label="Full name">
                <IconInput icon={<UserIcon />} name="name" type="text" placeholder="Your name" autoComplete="name" required />
              </Field>

              <Field label="Primary subject">
                <IconInput icon={<CapIcon />} name="subject" as="select" defaultValue="" required trailing={<ChevronIcon />}>
                  <option value="" disabled>
                    Select subject…
                  </option>
                  <option>Mathematics</option>
                  <option>Computer Science</option>
                  <option>Physics</option>
                  <option>Business</option>
                  <option>Writing</option>
                  <option>Other</option>
                </IconInput>
              </Field>

              <Field label="Email">
                <IconInput icon={<MailIcon />} name="email" type="email" placeholder="you@requisor.io" autoComplete="email" required />
              </Field>

              <Field label="University">
                <IconInput icon={<CapIcon />} name="university" type="text" placeholder="Your university" autoComplete="organization" required />
              </Field>
              <Field label="Password">
                <IconInput
                  icon={<LockIcon />}
                  name="password"
                  type={visible.signupPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  trailing={<EyeToggle shown={visible.signupPassword} onClick={() => togglePassword("signupPassword")} />}
                />
              </Field>

              <Field label="Confirm password">
                <IconInput
                  icon={<LockIcon />}
                  name="confirmPassword"
                  type={visible.signupConfirm ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  trailing={<EyeToggle shown={visible.signupConfirm} onClick={() => togglePassword("signupConfirm")} />}
                />
              </Field>

              <div className="ta-badge flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/10 p-3.5">
                <ShieldCheckIcon />
                <div className="min-w-0 flex-1">
                  <strong className="block text-sm font-medium">Tutor access included</strong>
                  <span className="block text-xs text-zinc-600">
                    Tutor accounts are approved instantly after email verification.
                  </span>
                </div>
                <span
                  className="relative h-[22px] w-[38px] flex-shrink-0 rounded-full bg-primary"
                  aria-hidden="true"
                >
                  <span className="absolute left-[18px] top-0.5 h-[18px] w-[18px] rounded-full bg-white" />
                </span>
              </div>

              <SubmitButton loading={submitting === "signup"} label="Create account" />
               {formError && <p className="text-xs text-red-600" role="alert">{formError}</p>}

              <Divider />
              <GoogleButton loading={submitting === "google"} onClick={handleGoogle} />
              {googleError && <p className="text-xs text-red-600" role="alert">{googleError}</p>}

            </form>

            {/* SUCCESS */}
            <div ref={successRef} className={panelClasses("success")}>
              <div className="flex flex-col items-center gap-3.5 px-1 pb-1.5 pt-2.5 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <svg className="h-[30px] w-[30px]" viewBox="0 0 36 36" fill="none">
                    <circle
                      cx="18"
                      cy="18"
                      r="12"
                      className="ta-check-circle stroke-[#23AE97] "
                      strokeWidth="2"
                    />
                    <path
                      d="M12 18l4 4 8-8"
                      className="ta-check-path stroke-[#23AE97] "
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h2 className="text-lg font-bold">{successCopy.title}</h2>
                <p className="max-w-[260px] text-sm text-zinc-600">{successCopy.body}</p>
                <button
                  type="button"
                  onClick={() => go("login")}
                  className="focus-ring group mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-medium text-white shadow-glow-sm transition-all duration-200 hover:bg-secondary active:scale-[0.98]"
                >
                  Continue to workspace
                  <ArrowIcon className="transition-transform duration-200 group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          </div>

          {CAPTCHA_ENABLED && SITE_KEY && (
            <div aria-hidden="true" className="sr-only">
              <Turnstile
                ref={turnstileRef}
                siteKey={SITE_KEY}
                onWidgetLoad={() => {
                  turnstileReadyRef.current = true;
                }}
                onSuccess={setCaptchaToken}
                onExpire={() => setCaptchaToken("")}
                onError={() => {
                  turnstileReadyRef.current = false;
                  setCaptchaToken("");
                }}
                onUnsupported={() => {
                  turnstileReadyRef.current = false;
                  setCaptchaToken("");
                }}
                options={{
                  size: "invisible",
                  execution: "execute",
                  appearance: "execute",
                }}
              />
            </div>
          )}

          <p className="mt-4 text-center text-xs text-zinc-600">
            {activeCopy.switchLead}
            <button
              type="button"
              onClick={() => go(view === "signup" ? "login" : "signup")}
              className="focus-ring ta-link pb-px font-medium text-primary"
            >
              {activeCopy.switchAction}
            </button>
          </p>

          <div className="mt-6 text-center">
            <p className="mb-2.5 text-[11px] leading-relaxed text-zinc-500">Requisor © 2026. All rights reserved.</p>
            <div className="group flex items-center justify-center gap-2.5 border-t border-zinc-200 pt-3">
             <img src="/msoe-logo.png" alt="Milwaukee School of Engineering" className="size-7 shrink-0 object-contain sm:size-8" width="32" height="32" />
              <div className="text-left text-[11px] leading-tight text-zinc-400">
                In association with
                <b className="block font-medium text-zinc-500">Milwaukee School of Engineering</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-zinc-700">{label}</label>
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div className="my-1 flex items-center gap-3 text-[11px] uppercase tracking-wider text-zinc-400">
      <span className="h-px flex-1 bg-zinc-200" />
      or
      <span className="h-px flex-1 bg-zinc-200" />
    </div>
  );
}

function GoogleButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="focus-ring flex w-full items-center justify-center gap-2.5 rounded-xl border border-zinc-300 bg-white py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-60"
    >
      <GoogleIcon />
      {loading ? "Connecting…" : "Continue with Google"}
    </button>
  );
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="focus-ring group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-medium text-white shadow-glow-sm transition-all duration-200 hover:bg-secondary active:scale-[0.98] disabled:cursor-progress disabled:pointer-events-none disabled:opacity-50"
    >
      {loading ? (
        <>
          <span>{label === "Login" ? "Signing in…" : "Creating account…"}</span>
          <span className="ta-spinner h-4 w-4 rounded-full border-2 border-white/40 border-t-white" />
        </>
      ) : (
        <>
          <span>{label}</span>
          <ArrowIcon className="transition-transform duration-200 group-hover:translate-x-1" />
        </>
      )}
    </button>
  );
}

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

function EyeToggle({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={shown ? "Hide password" : "Show password"}
      className={`flex items-center py-2 pl-1.5 pr-3 transition-all duration-200 active:scale-[.82] active:-rotate-6 ${
        shown ? "text-primary" : "text-zinc-400 hover:text-zinc-600"
      }`}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  );
}

type IconInputProps = {
  icon: ReactNode;
  trailing?: ReactNode;
  as?: "input" | "select";
  id?: string;
  children?: ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement> &
  React.SelectHTMLAttributes<HTMLSelectElement>;

function IconInput({ icon, trailing, as = "input", children, ...rest }: IconInputProps) {
  return (
    <div className="flex h-10 items-center rounded-xl border border-zinc-200 bg-white transition-all duration-200 focus-within:border-primary focus-within:shadow-[0_0_0_2px_rgba(35,174,151,0.4)] hover:border-zinc-300">
      <span className="ml-3.5 flex flex-shrink-0 text-zinc-500 transition-colors duration-200">
        {icon}
      </span>
      {as === "select" ? (
        <select
           className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent px-3 text-sm text-zinc-900 outline-none"
          {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
        >
          {children}
        </select>
      ) : (
        <input
           className="min-w-0 flex-1 bg-transparent px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-500"
          {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
      {trailing ?? null}
    </div>
  );
}

/* ---------- icons ---------- */

function MailIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 6l10 7 10-7" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 018 0v3" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}
function CapIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M22 10L12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg className="mr-3.5 flex-shrink-0 text-zinc-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function ShieldCheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="flex-shrink-0 text-primary">
      <path d="M12 3l7 3v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
