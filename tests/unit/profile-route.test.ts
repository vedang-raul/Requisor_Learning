jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/server/db", () => ({ db: { query: jest.fn() } }));

import { PATCH } from "@/app/api/profile/route";
import { db } from "@/lib/server/db";
import { getServerSession } from "next-auth/next";

const mockSession = getServerSession as jest.Mock;
const mockQuery = (db as unknown as { query: jest.Mock }).query;

function profileRequest(body: unknown): Request {
  return new Request("http://localhost/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("profile onboarding preferences", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue({ user: { email: "Learner@Example.com" } });
  });

  it("saves persona and language atomically with onboarding completion", async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        name: "Learner",
        email: "learner@example.com",
        role: "employee",
        qualification: "Engineer",
        learning_goal: "Learn AI",
        onboarding_done: true,
        assistant_persona: "iris",
        preferred_language: "hi",
        preferred_country: null,
      }],
    });

    const response = await PATCH(profileRequest({
      qualification: "Engineer",
      learningGoal: "Learn AI",
      onboardingDone: true,
      assistantPersona: "iris",
      preferredLanguage: "hi",
    }));

    expect(response.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(String(mockQuery.mock.calls[0][0])).toContain("assistant_persona = COALESCE($5");
    expect(mockQuery.mock.calls[0][1]).toEqual([
      "Engineer",
      "Learn AI",
      null,
      null,
      "iris",
      "hi",
      null,
      "learner@example.com",
    ]);
    await expect(response.json()).resolves.toMatchObject({
      onboardingDone: true,
      assistantPersona: "iris",
      preferredLanguage: "hi",
    });
  });

  it.each([
    { onboardingDone: true, qualification: "q".repeat(301) },
    { onboardingDone: true, learningGoal: "g".repeat(1001) },
    { name: "Learner", qualification: "q".repeat(301) },
    { name: "Learner", learningGoal: "g".repeat(1001) },
    { onboardingDone: true, learningGoal: 42 },
    { onboardingDone: true, qualification: { text: "invalid" } },
    { onboardingDone: true, learningGoal: " ".repeat(1001) },
    null, [], "not an object",
  ])("rejects invalid or oversized profile fields before any write: %j", async (body) => {
    const response = await PATCH(profileRequest(body));
    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("accepts both fields at their exact character limits", async () => {
    mockQuery.mockResolvedValue({ rows: [{ email: "learner@example.com" }] });
    const response = await PATCH(profileRequest({
      onboardingDone: true, qualification: "q".repeat(300), learningGoal: "g".repeat(1000),
    }));
    expect(response.status).toBe(200);
    expect(mockQuery.mock.calls[0][1].slice(0, 2)).toEqual(["q".repeat(300), "g".repeat(1000)]);
  });

  it("rejects excessive bytes in ignored fields even without Content-Length", async () => {
    const response = await PATCH(profileRequest({ onboardingDone: true, ignored: "x".repeat(17 * 1024) }));
    expect(response.status).toBe(413);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await PATCH(new Request("http://localhost/api/profile", { method: "PATCH", body: "{" }));
    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});