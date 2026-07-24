"use client";

import { useState } from "react";
import { Bell, RotateCcw, Shield, User } from "lucide-react";
import { useStore } from "@/lib/store";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/motion";
import { cn } from "@/lib/utils";

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("focus-ring relative h-6 w-11 rounded-full transition-colors", on ? "bg-gradient-to-r from-primary to-secondary" : "bg-zinc-300")}
    >
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

export default function SettingsPage() {
  const { state, resetAll } = useStore();
  const [notif, setNotif] = useState({ courses: true, assignments: true, badges: true, announcements: true });
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <PageTransition className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-zinc-600">Manage your profile and preferences.</p>
      </div>

      <Card>
        <div className="mb-4 flex items-center gap-2"><User className="h-4 w-4 text-primary" /><CardTitle>Profile</CardTitle></div>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-xl font-bold text-white shadow-glow-sm">
            {(state.user?.name ?? "U")[0]}
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900">{state.user?.name}</p>
            <p className="text-xs text-zinc-500">{state.user?.email}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wider text-primary">{state.user?.role}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /><CardTitle>Notifications</CardTitle></div>
        <div className="space-y-2.5">
          {([
            ["courses", "New courses & lessons"],
            ["assignments", "Assignment reminders"],
            ["badges", "Badge available"],
            ["announcements", "Announcements"],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between rounded-xl border border-zinc-100 bg-white/[0.03] p-3.5">
              <span className="text-sm text-zinc-800">{label}</span>
              <Toggle on={notif[key]} onChange={(v) => setNotif((n) => ({ ...n, [key]: v }))} label={label} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="mb-1 flex items-center gap-2"><Shield className="h-4 w-4 text-red-600" /><CardTitle>Danger zone</CardTitle></div>
        <CardDescription>Reset all local data — progress, notes, bookmarks, XP and admin edits. This cannot be undone.</CardDescription>
        <div className="mt-4 flex gap-2">
          {confirmReset ? (
            <>
              <Button variant="danger" onClick={() => { resetAll(); }}>Yes, wipe everything</Button>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmReset(true)}><RotateCcw className="h-4 w-4" />Reset all data</Button>
          )}
        </div>
      </Card>
    </PageTransition>
  );
}
