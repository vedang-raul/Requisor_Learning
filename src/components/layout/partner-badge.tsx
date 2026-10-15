"use client";

import { cn } from "@/lib/utils";
import { usePartner } from "@/lib/branding-client";

/**
 * "In association with <university>", with its logo. Which university is
 * decided by super admins (see the Universities tab of the admin panel): a
 * signed-in member sees their own; everyone else the chosen public partner.
 * Shows nothing while loading or when there is no partner.
 */
export function PartnerBadge({
  className,
  logoClassName = "h-8 w-8",
  textClassName = "text-[11px] text-zinc-400",
  nameClassName = "font-medium text-zinc-500",
  useShortName = false,
}: {
  className?: string;
  logoClassName?: string;
  textClassName?: string;
  nameClassName?: string;
  /** "MSOE" rather than "Milwaukee School of Engineering", for tight spaces. */
  useShortName?: boolean;
}) {
  const partner = usePartner();
  if (!partner) return null;
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {partner.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={partner.logoUrl} alt={partner.name} className={cn("shrink-0 object-contain", logoClassName)} width="32" height="32" />
      )}
      <span className={cn("text-left leading-tight", textClassName)}>
        In association with
        <span className={cn("block", nameClassName)}>{useShortName ? partner.shortName : partner.name}</span>
      </span>
    </div>
  );
}

/** The partner's name on its own, for sentences. Empty while loading or when there is none. */
export function PartnerName({ short = false }: { short?: boolean }) {
  const partner = usePartner();
  return <>{partner ? (short ? partner.shortName : partner.name) : ""}</>;
}
