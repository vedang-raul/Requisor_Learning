/**
 * __tests__/turnstile.test.ts
 *
 * Tests for the verifyTurnstile server-side helper (lib/turnstile.ts).
 *
 * The module is imported directly (not mocked) so we test the real logic.
 * Global fetch is replaced with a Jest mock to control Cloudflare API responses.
 */

// ── Imports ───────────────────────────────────────────────────────────────────

import { isTurnstileEnabled, verifyTurnstile } from "@/lib/turnstile";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(response: { success: boolean }, init: { ok?: boolean; status?: number } = {}) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => response,
    text: async () => JSON.stringify(response),
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

// Use a real-looking test secret so the "secret is set" branch is exercised.
const TEST_SECRET = "1x0000000000000000000000000000000AA";

beforeEach(() => {
  process.env.TURNSTILE_ENABLED = "true";
  process.env.TURNSTILE_SECRET_KEY = TEST_SECRET;
  global.fetch = jest.fn();
});

afterEach(() => {
  delete process.env.TURNSTILE_ENABLED;
  delete process.env.TURNSTILE_SECRET_KEY;
  jest.restoreAllMocks();
});

describe("Turnstile feature flag", () => {
  it("is disabled by default", async () => {
    delete process.env.TURNSTILE_ENABLED;
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(isTurnstileEnabled()).toBe(false);
    expect(await verifyTurnstile(null)).toEqual({ success: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("verifyTurnstile — with a configured secret", () => {
  it("returns success:true when Cloudflare responds with success:true", async () => {
    mockFetch({ success: true });
    const { success } = await verifyTurnstile("valid-token");
    expect(success).toBe(true);
  });

  it("fails closed and logs when siteverify returns a non-OK status", async () => {
    // Regression: the endpoint URL was once /turnstile/v1/siteverify, which
    // 404s with an empty body. res.json() then threw and the catch swallowed
    // it, so a wrong URL was indistinguishable from a genuine bot rejection.
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => { throw new SyntaxError("Unexpected end of JSON input"); },
      text: async () => "",
    });
    expect(await verifyTurnstile("valid-token")).toEqual({ success: false });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("non-OK status"), 404, ""
    );
    error.mockRestore();
  });

  it("calls the Cloudflare siteverify endpoint with the secret and token", async () => {
    mockFetch({ success: true });
    await verifyTurnstile("my-token");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns success:false when Cloudflare responds with success:false", async () => {
    mockFetch({ success: false });
    const { success } = await verifyTurnstile("bad-token");
    expect(success).toBe(false);
  });

  it("returns success:false without a network call when token is empty string", async () => {
    const { success } = await verifyTurnstile("");
    expect(success).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns success:false without a network call when token is null", async () => {
    const { success } = await verifyTurnstile(null);
    expect(success).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns success:false when the network request throws", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network error"));
    const { success } = await verifyTurnstile("some-token");
    expect(success).toBe(false);
  });
});

describe("verifyTurnstile — without a configured secret (dev bypass)", () => {
  beforeEach(() => {
    // Remove the secret to exercise the dev-bypass path.
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it("bypasses verification and returns success:true in non-production", async () => {
    // NODE_ENV is "test" in Jest — satisfies the non-production check.
    const { success } = await verifyTurnstile("any-token");
    expect(success).toBe(true);
  });

  it("does not call the Cloudflare API in the dev bypass path", async () => {
    await verifyTurnstile("any-token");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
