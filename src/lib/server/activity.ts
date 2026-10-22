import { headers } from "next/headers";
import { db } from "@/lib/server/db";
import { describeUserAgent } from "@/lib/activity/describe";

/**
 * Recording activity for the super admin's Activity tab
 * (src/components/admin/activity-panel.tsx): sign-ins here, page time in
 * src/app/api/activity/route.ts. Recording never gets in the way of the app:
 * failures are swallowed.
 */

/** The client's IP as the host's proxy reports it (rightmost X-Forwarded-For hop, as in the auth route). */
export function clientIpFrom(h: Headers): string | null {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const forwarded = h.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwarded ? forwarded.slice(0, 64) : null;
}

/** Location from the headers hosts like Vercel and Cloudflare add; nothing is looked up elsewhere. */
export function locationFrom(h: Headers): { country: string | null; region: string | null; city: string | null } {
  const read = (...names: string[]) => {
    for (const name of names) {
      const value = h.get(name)?.trim();
      if (value && value !== "XX") {
        try { return decodeURIComponent(value).slice(0, 80); } catch { return value.slice(0, 80); }
      }
    }
    return null;
  };
  return {
    country: read("x-vercel-ip-country", "cf-ipcountry", "x-country"),
    region: read("x-vercel-ip-country-region", "cf-region", "x-region"),
    city: read("x-vercel-ip-city", "cf-ipcity", "x-city"),
  };
}

/** Records a successful sign-in. Called from NextAuth's signIn event, inside the auth request. */
export async function recordLogin(email: string | null | undefined, method: string): Promise<void> {
  if (!email) return;
  try {
    const h = await headers();
    const ua = h.get("user-agent")?.slice(0, 500) ?? null;
    const client = describeUserAgent(ua);
    const place = locationFrom(h);
    await db.query(
      `INSERT INTO login_events (user_id, method, ip, user_agent, browser, os, device, country, region, city)
       SELECT id, $2, $3, $4, $5, $6, $7, $8, $9, $10 FROM users WHERE email = $1`,
      [email.toLowerCase(), method.slice(0, 30), clientIpFrom(h), ua, client.browser, client.os, client.device, place.country, place.region, place.city]
    );
  } catch {
    // Analytics must never block signing in.
  }
}
