"use client";

import { useState } from "react";
import { FileSignature, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export type NdaSigned = { signedName: string; signedAt: string; brief: string | null };

/**
 * A branded assignment's confidentiality agreement, shown before the brief.
 * The learner reads it, types their full name and ticks the box; the brief and
 * the hand-in open once the server has recorded the signature.
 */
export function AssignmentNdaPanel({ lessonId, brandName, text, onSigned }: { lessonId: string; brandName: string; text: string; onSigned: (signed: NdaSigned) => void }) {
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sign() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/assignment/nda", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId, name, agree }) });
      const data = (await res.json().catch(() => ({}))) as Partial<NdaSigned> & { error?: string };
      if (!res.ok || !data.signedName || !data.signedAt) throw new Error(data.error ?? "Couldn't record your signature. Try again.");
      onSigned({ signedName: data.signedName, signedAt: data.signedAt, brief: data.brief ?? null });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 p-4 sm:p-5" aria-labelledby={`nda-${lessonId}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Lock className="h-4 w-4" aria-hidden="true" /></span>
        <div>
          <h4 id={`nda-${lessonId}`} className="text-base font-semibold text-zinc-900">Confidentiality agreement</h4>
          <p className="text-sm text-zinc-600">This assignment uses information from {brandName}. Read and sign the agreement to see the brief and hand in your work.</p>
        </div>
      </div>
      <div tabIndex={0} aria-label="The agreement" className="max-h-72 overflow-auto whitespace-pre-line rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 text-sm leading-relaxed text-zinc-800">
        {text}
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="block text-sm font-medium text-zinc-800">Your full name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name"
            className="focus-ring mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-zinc-900" />
        </label>
        <Button type="button" onClick={() => void sign()} disabled={busy || !agree || name.trim().length < 2}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}Sign and open the brief
        </Button>
      </div>
      <label className="flex items-start gap-2 text-sm text-zinc-700">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-[rgb(var(--brand-primary,35_174_151))]" />
        I have read this agreement and agree to keep {brandName}&apos;s confidential information confidential.
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
