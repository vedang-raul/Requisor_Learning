import { Client } from "pg";
import { seedCourses } from "@/lib/data";
import { initializeCourseCatalog } from "@/lib/course-catalog";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("legacy course catalog migration", () => {
  jest.setTimeout(30_000);

  it("preserves valid TEXT-keyed reviews while seeding and installing the FK", async () => {
    const client = new Client({ connectionString: databaseUrl });
    const schema = `catalog_migration_${process.pid}_${Date.now()}`;
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await client.query(`
        CREATE TABLE courses (
          slug VARCHAR(80) PRIMARY KEY, title VARCHAR(160) NOT NULL,
          tagline VARCHAR(400) NOT NULL, category VARCHAR(20) NOT NULL,
          level VARCHAR(20) NOT NULL, tags JSONB NOT NULL DEFAULT '[]',
          cover VARCHAR(200) NOT NULL, added_at DATE NOT NULL,
          base_assessment TEXT, owner_user_id INT, revision INT NOT NULL DEFAULT 1
        );
        CREATE TABLE course_lessons (
          id VARCHAR(120) PRIMARY KEY, course_slug VARCHAR(80) NOT NULL REFERENCES courses(slug),
          title VARCHAR(200) NOT NULL, description VARCHAR(2000) NOT NULL,
          youtube_id VARCHAR(120) NOT NULL, duration_min INT NOT NULL,
          resources JSONB NOT NULL DEFAULT '[]', key_takeaways JSONB NOT NULL DEFAULT '[]',
          assignment TEXT, section VARCHAR(200), format VARCHAR(10) NOT NULL DEFAULT 'video',
          position INT NOT NULL DEFAULT 0
        );
        CREATE TABLE course_catalog_metadata (
          key VARCHAR(80) PRIMARY KEY, seeded_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE TABLE course_reviews (
          id SERIAL PRIMARY KEY, user_id INT, user_name TEXT NOT NULL,
          user_email TEXT NOT NULL, course_slug TEXT NOT NULL,
          rating INT NOT NULL, comment TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, course_slug)
        )
      `);
      const validSlug = seedCourses[0].slug;
      await client.query(
        `INSERT INTO course_reviews (user_id,user_name,user_email,course_slug,rating,comment)
         VALUES (1,'Legacy Learner','legacy@example.test',$1,5,'Keep me'),
                (2,'Orphan','orphan@example.test',$2,2,'Remove me'),
                (3,'Oversize','oversize@example.test',$3,1,'Remove me')`,
        [validSlug, "missing-course", "x".repeat(81)]
      );

      await initializeCourseCatalog(client);
      await initializeCourseCatalog(client);

      const courses = await client.query("SELECT COUNT(*)::int AS count FROM courses");
      const reviews = await client.query("SELECT course_slug, comment FROM course_reviews ORDER BY id");
      const column = await client.query(`
        SELECT data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema=$1 AND table_name='course_reviews' AND column_name='course_slug'`,
        [schema]
      );
      const foreignKeys = await client.query(`
        SELECT COUNT(*)::int AS count FROM pg_constraint
        WHERE conrelid='course_reviews'::regclass AND contype='f'`);

      expect(courses.rows[0].count).toBe(seedCourses.length);
      expect(reviews.rows).toEqual([{ course_slug: validSlug, comment: "Keep me" }]);
      expect(column.rows[0]).toEqual({
        data_type: "character varying",
        character_maximum_length: 80,
      });
      expect(foreignKeys.rows[0].count).toBe(1);
    } finally {
      await client.query("RESET search_path").catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
      await client.end();
    }
  });
});