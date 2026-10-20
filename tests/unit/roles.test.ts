import { accessFor, assignableRoles, cleanDomains, isPublicEmailDomain, isSuperAdminEmail, MAX_UNIVERSITY_DOMAINS, superAdminEmails, workUniversity } from "@/lib/auth/roles";
import { canManage, planPeopleChange, readPeopleAction, type Manager, type Person } from "@/lib/auth/people-rules";
import { readLogo, readUniversityInput } from "@/lib/server/university-input";

describe("roles: super admin > university admin > tutor > student", () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it("takes super admins from the server list, always including the support mailbox", () => {
    process.env.SUPER_ADMIN_EMAILS = " Naveen@Requisor.io, team@requisor.io;not-an-email ";
    expect([...superAdminEmails()].sort()).toEqual(["naveen@requisor.io", "support@requisor.io", "team@requisor.io"]);
    expect(isSuperAdminEmail("TEAM@requisor.io")).toBe(true);
    expect(isSuperAdminEmail("someone@msoe.edu")).toBe(false);
    delete process.env.SUPER_ADMIN_EMAILS;
    expect(isSuperAdminEmail("support@requisor.io")).toBe(true);
    expect(isSuperAdminEmail("naveen@requisor.io")).toBe(false);
  });

  it("gives super admins admin powers with no university limit", () => {
    expect(accessFor("support@requisor.io", { role: "employee", university_id: 3, university_status: "active" }))
      .toEqual({ role: "admin", superAdmin: true, universityId: null, pending: false });
  });

  it("makes someone a university admin only when they belong to a university", () => {
    expect(accessFor("dean@msoe.edu", { role: "admin", university_id: 1, university_status: "active" }))
      .toEqual({ role: "admin", superAdmin: false, universityId: 1, pending: false });
    // A stray "admin" value without a university grants nothing.
    expect(accessFor("x@gmail.com", { role: "admin", university_id: null, university_status: null }))
      .toEqual({ role: "employee", superAdmin: false, universityId: null, pending: false });
    // Waiting for approval is not membership yet.
    expect(accessFor("x@gmail.com", { role: "admin", university_id: 1, university_status: "pending" }).role).toBe("employee");
  });

  it("keeps tutors and students, with their university once approved", () => {
    expect(accessFor("t@msoe.edu", { role: "tutor", university_id: 1, university_status: "active" })).toEqual({ role: "tutor", superAdmin: false, universityId: 1, pending: false });
    expect(accessFor("new@gmail.com", undefined)).toEqual({ role: "employee", superAdmin: false, universityId: null, pending: false });
  });

  it("marks someone waiting to join as pending, with no university until approved", () => {
    expect(accessFor("s@gmail.com", { role: "employee", university_id: 2, university_status: "pending" }))
      .toEqual({ role: "employee", superAdmin: false, universityId: null, pending: true });
    expect(accessFor("t@gmail.com", { role: "tutor", university_id: 2, university_status: "pending" }).pending).toBe(true);
    // A pending row can never make a super admin wait, or an admin out of a pending one.
    expect(accessFor("support@requisor.io", { role: "employee", university_id: 2, university_status: "pending" }).pending).toBe(false);
    expect(accessFor("x@gmail.com", { role: "admin", university_id: 1, university_status: "pending" }))
      .toEqual({ role: "employee", superAdmin: false, universityId: null, pending: true });
  });

  it("puts a super admin's work platform-wide and everyone else's in their university", () => {
    expect(workUniversity({ superAdmin: true, universityId: 4 })).toBeNull();
    expect(workUniversity({ superAdmin: false, universityId: 4 })).toBe(4);
  });

  it("lets only super admins create admins", () => {
    expect(assignableRoles({ superAdmin: true })).toContain("admin");
    expect(assignableRoles({ superAdmin: false })).toEqual(["employee", "tutor"]);
  });

  it("cleans email domains", () => {
    expect(cleanDomains("@MSOE.edu, msoe.edu  uwm.edu;bad domain;x")).toEqual(["msoe.edu", "uwm.edu"]);
    expect(cleanDomains(["mit.edu", 5, "@cs.mit.edu"])).toEqual(["mit.edu", "cs.mit.edu"]);
  });

  it("keeps many domains per university, each matched exactly", () => {
    const many = Array.from({ length: 30 }, (_, i) => `d${i}.msoe.edu`).join(", ");
    expect(cleanDomains(many)).toHaveLength(MAX_UNIVERSITY_DOMAINS);
    expect(cleanDomains("msoe.edu, students.msoe.edu, alumni.msoe.edu")).toEqual(["msoe.edu", "students.msoe.edu", "alumni.msoe.edu"]);
  });

  it("recognises public email providers for the editor warning", () => {
    expect(isPublicEmailDomain("gmail.com")).toBe(true);
    expect(isPublicEmailDomain("@Outlook.com")).toBe(true);
    expect(isPublicEmailDomain("msoe.edu")).toBe(false);
  });
});

