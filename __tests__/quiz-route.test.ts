/**
 * Security-focused tests for the lesson quiz generator.
 * External dependencies are mocked so no database, AI request, or credential
 * is required to execute this suite.
 */

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({ authOptions: {} }));

jest.mock("@/lib/db", () => ({
  db: { query: jest.fn() },
}));

import { POST } from "@/app/api/quiz/route";
import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";

const mockedGetServerSession = getServerSession as jest.Mock;
const mockedDbQuery = db.query as jest.Mock;
const AUTHED_SESSION = { user: { email: "learner@example.com" } };

function makeRequest(body: string): Request {
  return new Request("http://localhost/api/quiz", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  process.env.XAI_API_KEY = "test-key";
});

afterAll(() => {
  delete process.env.XAI_API_KEY;
});

describe("POST /api/quiz — security boundaries", () => {
  it("rejects an unauthenticated request before reading the body or calling xAI", async () => {
    mockedGetServerSession.mockResolvedValue(null);
    global.fetch = jest.fn() as jest.Mock;

    const response = await POST(makeRequest(JSON.stringify({ lessonTitle: "Test" })));

    expect(response.status).toBe(401);
    expect(mockedDbQuery).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON after authentication", async () => {
    mockedGetServerSession.mockResolvedValue(AUTHED_SESSION);

    const response = await POST(makeRequest("{not-json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body." });
    expect(mockedDbQuery).not.toHaveBeenCalled();
  });

  it("rejects an oversized streamed body before querying the database or xAI", async () => {
    mockedGetServerSession.mockResolvedValue(AUTHED_SESSION);
    global.fetch = jest.fn() as jest.Mock;
    const oversized = JSON.stringify({
      lessonTitle: "Secure prompts",
      description: "x".repeat(9 * 1024),
    });

    const response = await POST(makeRequest(oversized));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Request body is too large." });
    expect(mockedDbQuery).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not call xAI when the server key is missing", async () => {
    mockedGetServerSession.mockResolvedValue(AUTHED_SESSION);
    delete process.env.XAI_API_KEY;
    global.fetch = jest.fn() as jest.Mock;

    const response = await POST(makeRequest(JSON.stringify({ lessonTitle: "Test" })));

    expect(response.status).toBe(503);
    expect(mockedDbQuery).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns only validated quiz questions from a successful upstream response", async () => {
    mockedGetServerSession.mockResolvedValue(AUTHED_SESSION);
    mockedDbQuery.mockResolvedValue({ rows: [] });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  questions: [
                    {
                      question: "What is active recall?",
                      options: ["Guessing", "Retrieving knowledge", "Highlighting", "Skipping"],
                      correctIndex: 1,
                      explanation: "It means retrieving knowledge from memory.",
                    },
                    { question: "Invalid question" },
                  ],
                }),
              },
            },
          ],
        }),
    }) as jest.Mock;

    const response = await POST(
      makeRequest(
        JSON.stringify({
          lessonTitle: "Learning techniques",
          description: "A short lesson about active recall.",
          keyTakeaways: ["Practice retrieving information"],
        })
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      questions: [
        {
          question: "What is active recall?",
          options: ["Guessing", "Retrieving knowledge", "Highlighting", "Skipping"],
          correctIndex: 1,
          explanation: "It means retrieving knowledge from memory.",
        },
      ],
    });
  });
});