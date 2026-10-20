"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Search, UserCheck, UserMinus, X } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { UniversityOption } from "@/lib/branding-client";

/**
 * Managing people. A university admin sees their own university's students and
 * tutors: approves tutor requests (students join freely), switches people
 * between tutor and student, and takes people out. A super admin sees everyone and can
 * also move people between universities and make university admins.
 * The rules live in src/lib/auth/people-rules.ts; this only shows them.
 */
type PersonRow = {
  id: number; name: string; email: string; role: "employee" | "tutor" | "admin"; superAdmin: boolean;
  universityId: number | null; universityName: string | null; status: "active" | "pending" | null;
  requestedRole: string | null; lastLoginAt: string | null;
};

const ROLE_LABEL = { employee: "Student", tutor: "Tutor", admin: "University admin" } as const;
const selectClass = "focus-ring h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-800";

export function PeoplePanel({ superAdmin, universities }: { superAdmin: boolean; universities: UniversityOption[] }) {
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [filter, setFilter] = useState<"" | "tutor-requests">("");
  const [university, setUniversity] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (filter) params.set("filter", filter);
    if (superAdmin && university) params.set("university", university);
    if (query.trim()) params.set("q", query.trim());
    fetch(`/api/admin/people/?${params}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { people: [] }))
      .then((data: { people?: PersonRow[] }) => setPeople(data.people ?? []))
      .catch(() => setPeople([]));
  }, [filter, superAdmin, university, query]);

  useEffect(() => {
    const timer = setTimeout(load, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  async function act(person: PersonRow, body: Record<string, unknown>, done: string) {
    setBusy(person.id);
    setNote(null);
    try {
      const res = await fetch("/api/admin/people/", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: person.id, ...body }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setNote({ ok: false, text: data.error ?? "That change couldn't be made." }); return false; }
      setNote({ ok: true, text: `${person.name || person.email}: ${done}. It takes effect within a few minutes.` });
      load();
      return true;
    } finally {
      setBusy(null);
    }
  }

  /** A super admin making someone an admin of a university: place them there first, then promote. */
  async function makeAdminOf(person: PersonRow, universityId: number) {
    if (person.universityId !== universityId || person.status !== "active") {
      if (!(await act(person, { action: "move", universityId }, "moved"))) return;
    }
    await act({ ...person, universityId, status: "active" }, { action: "set-role", role: "admin" }, "is now a university admin");
  }

  const pendingCount = people?.filter((p) => p.status === "pending").length ?? 0;
  const tutorRequests = people?.filter((p) => p.requestedRole === "tutor" && p.role === "employee").length ?? 0;

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <CardTitle>People and roles</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {superAdmin && (
            <select className={selectClass} value={university} onChange={(e) => setUniversity(e.target.value)} aria-label="University">
              <option value="">All universities</option>
              {universities.map((u) => <option key={u.id} value={String(u.id)}>{u.shortName}</option>)}
              <option value="none">No university</option>
            </select>
          )}
          <select className={selectClass} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Show">
            <option value="">Everyone</option>
            <option value="tutor-requests">Asked to teach</option>
          </select>
          <label className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or email" aria-label="Search people" className="focus-ring h-8 w-44 rounded-lg border border-zinc-200 bg-white pl-7 pr-2 text-xs" />
          </label>
        </div>
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        {superAdmin
          ? "Everyone on the platform. Super admins are set on the server and can't be changed here."
          : "The students and tutors of your university. Students join freely; people who ask to teach wait here for your approval."}
        {(pendingCount > 0 || tutorRequests > 0) && <span className="ml-1 font-medium text-amber-700">{pendingCount > 0 && `${pendingCount} waiting to join. `}{tutorRequests > 0 && `${tutorRequests} asked to teach.`}</span>}
      </p>
      {note && <p role={note.ok ? "status" : "alert"} className={cn("mb-3 rounded-lg px-3 py-2 text-xs", note.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>{note.text}</p>}

      {!people ? (
        <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading people…</p>
      ) : people.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-4 text-center text-sm text-zinc-500">No one here yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="py-1.5 pr-3 font-medium">Person</th>
                {superAdmin && <th className="py-1.5 pr-3 font-medium">University</th>}
                <th className="py-1.5 pr-3 font-medium">Role</th>
                <th className="py-1.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const locked = p.superAdmin || busy === p.id;
                return (
                  <tr key={p.id} className="border-b border-zinc-100 align-top last:border-0">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-zinc-900">{p.name || "—"}</p>
                      <p className="text-xs text-zinc-500">{p.email}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.status === "pending" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Waiting to join</span>}
                        {p.requestedRole === "tutor" && p.role === "employee" && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">Asked to teach</span>}
                      </div>
                    </td>
                    {superAdmin && (
                      <td className="py-2 pr-3">
                        {p.superAdmin ? <span className="text-xs text-zinc-500">All</span> : (
                          <select
                            className={selectClass} disabled={locked} aria-label={`University of ${p.name || p.email}`}
                            value={p.universityId ? String(p.universityId) : ""}
                            onChange={(e) => act(p, { action: "move", universityId: e.target.value ? Number(e.target.value) : null }, "moved")}
                          >
                            <option value="">No university</option>
                            {universities.map((u) => <option key={u.id} value={String(u.id)}>{u.shortName}</option>)}
                          </select>
                        )}
                      </td>
                    )}
                    <td className="py-2 pr-3">
                      {p.superAdmin ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Super admin</span>
                      ) : (superAdmin || p.role !== "admin") ? (
                        <select
                          className={selectClass} disabled={locked} aria-label={`Role of ${p.name || p.email}`} value={p.role}
                          onChange={(e) => {
                            const role = e.target.value as PersonRow["role"];
                            if (role === "admin" && superAdmin) {
                              // An admin runs one university: it has to be chosen first, never guessed.
                              if (p.universityId) void makeAdminOf(p, p.universityId);
                              else setNote({ ok: false, text: `Choose ${p.name || p.email}'s university first, then make them its university admin.` });
                            } else void act(p, { action: "set-role", role }, `is now a ${ROLE_LABEL[role].toLowerCase()}`);
                          }}
                        >
                          <option value="employee">Student</option>
                          <option value="tutor">Tutor</option>
                          {superAdmin && <option value="admin">University admin</option>}
                        </select>
                      ) : (
                        <span className="text-xs text-zinc-700">{ROLE_LABEL[p.role]}</span>
                      )}
                    </td>
                    <td className="py-2">
                      {!p.superAdmin && (superAdmin || p.role !== "admin") && (
                        <div className="flex flex-wrap gap-1.5">
                          {p.status === "pending" && (
                            <button type="button" disabled={locked} onClick={() => act(p, { action: "approve" }, "approved")} className="focus-ring inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
                              <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />Approve
                            </button>
                          )}
                          {p.requestedRole === "tutor" && p.role === "employee" && p.status === "active" && (
                            <>
                              <button type="button" disabled={locked} onClick={() => act(p, { action: "approve-tutor" }, "is now a tutor")} className="focus-ring inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />Make tutor
                              </button>
                              <button type="button" disabled={locked} onClick={() => act(p, { action: "decline-tutor" }, "stays a student")} className="focus-ring inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 disabled:opacity-50">
                                <X className="h-3.5 w-3.5" aria-hidden="true" />Decline
                              </button>
                            </>
                          )}
                          {p.universityId && (
                            <button
                              type="button" disabled={locked}
                              onClick={() => { if (window.confirm(`Take ${p.name || p.email} out of ${p.universityName ?? "the university"}? They become a student with no university.`)) void act(p, { action: "remove" }, "removed from the university"); }}
                              className="focus-ring inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />{p.status === "pending" ? "Decline" : "Remove"}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
