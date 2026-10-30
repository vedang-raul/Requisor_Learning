/**
 * Canvas quizzes → Alma 41 quizzes, in the browser (the in-app Canvas import,
 * src/lib/courses/canvas-import.ts). Mirrors services/imscc-api/imscc_api/qti.py.
 *
 * Canvas keeps a quiz's questions in non_cc_assessments/<id>.xml.qti (QTI 1.2)
 * and its settings in <id>/assessment_meta.xml. The result goes through
 * checkQuiz() on the server like any quiz a tutor saves.
 */
import type { NumericAnswer, Question, QuestionType, QuizSettings } from "@/lib/quiz/quiz";

const TYPES: Record<string, QuestionType> = {
  multiple_choice_question: "multiple_choice",
  true_false_question: "true_false",
  multiple_answers_question: "multiple_answers",
  short_answer_question: "short_answer",
  fill_in_multiple_blanks_question: "fill_in_multiple_blanks",
  multiple_dropdowns_question: "multiple_dropdowns",
  matching_question: "matching",
  numerical_question: "numerical",
  essay_question: "essay",
  text_only_question: "text_only",
};
const UNSUPPORTED: Record<string, string> = { calculated_question: "formula", file_upload_question: "file upload" };

export type CanvasQuiz = { title: string; points: number; settings: QuizSettings; questions: Question[]; skipped: string[] };

const local = (el: Element) => el.localName || el.nodeName.replace(/^.*:/, "");
const all = (root: Element | Document | null | undefined, name: string): Element[] =>
  root ? Array.from(root.getElementsByTagName("*")).filter((e) => local(e) === name) : [];
const first = (root: Element | Document | null | undefined, name: string) => all(root, name)[0] ?? null;
const kids = (el: Element | null, name: string) => (el ? Array.from(el.children).filter((c) => local(c) === name) : []);
const txt = (el: Element | null | undefined) => (el?.textContent ?? "").trim();
const num = (s: string | null | undefined, d = 0) => { const n = Number(s); return s && Number.isFinite(n) ? n : d; };

/** HTML (as Canvas stores it, escaped inside XML) → plain text. */
export function htmlText(html: string): string {
  if (!html.trim()) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
  doc.querySelectorAll("p,li,h1,h2,h3,h4,h5,h6,div").forEach((b) => b.append("\n"));
  return (doc.body.textContent ?? "").replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}

function meta(item: Element, label: string): string {
  const field = all(item, "qtimetadatafield").find((f) => txt(first(f, "fieldlabel")) === label);
  return field ? txt(first(field, "fieldentry")) : "";
}
const mattext = (el: Element | null) => htmlText(txt(first(el, "mattext")));

/** Conditions that award points. */
const scoring = (item: Element) => all(item, "respcondition").filter((c) => all(c, "setvar").some((s) => num(txt(s)) > 0));

/** Choice idents named in point-awarding conditions, except inside <not>. */
function rightIds(item: Element, respident?: string): Set<string> {
  const out = new Set<string>();
  for (const cond of scoring(item)) {
    const negated = new Set(all(cond, "not").flatMap((n) => all(n, "varequal")));
    for (const v of all(cond, "varequal")) {
      if (negated.has(v) || (respident && v.getAttribute("respident") !== respident)) continue;
      out.add(txt(v));
    }
  }
  return out;
}
const labels = (lid: Element) => all(lid, "response_label").map((l) => ({ ident: l.getAttribute("ident") ?? "", text: mattext(l) }));

function feedback(item: Element): Question["feedback"] {
  const fb: NonNullable<Question["feedback"]> = {};
  for (const f of all(item, "itemfeedback")) {
    const t = mattext(f).slice(0, 2000);
    if (!t) continue;
    const id = f.getAttribute("ident");
    if (id === "correct_fb") fb.correct = t;
    else if (id === "general_incorrect_fb") fb.incorrect = t;
    else if (id === "general_fb") fb.general = t;
  }
  return Object.keys(fb).length ? fb : undefined;
}

