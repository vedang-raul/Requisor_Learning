"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, Pencil, User, X, Check, Loader2, Briefcase, Calendar, GraduationCap,
  Target, UserCircle2, Mail, ShieldCheck, Sparkles, BookOpenCheck, Megaphone, Award,
  Bug, Upload, Clock, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Image, Video, FileText,
  Play, FileVideo, ImagePlus,
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
  assignments: FileText,
  badges: Award,
  announcements: Megaphone,
};

/* ─── Bug Report Card ────────────────────────────────────────────────────── */
interface BugReportRow {
  id: number;
  title: string;
  description: string;
  media_type: string | null;
  occurred_at: string;
  status: "open" | "in_progress" | "resolved";
  created_at: string;
}
const BUG_STATUS_META: Record<BugReportRow["status"], { label: string; color: string }> = {
  open:        { label: "Open",        color: "bg-red-100 text-red-700" },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700" },
  resolved:    { label: "Resolved",    color: "bg-emerald-100 text-emerald-700" },
};
const MAX_MEDIA_BYTES = 4 * 1024 * 1024;

function BugReportCard() {
  const [title, setTitle]         = useState("");
  const [desc, setDesc]           = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [mediaData, setMediaData] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [mediaName, setMediaName] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [mediaLoading, setMediaLoading] = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState(false);
  const [reports, setReports]     = useState<BugReportRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/bug-reports")
      .then((r) => r.json())
      .then((d) => setReports(d.reports ?? []))
      .catch(() => {})
      .finally(() => setReportsLoading(false));
  }, []);

  function processFile(file: File) {
    setMediaError("");
    const type: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
    if (type === "video") {
      if (file.size > MAX_MEDIA_BYTES) { setMediaError("Video is too large. Maximum size is 4 MB."); return; }
      setMediaLoading(true);
      setMediaName(file.name);
      const reader = new FileReader();
      reader.onload = () => { setMediaData(reader.result as string); setMediaType("video"); setMediaName(file.name); setMediaLoading(false); };
      reader.onerror = () => { setMediaError("Could not read video file."); setMediaLoading(false); };
      reader.readAsDataURL(file);
      return;
    }
    // Images — compress via Canvas before encoding so the JSON payload stays small
    setMediaLoading(true);
    setMediaName(file.name);
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX_SIDE = 1280;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_SIDE || h > MAX_SIDE) {
        const ratio = Math.min(MAX_SIDE / w, MAX_SIDE / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { setMediaError("Could not process image."); setMediaLoading(false); return; }
      ctx.drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL("image/jpeg", 0.82);
      setMediaData(compressed);
      setMediaType("image");
      setMediaLoading(false);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setMediaError("Could not read image file.");
      setMediaLoading(false);
    };
    img.src = objectUrl;
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function clearMedia() {
    setMediaData(null);
    setMediaType(null);
    setMediaName("");
    setMediaError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    setError("");
    if (!title.trim()) { setError("Title is required."); return; }
    if (!desc.trim()) { setError("Description is required."); return; }
    if (!occurredAt) { setError("Please select the date and time when the bug occurred."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: desc.trim(),
          occurredAt,
          mediaData,
          mediaType,
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Submission failed. Please try again.");
        return;
      }
      const { report } = await res.json() as { report: BugReportRow };
      setReports((prev) => [{ ...report, title: title.trim(), description: desc.trim(), media_type: mediaType, occurred_at: occurredAt, status: "open" }, ...prev]);
      setTitle(""); setDesc(""); setOccurredAt(""); clearMedia();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <motion.div
          className="rounded-lg bg-red-50 p-1.5"
          animate={{ rotate: [0, -8, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 4 }}
        >
          <Bug className="h-4 w-4 text-red-500" />
        </motion.div>
        <div>
          <CardTitle>Report a Bug</CardTitle>
        </div>
      </div>
      <p className="mb-4 text-xs text-zinc-500">Found something broken? Let us know and we'll fix it.</p>

      <div className="space-y-3">
        {/* Title */}
        <InputField
          label="Bug title"
          required
          placeholder="e.g. Video won't play on lesson 3"
          value={title}
          onChange={setTitle}
          icon={Bug}
        />

        {/* Description */}
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
            <FileText className="h-3 w-3 text-zinc-400" />
            Description<span className="ml-0.5 text-red-500">*</span>
          </label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={4}
            placeholder="Describe what happened, what you expected, and any steps to reproduce…"
            className="focus-ring resize-none rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors hover:border-zinc-300 focus:border-primary/50 focus:shadow-sm"
          />
        </div>

        {/* Date & time */}
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
            <Clock className="h-3 w-3 text-zinc-400" />
            When did this occur?<span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            value={occurredAt}
            max={new Date().toISOString().slice(0, 16)}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="focus-ring rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 transition-colors hover:border-zinc-300 focus:border-primary/50"
          />
        </div>

        {/* Media upload */}
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
            <Upload className="h-3 w-3 text-zinc-400" />
            Screenshot or video <span className="text-zinc-400">(optional · max 4 MB)</span>
          </label>

          <AnimatePresence mode="wait" initial={false}>
            {mediaLoading ? (
              /* ── Processing state ── */
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-3"
              >
                <motion.span
                  className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                  initial={{ x: "-100%" }}
                  animate={{ x: "100%" }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
                />
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"
                >
                  <Loader2 className="h-4 w-4" />
                </motion.span>
                <div className="relative min-w-0">
                  <p className="truncate text-sm font-medium text-primary">Processing {mediaName || "file"}…</p>
                  <p className="text-[11px] text-zinc-500">Compressing and preparing your attachment.</p>
                </div>
              </motion.div>
            ) : mediaData ? (
              /* ── Attached preview ── */
              <motion.div
                key="preview"
                initial={{ opacity: 0, scale: 0.96, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={springHover}
                className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-2.5"
              >
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  transition={springHover}
                  className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-900 shadow-sm"
                >
                  {mediaType === "video" ? (
                    <>
                      <video src={mediaData} className="h-full w-full object-cover opacity-80" muted playsInline />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                        <Play className="h-5 w-5 fill-white text-white" />
                      </span>
                    </>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaData} alt="Attachment preview" className="h-full w-full object-cover" />
                  )}
                </motion.div>
                <div className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-800">
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={springHover}>
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    </motion.span>
                    <span className="truncate">{mediaName}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
                    {mediaType === "video" ? <FileVideo className="h-3 w-3" /> : <ImagePlus className="h-3 w-3" />}
                    {mediaType === "video" ? "Video attached" : "Image attached, compressed for upload"}
                  </span>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  transition={springHover}
                  onClick={clearMedia}
                  aria-label="Remove attachment"
                  className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700"
                >
                  <X className="h-3.5 w-3.5" />
                </motion.button>
              </motion.div>
            ) : (
              /* ── Empty dropzone ── */
              <motion.button
                key="dropzone"
                type="button"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  scale: dragOver ? 1.015 : 1,
                  borderColor: dragOver ? "rgba(var(--primary-rgb,99,102,241),0.6)" : "rgba(228,228,231,1)",
                }}
                whileHover={{ scale: 1.005 }}
                whileTap={{ scale: 0.99 }}
                transition={springHover}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3.5 py-6 text-sm transition-colors",
                  dragOver ? "border-primary/60 bg-primary/10 text-primary" : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                )}
              >
                <motion.span
                  animate={dragOver ? { y: [0, -4, 0] } : {}}
                  transition={{ duration: 0.6, repeat: dragOver ? Infinity : 0 }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm"
                >
                  <Upload className="h-4 w-4" />
                </motion.span>
                <span className="font-medium">{dragOver ? "Drop it here" : "Click or drag a screenshot / video"}</span>
                <span className="text-[11px] text-zinc-400">PNG, JPG, MP4 up to 4 MB</span>
              </motion.button>
            )}
          </AnimatePresence>

          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleFile}
          />
          <AnimatePresence>
            {mediaError && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden text-[11px] text-red-500"
              >
                {mediaError}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Error / success */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <p className="flex items-center gap-1.5 rounded-xl bg-red-50 px-3.5 py-2 text-sm text-red-600">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
              </p>
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -6, height: 0, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, height: "auto", scale: 1 }}
              exit={{ opacity: 0, height: 0 }}
              transition={springHover}
              className="overflow-hidden"
            >
              <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-2 text-sm text-emerald-700">
                <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={springHover}>
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                </motion.span>
                Bug report submitted — thank you!
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div whileHover={{ scale: submitting ? 1 : 1.02 }} whileTap={{ scale: submitting ? 1 : 0.97 }}>
          <Button onClick={submit} disabled={submitting || mediaLoading} className="relative flex items-center gap-1.5 overflow-hidden">
            {submitting && mediaData && (
              <motion.span
                className="pointer-events-none absolute inset-0 bg-white/20"
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
              />
            )}
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={submitting ? "s" : "i"} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ duration: 0.15 }} className="relative flex items-center gap-1.5">
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {mediaData ? "Uploading & submitting…" : "Submitting…"}
                  </>
                ) : (
                  <><Bug className="h-3.5 w-3.5" /> Submit bug report</>
                )}
              </motion.span>
            </AnimatePresence>
          </Button>
        </motion.div>
      </div>

      {/* History */}
      {!reportsLoading && reports.length > 0 && (
        <div className="mt-5 border-t border-zinc-100 pt-4">
          <motion.button
            onClick={() => setShowHistory((v) => !v)}
            whileHover={{ x: 2 }}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800"
          >
            <motion.span animate={{ rotate: showHistory ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="h-3.5 w-3.5" />
            </motion.span>
            {showHistory ? "Hide" : "Show"} my previous reports ({reports.length})
          </motion.button>
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-3 space-y-2 overflow-hidden"
              >
                {reports.map((r, i) => {
                  const meta = BUG_STATUS_META[r.status];
                  return (
                    <motion.div
                      key={r.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      whileHover={{ x: 2 }}
                      className="flex items-start justify-between gap-3 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3.5 py-3 transition-colors hover:border-primary/20"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-800">{r.title}</p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          Occurred: {new Date(r.occurred_at).toLocaleString()}
                        </p>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", meta.color)}>
                        {meta.label}
                      </span>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </Card>
  );
}

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
      <BugReportCard />

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