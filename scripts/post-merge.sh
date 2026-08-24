#!/bin/bash
set -e

# Install dependencies
npm install --ignore-scripts

# Fix bin permissions (common after zip imports / npm installs on this repl)
chmod -R +x node_modules/.bin/ 2>/dev/null || true

# Run any pending DB column additions / table creations idempotently
node -e "
const {Pool}=require('pg');
const p=new Pool({connectionString:process.env.DATABASE_URL});
p.query(\`
  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS employment_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS position VARCHAR(100),
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS reset_requested_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS streak_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS streak_last_day DATE,
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
    ADD COLUMN IF NOT EXISTS qualification TEXT,
    ADD COLUMN IF NOT EXISTS learning_goal TEXT,
    ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{"courses":true,"assignments":true,"badges":true,"announcements":true}';

  DO \$\$
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
  \$\$;

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

  CREATE TABLE IF NOT EXISTS course_reviews (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    course_slug TEXT NOT NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, course_slug)
  );

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
\`).then(()=>{console.log('DB schema up to date');process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)});
"

echo "Post-merge setup complete."
