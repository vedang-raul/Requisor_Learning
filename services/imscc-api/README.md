# IMSCC import API

A small Python service that reads a Canvas course export (`.imscc`, IMS Common
Cartridge) and sorts everything in it into the steps of Alma 41's lesson wizard.
It only reads and maps: it stores nothing and never writes to Alma 41. The app
shows the result to the tutor, who saves the lessons.

| Wizard step | Field in the response | Filled from Canvas |
|---|---|---|
| 1 Details | `details` | page title, first real paragraph, estimated minutes, module |
| 2 Video or text | `content` | a page with a video: `format: "video"` with `youtubeId`, and the page's reading as Markdown in `body` (shown below the video); a page without one: `format: "reading"` with the reading in `body` |
| 3 Assignment | `assignment` | assignment and discussion briefs, points, due date, hand-in and Canvas rubric criteria; or, for a Canvas quiz (its own lesson, as in Canvas), `kind: "quiz"` with the whole quiz in Alma 41's format in `quiz` |
| 4 Takeaways & resources | `takeawaysAndResources` | summary callouts / "key takeaways" lists; links, extra videos, files packed in the export, and files and links placed in the module |
| 5 Publish | — | the tutor reviews; `notes` lists what to check |

Field names inside each step match Alma 41's `Lesson` fields, and values already
fit its limits (title ≤ 200, description ≤ 2000, body ≤ 20000, ≤ 20 takeaways and
resources, marks 1–10000, dates `YYYY-MM-DD`).

Also returned: `course` (title and modules, with each module's description taken
from its Overview page), `unmapped` (a quiz with no question Alma 41 supports),
`files` (packed images, PDFs and documents to upload, and which lessons use them),
`skipped` (everything left out, with the reason) and `summary` (counts).

**Quizzes** come over completely: every question with its answers, points and
feedback (multiple choice, true/false, multiple answers, fill in the blank, fill
in multiple blanks, multiple dropdowns, matching, numerical, essay, text), and the
quiz's settings (attempts, score that counts, time limit, shuffling, one question
at a time, results and correct answers shown, due date). Formula and file-upload
questions are listed in the lesson's notes as not supported.

## What it understands in Canvas exports

- `imsmanifest.xml`, `course_settings/module_meta.xml` (module order, published state),
  `course_settings.xml`, `rubrics.xml`, `<id>/assignment_settings.xml`, discussion topics,
  QTI quizzes (`non_cc_assessments/*.qti`) and their settings (`<id>/assessment_meta.xml`).
- Pages built with Canvas's design-tool templates (`esComponent-*` tables): section
  headers, callouts, captioned images, quote boxes, click-to-reveal knowledge checks and
  video boxes, including the template's escaped `{{<iframe …>}}` YouTube embeds. The
  template's labels and `## author instructions ##` are dropped.
- `$IMS-CC-FILEBASE$/…` references to files packed in the export (`web_resources/`).
- Left out, with reasons: unpublished modules and items (unless `include_unpublished=true`),
  module headings, external tools (LTI), and pages, assignments, quizzes and discussions that
  aren't in any module (usually left over from another course, or announcements).

A page with a video becomes a video lesson (the first video; any others are resources) with
the page's whole reading below it, headings, lists, bold text and links kept; its opening
paragraph is the description. Packed files come back
with `needsUpload: true` and no URL: upload them through Alma 41's resource uploads, then
use the returned address.

## Run it

```bash
cd services/imscc-api
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt     # macOS/Linux: .venv/bin/python
IMSCC_API_KEY=change-me .venv/Scripts/python -m uvicorn imscc_api.main:app --port 8765
```

```bash
curl -H "X-API-Key: change-me" -F "file=@course-export.imscc" http://localhost:8765/v1/imscc/parse
```

Or without the server: `python -m imscc_api course-export.imscc > result.json`.

| Setting | Meaning |
|---|---|
| `IMSCC_API_KEY` | Shared secret the Alma 41 server sends as `X-API-Key`. Without it every call is refused (503). |
| `IMSCC_ALLOW_NO_KEY=1` | Local development only: accept calls without a key. |
| `IMSCC_MAX_UPLOAD_MB` | Largest upload (default 300). |
| `IMSCC_ENABLE_DOCS=1` | Serve the interactive API docs at `/docs`. |

## Safety

Uploads are untrusted. The package is read in memory and never unpacked to disk;
files that would escape the package (`../`, absolute paths) are refused, as are zip
bombs, password-protected archives and oversized files. XML is parsed with
`defusedxml` (no entity expansion, no external fetches). The service is meant to sit
behind the Alma 41 server, not on the public internet.

## Tests

```bash
.venv/Scripts/python -m pip install -r requirements-dev.txt
.venv/Scripts/python -m pytest -q
IMSCC_SAMPLE=path/to/real-export.imscc .venv/Scripts/python -m pytest -q   # also checks a real export
```
