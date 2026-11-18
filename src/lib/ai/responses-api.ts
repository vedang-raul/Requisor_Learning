/**
 * Wrapper for the xAI Responses API (POST /v1/responses).
 * Used for non-streaming AI calls that need live web search, which is only
 * available on the Responses API, not the Chat Completions endpoint.
 *
 * Returns the model's text output and any URL citations extracted from
 * output[].content[].annotations (url_citation type).
 */
import { after } from "next/server";
import { db } from "@/lib/server/db";
import type { AiFeature } from "@/lib/ai/usage";
import type { AiSource } from "@/lib/ai/sources";
import { citationsToSources } from "@/lib/ai/sources";

const BASE_URL = "https://api.x.ai/v1";

type UsageContext = { userId: unknown; feature: AiFeature };

type ResponsesInput =
  | { role: "user" | "assistant"; content: string }[];

type ResponsesOutput = {
  object?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{ type?: string; url?: string; title?: string; start_index?: number; end_index?: number }>;
    }>;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

async function recordUsage(context: UsageContext, model: string, inputTokens: number, outputTokens: number) {
  const userId = typeof context.userId === "number" && Number.isSafeInteger(context.userId) && context.userId > 0
    ? context.userId
    : typeof context.userId === "string" ? (Number.isSafeInteger(Number(context.userId)) && Number(context.userId) > 0 ? Number(context.userId) : null) : null;
  if (!userId) return;
  try {
    after(async () => {
      await db.query(
        `INSERT INTO ai_usage (user_id, feature, provider, model, input_tokens, output_tokens, units, unit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [userId, context.feature, "xai", model.slice(0, 80), Math.round(inputTokens), Math.round(outputTokens), 0, ""]
      );
    });
  } catch {
    // usage recording is best-effort
  }
}

export type ResponsesApiResult = {
  text: string;
  citations: AiSource[];
};

/**
 * Calls the xAI Responses API with optional web search.
 * The `instructions` parameter maps to the system-level prompt.
 * Uses prompt-based JSON output (not a structured output mode), so callers
 * must still validate and parse the returned text.
 */
export async function xaiResponsesCall(
  context: UsageContext,
  apiKey: string,
  opts: {
    instructions?: string;
    input: ResponsesInput;
    model: string;
    maxOutputTokens: number;
    temperature?: number;
    webSearch?: boolean;
    signal?: AbortSignal;
  }
): Promise<ResponsesApiResult> {
  const body: Record<string, unknown> = {
    model: opts.model,
    input: opts.input,
    max_output_tokens: opts.maxOutputTokens,
  };
  if (opts.instructions) body.instructions = opts.instructions;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.webSearch) body.tools = [{ type: "web_search" }];

  const res = await fetch(`${BASE_URL}/responses`, {
    method: "POST",
    signal: opts.signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`xAI Responses API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as ResponsesApiResult extends never ? never : ResponsesOutput;

  // Extract text and annotations from output
  let text = "";
  const rawAnnotations: Array<{ type: string; url?: string; title?: string }> = [];
  for (const out of data.output ?? []) {
    if (out.type !== "message") continue;
    for (const block of out.content ?? []) {
      if (block.type === "output_text") {
        text += block.text ?? "";
        for (const ann of block.annotations ?? []) {
          if (ann && typeof ann.type === "string") rawAnnotations.push(ann as { type: string; url?: string; title?: string });
        }
      }
    }
  }

  const citations = citationsToSources(rawAnnotations, text);

  // Record token usage
  if (data.usage) {
    void recordUsage(
      context,
      opts.model,
      data.usage.input_tokens ?? 0,
      data.usage.output_tokens ?? 0
    );
  }

  return { text: text.trim(), citations };
}
