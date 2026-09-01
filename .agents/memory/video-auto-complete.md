---
name: Video auto-complete
description: How YouTube video completion detection works in VideoEmbed.
---

## Approach
Switched from a plain `<iframe>` to the **YouTube IFrame API** (`window.YT.Player`) so the `onStateChange` event fires. `YT.PlayerState.ENDED === 0` triggers the `onEnded` prop.

## Key implementation details
- `onEnded` is kept in a `useRef` (`onEndedRef`) — the player `useEffect` only re-runs when `youtubeId` or `format` changes, not when the callback identity changes. This prevents destroying/recreating the player on every parent re-render.
- A module-level `_ytQueue` array handles multiple components waiting for the API script to load (avoids duplicate script tags and lost callbacks).
- The IFrame API script is loaded once via `<script src="https://www.youtube.com/iframe_api">` appended to `document.head`.
- Every creator surface and the server boundary must canonicalize supported YouTube URLs to the 11-character video ID. Catalog reads also normalize legacy URL-shaped values, and the player must expose an external YouTube fallback instead of leaving a blank embed.

**Why:** Plain iframes can't detect video end events. The IFrame API sends `postMessage` events that `YT.Player` translates into JS callbacks. Storing a pasted full URL as `youtubeId` produces a blank player, while valid videos may still be private or have embedding disabled.

**How to apply:** Reuse the shared YouTube parser for tutor/admin inputs and server validation; never store raw creator URL text in the video-ID column. Keep loading, error, and external-open states visible in the learner player.

## Auto-advance flow (learn/page.tsx)
1. `onVideoEnded` marks lesson complete (if not already) + syncs to DB via `/api/completions`.
2. Sets `autoAdvance = 5` (seconds countdown).
3. A `useEffect` ticks the countdown down each second.
4. At 0, `router.push` navigates to the next lesson URL.
5. "Stay" button sets `autoAdvance = null` to cancel.
6. Countdown resets to `null` on lesson change (`lessonId` dep).
