jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/server/db", () => ({ db: { query: jest.fn() } }));

import { GET, PUT } from "@/app/api/accessibility/route";
import { accessibilityClasses, ACCESSIBILITY_OPTIONS, NO_ACCESSIBILITY_PREFS, sanitizeAccessibilityPrefs } from "@/lib/accessibility/preferences";
import { db } from "@/lib/server/db";
import { dateOnly } from "@/lib/server/date-only";
import { getServerSession } from "next-auth/next";

const mockSession = getServerSession as jest.Mock;
const mockQuery = (db as unknown as { query: jest.Mock }).query;

describe("accessibility preferences", () => {
  it("keeps only the known switches, and only real true values", () => {
    expect(sanitizeAccessibilityPrefs({ largerText: true, highContrast: "yes", voiceControl: 1, admin: true }))
      .toEqual({ ...NO_ACCESSIBILITY_PREFS, largerText: true });
    expect(sanitizeAccessibilityPrefs(null)).toEqual(NO_ACCESSIBILITY_PREFS);
    expect(sanitizeAccessibilityPrefs("largerText")).toEqual(NO_ACCESSIBILITY_PREFS);
  });

  it("offers every switch in onboarding, each with a label", () => {
    expect(ACCESSIBILITY_OPTIONS.map((o) => o.key).sort()).toEqual(Object.keys(NO_ACCESSIBILITY_PREFS).sort());
  });

  it("maps the visual switches to page classes", () => {
    expect(accessibilityClasses(NO_ACCESSIBILITY_PREFS)).toEqual([]);
    expect(accessibilityClasses({ ...NO_ACCESSIBILITY_PREFS, largerText: true, reduceMotion: true, simpleLanguage: true }))
      .toEqual(["a11y-large-text", "a11y-reduce-motion"]);
  });
});

describe("/api/accessibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue({ user: { email: "Learner@Example.com" } });
  });

  it("needs a signed-in person", async () => {
    mockSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await PUT(new Request("http://localhost/api/accessibility", { method: "PUT", body: "{}" }))).status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns the saved choices, cleaned", async () => {
    mockQuery.mockResolvedValue({ rows: [{ accessibility: { largerText: true, junk: true } }] });
    const body = await (await GET()).json();
    expect(body.prefs).toEqual({ ...NO_ACCESSIBILITY_PREFS, largerText: true });
    expect(mockQuery.mock.calls[0][1]).toEqual(["learner@example.com"]);
  });

  it("saves only the known switches for the signed-in person", async () => {
    mockQuery.mockImplementation(async (_sql: string, params: unknown[]) => ({ rows: [{ accessibility: JSON.parse(String(params[0])) }] }));
    const response = await PUT(new Request("http://localhost/api/accessibility", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs: { voiceControl: true, role: "admin" } }),
    }));
    expect(response.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("UPDATE users SET accessibility");
    expect(JSON.parse(String(params[0]))).toEqual({ ...NO_ACCESSIBILITY_PREFS, voiceControl: true });
    expect(params[1]).toBe("learner@example.com");
  });

  it("rejects a body that isn't JSON", async () => {
    const response = await PUT(new Request("http://localhost/api/accessibility", { method: "PUT", body: "not json" }));
    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("dates of birth", () => {
  it("keeps the calendar date a DATE column was read as", () => {
    expect(dateOnly(new Date(2001, 3, 15))).toBe("2001-04-15"); // local midnight, as node-postgres returns it
    expect(dateOnly("2001-04-15")).toBe("2001-04-15");
    expect(dateOnly(null)).toBeNull();
    expect(dateOnly(new Date("nope"))).toBeNull();
  });
});
