"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Film, Loader2, RotateCcw, Sparkles, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import {
  SCRIPT_MAX_CHARS, SCRIPT_MIN_CHARS, scriptSeconds, scriptWordCount, VIDEO_BACKGROUNDS, VIDEO_MINUTES, VIDEO_TONES,
  type VideoPresenter, type VideoVoice,
} from "@/lib/video/ai-video";

/**
 * Makes a lesson video with an AI presenter, inside the lesson editor:
 *   1. the tutor describes the video (pre-filled from the lesson's details)
 *   2. the AI drafts a script, which the tutor edits
 *   3. the tutor picks a presenter, voice and background, and the video is rendered
 *   4. the finished video is posted to YouTube (or downloaded and uploaded by hand)
 *      and becomes the lesson's video; its script becomes the lesson's transcript.
 */
type Job = {
  id: number; title: string; script: string; status: "processing" | "ready" | "failed";
  videoUrl: string | null; thumbnailUrl: string | null; durationSec: number | null; error: string | null; youtubeVideoId: string | null;
};
type Setup = {
  configured: boolean; presenters: VideoPresenter[]; voices: VideoVoice[]; jobs: Job[]; error?: string;
  youtube: { delivery: string; connected: boolean; channelTitle: string | null };
};

const selectClass = "focus-ring h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-zinc-900";
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function Label({ children, hint }: { children: string; hint?: string }) {
  return (
    <span className="mb-1.5 block">
      <span className="text-sm font-medium text-zinc-800">{children}</span>
      {hint && <span className="ml-1.5 text-xs font-normal text-zinc-500">{hint}</span>}
    </span>
  );
}

