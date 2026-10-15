#!/usr/bin/env node
/**
 * Demo people and courses for trying the university admin features locally:
 * 5 tutors and 5 students in MSOE, one short published course per tutor, and a
 * little learner activity (enrolments, views, completions, reviews) so the
 * admin's analytics and insights have something to show.
 *
 *   npm run db:seed-demo
 *
 * Local databases only: it refuses to run against anything that isn't
 * localhost. Safe to run again: it updates the same accounts and courses and
 * replaces the demo activity.
 *
 * Every demo account uses the address domain demo.msoe.test (".test" can never
 * receive email) and signs in with DEMO_PASSWORD below on the normal sign-in
 * form. Sign in as the test university admin to manage them.
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

/** The password of every demo account. Local test accounts only; change it here if you like. */
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "Msoe-Demo-2026!";
const DOMAIN = "demo.msoe.test";

if (!process.env.DATABASE_URL) {
  const envFile = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
    }
  }
}
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set."); process.exit(1); }
const host = (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
  console.error(`Refusing to seed demo accounts into ${host || "an unknown database"}: this script is for a local database only.`);
  process.exit(1);
}

const TUTORS = [
  { key: "priya", name: "Dr. Priya Raman", position: "Data Science" },
  { key: "marcus", name: "Prof. Marcus Hill", position: "Mechanical Engineering" },
  { key: "elena", name: "Dr. Elena Novak", position: "Cybersecurity" },
  { key: "james", name: "Prof. James Okoro", position: "Business Analytics" },
  { key: "sofia", name: "Dr. Sofia Lindqvist", position: "User Experience Design" },
];
const STUDENTS = [
  { key: "aiden", name: "Aiden Brooks", position: "Student" },
  { key: "maya", name: "Maya Chen", position: "Student" },
  { key: "liam", name: "Liam O'Connor", position: "Student" },
  { key: "zara", name: "Zara Ahmed", position: "Student" },
  { key: "noah", name: "Noah Fischer", position: "Student" },
];

const lesson = (title, description, body, takeaways, extra = {}) => ({ title, description, body, takeaways, minutes: 8, ...extra });

const COURSES = {
  priya: {
    slug: "msoe-demo-data-storytelling", title: "Data Storytelling Basics", tagline: "Turn numbers into a clear message", category: "data", tags: ["Data", "Visualization"],
    lessons: [
      lesson("Start with the question", "Why every chart begins with the decision it supports.", "A chart is an answer. Before opening a spreadsheet, write the decision the chart should help someone make.\n\n- Who will read it?\n- What will they decide?\n- What would change their mind?", ["Name the decision first", "Know your reader"]),
      lesson("Pick the right chart", "Bar, line or scatter: matching the chart to the comparison.", "Comparing categories? Use a **bar chart**. Showing change over time? Use a **line chart**. Looking for a relationship between two measures? Use a **scatter plot**.", ["Bars compare", "Lines show change", "Scatter shows relationships"]),
      lesson("Tell it in three sentences", "Context, insight, action.", "Write three sentences under every chart: what we looked at, what we found, and what we should do.", ["Context, insight, action"], { assignment: "Take one chart from your work and rewrite its caption as context, insight and action. Submit the chart and the caption.", marks: 20 }),
    ],
  },
  marcus: {
    slug: "msoe-demo-design-for-manufacture", title: "Design for Manufacture", tagline: "Parts that are easy to make, first time", category: "tools", tags: ["Engineering", "Manufacturing"],
    lessons: [
      lesson("Why manufacturability matters", "Most of a part's cost is fixed at the drawing board.", "Roughly 70% of a product's cost is decided during design. Small choices, like a tolerance or a corner radius, drive machining time and scrap.", ["Design decides cost"]),
      lesson("Tolerances that make sense", "Only tighten what the function needs.", "Every tight tolerance adds inspection and machining time. Ask what the part must do, then loosen everything else.\n\n- Functional fits: tight\n- Cosmetic faces: loose", ["Tight only where it matters"]),
      lesson("Design review checklist", "A quick checklist before you release a drawing.", "Check wall thickness, internal corner radii, standard hole sizes and access for tools before every release.", ["Use standard sizes", "Leave room for tools"], { assignment: "Review one of your part drawings against the checklist and list three changes that would make it cheaper to make.", marks: 25 }),
    ],
  },
  elena: {
    slug: "msoe-demo-phishing-defense", title: "Spotting Phishing", tagline: "Recognise and report suspicious messages", category: "security", tags: ["Security", "Awareness"],
    lessons: [
      lesson("How phishing works", "Urgency, authority and a link.", "Most phishing messages combine three things: **urgency** (act now), **authority** (from your boss or IT) and a **link or attachment**.", ["Urgency + authority + link"]),
      lesson("Check before you click", "Hover, read the address, and slow down.", "Hover over links to see where they really go. Read the sender's full address. When in doubt, contact the sender another way.", ["Hover first", "Verify another way"]),
      lesson("Report it", "What to do when something looks wrong.", "Report suspicious messages to IT, even if you clicked. Fast reports protect everyone else.", ["Report even if you clicked"], { assignment: "Find a phishing example online and annotate the warning signs. Submit a screenshot with your notes.", marks: 15 }),
    ],
  },
  james: {
    slug: "msoe-demo-kpis-that-matter", title: "KPIs That Matter", tagline: "Measure what drives the business", category: "business", tags: ["Business", "Analytics"],
    lessons: [
      lesson("Leading and lagging indicators", "Measures that predict versus measures that report.", "Revenue is a **lagging** indicator: it reports the past. Qualified leads are a **leading** indicator: they predict revenue.", ["Lagging reports", "Leading predicts"]),
      lesson("Choosing a handful", "Fewer, sharper KPIs.", "Pick three to five KPIs a team can actually influence. More than that and nobody acts on any of them.", ["Three to five KPIs", "Teams must influence them"]),
      lesson("A one-page dashboard", "Put the KPIs where people look.", "Each KPI needs a target, a trend and an owner. If a number has no owner, nobody fixes it when it slips.", ["Target, trend, owner"], { assignment: "Draft a one-page KPI dashboard for a team you know, with a target, trend and owner for each KPI.", marks: 30 }),
    ],
  },
  sofia: {
    slug: "msoe-demo-ux-research-quickstart", title: "UX Research Quickstart", tagline: "Learn what users need in a week", category: "design", tags: ["UX", "Research"],
    lessons: [
      lesson("Ask about the past", "Behaviour beats opinion.", "Ask people what they did last time, not what they would do. \"Tell me about the last time you…\" gets real stories.", ["Ask about real past events"]),
      lesson("Five interviews are enough", "Patterns appear quickly.", "Five well-chosen interviews reveal most of the big problems. Spend the time you save on fixing them.", ["Start with five"]),
      lesson("Turn notes into insights", "Cluster, name, prioritise.", "Write each observation on its own note, group similar notes, then name each group as a problem to solve.", ["Cluster", "Name", "Prioritise"], { assignment: "Interview one person about a tool they use daily and share three insights from your notes.", marks: 20 }),
    ],
  },
};

