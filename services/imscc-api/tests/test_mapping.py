import os

import pytest

from imscc_api.mapper import map_cartridge
from imscc_api.package import Package

from .conftest import FILES, make_zip


@pytest.fixture
def result(cartridge):
    return map_cartridge(Package(cartridge))


def lesson(result, title):
    return next(l for l in result.lessons if l.details.title == title)


def test_course_and_modules(result):
    assert result.course.title == "AI at Work"
    assert [m.title for m in result.course.modules] == ["Module 1: Getting started"]
    assert [l.details.title for l in result.lessons] == ["M1: Welcome video", "M1: Why AI at work", "M1: Deep dive", "M1: Assignment—Map your workflow"]
    assert all(l.details.section == "Module 1: Getting started" for l in result.lessons)


def test_short_page_with_a_video_is_a_video_lesson(result):
    l = lesson(result, "M1: Welcome video")
    assert l.content.format == "video"
    assert l.content.youtube_id == "AbCdEfGhIjK"          # the template's escaped {{<iframe>}}
    assert l.content.body is None
    assert "short welcome" in l.details.description       # the page's words become the description
    assert l.assignment is None


def test_long_page_is_a_clean_reading(result):
    l = lesson(result, "M1: Why AI at work")
    c = l.content
    assert c.format == "reading" and c.youtube_id is None
    assert not c.body.startswith("## Why AI at work")       # the title isn't repeated
    assert "Teams use AI tools" in c.body
    assert "**Knowledge check:** What should you automate first?" in c.body
    assert "##" not in c.body.replace("### ", "").replace("## ", "")  # no "## author instructions ##"
    for clutter in ("Options", "Callout (Summary)", "Launcher Text", "Body Content"):
        assert clutter not in c.body
    assert "![Adoption chart](web_resources/Images/chart.png)" in c.body
    assert c.images == ["web_resources/Images/chart.png"]
    assert c.other_videos == []
    assert l.details.duration_min >= 5 and l.details.duration_min % 5 == 0
    assert l.details.description.startswith("Teams use AI tools")


def test_a_page_with_video_and_long_reading_is_a_video_lesson(result):
    l = lesson(result, "M1: Deep dive")
    c = l.content
    assert c.format == "video" and c.youtube_id == "ZyXwVuTsRqP" and c.body is None
    assert c.other_videos == ["QwErTyUiOpA"]
    # The reading becomes the description: whole paragraphs, up to the 2000-character limit.
    d = l.details.description
    assert d.startswith("Short opening paragraph") and len(d) <= 2000
    assert "Teams use AI tools" not in d            # the next paragraph (2,800 characters) doesn't fit whole
    assert any("didn't fit" in n for n in l.notes)
    assert "Teams use AI tools" in c.full_reading   # nothing is lost
    res = {r.label: r for r in l.takeaways_and_resources.resources}
    assert res["More video 1"].url == "https://www.youtube.com/watch?v=QwErTyUiOpA"


def test_a_short_reading_fits_the_description_whole(result):
    l = lesson(result, "M1: Welcome video")
    paragraphs = l.details.description.split(chr(10) * 2)
    assert paragraphs == ["Start here: a short welcome to the course and how it works.", "Welcome from your tutor"]
    assert not any("didn't fit" in n for n in l.notes)


def test_takeaways_and_resources(result):
    l = lesson(result, "M1: Why AI at work")
    assert l.takeaways_and_resources.key_takeaways == ["AI drafts, people decide", "Start with one workflow"]
    res = {r.label: r for r in l.takeaways_and_resources.resources}
    assert res["2026 report"].url == "https://example.com/report"
    guide = res["guide book"]
    assert guide.type == "pdf" and guide.url is None and guide.needs_upload and guide.package_path == "web_resources/Docs/guide book.pdf"


def test_assignment_step(result):
    l = lesson(result, "M1: Assignment—Map your workflow")
    a = l.assignment
    assert a.assignment.startswith("Your task")
    assert a.requires_submission is True
    assert a.assignment_marks == 25
    assert a.assignment_due_date == "2026-05-24"          # the date Canvas showed, not the UTC timestamp
    assert a.grade_with == "rubric"
    assert [(c.title, c.max_points) for c in a.rubric] == [("Clear map", 12), ("AI ideas", 8)]
    assert any("totals 20 points" in n for n in l.notes)


def test_module_files_and_links_attach_to_the_lesson_before_them(result):
    l = lesson(result, "M1: Assignment—Map your workflow")
    labels = [r.label for r in l.takeaways_and_resources.resources]
    assert labels == ["Guide book.pdf", "Prompting guide"]


def test_quizzes_are_kept_aside_whole(result):
    [quiz] = result.unmapped
    assert quiz.title == "M1: Quiz" and quiz.after_lesson == "m1-assignment-map-your-workflow"
    q = quiz.questions[0]
    assert q.text == "What does LLM stand for?" and q.points == 5
    assert [(c.text, c.correct) for c in q.choices] == [("Large Language Model", True), ("Long Learning Machine", False)]


def test_skipped_items_say_why(result):
    reasons = {s.title: s.reason for s in result.skipped}
    assert "Unpublished module" in reasons["Teachers only"]
    assert "heading" in reasons["Week 1"]
    assert "Unpublished item" in reasons["Draft page"]
    assert "isn't in any module" in reasons["Old course page"]
    assert all("Secret" not in l.details.title for l in result.lessons)


def test_unpublished_content_on_request(cartridge):
    titles = [l.details.title for l in map_cartridge(Package(cartridge), include_unpublished=True).lessons]
    assert "Secret notes" in titles and "Draft page" in titles


def test_files_to_upload(result):
    assert {(f.path, f.type) for f in result.files} == {("web_resources/Docs/guide book.pdf", "pdf"), ("web_resources/Images/chart.png", "image")}
    assert result.summary.files_to_upload == 2


def test_values_fit_alma_limits(result):
    for l in result.lessons:
        assert 1 <= len(l.details.title) <= 200 and 1 <= len(l.details.description) <= 2000
        assert 1 <= l.details.duration_min <= 1440
        assert l.content.body is None or len(l.content.body) <= 20000
        assert len(l.takeaways_and_resources.key_takeaways) <= 20 and len(l.takeaways_and_resources.resources) <= 20
        for r in l.takeaways_and_resources.resources:
            assert (r.url or "").startswith("https://") or r.needs_upload


def test_json_uses_the_wizard_field_names(result):
    data = result.model_dump(by_alias=True)
    l = next(x for x in data["lessons"] if x["assignment"])
    assert set(l) >= {"details", "content", "assignment", "takeawaysAndResources"}
    assert set(l["assignment"]) >= {"assignment", "requiresSubmission", "assignmentMarks", "assignmentDueDate"}
    assert "durationMin" in l["details"] and "keyTakeaways" in l["takeawaysAndResources"]


def test_a_rezipped_export_is_read_from_its_folder():
    result = map_cartridge(Package(make_zip(FILES, prefix="course-export/")))
    assert len(result.lessons) == 4


SAMPLE = os.environ.get("IMSCC_SAMPLE")


@pytest.mark.skipif(not SAMPLE or not os.path.exists(SAMPLE or ""), reason="set IMSCC_SAMPLE to a real Canvas export")
def test_real_export():
    with open(SAMPLE, "rb") as f:
        result = map_cartridge(Package(f.read()))
    assert result.lessons and result.course.modules
    for l in result.lessons:
        assert l.content.body is None or "## Enter iframe" not in l.content.body
