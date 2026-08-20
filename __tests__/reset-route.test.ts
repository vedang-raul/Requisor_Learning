jest.mock("@/lib/db", () => ({
  db: { query: jest.fn() },
}));

import { POST } from "@/app/api/reset/route";

function request(body: string): Request {
  return new Request("http://localhost/api/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("POST /api/reset request bounds", () => {
  it("rejects malformed JSON before querying the database", async () => {
    const response = await POST(request("{not-json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid reset link." });
  });

  it("rejects oversized streamed bodies before parsing or hashing", async () => {
    const response = await POST(
      request(JSON.stringify({ token: "a".repeat(64), password: "password123", ignored: "x".repeat(8192) }))
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Request body is too large." });
  });
});