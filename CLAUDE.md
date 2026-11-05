# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

"Alma 41 by Requisor": a learning platform where tutors build courses and learners take them, with a role-aware AI assistant for both. Universities are tenants: users, courses, themes and layouts belong to a university. Next.js 16 App Router, React 18, TypeScript, Tailwind v3, Postgres via `pg` (no ORM), NextAuth (JWT sessions), Jest and Playwright. AI text comes from xAI Grok (`XAI_API_KEY`); ElevenLabs, HeyGen, YouTube, Auphonic, Brevo/Resend and Turnstile are optional, each switched on by its env var (see `.env.example`).

## Commands

```bash
npm run dev                          # http://localhost:3000
npm run build                        # prebuild wipes .next and fetches the Vosk model
npx tsc --noEmit -p .                # type-check
npm test                             # all Jest tests (tests/unit/**/*.test.ts, runInBand)
npx jest tests/unit/university-theme.test.ts   # one file
npx jest -t "accepts only whole themes"        # one test by name
npm run test:e2e                     # Playwright (tests/e2e), installs Chromium first
```

Jest runs in a `node` environment with ts-jest and maps `@/` to `src/`. Tests are unit and route tests: route handlers are imported and called directly, with `@/lib/server/db` and other server modules mocked via `jest.mock`. There are no React component tests.

`npm run db:migrate` (`scripts/migrate.js`) applies the schema and is safe to re-run. Do not run it against a database you weren't asked to change: the app also creates its feature tables at startup (see below), so local work rarely needs it.

## Architecture

**Routing.** `src/app/page.tsx` is the public landing page and `src/app/login/` is sign-in. Everything signed-in lives under `src/app/app/*` (dashboard, paths, course, learn, my-learning, badges, submissions, settings, tutor, admin). `src/app/app/layout.tsx` is a **server** layout: it reads the member's university theme and layout and injects them as CSS variables and context. It renders `app-shell.tsx`, the client shell with sidebar, topbar and providers. Server routes are under `src/app/api/*`.

**Auth and access.**
- `src/lib/auth/auth.ts` holds `authOptions`. The session carries `role` (`employee` | `tutor` | `admin`), `superAdmin` and `universityId`.
- In development only, credentials providers `dev-admin` (super admin), `dev-tutor`, `dev-student` and `dev-uni-admin` sign in without a password: POST to `/api/auth/callback/<id>` with a `csrfToken`.
- `src/middleware.ts` runs on every request for sign-in checks, the pending-approval gate and security headers. The session cookie name is derived from `NODE_ENV` and must match `authOptions`.
- In API routes, use `requireAccess("signed-in" | "tutor" | "admin" | "super")` from `src/lib/server/access.ts`. It returns either the access or a `Response` to return. Enforce permissions on the server, never only in the UI.

**Database.**
- `src/lib/server/db.ts` exports a shared `db` Pool (a global singleton across hot reloads); queries are raw SQL.
- `ensureCourseCatalog()` in `src/lib/courses/course-catalog.ts` creates tables on first use, including the SQL strings in `src/lib/server/feature-tables.ts`.
- New tables and columns should be additive and added both there and in `scripts/migrate.js`.
- Per-entity extras are stored as JSONB columns (for example `universities.theme`, `course_lessons.assignment_brand`), each with a `read…()` function that validates and cleans untrusted input before saving and after loading.

**Client state.** `src/lib/store.tsx` is a single React context store for the user, the course catalog, progress, XP and the sidebar. The catalog starts empty, with `catalogLoaded`, and is fetched alongside the session check. Pages should show placeholders until it loads, not built-in seed courses.

**AI assistant.**
- `src/app/api/chat/route.ts` streams replies and runs a tool loop.
- `toolsForRole` and `runAssistantTool` in `src/lib/assistant/assistant-tools.ts` decide which tools a role gets.
- Tools that change data don't act directly. They emit *action proposals* into the text stream, framed by `ACTION_FRAME` (`\u001e`, see `src/lib/assistant/assistant-actions.ts`). The client renders them as cards (`components/assistant/assistant-action-card.tsx`), and the user must confirm each one.
- The assistant has workspaces, such as `program_builder`, with stage gates in `src/lib/courses/program-builder.ts`.
- Shared quotas and concurrency limits for AI calls live in `src/lib/server/shared-ai-controls.ts` and `src/lib/ai/usage.ts`.

