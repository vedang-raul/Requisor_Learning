jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/server/db", () => ({ db: { query: jest.fn() } }));
jest.mock("@/lib/courses/course-catalog", () => ({
  ensureCourseCatalog: jest.fn().mockResolvedValue(undefined),
  getCourses: jest.fn(),
}));

import { getServerSession } from "next-auth/next";
import { db } from "@/lib/server/db";
import { getCourses } from "@/lib/courses/course-catalog";
import { buildPreview, isPreviewUrl, pickPreviewModules, previewModuleChoices } from "@/lib/courses/preview-modules";
import { hashPreviewToken, isPreviewToken, newPreviewToken, openPreviewLink } from "@/lib/courses/preview-links";
import { proposalBlocks } from "@/lib/courses/program-docx";
import { buildProposal, composeCurriculum, sampleDiscovery, EMPTY_DISCOVERY } from "@/lib/courses/program-builder";
import { DELETE, GET, POST } from "@/app/api/tutor/preview-links/route";
import type { Course, Lesson } from "@/lib/types";

const session = getServerSession as jest.Mock;
const query = (db as unknown as { query: jest.Mock }).query;
const mockGetCourses = getCourses as jest.Mock;

const lesson = (id: string, section: string | undefined, extra: Partial<Lesson> = {}): Lesson => ({
  id, title: `Lesson ${id}`, description: `About ${id}`, youtubeId: "dQw4w9WgXcQ", durationMin: 10,
  resources: [{ label: "Secret handout", url: "/api/resources/abc", type: "pdf" }], keyTakeaways: [`Takeaway ${id}`],
  assignment: "Hand in your work", requiresSubmission: true, starterCode: "print('hi')", thumbnailUrl: "/api/resources/thumb",
  ...(section ? { section } : {}), ...extra,
});
const course: Course = {
  slug: "agentic-ai", title: "Agentic AI", tagline: "Private tagline", category: "ai", level: "Advanced", tags: ["x"], cover: "c",
  addedAt: "2026-10-01", tutorName: "Tutor Name", baseAssessment: "Capstone", published: true,
  modules: [{ title: "Foundations", description: "What agents are." }, { title: "Tools" }, { title: "Empty" }],
  lessons: [
    lesson("a", "Foundations"),
    lesson("b", "Foundations", { published: false }),
    lesson("c", "Foundations", { publishAt: new Date(Date.now() + 86_400_000).toISOString() }),
    lesson("d", "Tools"),
    lesson("e", "Empty", { published: false }),
  ],
};

