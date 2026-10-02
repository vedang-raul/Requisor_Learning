jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => ({ db: { query: jest.fn() } }));
jest.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => ({ check: () => ({ limited: false, retryAfterMs: 0 }) }),
  rateLimitResponse: () => new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }),
}));
jest.mock("@/lib/base-url", () => ({ getBaseUrl: () => "https://learning.example.com" }));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { buildDemoEditResult, cuesToVtt, parseVtt, videoEditDemoEnabled } from "@/lib/video-edit";
import { refreshVideoEditJob, type VideoEditJobRow } from "@/lib/video-edit-jobs";
import { productionSettings } from "@/lib/auphonic";
import { GET as download } from "@/app/api/tutor/video-edits/[id]/download/route";
import {
  buildAuthUrl, createOAuthState, decryptToken, encryptToken, uploadCaptions, uploadVideo, verifyOAuthState, videoDelivery,
} from "@/lib/youtube";
import { POST as createEdit } from "@/app/api/tutor/video-edits/route";
import { POST as publish } from "@/app/api/tutor/video-edits/[id]/youtube/route";

const mockedDb = db.query as jest.Mock;
const ENV_KEYS = ["VIDEO_EDIT_DEMO", "AUPHONIC_API_KEY", "AUPHONIC_API_URL", "AUPHONIC_LANGUAGE", "AUPHONIC_SUBTITLES", "VIDEO_DELIVERY", "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];

const post = (body: unknown) =>
  new Request("http://localhost/api/tutor/video-edits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never;

function jobRow(overrides: Partial<VideoEditJobRow> = {}): VideoEditJobRow {
  return {
    id: 1, owner_user_id: 5, title: "Prompt Chaining", file_name: "lecture.mp4", source_seconds: 600, storage_key: null,
    provider: "demo", provider_job_id: null, status: "processing", result: null, youtube_video_id: null, error: null,
    created_at: new Date().toISOString(), ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.NEXTAUTH_SECRET = "test-secret";
  (getServerSession as jest.Mock).mockResolvedValue({ user: { id: "5", role: "tutor", email: "t@example.com" } });
});

describe("demo edit result", () => {
  it("uses the recording's real length and marks everything as a sample", () => {
    const result = buildDemoEditResult("Prompt Chaining", 600);
    expect(result).toMatchObject({ demo: true, originalSeconds: 600, downloadUrl: null, subtitleLanguage: "English" });
    expect(result.editedSeconds).toBe(600 - (result.secondsRemoved ?? 0));
    expect(result.editedSeconds).toBeLessThan(600);
    expect(result.subtitlePreview[0].text).toContain("Prompt Chaining");
    expect(result.vtt.startsWith("WEBVTT")).toBe(true);
    expect(result.vtt).toContain("SAMPLE subtitles");
  });

  it("writes valid WebVTT cue timings", () => {
    expect(cuesToVtt([{ start: 3661.5, end: 3665, text: "Hi" }])).toContain("01:01:01.500 --> 01:01:05.000\nHi");
  });

  it("is on until a real processing service is configured, unless switched off", () => {
    expect(videoEditDemoEnabled()).toBe(true);
    process.env.VIDEO_EDIT_DEMO = "off";
    expect(videoEditDemoEnabled()).toBe(false);
    delete process.env.VIDEO_EDIT_DEMO;
    process.env.AUPHONIC_API_KEY = "key-1";
    expect(videoEditDemoEnabled()).toBe(false);
  });
});

describe("edit jobs", () => {
  it("stays processing until the demo time is up, then stores a sample result", async () => {
    mockedDb.mockResolvedValueOnce({ rows: [{ age: 4 }] });
    expect((await refreshVideoEditJob(jobRow())).status).toBe("processing");

    mockedDb.mockResolvedValue({ rows: [{ age: 40 }] });
    const done = await refreshVideoEditJob(jobRow());
    expect(done.status).toBe("ready");
    expect(done.result).toMatchObject({ demo: true, originalSeconds: 600 });
  });

  it("starts a demo job from just a file name — nothing is uploaded", async () => {
    mockedDb.mockImplementation(async (sql: string) =>
      sql.includes("INSERT INTO video_edit_jobs") ? { rows: [jobRow()] } : { rows: [], rowCount: 0 }
    );
    global.fetch = jest.fn() as jest.Mock;

    const response = await createEdit(post({ title: "Prompt Chaining", fileName: "C:\\videos\\lecture.mp4", sourceSeconds: 600.4 }));

    expect(response.status).toBe(201);
    expect((await response.json()).job).toMatchObject({ demo: true, status: "processing", fileName: "lecture.mp4" });
    const insert = mockedDb.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO video_edit_jobs"))!;
    expect(insert[1]).toEqual([5, null, "Prompt Chaining", "lecture.mp4", 600]); // path stripped, length rounded
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects non-video files and a missing title; says so when demo is off", async () => {
    expect((await createEdit(post({ title: "T", fileName: "notes.pdf" }))).status).toBe(400);
    expect((await createEdit(post({ fileName: "lecture.mp4" }))).status).toBe(400);
    process.env.VIDEO_EDIT_DEMO = "off";
    expect((await createEdit(post({ title: "T", fileName: "lecture.mp4" }))).status).toBe(503);
  });
});

describe("Auphonic editing", () => {
  const json = (data: unknown, status = 200) => ({ ok: status < 300, status, json: async () => ({ data }) });
  const auphonicRow = (overrides: Partial<VideoEditJobRow> = {}) => jobRow({ provider: "auphonic", provider_job_id: "prod-1", ...overrides });
  beforeEach(() => { process.env.AUPHONIC_API_KEY = "key-1"; });

  it("on the free plan asks only for silences cut and audio levelled", () => {
    expect(productionSettings("Prompt Chaining")).toEqual({
      metadata: { title: "Prompt Chaining" },
      algorithms: { leveler: true, normloudness: true, loudnesstarget: -16, silence_cutter: true, cut_mode: "apply_cuts" },
      output_files: [{ format: "video" }],
    });
  });

  it("adds subtitles when speech recognition is switched on (paid plan)", () => {
    process.env.AUPHONIC_SUBTITLES = "on";
    expect(productionSettings("Prompt Chaining")).toEqual({
      metadata: { title: "Prompt Chaining" },
      algorithms: { leveler: true, normloudness: true, loudnesstarget: -16, silence_cutter: true, cut_mode: "apply_cuts" },
      speech_recognition: { language: "en" },
      output_files: [{ format: "video" }, { format: "subtitle", ending: "vtt" }],
    });
  });

  it("creates a production and tells the browser where to upload the recording", async () => {
    mockedDb.mockImplementation(async (sql: string) =>
      sql.includes("INSERT INTO video_edit_jobs") ? { rows: [auphonicRow({ id: 7 })] } : { rows: [], rowCount: 0 }
    );
    global.fetch = jest.fn().mockResolvedValue(json({ uuid: "prod-1", status: 9 })) as jest.Mock;

    const response = await createEdit(post({ title: "Prompt Chaining", fileName: "lecture.mp4", sourceSeconds: 600 }));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ job: { id: 7, demo: false, status: "processing" }, upload: "/api/tutor/video-edits/7/upload/" });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://auphonic.com/api/productions.json");
    expect(init.headers).toMatchObject({ Authorization: "Bearer key-1" });
    const insert = mockedDb.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO video_edit_jobs"))!;
    expect(insert[1]).toEqual([5, null, "Prompt Chaining", "lecture.mp4", 600, "prod-1"]);
  });

  it("doesn't create a job when Auphonic refuses the production", async () => {
    mockedDb.mockResolvedValue({ rows: [], rowCount: 0 });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error_message: "bad key" }) }) as jest.Mock;
    const response = await createEdit(post({ title: "T", fileName: "lecture.mp4" }));
    expect(response.status).toBe(502);
    expect(mockedDb.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO video_edit_jobs"))).toBe(false);
  });

  it("reports the current stage while Auphonic is working", async () => {
    global.fetch = jest.fn().mockResolvedValue(json({ uuid: "prod-1", status: 14 })) as jest.Mock;
    const row = await refreshVideoEditJob(auphonicRow());
    expect(row).toMatchObject({ status: "processing", stage: "Transcribing speech for the subtitles" });
  });

  it("turns a finished production into a result, keeping the file link server-side", async () => {
    mockedDb.mockResolvedValue({ rows: [], rowCount: 1 });
    const vtt = "WEBVTT\n\n1\n00:00:00.500 --> 00:00:03.000\nWelcome back to the course.\n\n2\n00:00:03.200 --> 00:00:06.000 line:90%\n<v Tutor>Today: prompt chaining.\n";
    global.fetch = jest.fn()
      .mockResolvedValueOnce(json({
        uuid: "prod-1", status: 3, length: 540.4,
        statistics: { levels: { input: { loudness: [-27.3, "LUFS"] }, output: { loudness: [-16, "LUFS"] } } },
        output_files: [
          { format: "video", ending: "mp4", download_url: "https://auphonic.com/api/download/audio-result/prod-1/lecture.mp4" },
          { format: "subtitle", ending: "vtt", download_url: "https://auphonic.com/api/download/audio-result/prod-1/lecture.vtt" },
        ],
      }))
      .mockResolvedValueOnce({ ok: true, text: async () => vtt }) as jest.Mock;

    const row = await refreshVideoEditJob(auphonicRow({ id: 7 }));

    expect(row.status).toBe("ready");
    expect(row.result).toMatchObject({
      demo: false, originalSeconds: 600, editedSeconds: 540, secondsRemoved: 60, silencesRemoved: null,
      loudnessBefore: "-27 LUFS", loudnessAfter: "-16 LUFS", subtitleCues: 2, wordCount: 8,
      downloadUrl: "/api/tutor/video-edits/7/download/", vtt,
    });
    expect(row.result!.subtitlePreview[1]).toEqual({ start: 3.2, end: 6, text: "Today: prompt chaining." });
    expect(JSON.stringify(row.result)).not.toContain("auphonic.com"); // the keyed link never reaches the browser
    expect(row.storage_key).toBe("https://auphonic.com/api/download/audio-result/prod-1/lecture.mp4");
    expect((global.fetch as jest.Mock).mock.calls[1][1].headers).toMatchObject({ Authorization: "Bearer key-1" });
  });

  it("fails the job with Auphonic's own message, and survives a network blip", async () => {
    mockedDb.mockResolvedValue({ rows: [], rowCount: 1 });
    global.fetch = jest.fn().mockResolvedValueOnce(json({ uuid: "prod-1", status: 2, error_message: "Not enough credits." })) as jest.Mock;
    expect(await refreshVideoEditJob(auphonicRow())).toMatchObject({ status: "failed", error: "Not enough credits." });

    jest.spyOn(console, "error").mockImplementation(() => undefined);
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNRESET")) as jest.Mock;
    expect((await refreshVideoEditJob(auphonicRow())).status).toBe("processing");
  });

  it("reads WebVTT with or without hours", () => {
    expect(parseVtt("WEBVTT\n\n00:01.000 --> 00:02.500\nHi\n\n01:00:00.000 --> 01:00:01.000\nBye")).toEqual([
      { start: 1, end: 2.5, text: "Hi" }, { start: 3600, end: 3601, text: "Bye" },
    ]);
  });

  it("streams the edited video to its owner only, and never sends the key anywhere but Auphonic", async () => {
    const get = (headers?: Record<string, string>) =>
      download(Object.assign(new Request("http://localhost/api/tutor/video-edits/7/download/", { headers }), { nextUrl: new URL("http://localhost/api/tutor/video-edits/7/download/") }) as never,
        { params: Promise.resolve({ id: "7" }) });
    const ready = { status: "ready" as const, result: buildDemoEditResult("T", 60) };

    mockedDb.mockResolvedValue({ rows: [] }); // someone else's job
    expect((await get()).status).toBe(404);

    global.fetch = jest.fn() as jest.Mock;
    mockedDb.mockResolvedValue({ rows: [auphonicRow({ ...ready, storage_key: "https://evil.example.com/steal" })] });
    expect((await get()).status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();

    mockedDb.mockResolvedValue({ rows: [auphonicRow({ ...ready, storage_key: "https://auphonic.com/api/download/x/lecture.mp4" })] });
    global.fetch = jest.fn().mockResolvedValue(new Response("bytes", { status: 206, headers: { "content-type": "video/mp4", "content-range": "bytes 0-4/5" } })) as jest.Mock;
    const response = await get({ range: "bytes=0-4" });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Prompt-Chaining-edited.mp4"');
    expect(response.headers.get("content-range")).toBe("bytes 0-4/5");
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers).toEqual({ Authorization: "Bearer key-1", Range: "bytes=0-4" });
  });
});