**University theming.**
- `src/lib/theme/university-theme.ts` covers colours, font, presets, readability fixes and AI suggestions; `src/lib/theme/university-layout.ts` covers sidebar side and style, menu order, names and hidden items, and top bar contents. Both are stored in `universities.theme`.
- The theme is applied as `--brand-*` RGB-triplet CSS variables. Tailwind colours read them as `rgb(var(--brand-primary, …) / <alpha-value>)`, so use the `primary` and `sidebar` Tailwind colours rather than hard-coded brand hex.
- Themes apply to members only, never to super admins or public pages.
- Menu entries are keyed by href through `NAV_ENTRIES`; `arrangeNav()` orders and renames the menu for the sidebar and the mobile nav.

**Courses.** Course content is tutor-owned and revisioned (`src/lib/courses/`). Learner payloads are trimmed server-side: for example, an assignment brief behind an unsigned NDA is removed from `/api/courses` by `lessonForLearner`.

## Security checkpoint

Before the user commits to GitHub or asks for a Replit deployment prompt, remind them to run the `security-reviewer` agent first. Do not generate a Replit deployment prompt until the security reviewer has been run and returned no BLOCKERs.

## Version control and Replit

- **Remotes.** `personal` is `vedang-raul/Requisor_Learning`, where our work goes: `git push personal HEAD:main`. `origin` is `Soham0507/Requisor_Learning`, a coworker's repo; never push there. Local work happens on branch `tutor-workspace-grader-autoedit`.
- **Commits.** Commit only when the user asks. Keep unrelated or unknown-origin changes in their own commit so each can be reverted alone, and never commit `.claude/launch.json` (it's local preview setup).
- **Live site = Replit.** Replit pulls from `vedang-raul/Requisor_Learning` (its remote is named `Requisor-Learning`) and publishes from there. Replit cannot push to GitHub, because its account (Soham0507) has no write access, so work done directly on Replit never reaches GitHub. Its git commands only run with `DANGEROUSLY_ALLOW_GIT=1`.
- **Pull hook.** Replit's post-merge hook (`scripts/post-merge.sh`) runs `npm install --ignore-scripts` and `node scripts/migrate.js` after every pull, so schema changes must be additive and safe to re-run.
- **History to know.**
  - On 2026-11-02 the Replit copy was reset to merge `7931934`, to match the local version.
  - A coworker's later Replit-only work (security fixes, analytics) was saved on branch `backup-before-restore-20261102-1738` on Replit. Some of the analytics `trackEvent` calls were later carried over (`44a7049`).
  - Don't overwrite or discard that branch.
- **Prompts for Replit's agent must be strict.** Give exact commands only, and say plainly that it must not:
  - edit files
  - install, upgrade or remove packages (never `@dieub/braces-depth-guard`)
  - run database commands or `npm run db:migrate` by hand, beyond approving the schema changes it is asked to approve
  - force push, reset over someone else's work, or "fix" anything on its own

  Tell it to stop and report the full output at the first error. Typical flow: fetch, merge or fast-forward to the named commit on `Requisor-Learning/main`, run the build, then publish.

## Conventions

- Imports use `@/` for `src/`.
- Many source files are CRLF. Preserve line endings when doing exact-string edits.
- Record user-visible changes in `CHANGELOG.md` under `## [Unreleased]` (Added / Changed / Fixed), in plain language, and note any database change. Releases follow `docs/RELEASING.md`: the version in `package.json`, the CHANGELOG heading and the git tag must agree.
- `.agents/memory/` holds design decisions and trust boundaries from earlier work (auth, assistant approvals, analytics privacy, test isolation and others). Read the relevant note before changing those areas.
- `docs/REPLIT.md` is outdated (it describes an earlier localStorage version); hosting is described in `docs/DEPLOY.md` (Render + Supabase), security assumptions in `docs/THREAT_MODEL.md`. Live production currently runs on Replit.
- Never commit `.env.local`, `public/vosk/` or `generated-artifacts/`.
- **Plan mode:** At the start of every plan mode session, ask the user for a short name before writing the plan file. Save it as `C:\Users\vedan\.claude\plans\<name>.md` so it survives `/clear` and can be referenced by name in future sessions.
