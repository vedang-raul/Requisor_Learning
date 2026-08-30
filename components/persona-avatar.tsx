"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { getPersona, type Persona } from "@/lib/personas";

/**
 * Renders a persona as an abstract glowing "digital companion" orb — not a
 * human portrait. Diversity between personas is expressed purely through
 * color and silhouette (the `variant` field), a stylistic choice the user
 * picks for themselves; it is never derived from or tied to anything about
 * the user (see lib/personas.ts).
 */
export type PersonaAvatarState = "idle" | "listening" | "speaking";

const SIZE_PX: Record<"xs" | "sm" | "md" | "lg" | "xl", number> = {
  xs: 28,
  sm: 36,
  md: 56,
  lg: 88,
  xl: 128,
};

function VariantMark({ variant, id, color }: { variant: Persona["variant"]; id: string; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2.5, fill: "none" } as const;
  switch (variant) {
    case "wave":
      return <path d="M28 34 Q40 22 50 30 Q60 38 72 26" strokeLinecap="round" {...stroke} />;
    case "spike":
      return (
        <path
          d="M30 36 L38 20 L46 34 L50 18 L54 34 L62 20 L70 36"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...stroke}
        />
      );
    case "coil":
      return <path d="M30 34 Q38 20 50 28 Q62 36 70 22" strokeLinecap="round" {...stroke} />;
    case "halo":
      return <ellipse cx="50" cy="24" rx="20" ry="7" {...stroke} />;
    case "fin":
      return <path d="M50 12 Q62 22 56 38 Q50 30 50 12 Z" fill={color} stroke="none" opacity={0.85} />;
    case "orbit":
      return (
        <>
          <circle cx="50" cy="30" r="24" strokeDasharray="2 5" {...stroke} opacity={0.6} />
          <circle cx="74" cy="30" r="3.5" fill={color} stroke="none" />
        </>
      );
  }
}

export function PersonaAvatar({
  personaId,
  size = "md",
  state = "idle",
  className,
}: {
  personaId?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  state?: PersonaAvatarState;
  className?: string;
}) {
  const persona = getPersona(personaId);
  const gradId = useId();
  const px = SIZE_PX[size];
  const [c1, c2] = persona.accentHex;

  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full", className)}
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      {/* Outer glow ring — brightens while listening/speaking */}
      <span
        className={cn(
          "absolute inset-0 rounded-full opacity-60 blur-md transition-opacity duration-300",
          state === "idle" && "animate-persona-breathe",
          state === "listening" && "animate-persona-pulse opacity-90",
          state === "speaking" && "animate-persona-pulse-fast opacity-100"
        )}
        style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
      />
      <svg viewBox="0 0 100 100" width={px} height={px} className="relative rounded-full">
        <defs>
          <radialGradient id={`bg-${gradId}`} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor={c1} stopOpacity="0.95" />
            <stop offset="100%" stopColor={c2} stopOpacity="1" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill={`url(#bg-${gradId})`} />
        <circle cx="50" cy="50" r="48" fill="none" stroke="white" strokeOpacity="0.25" strokeWidth="1.5" />
        {/* Radial "energy" facets */}
        <circle cx="50" cy="58" r="22" fill="white" fillOpacity="0.1" />
        <VariantMark variant={persona.variant} id={gradId} color="rgba(255,255,255,0.9)" />
        {/* Core — pulses with speech */}
        <circle
          cx="50"
          cy="60"
          r="7"
          fill="white"
          className={cn(
            state === "speaking" && "animate-persona-core",
            state === "listening" && "animate-persona-core-slow"
          )}
        />
      </svg>
    </div>
  );
}

export { getPersona };
