"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, Pencil, User, X, Check, Loader2, Briefcase, Calendar, GraduationCap,
  Target, UserCircle2, Mail, ShieldCheck, Sparkles, BookOpenCheck, Megaphone, Award,
} from "lucide-react";
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

const springHover = { type: "spring" as const, stiffness: 320, damping: 22 };
const springSwitch = { type: "spring" as const, stiffness: 500, damping: 30 };

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
    <motion.button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      whileTap={{ scale: 0.94 }}
      className={cn("focus-ring relative h-6 w-11 rounded-full transition-colors duration-200", on ? "bg-gradient-to-r from-primary to-secondary" : "bg-zinc-300")}
    >
      <motion.span
        layout
        transition={springSwitch}
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
        style={{ left: on ? 22 : 2 }}
      />
    </motion.button>
  );
}

function FieldRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
      <span className="flex w-40 shrink-0 items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">
        <Icon className="h-3 w-3" />{label}
      </span>
      <span className={cn("text-sm", value ? "text-zinc-800" : "italic text-zinc-400")}>{value || "Not set"}</span>
    </div>
  );
}

function InputField({
  label, value, onChange, type = "text", required, hint, placeholder, icon: Icon,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; hint?: string; placeholder?: string; icon?: typeof User;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {Icon && <Icon className="h-3 w-3 text-zinc-400" />}
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        max={type === "date" ? new Date().toISOString().slice(0, 10) : undefined}
        className="focus-ring rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors duration-200 hover:border-zinc-300 focus:border-primary/50 focus:shadow-sm"
      />
      {hint && <p className="text-[11px] text-zinc-400">{hint}</p>}
    </div>
  );
}

