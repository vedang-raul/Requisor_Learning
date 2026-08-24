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

function mockFetch(response: { success: boolean }) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    json: async () => response,
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

  it("calls the Cloudflare siteverify endpoint with the secret and token", async () => {
    mockFetch({ success: true });
    await verifyTurnstile("my-token");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v1/siteverify",
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
