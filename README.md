# Requisor Learning

"Alma by Requisor": a learning platform where tutors build courses and learners take them, with an AI assistant for both.

- **Learners**: courses and lessons (video or text), a syllabus per course, quizzes, assignments and submissions, XP, badges and a leaderboard, and an AI assistant that answers from the course material.
- **Tutors**: a course and lesson editor with AI writing help, AI-curated assignments, video recording and AI presenter videos, grading, learner insights, and a Program Builder for employer proposals.

## Where everything is

Five folders hold all the work:

| Folder | What is in it |
|---|---|
| `src/` | **The application.** Every page, API route, component and piece of logic. |
| `public/` | Images served as they are: logos, course art, voice portraits. |
| `tests/` | Automated tests: `unit/` (Jest) and `e2e/` (Playwright, in a real browser). |
| `scripts/` | Command-line scripts: database setup, redrawing voice portraits, running the browser tests. |
| `docs/` | Written guides: deploying, load testing, the threat model, and an archive of old pasted assets. |

Inside `src/`:

```
src/
  app/                  Pages and API routes (Next.js App Router)
    api/                Server routes: auth, chat, courses, assignments, tts, tutor/*
    app/                The signed-in app: dashboard, paths, course, learn, my-learning,
                        badges, submissions, settings, tutor, admin
    login/              Sign-in and sign-up screens
    page.tsx            Public landing page
  components/           What you see, grouped by area
    ui/                 Building blocks: button, card, input, progress, motion
    layout/             App shell: sidebar, topbar, mobile nav, providers, design grid
    assistant/          The AI assistant panel, its action cards and avatar
    course/             Course cards, reviews, icons, syllabus
    lesson/             Lesson assignment, quiz, submission, video embed
    tutor/              Program Builder, video recorder and editor, AI video, grading viewer
    onboarding/         Login screen, onboarding guide and survey
    admin/              Admin-only panels
    landing/            The public landing page
  lib/                  Logic with no screen of its own, grouped by area
    ai/                 Prompts and generation: assignments, lesson writing, voice, matching
    assistant/          The assistant's tools, actions and personas
    auth/               Sign-in, CAPTCHA, validation, upload tokens
    courses/            Catalog, import and export, syllabus, transcripts, seed data
    video/              Recording edits, YouTube, teleprompter, AI video
    server/             Database, email, rate limits, request bodies, base URL
    files/              ZIP reading and writing
    store.tsx           Client state shared across pages
    types.ts, utils.ts  Shared types and helpers
  hooks/                React hooks (voice input and output)
  types/                Type declarations for libraries
  middleware.ts         Runs before every request: sign-in checks and security headers
```

Imports use `@/` for `src/`, for example `@/lib/courses/course-catalog` or `@/components/ui/button`.

### The loose files in the project root

None of these is application code. Each is a settings file that one tool insists on finding in the root, which is why they can't be tucked into a folder.

| File | Read by | What it is for |
|---|---|---|
| `package.json`, `package-lock.json` | npm | The project's dependencies, commands and test settings |
| `tsconfig.json`, `tsconfig.check.json` | TypeScript | Type-checking settings |
| `next.config.mjs`, `next-env.d.ts` | Next.js | Framework settings (the second one is generated) |
| `tailwind.config.ts`, `postcss.config.mjs` | Tailwind CSS | Styling settings: colours, fonts, animations |
| `vercel.json`, `render.yaml` | Vercel, Render | How each host builds and runs the app |
| `.env.example`, `.env.local` | The app | The list of settings and keys, and your private copy (never committed) |
| `.gitignore`, `.gitattributes` | git | What git should leave out |
| `.replit`, `replit.nix` | Replit | Only used if the project is run on Replit |
| `AGENTS.md`, `CLAUDE.md` | AI coding tools | Instructions for AI assistants working on this code |

Folders starting with a dot (`.next`, `.claude`, `.agents`, `.vscode`) and `node_modules` are created by tools: build output, editor settings and installed packages.

In VS Code and editors built on it, this project folds the settings files under `package.json` and hides `.next` and `node_modules`, so the file list shows little more than the five folders above (see `.vscode/settings.json`).

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

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:migrate` | Apply the database schema (`scripts/migrate.js`, safe to re-run) |
| `npm test` | Unit and route tests (Jest, `tests/unit/`) |
| `npm run test:e2e` | Browser tests (Playwright, `tests/e2e/`) |
| `npx tsc --noEmit` | Type-check |
| `node scripts/make-voice-avatars.js` | Redraw the voice portraits in `public/voices/` |

## Deploying

The app runs on Vercel, with the database on Supabase and an optional Render service for large recording uploads. See [docs/DEPLOY.md](docs/DEPLOY.md).
