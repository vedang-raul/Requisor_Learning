"""The structured parts of a Canvas Common Cartridge export.

  imsmanifest.xml                  every resource: id, type, files
  course_settings/module_meta.xml  modules in order, their items, published state
  course_settings/course_settings.xml  the course title
  course_settings/rubrics.xml      rubrics: criteria with points
  <id>/assignment_settings.xml     an assignment's points, due date, submission type, rubric
  <id>.xml (imsdt)                 a discussion's prompt; its partner <id>.xml holds settings

XML is parsed with defusedxml (no entity expansion or external fetches), and
looked up by local tag name, so Canvas's namespaces don't matter.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from xml.etree.ElementTree import Element

from defusedxml import ElementTree as SafeET

from .package import Package, PackageError


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_xml(text: str, what: str) -> Element:
    try:
        return SafeET.fromstring(text.encode("utf-8"))
    except Exception as exc:  # defusedxml raises several types
        raise PackageError(f"Couldn't read {what}: {exc}") from exc


def child(el: Element | None, name: str) -> Element | None:
    if el is None:
        return None
    for c in el:
        if _local(c.tag) == name:
            return c
    return None


def children(el: Element | None, name: str) -> list[Element]:
    return [] if el is None else [c for c in el if _local(c.tag) == name]


def descendants(el: Element, name: str) -> list[Element]:
    return [d for d in el.iter() if _local(d.tag) == name]


def text(el: Element | None, name: str | None = None, default: str = "") -> str:
    node = child(el, name) if name else el
    return (node.text or "").strip() if node is not None and node.text else default


# ── Manifest ────────────────────────────────────────────────────────────────
@dataclass
class Resource:
    id: str
    type: str
    href: str
    files: list[str] = field(default_factory=list)


def parse_manifest(pkg: Package) -> tuple[str, dict[str, Resource]]:
    root = parse_xml(pkg.read_text("imsmanifest.xml") or "", "imsmanifest.xml")
    title = ""
    for t in descendants(root, "title"):
        s = child(t, "string")
        if s is not None and (s.text or "").strip():
            title = s.text.strip()
            break
    resources: dict[str, Resource] = {}
    for r in descendants(root, "resource"):
        rid = r.get("identifier") or ""
        if not rid:
            continue
        files = [f.get("href", "") for f in children(r, "file") if f.get("href")]
        resources[rid] = Resource(rid, r.get("type", ""), r.get("href", "") or (files[0] if files else ""), files)
    settings = pkg.read_text("course_settings/course_settings.xml")
    if settings:
        t = text(parse_xml(settings, "course_settings.xml"), "title")
        title = t or title
    return title or "Imported course", resources


# ── Modules ─────────────────────────────────────────────────────────────────
@dataclass
class ModuleItem:
    id: str
    title: str
    content_type: str
    ref: str
    url: str
    published: bool
    position: int


@dataclass
class Module:
    id: str
    title: str
    published: bool
    position: int
    items: list[ModuleItem]


def _int(value: str, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def parse_modules(pkg: Package) -> list[Module]:
    xml = pkg.read_text("course_settings/module_meta.xml")
    if not xml:
        return []
    root = parse_xml(xml, "module_meta.xml")
    modules = []
    for m in descendants(root, "module"):
        items = [
            ModuleItem(
                id=i.get("identifier", ""),
                title=text(i, "title"),
                content_type=text(i, "content_type"),
                ref=text(i, "identifierref"),
                url=text(i, "url"),
                published=text(i, "workflow_state", "active") not in ("unpublished", "deleted"),
                position=_int(text(i, "position")),
            )
            for i in children(child(m, "items"), "item")
        ]
        items.sort(key=lambda i: i.position)
        modules.append(Module(m.get("identifier", ""), text(m, "title") or "Untitled module",
                              text(m, "workflow_state", "active") not in ("unpublished", "deleted"),
                              _int(text(m, "position")), items))
    modules.sort(key=lambda m: m.position)
    return modules


# ── Assignments, rubrics, discussions ───────────────────────────────────────
@dataclass
class AssignmentSettings:
    title: str
    points: float | None
    due_date: str | None          # YYYY-MM-DD, as the course showed it
    submission_types: list[str]
    rubric_ref: str
    grading_type: str


def parse_assignment_settings(el: Element) -> AssignmentSettings:
    points = text(el, "points_possible")
    due = text(el, "all_day_date") or text(el, "due_at")[:10]
    return AssignmentSettings(
        title=text(el, "title"),
        points=float(points) if points else None,
        due_date=due if len(due) == 10 and due[4] == "-" else None,
        submission_types=[s for s in text(el, "submission_types").split(",") if s],
        rubric_ref=text(el, "rubric_identifierref"),
        grading_type=text(el, "grading_type"),
    )


def read_assignment_settings(pkg: Package, res: Resource) -> AssignmentSettings | None:
    path = next((f for f in res.files if f.endswith("assignment_settings.xml")), None)
    xml = pkg.read_text(path) if path else None
    return parse_assignment_settings(parse_xml(xml, path)) if xml else None


@dataclass
class Criterion:
    title: str
    description: str
    points: float


@dataclass
class Rubric:
    id: str
    title: str
    points: float
    criteria: list[Criterion]


def parse_rubrics(pkg: Package) -> dict[str, Rubric]:
    xml = pkg.read_text("course_settings/rubrics.xml")
    if not xml:
        return {}
    out = {}
    for r in descendants(parse_xml(xml, "rubrics.xml"), "rubric"):
        criteria = [
            Criterion(text(c, "description") or "Criterion", text(c, "long_description"), float(text(c, "points") or 0))
            for c in children(child(r, "criteria"), "criterion")
        ]
        out[r.get("identifier", "")] = Rubric(r.get("identifier", ""), text(r, "title") or "Rubric",
                                             float(text(r, "points_possible") or 0), criteria)
    return out


@dataclass
class Discussion:
    title: str
    html: str
    graded: AssignmentSettings | None


def read_discussion(pkg: Package, res: Resource, resources: dict[str, Resource]) -> Discussion | None:
    xml = pkg.read_text(res.href or (res.files[0] if res.files else ""))
    if not xml:
        return None
    root = parse_xml(xml, "a discussion")
    graded = None
    # Canvas keeps settings in a partner resource that names this topic.
    for other in resources.values():
        if other.type.startswith("associatedcontent") and other.href.endswith(".xml") and other.href.count("/") == 0 and other.id != res.id:
            meta_xml = pkg.read_text(other.href)
            if not meta_xml or res.id not in meta_xml or "topicMeta" not in meta_xml:
                continue
            meta = parse_xml(meta_xml, "discussion settings")
            if text(meta, "topic_id") == res.id or meta.get("identifier") == res.id or res.id in meta_xml:
                assignment = child(meta, "assignment")
                graded = parse_assignment_settings(assignment) if assignment is not None else None
                break
    return Discussion(text(root, "title"), text(root, "text"), graded)
