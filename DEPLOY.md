# Deploying: Render (app) + Supabase (database)

The app is one Next.js server: pages and API routes run in the same Node
process. Render runs that process; Supabase is only the Postgres database.
Uploaded files (submissions, lesson resources) are stored in the database, so
the app needs no disk of its own.

## 1. Supabase

1. Create a project and note the database password.
2. Open **Connect** and copy the **Session pooler** connection string
   (host ends in `pooler.supabase.com`, port `5432`). Put the password into it.
   - Use the pooler, not the "Direct connection": the direct host is IPv6-only
     and Render cannot reach it.
   - Use *Session* mode, not *Transaction* mode (port `6543`).

You do not need to create any tables. The first deploy does it.

## 2. Email (Brevo or Resend)

Sign-up verification, password reset and notification emails go through
[Brevo](https://www.brevo.com) or [Resend](https://resend.com) outside Replit.
Set one of them:

- **Brevo:** create an API key (SMTP & API → API keys) and set `BREVO_API_KEY`.
- **Resend:** create an API key and set `RESEND_API_KEY`.

`EMAIL_FROM` must be a sender that service has verified, for example
`Requisor Learning <support@your-domain.com>`.

Without an email key, sign-up in production fails at the "send verification
email" step.

## 3. Render

1. **New → Blueprint**, pick this repository. Render reads `render.yaml`.
2. Fill in the values it asks for:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the Supabase Session pooler string |
   | `XAI_API_KEY` | your xAI key |
   | `BREVO_API_KEY` | your Brevo key (or `RESEND_API_KEY` for Resend) |
   | `EMAIL_FROM` | e.g. `Requisor Learning <support@your-domain.com>` |
   | `AUPHONIC_API_KEY` | optional; without it auto-edit runs in demo mode |

   `NEXTAUTH_SECRET` is generated for you, and `DATABASE_SSL=require` and
   `PG_POOL_MAX=10` are preset. Other optional settings are listed in
   `.env.example`.
3. Deploy. The build runs `npm run db:migrate`, which creates or updates every
   table, then builds the app. The migration is safe to run on every deploy.

The site address is detected from Render automatically. If you add a custom
domain, set `NEXTAUTH_URL` to it (for example `https://learning.example.com`).

## 4. After the first deploy

- **Admin account:** sign up with `support@requisor.io`; that address is the
  admin. Everyone else starts as a learner, and tutors sign up from the tutor
  login page.
- **Google sign-in (optional):** set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  and add `https://<your-site>/api/auth/callback/google` as an authorised
  redirect URI in Google Cloud.
- **Courses:** the four built-in courses are added the first time the app
  reads the catalogue.

## Vercel for the site, Render for recording uploads

The site can run on Vercel instead (import the repository there; `vercel.json`
runs the migration before the build). Set the same variables as in the table
above, with `DATABASE_SSL=require` and `PG_POOL_MAX=3`.

Vercel accepts request bodies of about 4.5 MB at most, so it cannot receive a
lesson recording for the optional "Tidy it up" step. For that step only, the
browser uploads to a second copy of this app on Render:

1. Deploy the repository to Render as above (the free plan works; it sleeps
   when idle, so the first upload after a quiet spell waits for it to wake).
   Give it **the same** `DATABASE_URL`, `NEXTAUTH_SECRET` and
   `AUPHONIC_API_KEY` as the Vercel project.
2. In Vercel, set `AUPHONIC_API_KEY` and
   `RECORDING_UPLOAD_URL=https://<your-render-service>.onrender.com`, then redeploy.

The Render copy never serves pages to users; it only receives those uploads,
authorised by a short-lived signed token (`lib/upload-token.ts`). Without
`RECORDING_UPLOAD_URL`, the Vercel site simply doesn't offer "Tidy it up".

## Things to know

- **One instance.** Rate limits and the AI request queue are kept in memory,
  so run a single instance. Scaling out would need them moved to a shared store.
- **Free plan sleep.** Render's free plan stops the service when idle; the next
  visitor waits while it starts. Switch `plan` in `render.yaml` if that matters.
- **Large recordings.** Auto-edit uploads stream through the app to Auphonic.
  Node allows 5 minutes per request by default, so a very large file on a slow
  connection can be cut off.
- **Running the migration by hand:** `npm run db:migrate` with `DATABASE_URL`
  (and `DATABASE_SSL=require` for Supabase) set. Locally it reads `.env.local`.
