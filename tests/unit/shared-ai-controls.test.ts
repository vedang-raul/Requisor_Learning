jest.mock("@/lib/server/db", () => ({
  db: { query: jest.fn() },
  makePool: jest.fn(),
}));

import { EventEmitter } from "node:events";
import { db, makePool } from "@/lib/server/db";
import { createRateLimiter } from "@/lib/server/rate-limit";
import { acquireAiSlot, withAiConcurrency, SemaphoreFullError } from "@/lib/ai/ai-semaphore";
import { aiSlotSignal } from "@/lib/ai/slot-signal";

const query = db.query as jest.Mock;
const poolFactory = makePool as jest.Mock;
const connect = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  poolFactory.mockReturnValue({ connect, on: jest.fn() });
});

describe("shared AI rate limits", () => {
  it("uses the same stable scope and normalized account key across limiter instances", async () => {
    query.mockResolvedValue({ rows: [{ allowed: true }] });
    const workerA = createRateLimiter(2, 60_000, "ai:chat");
    const workerB = createRateLimiter(2, 60_000, "ai:chat");
    await workerA.check("Learner@Example.com");
    await workerB.check("learner@example.com");
    expect(query.mock.calls[0][1]).toEqual(query.mock.calls[1][1]);
    expect(query.mock.calls[0][1]).toEqual(["ai:chat", expect.stringMatching(/^[a-f0-9]{64}$/), 2, 60_000]);
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT");
  });

  it("returns the shared window retry time when an atomic increment is denied", async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ retry_ms: "1523" }] });
    await expect(createRateLimiter(1, 60_000, "ai:quiz").check("1"))
      .resolves.toEqual({ limited: true, retryAfterMs: 1523 });
  });

  it("denies paid work if shared quota storage is unavailable", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    query.mockRejectedValue(new Error("unavailable"));
    await expect(createRateLimiter(1, 60_000, "ai:quiz").check("1"))
      .resolves.toEqual({ limited: true, retryAfterMs: 5000 });
    log.mockRestore();
  });
});

function client(acquired = true) {
  return Object.assign(new EventEmitter(), {
    query: jest.fn().mockResolvedValue({ rows: [{ acquired }] }),
    release: jest.fn(),
  });
}

describe("deployment-wide AI slots", () => {
  it("holds a database lock until explicit release and releases only once", async () => {
    const connection = client();
    connect.mockResolvedValue(connection);
    const release = await acquireAiSlot();
    expect(connection.query).toHaveBeenCalledWith(
      "SELECT pg_try_advisory_lock(1095321939, $1::integer) AS acquired", [0]
    );
    expect(connection.release).not.toHaveBeenCalled();
    release();
    release();
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledWith(true);
  });

  it("does not call the provider when all shared slots are occupied", async () => {
    const connection = client(false);
    connect.mockResolvedValue(connection);
    const provider = jest.fn();
    await expect(withAiConcurrency(provider)).rejects.toBeInstanceOf(SemaphoreFullError);
    expect(provider).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledWith(true);
  });

  it("fails closed on database connection failure", async () => {
    connect.mockRejectedValueOnce(new Error("database unavailable"));
    const provider = jest.fn();
    await expect(withAiConcurrency(provider)).rejects.toBeInstanceOf(SemaphoreFullError);
    expect(provider).not.toHaveBeenCalled();
  });

  it("destroys the lock session after an upstream error", async () => {
    const connection = client();
    connect.mockResolvedValue(connection);
    await expect(withAiConcurrency(async () => { throw new Error("provider failed"); })).rejects.toThrow("provider failed");
    expect(connection.release).toHaveBeenCalledWith(true);
  });

  it("cancels active work on lock connection loss", async () => {
    const connection = client();
    connect.mockResolvedValue(connection);
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await withAiConcurrency(async (signal) => {
      expect(aiSlotSignal.getStore()).toBe(signal);
      expect(signal.aborted).toBe(false);
      connection.emit("error", new Error("connection lost"));
      expect(signal.aborted).toBe(true);
    });
    expect(connection.release).toHaveBeenCalledWith(true);
    log.mockRestore();
  });
});
