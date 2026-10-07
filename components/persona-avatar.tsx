"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { getPersona, getPersonaAvatarUrl } from "@/lib/personas";

/**
 * Renders a persona as an illustrated human character portrait (DiceBear's
 * "avataaars" style — MIT-licensed, rendered from api.dicebear.com). Every
 * persona's look (hairstyle, hair color, skin tone, clothing, expression) is
 * a fixed combination hand-picked in lib/personas.ts — the user freely picks
 * which persona to use, but nothing about the portrait is inferred from or
 * tied to anything about the user themselves.
 *
 * This depends on api.dicebear.com being reachable at runtime. If that ever
 * needs to go away (offline use, reliability), swap getPersonaAvatarUrl in
 * lib/personas.ts to render via the self-hosted @dicebear/core package
 * instead — nothing here would need to change.
 */
export type PersonaAvatarState = "idle" | "listening" | "speaking";

const SIZE_PX: Record<"xs" | "sm" | "md" | "lg" | "xl" | "xxl", number> = {
  xs: 28,
  sm: 36,
  md: 56,
  lg: 88,
  xl: 128,
  xxl: 200,
};

export function PersonaAvatar({
  personaId,
  size = "md",
  state = "idle",
  className,
  imageSrc,
  imageAlt,
}: {
  personaId?: string | null;
  /** A portrait to show instead of the persona's, e.g. the chosen voice character's. Falls back to the persona if it can't load. */
  imageSrc?: string;
  imageAlt?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "xxl";
  state?: PersonaAvatarState;
  className?: string;
}) {
  const persona = getPersona(personaId);
  const px = SIZE_PX[size];
  const [c1, c2] = persona.accentHex;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Remembers which override portrait failed, so a different one is still tried.
  const [failedOverride, setFailedOverride] = useState<string | null>(null);
  const override = imageSrc && imageSrc !== failedOverride ? imageSrc : null;

  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full", className)}
      style={{ width: px, height: px }}
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
        aria-hidden="true"
      />
      <div
        className="relative h-full w-full overflow-hidden rounded-full ring-1 ring-inset ring-white/40"
        style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
      >
        {override ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={override}
            src={override}
            alt={imageAlt ?? persona.name}
            width={px}
            height={px}
            className="h-full w-full object-cover"
            onError={() => setFailedOverride(override)}
          />
        ) : failed ? (
          <span
            className="flex h-full w-full items-center justify-center text-white"
            style={{ fontSize: px * 0.4, fontWeight: 700 }}
            aria-label={persona.name}
          >
            {persona.name[0]}
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={getPersonaAvatarUrl(persona, px * 2)}
            alt={persona.name}
            width={px}
            height={px}
            className={cn("h-full w-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </div>
  );
}

export { getPersona };
