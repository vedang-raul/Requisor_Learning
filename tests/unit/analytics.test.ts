import { trackEvent } from "@/lib/analytics";

describe("trackEvent", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  it("forwards safe event data to the injected tracker", () => {
    const track = jest.fn();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { umami: { track } },
    });

    trackEvent("lesson_viewed", { course_slug: "agentic-ai", lesson_number: 2 });

    expect(track).toHaveBeenCalledWith("lesson_viewed", {
      course_slug: "agentic-ai",
      lesson_number: 2,
    });
  });

  it("never breaks the app when the tracker throws", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { umami: { track: () => { throw new Error("blocked"); } } },
    });

    expect(() => trackEvent("quiz_completed", { score: 4 })).not.toThrow();
  });

  it("does nothing during server rendering or when analytics is absent", () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
    expect(() => trackEvent("account_created")).not.toThrow();
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    expect(() => trackEvent("account_created")).not.toThrow();
  });

  it("handles an asynchronously rejected tracker without an unhandled rejection", async () => {
    const track = jest.fn().mockRejectedValue(new Error("network blocked"));
    Object.defineProperty(globalThis, "window", { configurable: true, value: { umami: { track } } });
    expect(() => trackEvent("account_created")).not.toThrow();
    await Promise.resolve();
    expect(track).toHaveBeenCalledWith("account_created", undefined);
  });

  it("drops personal data, content, identifiers and unknown properties", () => {
    const track = jest.fn();
    Object.defineProperty(globalThis, "window", { configurable: true, value: { umami: { track } } });
    trackEvent("lesson_ai_completed", {
      field: "title", field_count: 1, written_count: 1,
      email: "private@example.com", user_id: "user-private", lesson_id: "lesson-private",
      script: "Private lesson content", message: "Private chat", had_existing_dob: true,
      course_slug: "private-tutor-course", constructor: "invalid",
    });
    expect(track).toHaveBeenCalledWith("lesson_ai_completed", {
      field: "title", field_count: 1, written_count: 1, course_slug: "custom",
    });
  });

  it("keeps only finite non-negative counts and approved category values", () => {
    const track = jest.fn();
    Object.defineProperty(globalThis, "window", { configurable: true, value: { umami: { track } } });
    trackEvent("voice_selected", {
      gender: "female", language: "mr", role: "private name",
      duration_ms: Infinity, field_count: -1, lesson_count: NaN,
      published: "true", provider: "https://private.example",
    });
    expect(track).toHaveBeenCalledWith("voice_selected", { gender: "female", language: "mr" });
  });

  it("rejects malformed or oversized event names", () => {
    const track = jest.fn();
    Object.defineProperty(globalThis, "window", { configurable: true, value: { umami: { track } } });
    for (const name of ["", "User Email", "private@example.com", "a".repeat(50)]) trackEvent(name);
    expect(track).not.toHaveBeenCalled();
    trackEvent("a".repeat(49));
    expect(track).toHaveBeenCalledTimes(1);
  });
});