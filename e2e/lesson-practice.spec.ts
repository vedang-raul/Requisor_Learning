import { expect, test, type Page, type Route } from "@playwright/test";

const LESSON_PATH = "/app/learn/?course=product-management&lesson=product-management-01";
const ASSIGNMENT = "Interview two people about the problem before sketching a simple solution.";

const QUIZ_QUESTIONS = [
  {
    id: "q1",
    concept: "Problem framing",
    question: "What should a product team clarify first?",
    options: ["The feature color", "The real problem", "The launch date", "The logo"],
  },
  {
    id: "q2",
    concept: "Simple solutions",
    question: "Which solution is preferred in this lesson?",
    options: ["Complex", "Unclear", "Simple", "Untested"],
  },
  {
    id: "q3",
    concept: "Constraints",
    question: "How can constraints help a team?",
    options: ["Hide decisions", "Sharpen thinking", "Remove users", "Delay learning"],
  },
];

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function authenticate(page: Page) {
  let savedAssignment: string | null = null;
  let assignmentGenerationRequests = 0;
  let gradeRequests = 0;

  await page.route("**/api/auth/session*", (route) =>
    fulfillJson(route, {
      user: {
        id: "7",
        name: "Learner",
        email: "learner@example.com",
        role: "employee",
      },
      expires: "2099-01-01T00:00:00.000Z",
    })
  );
  await page.route("**/api/me*", (route) =>
    fulfillJson(route, {
      onboardingDone: true,
      dateOfBirth: "1990-06-15",
    })
  );

  await page.route("**/api/assignment*", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      if (savedAssignment) {
        await fulfillJson(route, { assignment: savedAssignment, cached: true });
      } else {
        await fulfillJson(route, { error: "No saved assignment." }, 404);
      }
      return;
    }

    assignmentGenerationRequests += 1;
    savedAssignment = ASSIGNMENT;
    await fulfillJson(route, { assignment: ASSIGNMENT, cached: false });
  });

  await page.route("**/api/quiz", (route) =>
    fulfillJson(route, { quizId: 23, questions: QUIZ_QUESTIONS })
  );
  await page.route("**/api/quiz/grade", async (route) => {
    gradeRequests += 1;
    if (gradeRequests === 1) {
      await fulfillJson(route, { error: "Couldn't grade this quiz right now. Please try again." }, 503);
      return;
    }
    await fulfillJson(route, {
      score: 2,
      total: 3,
      results: [
        {
          id: "q1",
          correct: true,
          correctOption: "The real problem",
          explanation: "Start with the real problem.",
        },
        {
          id: "q2",
          correct: false,
          correctOption: "Simple",
          explanation: "Simple solutions reduce unnecessary complexity.",
        },
        {
          id: "q3",
          correct: true,
          correctOption: "Sharpen thinking",
          explanation: "Constraints focus a team's choices.",
        },
      ],
    });
  });

  // Keep unrelated learner hydration calls quiet; their responses are not part
  // of this journey but should not generate noisy failed requests in the test.
  await page.route("**/api/xp*", (route) => fulfillJson(route, { xp: 0 }));
  await page.route("**/api/course-assessment*", (route) => fulfillJson(route, { completions: [] }));
  await page.route("**/api/notes*", (route) => fulfillJson(route, { notes: {} }));
  await page.route("**/api/bookmarks*", (route) => fulfillJson(route, { bookmarks: [], savedLessons: [] }));
  await page.route("**/api/comments*", (route) => fulfillJson(route, { comments: [] }));

  await page.addInitScript(() => {
    localStorage.setItem("requisor-notes-bookmarks-migrated-v1:learner@example.com", "true");
  });

  return {
    assignmentGenerationCount: () => assignmentGenerationRequests,
    gradeRequestCount: () => gradeRequests,
  };
}

test.describe("authenticated lesson practice", () => {
  test("persists assignments, hides answers, retries grading, and traps quiz focus", async ({ page }) => {
    const counters = await authenticate(page);
    await page.goto(LESSON_PATH);

    const assignmentCard = page.getByText("Practice assignment").locator("..").locator("..");
    await expect(assignmentCard.getByRole("button", { name: "Get assignment" })).toBeVisible();
    await assignmentCard.getByRole("button", { name: "Get assignment" }).click();
    await expect(page.getByText(ASSIGNMENT)).toBeVisible();
    expect(counters.assignmentGenerationCount()).toBe(1);

    await page.reload();
    await expect(page.getByText(ASSIGNMENT)).toBeVisible();
    await expect(page.getByText("Your saved assignment for this lesson.")).toBeVisible();
    expect(counters.assignmentGenerationCount()).toBe(1);

    const quizTrigger = page.getByRole("button", { name: "Test yourself" });
    await quizTrigger.focus();
    await quizTrigger.click();

    const dialog = page.getByRole("dialog", { name: "Test yourself" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("status")).toBeHidden();
    await expect(dialog.getByRole("radio")).toHaveCount(12);
    await expect(dialog.getByText("Correct answer.")).toHaveCount(0);
    await expect(dialog.getByText("Start with the real problem.")).toHaveCount(0);

    // The dialog initially focuses its close control. Tab from the final
    // control must wrap back to the close control rather than escape the modal.
    const closeQuiz = dialog.getByRole("button", { name: "Close quiz" });
    await expect(closeQuiz).toBeFocused();
    await dialog.getByRole("radio").nth(0).click();
    await dialog.getByRole("radio").nth(4).click();
    await dialog.getByRole("radio").nth(9).click();
    await expect(dialog.getByRole("button", { name: "Submit answers" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Submit answers" }).focus();
    await page.keyboard.press("Tab");
    await expect(closeQuiz).toBeFocused();

    // A transient failure keeps the same questions and selected answers open.
    await dialog.getByRole("button", { name: "Submit answers" }).click();
    await expect(dialog.getByRole("button", { name: "Retry grading" })).toBeVisible();
    await expect(dialog.getByRole("radio").nth(0)).toHaveAttribute("aria-checked", "true");
    await expect(dialog.getByRole("radio").nth(4)).toHaveAttribute("aria-checked", "true");
    await expect(dialog.getByRole("radio").nth(9)).toHaveAttribute("aria-checked", "true");
    await expect(dialog.getByRole("radio")).toHaveCount(12);
    expect(counters.gradeRequestCount()).toBe(1);

    await dialog.getByRole("button", { name: "Retry grading" }).click();
    await expect(dialog.getByText("Score: 2/3")).toBeVisible();
    await expect(dialog.getByRole("radio", { name: /The real problem.*Correct answer/ })).toBeDisabled();
    await expect(dialog.getByText("Start with the real problem.")).toBeVisible();
    expect(counters.gradeRequestCount()).toBe(2);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(quizTrigger).toBeFocused();
  });
});