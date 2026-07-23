# Requisor Learning

Internal employee learning platform for Citrus Innovations — a dark-mode LMS where new interns and employees learn Product Management, Data Analytics, Agentic AI, and Cyber Security through curated YouTube-based learning paths.

## Stack

- **Next.js 14** (App Router) · TypeScript · Tailwind CSS · Framer Motion · Lucide Icons
- **Anthropic SDK** — AI learning assistant chat widget (Claude)
- **localStorage** — all state (auth, progress, notes, XP, streaks, admin edits)

## How to run

```bash
npm run dev -- -p 5000   # dev server on port 5000 (Replit webview)
npm run build && npm start  # production build (needs Node host, not static)
```

The configured Replit workflow (`Start application`) runs `npm run dev -- -p 5000` automatically.

## Environment secrets

| Secret | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Powers the AI learning assistant chat widget (`app/api/chat/route.ts`). Without it the widget opens but replies with a config-missing message — the rest of the app is unaffected. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth login (NextAuth). |
| `SESSION_SECRET` | Used as the NextAuth JWT secret. |

## Auth (real)

NextAuth (JWT sessions) with two providers — see `lib/auth.ts`:
- **Email + password**: signup at `/api/auth/signup` (bcrypt, email verification required before login), forgot/reset password flows. Verification & reset tokens are stored SHA-256-hashed.
- **Google OAuth**: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` secrets. Redirect URI must be `<base-url>/api/auth/callback/google` — **add the production URL in Google Cloud Console when publishing**.

Users live in the `users` table (Replit PostgreSQL). **support@requisor.io is the only admin** (`roleForEmail` in `lib/db.ts`); the Admin Panel nav item and `/app/admin` page are hidden/blocked for everyone else.

Learning state (progress, notes, XP) still lives in `localStorage`, namespaced per user email (`lib/store.tsx`).

## Email

All emails are sent from **support@requisor.io** via the Replit Gmail integration (`lib/email.ts`): verification, welcome, password reset, and "new learning video" announcements (admin panel → Courses & Lessons → send icon on a lesson → emails all verified users via `/api/admin/notify-video`).

## Key files

```
app/                   Pages: login, /app/* shell (dashboard, paths, course, learn, my-learning, badges, admin, settings)
app/api/chat/          Streaming Claude route for the AI assistant
components/            Sidebar, topbar, course cards, player, confetti, AI assistant widget, UI kit
lib/
  data.ts              Seed content: 4 learning paths, 58 lessons (REPLACE_ME video placeholders)
  store.tsx            All client state + localStorage persistence
  ai-context.ts        Converts live progress into Claude system prompt context
  types.ts / utils.ts
```

## Adding videos

Admin Panel → Courses & Lessons → edit a lesson → paste any YouTube URL (watch / share / embed / shorts). Video ID, thumbnail, and embedded player are generated automatically.

## User preferences

- Keep the existing Next.js App Router structure — do not migrate or restructure without being asked.
