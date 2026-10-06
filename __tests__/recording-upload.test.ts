jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => ({ db: { query: jest.fn() } }));
jest.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => ({ check: () => ({ limited: false, retryAfterMs: 0 }) }),
  rateLimitResponse: () => new Response("{}", { status: 429 }),
}));
jest.mock("@/lib/auphonic", () => ({
  ...jest.requireActual("@/lib/auphonic"),
  forwardUpload: jest.fn(async () => undefined),
  startProduction: jest.fn(async () => ({ uuid: "prod-1", status: 1 })),
  createProduction: jest.fn(async () => "prod-1"),
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { forwardUpload, startProduction } from "@/lib/auphonic";
import { createUploadToken, recordingUploadBase, verifyUploadToken } from "@/lib/upload-token";
import { videoEditConfigured, videoEditDemoEnabled } from "@/lib/video-edit";
import { POST as createEdit } from "@/app/api/tutor/video-edits/route";
import { OPTIONS, POST as upload } from "@/app/api/tutor/video-edits/[id]/upload/route";

const mockedDb = db.query as jest.Mock;
const ENV = ["RECORDING_UPLOAD_URL", "VERCEL", "AUPHONIC_API_KEY", "VIDEO_EDIT_DEMO", "NODE_ENV"] as const;
const saved = Object.fromEntries(ENV.map((key) => [key, process.env[key]]));
const setEnv = (key: string, value: string | undefined) => { if (value === undefined) delete (process.env as Record<string, string | undefined>)[key]; else (process.env as Record<string, string>)[key] = value; };

const job = { id: 7, owner_user_id: 5, title: "T", file_name: "lecture.mp4", source_seconds: 60, storage_key: null, provider: "auphonic", provider_job_id: "prod-1", status: "processing", result: null, youtube_video_id: null, error: null, created_at: new Date().toISOString() };
const uploadRequest = (headers: Record<string, string> = {}) =>
  new Request("https://upload.example.com/api/tutor/video-edits/7/upload/", {
    method: "POST", body: "--b\r\ncontent\r\n--b--", duplex: "half",
    headers: { "content-type": "multipart/form-data; boundary=b", "content-length": "21", ...headers },
  } as RequestInit) as never;
const params = { params: Promise.resolve({ id: "7" }) };

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of ENV) setEnv(key, saved[key]);
  setEnv("RECORDING_UPLOAD_URL", undefined);
  setEnv("VERCEL", undefined);
  process.env.NEXTAUTH_SECRET = "test-secret";
  process.env.AUPHONIC_API_KEY = "key-1";
  (getServerSession as jest.Mock).mockResolvedValue(null);
  mockedDb.mockResolvedValue({ rows: [job], rowCount: 1 });
});
afterAll(() => { for (const key of ENV) setEnv(key, saved[key]); });

describe("upload token", () => {
  it("is only good for the job and user it was issued for, until it expires", () => {
    const token = createUploadToken(7, 5);
    expect(verifyUploadToken(token, 7)).toBe(5);
    expect(verifyUploadToken(token, 8)).toBeNull(); // another job
    expect(verifyUploadToken(token.replace(/^7\.5\./, "7.6."), 7)).toBeNull(); // another user
    expect(verifyUploadToken(token.slice(0, -3) + "abc", 7)).toBeNull(); // tampered
    expect(verifyUploadToken(token, 7, Date.now() + 3 * 60 * 60 * 1000)).toBeNull(); // expired
    expect(verifyUploadToken("garbage", 7)).toBeNull();
    expect(verifyUploadToken(undefined, 7)).toBeNull();
  });

  it("can't be forged without the shared secret", () => {
    const token = createUploadToken(7, 5);
    process.env.NEXTAUTH_SECRET = "a-different-secret";
    expect(verifyUploadToken(token, 7)).toBeNull();
  });

  it("only sends uploads to a plain https address", () => {
    expect(recordingUploadBase()).toBeNull();
    process.env.RECORDING_UPLOAD_URL = "https://alma-uploads.onrender.com/";
    expect(recordingUploadBase()).toBe("https://alma-uploads.onrender.com");
    process.env.RECORDING_UPLOAD_URL = "http://insecure.example.com";
    expect(recordingUploadBase()).toBeNull();
    process.env.RECORDING_UPLOAD_URL = "https://example.com/some/path";
    expect(recordingUploadBase()).toBeNull();
  });
});

describe("where tidy-up is offered", () => {
  it("needs an upload address on Vercel, which can't take large uploads itself", () => {
    expect(videoEditConfigured()).toBe(true);
    process.env.VERCEL = "1";
    expect(videoEditConfigured()).toBe(false);
    process.env.RECORDING_UPLOAD_URL = "https://alma-uploads.onrender.com";
    expect(videoEditConfigured()).toBe(true);
  });

  it("doesn't show the simulated tidy-up on a live site unless asked to", () => {
    setEnv("AUPHONIC_API_KEY", undefined);
    expect(videoEditDemoEnabled()).toBe(true); // development and tests
    setEnv("NODE_ENV", "production");
    expect(videoEditDemoEnabled()).toBe(false);
    process.env.VIDEO_EDIT_DEMO = "on";
    expect(videoEditDemoEnabled()).toBe(true);
  });
});

describe("uploading to the large-upload copy", () => {
  it("starting a tidy-up hands the browser that address and a token", async () => {
    process.env.RECORDING_UPLOAD_URL = "https://alma-uploads.onrender.com";
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: "5", role: "tutor" } });
    mockedDb.mockImplementation(async (sql: string) => (String(sql).includes("INSERT INTO video_edit_jobs") ? { rows: [job] } : { rows: [], rowCount: 0 }));
    const response = await createEdit(new Request("http://localhost/api/tutor/video-edits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "T", fileName: "lecture.mp4" }) }) as never);
    const data = await response.json();
    expect(data.upload).toBe("https://alma-uploads.onrender.com/api/tutor/video-edits/7/upload/");
    expect(verifyUploadToken(data.uploadToken, 7)).toBe(5);
  });

  it("accepts a valid token with no login cookie, for that tutor's own job", async () => {
    const response = await upload(uploadRequest({ "x-upload-token": createUploadToken(7, 5) }), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(mockedDb.mock.calls[0][1]).toEqual([7, 5]); // looked up as job 7 owned by user 5
    expect(forwardUpload).toHaveBeenCalledTimes(1);
    expect(startProduction).toHaveBeenCalledWith("prod-1");
  });

  it("refuses a bad, expired or wrong-job token, and anyone with neither token nor login", async () => {
    expect((await upload(uploadRequest({ "x-upload-token": "7.5.9999999999999.forged" }), params)).status).toBe(401);
    expect((await upload(uploadRequest({ "x-upload-token": createUploadToken(8, 5) }), params)).status).toBe(401);
    expect((await upload(uploadRequest(), params)).status).toBe(401);
    expect(forwardUpload).not.toHaveBeenCalled();
  });

  it("answers the browser's cross-site pre-check", () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toContain("x-upload-token");
  });
});
