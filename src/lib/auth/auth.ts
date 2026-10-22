import "../server/base-url";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { recordLogin } from "@/lib/server/activity";
import bcrypt from "bcryptjs";
import { db, roleForEmail, ADMIN_EMAIL, type DbUser } from "../server/db";
import { accessFor, type MembershipRow } from "./roles";
import { skipEmailVerification } from "../server/email";
import { sendWelcomeEmail } from "../server/email";
import { getToken } from "next-auth/jwt";
import { isViewAsKind, superAdminById, testAccount, VIEW_AS_PROVIDER } from "./view-as";

const GOOGLE_SIGNIN_FAILED_ERROR = "/?error=GoogleSignInFailed";
/** How often a signed-in person's role and university are read again from the database. */
const ACCESS_RECHECK_SECONDS = 5 * 60;
const PENDING_RECHECK_SECONDS = 30;

type GoogleProfile = {
  email?: unknown;
  email_verified?: unknown;
};

function normalizedEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email ? email : null;
}

// ─── Session / cookie constants ─────────────────────────────────────────────
const SESSION_MAX_AGE = 60 * 60; // 1 hour (seconds) — hard JWT expiry
const INACTIVITY_LIMIT = 60 * 60; // 1 hour (seconds) — idle logout threshold

// Cookie name differs between dev (http) and prod (https)
const isSecure = process.env.NODE_ENV === "production";
const cookieName = isSecure
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token";

/**
 * Password-free shortcuts into the reserved test accounts, for a local
 * development copy only — never offered by a production build. On the live
 * site, a super admin reaches those accounts with "view as" instead.
 */
