jest.mock("@/lib/server/db", () => ({ db: { query: jest.fn() } }));

import { db } from "@/lib/server/db";
import { readXaiUsage, recordUnits, xaiFetch } from "@/lib/ai/usage";

const mockQuery = (db as unknown as { query: jest.Mock }).query;
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("AI usage tracking", () => {
  const realFetch = global.fetch;
  beforeEach(() => { mockQuery.mockReset(); mockQuery.mockResolvedValue({ rows: [] }); });
  afterEach(() => { global.fetch = realFetch; });

  it("reads the tokens from a whole answer and from a streamed one", () => {
    expect(readXaiUsage(JSON.stringify({ model: "grok-3-mini", usage: { prompt_tokens: 120, completion_tokens: 45 } })))
      .toEqual({ model: "grok-3-mini", inputTokens: 120, outputTokens: 45 });
    const stream = [
      'data: {"model":"grok-3-mini","choices":[{"delta":{"content":"Hi"}}]}',
      'data: {"model":"grok-3-mini","choices":[],"usage":{"prompt_tokens":900,"completion_tokens":30}}',
      "data: [DONE]",
    ].join("\n\n");
    expect(readXaiUsage(stream)).toEqual({ model: "grok-3-mini", inputTokens: 900, outputTokens: 30 });
    // A reasoning model's thinking is billed as output, though reported apart from the answer.
    expect(readXaiUsage(JSON.stringify({ model: "grok-3-mini", usage: { prompt_tokens: 197, completion_tokens: 7, total_tokens: 480, completion_tokens_details: { reasoning_tokens: 276 } } })))
      .toEqual({ model: "grok-3-mini", inputTokens: 197, outputTokens: 283 });
    expect(readXaiUsage('data: {"choices":[]}\n\ndata: [DONE]')).toBeNull();
    expect(readXaiUsage("not json")).toBeNull();
    expect(readXaiUsage(JSON.stringify({ usage: { prompt_tokens: 0, completion_tokens: 0 } }))).toBeNull();
  });

  it("records an answer's tokens against the person, and leaves the answer readable", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ model: "grok-3-mini", usage: { prompt_tokens: 10, completion_tokens: 5 }, choices: [{ message: { content: "ok" } }] }), { status: 200 })) as unknown as typeof fetch;
    const res = await xaiFetch({ userId: "7", feature: "lesson_ai" }, "https://api.x.ai/v1/chat/completions", { method: "POST", body: "{}" });
    expect((await res.json()).choices[0].message.content).toBe("ok");
    await settle();
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(String(mockQuery.mock.calls[0][0])).toContain("INSERT INTO ai_usage");
    expect(mockQuery.mock.calls[0][1]).toEqual([7, "lesson_ai", "xai", "grok-3-mini", 10, 5, 0, ""]);
  });

  it("asks a streamed request to report its usage", async () => {
    global.fetch = jest.fn(async () => new Response("data: [DONE]", { status: 200 })) as unknown as typeof fetch;
    await xaiFetch({ userId: 7, feature: "assistant" }, "https://api.x.ai/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "m", stream: true }) });
    const sent = JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body));
    expect(sent.stream_options).toEqual({ include_usage: true });
  });

  it("records nothing for failed requests or unknown people", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 500 })) as unknown as typeof fetch;
    await xaiFetch({ userId: 7, feature: "quiz" }, "https://api.x.ai/v1/chat/completions", { method: "POST", body: "{}" });
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 })) as unknown as typeof fetch;
    await xaiFetch({ userId: undefined, feature: "quiz" }, "https://api.x.ai/v1/chat/completions", { method: "POST", body: "{}" });
    recordUnits({ userId: "abc", feature: "voice" }, "elevenlabs", 100, "characters");
    recordUnits({ userId: 7, feature: "voice" }, "elevenlabs", 0, "characters");
    await settle();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("records voice and video use as units", async () => {
    recordUnits({ userId: 7, feature: "voice" }, "elevenlabs", 240, "characters");
    await settle();
    expect(mockQuery.mock.calls[0][1]).toEqual([7, "voice", "elevenlabs", "", 0, 0, 240, "characters"]);
  });

  it("never lets a failed write break the feature", async () => {
    mockQuery.mockRejectedValue(new Error("db down"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    recordUnits({ userId: 7, feature: "voice_input" }, "elevenlabs", 1, "recordings");
    await settle();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
