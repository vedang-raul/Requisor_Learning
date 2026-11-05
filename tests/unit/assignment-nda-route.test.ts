jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/server/db", () => ({ db: { query: jest.fn() } }));
jest.mock("@/lib/server/course-scope", () => ({ canSeeCourse: jest.fn(() => true) }));
jest.mock("@/lib/courses/course-catalog", () => ({ findLessonLocation: jest.fn() }));
jest.mock("@/lib/courses/assignment-nda", () => ({ lessonNda: jest.fn(), signatureFor: jest.fn(), signNda: jest.fn() }));
jest.mock("@/lib/server/rate-limit", () => ({ createRateLimiter: () => ({ check: jest.fn(async () => ({ limited: false, retryAfterMs: 0 })) }), rateLimitResponse: jest.fn() }));

import { GET, POST } from "@/app/api/assignment/nda/route";
import { getServerSession } from "next-auth/next";
import { db } from "@/lib/server/db";
import { canSeeCourse } from "@/lib/server/course-scope";
import { findLessonLocation } from "@/lib/courses/course-catalog";
import { lessonNda, signatureFor, signNda } from "@/lib/courses/assignment-nda";

const nda = { text: "The agreement text, long enough to be a real one.", brandName: "Acme", brief: "The confidential brief" };
const get = () => GET(new Request("http://localhost/api/assignment/nda?lessonId=acme-1"));
const post = (body: unknown) => POST(new Request("http://localhost/api/assignment/nda", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

describe("/api/assignment/nda", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { email: "learner@example.test", role: "employee" } });
    (db.query as jest.Mock).mockResolvedValue({ rows: [{ id: 7 }] });
    (findLessonLocation as jest.Mock).mockResolvedValue({ lessonId: "acme-1", visibleToLearners: true, universityId: null });
    (canSeeCourse as jest.Mock).mockReturnValue(true);
    (lessonNda as jest.Mock).mockResolvedValue(nda);
    (signatureFor as jest.Mock).mockResolvedValue(null);
    (signNda as jest.Mock).mockResolvedValue({ signedName: "Ada Lovelace", signedAt: "2026-11-04T10:00:00.000Z" });
  });

  it("shows the agreement, never the brief, before signing", async () => {
    const body = await (await get()).json();
    expect(body).toEqual({ required: true, signed: false, text: nda.text, brandName: "Acme" });
    expect(JSON.stringify(body)).not.toContain("confidential brief");
  });

  it("gives the brief once signed", async () => {
    (signatureFor as jest.Mock).mockResolvedValue({ signedName: "Ada Lovelace", signedAt: "2026-11-04T10:00:00.000Z" });
    expect(await (await get()).json()).toMatchObject({ signed: true, brief: "The confidential brief", signedName: "Ada Lovelace" });
  });

  it("signs only with a name and a ticked box, then returns the brief", async () => {
    expect((await post({ lessonId: "acme-1", name: "A", agree: true })).status).toBe(400);
    expect((await post({ lessonId: "acme-1", name: "Ada Lovelace", agree: false })).status).toBe(400);
    expect(signNda).not.toHaveBeenCalled();
    const res = await post({ lessonId: "acme-1", name: "  Ada   Lovelace ", agree: true });
    expect(res.status).toBe(200);
    expect(signNda).toHaveBeenCalledWith(7, "acme-1", nda.text, "Ada Lovelace");
    expect(await res.json()).toMatchObject({ signed: true, brief: "The confidential brief" });
  });

  it("is only for lessons the learner can open", async () => {
    (findLessonLocation as jest.Mock).mockResolvedValue({ lessonId: "acme-1", visibleToLearners: false, universityId: null });
    expect((await get()).status).toBe(404);
    (findLessonLocation as jest.Mock).mockResolvedValue({ lessonId: "acme-1", visibleToLearners: true, universityId: 3 });
    (canSeeCourse as jest.Mock).mockReturnValue(false);
    expect((await post({ lessonId: "acme-1", name: "Ada", agree: true })).status).toBe(404);
    (getServerSession as jest.Mock).mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("says there is nothing to sign on a lesson without an NDA", async () => {
    (lessonNda as jest.Mock).mockResolvedValue(null);
    expect(await (await get()).json()).toEqual({ required: false });
    expect((await post({ lessonId: "acme-1", name: "Ada", agree: true })).status).toBe(409);
  });
});
