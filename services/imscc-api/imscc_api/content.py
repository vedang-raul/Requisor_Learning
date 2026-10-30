"""Turning a Canvas page (HTML) into lesson material.

Canvas pages built with the "evercourse" design tools wrap content in template
tables (class ``esComponent-<kind>``): a title row naming the component, then
rows of ``key-<field>`` label / value pairs, plus author instructions written
between ``## ... ##``. This module unwraps those into plain content, drops the
template's labels and instructions, and converts what's left into the
Markdown that Alma 41 reading lessons store in ``body``.

Along the way it collects what other wizard steps need: YouTube videos
(including the template's escaped ``{{<iframe ...>}}`` embeds), images and files
packed in the export (``$IMS-CC-FILEBASE$/...``), web links, and summary
callouts that read as key takeaways.
"""
from __future__ import annotations

import html as htmllib
import re
from dataclasses import dataclass, field
from urllib.parse import unquote

from bs4 import BeautifulSoup, NavigableString, Tag

FILEBASE = "$IMS-CC-FILEBASE$"
YOUTUBE = re.compile(
    r"(?:youtube(?:-nocookie)?\.com/(?:embed/|watch\?(?:[^\"'<>\s]*&)?v=|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})")
INSTRUCTION = re.compile(r"##[^#]*?##")
PLACEHOLDERS = {"link1", "link2", "link3", "transcript", "slides", "options", "image", "title"}
CANVAS_REF = re.compile(r"\$(CANVAS_OBJECT_REFERENCE|WIKI_REFERENCE|CANVAS_COURSE_REFERENCE)\$")


@dataclass
class Link:
    label: str
    url: str


@dataclass
class PageContent:
    body: str = ""                                  # Markdown
    words: int = 0
    youtube_ids: list[str] = field(default_factory=list)
    video_titles: dict[str, str] = field(default_factory=dict)   # id → title from its video box
    images: list[str] = field(default_factory=list)       # package paths
    files: list[Link] = field(default_factory=list)       # package paths in url
    links: list[Link] = field(default_factory=list)       # https links
    takeaways: list[str] = field(default_factory=list)
    knowledge_checks: int = 0


def package_path(src: str) -> str | None:
    """$IMS-CC-FILEBASE$/Images/a%20b.png → web_resources/Images/a b.png"""
    src = htmllib.unescape(src or "").strip()
    if not src.startswith(FILEBASE):
        return None
    rest = unquote(src[len(FILEBASE):].split("?", 1)[0]).lstrip("/")
    return f"web_resources/{rest}" if rest else None


def _clean(s: str) -> str:
    s = INSTRUCTION.sub(" ", s.replace("\xa0", " "))
    return re.sub(r"[ \t\r\f\v]+", " ", s).strip()


class _Collector:
    def __init__(self) -> None:
        self.out = PageContent()

    def video(self, ident: str) -> None:
        if ident not in self.out.youtube_ids:
            self.out.youtube_ids.append(ident)

    def scan_text_for_videos(self, s: str) -> None:
        for m in YOUTUBE.finditer(htmllib.unescape(s)):
            self.video(m.group(1))


# ── Unwrapping the template components ──────────────────────────────────────
def _rows(table: Tag) -> list[tuple[str, Tag]]:
    """(field, value <td>) for a component table's key rows, in order. A field can repeat (a box of several videos)."""
    rows: list[tuple[str, Tag]] = []
    for row in table.find_all("tr"):
        key = row.find("td", class_=re.compile(r"^key-"))
        if not key:
            continue
        cells = row.find_all("td")
        if len(cells) >= 2:
            name = next(c for c in key.get("class", []) if c.startswith("key-"))[4:]
            rows.append((name, cells[1]))
    return rows


def _value_cells(table: Tag) -> dict[str, Tag]:
    """{field: value <td>}, first of each."""
    values: dict[str, Tag] = {}
    for name, cell in _rows(table):
        values.setdefault(name, cell)
    return values


def _component_label(table: Tag) -> str:
    th = table.find("th")
    return _clean(th.get_text(" ")) if th else ""


def _meaningful(cell: Tag | None) -> bool:
    if cell is None:
        return False
    if cell.find(["img", "iframe", "a", "li"]):
        return True
    t = _clean(cell.get_text(" ")).lower()
    return bool(t) and t not in PLACEHOLDERS


def _new(soup: BeautifulSoup, name: str, content: str | Tag | None = None) -> Tag:
    el = soup.new_tag(name)
    if isinstance(content, str):
        el.string = content
    elif content is not None:
        el.append(content)
    return el