function question(item: Element, n: number): Question | string {
  const ctype = meta(item, "question_type");
  if (UNSUPPORTED[ctype]) return `Question ${n}: ${UNSUPPORTED[ctype]} questions aren't supported yet`;
  const type = TYPES[ctype];
  if (!type) return `Question ${n}: unknown question type (${ctype || "none"})`;
  const presentation = first(item, "presentation");
  const stem = presentation ? kids(presentation, "material")[0] ?? null : null;
  const q: Question = { id: `q${n}`, type, text: (mattext(stem) || "(no question text)").slice(0, 5000), points: type === "text_only" ? 0 : num(meta(item, "points_possible")) };
  const fb = feedback(item);
  if (fb) q.feedback = fb;
  const lids = all(presentation, "response_lid");

  if (type === "multiple_choice" || type === "true_false" || type === "multiple_answers") {
    const right = rightIds(item);
    q.choices = (lids[0] ? labels(lids[0]) : []).map((l, i) => {
      const lower = l.text.trim().toLowerCase();
      const id = type === "true_false" && (lower === "true" || lower === "false") ? lower : `c${i + 1}`;
      return { id, text: (l.text || `Answer ${i + 1}`).slice(0, 1000), correct: right.has(l.ident) };
    });
  } else if (type === "short_answer") {
    q.answers = [...new Set(scoring(item).flatMap((c) => all(c, "varequal").map(txt)).filter(Boolean))].map((a) => a.slice(0, 1000));
  } else if (type === "fill_in_multiple_blanks") {
    q.blanks = lids.map((lid) => ({
      name: mattext(kids(lid, "material")[0] ?? null) || (lid.getAttribute("ident") ?? "").replace("response_", ""),
      answers: labels(lid).map((l) => l.text.slice(0, 1000)).filter(Boolean),
    }));
  } else if (type === "multiple_dropdowns") {
    q.dropdowns = lids.map((lid) => {
      const name = mattext(kids(lid, "material")[0] ?? null) || (lid.getAttribute("ident") ?? "").replace("response_", "");
      const right = rightIds(item, lid.getAttribute("ident") ?? undefined);
      const key = name.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20) || "d";
      return { name, choices: labels(lid).map((l, i) => ({ id: `${key}-${i + 1}`, text: l.text.slice(0, 1000), correct: right.has(l.ident) })) };
    });
  } else if (type === "matching") {
    const options = new Map<string, string>();
    for (const lid of lids) for (const l of labels(lid)) if (!options.has(l.ident)) options.set(l.ident, l.text);
    const used = new Set<string>();
    q.pairs = lids.map((lid, i) => {
      const right = [...rightIds(item, lid.getAttribute("ident") ?? undefined)].map((r) => options.get(r)).find(Boolean) ?? "";
      used.add(right);
      return { id: `p${i + 1}`, left: mattext(kids(lid, "material")[0] ?? null).slice(0, 1000), right: right.slice(0, 1000) };
    });
    const extra = [...new Set(options.values())].filter((t) => t && !used.has(t));
    if (extra.length) q.distractors = extra.slice(0, 30);
  } else if (type === "numerical") {
    q.numeric = scoring(item).flatMap((cond): NumericAnswer[] => {
      const eq = first(cond, "varequal"), gte = first(cond, "vargte"), lte = first(cond, "varlte");
      if (eq) return [{ kind: "exact", value: num(txt(eq)), margin: gte && lte ? Math.abs((num(txt(lte)) - num(txt(gte))) / 2) : 0 }];
      if (gte && lte) return [{ kind: "range", min: num(txt(gte)), max: num(txt(lte)) }];
      return [];
    });
  }
  return q;
}

/** Canvas stores due times in UTC; an end-of-day due in the Americas lands early the next UTC morning. */
function endOfDay(dueAt: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})/.exec(dueAt);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number(m[4]) < 12) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function settingsFrom(metaDoc: Document | null, instructions: string): QuizSettings {
  const get = (name: string) => (metaDoc ? txt(kids(metaDoc.documentElement, name)[0] ?? null) : "");
  const attempts = get("allowed_attempts") ? num(get("allowed_attempts"), 1) : 1;
  const limit = num(get("time_limit"));
  const policy = get("scoring_policy");
  const oneAtATime = get("one_question_at_a_time") === "true";
  return {
    instructions: instructions.slice(0, 10_000),
    timeLimitMin: limit > 0 ? Math.round(limit) : null,
    allowedAttempts: attempts < 0 ? null : Math.max(1, Math.round(attempts)),
    scoringPolicy: policy === "keep_latest" || policy === "keep_average" ? policy : "keep_highest",
    shuffleAnswers: get("shuffle_answers") === "true",
    shuffleQuestions: get("shuffle_questions") === "true",
    oneQuestionAtATime: oneAtATime,
    cantGoBack: oneAtATime && get("cant_go_back") === "true",
    showResults: get("hide_results") !== "always",
    showCorrectAnswers: get("show_correct_answers") !== "true" ? "never" : get("show_correct_answers_last_attempt") === "true" ? "after_last_attempt" : "after_each_attempt",
    dueDate: endOfDay(get("due_at")),
  };
}

/** The quiz from its QTI document and (optional) assessment_meta.xml document. */
export function canvasQuiz(qti: Document, metaDoc: Document | null): CanvasQuiz {
  const assessment = first(qti, "assessment");
  const title = (metaDoc ? txt(kids(metaDoc.documentElement, "title")[0] ?? null) : "") || assessment?.getAttribute("title") || "Quiz";
  const instructions = metaDoc ? htmlText(txt(kids(metaDoc.documentElement, "description")[0] ?? null)) : "";
  const questions: Question[] = [];
  const skipped: string[] = [];
  all(qti, "item").forEach((item, i) => {
    const q = question(item, i + 1);
    if (typeof q === "string") skipped.push(q);
    else questions.push({ ...q, id: `q${questions.length + 1}` });
  });
  if (all(qti, "selection_number").length) skipped.push("This quiz draws random questions from a group; every question in the group was brought in");
  const metaPoints = metaDoc ? num(txt(kids(metaDoc.documentElement, "points_possible")[0] ?? null)) : 0;
  return { title, points: metaPoints || questions.reduce((s, q) => s + q.points, 0), settings: settingsFrom(metaDoc, instructions), questions, skipped };
}
