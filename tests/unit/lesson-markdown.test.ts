import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LessonMarkdown, safeImageSrc, safeLinkHref } from "@/components/ui/lesson-markdown";
import { validateCourse } from "@/lib/courses/course-catalog";

// Jest compiles JSX with the classic runtime, which looks React up globally.
(globalThis as { React?: typeof React }).React = React;
const html = (content: string) => renderToStaticMarkup(createElement(LessonMarkdown, { content }));

describe("lesson readings", () => {
  it("keeps the structure of an imported Canvas page", () => {
    const out = html([
      "## What is Vibe Coding?",
      "",
      "**Vibe Coding** is a new way of building with *AI*.",
      "",
      "### Tool Spotlight: [Lovable.dev](https://lovable.dev/invite/x)",
      "",
      "- Entrepreneurs",
      "  - launching MVPs",
      "- Designers",
      "",
      "1. High-level prompt",
      "2. Detailed prompt",
      "",
      "> *\"Create a simple landing page\"*",
      "",
      "---",
      "",
      "| Tool | Use |",
      "| Lovable | Pages |",
    ].join("\n"));
    expect(out).toContain("<h3");
    expect(out).toContain(">What is Vibe Coding?</h3>");
    expect(out).toContain("<h4");
    expect(out).toContain('<a href="https://lovable.dev/invite/x"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain("<strong");
    expect(out).toContain("<em>AI</em>");
    expect(out).toMatch(/<ul[^>]*><li[^>]*>Entrepreneurs<ul[^>]*><li[^>]*>launching MVPs<\/li><\/ul><\/li><li[^>]*>Designers<\/li><\/ul>/);
    expect(out).toMatch(/<ol[^>]*><li[^>]*>High-level prompt<\/li><li[^>]*>Detailed prompt<\/li><\/ol>/);
    expect(out).toContain("<blockquote");
    expect(out).toContain("<hr");
    expect(out).toContain("<table");
    const visible = out.replace(/<[^>]+>/g, "\n");   // what the learner reads: no Markdown symbols left
    for (const raw of ["##", "**", "](", "&gt; ", "---", "1. "]) expect(visible).not.toContain(raw);
  });

  it("never runs HTML or unsafe links from a reading", () => {
    const out = html([
      "<script>alert(1)</script> <img src=x onerror=alert(1)>",
      "[click](javascript:alert(1)) [data](data:text/html,hi) [plain](http://insecure.example)",
      "![pixel](http://tracker.example/x.gif) ![packed](web_resources/Images/a.png)",
    ].join("\n\n"));
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img src=\"x\"");
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("href=\"data:");
    expect(out).not.toContain("href=\"http://");
    expect(out).toContain(">click<");           // the words stay
    expect(out).not.toContain("<img");           // neither image is from a safe place
  });

  it("allows only https, mailto and the app's own addresses", () => {
    expect(safeLinkHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeLinkHref("mailto:tutor@example.com")).toBe("mailto:tutor@example.com");
    expect(safeLinkHref("/app/course/?slug=x")).toBe("/app/course/?slug=x");
    for (const bad of ["//evil.example", "/\\evil.example", "/login", "javascript:alert(1)", "http://x.example", "https://a b"]) {
      expect(safeLinkHref(bad)).toBeNull();
    }
    expect(safeImageSrc("/api/resources/abc_123")).toBe("/api/resources/abc_123");
    expect(safeImageSrc("/api/resources/../secret")).toBeNull();
  });
});

describe("a video lesson's reading", () => {
  const course = (lesson: Record<string, unknown>) => ({
    slug: "c", title: "C", tagline: "t", category: "study", level: "Beginner", tags: [], cover: "x", addedAt: "2026-10-30",
    lessons: [{ id: "c-1", title: "One", description: "d", youtubeId: "dQw4w9WgXcQ", durationMin: 10, resources: [], keyTakeaways: [], format: "video", ...lesson }],
  });
  it("is allowed under the video, up to 20,000 characters", () => {
    expect(validateCourse(course({ body: "## Notes\n\n- one" })).ok).toBe(true);
    expect(validateCourse(course({ body: "x".repeat(20_001) })).ok).toBe(false);
  });
  it("still can't be an uploaded file (that's for reading lessons)", () => {
    expect(validateCourse(course({ bodyFileUrl: "/api/resources/abc" })).ok).toBe(false);
  });
});
