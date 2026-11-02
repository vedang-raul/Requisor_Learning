import { peekAfterSignIn, rememberAfterSignIn, safeAppPath, takeAfterSignIn } from "@/lib/navigation/after-sign-in";
import { GET as shareLink } from "@/app/c/[slug]/route";
import { runAssistantTool, toolsForRole } from "@/lib/assistant/assistant-tools";
import { isModuleHidden, toggleModule } from "@/lib/courses/hidden-modules";

function withSessionStorage(run: () => void) {
  const store = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { sessionStorage: {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k),
  } } });
  try { run(); } finally {
    if (original) Object.defineProperty(globalThis, "window", original); else delete (globalThis as { window?: unknown }).window;
  }
}

describe("returning to a page after sign-in", () => {
  it("accepts only paths inside the app", () => {
    expect(safeAppPath("/app/course/?slug=agentic-ai")).toBe("/app/course/?slug=agentic-ai");
    const bs = String.fromCharCode(92); // a backslash
    for (const bad of ["https://evil.example/app/x", "//evil.example/app/", `/${bs}evil.example`, `/app/${bs}..${bs}x`, "/login/", "javascript:alert(1)", `/app/${String.fromCharCode(0)}x`, "/appx/", "", 42, null, "/app/" + "x".repeat(600)]) {
      expect(safeAppPath(bad)).toBeNull();
    }
    expect(safeAppPath("/app/../login/")).toBeNull(); // resolves outside /app/
  });

  it("remembers one destination for a short while and uses it once", () => {
    withSessionStorage(() => {
      rememberAfterSignIn("/app/course/?slug=agentic-ai");
      expect(peekAfterSignIn()).toBe("/app/course/?slug=agentic-ai");
      expect(takeAfterSignIn()).toBe("/app/course/?slug=agentic-ai");
      expect(takeAfterSignIn()).toBeNull();
      rememberAfterSignIn("https://evil.example/");
      expect(takeAfterSignIn()).toBeNull();
      rememberAfterSignIn("/app/dashboard/");
      expect(takeAfterSignIn(Date.now() + 31 * 60_000)).toBeNull(); // too old
    });
  });
});

describe("course share link", () => {
  const go = async (slug: string) => {
    // As on Replit: the app sees the proxy's internal address, not the public one.
    const res = await shareLink(new Request(`http://localhost:5000/c/${slug}`), { params: Promise.resolve({ slug }) });
    return { status: res.status, location: res.headers.get("location") };
  };
  it("points at the course page, and nowhere else", async () => {
    expect(await go("agentic-ai")).toEqual({ status: 307, location: "/app/course/?slug=agentic-ai" });   // relative: never the internal host
    expect((await go("..%2F..%2Fadmin")).location).toBe("/app/dashboard/");
    expect((await go("Bad Slug")).location).toBe("/app/dashboard/");
  });
});

describe("assistant workspaces", () => {
  const names = (workspace?: "courses" | "program_builder") => toolsForRole("tutor", workspace).map((t) => t.function.name);
  it("offers only Program Builder tools on its page, and none of them elsewhere", () => {
    expect(names("program_builder").sort()).toEqual(["list_my_courses", "propose_open_page", "propose_program_builder"]);
    expect(names()).toContain("propose_create_course");
    expect(names()).not.toContain("propose_program_builder");
  });
  it("refuses a tool from the other workspace even when asked for it", async () => {
    const ctx = { userId: 1, role: "tutor" as const };
    expect((await runAssistantTool("propose_create_course", "{}", { ...ctx, workspace: "program_builder" })).content).toMatch(/aren't changed from the Program Builder/);
    const generate = (args: object, programStage?: object) => runAssistantTool("propose_program_builder", JSON.stringify({ action: "generate", ...args }), { ...ctx, workspace: "program_builder", programStage });
    expect((await generate({ level: "Beginner", modules: 4 })).content).toMatch(/nothing to build from/i);
    expect((await generate({ topic: "Safety" })).content).toMatch(/proposed/i);
    expect((await generate({ transcript: "We spoke about safety" })).content).toMatch(/proposed/i);
    expect((await generate({}, { topic: "From the page" })).content).toMatch(/proposed/i);
    expect((await generate({ modules: 5 }, { hasCurriculum: true, step: 2 })).content).toMatch(/proposed/i);
    const propose = (programStage?: { hasCurriculum: boolean; step: number }) => runAssistantTool("propose_program_builder", JSON.stringify({ action: "proposal", topic: "Safety" }), { ...ctx, workspace: "program_builder", programStage });
    expect((await propose()).content).toMatch(/no curriculum/i);
    expect((await propose({ hasCurriculum: true, step: 1 })).content).toMatch(/hasn't reached/i);
    expect((await propose({ hasCurriculum: true, step: 2 })).content).toMatch(/proposed/i);
    expect((await runAssistantTool("propose_program_builder", "{}", { ...ctx, workspace: "courses" })).content).toMatch(/isn't run from here/);
  });
});

describe("hiding modules in the tutor's list", () => {
  it("toggles by name, ignoring case and spacing", () => {
    const hidden = toggleModule([], "Module 1:  Basics");
    expect(isModuleHidden(hidden, "module 1: basics")).toBe(true);
    expect(isModuleHidden(hidden, null)).toBe(false);
    expect(toggleModule(hidden, "MODULE 1: Basics")).toEqual([]);
  });
});
