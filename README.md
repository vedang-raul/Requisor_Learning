# Requisor_Learning
A Platform for Training new joinee's at Citrus Innovations

# Requisor Learning

Internal employee learning platform for Requisor — a premium, dark-mode LMS where new interns and employees learn Product Management, Data Analytics, Agentic AI and Cyber Security through curated YouTube-based learning paths.

## Stack

Next.js 14 (App Router, static export) · TypeScript · Tailwind CSS · Framer Motion · Lucide Icons

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static export to ./out — deploy anywhere (Vercel, Netlify, S3, internal)
```

Login is dummy auth — any email + password works.

## How it works

- **Content** is seeded in `lib/data.ts` (4 learning paths, 58 lessons). Every lesson ships with a `REPLACE_ME` video placeholder.
- **Adding videos**: Admin Panel → Courses & Lessons → edit a lesson → paste any YouTube URL (watch / share / embed / shorts). Video ID, thumbnail and embedded player are generated automatically.
- **State** (auth, progress, watch %, notes, bookmarks, XP, streaks, admin edits) persists in `localStorage` via `lib/store.tsx`. Swap `StoreProvider` internals for a real API/DB later — every page consumes the same `useStore()` interface.
- **Routing** uses query params (`/app/course/?slug=…`, `/app/learn/?course=…&lesson=…`) so admin-created content works in a fully static deployment.

## Structure

```
app/                 Pages (login, /app/* shell: dashboard, paths, course, learn, my-learning, badges, admin, settings)
components/          Sidebar, topbar (global search, notifications), course cards, player, confetti, UI kit
lib/                 types.ts · data.ts (seed content) · store.tsx (state + persistence) · utils.ts
```

## Features

Dashboard (stats, progress ring, continue watching, announcements), 4 learning paths, course player (YouTube embed, contents sidebar, notes, resources, assignments, discussion, mark-complete + confetti), global search (Ctrl+K or /), filters, My Learning, badges + XP + streaks + leaderboard, full admin panel (course/lesson CRUD via YouTube URL, user assignment, analytics, CSV export), responsive, keyboard shortcuts, accessible focus states.
