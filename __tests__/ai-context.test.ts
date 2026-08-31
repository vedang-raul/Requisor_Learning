import { buildProgressContext } from "@/lib/ai-context";
import type { AppState } from "@/lib/types";

describe("buildProgressContext", () => {
  it("includes useful learning state without sending learner identity to the model", () => {
    const state: AppState = {
      user: {
        id: 4,
        name: "Private Learner Name",
        email: "private@example.test",
        role: "employee",
      },
      courses: [{
        slug: "data-analytics",
        title: "Data Analytics",
        tagline: "Learn data skills",
        category: "data",
        level: "Beginner",
        tags: ["data"],
        cover: "",
        addedAt: "2026-01-01",
        lessons: [{
          id: "lesson-1",
          title: "Data Foundations",
          description: "",
          youtubeId: "",
          durationMin: 20,
          resources: [],
          keyTakeaways: [],
        }],
      }],
      progress: {
        "lesson-1": { completed: false, watchPct: 40 },
      },
      history: [{
        courseSlug: "data-analytics",
        lessonId: "lesson-1",
        at: "2026-08-31T00:00:00.000Z",
      }],
      bookmarks: [],
      savedLessons: [],
      notes: {},
      xp: 150,
      notifications: [],
      sidebarCollapsed: false,
      assessmentCompletions: [],
    };

    const context = buildProgressContext(state);

    expect(context).toContain("XP: 150");
    expect(context).toContain("Data Analytics");
    expect(context).toContain("40% watched");
    expect(context).not.toContain("Private Learner Name");
    expect(context).not.toContain("private@example.test");
  });
});