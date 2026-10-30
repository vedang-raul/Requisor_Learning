"""Canvas quizzes (QTI 1.2 + assessment_meta.xml) → Alma 41 quizzes.

The result has exactly the shape of Alma 41's Quiz (src/lib/quiz/quiz.ts):
{ settings: {...}, questions: [...] }, so it goes straight into a lesson's
assignment step as a quiz.

Canvas keeps the full quiz in non_cc_assessments/<id>.xml.qti and its settings
in <id>/assessment_meta.xml. Question types handled: multiple choice, true/false,
multiple answers, short answer (fill in the blank), fill in multiple blanks,
multiple dropdowns, matching, numerical, essay and text-only. Formula,
file-upload and other types are reported, not guessed.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from xml.etree.ElementTree import Element

from .canvas import Resource, child, children, descendants, parse_xml, text
from .content import convert_html, plain_text
from .package import Package

TYPES = {
    "multiple_choice_question": "multiple_choice",
    "true_false_question": "true_false",
    "multiple_answers_question": "multiple_answers",
    "short_answer_question": "short_answer",
    "fill_in_multiple_blanks_question": "fill_in_multiple_blanks",
    "multiple_dropdowns_question": "multiple_dropdowns",
    "matching_question": "matching",
    "numerical_question": "numerical",
    "essay_question": "essay",
    "text_only_question": "text_only",
}
UNSUPPORTED = {"calculated_question": "formula", "file_upload_question": "file upload"}


@dataclass
class Quiz:
    title: str
    points: float | None
    description: str                      # Markdown
    settings: dict
    questions: list[dict]
    skipped: list[str] = field(default_factory=list)   # "Question 4: formula questions aren't supported"


def _md(html: str) -> str:
    return convert_html(html or "").body


def _plain(html: str) -> str:
    return plain_text(_md(html))


def _mattext(el: Element | None) -> str:
    node = next(iter(descendants(el, "mattext")), None) if el is not None else None
    return (node.text or "") if node is not None else ""


def _meta(item: Element, label: str) -> str:
    for f in descendants(item, "qtimetadatafield"):
        if text(f, "fieldlabel") == label:
            return text(f, "fieldentry")
    return ""


def _float(s: str | None, default: float = 0.0) -> float:
    try:
        return float(s) if s not in (None, "") else default
    except ValueError:
        return default


def _scoring_conditions(item: Element) -> list[Element]:
    """respconditions that award points (setvar > 0)."""
    out = []
    for cond in descendants(item, "respcondition"):
        if any(_float(s.text) > 0 for s in descendants(cond, "setvar")):
            out.append(cond)
    return out


def _right_ids(item: Element, respident: str | None = None) -> set[str]:
    """Choice idents named in point-awarding conditions, except inside <not>."""
    right: set[str] = set()
    for cond in _scoring_conditions(item):
        negated = {id(v) for n in descendants(cond, "not") for v in descendants(n, "varequal")}
        for v in descendants(cond, "varequal"):
            if id(v) in negated:
                continue
            if respident and v.get("respident") != respident:
                continue
            right.add((v.text or "").strip())
    return right


def _labels(lid: Element) -> list[tuple[str, str]]:
    return [(lab.get("ident", ""), _plain(_mattext(lab))) for lab in descendants(lid, "response_label")]


def _feedback(item: Element) -> dict:
    fb: dict[str, str] = {}
    for f in descendants(item, "itemfeedback"):
        ident = f.get("ident", "")
        t = _plain(_mattext(f))
        if not t:
            continue
        if ident == "correct_fb":
            fb["correct"] = t[:2000]
        elif ident == "general_incorrect_fb":
            fb["incorrect"] = t[:2000]
        elif ident == "general_fb":
            fb["general"] = t[:2000]
    return fb


def _question(item: Element, n: int) -> tuple[dict | None, str | None]:
    ctype = _meta(item, "question_type")
    points = _float(_meta(item, "points_possible"))
    presentation = child(item, "presentation")
    stem_html = _mattext(child(presentation, "material")) if presentation is not None else ""
    if ctype in UNSUPPORTED:
        return None, f"Question {n}: {UNSUPPORTED[ctype]} questions aren't supported yet"
    qtype = TYPES.get(ctype)
    if not qtype:
        return None, f"Question {n}: unknown question type ({ctype or 'none'})"
    q: dict = {"id": f"q{n}", "type": qtype, "points": 0 if qtype == "text_only" else points}
    inline = qtype in ("fill_in_multiple_blanks", "multiple_dropdowns")
    # Blank and dropdown questions keep their [names] in plain text; others keep their formatting.
    q["text"] = (_plain(stem_html) if inline else _md(stem_html)).strip()[:5000] or "(no question text)"
    fb = _feedback(item)
    if fb:
        q["feedback"] = fb
    lids = descendants(presentation, "response_lid") if presentation is not None else []

    if qtype in ("multiple_choice", "true_false", "multiple_answers"):
        right = _right_ids(item)
        q["choices"] = [{"id": f"c{i + 1}", "text": t[:1000] or f"Answer {i + 1}", "correct": ident in right}
                        for i, (ident, t) in enumerate(_labels(lids[0]) if lids else [])]
        if qtype == "true_false":
            for c in q["choices"]:
                c["id"] = "true" if c["text"].strip().lower() == "true" else "false" if c["text"].strip().lower() == "false" else c["id"]
    elif qtype == "short_answer":
        q["answers"] = sorted({(v.text or "").strip()[:1000] for c in _scoring_conditions(item) for v in descendants(c, "varequal") if (v.text or "").strip()})
    elif qtype == "fill_in_multiple_blanks":
        # Every listed answer for a blank is accepted.
        q["blanks"] = [{"name": _plain(_mattext(child(lid, "material"))) or lid.get("ident", "").replace("response_", ""),
                        "answers": [t[:1000] for _, t in _labels(lid) if t]} for lid in lids]
    elif qtype == "multiple_dropdowns":
        dropdowns = []
        for lid in lids:
            name = _plain(_mattext(child(lid, "material"))) or lid.get("ident", "").replace("response_", "")
            right = _right_ids(item, lid.get("ident"))
            dropdowns.append({"name": name, "choices": [{"id": f"{re.sub(r'[^A-Za-z0-9_-]', '', name)[:20] or 'd'}-{i + 1}", "text": t[:1000], "correct": ident in right}
                                                         for i, (ident, t) in enumerate(_labels(lid))]})
        q["dropdowns"] = dropdowns
    elif qtype == "matching":
        pairs, used = [], set()
        options: dict[str, str] = {}
        for lid in lids:
            for ident, t in _labels(lid):
                options.setdefault(ident, t)
        for i, lid in enumerate(lids):
            right = _right_ids(item, lid.get("ident"))
            match = next((options[r] for r in right if r in options), "")
            used.add(match)
            pairs.append({"id": f"p{i + 1}", "left": _plain(_mattext(child(lid, "material")))[:1000], "right": match[:1000]})
        q["pairs"] = pairs
        extra = [t for t in dict.fromkeys(options.values()) if t and t not in used]
        if extra:
            q["distractors"] = extra[:30]
    elif qtype == "numerical":
        answers = []
        for cond in _scoring_conditions(item):
            eq = next(iter(descendants(cond, "varequal")), None)
            gte = next(iter(descendants(cond, "vargte")), None)
            lte = next(iter(descendants(cond, "varlte")), None)
            if eq is not None:
                value = _float(eq.text)
                margin = (_float(lte.text) - _float(gte.text)) / 2 if gte is not None and lte is not None else 0
                answers.append({"kind": "exact", "value": value, "margin": round(abs(margin), 10)})
            elif gte is not None and lte is not None:
                answers.append({"kind": "range", "min": _float(gte.text), "max": _float(lte.text)})
        q["numeric"] = answers
    return q, None


def _end_of_day(due_at: str) -> str | None:
    """Canvas stores due times in UTC; an end-of-day due in the Americas lands early the next UTC morning."""
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})T(\d{2})", due_at or "")
    if not m:
        return None
    d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return (d - timedelta(days=1) if int(m.group(4)) < 12 else d).isoformat()


def _settings(meta: Element | None, description: str) -> dict:
    get = lambda name: text(meta, name) if meta is not None else ""  # noqa: E731
    attempts = int(_float(get("allowed_attempts"), 1)) if get("allowed_attempts") else 1
    time_limit = int(_float(get("time_limit"))) if get("time_limit") else None
    show = get("show_correct_answers") == "true"
    hide = get("hide_results")
    policy = get("scoring_policy")
    return {
        "instructions": description[:10000],
        "timeLimitMin": time_limit if time_limit and time_limit > 0 else None,
        "allowedAttempts": None if attempts < 0 else max(1, attempts),
        "scoringPolicy": policy if policy in ("keep_highest", "keep_latest", "keep_average") else "keep_highest",
        "shuffleAnswers": get("shuffle_answers") == "true",
        "shuffleQuestions": get("shuffle_questions") == "true",
        "oneQuestionAtATime": get("one_question_at_a_time") == "true",
        "cantGoBack": get("one_question_at_a_time") == "true" and get("cant_go_back") == "true",
        "showResults": hide != "always",
        "showCorrectAnswers": "never" if not show else "after_last_attempt" if get("show_correct_answers_last_attempt") == "true" else "after_each_attempt",
        "dueDate": _end_of_day(get("due_at")),
    }


def read_quiz(pkg: Package, res: Resource) -> Quiz | None:
    xml = pkg.read_text(f"non_cc_assessments/{res.id}.xml.qti")
    if xml is None:
        path = next((f for f in res.files if f.endswith(".xml") and "assessment" in f), res.href)
        xml = pkg.read_text(path) if path else None
    if not xml:
        return None
    root = parse_xml(xml, "a quiz")
    assessment = next(iter(descendants(root, "assessment")), None)
    meta_xml = pkg.read_text(f"{res.id}/assessment_meta.xml")
    meta = parse_xml(meta_xml, "quiz settings") if meta_xml else None
    title = (text(meta, "title") if meta is not None else "") or (assessment.get("title") if assessment is not None else "") or "Quiz"
    description = _md(text(meta, "description")) if meta is not None else ""
    questions, skipped = [], []
    for n, item in enumerate(descendants(root, "item"), start=1):
        q, problem = _question(item, n)
        if problem:
            skipped.append(problem)
        elif q:
            q["id"] = f"q{len(questions) + 1}"
            questions.append(q)
    points = _float(text(meta, "points_possible")) if meta is not None else None
    if not points:
        points = sum(q["points"] for q in questions) or None
    if any(descendants(root, "selection_number")):
        skipped.append("This quiz draws random questions from a group; every question in the group was brought in")
    return Quiz(title=title, points=points, description=description, settings=_settings(meta, description),
                questions=questions, skipped=skipped)
