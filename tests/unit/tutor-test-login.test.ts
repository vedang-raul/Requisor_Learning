const mockQuery = jest.fn();

jest.mock("@/lib/server/db", () => ({
  db: { query: mockQuery },
  roleForEmail: jest.fn(() => "employee"),
  ADMIN_EMAIL: "admin@example.com",
}));
jest.mock("@/lib/server/email", () => ({
  skipEmailVerification: () => false,
  sendWelcomeEmail: jest.fn(),
}));
jest.mock("next-auth/providers/google", () => ({
  __esModule: true,
  default: () => ({ id: "google", type: "oauth" }),
}));
jest.mock("next-auth/providers/credentials", () => ({
  __esModule: true,
  default: (options: Record<string, unknown>) => ({ id: "credentials", ...options, type: "credentials" }),
}));

type TestProvider = {
  id: string;
  authorize?: (...args: unknown[]) => Promise<{ id: string; email: string }>;
};
const keys = ["NODE_ENV", "TEST_LOGINS", "TUTOR_TEST_LOGIN", "VERCEL", "PUBLIC_TEST_LOGINS"];
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));

function providers(): TestProvider[] {
  let result: TestProvider[] = [];
  jest.isolateModules(() => {
    result = require("@/lib/auth/auth").authOptions.providers;
  });
  return result;
}

beforeEach(() => {
  Object.assign(process.env, { NODE_ENV: "production" });
  delete process.env.TEST_LOGINS;
  delete process.env.TUTOR_TEST_LOGIN;
  delete process.env.VERCEL;
  delete process.env.PUBLIC_TEST_LOGINS;
});
afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  jest.clearAllMocks();
});

describe("public tutor-only testing shortcut", () => {
  it("keeps all shortcuts off by default in production", () => {
    const ids = providers().map(p => p.id);
    expect(ids).not.toContain("dev-tutor");
    expect(ids).not.toContain("dev-student");
    expect(ids).not.toContain("dev-admin");
    expect(ids).not.toContain("dev-uni-admin");
    expect(ids).toEqual(expect.arrayContaining(["google", "credentials"]));
  });

  it("enables only the tutor with the approved production settings", () => {
    process.env.TEST_LOGINS = "off";
    process.env.TUTOR_TEST_LOGIN = "on";
    const ids = providers().map(p => p.id);
    expect(ids).toContain("dev-tutor");
    expect(ids).not.toContain("dev-student");
    expect(ids).not.toContain("dev-admin");
    expect(ids).not.toContain("dev-uni-admin");
    expect(ids).toEqual(expect.arrayContaining(["google", "credentials"]));
  });

  it("keeps the student disabled even if the old hosting hint is present", () => {
    process.env.VERCEL = "1";
    process.env.TEST_LOGINS = "off";
    process.env.TUTOR_TEST_LOGIN = "on";
    expect(providers().map(p => p.id)).not.toContain("dev-student");
  });

  it("lets the tutor switch be disabled independently", () => {
    process.env.TEST_LOGINS = "on";
    process.env.TUTOR_TEST_LOGIN = "off";
    const ids = providers().map(p => p.id);
    expect(ids).not.toContain("dev-tutor");
    expect(ids).toContain("dev-student");
    expect(ids).not.toContain("dev-admin");
  });

  it("preserves local development shortcuts", () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    expect(providers().map(p => p.id)).toEqual(expect.arrayContaining(["dev-tutor", "dev-student", "dev-admin", "dev-uni-admin"]));
  });

  it("does not enable a production shortcut for an invalid opt-in value", () => {
    process.env.TUTOR_TEST_LOGIN = "true";
    expect(providers().map(p => p.id)).not.toContain("dev-tutor");
  });

  it("ignores supplied identities and uses only the reserved synthetic tutor", async () => {
    process.env.TEST_LOGINS = "off";
    process.env.TUTOR_TEST_LOGIN = "on";
    const tutor = providers().find(p => p.id === "dev-tutor")!;
    const { db } = require("@/lib/server/db");
    db.query.mockResolvedValue({ rows: [{ id: 42, email: "dev-tutor@requisor.local", name: "Development Tutor" }] });
    const user = await tutor.authorize!({ email: "someone@example.com", role: "admin" });
    expect(user).toMatchObject({ id: "42", email: "dev-tutor@requisor.local" });
    const sql = db.query.mock.calls[0][0] as string;
    expect(sql).toContain("'dev-tutor@requisor.local'");
    expect(sql).toContain("role = 'tutor'");
    expect(sql).not.toContain("someone@example.com");
  });
});
