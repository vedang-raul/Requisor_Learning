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
});