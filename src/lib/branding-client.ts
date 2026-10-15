"use client";

import { useEffect, useState } from "react";

/**
 * The partner university and the list of universities, for the browser.
 * Each is fetched once per page load and shared by every component that asks.
 */
export type Partner = { id: number; name: string; shortName: string; logoUrl: string | null };
export type UniversityOption = Partner & { domains: string[] };

/** Fired after a super admin changes branding, so open pages show the change at once. */
export const BRANDING_CHANGED_EVENT = "requisor:branding-changed";

let partnerRequest: Promise<Partner | null> | null = null;
let universitiesRequest: Promise<UniversityOption[]> | null = null;

function loadPartner(): Promise<Partner | null> {
  partnerRequest ??= fetch("/api/branding/", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : { partner: null }))
    .then((data: { partner?: Partner | null }) => data.partner ?? null)
    .catch(() => null);
  return partnerRequest;
}

function loadUniversities(): Promise<UniversityOption[]> {
  universitiesRequest ??= fetch("/api/universities/")
    .then((res) => (res.ok ? res.json() : { universities: [] }))
    .then((data: { universities?: UniversityOption[] }) => (Array.isArray(data.universities) ? data.universities : []))
    .catch(() => []);
  return universitiesRequest;
}

/** Forgets what was loaded, so the next read asks the server again. */
export function refreshBranding() {
  partnerRequest = null;
  universitiesRequest = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BRANDING_CHANGED_EVENT));
}

/** The partner to show: undefined while loading, null when there is none. */
export function usePartner(): Partner | null | undefined {
  const [partner, setPartner] = useState<Partner | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const read = () => { loadPartner().then((p) => { if (alive) setPartner(p); }); };
    read();
    window.addEventListener(BRANDING_CHANGED_EVENT, read);
    return () => { alive = false; window.removeEventListener(BRANDING_CHANGED_EVENT, read); };
  }, []);
  return partner;
}

export function useUniversities(): UniversityOption[] | undefined {
  const [list, setList] = useState<UniversityOption[] | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadUniversities().then((u) => { if (alive) setList(u); });
    return () => { alive = false; };
  }, []);
  return list;
}

/** The university whose email domain matches an address, if any. */
export function universityForEmail(list: UniversityOption[] | undefined, email: string): UniversityOption | null {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  if (!domain || !list) return null;
  return list.find((u) => u.domains.includes(domain)) ?? null;
}
