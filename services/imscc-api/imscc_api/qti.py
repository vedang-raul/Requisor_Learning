"""Canvas quizzes (QTI 1.2) → questions with their choices and correct answers.

Canvas exports the full quiz in non_cc_assessments/<id>.xml.qti and a reduced
Common Cartridge copy in <id>/assessment_qti.xml; the first is preferred.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .canvas import Resource, child, children, descendants, parse_xml, text
from .content import plain_text, convert_html
from .package import Package

SUPPORTED = {"multiple_choice_question", "true_false_question", "multiple_answers_question"}


@dataclass
class Choice:
    text: str
    correct: bool


@dataclass
class Question:
    type: str
    text: str
    points: float
    choices: list[Choice] = field(default_factory=list)
    supported: bool = True


@dataclass
class Quiz:
    title: str
    points: float | None
    questions: list[Question]


def _html_text(s: str) -> str:
    return plain_text(convert_html(s).body)


def _meta(item, label: str) -> str:
    for f in descendants(item, "qtimetadatafield"):
        if text(f, "fieldlabel") == label:
            return text(f, "fieldentry")
    return ""


def read_quiz(pkg: Package, res: Resource) -> Quiz | None:
    xml = pkg.read_text(f"non_cc_assessments/{res.id}.xml.qti")
    if xml is None:
        path = next((f for f in res.files if f.endswith(".xml") and "assessment" in f), res.href)
        xml = pkg.read_text(path) if path else None
    if not xml:
        return None
    root = parse_xml(xml, "a quiz")
    assessment = next(iter(descendants(root, "assessment")), None)
    title = (assessment.get("title") if assessment is not None else "") or "Quiz"
    questions = []
    total = 0.0
    for item in descendants(root, "item"):
        qtype = _meta(item, "question_type") or "unknown"
        points = float(_meta(item, "points_possible") or 0)
        total += points
        presentation = child(item, "presentation")
        stem = next((m for m in descendants(presentation, "mattext")), None) if presentation is not None else None
        question = Question(qtype, _html_text(stem.text or "") if stem is not None else "", points, supported=qtype in SUPPORTED)
        correct = {(v.text or "").strip() for v in descendants(item, "varequal")
                   if any(float(s.text or 0) > 0 for s in descendants(_parent_condition(item, v), "setvar"))}
        for label in descendants(item, "response_label"):
            mat = next(iter(descendants(label, "mattext")), None)
            question.choices.append(Choice(_html_text(mat.text or "") if mat is not None else "", label.get("ident", "") in correct))
        questions.append(question)
    return Quiz(title, total or None, questions)


def _parent_condition(item, varequal):
    for cond in descendants(item, "respcondition"):
        if varequal in list(cond.iter()):
            return cond
    return item
