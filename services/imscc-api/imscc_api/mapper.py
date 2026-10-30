"""Canvas course → Alma 41 lesson drafts, one wizard step at a time.

Walks the course outline (module_meta.xml) in order. Each module becomes an
Alma 41 module; each page, assignment or discussion in it becomes a lesson:

  step 1  details      title, a one-paragraph description, estimated minutes, module
  step 2  content      a YouTube lesson when the page is mostly video, else a
                       Markdown reading (Alma 41 lessons are one or the other)
  step 3  assignment   an assignment's or discussion's brief, points, due date,
                       hand-in, and its Canvas rubric
  step 4  takeaways    summary callouts and "key takeaways" lists; links, extra
                       videos, and files packed in the export as resources

Files and web links placed directly in a module attach to the lesson before
them. Each Canvas quiz becomes its own lesson whose step 3 is the quiz, in
Alma 41's quiz format (every question type, settings, due date). Everything
left out is listed under `skipped` with the reason.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from . import schema as S
from .canvas import (AssignmentSettings, Resource, parse_manifest, parse_modules, parse_rubrics,
                     read_assignment_settings, read_discussion)
from .content import PageContent, convert_html, plain_text, summary_line
from .package import Package
from .qti import read_quiz

HAND_IN_TYPES = {"online_upload", "online_text_entry", "online_url", "media_recording", "student_annotation"}
READ_WPM = 200
MINUTES_PER_VIDEO = 6          # Canvas doesn't record video length


def slugify(s: str, limit: int = 100) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:limit].strip("-")
    return slug or "lesson"


def clip(s: str, limit: int) -> str:
    s = s.strip()
    return s if len(s) <= limit else s[: limit - 1].rstrip() + "…"


def youtube_url(ident: str) -> str:
    return f"https://www.youtube.com/watch?v={ident}"


@dataclass
class _Draft:
    lesson: S.LessonDraft
    files: list[str] = field(default_factory=list)


class _Builder:
    def __init__(self, pkg: Package, include_unpublished: bool):
        self.pkg = pkg
        self.include_unpublished = include_unpublished
        self.title, self.resources = parse_manifest(pkg)
        self.rubrics = parse_rubrics(pkg)
        self.lessons: list[_Draft] = []
        self.unmapped: list[S.Unmapped] = []
        self.skipped: list[S.Skipped] = []
        self.modules: list[S.ModuleOut] = []
        self.used_ids: set[str] = set()
        self.referenced: set[str] = set()
        self.files_used: dict[str, list[str]] = {}

    # ── helpers ──────────────────────────────────────────────────────────────
    def unique_id(self, title: str) -> str:
        base = slugify(title)
        ident, n = base, 2
        while ident in self.used_ids:
            ident = f"{base[:95]}-{n}"
            n += 1
        self.used_ids.add(ident)
        return ident

    def skip(self, title: str, module: str | None, reason: str) -> None:
        self.skipped.append(S.Skipped(title=title or "Untitled", module=module, reason=reason))

    def use_file(self, path: str, lesson_id: str) -> str | None:
        stored = self.pkg.resolve(path)
        if stored is None:
            return None
        users = self.files_used.setdefault(stored, [])
        if lesson_id not in users:
            users.append(lesson_id)
        return stored

    def resource_for_file(self, label: str, path: str, lesson_id: str) -> S.Resource | None:
        stored = self.use_file(path, lesson_id)
        if stored is None:
            return None
        kind = "pdf" if stored.lower().endswith(".pdf") else "file"
        return S.Resource(label=clip(label or stored.rsplit("/", 1)[-1], 200), type=kind, url=None,
                          package_path=stored, needs_upload=True)

    # ── one module item → one lesson ─────────────────────────────────────────
    def build_lesson(self, title: str, module: str, item_type: str, item_id: str, position: int,
                     page: PageContent, brief: S.Assignment | None, notes: list[str]) -> _Draft:
        lesson_id = self.unique_id(title)
        videos = page.youtube_ids
        is_video = bool(videos)  # a page with a video is a video lesson, its reading below the video
        body = page.body if page.words >= 15 else ""
        # The page's own title often opens the reading: the lesson title already says it.
        bare_title = re.sub(r"^\s*M\d+\s*:\s*", "", title).strip().lower()
        while True:
            m = re.match(r"\s*#+ (.+)\n+(?:---\n+)?", body)
            if not (m and m.group(1).strip().lower() in (title.strip().lower(), bare_title)):
                break
            body = body[m.end():]

        if len(body) > 20_000:
            notes.append("The reading was longer than 20,000 characters and was cut; check the end.")
        images = [p for p in (self.use_file(i, lesson_id) for i in page.images) if p]
        if is_video:
            content = S.Content(format="video", youtube_id=videos[0], body=clip(body, 20_000) or None,
                                other_videos=videos[1:], images=images, word_count=page.words)
        else:
            content = S.Content(format="reading", youtube_id=None, body=clip(body, 20_000) or None,
                                other_videos=videos, images=images, word_count=page.words)
            if not body and not brief:
                notes.append("The Canvas page had no content to bring over.")

        description = summary_line(body) or (brief and summary_line(brief.assignment)) or ""
        if not description:
            description = f"Part of {module}." if module else title
        description = clip(description, 2000)

        minutes = page.words / READ_WPM + MINUTES_PER_VIDEO * len(videos) + (15 if brief else 0)
        duration = max(5, min(1440, int(math.ceil(minutes / 5.0)) * 5))

        resources: list[S.Resource] = []
        for i, v in enumerate(videos[1:] if is_video else videos, start=1):
            named = page.video_titles.get(v)
            label = f"Video: {named}" if named else (f"Video {i}" if not is_video else f"More video {i}")
            resources.append(S.Resource(label=clip(label, 200), type="link", url=youtube_url(v)))
        for f in page.files:
            r = self.resource_for_file(f.label, f.url, lesson_id)
            if r:
                resources.append(r)
            else:
                notes.append(f"Linked file not found in the export: {f.url}")
        for link in page.links:
            if link.url.startswith("https://") and not any(r.url == link.url for r in resources):
                resources.append(S.Resource(label=clip(link.label, 200), type="link", url=link.url))
            elif link.url.startswith("http://"):
                notes.append(f"Left out a non-secure (http) link: {link.url}")

        if page.knowledge_checks:
            notes.append(f"{page.knowledge_checks} click-to-reveal knowledge check(s) were kept in the reading as questions with answers.")
        if not page.takeaways:
            notes.append("No key takeaways in the Canvas page: add some in step 4, or generate them with AI.")
        draft = S.LessonDraft(
            id=lesson_id,
            source=S.Source(canvas_type=item_type, canvas_id=item_id, module=module, position=position),
            details=S.Details(title=clip(title, 200), description=description, duration_min=duration, section=clip(module, 200) if module else None),
            content=content,
            assignment=brief,
            takeaways_and_resources=S.TakeawaysAndResources(key_takeaways=[clip(t, 500) for t in page.takeaways][:20], resources=resources),
            notes=notes,
        )
        return _Draft(draft)

    def assignment_step(self, settings: AssignmentSettings | None, brief_md: str, notes: list[str], discussion: bool) -> S.Assignment:
        brief = clip(plain_text(brief_md), 5000) or "See the lesson for the task."
        hand_in = bool(settings and HAND_IN_TYPES & set(settings.submission_types)) and not discussion
        marks = int(round(settings.points)) if settings and settings.points and settings.points >= 1 else None
        if marks and marks > 10_000:
            marks, _ = 10_000, notes.append("Points were above Alma 41's maximum of 10,000 and were capped.")
        criteria: list[S.RubricCriterion] = []
        rubric = self.rubrics.get(settings.rubric_ref) if settings and settings.rubric_ref else None
        if rubric and rubric.criteria:
            criteria = [S.RubricCriterion(title=clip(c.title, 200), description=clip(c.description, 1000), max_points=c.points)
                        for c in rubric.criteria]
            total = sum(c.max_points for c in criteria)
            if marks and abs(total - marks) > 0.01:
                notes.append(f"The rubric \"{rubric.title}\" totals {total:g} points but Canvas gave the assignment {marks}; "
                             "Alma 41 uses the rubric's total.")
        if discussion:
            notes.append("A Canvas discussion: Alma 41 has no discussion boards, so the prompt is set as the "
                         "lesson's assignment and learners can answer in the lesson comments.")
        if hand_in and not marks:
            notes.append("Hand-in needs points in Alma 41: add them in step 3.")
        return S.Assignment(assignment=brief, requires_submission=hand_in, assignment_marks=marks,
                            assignment_due_date=settings.due_date if settings and hand_in else None,
                            grade_with="rubric" if criteria else "score", rubric=criteria)

    # ── the walk ─────────────────────────────────────────────────────────────
    def run(self) -> S.ImportResult:
        modules = parse_modules(self.pkg)
        if not modules:
            self.skip("Course outline", None, "No modules in the export (course_settings/module_meta.xml); nothing to place.")
        for module in modules:
            for item in module.items:
                if item.ref:
                    self.referenced.add(item.ref)
            if not module.published and not self.include_unpublished:
                self.skip(module.title, None, "Unpublished module (hidden from students in Canvas).")
                continue
            self.walk_module(module)
        self.report_leftovers()
        return self.result()

    def walk_module(self, module) -> None:
        name = module.title
        first_lesson_index = len(self.lessons)
        pending: list[S.Resource] = []        # files/links seen before the module's first lesson
        overview = ""

        def last_lesson() -> _Draft | None:
            return self.lessons[-1] if len(self.lessons) > first_lesson_index else None

        def attach(resource: S.Resource) -> None:
            target = last_lesson()
            if target:
                target.lesson.takeaways_and_resources.resources.append(resource)
            else:
                pending.append(resource)

        for item in module.items:
            kind = item.content_type
            if not item.published and not self.include_unpublished:
                self.skip(item.title, name, "Unpublished item.")
                continue
            res = self.resources.get(item.ref) if item.ref else None
            if kind == "ContextModuleSubHeader":
                self.skip(item.title, name, "A heading in the Canvas module, not content.")
            elif kind == "WikiPage":
                html = self.pkg.read_text(res.href) if res and res.href else None
                if html is None:
                    self.skip(item.title, name, "The page's file is missing from the export.")
                    continue
                page = convert_html(html)
                draft = self.build_lesson(item.title, name, kind, item.ref, item.position, page, None, [])
                self.lessons.append(draft)
                if not overview and re.search(r"\boverview\b", item.title, re.I):
                    overview = summary_line(page.body, 600)
            elif kind == "Assignment" and res:
                settings = read_assignment_settings(self.pkg, res)
                html_path = next((f for f in res.files if f.endswith(".html")), None)
                page = convert_html(self.pkg.read_text(html_path) or "") if html_path else PageContent()
                notes: list[str] = []
                brief = self.assignment_step(settings, page.body, notes, discussion=False)
                # The brief lives in step 3; the reading in step 2 stays empty unless the page has a video.
                lesson_page = PageContent(youtube_ids=page.youtube_ids, files=page.files, links=page.links,
                                          takeaways=page.takeaways, words=0)
                self.lessons.append(self.build_lesson(item.title, name, kind, item.ref, item.position, lesson_page, brief, notes))
            elif kind == "DiscussionTopic" and res:
                topic = read_discussion(self.pkg, res, self.resources)
                if topic is None:
                    self.skip(item.title, name, "The discussion's file is missing from the export.")
                    continue
                page = convert_html(topic.html)
                notes = []
                brief = self.assignment_step(topic.graded, page.body, notes, discussion=True)
                lesson_page = PageContent(youtube_ids=page.youtube_ids, files=page.files, links=page.links, words=0)
                self.lessons.append(self.build_lesson(item.title, name, kind, item.ref, item.position, lesson_page, brief, notes))
            elif kind in ("Quizzes::Quiz", "Assessment") and res:
                quiz = read_quiz(self.pkg, res)
                if quiz is None or not quiz.questions:
                    after = last_lesson()
                    self.unmapped.append(S.Unmapped(
                        kind="quiz", title=item.title, module=name, after_lesson=after.lesson.id if after else None,
                        reason="; ".join(quiz.skipped) if quiz and quiz.skipped else "The quiz's questions are missing from the export."))
                    continue
                n = sum(1 for q in quiz.questions if q["type"] != "text_only")
                notes = [f"Canvas quiz: {n} question{'' if n == 1 else 's'}, {quiz.points or 0:g} points."] + quiz.skipped
                step3 = S.Assignment(kind="quiz", assignment="", requires_submission=False, assignment_marks=None,
                                     assignment_due_date=None, grade_with="score", rubric=[],
                                     quiz={"settings": quiz.settings, "questions": quiz.questions})
                # Keep the quiz's instructions as the lesson's reading, however short.
                words = max(15, len(re.findall(r"[A-Za-z0-9']+", quiz.description))) if quiz.description.strip() else 0
                draft = self.build_lesson(item.title, name, kind, item.ref, item.position,
                                          PageContent(body=quiz.description, words=words), step3, notes)
                d = draft.lesson.details
                if d.description.startswith("Part of ") or d.description == item.title:
                    d.description = f"Quiz: {n} question{'' if n == 1 else 's'}, {quiz.points or 0:g} points."
                limit = quiz.settings.get("timeLimitMin")
                d.duration_min = max(5, min(1440, limit or int(math.ceil(n * 1.5 / 5.0)) * 5))
                draft.lesson.notes = [x for x in draft.lesson.notes if not x.startswith("No key takeaways")]
                self.lessons.append(draft)
            elif kind == "Attachment" and res:
                label = item.title or res.href.rsplit("/", 1)[-1]
                owner = last_lesson().lesson.id if last_lesson() else f"module:{name}"
                r = self.resource_for_file(label, res.href, owner)
                if r:
                    attach(r)
                else:
                    self.skip(item.title, name, "The file is missing from the export.")
            elif kind == "ExternalUrl" and item.url:
                if item.url.startswith("https://"):
                    attach(S.Resource(label=clip(item.title or item.url, 200), type="link", url=item.url))
                else:
                    self.skip(item.title, name, "Not a secure (https) link.")
            elif kind == "ContextExternalTool":
                self.skip(item.title, name, "An external tool (LTI) that only works inside Canvas.")
            else:
                self.skip(item.title, name, f"No place for this in Alma 41 ({kind or 'unknown type'}).")

        lessons = self.lessons[first_lesson_index:]
        if pending and lessons:
            lessons[0].lesson.takeaways_and_resources.resources[:0] = pending
        elif pending:
            for r in pending:
                self.skip(r.label, name, "A file or link in a module with no lessons to attach it to.")
        for d in lessons:
            res = d.lesson.takeaways_and_resources.resources
            if len(res) > 20:
                d.lesson.notes.append(f"{len(res) - 20} resource(s) over Alma 41's limit of 20 were left out.")
                del res[20:]
        if lessons:
            self.modules.append(S.ModuleOut(title=clip(name, 200), description=clip(overview, 2000) or None))

    def report_leftovers(self) -> None:
        not_in_module = " that isn't in any module (often left over from another course)."
        for res in self.resources.values():
            if res.id in self.referenced:
                continue
            if res.href.startswith("wiki_content/") and res.href.endswith(".html"):
                html = self.pkg.read_text(res.href) or ""
                m = re.search(r"<title>(.*?)</title>", html, re.S | re.I)
                self.skip(m.group(1).strip() if m else res.href.rsplit("/", 1)[-1], None, "A page" + not_in_module)
            elif any(f.endswith("assignment_settings.xml") for f in res.files):
                settings = read_assignment_settings(self.pkg, res)
                self.skip(settings.title if settings and settings.title else res.id, None, "An assignment" + not_in_module)
            elif res.type.startswith("imsqti"):
                quiz = read_quiz(self.pkg, res)
                self.skip(quiz.title if quiz else res.id, None, "A quiz" + not_in_module)
            elif res.type == "imsdt_xmlv1p1":
                topic = read_discussion(self.pkg, res, self.resources)
                self.skip(topic.title if topic and topic.title else res.id, None, "A discussion or announcement" + not_in_module)

    def result(self) -> S.ImportResult:
        lessons = [d.lesson for d in self.lessons]
        files = []
        for path, users in sorted(self.files_used.items()):
            lower = path.lower()
            kind = "pdf" if lower.endswith(".pdf") else "image" if re.search(r"\.(png|jpe?g|gif|webp|svg)$", lower) else "file"
            files.append(S.PackagedFile(path=path, label=path.rsplit("/", 1)[-1], type=kind,
                                        size_bytes=self.pkg.size(path), used_by=[u for u in users if not u.startswith("module:")]))
        summary = S.Summary(
            modules=len(self.modules), lessons=len(lessons),
            with_video=sum(1 for l in lessons if l.content.format == "video"),
            with_reading=sum(1 for l in lessons if l.content.format == "reading" and l.content.body),
            with_assignment=sum(1 for l in lessons if l.assignment),
            videos_found=sum(len(l.content.other_videos) + (1 if l.content.youtube_id else 0) for l in lessons),
            files_to_upload=len(files), quizzes=sum(1 for l in lessons if l.assignment and l.assignment.kind == "quiz"),
            quizzes_not_imported=len(self.unmapped), skipped=len(self.skipped),
        )
        return S.ImportResult(course=S.CourseOut(title=clip(self.title, 160), modules=self.modules), lessons=lessons,
                              unmapped=self.unmapped, files=files, skipped=self.skipped, summary=summary)


def map_cartridge(pkg: Package, include_unpublished: bool = False) -> S.ImportResult:
    return _Builder(pkg, include_unpublished).run()