export function testLoginsEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET,
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
    // NextAuth's updateAge applies to database sessions, not JWT callbacks.
    // JWT session validation below checks revocation on every request.
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
    // ─── Local development only: one-click test accounts ────────────────
    ...(testLoginsEnabled()
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
          ...([["dev-student", "student"], ["dev-tutor", "tutor"], ["dev-uni-admin", "university-admin"]] as const).map(([id, kind]) =>
            CredentialsProvider({
              id,
              name: `Dev ${kind}`,
              credentials: {},
              async authorize() {
                return testAccount(kind);
              },
            })
          ),
        ]
      : []),
    // ─── View as: a signed-in super admin switches into a test account ───
    CredentialsProvider({
      id: VIEW_AS_PROVIDER,
      name: "View as",
      credentials: { kind: { label: "Account", type: "text" } },
      async authorize(credentials, req) {
        // Who is asking comes only from their current session cookie, never the request body.
        // NextAuth passes this request's headers but not its parsed cookies, which getToken reads.
        const headers = (req.headers ?? {}) as Record<string, string | undefined>;
        const cookies = Object.fromEntries(
          (headers.cookie ?? "").split(";").map((part) => part.trim().split("=")).filter(([name]) => name)
            .map(([name, ...value]) => [name, decodeURIComponent(value.join("="))])
        );
        const current = await getToken({
          req: { headers, cookies } as unknown as Parameters<typeof getToken>[0]["req"],
          secret: process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET,
          cookieName,
        });
        // Already viewing as someone: the real super admin is the one recorded then.
        const adminId = current?.viewAsBy ?? (current?.superAdmin === true ? current.uid : null);
        // Re-checked against the database: a removed super admin can't switch.
        const admin = await superAdminById(adminId);
        if (!admin) return null;
        const kind = credentials?.kind;
        if (kind === "back") return { ...admin, viewAsBy: undefined };
        if (!isViewAsKind(kind)) return null;
        const target = await testAccount(kind);
        if (!target) return null;
        console.info(JSON.stringify({ event: "view_as", kind, admin: admin.id }));
        return { ...target, viewAsBy: admin.id };
      },
    }),
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
        if (!user.email_verified) {
          // Testing switch (see src/lib/server/email.ts): the right password is enough.
          if (!skipEmailVerification()) throw new Error("EMAIL_NOT_VERIFIED");
          await db.query("UPDATE users SET email_verified = TRUE, verification_token = NULL, verification_expires = NULL WHERE id = $1", [user.id]);
        }
        // Record login time
        db.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]).catch(() => {});
        return { id: String(user.id), email: user.email, name: user.name ?? undefined, sessionVersion: user.session_version };
      },
    }),
  ],
  events: {
    // Each successful sign-in, for the super admin's Activity tab.
    async signIn({ user, account }) {
      await recordLogin(user.email, account?.provider ?? "unknown");
    },
  },
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
      // Public Google sign-in never grants a privileged role. Existing roles
      // are handled above; only the canonical admin address is elevated here.
      const createdRole = roleForEmail(profileEmail) === "admin" ? "admin" : "employee";
      // A matching email domain places the person in that university straight away.
      const { rows: createdRows } = await db.query<Pick<DbUser, "id">>(
        `WITH matched AS (
           SELECT id FROM universities
            WHERE $4 <> 'admin' AND split_part(lower($1::text), '@', 2) = ANY(email_domains)
            ORDER BY id LIMIT 1
         )
         INSERT INTO users (email, name, google_id, email_verified, role, university_id, university_status)
         SELECT $1, $2, $3, TRUE, $4, (SELECT id FROM matched), CASE WHEN EXISTS (SELECT 1 FROM matched) THEN 'active' END
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
    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        // Set only by "view as"; switching back (or any other sign-in) clears it.
        token.viewAsBy = account?.provider === VIEW_AS_PROVIDER ? user.viewAsBy : undefined;
      }
      // Live profile update — client called useSession().update({ name })
      if (trigger === "update" && (session as { name?: string })?.name) {
        token.name = (session as { name: string }).name;
      }
      // Resolve the DB user id on first sign-in, and retry on later requests
      // if it's still missing (e.g. the users row was created after sign-in).
      const email = (user?.email ?? token.email)?.toLowerCase();
      // Role and university are read again every few minutes, so a promotion,
      // a demotion or an approval takes effect without signing out.
      const nowCheck = Math.floor(Date.now() / 1000);
      // Someone waiting for approval is re-checked often, so they get in soon after it.
      const recheckAfter = token.pending === true ? PENDING_RECHECK_SECONDS : ACCESS_RECHECK_SECONDS;
      const stale = typeof token.accessCheckedAt !== "number" || nowCheck - token.accessCheckedAt > recheckAfter;
      if (!email) throw new Error("Session account is unavailable.");
      // Never cache this check with the slower permission refresh. Recovery must
      // invalidate stolen cookies on their very next session request.
      const { rows } = await db.query<Pick<DbUser, "id" | "name" | "session_version"> & MembershipRow & { university_name: string | null }>(
          `SELECT u.id, u.role, u.name, u.session_version, u.university_id, u.university_status, un.name AS university_name
             FROM users u LEFT JOIN universities un ON un.id = u.university_id
            WHERE u.email = $1`,
          [email]
        );
      const current = rows[0];
      if (!current) throw new Error("Session account is unavailable.");
      // Pre-upgrade JWTs have version zero. Never adopt the current version for
      // an existing JWT: doing so would restore a revoked stolen session.
      const issuedVersion = user
        ? (user.sessionVersion ?? current.session_version)
        : (token.sessionVersion ?? 0);
      if (issuedVersion !== current.session_version) {
        // Merely setting exp=0 is insufficient: NextAuth can still project the
        // user this request and re-encode the token with a renewed expiry.
        throw new Error("Session has been revoked.");
      }
      token.sessionVersion = issuedVersion;
      if (user?.email || !token.uid || stale) {
        token.uid = rows[0] ? String(rows[0].id) : undefined;
        // The super admin list decides super admins; a university admin must belong to a university.
        const access = accessFor(email, rows[0]);
        if (!access) return { ...token, uid: "", role: "employee", superAdmin: false, universityId: null, pending: false, exp: 0 };
        token.role = access.role;
        token.superAdmin = access.superAdmin;
        token.universityId = access.universityId;
        token.pending = access.pending;
        token.pendingUniversity = access.pending ? rows[0]?.university_name ?? null : null;
        token.accessCheckedAt = nowCheck;
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
        session.user.superAdmin = token.superAdmin === true;
        // A super admin viewing the app as a test account (see src/lib/auth/view-as.ts).
        session.user.viewingAs = typeof token.viewAsBy === "string";
        session.user.universityId = typeof token.universityId === "number" ? token.universityId : null;
        session.user.pending = token.pending === true;
        session.user.pendingUniversity = typeof token.pendingUniversity === "string" ? token.pendingUniversity : null;
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    },
  },
};