def _unwrap_components(soup: BeautifulSoup, col: _Collector) -> None:
    for table in list(soup.find_all("table", class_=re.compile(r"esComponent-"))):
        kind = next((c[len("esComponent-"):] for c in table.get("class", []) if c.startswith("esComponent-")), "")
        label = _component_label(table)
        v = _value_cells(table)
        parts: list[Tag] = []

        def text_of(name: str) -> str:
            return _clean(v[name].get_text(" ")) if _meaningful(v.get(name)) else ""

        def move(name: str) -> None:
            cell = v.get(name)
            if _meaningful(cell):
                wrapper = soup.new_tag("div")
                for c in list(cell.contents):
                    wrapper.append(c.extract())
                parts.append(wrapper)

        if kind in ("esPresentationMainHeader", "esPresentationSectionHeader", "sectionDivider"):
            title = text_of("title")
            if title:
                parts.append(_new(soup, "h2" if kind != "esPresentationMainHeader" else "h1", title))
            elif kind == "sectionDivider":
                parts.append(soup.new_tag("hr"))
            # Banner images are decoration: not carried into the reading.
        elif kind == "callout":
            title = text_of("title")
            if "summary" in label.lower() or "takeaway" in title.lower() or "summary" in title.lower():
                col.out.takeaways.extend(_takeaway_lines(v.get("content")))
            if title:
                parts.append(_new(soup, "h3", title))
            move("content")
        elif kind == "captionedImage":
            move("image")
            caption = text_of("caption")
            if caption:
                parts.append(_new(soup, "p", _new(soup, "em", caption)))
        elif kind == "quoteBox":
            quote = text_of("quote")
            if quote:
                source = text_of("source")
                parts.append(_new(soup, "blockquote", f"{quote}{' — ' + source if source else ''}"))
        elif kind == "contentModal":
            question = text_of("launcherText")
            if question:
                col.out.knowledge_checks += 1
                p = _new(soup, "p", _new(soup, "strong", "Knowledge check: "))
                p.append(" " + question)
                parts.append(p)
                answer = soup.new_tag("p")
                answer.append(_new(soup, "em", "Answer: "))
                parts.append(answer)
                move("body")
        elif kind == "videoBoxWithLinks":
            titles: list[str] = []
            ids: list[str] = []
            for name, cell in _rows(table):
                if name == "iframe":
                    found = [m.group(1) for m in YOUTUBE.finditer(htmllib.unescape(str(cell)))]
                    ids.extend(found)
                    for ident in found:
                        col.video(ident)
                elif name == "title" and _meaningful(cell):
                    titles.append(_clean(cell.get_text(" ")))
                    parts.append(_new(soup, "h3", titles[-1]))
                elif name in ("transcript", "slides", "otherLinks"):
                    for a in cell.find_all("a"):
                        parts.append(_new(soup, "p", a.extract()))
            if titles and len(titles) == len(ids):  # one title per video: name them
                for ident, title in zip(ids, titles):
                    col.out.video_titles.setdefault(ident, title)
        elif kind == "moduleObjectives":
            pass  # filled in by Canvas at display time; empty in exports
        else:
            for name in v:
                if name != "options":
                    move(name)

        if parts:
            holder = soup.new_tag("div")
            for p in parts:
                holder.append(p)
            table.replace_with(holder)
        else:
            table.decompose()


def _takeaway_lines(cell: Tag | None) -> list[str]:
    if cell is None:
        return []
    items = [_clean(li.get_text(" ")) for li in cell.find_all("li")]
    if not items:
        text = _clean(cell.get_text(" "))
        items = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 20]
    return [i[:500] for i in items if i][:8]


# ── HTML → Markdown ──────────────────────────────────────────────────────────
def _inline(node, col: _Collector) -> str:
    if isinstance(node, NavigableString):
        if node.__class__.__name__ in ("Comment", "Doctype", "Declaration", "ProcessingInstruction"):
            return ""
        s = str(node)
        if "iframe" in s or "youtu" in s:
            col.scan_text_for_videos(s)
            if "{{" in s or "<iframe" in htmllib.unescape(s):
                return ""
        return INSTRUCTION.sub(" ", s.replace("\xa0", " "))
    if not isinstance(node, Tag):
        return ""
    name = node.name
    if name in ("script", "style", "caption", "head", "title", "meta"):
        return ""
    if name == "br":
        return "\n"
    if name == "iframe":
        col.scan_text_for_videos(node.get("src", ""))
        return ""
    if name == "img":
        path = package_path(node.get("src", ""))
        if path:
            if path not in col.out.images:
                col.out.images.append(path)
            alt = _clean(node.get("alt", "")) or "Image"
            return f"![{alt}]({path})"
        src = node.get("src", "")
        return f"![{_clean(node.get('alt', '')) or 'Image'}]({src})" if src.startswith("https://") else ""
    inner = "".join(_inline(c, col) for c in node.children)
    if name in ("strong", "b"):
        t = inner.strip()
        return f"**{t}**" if t else ""
    if name in ("em", "i"):
        t = inner.strip()
        return f"*{t}*" if t else ""
    if name == "code":
        return f"`{inner.strip()}`" if inner.strip() else ""
    if name == "a":
        href = htmllib.unescape(node.get("href", "")).strip()
        label = _clean(inner) or _clean(node.get("title", "")) or href
        if YOUTUBE.search(href):
            col.scan_text_for_videos(href)
        path = package_path(href)
        if path:
            name_ = label if label != href else path.rsplit("/", 1)[-1]
            if all(f.url != path for f in col.out.files):
                col.out.files.append(Link(name_[:200], path))
            return f"[{label}]({path})"
        if href.startswith("https://") or href.startswith("http://"):
            if all(l.url != href for l in col.out.links):
                col.out.links.append(Link(label[:200], href))
            return f"[{label}]({href})"
        return label if not CANVAS_REF.search(href) else label  # links to other Canvas pages: keep the words
    return inner