function SelectField({
  label, value, onChange, options, icon: Icon,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; icon?: typeof User;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {Icon && <Icon className="h-3 w-3 text-zinc-400" />}
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring appearance-none rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 transition-colors duration-200 hover:border-zinc-300 focus:border-primary/50"
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
          <motion.div
            className="rounded-lg bg-primary/10 p-1.5"
            animate={{ rotate: [0, -8, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          >
            <User className="h-4 w-4 text-primary" />
          </motion.div>
          <CardTitle>Profile</CardTitle>
        </div>
        <AnimatePresence>
          {!editing && !loading && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={startEdit}
              className="focus-ring flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900"
            >
              <Pencil className="h-3 w-3" /> Edit profile
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {editing && form ? (
            /* ── Edit mode ── */
            <motion.div
              key="edit"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-4">
                <motion.div
                  layoutId="profile-avatar"
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-xl font-bold text-white shadow-glow-sm"
                >
                  {(form.name || "U")[0].toUpperCase()}
                </motion.div>
                <div>
                  <p className="flex items-center gap-1 text-xs text-zinc-400"><Mail className="h-3 w-3" />{form.email}</p>
                  <span className={cn("mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", roleBadgeClass)}>
                    <ShieldCheck className="h-2.5 w-2.5" />{form.role}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <InputField
                  icon={User} label="Full name" value={form.name} required
                  onChange={(v) => setForm((f) => f ? { ...f, name: v } : f)}
                />
                <SelectField
                  icon={Briefcase} label="Employment type" value={form.employmentType} options={EMPLOYMENT_OPTIONS}
                  onChange={(v) => setForm((f) => f ? { ...f, employmentType: v } : f)}
                />
                <InputField
                  icon={Briefcase} label="Position / Job title" value={form.position}
                  onChange={(v) => setForm((f) => f ? { ...f, position: v } : f)}
                />
                <SelectField
                  icon={UserCircle2} label="Gender" value={form.gender} options={GENDER_OPTIONS}
                  onChange={(v) => setForm((f) => f ? { ...f, gender: v } : f)}
                />
                <InputField
                  icon={Calendar} label="Date of birth" value={form.dateOfBirth} type="date"
                  hint="Optional — used for internal HR records only."
                  onChange={(v) => setForm((f) => f ? { ...f, dateOfBirth: v } : f)}
                />
                <InputField
                  icon={GraduationCap} label="Qualification / Background" value={form.qualification}
                  placeholder="e.g. Software Engineer, Doctor, MBA…"
                  onChange={(v) => setForm((f) => f ? { ...f, qualification: v } : f)}
                />
                <InputField
                  icon={Target} label="Why are you here?" value={form.learningGoal}
                  placeholder="e.g. Upskill for promotion, understand AI tools…"
                  hint="Used to personalise quizzes and assignments."
                  onChange={(v) => setForm((f) => f ? { ...f, learningGoal: v } : f)}
                />
              </div>

              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden rounded-xl bg-red-50 px-3.5 py-2 text-sm text-red-600"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="flex gap-2 pt-1">
                <motion.div whileHover={{ scale: saving ? 1 : 1.03 }} whileTap={{ scale: saving ? 1 : 0.97 }}>
                  <Button onClick={saveProfile} disabled={saving} className="flex items-center gap-1.5">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span key={saving ? "saving" : "idle"} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ duration: 0.15 }} className="flex items-center gap-1.5">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        {saving ? "Saving…" : "Save changes"}
                      </motion.span>
                    </AnimatePresence>
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: saving ? 1 : 1.03 }} whileTap={{ scale: saving ? 1 : 0.97 }}>
                  <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          ) : (
            /* ── View mode ── */
            <motion.div
              key="view"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              <div className="flex items-center gap-4">
                <motion.div
                  layoutId="profile-avatar"
                  whileHover={{ scale: 1.06, rotate: -3 }}
                  transition={springHover}
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-xl font-bold text-white shadow-glow-sm"
                >
                  {avatarLetter}
                </motion.div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{profile?.name || "—"}</p>
                  <p className="flex items-center gap-1 text-xs text-zinc-500"><Mail className="h-3 w-3" />{profile?.email}</p>
                  <span className={cn("mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", roleBadgeClass)}>
                    <ShieldCheck className="h-2.5 w-2.5" />{profile?.role}
                  </span>
                </div>
              </div>

              <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-100 bg-zinc-50/50">
                {[
                  { icon: Briefcase, label: "Employment type", value: displayEmploymentType(profile?.employmentType ?? "") },
                  { icon: Briefcase, label: "Position", value: profile?.position ?? "" },
                  { icon: UserCircle2, label: "Gender", value: displayGender(profile?.gender ?? "") },
                  { icon: Calendar, label: "Date of birth", value: formatDOB(profile?.dateOfBirth ?? "") },
                  { icon: GraduationCap, label: "Qualification", value: profile?.qualification ?? "" },
                  { icon: Target, label: "Learning goal", value: profile?.learningGoal ?? "" },
                ].map(({ icon, label, value }, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    whileHover={{ x: 2 }}
                    className="px-4 py-3 transition-colors hover:bg-white"
                  >
                    <FieldRow icon={icon} label={label} value={value} />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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

const NOTIF_ICONS: Record<keyof NotifSettings, typeof Bell> = {
  courses: BookOpenCheck,
  assignments: Sparkles,
  badges: Award,
  announcements: Megaphone,
};

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
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <h1 className="text-2xl font-bold md:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-zinc-600">Manage your profile and preferences.</p>
      </motion.div>

      <ProfileCard />

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <motion.div
            className="rounded-lg bg-primary/10 p-1.5"
            animate={{ rotate: [0, -12, 12, -8, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 3.5 }}
          >
            <Bell className="h-4 w-4 text-primary" />
          </motion.div>
          <CardTitle>Notifications</CardTitle>
        </div>
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
            ] as const).map(([key, label], i) => {
              const Icon = NOTIF_ICONS[key];
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ x: 2 }}
                  className="flex items-center justify-between rounded-xl border border-zinc-100 bg-white/[0.03] p-3.5 transition-colors hover:border-primary/20"
                >
                  <span className="flex items-center gap-2.5 text-sm text-zinc-800">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-3.5 w-3.5" /></span>
                    {label}
                  </span>
                  <Toggle on={notif[key]} onChange={(v) => handleToggle(key, v)} label={label} />
                </motion.div>
              );
            })}
          </div>
        )}
      </Card>
    </PageTransition>
  );
}