export function AiVideoStudio({ lessonTitle, lessonDescription, lessonTakeaways, courseTitle, onVideoPosted, onScriptReady, onUseLinkTab }: {
  lessonTitle: string; lessonDescription: string; lessonTakeaways: string[]; courseTitle: string;
  /** The video is on YouTube: make it this lesson's video. */
  onVideoPosted: (youtubeVideoId: string, script: string) => void;
  /** A video was generated from this script: keep it as the lesson's transcript. */
  onScriptReady: (script: string) => void;
  /** Take the tutor to the "YouTube link" tab to paste a link they uploaded by hand. */
  onUseLinkTab: () => void;
}) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Step 1: the brief. Starts from what the lesson already says.
  const [topic, setTopic] = useState(lessonDescription);
  const [audience, setAudience] = useState("");
  const [keyPoints, setKeyPoints] = useState(lessonTakeaways.join("\n"));
  const [example, setExample] = useState("");
  const [avoid, setAvoid] = useState("");
  const [closing, setClosing] = useState("");
  const [tone, setTone] = useState<string>(VIDEO_TONES[0]);
  const [minutes, setMinutes] = useState<number>(2);

  // Step 2: the script.
  const [script, setScript] = useState("");
  const [scriptBusy, setScriptBusy] = useState(false);

  // Step 3: how it looks and sounds.
  const [presenterId, setPresenterId] = useState("");
  const [presenterFilter, setPresenterFilter] = useState("");
  const [language, setLanguage] = useState("English");
  const [voiceId, setVoiceId] = useState("");
  const [background, setBackground] = useState<string>(VIDEO_BACKGROUNDS[0].key);

  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState<"create" | "youtube" | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const alive = useRef(true);
  const trackedJobs = useRef(new Set<Job["id"]>());
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tutor/ai-video/")
      .then(async (res) => ({ ok: res.ok, data: (await res.json().catch(() => ({}))) as Setup & { error?: string } }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) { setLoadError(data.error ?? "Couldn't load AI video."); return; }
        setSetup(data);
        // Pick up a video that was still rendering when the tutor last left.
        const running = data.jobs?.find((j) => j.status === "processing");
        if (running) { setJob(running); setScript((current) => current || running.script); }
      })
      .catch(() => { if (!cancelled) setLoadError("Couldn't reach the server."); });
    return () => { cancelled = true; };
  }, []);

  // While a video renders, ask about it every few seconds.
  const jobId = job?.id;
  const rendering = job?.status === "processing";
  useEffect(() => {
    if (!jobId || !rendering) return;
    const timer = setInterval(() => {
      fetch(`/api/tutor/ai-video/?id=${jobId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { job?: Job } | null) => {
          if (!alive.current || !data?.job) return;
          if ((data.job.status === "ready" || data.job.status === "failed") && !trackedJobs.current.has(data.job.id)) {
            trackedJobs.current.add(data.job.id);
            trackEvent("ai_video_generation_finished", { provider: "heygen", success: data.job.status === "ready" });
          }
          setJob(data.job);
          if (data.job.status === "ready") onScriptReady(data.job.script);
        })
        .catch(() => {});
    }, 6000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, rendering]);

  const languages = useMemo(() => [...new Set((setup?.voices ?? []).map((v) => v.language))].sort((a, b) => a.localeCompare(b)), [setup]);
  const voices = useMemo(() => (setup?.voices ?? []).filter((v) => v.language === language), [setup, language]);
  const presenters = useMemo(() => {
    const q = presenterFilter.trim().toLowerCase();
    return (setup?.presenters ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.gender === q).slice(0, 24);
  }, [setup, presenterFilter]);
  useEffect(() => {
    if (languages.length && !languages.includes(language)) setLanguage(languages.find((l) => /english/i.test(l)) ?? languages[0]);
  }, [languages, language]);
  useEffect(() => {
    if (voices.length && !voices.some((v) => v.id === voiceId)) setVoiceId(voices[0].id);
  }, [voices, voiceId]);

  async function post(payload: Record<string, unknown>) {
    const res = await fetch("/api/tutor/ai-video/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as { script?: string; job?: Job; videoId?: string; error?: string } };
  }

  async function writeScript() {
    if (!topic.trim() && !lessonTitle.trim()) { setNote({ ok: false, text: "Say what the video should teach first." }); return; }
    setScriptBusy(true); setNote(null);
    try {
      const { ok, data } = await post({ action: "script", brief: { topic, audience, keyPoints, example, avoid, closing, tone, minutes, lessonTitle, courseTitle } });
      if (!ok || !data.script) { setNote({ ok: false, text: data.error ?? "Couldn't write the script. Try again." }); return; }
      setScript(data.script);
      trackEvent("ai_video_script_generated", { provider: "heygen" });
      setNote({ ok: true, text: "Script drafted. Read it through and change anything: the presenter says exactly these words." });
    } catch {
      setNote({ ok: false, text: "Couldn't reach the server. Try again." });
    } finally {
      setScriptBusy(false);
    }
  }

  async function createVideo() {
    setBusy("create"); setNote(null);
    try {
      const { ok, data } = await post({ action: "create", title: lessonTitle || "Lesson video", script, avatarId: presenterId, voiceId, background });
      if (!ok || !data.job) { setNote({ ok: false, text: data.error ?? "Couldn't start the video. Try again." }); return; }
      setJob(data.job);
      trackEvent("ai_video_generation_started", { provider: "heygen" });
    } catch {
      setNote({ ok: false, text: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(null);
    }
  }

  async function postToYouTube() {
    if (!job) return;
    setBusy("youtube"); setNote(null);
    try {
      const { ok, data } = await post({ action: "youtube", id: job.id });
      if (!ok || !data.videoId) { setNote({ ok: false, text: data.error ?? "Couldn't post the video to YouTube." }); return; }
      setJob({ ...job, youtubeVideoId: data.videoId });
      trackEvent("ai_video_youtube_published", { provider: "heygen" });
      onVideoPosted(data.videoId, job.script);
    } catch {
      setNote({ ok: false, text: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(null);
    }
  }

  if (loadError) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError}</p>;
  if (!setup) return <p className="flex items-center gap-2 p-3 text-sm text-zinc-600"><Loader2 className="h-4 w-4 animate-spin" />Loading AI video…</p>;

  const words = scriptWordCount(script);
  const scriptOk = script.trim().length >= SCRIPT_MIN_CHARS;
  const canCreate = setup.configured && scriptOk && Boolean(presenterId) && Boolean(voiceId) && busy === null && !rendering;
  const canPostToYouTube = setup.youtube.delivery === "youtube" && setup.youtube.connected;

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-primary/10 p-2 text-primary"><Film className="h-4 w-4" aria-hidden="true" /></span>
        <div>
          <p className="text-sm font-semibold text-zinc-900">AI video</p>
          <p className="text-xs text-zinc-600">Describe the lesson, let the AI draft a script, pick a presenter, and get a video of them teaching it.</p>
        </div>
      </div>

      {!setup.configured && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          Video generation isn&apos;t switched on yet: it needs a HeyGen API key (<code>HEYGEN_API_KEY</code>) on the server. You can still draft and edit the script below, then record it yourself in the <strong>Record</strong> tab.
        </p>
      )}
      {setup.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{setup.error}</p>}

      {/* 1 · The brief */}
      <section className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-primary">1 · What the video should cover</h4>
        <label className="block">
          <Label hint="The more specific, the better the script">What should this video teach?</Label>
          <Textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} maxLength={800} placeholder="e.g. How to tell when a task needs an AI agent and when a simple automation rule is enough" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><Label>Who is watching?</Label><Input value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={200} placeholder="e.g. retail operations managers new to AI" /></label>
          <label className="block"><Label>How should it end?</Label><Input value={closing} onChange={(e) => setClosing(e.target.value)} maxLength={300} placeholder="e.g. a recap and one thing to try this week" /></label>
        </div>
        <label className="block">
          <Label hint="One per line">Points it must cover</Label>
          <Textarea value={keyPoints} onChange={(e) => setKeyPoints(e.target.value)} rows={3} maxLength={1200} placeholder={"e.g. Automation follows rules; agents pursue goals\nWhen an agent is overkill"} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><Label hint="Optional">An example or story to use</Label><Textarea value={example} onChange={(e) => setExample(e.target.value)} rows={2} maxLength={600} placeholder="e.g. a store that reorders stock when it drops below 50 units" /></label>
          <label className="block"><Label hint="Optional">Anything to avoid</Label><Textarea value={avoid} onChange={(e) => setAvoid(e.target.value)} rows={2} maxLength={400} placeholder="e.g. no jargon, no mention of specific vendors" /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><Label>Tone</Label><select className={selectClass} value={tone} onChange={(e) => setTone(e.target.value)}>{VIDEO_TONES.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="block"><Label>Length</Label><select className={selectClass} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>{VIDEO_MINUTES.map((m) => <option key={m} value={m}>About {m} minute{m === 1 ? "" : "s"}</option>)}</select></label>
        </div>
        <Button type="button" size="sm" variant={script ? "outline" : "primary"} onClick={() => void writeScript()} disabled={scriptBusy}>
          {scriptBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : script ? <RotateCcw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
          {script ? "Write the script again" : "Write the script with AI"}
        </Button>
      </section>

      {/* 2 · The script */}
      <section className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-primary">2 · The script</h4>
        <Textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={9}
          maxLength={SCRIPT_MAX_CHARS}
          aria-label="Video script"
          placeholder="The words the presenter will say. Draft it with AI above, or write your own."
        />
        <p className="text-xs text-zinc-500">
          {words > 0 ? `${words} words · about ${clock(scriptSeconds(script))} when spoken. ` : ""}The presenter says exactly this, so read it through before making the video.
        </p>
      </section>

      {/* 3 · Presenter, voice, background */}
      {setup.configured && (
        <section className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-primary">3 · Presenter and voice</h4>
          {setup.presenters.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <Label>Presenter</Label>
                <Input value={presenterFilter} onChange={(e) => setPresenterFilter(e.target.value)} placeholder="Search by name" aria-label="Search presenters" className="h-8 w-44 text-xs" />
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Presenter">
                {presenters.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={presenterId === p.id}
                    onClick={() => setPresenterId(p.id)}
                    className={cn("focus-ring relative overflow-hidden rounded-xl border bg-zinc-50 text-left transition", presenterId === p.id ? "border-primary ring-2 ring-primary/30" : "border-zinc-200 hover:border-zinc-300")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                    <span className="block truncate px-1.5 py-1 text-[11px] font-medium text-zinc-800">{p.name}</span>
                    {presenterId === p.id && <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-white"><Check className="h-3 w-3" /></span>}
                  </button>
                ))}
              </div>
              {presenters.length === 0 && <p className="text-xs text-zinc-500">No presenter matches that search.</p>}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block"><Label>Language</Label><select className={selectClass} value={language} onChange={(e) => setLanguage(e.target.value)}>{languages.map((l) => <option key={l}>{l}</option>)}</select></label>
            <label className="block"><Label>Voice</Label><select className={selectClass} value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>{voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.gender ? ` (${v.gender})` : ""}</option>)}</select></label>
            <label className="block"><Label>Background</Label><select className={selectClass} value={background} onChange={(e) => setBackground(e.target.value)}>{VIDEO_BACKGROUNDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select></label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void createVideo()} disabled={!canCreate}>
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}Generate the video
            </Button>
            <span className="text-xs text-zinc-500">
              {!scriptOk ? "Write the script first." : !presenterId ? "Choose a presenter." : "Uses video-service credits. Rendering takes a few minutes."}
            </span>
          </div>
        </section>
      )}

      {note && <p role="status" className={cn("text-xs", note.ok ? "text-emerald-800" : "text-red-700")}>{note.text}</p>}

      {/* 4 · The result */}
      {job && (
        <section className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-primary">4 · Your video</h4>
          {job.status === "processing" && (
            <p role="status" className="flex items-center gap-2 text-sm text-zinc-700"><Loader2 className="h-4 w-4 animate-spin text-primary" />Rendering “{job.title}”… this usually takes a few minutes. You can keep editing the lesson; it carries on if you leave this step.</p>
          )}
          {job.status === "failed" && (
            <p role="alert" className="text-sm text-red-700">The video couldn&apos;t be made{job.error ? `: ${job.error}` : "."} Check the script and try again.</p>
          )}
          {job.status === "ready" && job.videoUrl && (
            <>
              <video src={job.videoUrl} poster={job.thumbnailUrl ?? undefined} controls preload="metadata" className="aspect-video w-full rounded-lg bg-black" />
              <p className="text-xs text-zinc-600">
                {job.durationSec ? `${clock(job.durationSec)} long. ` : ""}Its script has been set as this lesson&apos;s transcript, so the learner&apos;s AI assistant can answer from it.
              </p>
              {job.youtubeVideoId ? (
                <p role="status" className="flex items-center gap-2 text-sm font-medium text-emerald-800"><Check className="h-4 w-4" />Posted to YouTube and set as this lesson&apos;s video.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {canPostToYouTube && (
                    <Button type="button" size="sm" onClick={() => void postToYouTube()} disabled={busy !== null}>
                      {busy === "youtube" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Youtube className="h-3.5 w-3.5" />}Post to YouTube and use in this lesson
                    </Button>
                  )}
                  <a href={job.videoUrl} target="_blank" rel="noopener noreferrer" download className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
                    <Download className="h-3.5 w-3.5" />Download video
                  </a>
                  {!canPostToYouTube && (
                    <span className="text-xs text-zinc-600">
                      Upload the file to YouTube, then <button type="button" onClick={onUseLinkTab} className="font-semibold text-primary hover:underline">paste its link</button>. The download link stops working after about a week.
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
