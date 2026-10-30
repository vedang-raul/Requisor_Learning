#!/usr/bin/env node
/**
 * Creates or updates the database schema. Safe to run again and again: every
 * statement is "IF NOT EXISTS" (or otherwise repeatable), so it works on an
 * empty database (first deploy) and on one that is already up to date.
 *
 *   npm run db:migrate          (needs DATABASE_URL; see .env.example)
 */
const fs = require('fs');
const path = require('path');
const {Pool}=require('pg');

// Outside a host that injects env vars (local runs), read .env.local.
if (!process.env.DATABASE_URL) {
  const envFile = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
    }
  }
}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1); }

// Same SSL rule as src/lib/server/db.ts: DATABASE_SSL=require for hosted Postgres (Supabase).
const sslMode = (process.env.DATABASE_SSL || '').toLowerCase();
const ssl = sslMode && sslMode !== 'off' && sslMode !== 'false'
  ? (process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, '\n'), rejectUnauthorized: true } : { rejectUnauthorized: false })
  : undefined;
const connectionString = ssl ? process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]*&?/i, '$1').replace(/[?&]$/, '') : process.env.DATABASE_URL;
const p=new Pool({connectionString, ...(ssl ? { ssl } : {})});
p.query(`
  -- Accounts. Everything below hangs off this table. (On Replit it predates
  -- this script, which is why the next statement only adds columns to it.)
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    password_hash TEXT,
    google_id TEXT,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    role VARCHAR(20) NOT NULL DEFAULT 'employee',
    verification_token TEXT,
    verification_expires TIMESTAMP,
    reset_token TEXT,
    reset_expires TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique ON users (google_id) WHERE google_id IS NOT NULL;

  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS employment_type TEXT,
    ADD COLUMN IF NOT EXISTS position VARCHAR(100),
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS reset_requested_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS streak_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS streak_last_day DATE,
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
    ADD COLUMN IF NOT EXISTS qualification TEXT,
    ADD COLUMN IF NOT EXISTS learning_goal TEXT,
    ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{"courses":true,"assignments":true,"badges":true,"announcements":true}',
    ADD COLUMN IF NOT EXISTS assistant_persona VARCHAR(20),
    ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10),
    ADD COLUMN IF NOT EXISTS preferred_country VARCHAR(60),
    -- Accessibility switches chosen during onboarding (src/lib/accessibility/preferences.ts).
    ADD COLUMN IF NOT EXISTS accessibility JSONB NOT NULL DEFAULT '{}';

  -- employment_type started as VARCHAR(20) for the employee flow's short
  -- enum values ("job"/"intern"), but the tutor onboarding survey also
  -- writes a free-text "how much teaching experience do you have" answer
  -- into this same column — routinely well over 20 characters, which made
  -- every such save fail silently against the old constraint. Widening is
  -- always safe (no data loss, existing short values are untouched) and
  -- safe to re-run.
  ALTER TABLE users ALTER COLUMN employment_type TYPE TEXT;

  -- Shared AI request quotas survive worker restarts and autoscaling.
  CREATE TABLE IF NOT EXISTS ai_rate_limits (
    scope TEXT NOT NULL,
    account_key TEXT NOT NULL,
    count INTEGER NOT NULL CHECK (count > 0),
    reset_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (scope, account_key)
  );
  CREATE INDEX IF NOT EXISTS ai_rate_limits_reset_at_idx ON ai_rate_limits (reset_at);


  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM users
      WHERE google_id IS NOT NULL
      GROUP BY google_id
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'Cannot enforce unique Google identity bindings: duplicate Google subjects need manual resolution.';
    END IF;
  END
  $$;

  CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique
    ON users (google_id)
    WHERE google_id IS NOT NULL;

  -- Unique index on email (mirrors the table-level UNIQUE constraint; idempotent here
  -- so that bare schema restores also have the index guaranteed).
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_key
    ON users (email);

  -- Composite index for leaderboard window function:
  -- Covers the WHERE role = 'employee' filter + ORDER BY xp DESC, last_login_at DESC NULLS LAST
  -- so the planner can use an index scan instead of a sequential scan + sort at scale.
  CREATE INDEX IF NOT EXISTS users_leaderboard_idx
    ON users (role, xp DESC, last_login_at DESC NULLS LAST);

  -- Index for the admin analytics active-users query:
  -- WHERE email_verified = TRUE AND last_login_at > NOW() - INTERVAL 7 days
  -- Allows an index scan instead of a full-table scan on every admin page load.
  CREATE INDEX IF NOT EXISTS users_analytics_active_idx
    ON users (email_verified, last_login_at);

  CREATE TABLE IF NOT EXISTS lesson_completions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    course_slug TEXT NOT NULL,
    completed_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, lesson_id)
  );

  -- DB-backed catalog. Seed rows are intentionally inserted by the
  -- application with ON CONFLICT DO NOTHING, preserving later editor changes.
  CREATE TABLE IF NOT EXISTS courses (
    slug VARCHAR(80) PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    tagline VARCHAR(400) NOT NULL,
    category TEXT NOT NULL,
    level VARCHAR(20) NOT NULL CHECK (level IN ('Beginner','Intermediate','Advanced')),
    tags JSONB NOT NULL DEFAULT '[]',
    cover VARCHAR(200) NOT NULL,
    added_at DATE NOT NULL,
    base_assessment TEXT,
    owner_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  ALTER TABLE courses ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1;
  -- DEFAULT TRUE so every course that already exists stays visible; only
  -- newly-created courses (app code now sends published:false explicitly)
  -- start as drafts.
  ALTER TABLE courses ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT TRUE;

  -- Category used to be a closed 4-value enum (CHECK + VARCHAR(20)); a
  -- tutor/admin can now add their own category from the course editor, so
  -- both the length limit and the fixed value list have to go. The CHECK
  -- constraint's name isn't tracked anywhere in this app, so it's found and
  -- dropped dynamically rather than assumed (e.g. as courses_category_check)
  -- — installs from different Postgres versions/history can end up with a
  -- differently-named constraint on the same column.
  DO $$
  DECLARE
    con RECORD;
  BEGIN
    FOR con IN
      SELECT pgc.conname
      FROM pg_constraint pgc
      JOIN pg_class rel ON rel.oid = pgc.conrelid
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(pgc.conkey)
      WHERE rel.relname = 'courses' AND pgc.contype = 'c' AND att.attname = 'category'
    LOOP
      EXECUTE format('ALTER TABLE courses DROP CONSTRAINT %I', con.conname);
    END LOOP;
  END
  $$;
  ALTER TABLE courses ALTER COLUMN category TYPE TEXT;

  -- The course syllabus: a filled-in template or a reference to an uploaded
  -- Word/PDF file (src/lib/courses/syllabus.ts).
  ALTER TABLE courses ADD COLUMN IF NOT EXISTS syllabus JSONB;

  CREATE TABLE IF NOT EXISTS course_catalog_metadata (
    key VARCHAR(80) PRIMARY KEY,
    seeded_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  -- Courses precede reviews so fresh installs have referential integrity from
  -- the start. Existing installations receive this FK after the app's
  -- non-destructive seed reconciliation (see ensureCourseCatalog).
  CREATE TABLE IF NOT EXISTS course_reviews (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    course_slug VARCHAR(80) NOT NULL REFERENCES courses(slug) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, course_slug)
  );
  -- Existing installations used TEXT here. Drop only values that cannot fit
  -- the catalog key, then make the type compatible with courses.slug. The app
  -- preserves valid reviews and installs the FK after one-time seed import.
  DELETE FROM course_reviews WHERE length(course_slug) > 80;
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'course_reviews'
        AND column_name = 'course_slug'
        AND (data_type <> 'character varying' OR character_maximum_length IS DISTINCT FROM 80)
    ) THEN
      ALTER TABLE course_reviews
        ALTER COLUMN course_slug TYPE VARCHAR(80) USING course_slug::VARCHAR(80);
    END IF;
  END $$;

  CREATE TABLE IF NOT EXISTS course_lessons (
    id VARCHAR(120) PRIMARY KEY,
    course_slug VARCHAR(80) NOT NULL REFERENCES courses(slug) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description VARCHAR(2000) NOT NULL,
    youtube_id VARCHAR(120) NOT NULL,
    duration_min INT NOT NULL CHECK (duration_min BETWEEN 1 AND 1440),
    resources JSONB NOT NULL DEFAULT '[]',
    key_takeaways JSONB NOT NULL DEFAULT '[]',
    assignment TEXT,
    section VARCHAR(200),
    format VARCHAR(20) NOT NULL DEFAULT 'video' CHECK (format IN ('video','reading','code-tutorial')),
    position INT NOT NULL DEFAULT 0,
    requires_submission BOOLEAN NOT NULL DEFAULT FALSE,
    assignment_marks INT CHECK (assignment_marks BETWEEN 1 AND 10000),
    assignment_due_date DATE,
    body TEXT,
    body_file_url VARCHAR(200)
  );
  -- Existing installs created course_lessons before this column existed.
  ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS requires_submission BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS body TEXT;
  ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS body_file_url VARCHAR(200);
  -- A lesson thumbnail the tutor uploaded (a resource file URL); NULL uses the YouTube video's.
  ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(200);
  -- A course's modules in order: [{ title, description }]. Lessons join one by its title (course_lessons.section).
  ALTER TABLE courses ADD COLUMN IF NOT EXISTS modules JSONB;
  ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS assignment_marks INT;
  ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS assignment_due_date DATE;
  -- AI-curated assignment: the tutor's guardrails and which learner data may be used. NULL = off.
  ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS assignment_ai JSONB;
  -- Per-lesson drafts: a tutor can keep an unfinished lesson hidden inside a
  -- live course. DEFAULT TRUE keeps every existing lesson visible.
  ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT TRUE;
  -- Scheduled launch: a published lesson stays hidden from learners until this
  -- moment. Checked whenever lessons are read, so no background job is needed.
  ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ;

  -- OpusClip was removed in favour of auto-editing (below); drop its job table.
  DROP TABLE IF EXISTS video_clip_jobs;

  -- Auto-edit jobs: a tutor drops a long recording into a lesson and gets it
  -- back cleaned up (subtitles, silences cut, audio evened out). result holds
  -- the outcome (durations, cut stats, transcript, subtitles, output location);
  -- provider is 'demo' for simulated jobs. youtube_video_id is set if the
  -- edited video was posted to YouTube for the tutor (optional delivery mode).
  CREATE TABLE IF NOT EXISTS video_edit_jobs (
    id SERIAL PRIMARY KEY,
    owner_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_slug VARCHAR(80) REFERENCES courses(slug) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    file_name VARCHAR(200) NOT NULL,
    source_seconds INT,
    storage_key TEXT,
    provider VARCHAR(20) NOT NULL DEFAULT 'demo',
    provider_job_id TEXT,
    status VARCHAR(12) NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
    result JSONB,
    youtube_video_id VARCHAR(20),
    error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS video_edit_jobs_owner_idx ON video_edit_jobs (owner_user_id, created_at DESC);

  -- A tutor's connected YouTube channel, for posting edited videos on their
  -- behalf. The refresh token is stored AES-256-GCM encrypted (src/lib/video/youtube.ts),
  -- never in plain text.
  CREATE TABLE IF NOT EXISTS youtube_connections (
    user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    channel_id TEXT,
    channel_title TEXT,
    refresh_token_enc TEXT NOT NULL,
    connected_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  -- What is said in a lesson's video, for the learner's assistant. Keyed by
  -- lesson id with no foreign key: saving a course rewrites its lesson rows.
  -- AI-generated presenter videos (src/lib/video/ai-video.ts): one row per render a tutor started.
  -- A thumbs up or down on one of the assistant's replies, with the reply and the question it answered.
  CREATE TABLE IF NOT EXISTS assistant_feedback (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feedback_id TEXT NOT NULL,
    rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
    question TEXT NOT NULL DEFAULT '',
    reply TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'learner',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, feedback_id)
  );
  CREATE INDEX IF NOT EXISTS assistant_feedback_rating_idx ON assistant_feedback (rating, created_at DESC);
  CREATE INDEX IF NOT EXISTS assistant_feedback_user_idx ON assistant_feedback (user_id, mode, updated_at DESC);
  -- Use of the paid AI services, per person: tokens for language models, units for voice and video.
  CREATE TABLE IF NOT EXISTS ai_usage (
    id BIGSERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    units INT NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS ai_usage_user_idx ON ai_usage (user_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS ai_video_jobs (
    id SERIAL PRIMARY KEY,
    owner_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'heygen',
    provider_video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    script TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    video_url TEXT,
    thumbnail_url TEXT,
    duration_sec INT,
    error TEXT,
    youtube_video_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS ai_video_jobs_owner_idx ON ai_video_jobs (owner_user_id, id DESC);
  CREATE TABLE IF NOT EXISTS lesson_transcripts (
    lesson_id TEXT PRIMARY KEY,
    transcript TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    updated_by INT,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS courses_owner_idx ON courses (owner_user_id, added_at DESC);
  CREATE INDEX IF NOT EXISTS course_lessons_course_position_idx ON course_lessons (course_slug, position, id);
  CREATE INDEX IF NOT EXISTS course_reviews_slug_rating_idx ON course_reviews (course_slug, rating);

  -- Tutor-uploaded learning resources. Files have no public capability URL:
  -- the download route authorizes the current user against published course
  -- references, course ownership, or the admin role.
  CREATE TABLE IF NOT EXISTS resource_files (
    id CHAR(32) PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
    owner_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(200) NOT NULL,
    mime_type VARCHAR(150) NOT NULL,
    size_bytes INT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    data BYTEA NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS resource_files_owner_idx ON resource_files (owner_user_id, created_at DESC);

  -- Privacy-safe learning activity used for aggregate tutor insights.
  -- These tables come after the catalog tables they reference so fresh
  -- database setup preserves foreign-key ordering.
  CREATE TABLE IF NOT EXISTS course_enrollments (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_slug VARCHAR(80) NOT NULL REFERENCES courses(slug) ON DELETE CASCADE,
    enrolled_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, course_slug)
  );

  CREATE TABLE IF NOT EXISTS lesson_views (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_slug VARCHAR(80) NOT NULL REFERENCES courses(slug) ON DELETE CASCADE,
    -- Deliberately not an FK: course saves replace lesson rows in one
    -- transaction, while stable lesson IDs must retain their view history.
    lesson_id VARCHAR(120) NOT NULL,
    first_viewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_viewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, lesson_id)
  );
  ALTER TABLE lesson_views
    DROP CONSTRAINT IF EXISTS lesson_views_lesson_id_fkey;

  CREATE INDEX IF NOT EXISTS course_enrollments_course_date_idx
    ON course_enrollments (course_slug, enrolled_at);
  CREATE INDEX IF NOT EXISTS lesson_views_course_dates_idx
    ON lesson_views (course_slug, first_viewed_at, last_viewed_at);

  CREATE TABLE IF NOT EXISTS lesson_comments (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS capstone_completions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    course_slug TEXT NOT NULL,
    completed_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, course_slug)
  );

  CREATE TABLE IF NOT EXISTS bug_reports (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    media_data TEXT,
    media_type TEXT,
    occurred_at TIMESTAMP NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    admin_note TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS bug_reports_user_created_idx ON bug_reports (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS bug_reports_email_created_idx ON bug_reports (user_email, created_at DESC, id DESC);

  DO $$ BEGIN
    -- Databases created before code tutorials have format VARCHAR(10) limited
    -- to 'video'/'reading'; 'code-tutorial' (the Python/JS/Java seed lessons)
    -- would fail every catalog load. Widen and extend them once, keeping data.
    IF (SELECT character_maximum_length FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'course_lessons' AND column_name = 'format') < 20 THEN
      ALTER TABLE course_lessons ALTER COLUMN format TYPE VARCHAR(20);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'course_lessons_format_check'
                 AND conrelid = 'course_lessons'::regclass
                 AND pg_get_constraintdef(oid) NOT LIKE '%code-tutorial%') THEN
      ALTER TABLE course_lessons DROP CONSTRAINT course_lessons_format_check;
      ALTER TABLE course_lessons ADD CONSTRAINT course_lessons_format_check
        CHECK (format IN ('video','reading','code-tutorial'));
    END IF;
  END $$;

  -- Keep these checks validated: Publish introspects the development schema.
  -- Existing unvalidated checks are validated without changing or deleting rows.
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bug_reports_payload_bounds' AND conrelid = 'bug_reports'::regclass) THEN
      ALTER TABLE bug_reports ADD CONSTRAINT bug_reports_payload_bounds
        CHECK (char_length(title) <= 200 AND char_length(description) <= 5000
          AND (media_data IS NULL OR octet_length(media_data) <= 5592472));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'capstone_slug_bounds' AND conrelid = 'capstone_completions'::regclass) THEN
      ALTER TABLE capstone_completions ADD CONSTRAINT capstone_slug_bounds
        CHECK (char_length(course_slug) BETWEEN 1 AND 200);
    END IF;
  END $$;
  ALTER TABLE bug_reports VALIDATE CONSTRAINT bug_reports_payload_bounds;
  ALTER TABLE capstone_completions VALIDATE CONSTRAINT capstone_slug_bounds;

  CREATE TABLE IF NOT EXISTS lesson_notes (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, lesson_id)
  );

  CREATE TABLE IF NOT EXISTS course_bookmarks (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    course_slug TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, course_slug)
  );

  CREATE TABLE IF NOT EXISTS saved_lessons (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, lesson_id)
  );

  -- AI-generated learning artifacts are owned by the learner. Lesson IDs
  -- reference the trusted seed catalog rather than a client-provided prompt.
  CREATE TABLE IF NOT EXISTS generated_assignments (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, lesson_id)
  );

  CREATE TABLE IF NOT EXISTS generated_quizzes (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    questions JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    graded_at TIMESTAMP,
    grade_results JSONB
  );

  CREATE INDEX IF NOT EXISTS generated_quizzes_user_lesson_idx
    ON generated_quizzes (user_id, lesson_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS learner_mastery (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    concept TEXT NOT NULL,
    mastery_score REAL NOT NULL CHECK (mastery_score >= 0 AND mastery_score <= 1),
    attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, concept)
  );

  CREATE INDEX IF NOT EXISTS learner_mastery_weak_concepts_idx
    ON learner_mastery (user_id, mastery_score ASC, updated_at DESC);

  -- A learner's uploaded assignment file for a lesson the tutor flagged as
  -- requiring submission. One row per (user, lesson): resubmitting overwrites
  -- the previous file and bumps submitted_at, rather than piling up history —
  -- there's exactly one "current" submission for a tutor to grade later.
  -- course_slug is captured at submission time so a tutor's ownership check
  -- doesn't need to resolve it through course_lessons (which is replaced
  -- wholesale on every course edit — see .agents/memory/tutor-insights-privacy.md
  -- on why child rows shouldn't be assumed stable across catalog saves).
  CREATE TABLE IF NOT EXISTS assignment_submissions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    course_slug VARCHAR(80) NOT NULL REFERENCES courses(slug) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INT NOT NULL,
    content BYTEA NOT NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, lesson_id)
  );
  CREATE INDEX IF NOT EXISTS assignment_submissions_course_idx
    ON assignment_submissions (course_slug, submitted_at DESC);

  -- Which kind of assignment a submission answers, so tutors can tell them
  -- apart: 'tutor' = the lesson's tutor-set assignment (requires_submission),
  -- 'ai' = the learner's AI-generated practice assignment. Recorded at upload
  -- time so later lesson edits don't relabel old work. Existing rows are
  -- backfilled once (only NULLs) from the lesson flag + a generated brief.
  ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS source VARCHAR(10);
  UPDATE assignment_submissions s
     SET source = CASE
       WHEN COALESCE((SELECT l.requires_submission FROM course_lessons l WHERE l.id = s.lesson_id), FALSE) THEN 'tutor'
       WHEN EXISTS (SELECT 1 FROM generated_assignments ga WHERE ga.user_id = s.user_id AND ga.lesson_id = s.lesson_id) THEN 'ai'
       ELSE 'tutor'
     END
   WHERE s.source IS NULL;
  ALTER TABLE assignment_submissions ALTER COLUMN source SET DEFAULT 'tutor';
  ALTER TABLE assignment_submissions ALTER COLUMN source SET NOT NULL;
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_submissions_source_check') THEN
      ALTER TABLE assignment_submissions
        ADD CONSTRAINT assignment_submissions_source_check CHECK (source IN ('tutor', 'ai'));
    END IF;
  END $$;

  -- Markup a tutor leaves on one submission while reviewing it: a pinned
  -- comment, a whole-paragraph highlight (docx), or a freehand stroke (pdf
  -- page or docx canvas). "page" means a PDF page number for pdf files, or is
  -- always 1 for docx (the client anchors docx markup to a paragraph index
  -- instead, carried inside x/y — there's no real pagination once a docx is
  -- flowed to HTML client-side). x/y/stroke_points are percentages of the
  -- rendered surface, not pixels, so they survive different zoom levels.
  CREATE TABLE IF NOT EXISTS assignment_annotations (
    id SERIAL PRIMARY KEY,
    submission_id INT NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
    created_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('comment','highlight','draw')),
    page INT NOT NULL DEFAULT 1,
    paragraph_index INT,
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#facc15',
    body TEXT,
    stroke_points TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS assignment_annotations_submission_idx
    ON assignment_annotations (submission_id, created_at);

  -- A submission is "checked" once this row exists, regardless of the mark
  -- value — that's what the lesson-level checked/total count in the tutor
  -- grading header counts. marks is always a 0-100 percentage so lessons can
  -- be averaged together in stats even though a rubric's own point total
  -- (raw_max, below) varies per lesson. raw_score/raw_max are null when the
  -- tutor entered a flat mark directly instead of grading against a rubric.
  CREATE TABLE IF NOT EXISTS assignment_grades (
    submission_id INT PRIMARY KEY REFERENCES assignment_submissions(id) ON DELETE CASCADE,
    marks REAL NOT NULL CHECK (marks >= 0 AND marks <= 100),
    raw_score REAL,
    raw_max REAL,
    graded_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    graded_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  ALTER TABLE assignment_grades ADD COLUMN IF NOT EXISTS raw_score REAL;
  ALTER TABLE assignment_grades ADD COLUMN IF NOT EXISTS raw_max REAL;
  ALTER TABLE assignment_grades ADD COLUMN IF NOT EXISTS remark VARCHAR(30);

  -- A lesson's grading rubric — set up once by its tutor, applied to every
  -- learner's submission for that lesson. lesson_id is deliberately not a
  -- foreign key into course_lessons: that table's rows are wholesale
  -- deleted and re-inserted on every course save (see replaceCourse /
  -- updateOwnedCourse), so a rubric keyed to the stable lesson_id string —
  -- same pattern as assignment_submissions — survives ordinary course
  -- edits instead of vanishing the next time the tutor saves the course.
  CREATE TABLE IF NOT EXISTS assignment_rubric_criteria (
    id SERIAL PRIMARY KEY,
    lesson_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    max_points REAL NOT NULL CHECK (max_points > 0),
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS assignment_rubric_criteria_lesson_idx
    ON assignment_rubric_criteria (lesson_id, position);

  -- One score per (submission, criterion). Deleting a criterion (the tutor
  -- explicitly removing it while editing the rubric) cascades its recorded
  -- scores — editing a criterion's title/points in place does not touch
  -- this table, since the rubric editor updates existing rows by id rather
  -- than replacing them wholesale.
  CREATE TABLE IF NOT EXISTS assignment_grade_scores (
    submission_id INT NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
    criterion_id INT NOT NULL REFERENCES assignment_rubric_criteria(id) ON DELETE CASCADE,
    score REAL NOT NULL CHECK (score >= 0),
    PRIMARY KEY (submission_id, criterion_id)
  );

  -- Proposal preview links (src/lib/courses/preview-links.ts): chosen modules of
  -- a course, readable without signing in until expires_at. Only the SHA-256 of
  -- the link's code is stored. The app also creates this table on first use.
  CREATE TABLE IF NOT EXISTS course_preview_links (
    id SERIAL PRIMARY KEY,
    token_hash CHAR(64) NOT NULL UNIQUE,
    course_slug VARCHAR(80) NOT NULL REFERENCES courses(slug) ON DELETE CASCADE,
    module_keys JSONB NOT NULL,
    label VARCHAR(160) NOT NULL DEFAULT '',
    created_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    view_count INT NOT NULL DEFAULT 0,
    last_viewed_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS course_preview_links_course_idx ON course_preview_links (course_slug);

  -- Graded quizzes (src/lib/quiz/quiz-store.ts): one per lesson, keyed by lesson
  -- id like the rubric (course saves replace lesson rows). Holds the answer key,
  -- so it's only read on the server. The app also creates these on first use.
  CREATE TABLE IF NOT EXISTS lesson_quizzes (
    lesson_id TEXT PRIMARY KEY,
    course_slug VARCHAR(80) NOT NULL REFERENCES courses(slug) ON DELETE CASCADE,
    quiz JSONB NOT NULL,
    points REAL NOT NULL,
    updated_by INT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS lesson_quizzes_course_idx ON lesson_quizzes (course_slug);

  -- Each learner attempt keeps a copy of the quiz as it was when started, so a
  -- later edit never changes a grade. answers save as the learner goes; a timed
  -- attempt that runs out is scored with what was saved by its deadline.
  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    course_slug VARCHAR(80) NOT NULL REFERENCES courses(slug) ON DELETE CASCADE,
    attempt INT NOT NULL,
    seed TEXT NOT NULL,
    quiz JSONB NOT NULL,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    score REAL,
    max_score REAL NOT NULL,
    pending BOOLEAN NOT NULL DEFAULT FALSE,
    manual JSONB NOT NULL DEFAULT '{}'::jsonb,
    tutor_comment TEXT,
    graded_by INT REFERENCES users(id) ON DELETE SET NULL,
    graded_at TIMESTAMPTZ,
    UNIQUE (user_id, lesson_id, attempt)
  );
  CREATE INDEX IF NOT EXISTS quiz_attempts_lesson_idx ON quiz_attempts (lesson_id, submitted_at DESC);
  CREATE INDEX IF NOT EXISTS quiz_attempts_user_idx ON quiz_attempts (user_id, lesson_id);

  -- Server-side notifications (the notification bell was purely a local,
  -- per-browser mock before this: seeded with two hardcoded welcome
  -- messages, never written to by any server event — see src/lib/store.tsx).
  -- This table backs real events, starting with "a learner submitted an
  -- assignment"; the client keeps its local array too and merges the two
  -- (see useStore's serverNotifications) rather than migrating every
  -- existing local notification into this table.
  CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'announcement',
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    link TEXT,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

  -- ── Universities ─────────────────────────────────────────────────────────
  -- Super admin (Requisor team) > university admin > tutor > student.
  -- Each university keeps its own people and courses. A course with no
  -- university is a platform course that every learner can see.
  CREATE TABLE IF NOT EXISTS universities (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL DEFAULT '',
    -- Signing up with one of these email domains joins the university at once.
    email_domains TEXT[] NOT NULL DEFAULT '{}',
    -- The logo is either a file shipped with the site or one uploaded by a super admin.
    logo_path TEXT,
    logo_data BYTEA,
    logo_type TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS universities_name_key ON universities (lower(name));

  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS university_id INT REFERENCES universities(id) ON DELETE SET NULL,
    -- 'active' once the person belongs to the university; 'pending' while its admin decides.
    ADD COLUMN IF NOT EXISTS university_status VARCHAR(20),
    -- 'tutor' when someone asked to teach at sign-up; cleared when an admin decides.
    ADD COLUMN IF NOT EXISTS requested_role VARCHAR(20);
  CREATE INDEX IF NOT EXISTS users_university_idx ON users (university_id, role);

  ALTER TABLE courses ADD COLUMN IF NOT EXISTS university_id INT REFERENCES universities(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS courses_university_idx ON courses (university_id);

  -- Platform-wide switches set by super admins, such as which partner the public pages show.
  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  -- The first partner: MSOE, with its logo from the site's own files.
  INSERT INTO universities (name, short_name, email_domains, logo_path)
  SELECT 'Milwaukee School of Engineering', 'MSOE', ARRAY['msoe.edu'], '/msoe-logo.png'
  WHERE NOT EXISTS (SELECT 1 FROM universities);
  INSERT INTO site_settings (key, value)
  SELECT 'public_partner', to_jsonb(id) FROM universities ORDER BY id LIMIT 1
  ON CONFLICT (key) DO NOTHING;

  -- People whose email matches a university's domain belong to it.
  UPDATE users u SET university_id = un.id, university_status = 'active'
    FROM universities un
   WHERE u.university_id IS NULL AND u.email_verified = TRUE
     AND split_part(lower(u.email), '@', 2) = ANY(un.email_domains);

  -- Once only: a tutor's existing courses move into the tutor's university.
  UPDATE courses c SET university_id = u.university_id
    FROM users u
   WHERE c.owner_user_id = u.id AND c.university_id IS NULL AND u.university_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'universities_v1');
  INSERT INTO site_settings (key, value) VALUES ('universities_v1', 'true') ON CONFLICT (key) DO NOTHING;

  -- Students join the university they pick straight away; only tutor requests wait for an admin.
  UPDATE users SET university_status = 'active' WHERE university_status = 'pending';

  -- Activity analytics for super admins (src/lib/server/activity.ts).
  -- Every successful sign-in: how (password, Google…), from which browser and
  -- device, and the IP / location the host reports.
  CREATE TABLE IF NOT EXISTS login_events (
    id BIGSERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    method VARCHAR(30) NOT NULL,
    ip VARCHAR(64),
    user_agent TEXT,
    browser VARCHAR(40),
    os VARCHAR(40),
    device VARCHAR(20),
    country VARCHAR(80),
    region VARCHAR(80),
    city VARCHAR(80),
    -- With a time zone, so times read back right wherever the app runs.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS login_events_user_idx ON login_events (user_id, created_at DESC);

  -- One row per page visit in the app; active_seconds only counts time the
  -- tab was visible and the person was using it (or watching a video).
  CREATE TABLE IF NOT EXISTS page_views (
    id UUID PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    path VARCHAR(200) NOT NULL,
    area VARCHAR(40) NOT NULL,
    course_slug VARCHAR(80),
    lesson_id VARCHAR(120),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active_seconds INT NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS page_views_user_idx ON page_views (user_id, started_at DESC);
  CREATE INDEX IF NOT EXISTS page_views_lesson_idx ON page_views (lesson_id) WHERE lesson_id IS NOT NULL;

`).then(()=>{console.log('DB schema up to date');process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)});
