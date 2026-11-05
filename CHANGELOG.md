# Changelog

Every release of Alma 41 (Requisor Learning), newest first. Versions follow
[Semantic Versioning](https://semver.org): MAJOR for changes that break how
people or other systems use the app, MINOR for new features, PATCH for fixes
only. How to cut a release is in [docs/RELEASING.md](docs/RELEASING.md).

## [Unreleased]

### Added
- **Privacy policy page** (`/privacy`): documents every category of data the Activity tab collects
  (sign-in events, page views, location, device, AI usage), who can see it, lawful basis, third-party
  services (ipapi.co, Google OAuth), user rights, and cookie details. The Activity tab footer now
  links to it. No database changes.

Database: three new tables, `course_preview_links`, `lesson_quizzes` and
`quiz_attempts` (additive; the app also creates them on first use). Nothing
existing changes.

### Fixed
- **No more flash of other courses**: Learning Paths and the sidebar showed the seven built-in
  courses for a moment on every load, unpublished ones included, before the real list arrived.
  Pages now wait for the real list, with placeholders, and a course or lesson link no longer
  flashes "not found" while it loads.
- **Admin lesson edits kept the assignment intact**: saving a lesson from the admin panel
  erased its points, due date and AI guardrails; they are now kept.
- **Courses the AI makes open in the editor**: a course the assistant creates opens
  straight away in My Courses, ready to change, and the chat closes so it's in view; the
  card's button goes back to it. An AI course draft ("Review in course editor") now opens
  at its editor rather than the top of the course list.
- **Program Builder assistant**: asking it to build from discovery notes could end in
  "returned an empty response". The suggestion now asks for the notes straight away, and
  an empty AI reply is retried once before anything is shown.
- **Course share links on the live site**: `/c/<course>` sent people to the server's
  internal address (`localhost:5000`) instead of the course.
- **Program Builder documents, long ones**: the chosen colour showed only on section
  headings, so pages of curriculum looked uncoloured. Module titles and the pricing
  table now use it, every page has a band in the theme colour (PDF and Word), and PDFs
  print the exact colour. Modules and the pricing table no longer split across pages.

### Added
- **Drag and drop lessons** (tutors): in a course's "Modules & lessons", drag a lesson by its
  handle to any place: before or after another lesson, into another module, or onto a module
  to put it last there. The up and down arrows and the module picker still work.
- **Branded assignments** (tutors): a fifth way to assess a lesson in step 3, for work a
  company sponsors. It is one brief for all or a brief per learner, as before, with the
  sponsor's name, logo, banner, colour and up to four links shown throughout: at the top
  of the assignment, in its colour, and in learners' Submissions and the grader.
  Optionally, learners sign a confidentiality agreement (an editable template filled with
  the brand's name, not legal advice) before they can read the brief, get their own AI
  brief or hand in; until then they see only the brand, title, due date and points. The
  brief isn't sent to learners' browsers before they sign, and the AI assistant won't
  reveal it. Each signature keeps the exact text agreed to; changing the text asks
  learners to sign again; tutors see who signed and when. Database: adds
  `course_lessons.assignment_brand` and an `assignment_nda_signatures` table.
- **University themes** (super admins): Admin → Universities → Theme. Quickest:
  describe the feel in a few words ("a bit of red mixed with brown") and the AI picks the
  colours and font, made readable automatically; or pick one of eight ready-made styles.
  Customise every detail sets a
  university's main and secondary colours, page background, sidebar and top bar, and font
  (one of eight hosted on the site, or the university's own uploaded as WOFF2, WOFF,
  TTF or OTF, checked to be a real font file), with a live preview, warnings for colours that would be
  hard to read and a darker shade to use instead, and Reset to Requisor. Its tutors,
  learners and admins see it on every app page after signing in, applied before the
  page shows. Public pages, super admins and other universities keep Requisor's look.
  Database: adds `universities.theme` (nullable) and a `university_fonts` table. The home page plan is in
  `docs/plans/university-theme-home-page.md`.
- **University layouts** (super admins): in the same Theme panel, "Layout and navigation"
  sets the sidebar's side (left or right, the mobile menu too), its style (light, tinted
  with the main colour, or dark) and whether it starts collapsed; renames, reorders and
  hides menu items (the dashboard always stays; hiding only takes an item off the menu);
  and picks what the top bar shows: search, XP, the tutor/student badge, the university's
  logo, and a shorter bar. Stored in the same theme, so no database change; ready-made
  styles and AI suggestions change colours and font only and keep the layout.
- **Program Builder course picker**: "Start from one of your courses" is sorted A to Z
  in Published and Drafts sections, with each course's lesson count.
- **Several logos on Program Builder documents**: up to four, side by side at the top
  of the proposal and blueprint (PDF and Word): the platform logo plus your own, each
  removable. Added logos are shrunk and kept in the browser; existing logo settings
  carry over.
- **Graded quizzes** (tutors and learners), modelled on Canvas Classic Quizzes: a
  fourth way to assess a lesson in step 3 of the lesson wizard. Ten question types
  (multiple choice, true/false, multiple answers, fill in the blank, fill in
  multiple blanks, multiple dropdowns, matching, numerical, essay, text), with
  points, feedback, and settings for due date, time limit, attempts, the score
  that counts (highest, latest, average), shuffling, one question at a time, and
  when learners see their results and the correct answers. Learners take quizzes
  on the lesson page; answers save as they go, a timed quiz hands itself in when
  time runs out, and everything is scored on the server (answers never reach the
  browser). Partial credit works as in Canvas. Quizzes show in the learner's
  Submissions (still to do, and scores) and in Check assignments, where tutors
  give points for essay answers. Each attempt keeps the quiz as it was, so later
  edits never change a grade.
- **Canvas quizzes import completely** (IMSCC import API): every supported
  question with its answers, points and feedback, and the quiz's settings and due
  date, as a lesson whose step 3 is the quiz.
- **Reading below the video** (tutors and learners): a video lesson can now have a
  reading under the video (step 2 of the lesson wizard, for YouTube, recorded and AI
  videos), up to 20,000 characters. No database change: lessons already had a body.
- **Formatted lesson readings**: readings (text lessons, code tutorials and the new
  video readings) now show smaller headings, numbered and nested lists, clickable
  links, quotes, dividers, simple tables and images. Links work only for https,
  mailto and the app's own pages, images only from https or our file store, and
  nothing in a reading is ever run as HTML. Chat replies are unchanged.
- **IMSCC import API** (`services/imscc-api`, not yet connected to the app): a
  Python service that reads a Canvas export and returns each lesson split by the
  wizard's steps, with pages that have a video becoming video lessons with their
  full, formatted reading below.
- **Program Builder: start from one of your courses**: pick a course you already
  teach and its modules, lessons, outcomes and assessment become the program's
  curriculum, ready for an employer proposal (PDF or Word). No extra draft course
  is made, and edits in the builder change the proposal only, not the course.
- **Proposal preview links**: for a program built on one of your courses, tick
  the modules the proposal's readers may open and make a link (`/p/<code>`). It
  goes into the proposal (screen, PDF and Word). Readers need no account and see
  only those modules' published lessons (video, description, key takeaways);
  the other modules show as locked titles. Nothing else is sent to them: no
  resources, assignments, quizzes, tutor or course details, and the page makes
  no requests for app data. Links last 15 days, can be turned off at any time,
  and count their views. The link's code is random and only its hash is stored.
- **All your preview links** (Program Builder): every preview link you've made,
  across all your courses, in one list: who it was for, the course and modules it
  opens, open/expired/turned off, views and when it was last opened, with
  Turn off. Filter by course, or show only open links.
- **Course share links**: a Share button on the course page and in the course
  editor gives a short link (`/c/<course>`) to copy or send. Whoever opens it signs
  in first (or signs up) and is then taken to the course. The link grants nothing:
  the course still shows only to people allowed to see it (drafts and other
  universities' courses stay hidden), and sign-in only ever returns to a page
  inside the app.
- **Hide modules** (tutors): tuck modules away in a course's "Modules & lessons"
  list, with Show hidden; learners still see them.

### Changed
- **Smoother pages**: the course list is now requested as the app opens, alongside the
  sign-in check instead of after it (the server still decides what each account sees). Pages
  fade in once and everything on them appears together: the app-wide second fade, the
  staggered one-after-another entrances, the sections and cards sliding up, and the list rows
  sliding around when a list changed are gone. Value animations (progress rings, charts) stay,
  and "reduce motion" still turns all motion off.
- **AI video is for super admins for now**: the lesson wizard's AI video tab shows "Coming
  soon" to tutors, and the AI video API refuses anyone else, since each render is charged.
- **AI video waits**: past the estimate, tutors are asked to be patient and told not to
  start again, since each video is charged. The estimate now comes from our own
  renders and shows before making the video. The AI writes scripts to a firm word
  limit, with no padding.
- **"Fill this step with AI" covers all of step 3**: it writes whatever the chosen
  assessment needs: the brief, guardrails, rubric, points, due date, or a whole quiz with
  its settings, instructions, feedback and every question type except plain text. A question
  that fails the quiz check is left out. Each part also has its own AI button, and
  Undo restores everything. Before, on a quiz it wrote a brief that wasn't on screen. The
  way of assessing, the hand-in switch and which learner data is used stay the tutor's.
- **Program Builder runs in order, for the assistant too**: the proposal is created only
  from the end of the curriculum step. The step bar opens it only once it exists. The AI
  assistant now knows which step you're on, suggests only what fits that step, and
  can't make a proposal before a curriculum has been reviewed: asked early, it builds the
  curriculum and stops there. A curriculum needs discovery notes or a topic: with neither,
  the assistant asks for them and the page says what's missing.
- **Program Builder documents can be fully reshaped**: on the curriculum and the
  proposal, every list line, module and pricing row can be added, removed and moved;
  clearing a line now removes its bullet. Section headings and labels can be reworded,
  sections removed and put back, and your own sections added. The PDF and Word files
  follow all of it, and leave out anything blank.
- **Program Builder is a three-step flow**, one step on screen at a time: Start (an
  existing course or a new discovery call), Curriculum, Proposal. Finished steps can be
  reopened from the step bar. Logos and colour can be changed on both Curriculum and
  Proposal, and the curriculum now shows them on screen as well as in its downloads.
  Going back to edit the curriculum updates the proposal and keeps its pricing and
  preview link. All your preview links moved behind a Preview links button.
- **Program Builder assistant**: on the Program Builder page the AI assistant is a
  separate flow, with its own conversation, instructions and actions. It only
  builds the employer program there and sends course work to the Tutor Workspace;
  elsewhere it builds courses and sends program requests to the Program Builder.
  Actions from the other side are refused even if asked for.
- **Program Builder** has its own place in the sidebar (Tutor Workspace →
  Program Builder → Check Assignments) instead of a tab inside the Tutor
  Workspace. "Open in My Courses" opens the blueprint course in the Tutor
  Workspace, and the AI assistant opens the new page when it builds a program.

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
- **Lesson thumbnails** (tutors): a lesson uses its YouTube video's thumbnail by
  default; tutors can upload their own picture (PNG or JPG, up to 5 MB) on the
  lesson's Details step, replace it, or go back to the YouTube one. It shows in the
  course's lesson list, the tutor's lesson list and the admin course editor, and
  works for reading and code lessons too.

### Fixed
- Program Builder documents: the title and module titles kept the app's teal
  whatever colour theme was chosen.

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

[Unreleased]: https://github.com/vedang-raul/Requisor_Learning/compare/bcc5aed...main
[1.2.0]: https://github.com/vedang-raul/Requisor_Learning/compare/v1.1.0...bcc5aed
[1.1.0]: https://github.com/vedang-raul/Requisor_Learning/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/vedang-raul/Requisor_Learning/releases/tag/v1.0.0
