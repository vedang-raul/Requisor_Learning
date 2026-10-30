"use client";

import { useEffect, useId, useState } from "react";
import { Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askConfirm } from "@/components/ui/confirm-dialog";

/**
 * Super admin: choose which tutor teaches a course. Saving emails the new
 * tutor "You have been assigned to course X" (/api/admin/courses/[slug]/tutor).
 * Only tutors who can teach it are offered: its university's, or anyone for a
 * platform-wide course.
 */
type Tutor = { id: number; name: string | null; email: string; university: string | null };

/** The store reloads the catalog on this event (src/lib/store.tsx), so the new tutor shows everywhere. */
const CATALOG_CHANGED_EVENT = "requisor:data-changed";

export function CourseTutorPicker({ slug, courseTitle }: { slug: string; courseTitle: string }) {
  const id = useId();
  const [tutors, setTutors] = useState<Tutor[] | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setTutors(null);
    setMessage(null);
    fetch(`/api/admin/courses/${encodeURIComponent(slug)}/tutor/`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? "Couldn't load tutors.");
        return data as { tutorId: number | null; tutors: Tutor[] };
      })
      .then((data) => {
        if (!alive) return;
        setTutors(data.tutors);
        setCurrent(data.tutorId);
        setChoice(data.tutorId === null ? "" : String(data.tutorId));
      })
      .catch((error: Error) => { if (alive) { setTutors([]); setMessage({ tone: "error", text: error.message }); } });
    return () => { alive = false; };
  }, [slug]);

  const label = (t: Tutor) => `${t.name || t.email}${t.university ? ` — ${t.university}` : ""}`;
  const unchanged = choice === (current === null ? "" : String(current));
  // The current tutor may not be offered (e.g. moved to another university); still show who it is.
  const currentMissing = current !== null && tutors !== null && !tutors.some((t) => t.id === current);

  async function save() {
    const tutorId = choice === "" ? null : Number(choice);
    const tutor = tutors?.find((t) => t.id === tutorId);
    const question = tutor
      ? `Make ${label(tutor)} the tutor of "${courseTitle}"? They'll get an email saying they've been assigned.`
      : `Leave "${courseTitle}" without a tutor?`;
    if (!(await askConfirm(question, { confirmLabel: tutor ? "Assign tutor" : "Remove tutor" }))) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/admin/courses/${encodeURIComponent(slug)}/tutor/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tutorId }),
      });
      const data = await r.json().catch(() => ({})) as { error?: string; emailed?: boolean; changed?: boolean };
      if (!r.ok) throw new Error(data.error ?? "Couldn't change the tutor.");
      setCurrent(tutorId);
      window.dispatchEvent(new Event(CATALOG_CHANGED_EVENT));
      setMessage({
        tone: "ok",
        text: !tutor ? "The course has no tutor now."
          : !data.changed ? "No change."
            : data.emailed ? `Assigned. ${tutor.name || tutor.email} has been emailed.`
              : `Assigned, but the email to ${tutor.email} couldn't be sent.`,
      });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Couldn't change the tutor." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      <label htmlFor={id} className="flex items-center gap-1 text-zinc-600">
        <UserRound className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" /> Tutor
      </label>
      {tutors === null ? (
        <span className="inline-flex items-center gap-1 text-zinc-500"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Loading…</span>
      ) : (
        <>
          <select
            id={id}
            value={choice}
            onChange={(e) => { setChoice(e.target.value); setMessage(null); }}
            disabled={busy}
            className="focus-ring h-8 max-w-[16rem] rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-800"
          >
            <option value="">No tutor</option>
            {currentMissing && <option value={String(current)}>Current tutor (not eligible any more)</option>}
            {tutors.map((t) => <option key={t.id} value={String(t.id)}>{label(t)}</option>)}
          </select>
          <Button size="sm" variant="outline" onClick={() => void save()} disabled={busy || unchanged} className="h-8">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : "Assign"}
          </Button>
          {tutors.length === 0 && <span className="text-zinc-500">No eligible tutors yet.</span>}
        </>
      )}
      {message && (
        <span role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-red-600" : "text-emerald-700"}>
          {message.text}
        </span>
      )}
    </div>
  );
}