describe("what a preview link shows", () => {
  it("offers the modules with live lessons", () => {
    expect(previewModuleChoices(course)).toEqual([
      { key: "foundations", title: "Foundations", lessons: 1 },
      { key: "tools", title: "Tools", lessons: 1 },
    ]);
  });

  it("accepts only real modules", () => {
    expect(pickPreviewModules(course, ["  FOUNDATIONS ", "Foundations", "nope", 42])).toEqual(["foundations"]);
    expect(pickPreviewModules(course, ["empty"])).toBeNull();
    expect(pickPreviewModules(course, "foundations")).toBeNull();
  });

  it("gives the reader only the chosen modules' live lessons, and nothing else", () => {
    const preview = buildPreview(course, ["foundations"], new Date("2026-11-13T00:00:00Z"));
    expect(preview).toEqual({
      title: "Agentic AI",
      expiresAt: "2026-11-13T00:00:00.000Z",
      modules: [
        { open: true, title: "Foundations", description: "What agents are.", lessons: [
          { title: "Lesson a", description: "About a", durationMin: 10, youtubeId: "dQw4w9WgXcQ", keyTakeaways: ["Takeaway a"], body: null },
        ] },
        { open: false, title: "Tools" },
      ],
    });
    const text = JSON.stringify(preview);
    for (const secret of ["Private tagline", "Tutor Name", "Secret handout", "/api/resources", "Hand in", "print(", "Capstone", "agentic-ai", "Lesson b", "Lesson c", "Lesson d", "Empty"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("names a course without modules after the course", () => {
    const flat = { ...course, modules: undefined, lessons: [lesson("a", undefined), lesson("r", undefined, { format: "reading", youtubeId: "", body: "Read me" })] };
    expect(previewModuleChoices(flat)).toEqual([{ key: "", title: "Agentic AI", lessons: 2 }]);
    const preview = buildPreview(flat, [""], new Date());
    expect(preview.modules[0].open && preview.modules[0].lessons[1]).toMatchObject({ youtubeId: null, body: "Read me" });
  });
});

describe("preview link codes", () => {
  it("are long, random and stored only as a hash", () => {
    const a = newPreviewToken();
    expect(isPreviewToken(a)).toBe(true);
    expect(a).not.toBe(newPreviewToken());
    expect(hashPreviewToken(a)).toMatch(/^[0-9a-f]{64}$/);
    for (const bad of ["", "short", `${a}x`, `${a.slice(0, 42)}/`, null, 7]) expect(isPreviewToken(bad)).toBe(false);
  });

  it("don't touch the database when malformed, and open only live links", async () => {
    query.mockReset();
    expect(await openPreviewLink("../etc")).toBeNull();
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValue({ rows: [] });
    const token = newPreviewToken();
    expect(await openPreviewLink(token)).toBeNull();
    const [sql, params] = query.mock.calls.at(-1)!;
    expect(sql).toMatch(/revoked_at IS NULL AND expires_at > NOW\(\)/);
    expect(params).toEqual([hashPreviewToken(token)]);
  });

  it("go into the proposal only when they are preview addresses", () => {
    const token = newPreviewToken();
    expect(isPreviewUrl(`https://learning.example/p/${token}`)).toBe(true);
    for (const bad of ["javascript:alert(1)", `https://x.example/app/${token}`, `https://x.example/p/${token}?a=1`]) expect(isPreviewUrl(bad)).toBe(false);
    const proposal = buildProposal(composeCurriculum(sampleDiscovery(EMPTY_DISCOVERY)), "Acme", new Date());
    const words = (p: typeof proposal) => JSON.stringify(proposalBlocks(p));
    expect(words(proposal)).not.toContain("Preview the course");
    expect(words({ ...proposal, preview: { id: 1, url: `https://learning.example/p/${token}`, until: "November 13, 2026" } })).toContain(token);
    expect(words({ ...proposal, preview: { id: 1, url: "javascript:alert(1)", until: "x" } })).not.toContain("Preview the course");
  });
});

describe("preview link API", () => {
  beforeEach(() => { jest.clearAllMocks(); query.mockReset(); });
  const tutor = { user: { id: "5", email: "t@example.com", role: "tutor" } };

  it("needs a signed-in tutor", async () => {
    session.mockResolvedValue(null);
    expect((await GET(new Request("http://x/api/tutor/preview-links?course=agentic-ai"))).status).toBe(401);
    session.mockResolvedValue({ user: { id: "6", email: "s@example.com", role: "employee" } });
    expect((await POST(new Request("http://x/api/tutor/preview-links", { method: "POST", body: "{}" }))).status).toBe(403);
    expect(mockGetCourses).not.toHaveBeenCalled();
  });

  it("works only on a course the tutor owns or manages", async () => {
    session.mockResolvedValue(tutor);
    mockGetCourses.mockResolvedValue([]);
    const res = await POST(new Request("http://x/api/tutor/preview-links", { method: "POST", body: JSON.stringify({ course: "agentic-ai", modules: ["foundations"] }) }));
    expect(res.status).toBe(404);
    const [where, params] = mockGetCourses.mock.calls[0];
    expect(where).toContain("c.owner_user_id=$2");
    expect(params.slice(0, 2)).toEqual(["agentic-ai", 5]);
    expect((await DELETE(new Request("http://x/api/tutor/preview-links?course=Bad%20Slug&id=1", { method: "DELETE" }))).status).toBe(404);
  });

  it("makes a link for chosen modules, storing only the code's hash", async () => {
    session.mockResolvedValue(tutor);
    mockGetCourses.mockResolvedValue([course]);
    const now = new Date();
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("COUNT(*)")) return { rows: [{ n: 0 }] };
      if (sql.includes("INSERT INTO course_preview_links")) return { rows: [{ id: 9, label: "Acme", module_keys: ["foundations"], created_at: now, expires_at: new Date(now.getTime() + 15 * 86_400_000), revoked_at: null, view_count: 0, last_viewed_at: null }] };
      return { rows: [] };
    });
    const res = await POST(new Request("http://x/api/tutor/preview-links", { method: "POST", body: JSON.stringify({ course: "agentic-ai", modules: ["Foundations"], label: "Acme" }) }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(isPreviewToken(data.token)).toBe(true);
    expect(data.link).toMatchObject({ id: 9, label: "Acme", modules: ["Foundations"], revoked: false, expired: false });
    const insert = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO course_preview_links"))!;
    expect(insert[1]).toEqual([hashPreviewToken(data.token), "agentic-ai", JSON.stringify(["foundations"]), "Acme", 5, 15]);
    expect(JSON.stringify(insert[1])).not.toContain(data.token);
  });

  it("refuses a link with no real modules", async () => {
    session.mockResolvedValue(tutor);
    mockGetCourses.mockResolvedValue([course]);
    const res = await POST(new Request("http://x/api/tutor/preview-links", { method: "POST", body: JSON.stringify({ course: "agentic-ai", modules: ["empty"] }) }));
    expect(res.status).toBe(400);
  });
});
