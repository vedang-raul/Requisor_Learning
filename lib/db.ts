import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function makePool(): Pool {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Raised from 5 → 20 to support thousands of concurrent users.
    // Replit Postgres comfortably handles this; raise further only after
    // profiling real connection saturation. Redis-backed pgBouncer is the
    // next upgrade path for multi-instance deployments.
    max: 20,
    // Evict idle connections after 30 s to avoid exhausting the server-side
    // limit when traffic temporarily subsides.
    idleTimeoutMillis: 30_000,
    // Fail fast if every slot is busy rather than queuing indefinitely —
    // surfaces overload as a 500 instead of a silent hang.
    connectionTimeoutMillis: 3_000,
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
