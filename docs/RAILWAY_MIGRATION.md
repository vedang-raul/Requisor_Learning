# Moving off Replit: Railway + Cloudflare + Sentry

**Status: planned, not started.** Waiting for the go-ahead. Nothing here has been changed in the code yet.

## Target setup

| Replit gave us | Replacement | Cost |
|---|---|---|
| Hosting | Railway: the app runs as a normal, always-on Node server (needed for the multi-GB recording upload route and the Postgres pool) | about $5–20/month |
| Database | Railway Postgres in the same project, linked with `DATABASE_URL=${{Postgres.DATABASE_URL}}` (private network, no SSL setting needed) | included |
| SSL, CDN, firewall | Cloudflare in front of `learning.requisor.io` (SSL/TLS mode **Full**, not Flexible) | free |
| Analytics | Cloudflare Web Analytics for visitors, plus the in-app Activity tab for people | free |
| Visitor location | Cloudflare's `cf-ipcountry` header, already read by `src/lib/server/activity.ts` | free |
| Monitoring | Sentry for errors, Better Stack or UptimeRobot for uptime | free tiers |

SEO (Next.js metadata), the security policy (`src/middleware.ts`) and login rate limits are in the code and need no replacement.

## Code changes (step 1)

1. **Proxy headers.** The `clientIp()` function in `src/app/api/auth/[...nextauth]/route.ts` trusts `x-real-ip` / the rightmost `x-forwarded-for` because Replit's proxy sets them. Behind Cloudflare, prefer `cf-connecting-ip`. Apply the same change in `clientIpFrom()` in `src/lib/server/activity.ts` and in the other routes that rate-limit by IP (`forgot`, `signup`, `verify`, `landing-chat`, `public/tutor-ratings`, `google-initiate`).
2. **Cookie comment and logic.** In `src/middleware.ts`, `readSessionToken` keys the cookie name off `NODE_ENV`, with a comment that mentions Replit. The logic stays; update the comment.
3. **Analytics.** `src/lib/analytics.ts` calls the Umami script that Replit injects. Point it at Cloudflare Web Analytics (or self-hosted Umami/Plausible), or make it do nothing.
4. **Base URL.** `src/lib/server/base-url.ts` already prefers `NEXTAUTH_URL`. Add `RAILWAY_PUBLIC_DOMAIN` as a fallback.
5. **Build and start on Railway.**
   - The build is `npm run build`. Its `prebuild` step clears `.next` and downloads the Vosk speech model.
   - Start the app with `npm start`.
   - Run `npm run db:migrate` before each start.
   - Add `railway.json` (or a Nixpacks config) for this.
6. **Sentry.** Add `@sentry/nextjs` with a DSN from an environment variable.
7. **Docs.** Update `docs/DEPLOY.md`, and archive `docs/REPLIT.md`.

## Railway setup (step 2)

1. Create a new project from the GitHub repo (`vedang-raul/Requisor_Learning` or the main repo).
2. Add Postgres to the project. In the app's variables, set `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
3. Copy the other variables from the current deployment, with **the same `NEXTAUTH_SECRET`** so nobody is signed out:
   - `NEXTAUTH_SECRET`
   - `XAI_API_KEY`
   - ElevenLabs keys
   - Google OAuth client id and secret
   - Turnstile keys
   - email (SMTP) settings
   - `RECORDING_UPLOAD_URL`
   - the remaining AI and video keys
4. Deploy, then test everything on the `*.up.railway.app` address:
   - sign-in (password and Google)
   - signup emails
   - the assistant
   - voice
   - uploads
   - the Activity tab

## Data (step 3)

- Dump the current database: `pg_dump --no-owner --no-acl "$OLD_DATABASE_URL" > requisor.sql`.
- Restore it into Railway Postgres: `psql "$RAILWAY_PUBLIC_DATABASE_URL" < requisor.sql`.
- Run `npm run db:migrate`.
- Check row counts for `users`, `courses`, `course_lessons` and `assignment_submissions`.

## Domain cutover (step 4)

1. A day ahead, lower the DNS TTL of `learning.requisor.io` to 5 minutes.
2. In Railway, open Settings → Networking → Custom Domain and add `learning.requisor.io`. Railway shows the CNAME, and sometimes a TXT record.
3. At the DNS provider, replace the `learning` record (currently pointing at Replit) with Railway's CNAME. The root `requisor.io` and its email (MX) records are not affected.
4. Set `NEXTAUTH_URL=https://learning.requisor.io` on Railway.
5. In the Google Cloud Console OAuth client:
   - add the JavaScript origin `https://learning.requisor.io`;
   - add the redirect URI `https://learning.requisor.io/api/auth/callback/google`.
6. In the Turnstile widget, add `learning.requisor.io` to the allowed hostnames.
7. Take a final data sync if anything changed since the dump, then switch DNS.
8. Keep Replit running for a day or two, then shut it down.

## Why not Render or Vercel

- **Render** also works. The earlier connection problems were most likely the internal vs. external connection string. The external one needs `DATABASE_SSL=require` in this app. Railway's linked variables avoid that.
- **Vercel** runs the app as serverless functions with small request-body limits, which doesn't fit the large video-upload route or a long-lived database pool.
