"use client";

import { cn } from "@/lib/utils";

interface Rule {
  label: string;
  test: (p: string) => boolean;
}

const RULES: Rule[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "At least one uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "At least one number or special character", test: (p) => /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(p) },
];

function getStrength(password: string): { score: number; label: string } {
  const passed = RULES.filter((r) => r.test(password)).length;
  if (passed === 0) return { score: 0, label: "" };
  if (passed === 1) return { score: 1, label: "Weak" };
  if (passed === 2) return { score: 2, label: "Fair" };
  return { score: 3, label: "Strong" };
}

interface PasswordStrengthProps {
  password: string;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  if (!password) return null;

  const { score, label } = getStrength(password);

  const barColor =
    score === 1
      ? "bg-red-500"
      : score === 2
      ? "bg-amber-400"
      : "bg-emerald-500";

  const labelColor =
    score === 1
      ? "text-red-500"
      : score === 2
      ? "text-amber-500"
      : "text-emerald-600";

  return (
    <div className="mt-2 space-y-2">
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-300",
                i <= score ? barColor : "bg-zinc-200"
              )}
            />
          ))}
        </div>
        {label && (
          <span className={cn("text-xs font-medium", labelColor)}>{label}</span>
        )}
      </div>

      {/* Requirements checklist */}
      <ul className="space-y-0.5">
        {RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <li
              key={rule.label}
              className={cn(
                "flex items-center gap-1.5 text-xs transition-colors duration-200",
                ok ? "text-emerald-600" : "text-zinc-400"
              )}
            >
              <span className="shrink-0">{ok ? "✓" : "✗"}</span>
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
