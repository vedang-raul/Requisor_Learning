"use client";

import { useEffect, useState } from "react";
import { Gauge, Loader2 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The person's own use of the AI services, on their profile: tokens for the AI
 * writing features, and characters, recordings and seconds for voice and video.
 * Data from GET /api/profile/ai-usage.
 */
type FeatureUsage = { feature: string; label: string; requests: number; inputTokens: number; outputTokens: number; units: number; unit: string };
type Usage = {
  days: number;
  since: string;
  totals: { inputTokens: number; outputTokens: number; requests: number; voiceCharacters: number; recordings: number; videoSeconds: number };
  features: FeatureUsage[];
  daily: { day: string; tokens: number }[];
};

const PERIODS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];
const number = new Intl.NumberFormat();
const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const UNIT_LABEL: Record<string, string> = { characters: "characters spoken", recordings: "recordings", seconds: "seconds of video" };

/** Every day of the period, so quiet days show as gaps rather than being skipped. */
function fillDays(daily: Usage["daily"], days: number): { day: string; tokens: number }[] {
  const byDay = new Map(daily.map((d) => [d.day, d.tokens]));
  const shown = Math.min(days, 30);
  return Array.from({ length: shown }, (_, i) => {
    const date = new Date(Date.now() - (shown - 1 - i) * 24 * 60 * 60_000);
    const key = date.toISOString().slice(0, 10);
    return { day: key, tokens: byDay.get(key) ?? 0 };
  });
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-zinc-900" title={number.format(value)}>{compact.format(value)}</p>
      {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

export function AiUsageCard() {
  const [days, setDays] = useState(30);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`/api/profile/ai-usage/?days=${days}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return (await res.json()) as Usage;
      })
      .then((data) => { if (alive) setUsage(data); })
      .catch(() => { if (alive) setError("Couldn't load your AI usage. Try again in a moment."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [days]);

  const totals = usage?.totals;
  const tokens = totals ? totals.inputTokens + totals.outputTokens : 0;
  const bars = usage ? fillDays(usage.daily, usage.days) : [];
  const peak = Math.max(1, ...bars.map((b) => b.tokens));
  const empty = usage && usage.features.length === 0;

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-1.5"><Gauge className="h-4 w-4 text-primary" aria-hidden="true" /></div>
          <CardTitle>AI usage</CardTitle>
        </div>
        <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => setDays(p.days)}
              aria-pressed={days === p.days}
              className={cn("focus-ring rounded-md px-2.5 py-1 text-xs font-medium transition", days === p.days ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900")}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-4 text-xs text-zinc-500">
        The AI tokens your work has used: drafting courses and lessons, scripts, the assistant, and more. Input tokens are what was sent to the AI; output tokens are what it wrote back.
      </p>

      {loading && !usage && <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading your usage…</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {usage && totals && (
        <div className={cn("space-y-4 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Total tokens" value={tokens} />
            <Stat label="Input tokens" value={totals.inputTokens} />
            <Stat label="Output tokens" value={totals.outputTokens} />
            <Stat label="AI requests" value={totals.requests} />
          </div>
          {(totals.voiceCharacters > 0 || totals.recordings > 0 || totals.videoSeconds > 0) && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {totals.voiceCharacters > 0 && <Stat label="Voice" value={totals.voiceCharacters} hint="characters spoken" />}
              {totals.recordings > 0 && <Stat label="Voice input" value={totals.recordings} hint="recordings transcribed" />}
              {totals.videoSeconds > 0 && <Stat label="AI video" value={totals.videoSeconds} hint="seconds rendered" />}
            </div>
          )}

          {empty ? (
            <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-4 text-center text-sm text-zinc-500">
              No AI use in this period yet. Usage is counted from the day this section was added.
            </p>
          ) : (
            <>
              <div>
                <p className="mb-1.5 text-xs font-medium text-zinc-600">Tokens per day{usage.days > 30 ? " (last 30 days)" : ""}</p>
                <div className="flex h-20 items-end gap-[3px]" role="img" aria-label={`Tokens per day over the last ${bars.length} days`}>
                  {bars.map((b) => (
                    <div
                      key={b.day}
                      title={`${new Date(`${b.day}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}: ${number.format(b.tokens)} tokens`}
                      className={cn("min-w-0 flex-1 rounded-t-sm", b.tokens ? "bg-gradient-to-t from-primary to-secondary" : "bg-zinc-100")}
                      style={{ height: `${b.tokens ? Math.max(6, (b.tokens / peak) * 100) : 4}%` }}
                    />
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-[11px] uppercase tracking-wide text-zinc-500">
                      <th className="py-1.5 pr-3 font-medium">Feature</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Requests</th>
                      <th className="py-1.5 text-right font-medium">Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.features.map((f) => (
                      <tr key={`${f.feature}-${f.unit}`} className="border-b border-zinc-100 last:border-0">
                        <td className="py-1.5 pr-3 text-zinc-800">{f.label}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-600">{number.format(f.requests)}</td>
                        <td className="py-1.5 text-right tabular-nums text-zinc-900">
                          {f.unit
                            ? `${number.format(f.units)} ${UNIT_LABEL[f.unit] ?? f.unit}`
                            : <span title={`${number.format(f.inputTokens)} in · ${number.format(f.outputTokens)} out`}>{number.format(f.inputTokens + f.outputTokens)} tokens</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
