"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Pencil, User, X, Check, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useStore } from "@/lib/store";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/motion";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface ProfileData {
  name: string;
  email: string;
  role: string;
  employmentType: string;
  position: string;
  dateOfBirth: string;
  gender: string;
  qualification: string;
  learningGoal: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const EMPLOYMENT_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "job", label: "Full-time Employee" },
  { value: "intern", label: "Intern" },
];

const GENDER_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non-binary", label: "Non-binary" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
];

function displayEmploymentType(v: string) {
  return EMPLOYMENT_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

function displayGender(v: string) {
  return GENDER_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

function formatDOB(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */
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

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
      <span className="w-36 shrink-0 text-xs font-medium text-zinc-400 uppercase tracking-wide">{label}</span>
      <span className={cn("text-sm", value ? "text-zinc-800" : "italic text-zinc-400")}>{value || "Not set"}</span>
    </div>
  );
}

function InputField({
  label, value, onChange, type = "text", required, hint, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; hint?: string; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        max={type === "date" ? new Date().toISOString().slice(0, 10) : undefined}
        className="focus-ring rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 transition hover:border-zinc-300"
      />
      {hint && <p className="text-[11px] text-zinc-400">{hint}</p>}
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 transition hover:border-zinc-300 appearance-none"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

/* ─── Profile Card ───────────────────────────────────────────────────────── */
function ProfileCard() {
  const { data: session, update } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProfileData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Load profile from API on mount
  useEffect(() => {
    if (!session?.user?.email) return;
    setLoading(true);
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data: ProfileData) => { setProfile(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [session?.user?.email]);

  function startEdit() {
    if (!profile) return;
    setForm({ ...profile });
    setError("");
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setForm(null);
    setError("");
  }

  async function saveProfile() {
    if (!form) return;
    const name = form.name.trim();
    if (!name) { setError("Name is required."); return; }
    if (form.dateOfBirth) {
      const d = new Date(form.dateOfBirth);
      if (isNaN(d.getTime()) || d >= new Date()) { setError("Date of birth must be a valid past date."); return; }
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          employmentType: form.employmentType,
          position: form.position.trim(),
          dateOfBirth: form.dateOfBirth,
          gender: form.gender,
          qualification: form.qualification,
          learningGoal: form.learningGoal,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Save failed. Please try again.");
        return;
      }
      const updated = await res.json() as ProfileData;
      setProfile(updated);
      setEditing(false);
      setForm(null);
      // Sync updated name into the NextAuth session token immediately
      await update({ name: updated.name });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const avatarLetter = (profile?.name ?? session?.user?.email ?? "U")[0].toUpperCase();
  const roleBadgeClass = profile?.role === "admin"
    ? "bg-primary/10 text-primary"
    : "bg-zinc-100 text-zinc-500";

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-primary" />
          <CardTitle>Profile</CardTitle>
        </div>
        {!editing && !loading && (
          <button
            onClick={startEdit}
            className="focus-ring flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
          >
            <Pencil className="h-3 w-3" /> Edit profile
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
        </div>
      ) : editing && form ? (
        /* ── Edit mode ── */
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-xl font-bold text-white shadow-glow-sm">
              {(form.name || "U")[0].toUpperCase()}
            </div>
            <div>
              <p className="text-xs text-zinc-400">{form.email}</p>
              <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", roleBadgeClass)}>
                {form.role}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <InputField
              label="Full name" value={form.name} required
              onChange={(v) => setForm((f) => f ? { ...f, name: v } : f)}
            />
            <SelectField
              label="Employment type" value={form.employmentType} options={EMPLOYMENT_OPTIONS}
              onChange={(v) => setForm((f) => f ? { ...f, employmentType: v } : f)}
            />
            <InputField
              label="Position / Job title" value={form.position}
              onChange={(v) => setForm((f) => f ? { ...f, position: v } : f)}
            />
            <SelectField
              label="Gender" value={form.gender} options={GENDER_OPTIONS}
              onChange={(v) => setForm((f) => f ? { ...f, gender: v } : f)}
            />
            <InputField
              label="Date of birth" value={form.dateOfBirth} type="date"
              hint="Optional — used for internal HR records only."
              onChange={(v) => setForm((f) => f ? { ...f, dateOfBirth: v } : f)}
            />
            <InputField
              label="Qualification / Background" value={form.qualification}
              placeholder="e.g. Software Engineer, Doctor, MBA…"
              onChange={(v) => setForm((f) => f ? { ...f, qualification: v } : f)}
            />
            <InputField
              label="Why are you here?" value={form.learningGoal}
              placeholder="e.g. Upskill for promotion, understand AI tools…"
              hint="Used to personalise quizzes and assignments."
              onChange={(v) => setForm((f) => f ? { ...f, learningGoal: v } : f)}
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-3.5 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <Button onClick={saveProfile} disabled={saving} className="flex items-center gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        /* ── View mode ── */
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-xl font-bold text-white shadow-glow-sm">
              {avatarLetter}
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">{profile?.name || "—"}</p>
              <p className="text-xs text-zinc-500">{profile?.email}</p>
              <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", roleBadgeClass)}>
                {profile?.role}
              </span>
            </div>
          </div>

          <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-100 bg-zinc-50/50">
            {[
              { label: "Employment type", value: displayEmploymentType(profile?.employmentType ?? "") },
              { label: "Position", value: profile?.position ?? "" },
              { label: "Gender", value: displayGender(profile?.gender ?? "") },
              { label: "Date of birth", value: formatDOB(profile?.dateOfBirth ?? "") },
              { label: "Qualification", value: profile?.qualification ?? "" },
              { label: "Learning goal", value: profile?.learningGoal ?? "" },
            ].map(({ label, value }) => (
              <div key={label} className="px-4 py-3">
                <FieldRow label={label} value={value} />
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface NotifSettings {
  courses: boolean;
  assignments: boolean;
  badges: boolean;
  announcements: boolean;
}

const DEFAULT_NOTIF: NotifSettings = { courses: true, assignments: true, badges: true, announcements: true };

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function SettingsPage() {
  useStore();
  const [notif, setNotif] = useState<NotifSettings>(DEFAULT_NOTIF);
  const [notifLoaded, setNotifLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved notification settings on mount
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data: { notificationSettings?: NotifSettings }) => {
        if (data.notificationSettings) setNotif(data.notificationSettings);
        setNotifLoaded(true);
      })
      .catch(() => setNotifLoaded(true));
  }, []);

  function handleToggle(key: keyof NotifSettings, value: boolean) {
    const updated = { ...notif, [key]: value };
    setNotif(updated);

    // Debounce the PATCH call by 500 ms
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationSettings: updated }),
      }).catch(() => {
        // silent — settings will be re-loaded on next mount
      });
    }, 500);
  }

  return (
    <PageTransition className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-zinc-600">Manage your profile and preferences.</p>
      </div>

      <ProfileCard />

      <Card>
        <div className="mb-4 flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /><CardTitle>Notifications</CardTitle></div>
        {!notifLoaded ? (
          <div className="flex items-center gap-2 py-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-2.5">
            {([
              ["courses", "New courses & lessons"],
              ["assignments", "Assignment reminders"],
              ["badges", "Badge available"],
              ["announcements", "Announcements"],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between rounded-xl border border-zinc-100 bg-white/[0.03] p-3.5">
                <span className="text-sm text-zinc-800">{label}</span>
                <Toggle on={notif[key]} onChange={(v) => handleToggle(key, v)} label={label} />
              </div>
            ))}
          </div>
        )}
      </Card>

    </PageTransition>
  );
}
