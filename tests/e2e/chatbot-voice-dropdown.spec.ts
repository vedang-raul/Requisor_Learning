import { expect, test, type Page } from "@playwright/test";
import type { PublicSpeechVoice } from "@/lib/courses/speech-types";

test.setTimeout(60_000);

const names = [
  "English America Female", "Marathi Male", "Marathi Female", "Hindi Male",
  "Hindi Female", "English America Male", "Spanish Male", "Spanish Female",
  "Arabic Male", "Arabic Female", "Chinese Male", "Chinese Female",
  "Portuguese Male", "Portuguese Female", "Afrikaans Male", "Afrikaans Female",
  "English Britain Male", "English Britain Female",
];
const languages = ["en", "mr", "mr", "hi", "hi", "en", "es", "es", "ar", "ar", "zh", "zh", "pt", "pt", "af", "af", "en", "en"];
const voices: PublicSpeechVoice[] = names.map((name, index) => ({
  key: `voice-${index}`, name, gender: name.endsWith("Female") ? "female" : "male",
  languages: [languages[index]], enabled: index !== 17, default: index === 0,
  unavailableReason: index === 17 ? "Voice not configured" : null,
}));

async function openAssistant(page: Page) {
  // Browser-only fixtures: application authentication remains unchanged.
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
    let body: unknown = {};
    if (path === "/api/auth/session") body = {
      user: { id: "dropdown-test", name: "Synthetic learner", email: "dropdown@example.test", role: "employee" },
      expires: "2099-01-01T00:00:00.000Z",
    };
    else if (path === "/api/me") body = { onboardingDone: true };
    else if (path === "/api/speech") body = { voices, setupMessage: null };
    else if (path === "/api/tts") body = { configured: false, characters: [] };
    else if (path === "/api/courses") body = { courses: [] };
    else if (path === "/api/notifications") body = { notifications: [] };
    else body = { xp: 0, completions: [], notes: {}, bookmarks: [], savedLessons: [] };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.addInitScript(() => sessionStorage.setItem("requisor-assistant-hint-shown", "1"));
  await page.goto("/app/dashboard/");
  await page.getByRole("button", { name: "Open AI assistant", exact: true }).click();
  return page.getByRole("button", { name: /^Chatbot voice:/ });
}

test("voice dropdown handles keyboard selection, disabled voices, Escape and persistence", async ({ page }) => {
  let trigger = await openAssistant(page);
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("listbox", { name: "Available chatbot voices" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("option")).toHaveCount(18);
  await expect(menu.getByRole("option", { name: /English America Female/ })).toBeFocused();
  await expect(menu.getByRole("option", { name: /English Britain Female/ })).toBeDisabled();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("option", { name: /Marathi Male/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-label", /Marathi Male, Marathi, male/);
  await trigger.click();
  await page.keyboard.press("End");
  await expect(menu.getByRole("option", { name: /English Britain Male/ })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(menu.getByRole("option", { name: /English America Female/ })).toBeFocused();
  await page.keyboard.type("Hindi");
  await expect(menu.getByRole("option", { name: /Hindi Male/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("button", { name: "Close AI assistant", exact: true })).toBeVisible();
  await trigger.click();
  await page.keyboard.press("Tab");
  await expect(menu).not.toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open AI assistant", exact: true }).click();
  trigger = page.getByRole("button", { name: /^Chatbot voice:/ });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-label", /Marathi Male/);
});

test("voice dropdown stays inside phone, tablet and desktop viewports and closes outside", async ({ page }) => {
  const trigger = await openAssistant(page);
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    await trigger.click();
    const menu = page.getByRole("listbox", { name: "Available chatbot voices" });
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(850);
    await expect(menu.getByRole("option", { selected: true })).toContainText("English America Female");
    await expect(page.getByRole("dialog", { name: /voice/i })).toHaveCount(0);
    await page.screenshot({ path: `/tmp/chatbot-voice-dropdown-${width}.png` });
    await page.mouse.click(5, 5);
    await expect(menu).not.toBeVisible();
  }
});
