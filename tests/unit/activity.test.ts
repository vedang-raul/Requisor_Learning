jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/server/db", () => ({ db: { query: jest.fn() } }));
jest.mock("@/lib/server/access", () => ({ requireAccess: jest.fn() }));

import { POST } from "@/app/api/activity/route";
import { GET as listActivity } from "@/app/api/admin/activity/route";
import { describeUserAgent, formatDuration, loginMethodLabel, pageArea } from "@/lib/activity/describe";
import { clientIpFrom, locationFrom } from "@/lib/server/activity";
import { db } from "@/lib/server/db";
import { requireAccess } from "@/lib/server/access";
import { getServerSession } from "next-auth/next";

const mockSession = getServerSession as jest.Mock;
const mockQuery = (db as unknown as { query: jest.Mock }).query;
const mockAccess = requireAccess as jest.Mock;
const VIEW = "3f2b8c1e-6d4a-4b9e-9c1f-2a7e5d8b0c13";

const beat = (body: unknown) => new Request("http://localhost/api/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("describing a sign-in", () => {
  it("reads browser, system and device from the user agent", () => {
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"))
      .toEqual({ browser: "Chrome", os: "Windows", device: "desktop" });
    expect(describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"))
      .toEqual({ browser: "Safari", os: "iOS", device: "mobile" });
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0").browser).toBe("Edge");
    expect(describeUserAgent("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/141.0 Safari/537.36").device).toBe("tablet");
    expect(describeUserAgent(null)).toEqual({ browser: "Unknown", os: "Unknown", device: "desktop" });
  });

  it("names the sign-in method and reads IP and location from the host's headers", () => {
    expect(loginMethodLabel("google")).toBe("Google");
    expect(loginMethodLabel("credentials")).toBe("Email & password");
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1", "x-vercel-ip-country": "US", "x-vercel-ip-city": "Milwaukee" });
    expect(clientIpFrom(h)).toBe("10.0.0.1");
    expect(locationFrom(h)).toEqual({ country: "US", region: null, city: "Milwaukee" });
    expect(locationFrom(new Headers({ "cf-ipcountry": "XX" })).country).toBeNull();
  });
});

describe("which page someone is on", () => {
  it("knows lessons, courses and the other app areas", () => {
    expect(pageArea("/app/learn/", "course=data-analytics&lesson=da-1")).toEqual({ area: "lesson", courseSlug: "data-analytics", lessonId: "da-1" });
    expect(pageArea("/app/course", "?slug=agentic-ai")).toEqual({ area: "course", courseSlug: "agentic-ai", lessonId: null });
    expect(pageArea("/app/tutor/courses").area).toBe("tutor-workspace");
    expect(pageArea("/app/settings/").area).toBe("profile");
    expect(pageArea("/app/learn", "course=<script>").courseSlug).toBeNull();
  });

  it("formats time", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(14 * 60)).toBe("14m");
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe("2h 05m");
  });
});

describe("POST /api/activity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "7" } });
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it("needs a signed-in person", async () => {
    mockSession.mockResolvedValue(null);
    expect((await POST(beat({ viewId: VIEW, path: "/app/dashboard", seconds: 5 }))).status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("adds at most 30 seconds per heartbeat, to the person's own view", async () => {
    expect((await POST(beat({ viewId: VIEW, path: "/app/learn", search: "course=c&lesson=l", seconds: 9999 }))).status).toBe(204);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("WHERE page_views.user_id = EXCLUDED.user_id");
    expect(params).toEqual([VIEW, 7, "/app/learn", "lesson", "c", "l", 30]);
  });

  it("ignores pages outside the app and bad view ids", async () => {
    expect((await POST(beat({ viewId: VIEW, path: "https://evil.test", seconds: 5 }))).status).toBe(400);
    expect((await POST(beat({ viewId: "1", path: "/app/dashboard", seconds: 5 }))).status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/activity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it("is for super admins only", async () => {
    mockAccess.mockResolvedValue(Response.json({ error: "Forbidden" }, { status: 403 }));
    expect((await listActivity(new Request("http://localhost/api/admin/activity"))).status).toBe(403);
    expect(mockAccess).toHaveBeenCalledWith("super");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("filters by role, period and university", async () => {
    mockAccess.mockResolvedValue({ role: "admin", superAdmin: true });
    await listActivity(new Request("http://localhost/api/admin/activity?role=tutor&days=90&university=3"));
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("u.university_id = $3");
    expect(params).toEqual(["tutor", 90, 3]);
    await listActivity(new Request("http://localhost/api/admin/activity?days=12&university=none"));
    expect(String(mockQuery.mock.calls[1][0])).toContain("u.university_id IS NULL");
    expect(mockQuery.mock.calls[1][1]).toEqual(["employee", 30]);
  });
});
