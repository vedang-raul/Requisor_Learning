import { Pool } from "pg";
import { readFileSync } from "node:fs";

const mockQuery = jest.fn();
const mockMakePool = jest.fn();
jest.mock("@/lib/server/db", () => ({
  db: { query: (...args: unknown[]) => mockQuery(...args) },
  makePool: (...args: unknown[]) => mockMakePool(...args),
}));

import { createRateLimiter } from "@/lib/server/rate-limit";

// Explicit opt-in: this test only creates/drops its own isolated schema, never
// runs the application's full migration or touches user data.
const describeDatabase = process.env.RUN_AI_DB_TESTS === "1" && process.env.DATABASE_URL
  ? describe : describe.skip;

describeDatabase("AI controls with independent workers and real PostgreSQL", () => {
  const schema = `ai_controls_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const pools: Pool[] = [];
  let admin: Pool;
  let storage: Pool;
  const makePool = (max = 10) => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
      max,
    });
    pools.push(pool);
    return pool;
  };

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    storage = makePool();
    // Execute exactly the new migration DDL, twice to check idempotence.
    const migration = readFileSync("scripts/migrate.js", "utf8");
    const tableSql = migration.match(/CREATE TABLE IF NOT EXISTS ai_rate_limits \([\s\S]*?CREATE INDEX IF NOT EXISTS ai_rate_limits_reset_at_idx[^;]+;/)?.[0];
    expect(tableSql).toBeTruthy();
    await storage.query(tableSql!);
    await storage.query(tableSql!);
    mockQuery.mockImplementation((...args: Parameters<Pool["query"]>) => storage.query(...args));
    mockMakePool.mockImplementation(makePool);
  });

  afterAll(async () => {
    await Promise.all(pools.map((pool) => pool.end()));
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });

  it("enforces one atomic quota across workers, restarts, accounts, and scopes", async () => {
    const a = createRateLimiter(5, 60_000, "ai:integration:chat");
    const b = createRateLimiter(5, 60_000, "ai:integration:chat");
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) =>
      (i % 2 ? a : b).check(i % 2 ? "USER@example.test" : "user@example.test")
    ));
    expect(results.filter((result) => !result.limited)).toHaveLength(5);
    expect(results.filter((result) => result.limited)).toHaveLength(25);
    expect(results.filter((result) => result.limited).every((r) => r.retryAfterMs > 0)).toBe(true);
    const restarted = createRateLimiter(5, 60_000, "ai:integration:chat");
    expect((await restarted.check("user@example.test")).limited).toBe(true);
    expect((await a.check("another@example.test")).limited).toBe(false);
    expect((await createRateLimiter(5, 60_000, "ai:integration:quiz").check("user@example.test")).limited).toBe(false);
    await storage.query("UPDATE ai_rate_limits SET reset_at = NOW() - interval '1 second'");
    expect((await restarted.check("user@example.test")).limited).toBe(false);
  });

  it("cleans expired inactive accounts without resetting a live counter", async () => {
    await storage.query(`INSERT INTO ai_rate_limits VALUES
      ('ai:old', 'old-account', 1, NOW() - interval '2 days')`);
    await createRateLimiter(5, 60_000, "ai:cleanup").check("user@example.test");
    const result = await storage.query("SELECT * FROM ai_rate_limits WHERE account_key = 'old-account'");
    expect(result.rows).toHaveLength(0);
  });

  it("holds shared slots across worker modules and recovers after disconnect", async () => {
    const previousLimit = process.env.AI_CONCURRENCY_LIMIT;
    process.env.AI_CONCURRENCY_LIMIT = "2";
    let workerA!: typeof import("@/lib/ai/ai-semaphore");
    let workerB!: typeof import("@/lib/ai/ai-semaphore");
    jest.isolateModules(() => { workerA = require("@/lib/ai/ai-semaphore"); });
    jest.isolateModules(() => { workerB = require("@/lib/ai/ai-semaphore"); });
    if (previousLimit === undefined) delete process.env.AI_CONCURRENCY_LIMIT;
    else process.env.AI_CONCURRENCY_LIMIT = previousLimit;

    const releaseA = await workerA.acquireAiSlot();
    const releaseB = await workerB.acquireAiSlot();
    try {
      await expect(workerA.acquireAiSlot()).rejects.toThrow("overloaded");
      releaseA();
      // Session disconnect reaches Postgres asynchronously; a new connection is
      // the synchronization point before trying to reuse the released slot.
      await storage.query("SELECT 1");
      let recovered: (() => void) | undefined;
      for (let i = 0; i < 10 && !recovered; i++) {
        try { recovered = await workerB.acquireAiSlot(); }
        catch { await new Promise((resolve) => setTimeout(resolve, 10)); }
      }
      expect(recovered).toBeDefined();
      recovered?.();
    } finally {
      releaseA();
      releaseB();
    }
  });
});
