import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export const db: Pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") global.__pgPool = db;

export interface DbUser {
  id: number;
  email: string;
  name: string | null;
  password_hash: string | null;
  google_id: string | null;
  email_verified: boolean;
  role: "employee" | "admin";
  verification_token: string | null;
  verification_expires: Date | null;
  reset_token: string | null;
  reset_expires: Date | null;
  created_at: Date;
  employment_type: string | null;
  position: string | null;
  date_of_birth: Date | null;
  gender: string | null;
}

export const ADMIN_EMAIL = "support@requisor.io";

export function roleForEmail(email: string): "employee" | "admin" {
  return email.toLowerCase() === ADMIN_EMAIL ? "admin" : "employee";
}
