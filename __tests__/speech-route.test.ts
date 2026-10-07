jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => ({ check: () => mockLimit() }),
}));
const mockLimit = jest.fn(() => ({ limited: false, retryAfterMs: 0 }));
import { GET, POST } from "@/app/api/speech/route";
import { getServerSession } from "next-auth/next";
import { getSpeechCatalog, resolveSpeechContent } from "@/lib/speech-catalog";

const session = getServerSession as jest.Mock;
const voiceId = "a".repeat(20);
const originalKey = process.env.ELEVENLABS_API_KEY;
const originalCatalog = process.env.ELEVENLABS_VOICES;
function request(body: unknown, options: RequestInit = {}) {
  return new Request("https://app.example.test/api/speech/", {
    method: "POST",
    headers: { origin: "https://app.example.test", "content-type": "application/json" },
    body: JSON.stringify(body), ...options,
  });
}
function audio(bytes = new Uint8Array([1, 2, 3])) {
  return new Response(bytes, { headers: { "content-type": "audio/mpeg" } });
}
const valid = { voiceKey: "guide", contentKey: "preview" };
describe("approved ElevenLabs speech boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLimit.mockReturnValue({ limited: false, retryAfterMs: 0 });
    session.mockResolvedValue({ user: { id: "17", email: "protected@example.test" } });
    process.env.ELEVENLABS_API_KEY = "test-only-speech-key";
    process.env.ELEVENLABS_VOICES = JSON.stringify([
      { key: "guide", name: "Guide", gender: "female", languages: ["en"], voiceId, enabled: true, default: true },
      { key: "other", name: "Other guide", gender: "male", languages: ["en", "hi"], voiceId: "b".repeat(20), enabled: true, default: false },
    ]);
    global.fetch = jest.fn(async () => audio());
    jest.spyOn(console, "info").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = originalKey;
    if (originalCatalog === undefined) delete process.env.ELEVENLABS_VOICES;
    else process.env.ELEVENLABS_VOICES = originalCatalog;
  });
  it("sends only a fixed server-owned phrase and model, without identities or credentials in logs", async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const [url, init] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`);
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body)).toEqual({
      text: "Hello. This is a sample of the platform guide voice.", model_id: "eleven_multilingual_v2",
    });
    expect(init.headers["xi-api-key"]).toBe("test-only-speech-key");
    expect(JSON.stringify(init)).not.toContain("protected@example.test");
    const logs = JSON.stringify((console.info as jest.Mock).mock.calls);
    expect(logs).not.toContain("sample");
    expect(logs).not.toContain("test-only-speech-key");
    expect(logs).not.toContain("protected@example.test");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it.each(["platform_help", "study_tip"])("resolves approved %s only on the server", async contentKey => {
    const r = await POST(request({ ...valid, voiceKey: "other", contentKey }));
    expect(r.status).toBe(200);
    expect(JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).text).toBe(resolveSpeechContent(contentKey));
  });
  it.each([
    { ...valid, text: "Student Alice scored 72" },
    { ...valid, messages: [{ role: "user", content: "Private message" }] },
    { ...valid, eligible: true },
    { ...valid, profile: "Student profile" },
    { ...valid, history: "Private history" },
    { ...valid, toolResults: "Private grades" },
    { ...valid, voiceId },
    { ...valid, contentKey: "Student Alice scored 72" },
    { ...valid, contentKey: "generated_reply" },
    { ...valid, contentKey: "__proto__" },
    { ...valid, voiceKey: voiceId },
    { ...valid, voiceKey: "not-approved" },
    { ...valid, contentKey: { text: "Secret", approved: true } },
    { ...valid, voiceKey: "../evil" },
  ])("rejects protected text, forged eligibility and unknown keys before provider calls: %j", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("gates catalog and speech on authentication", async () => {
    session.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(request(valid))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([undefined, "https://evil.test"])("rejects missing or cross-site origin %s", async origin => {
    expect((await POST(request(valid, { headers: { ...(origin ? { origin } : {}), "content-type": "application/json" } }))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects forged sec-fetch-site", async () => {
    expect((await POST(request(valid, { headers: { origin: "https://app.example.test", "content-type": "application/json", "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("bounds undeclared payloads before parsing", async () => {
    expect((await POST(request({ ...valid, text: "x".repeat(600) }))).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON and unexpected types", async () => {
    expect((await POST(request(valid, { body: "{" }))).status).toBe(400);
    expect((await POST(request(null))).status).toBe(400);
    expect((await POST(request(valid, { headers: { origin: "https://app.example.test", "content-type": "text/plain" } }))).status).toBe(415);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("honors the rate limit before provider access", async () => {
    mockLimit.mockReturnValue({ limited: true, retryAfterMs: 2500 });
    const r = await POST(request(valid));
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("3");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps credentials and provider IDs out of catalog responses", async () => {
    const body = await (await GET()).text();
    expect(body).toContain("female");
    expect(body).toContain("male");
    expect(body).not.toContain(voiceId);
    expect(body).not.toContain("test-only-speech-key");
  });
  it("provides honest disabled entries when IDs or credentials are missing", async () => {
    delete process.env.ELEVENLABS_VOICES;
    const catalog = getSpeechCatalog();
    expect(catalog.voices).toHaveLength(2);
    expect(catalog.voices.every(v => !v.enabled && v.unavailableReason === "Voice ID not configured.")).toBe(true);
    expect((await POST(request({ voiceKey: "male-guide", contentKey: "preview" }))).status).toBe(503);
    process.env.ELEVENLABS_VOICES = originalCatalog;
    delete process.env.ELEVENLABS_API_KEY;
    expect(getSpeechCatalog().voices.every(v => !v.enabled)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects disabled or non-English-only voices", async () => {
    const c = JSON.parse(process.env.ELEVENLABS_VOICES!);
    c[0].enabled = false;
    c[1].languages = ["hi"];
    process.env.ELEVENLABS_VOICES = JSON.stringify(c);
    expect((await POST(request(valid))).status).toBe(503);
    expect((await POST(request({ ...valid, voiceKey: "other" }))).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    "not-json", "[]",
    JSON.stringify([{ key: "g", voiceId: "https://evil.test" }]),
    JSON.stringify([{ key: "guide", name: "Guide", gender: "female", languages: ["en"], voiceId, enabled: true, default: false }]),
  ])("fails closed for invalid central configuration", config => {
    process.env.ELEVENLABS_VOICES = config;
    expect(getSpeechCatalog().configured).toEqual([]);
    expect(getSpeechCatalog().setupMessage).toContain("invalid");
  });
  it("does not return or log provider error text", async () => {
    global.fetch = jest.fn(async () => new Response("Secret provider text", { status: 403 }));
    const r = await POST(request(valid));
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("Secret");
    expect(JSON.stringify((console.info as jest.Mock).mock.calls)).not.toContain("Secret");
  });
  it.each([new Response("not-audio"), audio(new Uint8Array()), audio(new Uint8Array(1024 * 1024 + 1))])("rejects invalid or unbounded provider audio", async upstream => {
    global.fetch = jest.fn(async () => upstream);
    expect((await POST(request(valid))).status).toBe(502);
  });
  it("limits concurrent requests and cancels upstream reads when the browser aborts", async () => {
    const abort = new AbortController();
    const cancelled = jest.fn();
    let signal: AbortSignal | undefined;
    global.fetch = jest.fn(async (_url, init) => {
      signal = init?.signal ?? undefined;
      return new Response(new ReadableStream({ cancel: cancelled }), { headers: { "content-type": "audio/mpeg" } });
    });
    const first = POST(request(valid, { signal: abort.signal }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect((await POST(request(valid))).status).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(1);
    abort.abort();
    expect((await first).status).toBe(499);
    expect(signal?.aborted).toBe(true);
    expect(cancelled).toHaveBeenCalled();
    global.fetch = jest.fn(async () => audio());
    expect((await POST(request(valid))).status).toBe(200);
  });
  it("times out stalled provider audio and releases the slot", async () => {
    jest.useFakeTimers();
    try {
      global.fetch = jest.fn(async () => new Response(new ReadableStream(), { headers: { "content-type": "audio/mpeg" } }));
      const pending = POST(request(valid));
      await jest.advanceTimersByTimeAsync(15_001);
      expect((await pending).status).toBe(504);
    } finally { jest.useRealTimers(); }
    global.fetch = jest.fn(async () => audio());
    expect((await POST(request(valid))).status).toBe(200);
  });
  it("rejects an already aborted request without calling the provider", async () => {
    const c = new AbortController(); c.abort();
    expect((await POST(request(valid, { signal: c.signal }))).status).toBe(499);
    expect(fetch).not.toHaveBeenCalled();
  });
});
