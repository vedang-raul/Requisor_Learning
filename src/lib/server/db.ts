import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

/**
 * Hosted Postgres (Supabase) needs TLS. Set DATABASE_SSL=require to turn it
 * on. Supabase's certificates are signed by its own CA, which Node doesn't
 * trust by default, so the connection is encrypted but the certificate is only
 * verified when DATABASE_CA_CERT holds that CA (paste the PEM; "\n" allowed).
 * Unset (local Docker, Replit) leaves the connection string in charge.
 */
function sslConfig(): { ssl?: { rejectUnauthorized: boolean; ca?: string } } {
  const mode = (process.env.DATABASE_SSL ?? "").toLowerCase();
  if (!mode || mode === "off" || mode === "false") return {};
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  return { ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } };
}

/** With explicit SSL settings, an sslmode in the URL would override them. */
function connectionString(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !sslConfig().ssl) return url;
  return url.replace(/([?&])sslmode=[^&]*&?/i, "$1").replace(/[?&]$/, "");
}

function makePool(): Pool {
  const pool = new Pool({
    connectionString: connectionString(),
    ...sslConfig(),
    // Evict idle connections after 30 s to avoid exhausting the server-side
    // limit when traffic temporarily subsides.
    max: Number(process.env.PG_POOL_MAX) || 20,
    // limit when traffic temporarily subsides.
    idleTimeoutMillis: 30_000,
    // Fail fast if every slot is busy rather than queuing indefinitely —
    // surfaces overload as a 500 instead of a silent hang.
    // Longer on serverless hosts, where the first request after a quiet spell
    // has to open a fresh TLS connection to the database before it can do anything.
    connectionTimeoutMillis: process.env.VERCEL ? 10_000 : 3_000,
  });

  // Cap individual queries at 8 s; long-running queries hold slots and
  // cascade into pool exhaustion under load.
  pool.on("connect", (client) => {
    client.query("SET statement_timeout = 8000").catch(() => {});
  });

  return pool;
}

export const db: Pool = global.__pgPool ?? makePool();

if (process.env.NODE_ENV !== "production") global.__pgPool = db;

export interface DbUser {
  id: number;
  email: string;
  name: string | null;
  password_hash: string | null;
  google_id: string | null;
  email_verified: boolean;
  role: UserRole;
  verification_token: string | null;
  verification_expires: Date | null;
  reset_token: string | null;
  reset_expires: Date | null;
  reset_requested_at: Date | null;
  created_at: Date;
  employment_type: string | null;
  position: string | null;
  date_of_birth: Date | null;
  gender: string | null;
  qualification: string | null;
  learning_goal: string | null;
  onboarding_done: boolean;
  assistant_persona: string | null;
  preferred_language: string | null;
  preferred_country: string | null;
  notification_settings: {
    courses: boolean;
    assignments: boolean;
    badges: boolean;
    announcements: boolean;
  } | null;
}

export const ADMIN_EMAIL = "support@requisor.io";
export type UserRole = "employee" | "tutor" | "admin";

/** The support mailbox is the only identity that can ever be an admin. */
export function roleForEmail(email: string): "employee" | "admin" {
  return email.trim().toLowerCase() === ADMIN_EMAIL ? "admin" : "employee";
}
