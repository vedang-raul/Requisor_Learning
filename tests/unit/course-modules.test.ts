import { addModule, assignLesson, groupByModule, moduleList, moveLesson, moveModule, removeModule, updateModule } from "@/lib/courses/modules";
import { validateCourse } from "@/lib/courses/course-catalog";
import type { Course, Lesson } from "@/lib/types";

const lesson = (id: string, section?: string): Lesson => ({ id: `c-${id}`, title: id, description: id, youtubeId: "REPLACE_ME", durationMin: 10, resources: [], keyTakeaways: [], ...(section ? { section } : {}) });
const course = (lessons: Lesson[], modules?: Course["modules"]): Course => ({
  slug: "c", title: "C", tagline: "t", category: "study", level: "Beginner", tags: [], cover: "x", addedAt: "2026-10-28", lessons, ...(modules ? { modules } : {}),
});
const ids = (c: Course) => c.lessons.map((l) => l.id.slice(2));
const shape = (c: Course) => groupByModule(c).map((g) => `${g.title ?? "-"}: ${g.lessons.map((l) => l.id.slice(2)).join(",")}`);

describe("course modules", () => {
  it("turns older section names into modules and keeps declared ones first", () => {
    const c = course([lesson("a", "Intro"), lesson("b"), lesson("c", "Basics"), lesson("d", "intro")], [{ title: "Basics", description: "The basics." }]);
    expect(moduleList(c)).toEqual([{ title: "Basics", description: "The basics." }, { title: "Intro" }]);
    expect(shape(c)).toEqual(["Basics: c", "Intro: a,d", "-: b"]);
    expect(shape(course([lesson("a"), lesson("b")]))).toEqual(["-: a,b"]);
  });

  it("adds, renames, describes, moves and removes modules, keeping lessons in module order", () => {
    let c = course([lesson("a", "One"), lesson("b", "Two"), lesson("c", "One")]);
    expect(ids(addModule(c, "One"))).toEqual(ids(addModule(c, "one ")).slice()); // a duplicate name is ignored
    c = addModule(c, "Three", "Later");
    expect(moduleList(c).map((m) => m.title)).toEqual(["One", "Two", "Three"]);
    expect(ids(c)).toEqual(["a", "c", "b"]);
    c = updateModule(c, "One", { title: "First", description: "Start here" });
    expect(c.lessons.filter((l) => l.section === "First").map((l) => l.id)).toEqual(["c-a", "c-c"]);
    expect(moduleList(c)[0]).toEqual({ title: "First", description: "Start here" });
    expect(updateModule(c, "First", { title: "Two" })).toBe(c); // can't take another module's name
    c = moveModule(c, "Two", -1);
    expect(shape(c)).toEqual(["Two: b", "First: a,c", "Three: "]);
    c = removeModule(c, "Two");
    expect(shape(c)).toEqual(["First: a,c", "Three: ", "-: b"]);
  });

  it("assigns lessons to modules and reorders them within one", () => {
    let c = course([lesson("a", "One"), lesson("b", "One"), lesson("c")], [{ title: "One" }, { title: "Two" }]);
    c = assignLesson(c, "c-c", "Two");
    expect(shape(c)).toEqual(["One: a,b", "Two: c"]);
    c = assignLesson(c, "c-a", null);
    expect(shape(c)).toEqual(["One: b", "Two: c", "-: a"]);
    expect(assignLesson(c, "c-a", "Missing")).toBe(c);
    c = assignLesson(c, "c-a", "One");
    expect(shape(c)).toEqual(["One: b,a", "Two: c"]);
    c = moveLesson(c, "c-a", -1);
    expect(shape(c)).toEqual(["One: a,b", "Two: c"]);
    expect(ids(moveLesson(c, "c-a", -1))).toEqual(ids(c));
  });

  it("validates modules on save", () => {
    const ok = validateCourse(course([lesson("a", "One")], [{ title: " One ", description: "Desc" }, { title: "one" }]));
    expect(ok.ok && ok.course.modules).toEqual([{ title: "One", description: "Desc" }]);
    expect(validateCourse(course([], [{ title: "" }])).ok).toBe(false);
    expect(validateCourse({ ...course([]), modules: [{ title: "A", extra: 1 }] }).ok).toBe(false);
    expect(validateCourse({ ...course([]), modules: "nope" }).ok).toBe(false);
    const none = validateCourse(course([]));
    expect(none.ok && "modules" in none.course).toBe(false);
  });
});
