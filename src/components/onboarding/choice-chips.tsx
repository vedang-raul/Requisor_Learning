"use client";

import { useId, useState } from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tap-to-pick answers for onboarding: one choice (`multiple={false}`) or any
 * number. "Other" opens a short text box for anything not listed. Each option
 * is a toggle button (aria-pressed), so it works by keyboard and screen reader.
 */
export function ChoiceChips({
  label,
  options,
  picked,
  onPickedChange,
  multiple = true,
  other,
  onOtherChange,
  otherPlaceholder = "Type your own…",
  max,
  cleanOther = (value: string) => value,
}: {
  label: string;
  options: string[];
  picked: string[];
  onPickedChange: (picked: string[]) => void;
  multiple?: boolean;
  /** Text typed under "Other". Leave out onOtherChange to hide the "Other" option. */
  other?: string;
  onOtherChange?: (value: string) => void;
  otherPlaceholder?: string;
  /** At most this many picks (counting "Other"); the rest are disabled once reached. */
  max?: number;
  /** Tidies what is typed under "Other" (e.g. letters only). */
  cleanOther?: (value: string) => string;
}) {
  const id = useId();
  const [otherOpen, setOtherOpen] = useState(Boolean(other));
  const full = multiple && max !== undefined && picked.length + (otherOpen ? 1 : 0) >= max;

  function toggle(option: string) {
    const on = picked.includes(option);
    if (multiple) onPickedChange(on ? picked.filter((p) => p !== option) : [...picked, option]);
    else {
      onPickedChange(on ? [] : [option]);
      // One answer only: picking a listed option replaces anything typed.
      if (!on && onOtherChange) { onOtherChange(""); setOtherOpen(false); }
    }
  }

  function toggleOther() {
    const next = !otherOpen;
    setOtherOpen(next);
    if (!next) onOtherChange?.("");
    else if (!multiple) onPickedChange([]);
  }

  const chip = (on: boolean) => cn(
    "focus-ring inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
    on ? "border-primary bg-primary/10 text-primary" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
  );

  return (
    <div>
      <p id={`${id}-label`} className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
        <span className={max ? "ml-1 normal-case tracking-normal text-zinc-400" : "sr-only"}>
          {multiple ? (max ? `(up to ${max})` : " (pick any)") : " (pick one)"}
        </span>
      </p>
      <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const on = picked.includes(option);
          return (
            <button key={option} type="button" aria-pressed={on} disabled={!on && full} onClick={() => toggle(option)} className={cn(chip(on), "disabled:opacity-40")}>
              {on && <Check className="h-3 w-3" aria-hidden="true" />}
              {option}
            </button>
          );
        })}
        {onOtherChange && (
          <button type="button" aria-pressed={otherOpen} aria-expanded={otherOpen} disabled={!otherOpen && full} onClick={toggleOther} className={cn(chip(otherOpen), "disabled:opacity-40")}>
            {otherOpen ? <Check className="h-3 w-3" aria-hidden="true" /> : <Plus className="h-3 w-3" aria-hidden="true" />}
            Other
          </button>
        )}
      </div>
      {onOtherChange && otherOpen && (
        <input
          autoFocus
          type="text"
          aria-label={`${label}: other`}
          value={other ?? ""}
          maxLength={120}
          onChange={(e) => onOtherChange(cleanOther(e.target.value))}
          placeholder={otherPlaceholder}
          className="focus-ring mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 hover:border-zinc-300 focus:border-primary/50"
        />
      )}
    </div>
  );
}
