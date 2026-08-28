jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => ({ db: { query: jest.fn() } }));
jest.mock("@/lib/request-body", () => ({
  readJsonBody: jest.fn().mockResolvedValue({}),
  RequestBodyTooLargeError: class RequestBodyTooLargeError extends Error {},
  InvalidJsonBodyError: class InvalidJsonBodyError extends Error {},
}));
jest.mock("@/lib/course-catalog", () => ({
  ensureCourseCatalog: jest.fn().mockResolvedValue(undefined),
  updateOwnedCourse: jest.fn(),
  deleteOwnedCourse: jest.fn(),
  validateCourse: jest.fn(),
}));

import { DELETE, PUT } from "@/app/api/courses/[slug]/route";
import { getServerSession } from "next-auth";
import { deleteOwnedCourse, updateOwnedCourse, validateCourse } from "@/lib/course-catalog";

const session = getServerSession as jest.Mock;
const update = updateOwnedCourse as jest.Mock;
const remove = deleteOwnedCourse as jest.Mock;
const validate = validateCourse as jest.Mock;
const course = { slug: "owned-course", revision: 3, lessons: [] };
const request = new Request("http://localhost/api/courses/owned-course", { method: "PUT" }) as unknown as import("next/server").NextRequest;

describe("course update ownership and revision conflicts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    session.mockResolvedValue({ user: { id: "9", role: "tutor" } });
    validate.mockReturnValue({ ok: true, course });
  });

  it("returns forbidden when the locked owner condition does not match", async () => {
    update.mockResolvedValue("not-found-or-forbidden");
    expect((await PUT(request, { params: Promise.resolve({ slug: "owned-course" }) })).status).toBe(403);
    expect(update).toHaveBeenCalledWith(course, 9, false);
  });

  it("returns conflict for a stale optimistic revision", async () => {
    update.mockResolvedValue("stale");
    expect((await PUT(request, { params: Promise.resolve({ slug: "owned-course" }) })).status).toBe(409);
  });

  it("uses the ownership-scoped cleanup deletion repository", async () => {
    remove.mockResolvedValue(true);
    const response = await DELETE(request, { params: Promise.resolve({ slug: "owned-course" }) });
    expect(response.status).toBe(204);
    expect(remove).toHaveBeenCalledWith("owned-course", 9, false);
  });
});