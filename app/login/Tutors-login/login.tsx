"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

type View = "login" | "signup" | "success";
type PasswordField = "loginPassword" | "signupPassword" | "signupConfirm";
type Direction = "forward" | "back";

const VIEW_ORDER: Record<View, number> = { login: 0, signup: 1, success: 2 };

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
    subtitle: "Join as a tutor — admin access included",
    switchLead: "Already a tutor? ",
    switchAction: "Log in",
  },
};

export default function TutorAuth() {
  const [view, setView] = useState<View>("login");
  const [direction, setDirection] = useState<Direction>("forward");
  const [entering, setEntering] = useState<View | null>(null);
  const [submitting, setSubmitting] = useState<false | "login" | "signup">(false);
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

  useLayoutEffect(() => {
    const el =
      view === "login" ? loginRef.current : view === "signup" ? signupRef.current : successRef.current;
    const vp = viewportRef.current;
    if (el && vp) vp.style.height = `${el.offsetHeight}px`;
  }, [view]);

  function go(next: View) {
    if (next === view) return;
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

  function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting("login");
    window.setTimeout(() => {
      setSubmitting(false);
      setSuccessCopy({ title: "Welcome back", body: "You're signed in to the tutor workspace." });
      go("success");
    }, 1100);
  }

  function handleSignup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting("signup");
    window.setTimeout(() => {
      setSubmitting(false);
      setSuccessCopy({
        title: "Account created",
        body: "Your tutor account is ready — admin access has been granted automatically.",
      });
      go("success");
    }, 1100);
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
    <div className="relative flex min-h-screen items-center justify-center overflow-x-hidden bg-[#F3F4F6] px-4 py-8 font-[Inter,system-ui,-apple-system,'Segoe_UI',Roboto,sans-serif] text-[#1E2430] dark:bg-[#12151A] dark:text-[#EDEFF3]">
      {/* local keyframes Tailwind can't express as utilities */}
      <style>{`
        @keyframes ta-drift-a { 0%,100%{ transform: translate(0,0) scale(1); } 50%{ transform: translate(40px,30px) scale(1.08); } }
        @keyframes ta-drift-b { 0%,100%{ transform: translate(0,0) scale(1); } 50%{ transform: translate(-30px,-25px) scale(1.06); } }
        @keyframes ta-card-in { from{ opacity:0; transform: translateY(22px) scale(.985);} to{ opacity:1; transform:none; } }
        @keyframes ta-mascot-bob { 0%,100%{ transform: translateY(0) rotate(0deg);} 50%{ transform: translateY(-6px) rotate(-2deg);} }
        @keyframes ta-mascot-wiggle { 0%,100%{ transform: rotate(0deg);} 25%{ transform: rotate(-8deg) scale(1.05);} 75%{ transform: rotate(8deg) scale(1.05);} }
        @keyframes ta-badge-in { from{ opacity:0; transform: translateY(6px) scale(.97);} to{ opacity:1; transform:none; } }
        @keyframes ta-badge-glow { 0%,100%{ box-shadow: 0 0 0 0 rgba(35,174,151,0);} 50%{ box-shadow: 0 0 0 6px rgba(35,174,151,0.08);} }
        @keyframes ta-draw-circle { to{ stroke-dashoffset:0; } }
        @keyframes ta-draw-check { to{ stroke-dashoffset:0; } }
        @keyframes ta-spin { to{ transform: rotate(360deg); } }
        .ta-card { animation: ta-card-in .7s cubic-bezier(.34,1.56,.64,1) .05s both; }
        .ta-mascot { animation: ta-mascot-bob 4.2s ease-in-out infinite; transform-origin: 50% 85%; }
        .ta-mascot:hover { animation: ta-mascot-wiggle .6s cubic-bezier(.34,1.56,.64,1); }
        .ta-blob-a { animation: ta-drift-a 22s ease-in-out infinite; }
        .ta-blob-b { animation: ta-drift-b 26s ease-in-out infinite; }
        .ta-badge { animation: ta-badge-in .5s cubic-bezier(.34,1.56,.64,1) .15s both, ta-badge-glow 3.2s ease-in-out .8s infinite; }
        .ta-check-circle { stroke-dasharray:76; stroke-dashoffset:76; animation: ta-draw-circle .5s cubic-bezier(.65,0,.35,1) forwards; }
        .ta-check-path { stroke-dasharray:20; stroke-dashoffset:20; animation: ta-draw-check .35s cubic-bezier(.65,0,.35,1) .45s forwards; }
        .ta-spinner { animation: ta-spin .7s linear infinite; }
        .ta-link { background-image: linear-gradient(currentColor, currentColor); background-position: 0 100%; background-repeat: no-repeat; background-size: 0% 1.5px; transition: background-size .25s cubic-bezier(.65,0,.35,1); }
        .ta-link:hover { background-size: 100% 1.5px; }
        @media (prefers-reduced-motion: reduce) {
          .ta-card, .ta-mascot, .ta-mascot:hover, .ta-blob-a, .ta-blob-b, .ta-badge { animation: none !important; }
        }
      `}</style>

      {/* ambient background */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="ta-blob-a absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[#E1F3EF] opacity-50 blur-[70px] dark:bg-[#14342F] dark:opacity-70" />
        <div className="ta-blob-b absolute -bottom-36 -right-24 h-[360px] w-[360px] rounded-full bg-[#DCEFFB] opacity-50 blur-[70px] dark:bg-[#123A4A] dark:opacity-70" />
      </div>

      <div className="relative z-10 w-full max-w-[408px]">
        <div className="ta-card rounded-[26px] bg-white px-8 pb-7 pt-9 shadow-[0_24px_60px_-20px_rgba(30,36,48,0.22),0_4px_14px_-6px_rgba(30,36,48,0.10)] dark:bg-[#1B1F26] dark:shadow-[0_24px_60px_-18px_rgba(0,0,0,0.55),0_4px_14px_-6px_rgba(30,36,48,0.35)]">
          {/* mascot */}
          <div className="mb-3.5 flex justify-center">
            <svg
              className="ta-mascot h-16 w-16 cursor-default"
              viewBox="0 0 64 64"
              fill="none"
              role="img"
              aria-label="Requisor mascot"
            >
              <circle cx="32" cy="32" r="32" className="fill-[#E7F6F3] dark:fill-[rgba(52,199,172,0.14)]" />
              <path
                d="M20 40c0-9.4 6.7-17 15-17h6c2.2 0 4 1.8 4 4v2c0 1.7-1.3 3-3 3h-1v6c0 4.4-3.6 8-8 8h-4c-5 0-9-2.7-9-6z"
                className="fill-[#23AE97] dark:fill-[#34C7AC]"
              />
              <circle cx="27" cy="30" r="1.8" fill="#fff" />
              <path d="M40 27l4-2.4v5.4z" className="fill-[#23AE97] dark:fill-[#34C7AC]" />
              <rect
                x="17"
                y="41"
                width="12"
                height="8"
                rx="2"
                fill="#fff"
                strokeWidth="1.6"
                className="stroke-[#23AE97] dark:stroke-[#34C7AC]"
              />
              <line x1="20" y1="44" x2="26" y2="44" strokeWidth="1.4" strokeLinecap="round" className="stroke-[#23AE97] dark:stroke-[#34C7AC]" />
              <line x1="20" y1="47" x2="24" y2="47" strokeWidth="1.4" strokeLinecap="round" className="stroke-[#23AE97] dark:stroke-[#34C7AC]" />
            </svg>
          </div>

          <h1 className="mb-1 text-center text-[25px] font-extrabold tracking-tight text-[#23AE97] [text-wrap:balance] dark:text-[#34C7AC]">
            Requisor Tutor
          </h1>
          <p className="mb-[22px] min-h-[18px] text-center text-sm text-[#6B7280] dark:text-[#9AA2AF]">
            {activeCopy.subtitle}
          </p>

          {/* tabs */}
          <div className="relative mb-[22px] grid grid-cols-2 rounded-[14px] bg-[#F4F4F5] p-1 dark:bg-[#23282F]">
            <div
              className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-[10px] bg-white shadow-[0_2px_8px_-2px_rgba(20,20,30,0.18)] transition-transform duration-[380ms] ease-[cubic-bezier(.65,0,.35,1)] dark:bg-[#1B1F26]"
              style={{ transform: view === "signup" ? "translateX(100%)" : "translateX(0)" }}
            />
            <button
              type="button"
              onClick={() => go("login")}
              aria-selected={view === "login"}
              role="tab"
              className={`relative z-10 rounded-[10px] px-2.5 py-2 text-[13.5px] font-semibold transition-colors duration-300 ${
                view !== "signup" ? "text-[#1E2430] dark:text-[#EDEFF3]" : "text-[#6B7280] hover:text-[#1E2430] dark:text-[#9AA2AF] dark:hover:text-[#EDEFF3]"
              }`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => go("signup")}
              aria-selected={view === "signup"}
              role="tab"
              className={`relative z-10 rounded-[10px] px-2.5 py-2 text-[13.5px] font-semibold transition-colors duration-300 ${
                view === "signup" ? "text-[#1E2430] dark:text-[#EDEFF3]" : "text-[#6B7280] hover:text-[#1E2430] dark:text-[#9AA2AF] dark:hover:text-[#EDEFF3]"
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
                <IconInput icon={<MailIcon />} type="email" placeholder="you@requisor.io" autoComplete="email" required />
              </Field>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <label className="text-[12.5px] font-semibold" htmlFor="tutor-login-password">
                    Password
                  </label>
                  <a href="#" className="ta-link pb-px text-[12.5px] font-semibold text-[#23AE97] dark:text-[#34C7AC]">
                    Forgot password?
                  </a>
                </div>
                <IconInput
                  id="tutor-login-password"
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

              <Divider />
              <GoogleButton />
            </form>

            {/* SIGNUP */}
            <form ref={signupRef} className={panelClasses("signup")} onSubmit={handleSignup} noValidate>
              <Field label="Full name">
                <IconInput icon={<UserIcon />} type="text" placeholder="Your name" autoComplete="name" required />
              </Field>

              <Field label="Primary subject">
                <IconInput icon={<CapIcon />} as="select" defaultValue="" required trailing={<ChevronIcon />}>
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
                <IconInput icon={<MailIcon />} type="email" placeholder="you@requisor.io" autoComplete="email" required />
              </Field>

              <Field label="Password">
                <IconInput
                  icon={<LockIcon />}
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
                  type={visible.signupConfirm ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  trailing={<EyeToggle shown={visible.signupConfirm} onClick={() => togglePassword("signupConfirm")} />}
                />
              </Field>

              <div className="ta-badge flex items-center gap-3 rounded-[14px] border border-[#CFEEE7] bg-[#E7F6F3] p-3.5 dark:border-[rgba(52,199,172,0.24)] dark:bg-[rgba(52,199,172,0.14)]">
                <ShieldCheckIcon />
                <div className="min-w-0 flex-1">
                  <strong className="block text-[13px] font-bold">Admin access included</strong>
                  <span className="block text-[11.5px] text-[#6B7280] dark:text-[#9AA2AF]">
                    Tutor accounts are approved instantly — no waiting on review.
                  </span>
                </div>
                <span
                  className="relative h-[22px] w-[38px] flex-shrink-0 rounded-full bg-[#23AE97] dark:bg-[#34C7AC]"
                  aria-hidden="true"
                >
                  <span className="absolute left-[18px] top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)]" />
                </span>
              </div>

              <SubmitButton loading={submitting === "signup"} label="Create account" />

              <Divider />
              <GoogleButton />
            </form>

            {/* SUCCESS */}
            <div ref={successRef} className={panelClasses("success")}>
              <div className="flex flex-col items-center gap-3.5 px-1 pb-1.5 pt-2.5 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E7F6F3] dark:bg-[rgba(52,199,172,0.14)]">
                  <svg className="h-[30px] w-[30px]" viewBox="0 0 36 36" fill="none">
                    <circle
                      cx="18"
                      cy="18"
                      r="12"
                      className="ta-check-circle stroke-[#23AE97] dark:stroke-[#34C7AC]"
                      strokeWidth="2"
                    />
                    <path
                      d="M12 18l4 4 8-8"
                      className="ta-check-path stroke-[#23AE97] dark:stroke-[#34C7AC]"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h2 className="text-[17px] font-extrabold">{successCopy.title}</h2>
                <p className="max-w-[260px] text-[13px] text-[#6B7280] dark:text-[#9AA2AF]">{successCopy.body}</p>
                <button
                  type="button"
                  onClick={() => go("login")}
                  className="group mt-1 flex w-full items-center justify-center gap-2 rounded-[13px] bg-[#23AE97] px-[18px] py-[13px] text-[14.5px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(35,174,151,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#1C9481] hover:shadow-[0_16px_32px_-10px_rgba(35,174,151,0.65)] active:scale-[.98] dark:bg-[#34C7AC] dark:hover:bg-[#45D3B9]"
                >
                  Continue to workspace
                  <ArrowIcon className="transition-transform duration-200 group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          </div>

          <p className="mt-1 text-center text-[13px] text-[#6B7280] dark:text-[#9AA2AF]">
            {activeCopy.switchLead}
            <button
              type="button"
              onClick={() => go(view === "signup" ? "login" : "signup")}
              className="ta-link pb-px font-bold text-[#23AE97] dark:text-[#34C7AC]"
            >
              {activeCopy.switchAction}
            </button>
          </p>

          <div className="mt-[22px] text-center">
            <p className="mb-2.5 text-[11.5px] text-[#9CA3AF] dark:text-[#6E7684]">Requisor © 2026. All rights reserved.</p>
            <div className="group flex items-center justify-center gap-2.5 border-t border-[#E5E7EB] pt-3 dark:border-[#2C323B]">
              <div className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[6px] bg-[#8C0F0F] text-[9px] font-extrabold leading-none text-white transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                MSOE
              </div>
              <div className="text-left text-[11.5px] text-[#9CA3AF] dark:text-[#6E7684]">
                In association with
                <b className="block text-[#6B7280] dark:text-[#9AA2AF]">Milwaukee School of Engineering</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- small building blocks ---------- */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12.5px] font-semibold">{label}</label>
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div className="my-1 flex items-center gap-3 text-[11px] font-bold tracking-wider text-[#9CA3AF] dark:text-[#6E7684]">
      <span className="h-px flex-1 bg-[#E5E7EB] dark:bg-[#2C323B]" />
      OR
      <span className="h-px flex-1 bg-[#E5E7EB] dark:bg-[#2C323B]" />
    </div>
  );
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="group flex items-center justify-center gap-2 rounded-[13px] bg-[#23AE97] px-[18px] py-[13px] text-[14.5px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(35,174,151,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#1C9481] hover:shadow-[0_16px_32px_-10px_rgba(35,174,151,0.65)] active:scale-[.98] disabled:cursor-progress disabled:saturate-[.7] disabled:hover:translate-y-0 dark:bg-[#34C7AC] dark:hover:bg-[#45D3B9]"
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

function GoogleButton() {
  return (
    <button
      type="button"
      className="flex items-center justify-center gap-2 rounded-[13px] border-[1.5px] border-[#E5E7EB] bg-white px-[18px] py-[13px] text-[14.5px] font-bold text-[#1E2430] transition-all duration-200 hover:-translate-y-px hover:border-[#D6D9DE] hover:bg-[#FAFAFB] hover:shadow-[0_6px_16px_-8px_rgba(20,20,30,0.18)] dark:border-[#2C323B] dark:bg-[#1B1F26] dark:text-[#EDEFF3] dark:hover:border-[#383F4A] dark:hover:bg-[#20242B]"
    >
      <GoogleIcon />
      Continue with Google
    </button>
  );
}

function EyeToggle({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={shown ? "Hide password" : "Show password"}
      className={`flex items-center py-2 pl-1.5 pr-3 transition-all duration-200 active:scale-[.82] active:-rotate-6 ${
        shown ? "text-[#23AE97] dark:text-[#34C7AC]" : "text-[#9CA3AF] hover:text-[#6B7280] dark:text-[#6E7684] dark:hover:text-[#9AA2AF]"
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
    <div className="flex items-center rounded-xl border-[1.5px] border-[#E5E7EB] bg-[#FAFAFB] transition-all duration-200 focus-within:border-[#23AE97] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(35,174,151,0.16)] hover:border-[#D6D9DE] dark:border-[#2C323B] dark:bg-[#20242B] dark:focus-within:border-[#34C7AC] dark:focus-within:bg-[#1B1F26] dark:focus-within:shadow-[0_0_0_4px_rgba(52,199,172,0.22)] dark:hover:border-[#383F4A] [&:focus-within_svg]:text-[#23AE97] dark:[&:focus-within_svg]:text-[#34C7AC]">
      <span className="ml-3.5 flex flex-shrink-0 text-[#9CA3AF] transition-colors duration-200 dark:text-[#6E7684]">
        {icon}
      </span>
      {as === "select" ? (
        <select
          className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent px-3 py-[11px] text-sm outline-none"
          {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
        >
          {children}
        </select>
      ) : (
        <input
          className="min-w-0 flex-1 bg-transparent px-3 py-[11px] text-sm outline-none placeholder:text-[#9CA3AF] dark:placeholder:text-[#6E7684]"
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
    <svg className="mr-3.5 flex-shrink-0 text-[#9CA3AF] dark:text-[#6E7684]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
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
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="flex-shrink-0 text-[#23AE97] dark:text-[#34C7AC]">
      <path d="M12 3l7 3v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.5l-6.5-5.4C29.4 34.9 26.8 36 24 36c-5.4 0-9.8-3.4-11.4-8.1l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.4-2.3 4.4-4.3 5.9l6.5 5.4C39.9 37 44 31 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}