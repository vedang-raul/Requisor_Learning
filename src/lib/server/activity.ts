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

/** Location from the headers hosts like Vercel and Cloudflare add; falls back to ipapi.co lookup by IP. */
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

/** Resolves location via ipapi.co when host headers don't carry geo data (e.g. Replit). */
async function geoLookup(ip: string): Promise<{ country: string | null; region: string | null; city: string | null }> {
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { "User-Agent": "Alma41/1.0" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { country: null, region: null, city: null };
    const data = await res.json() as Record<string, unknown>;
    // ipapi.co returns { error: true } for private/reserved IPs
    if (data.error) return { country: null, region: null, city: null };
    return {
      country: typeof data.country_name === "string" ? data.country_name.slice(0, 80) : null,
      region: typeof data.region === "string" ? data.region.slice(0, 80) : null,
      city: typeof data.city === "string" ? data.city.slice(0, 80) : null,
    };
  } catch {
    return { country: null, region: null, city: null };
  }
}

/** Records a successful sign-in. Called from NextAuth's signIn event, inside the auth request. */
export async function recordLogin(email: string | null | undefined, method: string): Promise<void> {
  if (!email) return;
  try {
    const h = await headers();
    const ua = h.get("user-agent")?.slice(0, 500) ?? null;
    const client = describeUserAgent(ua);
    const ip = clientIpFrom(h);
    let place = locationFrom(h);
    if (!place.country && ip) {
      place = await geoLookup(ip);
    }
    await db.query(
      `INSERT INTO login_events (user_id, method, ip, user_agent, browser, os, device, country, region, city)
       SELECT id, $2, $3, $4, $5, $6, $7, $8, $9, $10 FROM users WHERE email = $1`,
      [email.toLowerCase(), method.slice(0, 30), ip, ua, client.browser, client.os, client.device, place.country, place.region, place.city]
    );
  } catch {
    // Analytics must never block signing in.
  }
}
