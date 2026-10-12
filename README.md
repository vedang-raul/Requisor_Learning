# Requisor Learning

"Alma by Requisor": a learning platform where tutors build courses and learners take them, with an AI assistant for both.

- **Learners**: courses and lessons (video or text), a syllabus per course, quizzes, assignments and submissions, XP, badges and a leaderboard, and an AI assistant that answers from the course material.
- **Tutors**: a course and lesson editor with AI writing help, AI-curated assignments, video recording and AI presenter videos, grading, learner insights, and a Program Builder for employer proposals.

## Stack

Next.js 16 (App Router) · React 18 · TypeScript · Tailwind CSS · PostgreSQL (`pg`) · NextAuth · Jest · Playwright

Outside services, each optional and switched on by its environment variable: xAI Grok (AI text), ElevenLabs (assistant voice), HeyGen (AI presenter videos), YouTube (hosting lesson videos), Auphonic (audio tidy-up), Brevo or Resend (email), Cloudflare Turnstile (sign-up protection).

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill in DATABASE_URL, NEXTAUTH_SECRET and any service keys
npm run db:migrate             # creates or updates the database tables
npm run dev                    # http://localhost:3000
```

`.env.example` lists every variable and what it turns on. Never commit `.env.local`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:migrate` | Apply the database schema (`scripts/migrate.js`, safe to re-run) |
| `npm test` | Unit and route tests (Jest) |
| `npm run test:e2e` | Browser tests (Playwright) |
| `npx tsc --noEmit` | Type-check |
| `node scripts/make-voice-avatars.js` | Redraw the voice portraits in `public/voices/` |

## Project structure

```
app/                    Pages and API routes (Next.js App Router)
  api/                  Server routes: auth, chat, courses, assignments, tts, tutor/*
  app/                  The signed-in app: dashboard, paths, course, learn, my-learning,
                        badges, submissions, settings, tutor, admin
  login/                Sign-in and sign-up screens
  page.tsx              Public landing page

components/             React components, grouped by area
  ui/                   Building blocks: button, card, input, progress, motion, …
  layout/               App shell: sidebar, topbar, mobile nav, providers, design grid
  assistant/            The AI assistant panel, its action cards and avatar
  course/               Course cards, reviews, icons, syllabus
  lesson/               Lesson assignment, quiz, submission, video embed
  tutor/                Program Builder, video recorder and editor, AI video, grading viewer
  onboarding/           Login screen, onboarding guide and survey
  admin/                Admin-only panels
  landing/              The public landing page

lib/                    Logic with no UI, grouped by area
  ai/                   Prompts and generation: assignments, lesson writing, voice, matching
  assistant/            The assistant's tools, actions and personas
  auth/                 Sign-in, CAPTCHA, validation, upload tokens
  courses/              Catalog, import and export, syllabus, transcripts, seed data
  video/                Recording edits, YouTube, teleprompter, AI video
  server/               Database, email, rate limits, request bodies, base URL
  files/                ZIP reading and writing
  store.tsx             Client state shared across pages
  types.ts, utils.ts    Shared types and helpers

hooks/                  React hooks (voice input and output)
types/                  Type declarations for libraries
public/                 Images served as they are (logos, course art, voice portraits)
scripts/                Command-line scripts: database migration, voice portraits, e2e runner
__tests__/              Jest tests
e2e/                    Playwright tests
docs/                   DEPLOY.md, LOAD_TEST.md, THREAT_MODEL.md
```

Configuration files (`package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `jest.config.js`, `playwright.config.ts`, `middleware.ts`, `vercel.json`, `render.yaml`) stay in the project root because the tools that read them look for them there.

Imports use the `@/` alias for the project root, for example `@/lib/courses/course-catalog` or `@/components/ui/button`.

## Deploying

The app runs on Vercel, with the database on Supabase and an optional Render service for large recording uploads. See [docs/DEPLOY.md](docs/DEPLOY.md).