describe("YouTube delivery framework", () => {
  const enable = () => {
    process.env.VIDEO_DELIVERY = "youtube";
    process.env.YOUTUBE_CLIENT_ID = "client-1";
    process.env.YOUTUBE_CLIENT_SECRET = "secret-1";
  };

  it("is off by default and needs both the switch and Google credentials", () => {
    expect(videoDelivery()).toBe("download");
    process.env.VIDEO_DELIVERY = "youtube";
    expect(videoDelivery()).toBe("download"); // no credentials yet
    enable();
    expect(videoDelivery()).toBe("youtube");
  });

  it("builds the consent URL with offline access and both scopes", () => {
    enable();
    const url = new URL(buildAuthUrl(5));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("redirect_uri")).toBe("https://learning.example.com/api/tutor/youtube/callback/");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toContain("youtube.upload");
    expect(url.searchParams.get("scope")).toContain("youtube.force-ssl");
    expect(verifyOAuthState(url.searchParams.get("state")!)).toBe(5);
  });

  it("only accepts an untampered, unexpired state for the tutor it was issued to", () => {
    const state = createOAuthState(5);
    expect(verifyOAuthState(state)).toBe(5);
    expect(verifyOAuthState(state.replace(/^5\./, "6."))).toBeNull(); // someone else's id
    expect(verifyOAuthState(state.slice(0, -2) + "xx")).toBeNull(); // bad signature
    const [id, , nonce] = state.split(".");
    expect(verifyOAuthState(`${id}.1.${nonce}.sig`)).toBeNull(); // expired + unsigned
    expect(verifyOAuthState("garbage")).toBeNull();
  });

  it("stores refresh tokens encrypted and can read them back", () => {
    const stored = encryptToken("1//refresh-token-value");
    expect(stored).not.toContain("refresh-token-value");
    expect(decryptToken(stored)).toBe("1//refresh-token-value");
    expect(encryptToken("1//refresh-token-value")).not.toBe(stored); // fresh IV each time
    expect(() => decryptToken(stored.slice(0, -3) + "AAA")).toThrow(); // tampering is detected
  });

  it("uploads with the resumable protocol, streaming the file from its URL", async () => {
    const fileBody = new Response("video-bytes").body;
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers({ location: "https://upload.example.com/session-1" }) })
      .mockResolvedValueOnce({ ok: true, body: fileBody })
      .mockResolvedValueOnce({ status: 201, json: async () => ({ id: "abc123XYZ_-" }) }) as jest.Mock;

    const id = await uploadVideo("token-1", { url: "https://bucket.example.com/out.mp4", sizeBytes: 11, contentType: "video/mp4" },
      { title: "Prompt Chaining", description: "d", privacyStatus: "unlisted" });

    expect(id).toBe("abc123XYZ_-");
    const [startUrl, startInit] = (global.fetch as jest.Mock).mock.calls[0];
    expect(startUrl).toBe("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status");
    expect(startInit.headers).toMatchObject({ Authorization: "Bearer token-1", "X-Upload-Content-Length": "11", "X-Upload-Content-Type": "video/mp4" });
    expect(JSON.parse(startInit.body)).toMatchObject({ snippet: { title: "Prompt Chaining" }, status: { privacyStatus: "unlisted" } });
    const [putUrl, putInit] = (global.fetch as jest.Mock).mock.calls[2];
    expect(putUrl).toBe("https://upload.example.com/session-1");
    expect(putInit).toMatchObject({ method: "PUT", body: fileBody });
  });

  it("attaches subtitles as a multipart caption upload", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock;
    await uploadCaptions("token-1", "abc123XYZ_-", "WEBVTT\n\n1\n00:00:00.000 --> 00:00:03.000\nHi\n");
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet");
    expect(init.headers["Content-Type"]).toMatch(/^multipart\/related; boundary=/);
    expect(init.body).toContain('"videoId":"abc123XYZ_-"');
    expect(init.body).toContain("WEBVTT");
  });

  it("refuses to post when delivery is 'download', and never posts a demo result", async () => {
    const call = () => publish(new Request("http://localhost/x", { method: "POST" }) as never, { params: Promise.resolve({ id: "1" }) });
    global.fetch = jest.fn() as jest.Mock;

    expect((await call()).status).toBe(409); // switched off

    enable();
    mockedDb.mockResolvedValue({ rows: [jobRow({ status: "ready", result: buildDemoEditResult("T", 60) })] });
    const response = await call();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/demo result/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
