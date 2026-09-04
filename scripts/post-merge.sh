#!/bin/bash
set -e

# Install dependencies
npm install --ignore-scripts

# Fix bin permissions (common after zip imports / npm installs on this repl)
chmod -R +x node_modules/.bin/ 2>/dev/null || true

# Run schema migrations using a literal heredoc so shell quoting cannot alter
# JavaScript template literals, SQL dollar blocks, or JSON defaults.
node <<'NODE'
const {Pool}=require('pg');
const p=new Pool({connectionString:process.env.DATABASE_URL});
p.query(`
  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS employment_type TEXT,
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
    ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{"courses":true,"assignments":true,"badges":true,"announcements":true}',
    ADD COLUMN IF NOT EXISTS assistant_persona VARCHAR(20),
    ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10),
    ADD COLUMN IF NOT EXISTS preferred_country VARCHAR(60);

  -- employment_type started as VARCHAR(20) for the employee flow's short
  -- enum values ("job"/"intern"), but the tutor onboarding survey also
  -- writes a free-text "how much teaching experience do you have" answer
  -- into this same column — routinely well over 20 characters, which made
  -- every such save fail silently against the old constraint. Widening is
  -- always safe (no data loss, existing short values are untouched) and
  -- safe to re-run.
  ALTER TABLE users ALTER COLUMN employment_type TYPE TEXT;

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
    format VARCHAR(10) NOT NULL DEFAULT 'video' CHECK (format IN ('video','reading')),
    position INT NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS courses_owner_idx ON courses (owner_user_id, added_at DESC);
  CREATE INDEX IF NOT EXISTS course_lessons_course_position_idx ON course_lessons (course_slug, position, id);
  CREATE INDEX IF NOT EXISTS course_reviews_slug_rating_idx ON course_reviews (course_slug, rating);

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

  -- One-time bootstrap: the four seed courses ship with no owner_user_id.
  -- If a tutor account named exactly 'Naveen Kankate' exists, assign the
  -- still-unowned seed courses to them; a no-op until that account exists,
  -- and never overwrites a course someone has already claimed/reassigned.
  UPDATE courses SET owner_user_id = (
    SELECT id FROM users WHERE name = 'Naveen Kankate' AND role = 'tutor' LIMIT 1
  )
  WHERE slug IN ('product-management', 'data-analytics', 'agentic-ai', 'cyber-security')
    AND owner_user_id IS NULL
    AND EXISTS (SELECT 1 FROM users WHERE name = 'Naveen Kankate' AND role = 'tutor');
`).then(()=>{console.log('DB schema up to date');process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)});
NODE

echo "Post-merge setup complete."