describe("managing people", () => {
  const superAdmin: Manager = { userId: 1, superAdmin: true, universityId: null };
  const msoeAdmin: Manager = { userId: 2, superAdmin: false, universityId: 10 };
  const person = (over: Partial<Person> = {}): Person => ({ id: 50, role: "employee", superAdmin: false, universityId: 10, status: "active", requestedRole: null, ...over });

  it("lets a university admin manage only their own tutors and students", () => {
    expect(canManage(msoeAdmin, person())).toBe(true);
    expect(canManage(msoeAdmin, person({ universityId: 11 }))).toBe(false);
    expect(canManage(msoeAdmin, person({ role: "admin" }))).toBe(false);
    expect(canManage(msoeAdmin, person({ id: 2 }))).toBe(false);
    expect(canManage(superAdmin, person({ universityId: 99, role: "admin" }))).toBe(true);
    expect(canManage(superAdmin, person({ superAdmin: true }))).toBe(false);
  });

  it("approves people waiting to join, and tutor requests of members", () => {
    expect(planPeopleChange(msoeAdmin, person({ status: "pending" }), { kind: "approve" })).toEqual({ status: "active" });
    expect(planPeopleChange(msoeAdmin, person(), { kind: "approve" })).toEqual({ error: expect.stringMatching(/isn't waiting/) });
    expect(planPeopleChange(msoeAdmin, person({ requestedRole: "tutor" }), { kind: "approve-tutor" })).toEqual({ role: "tutor", requestedRole: null });
    expect(planPeopleChange(msoeAdmin, person({ status: "pending", requestedRole: "tutor" }), { kind: "approve-tutor" })).toHaveProperty("error");
  });

  it("stops a university admin from making admins or moving people", () => {
    expect(planPeopleChange(msoeAdmin, person(), { kind: "set-role", role: "admin" })).toHaveProperty("error");
    expect(planPeopleChange(msoeAdmin, person(), { kind: "move", universityId: 11 })).toHaveProperty("error");
    expect(planPeopleChange(msoeAdmin, person(), { kind: "set-role", role: "tutor" })).toEqual({ role: "tutor", requestedRole: null });
  });

  it("lets a super admin make an admin of an approved member, and demotes an admin who moves", () => {
    expect(planPeopleChange(superAdmin, person(), { kind: "set-role", role: "admin" })).toEqual({ role: "admin", requestedRole: null });
    expect(planPeopleChange(superAdmin, person({ universityId: null, status: null }), { kind: "set-role", role: "admin" })).toHaveProperty("error");
    expect(planPeopleChange(superAdmin, person({ role: "admin" }), { kind: "move", universityId: 11 })).toEqual({ universityId: 11, status: "active", role: "employee" });
    expect(planPeopleChange(superAdmin, person(), { kind: "move", universityId: null })).toEqual({ universityId: null, status: null });
  });

  it("takes people out of a university as students, and never changes yourself or a super admin", () => {
    expect(planPeopleChange(msoeAdmin, person({ role: "tutor" }), { kind: "remove" })).toEqual({ universityId: null, status: null, role: "employee", requestedRole: null });
    expect(planPeopleChange(msoeAdmin, person({ id: 2 }), { kind: "remove" })).toEqual({ error: expect.stringMatching(/your own/) });
    expect(planPeopleChange(superAdmin, person({ superAdmin: true }), { kind: "set-role", role: "employee" })).toEqual({ error: expect.stringMatching(/Super admins/) });
  });

  it("reads actions safely", () => {
    expect(readPeopleAction({ action: "set-role", role: "tutor" })).toEqual({ kind: "set-role", role: "tutor" });
    expect(readPeopleAction({ action: "set-role", role: "superadmin" })).toBeNull();
    expect(readPeopleAction({ action: "move", universityId: "3" })).toEqual({ kind: "move", universityId: 3 });
    expect(readPeopleAction({ action: "move", universityId: null })).toEqual({ kind: "move", universityId: null });
    expect(readPeopleAction({ action: "delete-everything" })).toBeNull();
  });
});

describe("university details from a super admin", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

  it("accepts a real PNG, JPEG or WebP logo and refuses anything else", () => {
    const ok = readLogo(`data:image/png;base64,${png.toString("base64")}`);
    expect("data" in ok && ok.type).toBe("image/png");
    expect(readLogo(`data:image/svg+xml;base64,${Buffer.from("<svg onload=alert(1)>").toString("base64")}`)).toHaveProperty("error");
    expect(readLogo(`data:image/png;base64,${Buffer.from("not really a png").toString("base64")}`)).toEqual({ error: expect.stringMatching(/isn't the image/) });
    expect(readLogo(`data:image/png;base64,${Buffer.concat([png, Buffer.alloc(600 * 1024)]).toString("base64")}`)).toEqual({ error: expect.stringMatching(/too large/) });
    expect(readLogo(42)).toHaveProperty("error");
  });

  it("needs a full name and tidies the rest", () => {
    expect(readUniversityInput({ name: "  U " })).toHaveProperty("error");
    expect(readUniversityInput({ name: " Milwaukee   School of Engineering ", shortName: "MSOE", domains: "@msoe.edu" }))
      .toEqual({ name: "Milwaukee School of Engineering", shortName: "MSOE", domains: ["msoe.edu"] });
  });
});
