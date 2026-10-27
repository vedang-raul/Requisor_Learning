import { hiddenCoursesKey, partitionHidden, readHiddenCourses, writeHiddenCourses } from "@/lib/courses/hidden-courses";

describe("hidden courses in My Courses", () => {
  const items = ["a", "b", "c"].map((slug) => ({ course: { slug } }));

  it("splits the list in order and ignores hidden slugs that no longer exist", () => {
    const { visible, hidden } = partitionHidden(items, ["c", "gone", "a"]);
    expect(visible.map((i) => i.course.slug)).toEqual(["b"]);
    expect(hidden.map((i) => i.course.slug)).toEqual(["a", "c"]);
  });

  it("saves per account and survives bad or blocked storage", () => {
    const store = new Map<string, string>();
    const original = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k),
    } } });
    try {
      writeHiddenCourses("Tutor@Example.test", ["a", "b"]);
      expect(readHiddenCourses("tutor@example.test")).toEqual(["a", "b"]);
      expect(readHiddenCourses("other@example.test")).toEqual([]);
      store.set(hiddenCoursesKey("tutor@example.test")!, JSON.stringify(["a", 5, "", "a", "x".repeat(200)]));
      expect(readHiddenCourses("tutor@example.test")).toEqual(["a"]);
      store.set(hiddenCoursesKey("tutor@example.test")!, "not json");
      expect(readHiddenCourses("tutor@example.test")).toEqual([]);
      writeHiddenCourses("tutor@example.test", []);
      expect(store.has(hiddenCoursesKey("tutor@example.test")!)).toBe(false);
      expect(hiddenCoursesKey("  ")).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, "window", original); else delete (globalThis as { window?: unknown }).window;
    }
  });
});
