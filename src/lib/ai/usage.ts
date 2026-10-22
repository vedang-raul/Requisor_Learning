import { after } from "next/server";
import { db } from "@/lib/server/db";
import { aiSlotSignal } from "./slot-signal";

/**
 * Records how much of the paid AI services each person uses, for the usage
 * section of their profile.
 *
 * Language-model calls (xAI) are recorded as tokens, read from the usage the
 * model reports with every answer. Voice and video are billed differently, so
 * they are recorded as units: characters spoken, recordings transcribed, and
 * seconds of video rendered. Recording never delays or breaks the feature
 * itself: it runs after the response, and a failure is only logged.
 */

export const AI_FEATURES = {
  assistant: "AI assistant chat",
  lesson_ai: "Lesson writing help",
  course_draft: "Course drafts",
  program_builder: "Program Builder",
  teleprompter: "Teleprompter scripts",
  assignment: "Personalised assignments",
  assignment_preview: "Assignment previews",
  quiz: "Quizzes",
  course_assessment: "Capstone assessments",
  team_insights: "Team insights",
  video_script: "AI video scripts",
  video_check: "AI video content checks",
  voice: "Assistant voice",
  voice_input: "Voice input",
  video_render: "AI video rendering",
} as const;
export type AiFeature = keyof typeof AI_FEATURES;

export type UsageContext = { userId: unknown; feature: AiFeature };
export type TokenUsage = { model: string; inputTokens: number; outputTokens: number };

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
const asUserId = (value: unknown) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/**
 * The tokens an xAI answer reports. Works on a whole JSON answer and on a
 * streamed one (server-sent events), where the usage arrives in the last chunk.
 */
export function readXaiUsage(body: string): TokenUsage | null {
  const pick = (data: unknown): TokenUsage | null => {
    if (!data || typeof data !== "object") return null;
    const { usage, model } = data as {
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown; completion_tokens_details?: { reasoning_tokens?: unknown } };
      model?: unknown;
    };
    if (!usage || typeof usage !== "object") return null;
    const inputTokens = count(usage.prompt_tokens);
    // Reasoning models think before they answer, and that thinking is billed as output
    // but reported apart from the answer: everything beyond the input counts.
    const outputTokens = Math.max(
      count(usage.completion_tokens) + count(usage.completion_tokens_details?.reasoning_tokens),
      count(usage.total_tokens) - inputTokens,
    );
    return inputTokens || outputTokens ? { model: typeof model === "string" ? model.slice(0, 80) : "", inputTokens, outputTokens } : null;
  };
  const text = body.trim();
  if (!text.startsWith("data:")) {
    try { return pick(JSON.parse(text)); } catch { return null; }
  }
  // Streamed: look from the end for the chunk that carries the usage.
  const lines = text.split("\n").filter((line) => line.startsWith("data:") && !line.includes("[DONE]"));
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"usage"')) continue;
    try {
      const found = pick(JSON.parse(lines[i].slice(5)));
      if (found) return found;
    } catch { /* a partial line; keep looking */ }
  }
  return null;
}

/** Runs after the response has been sent, or straight away outside a request. */
function later(task: () => Promise<void>) {
  try {
    after(task);
  } catch {
    void task();
  }
}

async function insertUsage(row: { userId: number; feature: AiFeature; provider: string; model: string; inputTokens: number; outputTokens: number; units: number; unit: string }) {
  try {
    await db.query(
      `INSERT INTO ai_usage (user_id, feature, provider, model, input_tokens, output_tokens, units, unit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [row.userId, row.feature, row.provider, row.model, row.inputTokens, row.outputTokens, row.units, row.unit]
    );
  } catch (error) {
    console.error("[ai-usage] couldn't record usage", error instanceof Error ? error.message : "unknown");
  }
}

/**
 * Calls xAI exactly like fetch, and records the tokens the answer used against
 * the person. A streamed request is asked to include its usage at the end.
 */
export async function xaiFetch(context: UsageContext, url: string, init: RequestInit): Promise<Response> {
  let body = init.body;
  if (typeof body === "string" && body.includes('"stream":true')) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      if (parsed.stream === true && !parsed.stream_options) body = JSON.stringify({ ...parsed, stream_options: { include_usage: true } });
    } catch { /* leave the request as it is */ }
  }
  const slotSignal = aiSlotSignal.getStore();
  const signal = slotSignal
    ? AbortSignal.any([slotSignal, ...(init.signal ? [init.signal] : [])])
    : init.signal;
  const res = await fetch(url, { ...init, body, signal });
  const userId = asUserId(context.userId);
  if (!res.ok || !userId || !(res.body instanceof ReadableStream)) return res;
  // The answer is watched as the caller reads it: nothing is buffered twice, and
  // cancelling the read (the person stops a reply) still cancels the request.
  const decoder = new TextDecoder();
  let seen = "";
  const watch = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (seen.length < MAX_WATCHED_CHARS) seen += decoder.decode(chunk, { stream: true });
      controller.enqueue(chunk);
    },
    flush() {
      const usage = readXaiUsage(seen + decoder.decode());
      if (usage) later(() => insertUsage({ userId, feature: context.feature, provider: "xai", model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, units: 0, unit: "" }));
    },
  });
  return new Response(res.body.pipeThrough(watch), { status: res.status, statusText: res.statusText, headers: res.headers });
}

/** More than any answer the platform asks for; a longer one is passed on but not measured. */
const MAX_WATCHED_CHARS = 2_000_000;

/** Records use of a service billed by something other than tokens: characters, recordings or seconds. */
export function recordUnits(context: UsageContext, provider: string, units: number, unit: "characters" | "recordings" | "seconds") {
  const userId = asUserId(context.userId);
  const amount = count(units);
  if (!userId || !amount) return;
  later(() => insertUsage({ userId, feature: context.feature, provider, model: "", inputTokens: 0, outputTokens: 0, units: amount, unit }));
}
