/** "View as" names shared by the server (src/lib/auth/view-as.ts) and the Profile page. No server imports. */
export const VIEW_AS_PROVIDER = "view-as";

export const VIEW_AS_KINDS = ["student", "tutor", "university-admin"] as const;
export type ViewAsKind = (typeof VIEW_AS_KINDS)[number];

export function isViewAsKind(value: unknown): value is ViewAsKind {
  return typeof value === "string" && (VIEW_AS_KINDS as readonly string[]).includes(value);
}

export const VIEW_AS_LABELS: Record<ViewAsKind, string> = {
  student: "Test student",
  tutor: "Test tutor",
  "university-admin": "Test university admin",
};

/** Where each test account lands after switching. */
export const VIEW_AS_DESTINATIONS: Record<ViewAsKind, string> = {
  student: "/app/dashboard/",
  tutor: "/app/tutor/",
  "university-admin": "/app/admin/",
};

