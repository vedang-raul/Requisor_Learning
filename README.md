# Requisor_Learning
A Platform for Training new joinee's at Citrus Innovations

# Requisor Learning

Internal employee learning platform for Requisor — a premium, dark-mode LMS where new interns and employees learn Product Management, Data Analytics, Agentic AI and Cyber Security through curated YouTube-based learning paths.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Framer Motion · Lucide Icons · Anthropic SDK (AI assistant)

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start   # production server — needs Node hosting (e.g. Vercel), not a static host
```

Login is dummy auth — any email + password works.

### AI assistant setup

The floating "Requisor Assistant" chat widget (bottom-right of every `/app/*` page) is powered by Claude via `app/api/chat/route.ts`. To enable it:

```bash
cp .env.example .env.local
# then set ANTHROPIC_API_KEY=sk-ant-... in .env.local
```

Without a key set, the widget still opens and chats, but replies with a message asking an admin to configure it — the rest of the app is unaffected. The assistant reads live progress (courses, completion %, streak, XP, recent activity) from `lib/ai-context.ts` and sends it as context on every turn; it never sees the API key, which stays server-side only.

Note: this app previously used `output: 'export'` for a fully static build. That's been removed because the chat route needs a server — deploy to Vercel or any Node host instead of a static bucket.

## How it works

- **Content** is seeded in `lib/data.ts` (4 learning paths, 58 lessons). Every lesson ships with a `REPLACE_ME` video placeholder.
- **Adding videos**: Admin Panel → Courses & Lessons → edit a lesson → paste any YouTube URL (watch / share / embed / shorts). Video ID, thumbnail and embedded player are generated automatically.
- **State** (auth, progress, watch %, notes, bookmarks, XP, streaks, admin edits) persists in `localStorage` via `lib/store.tsx`. Swap `StoreProvider` internals for a real API/DB later — every page consumes the same `useStore()` interface.
- **Routing** uses query params (`/app/course/?slug=…`, `/app/learn/?course=…&lesson=…`) so admin-created content works in a fully static deployment.

## Structure

```
app/                 Pages (login, /app/* shell: dashboard, paths, course, learn, my-learning, badges, admin, settings)
app/api/chat/        Server route that streams Claude responses for the AI assistant
components/          Sidebar, topbar (global search, notifications), course cards, player, confetti, AI assistant, UI kit
lib/                 types.ts · data.ts (seed content) · store.tsx (state + persistence) · ai-context.ts (progress → prompt) · utils.ts
```

## Features

Dashboard (stats, progress ring, continue watching, announcements), 4 learning paths, course player (YouTube embed, contents sidebar, notes, resources, assignments, discussion, mark-complete + confetti), global search (Ctrl+K or /), filters, My Learning, badges + XP + streaks + leaderboard, full admin panel (course/lesson CRUD via YouTube URL, user assignment, analytics, CSV export), AI learning assistant (Claude-powered chat that knows your progress and recommends what's next), responsive, keyboard shortcuts, accessible focus states.
