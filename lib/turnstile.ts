/**
 * lib/turnstile.ts
 *
 * Server-side Cloudflare Turnstile token verification.
 *
 * Every login, signup, and password-reset action can send a Turnstile token
 * generated client-side. When enabled, this module validates that token
 * against Cloudflare's siteverify API before any sensitive operation proceeds.
 *
 * Turnstile is currently disabled by default. Set TURNSTILE_ENABLED=true
 * together with TURNSTILE_SECRET_KEY when production protection is ready.
 *
 * Dev / test bypass:
 *   When TURNSTILE_SECRET_KEY is not set and NODE_ENV is not "production",
 *   verification is skipped with a console warning so local development and
 *   automated tests work without Cloudflare credentials.  To exercise the
 *   real verification flow locally, set TURNSTILE_SECRET_KEY to the
 *   Cloudflare always-pass test secret:
 *     1x0000000000000000000000000000000AA
 *
 * In production, a missing secret causes all requests to be rejected.
 */

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v1/siteverify";

/** Whether the server-side Turnstile gate is enabled. */
export function isTurnstileEnabled(): boolean {
  return process.env.TURNSTILE_ENABLED === "true";
}

/**
 * Verify a Cloudflare Turnstile challenge token server-side.
 *
 * @returns `{ success: true }` when the token is genuine.
 *          `{ success: false }` when it is missing, invalid, or the request fails.
 */
export async function verifyTurnstile(
  token: string | null | undefined
): Promise<{ success: boolean }> {
  // Feature flag is intentionally off until production keys and the
  // Cloudflare site domain are configured.
  if (!isTurnstileEnabled()) return { success: true };

  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      // Dev / test bypass: allow all requests so local development and Jest
      // tests work without a real Cloudflare account.
      console.warn(
        "[turnstile] TURNSTILE_SECRET_KEY not configured — bypassing verification in dev/test"
      );
      return { success: true };
    }
    // Production without a key: fail closed, never silently allow.
    console.error(
      "[turnstile] TURNSTILE_SECRET_KEY is not set — rejecting request in production"
    );
    return { success: false };
  }

  // Empty or missing tokens always fail — skip the network round-trip.
  if (!token) return { success: false };

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }).toString(),
    });
    const data = (await res.json()) as { success: boolean };
    return { success: data.success === true };
  } catch (err) {
    console.error("[turnstile] siteverify request failed:", err);
    return { success: false };
  }
}
