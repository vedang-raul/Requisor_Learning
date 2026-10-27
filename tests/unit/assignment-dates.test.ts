import { daysAgoLabel, daysUntil, dueDateLabel, dueInLabel, isLate } from "@/lib/courses/assignment-dates";

describe("assignment due dates", () => {
  const now = new Date(2026, 9, 27, 15, 0); // 27 Oct 2026, 3 pm local

  it("counts whole days to the due date in local time", () => {
    expect(daysUntil("2026-10-27", now)).toBe(0);
    expect(daysUntil("2026-10-29", now)).toBe(2);
    expect(daysUntil("2026-10-20", now)).toBe(-7);
    expect(daysUntil("not a date", now)).toBeNull();
  });

  it("describes how soon it is due", () => {
    expect(dueInLabel("2026-10-27", now)).toEqual({ text: "Due today", soon: true, overdue: false });
    expect(dueInLabel("2026-10-28", now)?.text).toBe("Due tomorrow");
    expect(dueInLabel("2026-11-02", now)).toEqual({ text: "Due in 6 days", soon: false, overdue: false });
    expect(dueInLabel("2026-10-26", now)).toEqual({ text: "1 day overdue", soon: true, overdue: true });
  });

  it("is late only after the end of the due day", () => {
    expect(isLate(new Date(2026, 9, 27, 23, 59), "2026-10-27")).toBe(false);
    expect(isLate(new Date(2026, 9, 28, 0, 1), "2026-10-27")).toBe(true);
  });

  it("shows the calendar date it was set to, never the day before", () => {
    expect(dueDateLabel("2026-09-28")).toContain("28");
    expect(daysAgoLabel(new Date(2026, 9, 27, 9), now)).toBe("today");
    expect(daysAgoLabel(new Date(2026, 9, 26, 22), now)).toBe("yesterday");
    expect(daysAgoLabel(new Date(2026, 9, 23), now)).toBe("4 days ago");
  });
});