BLOCKS = {"p", "div", "section", "article", "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
          "ul", "ol", "li", "blockquote", "hr", "table", "pre", "figure", "body", "html", "main", "tbody", "thead", "tr"}


def _blocks(node: Tag, col: _Collector, out: list[str], depth: int = 0) -> None:
    for c in node.children:
        if isinstance(c, Tag) and c.name in BLOCKS:
            name = c.name
            if name in ("h1", "h2", "h3", "h4", "h5", "h6"):
                t = _clean(_inline(c, col)).replace("**", "")
                if t:
                    out.append("#" * min(int(name[1]) + 1, 6) + " " + t)  # page title is the lesson title: start at ##
            elif name in ("ul", "ol"):
                n = 0
                for li in c.find_all("li", recursive=False):
                    n += 1
                    nested = [x for x in li.children if isinstance(x, Tag) and x.name in ("ul", "ol")]
                    for x in nested:
                        x.extract()
                    t = _clean(_inline(li, col))
                    if t:
                        out.append("  " * depth + (f"{n}. " if name == "ol" else "- ") + t)
                    for x in nested:
                        sub: list[str] = []
                        wrapper = BeautifulSoup("", "html.parser").new_tag("div")
                        wrapper.append(x)
                        _blocks(wrapper, col, sub, depth + 1)
                        out.extend(sub)
            elif name == "blockquote":
                t = _clean(_inline(c, col))
                if t:
                    out.append("> " + t)
            elif name == "hr":
                out.append("---")
            elif name == "pre":
                out.append("```\n" + c.get_text().strip("\n") + "\n```")
            elif name == "table":
                for row in c.find_all("tr"):
                    cells = [_clean(_inline(td, col)) for td in row.find_all(["td", "th"])]
                    if any(cells):
                        out.append("| " + " | ".join(cells) + " |")
            elif name == "p":
                t = _clean(_inline(c, col))
                if t and t.lower() not in PLACEHOLDERS:
                    out.append(t)
            else:
                _blocks(c, col, out, depth)
        else:
            t = _clean(_inline(c, col))
            if t and t.lower() not in PLACEHOLDERS:
                out.append(t)


def _join(lines: list[str]) -> str:
    out: list[str] = []
    for line in lines:
        is_item = bool(re.match(r"^\s*(?:- |\d+\. |\| )", line))
        prev_item = bool(out) and bool(re.match(r"^\s*(?:- |\d+\. |\| )", out[-1]))
        if out and not (is_item and prev_item):
            out.append("")
        out.append(line)
    text = "\n".join(out)
    text = re.sub(r"(?:\n---\n*){2,}", "\n---\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip("-\n ").strip()


def _takeaways_from_headings(soup: BeautifulSoup) -> list[str]:
    for h in soup.find_all(["h2", "h3", "h4", "strong"]):
        if re.search(r"key takeaways?|summary|in summary|what you('ll| will) learn|learning objectives", h.get_text(" "), re.I):
            nxt = h.find_next(["ul", "ol"])
            if nxt:
                items = [_clean(li.get_text(" ")) for li in nxt.find_all("li", recursive=False)]
                return [i[:500] for i in items if i][:8]
    return []


def convert_html(raw: str) -> PageContent:
    soup = BeautifulSoup(raw or "", "html.parser")
    col = _Collector()
    root = soup.body or soup
    _unwrap_components(soup, col)
    from_headings = _takeaways_from_headings(soup)
    lines: list[str] = []
    _blocks(root, col, lines)
    body = _join(lines)
    col.out.body = body
    col.out.words = len(re.findall(r"[A-Za-z0-9']+", re.sub(r"\]\([^)]*\)", "]", body)))
    seen: set[str] = set()
    col.out.takeaways = [t for t in col.out.takeaways + from_headings if not (t.lower() in seen or seen.add(t.lower()))][:8]
    return col.out


def plain_text(markdown: str) -> str:
    """Markdown → plain sentences (for descriptions and briefs)."""
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", markdown)
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"^#+\s*|^>\s*|^\s*(?:- |\d+\. )|\*\*|\*|`|^---$|^\|\s*|\s*\|$", "", t, flags=re.M)
    t = t.replace(" | ", " · ")
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def summary_line(markdown: str, limit: int = 300) -> str:
    """The first real paragraph (not a heading), cut at a sentence boundary."""
    prose = re.sub(r"^(?:#+ .*|---)$", "", markdown, flags=re.M)
    for para in re.split(r"\n\s*\n", plain_text(prose)):
        p = " ".join(para.split())
        if len(p) >= 40 and not p.lower().startswith(("knowledge check", "answer:")):
            if len(p) <= limit:
                return p
            cut = p[:limit]
            end = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "))
            return cut[: end + 1] if end > 80 else cut.rsplit(" ", 1)[0] + "…"
    return ""
