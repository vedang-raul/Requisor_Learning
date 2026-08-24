jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({ authOptions: {} }));

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.mock("@/lib/db", () => ({
  db: { query: jest.fn(), connect: jest.fn() },
}));

import { POST } from "@/app/api/quiz/grade/route";
import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";

const mockedGetServerSession = getServerSession as jest.Mock;
const mockedDbQuery = db.query as jest.Mock;
const mockedConnect = db.connect as jest.Mock;
const AUTHED_SESSION = { user: { email: "learner@example.com" } };

const STORED_QUESTIONS = [
  {
    id: "q1",
    concept: "Problem framing",
    question: "What comes first?",
    options: ["A feature", "A problem", "A logo", "A launch"],
    correctIndex: 1,
    explanation: "Start with the real problem.",
  },
  {
    id: "q2",
    concept: "Problem framing",
    question: "Which option is best?",
    options: ["Guess", "Test", "Ignore", "Delay"],
    correctIndex: 1,
    explanation: "Testing creates evidence.",
  },
  {
    id: "q3",
    concept: "Constraints",
    question: "What can sharpen thinking?",
    options: ["Noise", "Constraints", "Scope creep", "Silence"],
    correctIndex: 1,
    explanation: "Constraints focus decisions.",
  },
];

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/quiz/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockedConnect.mockResolvedValue(mockClient);
  mockedGetServerSession.mockResolvedValue(AUTHED_SESSION);
  mockedDbQuery.mockResolvedValue({ rows: [{ id: 7 }] });
  mockClient.query.mockImplementation((sql: string) => {
    if (sql.includes("SELECT questions")) {
      return Promise.resolve({ rows: [{ questions: STORED_QUESTIONS, graded_at: null }] });
    }
    return Promise.resolve({ rows: [] });
  });
});

describe("POST /api/quiz/grade — server-side answers and mastery", () => {
  it("rejects anonymous and malformed submissions without opening a database transaction", async () => {
    mockedGetServerSession.mockResolvedValueOnce(null);
    const anonymous = await POST(makeRequest({ quizId: 4, answers: {} }));
    expect(anonymous.status).toBe(401);
    expect(mockedConnect).not.toHaveBeenCalled();

    const malformed = await POST(makeRequest({ quizId: 4, answers: { q1: 1 } }));
    expect(malformed.status).toBe(400);
    expect(mockedConnect).not.toHaveBeenCalled();
  });

  it("scores stored answers, updates mastery transactionally, and never returns a correct index", async () => {
    const response = await POST(makeRequest({ quizId: 4, answers: { q1: 1, q2: 0, q3: 1 } }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      score: 2,
      total: 3,
      results: [
        { id: "q1", correct: true, correctOption: "A problem", explanation: "Start with the real problem." },
        { id: "q2", correct: false, correctOption: "Test", explanation: "Testing creates evidence." },
        { id: "q3", correct: true, correctOption: "Constraints", explanation: "Constraints focus decisions." },
      ],
    });

    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO learner_mastery"))).toHaveLength(2);
    expect(mockClient.query.mock.calls.some(([sql]) => String(sql).includes("SET graded_at = NOW()"))).toBe(true);
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("returns 404 for a quiz not owned by the current learner", async () => {
    mockClient.query.mockImplementation((sql: string) => {
      if (sql.includes("SELECT questions")) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });

    const response = await POST(makeRequest({ quizId: 4, answers: { q1: 1, q2: 0, q3: 1 } }));

    expect(response.status).toBe(404);
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.release).toHaveBeenCalled();
  });
});