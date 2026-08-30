import "./base-url";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { db, roleForEmail, ADMIN_EMAIL, type DbUser } from "./db";
import { sendWelcomeEmail } from "./email";
import crypto from "crypto";
import { cookies } from "next/headers";

const GOOGLE_SIGNIN_FAILED_ERROR = "/?error=GoogleSignInFailed";
const ROLE_INTENT_COOKIE_NAME = "google-role-intent";
const ROLE_INTENT_TTL_MS = 2 * 60_000;

type GoogleProfile = {
  email?: unknown;
  email_verified?: unknown;
};

function normalizedEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email ? email : null;
}

function hasTutorRoleIntent(value: string | undefined): boolean {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot === -1) return false;
  const timestamp = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  const issuedAt = Number(timestamp);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > Date.now() || Date.now() - issuedAt > ROLE_INTENT_TTL_MS ||
      !/^[0-9a-f]{64}$/.test(signature)) return false;
  const secret = process.env.SESSION_SECRET ?? process.env.NEXTAUTH_SECRET ??
    (process.env.NODE_ENV !== "production" ? "dev-role-intent-secret-not-for-production" : "");
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(`tutor-role-intent:${timestamp}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
}

async function requestedGoogleRole(): Promise<"employee" | "tutor"> {
  try {
    const cookieStore = await cookies();
    return hasTutorRoleIntent(cookieStore.get(ROLE_INTENT_COOKIE_NAME)?.value) ? "tutor" : "employee";
  } catch {
    // There is no request cookie context in isolated callback tests. Fail
    // closed rather than granting a role from any client-controlled value.
    return "employee";
  }
}

// ─── Session / cookie constants ─────────────────────────────────────────────
const SESSION_MAX_AGE = 60 * 60; // 1 hour (seconds) — hard JWT expiry
const INACTIVITY_LIMIT = 60 * 60; // 1 hour (seconds) — idle logout threshold

// Cookie name differs between dev (http) and prod (https)
const isSecure = process.env.NODE_ENV === "production";
const cookieName = isSecure
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET,
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
    // Refresh the token at most once every 5 minutes — not on every request.
    // The client-side InactivityGuard handles idle logout; the JWT maxAge is
    // the server-side hard limit. updateAge: 0 would hit the DB on every call.
    updateAge: 300,
  },
  // Override the session-token cookie so it has NO maxAge → becomes a true
  // session cookie that the browser deletes when the tab / window is closed.
  cookies: {
    sessionToken: {
      name: cookieName,
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: isSecure,
        // maxAge intentionally omitted → session cookie
      },
    },
  },
  pages: { signIn: "/", error: "/" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Force the account-chooser screen every time so Chrome's FedCM /
      // automatic sign-in never silently authenticates without user action.
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
    // ─── DEV-ONLY bypass — never active in production ───────────────────
    ...(process.env.NODE_ENV !== "production"
      ? [
          CredentialsProvider({
            id: "dev-admin",
            name: "Dev Admin",
            credentials: {},
            async authorize() {
              // Auto-sign in as the admin account — no password needed.
              // Ensure the admin row exists so session.user.id is always a real DB id.
              const { rows } = await db.query<DbUser>(
                `INSERT INTO users (email, name, email_verified, role)
                 VALUES ($1, 'Admin', TRUE, 'admin')
                 ON CONFLICT (email) DO UPDATE SET email_verified = TRUE
                 RETURNING *`,
                [ADMIN_EMAIL]
              );
              db.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [rows[0].id]).catch(() => {});
              return { id: String(rows[0].id), email: rows[0].email, name: rows[0].name ?? "Admin" };
            },
          }),
          CredentialsProvider({
            id: "dev-tutor",
            name: "Dev Tutor",
            credentials: {},
            async authorize() {
              // Reserved synthetic account for local and preview-only tutor checks.
              // This provider is never registered when NODE_ENV is production.
              const { rows } = await db.query<DbUser>(
                `INSERT INTO users (email, name, email_verified, role)
                 VALUES ('dev-tutor@requisor.local', 'Development Tutor', TRUE, 'tutor')
                 ON CONFLICT (email) DO UPDATE
                   SET name = 'Development Tutor', email_verified = TRUE, role = 'tutor'
                 RETURNING *`,
              );
              db.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [rows[0].id]).catch(() => {});
              return { id: String(rows[0].id), email: rows[0].email, name: rows[0].name ?? "Development Tutor" };
            },
          }),
        ]
      : []),
    CredentialsProvider({
      name: "Email & password",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) throw new Error("Enter your email and password.");
        const { rows } = await db.query<DbUser>("SELECT * FROM users WHERE email = $1", [email]);
        const user = rows[0];
        if (!user || !user.password_hash) throw new Error("Invalid email or password.");
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) throw new Error("Invalid email or password.");
        if (!user.email_verified) throw new Error("EMAIL_NOT_VERIFIED");
        // Record login time
        db.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]).catch(() => {});
        return { id: String(user.id), email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;

      // Google must explicitly assert both the email address and that it has
      // verified that address. Do not rely solely on the provider's mapped
      // `user.email`, and never use an incomplete identity to link accounts.
      const googleProfile = profile as GoogleProfile | undefined;
      const profileEmail = normalizedEmail(googleProfile?.email);
      const userEmail = normalizedEmail(user.email);
      const googleId = account.providerAccountId?.trim();
      if (
        !profileEmail ||
        !userEmail ||
        profileEmail !== userEmail ||
        googleProfile?.email_verified !== true ||
        !googleId
      ) {
        return GOOGLE_SIGNIN_FAILED_ERROR;
      }

      const name = user.name?.trim() || profileEmail.split("@")[0];
      const { rows: existingRows } = await db.query<
        Pick<DbUser, "id" | "email" | "name" | "password_hash" | "google_id">
      >(
        "SELECT id, email, name, password_hash, google_id FROM users WHERE email = $1 OR google_id = $2",
        [profileEmail, googleId]
      );
      const existingByEmail = existingRows.find(
        (row) => normalizedEmail(row.email) === profileEmail
      );
      const existingByGoogleId = existingRows.find((row) => row.google_id === googleId);

      // A provider subject is a global identity binding. If it is already
      // attached to a different email, never create a second local account
      // for it, even if the provider changes the email claim.
      if (
        (existingByGoogleId && !existingByEmail) ||
        (existingByGoogleId &&
          existingByEmail &&
          existingByGoogleId.id !== existingByEmail.id)
      ) {
        return GOOGLE_SIGNIN_FAILED_ERROR;
      }

      if (existingByEmail) {
        // Never attach a new Google identity to an existing account. A
        // password account must use its established sign-in method, and a
        // Google account must present the exact Google subject it was created
        // with. This prevents email-only account takeover or identity swaps.
        if (existingByEmail.google_id !== googleId) return GOOGLE_SIGNIN_FAILED_ERROR;

        await db.query(
          `UPDATE users
           SET email_verified = TRUE,
               name = COALESCE(name, $1),
               last_login_at = NOW()
           WHERE id = $2`,
          [name, existingByEmail.id]
        );
        return true;
      }

      // INSERT ... DO NOTHING turns a concurrent registration into a safe
      // retry rather than overwriting whichever account won the race.
      // The role intent is a signed, HttpOnly, short-lived cookie issued by
      // google-initiate. It is consulted only for a newly-created non-admin
      // account; established roles and Google subject bindings are immutable.
      const requestedRole = await requestedGoogleRole();
      const createdRole = roleForEmail(profileEmail) === "admin" ? "admin" : requestedRole;
      const { rows: createdRows } = await db.query<Pick<DbUser, "id">>(
        `INSERT INTO users (email, name, google_id, email_verified, role)
         VALUES ($1, $2, $3, TRUE, $4)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [profileEmail, name, googleId, createdRole]
      );
      if (!createdRows[0]) return GOOGLE_SIGNIN_FAILED_ERROR;

      // A notification failure must never turn a verified sign-in into an
      // account error. Do not log recipient or provider details here.
      sendWelcomeEmail(profileEmail, name).catch(() => console.error("Welcome email failed."));
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      // Live profile update — client called useSession().update({ name })
      if (trigger === "update" && (session as { name?: string })?.name) {
        token.name = (session as { name: string }).name;
      }
      // Resolve the DB user id on first sign-in, and retry on later requests
      // if it's still missing (e.g. the users row was created after sign-in).
      const email = (user?.email ?? token.email)?.toLowerCase();
      if (email && (user?.email || !token.uid)) {
        const { rows } = await db.query<DbUser>("SELECT id, role, name FROM users WHERE email = $1", [email]);
        token.uid = rows[0] ? String(rows[0].id) : undefined;
        // Preserve established database roles. The canonical support address
        // remains admin even if an old row contains a stale role value.
        token.role = roleForEmail(email) === "admin"
          ? "admin"
          : rows[0]?.role === "tutor"
            ? "tutor"
            : "employee";
        if (rows[0]?.name) token.name = rows[0].name;
      }

      // ── Inactivity expiry (server-side backstop) ──────────────────────────
      // On the very first sign-in `user` is set; stamp lastActivity and skip
      // the idle check so the brand-new token is never immediately expired.
      const nowSec = Math.floor(Date.now() / 1000);
      if (user) {
        token.lastActivity = nowSec;
      } else {
        const lastActivity = token.lastActivity as number | undefined;
        if (lastActivity !== undefined && nowSec - lastActivity > INACTIVITY_LIMIT) {
          // Returning a token with exp in the past causes NextAuth to treat the
          // session as invalid on the next session() call.
          return { ...token, exp: 0 };
        }
        token.lastActivity = nowSec;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? "";
        session.user.role = (token.role as "employee" | "tutor" | "admin") ?? "employee";
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    },
  },
};
