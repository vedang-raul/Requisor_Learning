# Changelog

Every release of Alma 41 (Requisor Learning), newest first. Versions follow
[Semantic Versioning](https://semver.org): MAJOR for changes that break how
people or other systems use the app, MINOR for new features, PATCH for fixes
only. How to cut a release is in [docs/RELEASING.md](docs/RELEASING.md).

## [1.2.0] — not yet published

Release candidate on `main`: the commit that sets version 1.2.0. **Database change:** adds two nullable columns,
`course_lessons.thumbnail_url` and `courses.modules` (in `scripts/migrate.js`;
Replit's Publish will show them as schema changes).

### Added
- **Modules** (tutors and learners): lesson "sections" become course modules,
  Coursera-style. Tutors add modules with a name and description, reorder,
  rename and remove them, put lessons in a module from the lesson list or the
  lesson form ("+ New module…"), move lessons up and down within a module, and
  add a lesson straight into a module. Learners see numbered modules with their
  descriptions, lesson counts and length on the course page and in the lesson
  sidebar. Existing sections carry over as modules automatically.
- **Program Builder document style**: the blueprint and proposal PDFs and Word
  files carry a logo (the platform's, set by a super admin, by default; or your
  own, or none) and a colour theme (six presets or a custom colour), remembered
  per account in the browser. Blueprint courses now get real modules with the
  curriculum's module descriptions.

### Fixed
- Program Builder documents: the title and module titles kept the app's teal
  whatever colour theme was chosen.
- **Lesson thumbnails** (tutors): a lesson uses its YouTube video's thumbnail by
  default; tutors can upload their own picture (PNG or JPG, up to 5 MB) on the
  lesson's Details step, replace it, or go back to the YouTube one. It shows in the
  course's lesson list, the tutor's lesson list and the admin course editor, and
  works for reading and code lessons too.

## [1.1.0] — 2026-10-28

Live on learning.requisor.io: commit `57611de` (tag `v1.1.0`). Changes since 1.0.0 are
`94c938c..8bc8bb7`. No database changes.

### Added
- **Assignments for this lesson** (learners): one card per lesson with a to-do
  summary (graded task: due date, points, handed in or not; optional practice),
  Due / Worth / Hand in facts, drag-and-drop upload, and a confirmation before
  replacing a file.
- **Submissions** (learners): "Still to hand in" lists graded assignments from
  lessons the learner has started or completed, marked in progress or completed;
  "Handed in" has All / Not checked yet / Graded / Needs attention tabs, a course
  filter and scores as points. The sidebar shows how many are due.
- **Check assignments** (tutors): progress summary (checked, need checking,
  handed in late, oldest waiting), Needs checking / Checked / All tabs, lesson and
  type filters, an oldest-first queue and Start checking.
- **Grader** (tutors): top bar with the learner, how many are left and previous /
  next; one-tap tags (Late, Missing, Excused) with a Late suggestion; a total card;
  Save and next.
- **Lesson wizard, assignment step** (tutors): None / One brief for all / A brief
  per learner; per-learner rules with tap-to-toggle tailoring; a switch for
  "Learners hand in a file for grading"; Hand-in and grading with an inline
  Rubric (criteria, points, running total) or One score.
- **My Courses** (tutors): hide courses to declutter the list, with Show hidden.

### Changed
- The AI assistant's panel, buttons, switches and text are larger; on phones the
  header and placeholder are trimmed to fit.
- A rubric's total is now the lesson's points; the separate pop-up rubric editor
  is replaced by the inline one.

### Fixed
- Assignment due dates showed, and could be saved back, a day early on servers
  ahead of UTC.
- The lesson wizard could load an out-of-date copy of a rubric from the browser
  cache.

## [1.0.0] — 2026-10-27

Live on learning.requisor.io: commit `94c938c`. The first versioned release; it
includes everything built before it. Highlights since the previous publish
(`868fc46..94c938c`):

### Added
- **Program Builder**: the first curriculum of a program is saved as a draft
  "Curriculum Blueprint" course (Open in My Courses, Update draft course), and the
  blueprint and the employer proposal download as PDF or Word.
- **Lesson wizard**: the AI note is drafted from the lesson's title and
  description and carries over to every step and to the recorder's script writer.

### Fixed
- Creating a course whose name matched an existing one failed with "Invalid
  course revision."
- Program Builder's "Open in My Courses" did nothing when its draft course had
  been deleted.
- Tutor workspace tabs could stay blank after switching.

[1.2.0]: https://github.com/vedang-raul/Requisor_Learning/compare/v1.1.0...main
[1.1.0]: https://github.com/vedang-raul/Requisor_Learning/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/vedang-raul/Requisor_Learning/releases/tag/v1.0.0
