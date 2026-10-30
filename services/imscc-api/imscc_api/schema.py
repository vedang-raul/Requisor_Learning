"""The API's response: a course outline and one draft per lesson, split by the
Alma 41 lesson wizard's steps.

  1 Details                 → details
  2 Video or text           → content
  3 Assignment              → assignment
  4 Takeaways & resources   → takeaways_and_resources
  5 Publish                 → nothing to fill: the tutor reviews and publishes

Field names inside each step match Alma 41's Lesson fields (camelCase in JSON),
so the app can copy them into the wizard as they are. Values already respect
Alma 41's limits (title ≤ 200, description ≤ 2000, body ≤ 20000, ≤ 20
takeaways and resources, marks 1–10000, dates YYYY-MM-DD).
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Source(Model):
    canvas_type: str = Field(description="Canvas item type: WikiPage, Assignment, DiscussionTopic…")
    canvas_id: str
    module: str | None
    position: int


class Details(Model):
    """Step 1."""
    title: str
    description: str
    duration_min: int = Field(ge=1, le=1440, description="Estimated from reading length and videos.")
    section: str | None = Field(description="The module this lesson goes in (Alma 41's Lesson.section).")


class Content(Model):
    """Step 2. A lesson is a video OR a reading in Alma 41: `format` picks one."""
    format: Literal["video", "reading"]
    youtube_id: str | None = Field(description="Set when format is video.")
    body: str | None = Field(description="Markdown reading; set when format is reading.")
    other_videos: list[str] = Field(description="Further YouTube ids on the page (also listed as resources).")
    images: list[str] = Field(description="Images the body uses: package paths to upload.")
    full_reading: str | None = Field(None, description="Video lessons: the page's whole reading (Markdown). "
                                     "details.description holds as much of it as fits in 2000 characters.")
    word_count: int


class RubricCriterion(Model):
    title: str
    description: str
    max_points: float


class Assignment(Model):
    """Step 3."""
    assignment: str = Field(description="The brief (plain text, ≤ 5000).")
    requires_submission: bool = Field(description="Learners hand in a file for grading.")
    assignment_marks: int | None
    assignment_due_date: str | None
    grade_with: Literal["rubric", "score"]
    rubric: list[RubricCriterion]


class Resource(Model):
    label: str
    type: Literal["pdf", "link", "file"]
    url: str | None = Field(description="https link; null for a file packed in the export (upload it first).")
    package_path: str | None = None
    needs_upload: bool = False


class TakeawaysAndResources(Model):
    """Step 4."""
    key_takeaways: list[str]
    resources: list[Resource]


class LessonDraft(Model):
    id: str
    source: Source
    details: Details
    content: Content
    assignment: Assignment | None
    takeaways_and_resources: TakeawaysAndResources
    notes: list[str] = Field(description="Anything the tutor should check before publishing.")


class ModuleOut(Model):
    title: str
    description: str | None = None


class CourseOut(Model):
    title: str
    modules: list[ModuleOut]


class QuizChoice(Model):
    text: str
    correct: bool


class QuizQuestion(Model):
    type: str
    text: str
    points: float
    choices: list[QuizChoice]
    supported: bool


class Unmapped(Model):
    """Material with no wizard step yet (for now: Canvas quizzes), kept so nothing is lost."""
    kind: Literal["quiz"]
    title: str
    module: str | None
    after_lesson: str | None = Field(description="Id of the lesson it followed in Canvas.")
    reason: str
    points: float | None = None
    questions: list[QuizQuestion] = []


class PackagedFile(Model):
    path: str
    label: str
    type: Literal["pdf", "file", "image"]
    size_bytes: int
    used_by: list[str] = Field(description="Lesson ids that use the file.")


class Skipped(Model):
    title: str
    module: str | None
    reason: str


class Summary(Model):
    modules: int
    lessons: int
    with_video: int
    with_reading: int
    with_assignment: int
    videos_found: int
    files_to_upload: int
    quizzes_kept_aside: int
    skipped: int


class ImportResult(Model):
    course: CourseOut
    lessons: list[LessonDraft]
    unmapped: list[Unmapped]
    files: list[PackagedFile]
    skipped: list[Skipped]
    summary: Summary
