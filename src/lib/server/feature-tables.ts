/**
 * Tables for newer features. Listed here once: the features create them on first
 * use, and ensureCourseCatalog() creates them as the app starts, so a development
 * database has them before Publish compares it with production. Also in
 * scripts/migrate.js. Additive only, and safe to run repeatedly.
 */
export const PREVIEW_LINK_TABLES = `
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
  `;

export const QUIZ_TABLES = `
    CREATE TABLE IF NOT EXISTS lesson_quizzes (
      lesson_id TEXT PRIMARY KEY,
      course_slug VARCHAR(80) NOT NULL REFERENCES courses(slug) ON DELETE CASCADE,
      quiz JSONB NOT NULL,
      points REAL NOT NULL,
      updated_by INT REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS lesson_quizzes_course_idx ON lesson_quizzes (course_slug);
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
  `;

/**
 * A university's theme for its members (src/lib/theme/university-theme.ts),
 * null for Requisor's own look; and the font a super admin uploaded for it.
 */
/** Branded assignments' NDA signatures: who signed which lesson's agreement, and its exact text (see src/lib/courses/assignment-nda.ts). */
export const ASSIGNMENT_NDA_TABLES = `
    CREATE TABLE IF NOT EXISTS assignment_nda_signatures (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id VARCHAR(120) NOT NULL,
      nda_hash CHAR(64) NOT NULL,
      nda_text TEXT NOT NULL,
      signed_name TEXT NOT NULL,
      signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, lesson_id, nda_hash)
    );
    CREATE INDEX IF NOT EXISTS assignment_nda_signatures_lesson_idx ON assignment_nda_signatures (lesson_id, signed_at DESC);
  `;

export const UNIVERSITY_THEME_TABLES = `
    ALTER TABLE universities ADD COLUMN IF NOT EXISTS theme JSONB;
    CREATE TABLE IF NOT EXISTS university_fonts (
      university_id INTEGER PRIMARY KEY REFERENCES universities(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      format TEXT NOT NULL,
      data BYTEA NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `;
