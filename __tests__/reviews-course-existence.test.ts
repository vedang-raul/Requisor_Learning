jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => ({ db: { query: jest.fn() } }));
jest.mock("@/lib/course-catalog", () => ({ ensureCourseCatalog: jest.fn().mockResolvedValue(undefined) }));

import { POST } from "@/app/api/reviews/route";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";

const session = getServerSession as jest.Mock;
const query = (db as unknown as { query: jest.Mock }).query;

describe("review course referential safety", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    session.mockResolvedValue({ user: { id: "4", email: "learner@example.com", name: "Learner", role: "employee" } });
  });

  it("rejects review creation when the locked course SELECT finds no course", async () => {
    query.mockResolvedValue({ rows: [] });
    const request = new Request("http://localhost/api/reviews", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseSlug: "missing-course", rating: 5, comment: "" }),
    }) as unknown as import("next/server").NextRequest;
    const response = await POST(request);
    expect(response.status).toBe(404);
    expect(query.mock.calls[0][0]).toContain("FOR KEY SHARE");
  });
});