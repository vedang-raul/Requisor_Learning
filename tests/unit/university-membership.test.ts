jest.mock("@/lib/server/db", () => ({ db: { query: jest.fn() } }));
jest.mock("@/lib/server/notifications", () => ({ notifyUser: jest.fn() }));

import { db } from "@/lib/server/db";
import { notifyUser } from "@/lib/server/notifications";
import { membershipForNewAccount, notifyAdminsOfJoinRequest } from "@/lib/server/universities";

const mockedQuery = db.query as jest.Mock;

/** MSOE (id 1) owns msoe.edu and students.msoe.edu; UWM (id 2) exists too. */
function fakeUniversities() {
  mockedQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes("= ANY(email_domains)")) {
      return { rows: ["msoe.edu", "students.msoe.edu"].includes(String(params[0])) ? [{ id: 1 }] : [] };
    }
    if (sql.includes("FROM universities WHERE id = $1")) {
      const id = Number(params[0]);
      return { rows: id === 1 || id === 2 ? [{ id, name: "U", short_name: null, email_domains: [], logo_data: null, logo_type: null, logo_path: null }] : [] };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  fakeUniversities();
});

describe("membershipForNewAccount", () => {
  it("lets a proven university email straight in, on any of its listed domains", async () => {
    await expect(membershipForNewAccount("ana@msoe.edu", undefined, { emailProven: true }))
      .resolves.toEqual({ universityId: 1, status: "active" });
    await expect(membershipForNewAccount("ana@students.msoe.edu", 2, { emailProven: true }))
      .resolves.toEqual({ universityId: 1, status: "active" }); // the domain wins over a picked university
  });

  it("makes even a university email wait when owning it isn't proven (verification switched off)", async () => {
    await expect(membershipForNewAccount("ana@msoe.edu", undefined, { emailProven: false }))
      .resolves.toEqual({ universityId: 1, status: "pending" });
  });

  it("sends anyone else who picks a university to its admin for approval", async () => {
    await expect(membershipForNewAccount("ana@gmail.com", 2, { emailProven: true }))
      .resolves.toEqual({ universityId: 2, status: "pending" });
    // A subdomain that isn't listed doesn't count (matching is exact).
    await expect(membershipForNewAccount("ana@alumni.msoe.edu", 1, { emailProven: true }))
      .resolves.toEqual({ universityId: 1, status: "pending" });
  });

  it("puts nobody in a university they didn't pick or that doesn't exist", async () => {
    await expect(membershipForNewAccount("ana@gmail.com", undefined, { emailProven: true }))
      .resolves.toEqual({ universityId: null, status: null });
    await expect(membershipForNewAccount("ana@gmail.com", 99, { emailProven: true }))
      .resolves.toEqual({ universityId: null, status: null });
  });
});

describe("notifyAdminsOfJoinRequest", () => {
  it("tells each active admin of that university, and never throws", async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: 7 }, { id: 8 }] });
    await notifyAdminsOfJoinRequest(1, { name: "Ana", email: "ana@gmail.com" });
    expect(mockedQuery.mock.calls[0][0]).toContain("role = 'admin' AND university_id = $1 AND university_status = 'active'");
    expect(notifyUser).toHaveBeenCalledTimes(2);
    expect((notifyUser as jest.Mock).mock.calls[0][1]).toMatchObject({ kind: "join-request", body: expect.stringContaining("ana@gmail.com") });

    mockedQuery.mockRejectedValueOnce(new Error("db down"));
    const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(notifyAdminsOfJoinRequest(1, { name: "Ana", email: "ana@gmail.com" })).resolves.toBeUndefined();
    quiet.mockRestore();
  });
});