const COVERS = {
  data: "from-cyan-500 via-sky-500 to-blue-600",
  tools: "from-zinc-500 via-slate-600 to-slate-700",
  security: "from-emerald-500 via-teal-500 to-cyan-600",
  business: "from-amber-500 via-orange-500 to-red-600",
  design: "from-rose-500 via-pink-500 to-fuchsia-600",
};

// Which demo student has done what in which course: [student, tutor's course, lessons completed].
const PROGRESS = [
  ["aiden", "priya", 3], ["aiden", "elena", 1], ["aiden", "james", 2],
  ["maya", "priya", 2], ["maya", "sofia", 3], ["maya", "marcus", 1],
  ["liam", "elena", 3], ["liam", "james", 1],
  ["zara", "sofia", 2], ["zara", "priya", 1], ["zara", "marcus", 3],
  ["noah", "james", 3], ["noah", "elena", 2],
];
const REVIEWS = [
  ["aiden", "priya", 5, "Clear and practical. The three-sentence caption trick is great."],
  ["maya", "sofia", 4, "Short and useful. I'd like one more example interview."],
  ["zara", "marcus", 5, "Exactly what I needed before my design review."],
  ["noah", "james", 4, "Good intro to KPIs."],
];

async function main() {
  const ssl = /^(true|on|require)$/i.test(process.env.DATABASE_SSL || "") ? { rejectUnauthorized: false } : undefined;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const msoe = (await client.query("SELECT id, name FROM universities WHERE 'msoe.edu' = ANY(email_domains) OR short_name = 'MSOE' ORDER BY id LIMIT 1")).rows[0];
    if (!msoe) throw new Error("There is no MSOE university yet. Run npm run db:migrate first.");
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

    const ids = {};
    const upsert = async (person, role) => {
      const email = `${role === "tutor" ? "tutor" : "student"}.${person.key}@${DOMAIN}`;
      const { rows } = await client.query(
        `INSERT INTO users (email, name, password_hash, email_verified, role, position, university_id, university_status, onboarding_done, last_login_at)
         VALUES ($1, $2, $3, TRUE, $4, $5, $6, 'active', TRUE, NOW() - ($7 || ' hours')::interval)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, email_verified = TRUE,
           role = EXCLUDED.role, position = EXCLUDED.position, university_id = EXCLUDED.university_id,
           university_status = 'active', requested_role = NULL, onboarding_done = TRUE, last_login_at = EXCLUDED.last_login_at
         RETURNING id`,
        [email, person.name, hash, role, person.position, msoe.id, String(Math.floor(Math.random() * 120) + 1)]
      );
      ids[person.key] = rows[0].id;
      return email;
    };
    const tutorEmails = [];
    for (const t of TUTORS) tutorEmails.push(await upsert(t, "tutor"));
    const studentEmails = [];
    for (const s of STUDENTS) studentEmails.push(await upsert(s, "employee"));

    // One short published course per tutor, in MSOE.
    const courseSlug = {};
    for (const t of TUTORS) {
      const c = COURSES[t.key];
      courseSlug[t.key] = c.slug;
      await client.query(
        `INSERT INTO courses (slug, title, tagline, category, level, tags, cover, added_at, owner_user_id, published, university_id)
         VALUES ($1, $2, $3, $4, 'Beginner', $5::jsonb, $6, CURRENT_DATE, $7, TRUE, $8)
         ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, tagline = EXCLUDED.tagline, category = EXCLUDED.category,
           tags = EXCLUDED.tags, cover = EXCLUDED.cover, owner_user_id = EXCLUDED.owner_user_id, published = TRUE,
           university_id = EXCLUDED.university_id, updated_at = NOW()`,
        [c.slug, c.title, c.tagline, c.category, JSON.stringify(c.tags), COVERS[c.category], ids[t.key], msoe.id]
      );
      await client.query("DELETE FROM course_lessons WHERE course_slug = $1", [c.slug]);
      for (let i = 0; i < c.lessons.length; i++) {
        const l = c.lessons[i];
        await client.query(
          `INSERT INTO course_lessons (id, course_slug, title, description, youtube_id, duration_min, resources, key_takeaways, assignment,
                                       format, position, requires_submission, body, assignment_marks, published)
           VALUES ($1, $2, $3, $4, '', $5, '[]'::jsonb, $6::jsonb, $7, 'reading', $8, $9, $10, $11, TRUE)`,
          [`${c.slug}-${i + 1}`, c.slug, l.title, l.description, l.minutes, JSON.stringify(l.takeaways), l.assignment ?? null, i,
            Boolean(l.assignment), l.body, l.marks ?? null]
        );
      }
    }

    // Demo activity: replaced on every run.
    const studentIds = STUDENTS.map((s) => ids[s.key]);
    await client.query("DELETE FROM lesson_completions WHERE user_id = ANY($1::int[])", [studentIds]);
    await client.query("DELETE FROM lesson_views WHERE user_id = ANY($1::int[])", [studentIds]);
    await client.query("DELETE FROM course_enrollments WHERE user_id = ANY($1::int[])", [studentIds]);
    await client.query("DELETE FROM course_reviews WHERE user_id = ANY($1::int[])", [studentIds]);
    for (const [student, tutor, done] of PROGRESS) {
      const slug = courseSlug[tutor];
      const userId = ids[student];
      const daysAgo = Math.floor(Math.random() * 10) + 1;
      await client.query("INSERT INTO course_enrollments (user_id, course_slug, enrolled_at) VALUES ($1, $2, NOW() - ($3 || ' days')::interval) ON CONFLICT DO NOTHING", [userId, slug, String(daysAgo + 2)]);
      for (let i = 1; i <= 3; i++) {
        const lessonId = `${slug}-${i}`;
        if (i > done + 1) break;
        await client.query(
          "INSERT INTO lesson_views (user_id, course_slug, lesson_id, first_viewed_at, last_viewed_at) VALUES ($1, $2, $3, NOW() - ($4 || ' days')::interval, NOW() - ($5 || ' days')::interval) ON CONFLICT DO NOTHING",
          [userId, slug, lessonId, String(daysAgo + 1), String(daysAgo)]
        );
        if (i <= done) {
          await client.query("INSERT INTO lesson_completions (user_id, lesson_id, course_slug, completed_at) VALUES ($1, $2, $3, NOW() - ($4 || ' days')::interval)", [userId, lessonId, slug, String(daysAgo)]);
        }
      }
    }
    for (const [student, tutor, rating, comment] of REVIEWS) {
      const s = STUDENTS.find((x) => x.key === student);
      await client.query(
        "INSERT INTO course_reviews (user_id, user_name, user_email, course_slug, rating, comment) VALUES ($1, $2, $3, $4, $5, $6)",
        [ids[student], s.name, `student.${student}@${DOMAIN}`, courseSlug[tutor], rating, comment]
      );
    }

    await client.query("COMMIT");
    console.log(`Demo data ready in ${msoe.name}:`);
    console.log(`  Tutors:   ${tutorEmails.join(", ")}`);
    console.log(`  Students: ${studentEmails.join(", ")}`);
    console.log(`  Courses:  ${Object.values(courseSlug).join(", ")}`);
    console.log("  Password: DEMO_PASSWORD in scripts/seed-msoe-demo.js");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
