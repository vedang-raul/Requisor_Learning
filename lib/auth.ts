import "./base-url";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { db, roleForEmail, type DbUser } from "./db";
import { sendWelcomeEmail } from "./email";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/", error: "/" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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
        if (!user.email_verified) throw new Error("EMAIL_NOT_VERIFIED");
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
               name = COALESCE(users.name, EXCLUDED.name)
         RETURNING *, (xmax = 0) AS is_new`,
        [email, name, account.providerAccountId, roleForEmail(email)]
      );
      const row = rows[0] as DbUser & { is_new?: boolean };
      if (row.is_new) {
        // First-time Google signup — send welcome email (best-effort).
        sendWelcomeEmail(email, name).catch((e) => console.error("Welcome email failed:", e));
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const email = user.email.toLowerCase();
        const { rows } = await db.query<DbUser>("SELECT id, role, name FROM users WHERE email = $1", [email]);
        token.uid = rows[0] ? String(rows[0].id) : undefined;
        token.role = roleForEmail(email); // role is derived strictly from the email
        if (rows[0]?.name) token.name = rows[0].name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? "";
        session.user.role = (token.role as "employee" | "admin") ?? "employee";
      }
      return session;
    },
  },
};
