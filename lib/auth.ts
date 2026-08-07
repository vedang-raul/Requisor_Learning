import "./base-url";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { db, roleForEmail, ADMIN_EMAIL, type DbUser } from "./db";
import { sendWelcomeEmail } from "./email";

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
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const name = user.name ?? email.split("@")[0];
      const { rows } = await db.query<DbUser>(
        `INSERT INTO users (email, name, google_id, email_verified, role)
         VALUES ($1, $2, $3, TRUE, $4)
         ON CONFLICT (email) DO UPDATE
           SET google_id = EXCLUDED.google_id,
               email_verified = TRUE,
               name = COALESCE(users.name, EXCLUDED.name),
               last_login_at = NOW()
         RETURNING *, (xmax = 0) AS is_new`,
        [email, name, account.providerAccountId, roleForEmail(email)]
      );
      const row = rows[0] as DbUser & { is_new?: boolean };
      if (row.is_new) {
        sendWelcomeEmail(email, name).catch((e) => console.error("Welcome email failed:", e));
      }
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
        token.role = roleForEmail(email);
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
        session.user.role = (token.role as "employee" | "admin") ?? "employee";
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    },
  },
};
