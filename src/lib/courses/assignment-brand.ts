import { isResourceFileUrl } from "@/lib/courses/resource-files";
import type { Lesson } from "@/lib/types";

/**
 * Branded assignments: an assignment sponsored by a company or organisation.
 * Its name, logo, banner, colour and links show throughout the assignment
 * (src/components/lesson/lesson-assignments.tsx). Optionally, learners sign a
 * confidentiality agreement (NDA) before they can read the brief or hand in:
 * the brief is then withheld from the course data learners receive and served
 * by /api/assignment/nda only after they sign.
 *
 * The brief itself is the lesson's ordinary assignment: one brief for all, or a
 * brief per learner written by AI inside the tutor's guardrails.
 */
export type BrandLink = { label: string; url: string };
export type AssignmentBrand = {
  /** The sponsor, as learners see it: "Sponsored by …". */
  name: string;
  logoUrl?: string;
  bannerUrl?: string;
  /** #RRGGBB: the assignment's buttons, border and highlights. */
  accent?: string;
  links: BrandLink[];
  /** When present, learners sign this text before they see the brief. */
  nda?: { text: string };
};

export const BRAND_LIMITS = { name: 80, links: 4, linkLabel: 60, linkUrl: 500, ndaMin: 40, ndaMax: 8000 };
const HEX = /^#[0-9a-f]{6}$/i;
const HTTPS = /^https:\/\/[^\s<>"']+$/i;
const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** A plain-English starting point the tutor can change or replace. Not legal advice. */
export function ndaTemplate(brandName: string): string {
  const brand = brandName.trim() || "the sponsoring organisation";
  return [
    `This assignment is provided in partnership with ${brand}. To take part, you agree to the following.`,
    "",
    `1. Confidential information. Anything ${brand} shares through this assignment that is not already public, including data, documents, figures, plans, processes and the assignment brief itself, is confidential.`,
    "",
    "2. What you may do with it. You use it only to complete this assignment. You do not share, copy, publish or post it, or upload it to any tool or service outside this course, during the course or after it.",
    "",
    `3. Your work. You may hand your work in here for grading. You do not share the parts of it that contain confidential information without ${brand}'s written permission.`,
    "",
    "4. If something goes wrong. If confidential information is shared by mistake, you tell your tutor straight away.",
    "",
    "5. How long this lasts. These terms stay in place after the assignment ends, until the information becomes public.",
    "",
    "By typing your full name and signing, you confirm you have read and agree to these terms.",
  ].join("\n");
}

/** Whether a tutor's brand is acceptable to save, exactly as given (used by validateCourse). */
export function isValidAssignmentBrand(value: unknown): boolean {
  const v = value as Partial<AssignmentBrand> | null;
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  if (Object.keys(v).some((k) => !["name", "logoUrl", "bannerUrl", "accent", "links", "nda"].includes(k))) return false;
  if (typeof v.name !== "string" || v.name.trim().length < 2 || v.name.length > BRAND_LIMITS.name) return false;
  for (const url of [v.logoUrl, v.bannerUrl]) if (url !== undefined && (typeof url !== "string" || url.length > 200 || !isResourceFileUrl(url))) return false;
  if (v.accent !== undefined && (typeof v.accent !== "string" || !HEX.test(v.accent))) return false;
  if (!Array.isArray(v.links) || v.links.length > BRAND_LIMITS.links) return false;
  for (const link of v.links) {
    const l = link as Partial<BrandLink>;
    if (!l || typeof l !== "object" || Object.keys(l).some((k) => k !== "label" && k !== "url")) return false;
    if (typeof l.label !== "string" || !l.label.trim() || l.label.length > BRAND_LIMITS.linkLabel) return false;
    if (typeof l.url !== "string" || l.url.length > BRAND_LIMITS.linkUrl || !HTTPS.test(l.url)) return false;
  }
  if (v.nda !== undefined) {
    const nda = v.nda as { text?: unknown };
    if (!nda || typeof nda !== "object" || Object.keys(nda).some((k) => k !== "text")) return false;
    if (typeof nda.text !== "string" || nda.text.trim().length < BRAND_LIMITS.ndaMin || nda.text.length > BRAND_LIMITS.ndaMax) return false;
  }
  return true;
}

/** A stored brand, cleaned; null when there isn't a usable one. */
export function readAssignmentBrand(raw: unknown): AssignmentBrand | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  const name = text(v.name, BRAND_LIMITS.name);
  if (name.length < 2) return null;
  const file = (url: unknown) => (typeof url === "string" && isResourceFileUrl(url) ? url : undefined);
  const links = (Array.isArray(v.links) ? v.links : []).slice(0, BRAND_LIMITS.links).flatMap((item) => {
    const l = (item ?? {}) as Record<string, unknown>;
    const label = text(l.label, BRAND_LIMITS.linkLabel);
    const url = typeof l.url === "string" && HTTPS.test(l.url) && l.url.length <= BRAND_LIMITS.linkUrl ? l.url : "";
    return label && url ? [{ label, url }] : [];
  });
  const ndaText = v.nda && typeof v.nda === "object" && typeof (v.nda as { text?: unknown }).text === "string" ? ((v.nda as { text: string }).text).trim().slice(0, BRAND_LIMITS.ndaMax) : "";
  const logoUrl = file(v.logoUrl), bannerUrl = file(v.bannerUrl);
  return {
    name,
    ...(logoUrl ? { logoUrl } : {}),
    ...(bannerUrl ? { bannerUrl } : {}),
    ...(typeof v.accent === "string" && HEX.test(v.accent) ? { accent: v.accent.toUpperCase() } : {}),
    links,
    ...(ndaText.length >= BRAND_LIMITS.ndaMin ? { nda: { text: ndaText } } : {}),
  };
}

/** Whether learners must sign before they see this lesson's brief. */
export const needsNda = (lesson: Pick<Lesson, "assignmentBrand">) => Boolean(lesson.assignmentBrand?.nda);

/**
 * The lesson as a learner receives it in course data: an NDA lesson's brief is
 * held back until they sign (the agreement text itself is shown, to be signed).
 */
export function lessonForLearner<L extends Pick<Lesson, "assignment" | "assignmentBrand">>(lesson: L): L {
  if (!needsNda(lesson) || lesson.assignment === undefined) return lesson;
  const { assignment: _withheld, ...rest } = lesson;
  void _withheld;
  return rest as L;
}
