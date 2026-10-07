import { expect, test, type Page } from "@playwright/test";
import type { PublicSpeechVoice } from "../lib/speech-types";

const voices: PublicSpeechVoice[] = [
  { key: "female", name: "Female sample", gender: "female", languages: ["en"], enabled: true, default: true, unavailableReason: null },
  { key: "male", name: "Male sample", gender: "male", languages: ["en", "hi"], enabled: true, default: false, unavailableReason: null },
];

async function setup(page: Page, enabled = true) {
  let account = "7";
  const speechRequests: unknown[] = [];
  let pending = false;
  let release: (() => void) | null = null;
  let fail = false;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/auth/session") return json({
      user: { id: account, name: "Synthetic learner", email: `synthetic-${account}@example.test`, role: "employee" },
      expires: "2099-01-01T00:00:00.000Z",
    });
    if (path === "/api/me") return json({ onboardingDone: true });
    if (path === "/api/speech") {
      if (route.request().method() === "GET") return json({
        voices: voices.map(v => enabled ? v : { ...v, enabled: false, unavailableReason: "Voice ID not configured." }),
        setupMessage: enabled ? null : "Ask the platform owner to configure ELEVENLABS_VOICES.",
      });
      speechRequests.push(route.request().postDataJSON());
      if (pending) await new Promise<void>(resolve => { release = resolve; });
      try {
        if (fail) return await json({ error: "Provider unavailable" }, 502);
        await route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.from([1, 2, 3]) });
      } catch { /* A cancelled browser request need not receive a response. */ }
      return;
    }
    if (path === "/api/chat") return route.fulfill({ contentType: "text/plain", body: "Personalized result: private grade 72. This response stays text-only." });
    if (path === "/api/courses") return json({ courses: [] });
    if (path === "/api/notifications") return json({ notifications: [] });
    return json({ xp: 0, completions: [], notes: {}, bookmarks: [], savedLessons: [] });
  });
  await page.addInitScript(() => {
    const stats = { played: 0, paused: 0, browserSpeech: 0 };
    (window as unknown as { speechStats: typeof stats }).speechStats = stats;
    // Mock media decoding only; the real fetch/hook/control lifecycle runs.
    class MockAudio {
      onplaying: (() => void) | null = null;
      onended: (() => void) | null = null;
      onpause: (() => void) | null = null;
      onerror: (() => void) | null = null;
      play() { stats.played++; this.onplaying?.(); return Promise.resolve(); }
      pause() { stats.paused++; this.onpause?.(); }
      load() {}
      removeAttribute() {}
    }
    window.Audio = MockAudio as unknown as typeof Audio;
    if (window.speechSynthesis) window.speechSynthesis.speak = () => { stats.browserSpeech++; };
    sessionStorage.setItem("requisor-assistant-hint-shown", "1");
  });
  return {
    speechRequests,
    setAccount: (id: string) => { account = id; },
    setPending: (value: boolean) => { pending = value; },
    release: () => release?.(),
    fail: () => { fail = true; },
  };
}
async function openVoices(page: Page) {
  await page.getByRole("button", { name: "Open AI assistant", exact: true }).click();
  await page.getByRole("button", { name: "Choose guide voice", exact: true }).click();
  return page.getByRole("dialog", { name: "Guide voice" });
}
async function stats(page: Page) {
  return page.evaluate(() => (window as unknown as { speechStats: { played: number; paused: number; browserSpeech: number } }).speechStats);
}

test.describe("approved chatbot voice controls", () => {
  test("shows configuration gaps honestly and fits phone, tablet and desktop", async ({ page }) => {
    const h = await setup(page, false);
    await page.goto("/app/dashboard/");
    const dialog = await openVoices(page);
    await expect(dialog.getByText("Female voice · en", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Male voice · en · hi", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Voice ID not configured.", { exact: false })).toHaveCount(2);
    await expect(dialog.getByRole("button", { name: "Play approved platform help phrase" })).toBeDisabled();
    await expect(dialog.getByText("Personalized AI replies", { exact: false })).toBeVisible();
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 850 });
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.height).toBeLessThanOrEqual(850);
    }
    await expect(dialog.getByRole("button", { name: "Close guide voice settings", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Mute approved voice playback", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Close guide voice settings", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Choose guide voice", exact: true })).toBeFocused();
    expect(h.speechRequests).toEqual([]);
  });
  test("remembers explicit choices per account and previews only fixed keys", async ({ page }) => {
    const h = await setup(page);
    await page.goto("/app/dashboard/");
    let dialog = await openVoices(page);
    await dialog.getByRole("button", { name: /^Male sample/ }).click();
    await expect(dialog.getByRole("button", { name: /^Male sample/ })).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("button", { name: "Preview Male sample voice", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Stop playback", exact: true })).toBeVisible();
    expect(h.speechRequests).toEqual([{ voiceKey: "male", contentKey: "preview" }]);
    await dialog.getByRole("button", { name: "Mute approved voice playback", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Play approved study tip phrase" })).toBeDisabled();
    expect((await stats(page)).paused).toBeGreaterThan(0);
    await page.reload();
    dialog = await openVoices(page);
    await expect(dialog.getByRole("button", { name: /^Male sample/ })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("button", { name: "Unmute approved voice playback", exact: true })).toBeVisible();
    h.setAccount("8");
    await page.reload();
    dialog = await openVoices(page);
    await expect(dialog.getByRole("button", { name: /^Female sample/ })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("button", { name: "Mute approved voice playback", exact: true })).toBeVisible();
    h.setAccount("7");
    await page.reload();
    dialog = await openVoices(page);
    await expect(dialog.getByRole("button", { name: /^Male sample/ })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("button", { name: "Unmute approved voice playback", exact: true })).toBeVisible();
  });
  test("cancels pending previews on voice change, exposes stop during loading, and handles errors", async ({ page }) => {
    const h = await setup(page);
    await page.goto("/app/dashboard/");
    const dialog = await openVoices(page);
    h.setPending(true);
    await dialog.getByRole("button", { name: "Preview Female sample voice", exact: true }).click();
    await expect(dialog.getByText("Preparing approved speech…")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Stop playback", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: /^Male sample/ }).click();
    h.release();
    await expect(dialog.getByText("Preparing approved speech…")).not.toBeVisible();
    expect((await stats(page)).played).toBe(0);
    h.setPending(false);
    h.fail();
    await dialog.getByRole("button", { name: "Preview Male sample voice", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Speech is unavailable");
  });
  test("keeps generated and personalized chat replies text-only with no browser fallback", async ({ page }) => {
    const h = await setup(page);
    await page.goto("/app/dashboard/");
    const dialog = await openVoices(page);
    await dialog.getByRole("button", { name: "Play approved platform help phrase" }).click();
    await expect(dialog.getByRole("button", { name: "Stop playback", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Close guide voice settings", exact: true }).click();
    await page.locator("textarea").fill("Tell me my private grade");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByText("Personalized result: private grade 72.", { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
    expect(h.speechRequests).toEqual([{ voiceKey: "female", contentKey: "platform_help" }]);
    expect((await stats(page)).browserSpeech).toBe(0);
    await page.getByRole("button", { name: "Close AI assistant", exact: true }).click();
    expect((await stats(page)).paused).toBeGreaterThan(0);
  });
});
