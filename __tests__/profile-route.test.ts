jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => ({ db: { query: jest.fn() } }));

import { PATCH } from "@/app/api/profile/route";
import { db } from "@/lib/db";
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
});