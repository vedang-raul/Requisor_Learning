"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioLines, Captions, CheckCircle2, Download, Film, History, Loader2, RotateCcw, Scissors, Sparkles, Upload, Wand2, Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The optional tidy-up behind the lesson wizard's Record tab (see
 * video-recorder.tsx). The tutor adds a recording — one just made in the
 * recorder, or a file — and — with nothing to configure — gets it back with subtitles,
 * long pauses cut and the audio evened out.
 *
 * The finished video reaches learners one of two ways (server-decided):
 *  - "download": the tutor downloads it, uploads it to YouTube and pastes the link;
 *  - "youtube": the app posts it to the tutor's connected channel in one click.
 *
 * With the editing service connected, the recording is uploaded through this
 * app to the service and the real result comes back. Without it, demo mode
 * (config.demo) simulates the processing and shows SAMPLE results: the
 * recording never leaves the tutor's device, and the UI says so throughout.
 */

type Cue = { start: number; end: number; text: string };
type Result = {
  demo: boolean; originalSeconds: number | null; editedSeconds: number | null; silencesRemoved: number | null; secondsRemoved: number | null;
  loudnessBefore: string | null; loudnessAfter: string | null; subtitleLanguage: string; subtitleCues: number; wordCount: number;
  subtitlePreview: Cue[]; vtt: string; downloadUrl: string | null;
};
type Job = {
  id: number; title: string; fileName: string; status: "processing" | "ready" | "failed"; demo: boolean; stage?: string | null;
  result: Result | null; youtubeVideoId: string | null; error: string | null; createdAt: string;
};
type Config = {
  configured: boolean; demo: boolean; subtitles?: boolean; delivery: "download" | "youtube";
  youtube: { configured: boolean; connected: boolean; channelTitle: string | null };
};

const STAGES = [
  { label: "Transcribing speech", seconds: 7 },
  { label: "Cutting long pauses", seconds: 6 },
  { label: "Evening out the audio", seconds: 5 },
  { label: "Adding subtitles", seconds: 4 },
  { label: "Rendering the final video", seconds: 4 },
];
const TOTAL_SECONDS = STAGES.reduce((sum, s) => sum + s.seconds, 0);
const POLL_MS = 3_000;
const ACCEPT = ".mp4,.mov,.webm,.m4v,video/mp4,video/quicktime,video/webm";

function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}
function formatBytes(bytes: number) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

/** Reads a video file's length in the browser (no upload). */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (value: number | null) => { URL.revokeObjectURL(url); resolve(value); };
    video.preload = "metadata";
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    video.src = url;
  });
}

/** Demo only: animates an upload bar without sending the file anywhere. */
function simulateUpload(onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve) => {
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      onProgress(Math.min(1, step / 12));
      if (step >= 12) { clearInterval(timer); resolve(); }
    }, 200);
  });
}

/** Sends the recording to this app (which passes it on to the editing service), reporting progress. */
function uploadRecording(url: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("input_file", file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = "The upload failed. Please try again.";
      try { message = (JSON.parse(xhr.responseText) as { error?: string }).error || message; } catch { /* keep the generic message */ }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    xhr.send(form);
  });
}

function DemoBadge() {
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">Demo</span>;
}

/** A real job: the editing service reports what it is doing; there is no reliable percentage. */
function LiveProcessing({ stage }: { stage: string | null }) {
  return (
    <div role="status" aria-label="Editing your recording" className="space-y-2 rounded-lg bg-primary/5 p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-primary"><Loader2 className="h-4 w-4 animate-spin" />{stage ?? "Editing your recording"}…</p>
      <p className="text-xs text-zinc-500">This usually takes a few minutes for a long recording. You can carry on with the other steps. This is saved, so you can come back to it.</p>
    </div>
  );
}

function Processing({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => (Date.now() - startedAt) / 1000);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 500);
    return () => clearInterval(timer);
  }, [startedAt]);
  let cursor = 0;
  return (
    <div role="status" aria-label="Editing your recording" className="space-y-3 rounded-lg bg-primary/5 p-3">
      <div className="h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.min(100, (elapsed / TOTAL_SECONDS) * 100)}%` }} />
      </div>
      <ol className="space-y-1.5 text-sm">
        {STAGES.map((stage) => {
          const start = cursor;
          cursor += stage.seconds;
          const done = elapsed >= cursor;
          const active = !done && elapsed >= start;
          return (
            <li key={stage.label} className={cn("flex items-center gap-2", done ? "text-zinc-800" : active ? "font-medium text-primary" : "text-zinc-400")}>
              {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-4 w-4 rounded-full border-2 border-zinc-300" />}
              {stage.label}{active ? "…" : ""}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-zinc-500">You can carry on with the other steps. This is saved, so you can come back to it.</p>
    </div>
  );
}

/** The finished video, streamed from the editing service, with its real subtitles as a track. */
function EditedPreview({ src, vtt }: { src: string; vtt: string }) {
  const [track, setTrack] = useState<string | null>(null);
  useEffect(() => {
    if (!vtt) return;
    const url = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
    setTrack(url);
    return () => URL.revokeObjectURL(url);
  }, [vtt]);
  return (
    <video src={`${src}?inline=1`} controls preload="metadata" className="aspect-video w-full rounded-xl bg-black">
      {track && <track kind="subtitles" src={track} srcLang="en" label="Subtitles" default />}
    </video>
  );
}

/** Demo: the tutor's own recording (played locally) with sample subtitles drawn over it. */
function SubtitledPreview({ src, cues }: { src: string; cues: Cue[] }) {
  const [time, setTime] = useState(0);
  // Preview cues cover only the opening; loop them so captions keep showing.
  const span = cues.length ? cues[cues.length - 1].end + 0.4 : 1;
  const t = time % span;
  const cue = cues.find((c) => t >= c.start && t <= c.end);
  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <video src={src} controls preload="metadata" className="aspect-video w-full" onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} />
      {cue && (
        <p className="pointer-events-none absolute inset-x-4 bottom-12 text-center">
          <span className="rounded bg-black/75 px-2 py-1 text-sm font-medium text-white">{cue.text}</span>
        </p>
      )}
    </div>
  );
}

export function VideoEditStudio({
  lessonTitle, courseSlug, jobId, onJobChange, onReadyToLink, onVideoPosted, presetFile, presetSeconds, onEdit,
}: {
  lessonTitle: string;
  courseSlug: string;
  /** Kept by the wizard so leaving and returning to this step resumes the job. */
  jobId: number | null;
  onJobChange: (id: number | null) => void;
  /** Tutor will upload to YouTube themselves and paste the link. */
  onReadyToLink: () => void;
  /** The app posted the video to YouTube; use this id as the lesson's video. */
  onVideoPosted: (videoId: string) => void;
  /** A recording made in the recorder, ready to tidy up without choosing a file. */
  presetFile?: File | null;
  /** Its length, which browsers can't read back from a fresh WebM recording. */
  presetSeconds?: number | null;
  /** Open the tidied-up video in the editor (trim, titles, captions). */
  onEdit?: (video: { url: string; vtt: string }) => void;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [recent, setRecent] = useState<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenAtRef = useRef(new Map<number, number>());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tutor/video-edits")
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as { config?: Config; jobs?: Job[]; error?: string };
        if (!r.ok || !data.config) throw new Error(data.error || "Couldn't load the video editor.");
        if (cancelled) return;
        setConfig(data.config);
        setRecent(data.jobs ?? []);
        const resumed = jobId ? data.jobs?.find((j) => j.id === jobId) : null;
        if (resumed) setJob(resumed);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load the video editor."); });
    return () => { cancelled = true; };
    // Load once per mount; jobId only seeds which job to resume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!job || job.status !== "processing") return;
    const timer = setInterval(async () => {
      const r = await fetch(`/api/tutor/video-edits/${job.id}`).catch(() => null);
      const data = r?.ok ? ((await r.json()) as { job?: Job }) : null;
      if (data?.job) {
        setJob(data.job);
        setRecent((list) => list.map((j) => (j.id === data.job!.id ? data.job! : j)));
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [job]);

  // The local preview URL belongs to this component; release it when replaced/unmounted.
  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);

  function chooseFile(next: File | null) {
    setError(null);
    setFile(next);
    setLocalUrl(next ? URL.createObjectURL(next) : null);
  }
  useEffect(() => {
    if (presetFile) { setJob(null); chooseFile(presetFile); }
  }, [presetFile]);

  function openJob(next: Job | null) {
    setJob(next);
    setError(null);
    onJobChange(next?.id ?? null);
    if (!next) chooseFile(null);
  }

  async function start() {
    if (!file) return;
    setError(null);
    if (!lessonTitle.trim()) { setError("Add a lesson title in step 1 first."); return; }
    setStarting(true);
    try {
      const sourceSeconds = (file === presetFile ? presetSeconds : null) ?? await readDuration(file);
      setUploadPct(0);
      // Demo: the upload bar is simulated and the file stays on this device.
      if (config?.demo) await simulateUpload(setUploadPct);
      const r = await fetch("/api/tutor/video-edits", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: lessonTitle.trim(), fileName: file.name, courseSlug, ...(sourceSeconds ? { sourceSeconds } : {}) }),
      });
      const data = (await r.json().catch(() => ({}))) as { job?: Job; upload?: string; error?: string };
      if (!r.ok || !data.job) throw new Error(data.error || "Couldn't start the edit.");
      if (data.upload) await uploadRecording(data.upload, file, setUploadPct);
      seenAtRef.current.set(data.job.id, Date.now());
      setRecent((list) => [data.job!, ...list.filter((j) => j.id !== data.job!.id)].slice(0, 10));
      setJob(data.job);
      onJobChange(data.job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setStarting(false);
      setUploadPct(null);
    }
  }

  function downloadSubtitles(result: Result) {
    const url = URL.createObjectURL(new Blob([result.vtt], { type: "text/vtt" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(job?.title || "lesson").replace(/[^\w-]+/g, "-").slice(0, 60)}${result.demo ? "-sample" : ""}.vtt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function postToYouTube() {
    if (!job) return;
    setPosting(true);
    setError(null);
    try {
      const r = await fetch(`/api/tutor/video-edits/${job.id}/youtube`, { method: "POST" });
      const data = (await r.json().catch(() => ({}))) as { videoId?: string; error?: string };
      if (!r.ok || !data.videoId) throw new Error(data.error || "Couldn't post the video to YouTube.");
      setJob({ ...job, youtubeVideoId: data.videoId });
      onVideoPosted(data.videoId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post the video to YouTube.");
    } finally {
      setPosting(false);
    }
  }

  if (!config) {
    return error
      ? <p role="alert" className="text-sm text-red-700">{error}</p>
      : <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Loading the video editor…</p>;
  }

  if (!config.configured && !config.demo) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Automatic editing isn&apos;t set up yet</p>
        <p className="mt-1">An admin needs to connect a video processing service. Until then, upload your recording to YouTube and paste the link.</p>
      </div>
    );
  }

  const result = job?.result ?? null;
  const youtubeMode = config.delivery === "youtube";
  if (job?.status === "processing" && !seenAtRef.current.has(job.id)) seenAtRef.current.set(job.id, Date.now());

  return (
    <div className="space-y-4">
      {config.demo && (
        <div role="note" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <p>
            <span className="mr-1.5"><DemoBadge /></span>
            <strong>The editing service isn&apos;t connected yet</strong>, so this walks through the flow with <strong>sample results</strong>.
            Your recording stays on your device and isn&apos;t actually edited.
          </p>
        </div>
      )}

      {/* add a recording */}
      {!job && (
        <div className="space-y-3 rounded-xl border border-border bg-white p-4">
          <p className="text-sm text-zinc-600">Add your recording and we&apos;ll tidy it up for you. Nothing to set — every video gets:</p>
          <ul className="grid gap-2 text-sm sm:grid-cols-3">
            <li className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2"><Captions className="h-4 w-4 shrink-0 text-primary" />{config.subtitles === false ? "Subtitles (added by YouTube)" : "Subtitles"}</li>
            <li className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2"><Scissors className="h-4 w-4 shrink-0 text-primary" />Long pauses cut</li>
            <li className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2"><AudioLines className="h-4 w-4 shrink-0 text-primary" />Audio evened out</li>
          </ul>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={starting}
            className="focus-ring flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
          >
            <Film className="h-6 w-6 text-primary" aria-hidden="true" />
            {file
              ? <span className="text-sm font-medium text-zinc-900">{file.name} <span className="font-normal text-zinc-500">· {formatBytes(file.size)}</span></span>
              : <span className="text-sm font-medium text-zinc-900">Choose your recording</span>}
            <span className="text-xs text-zinc-500">{file ? "Click to choose a different file" : "MP4, MOV or WebM"}</span>
          </button>
          <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />

          {uploadPct !== null && (
            <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(uploadPct * 100)} className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${uploadPct * 100}%` }} /></div>
              <p className="text-xs text-zinc-500">Uploading… {Math.round(uploadPct * 100)}%{config.demo ? " (simulated — the file stays on your device)" : ""}</p>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <Button type="button" onClick={() => void start()} disabled={!file || starting}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {starting ? "Uploading…" : config.demo ? "Edit my video (demo)" : "Edit my video"}
          </Button>
        </div>
      )}

      {/* the job */}
      {job && (
        <div className="space-y-4 rounded-xl border border-border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-900">
              {job.title}<span className="font-normal text-zinc-500">· {job.fileName}</span>{job.demo && <DemoBadge />}
            </p>
            <Button type="button" size="sm" variant="ghost" onClick={() => openJob(null)}><RotateCcw className="h-3.5 w-3.5" />Edit another recording</Button>
          </div>

          {job.status === "processing" && (job.demo ? <Processing startedAt={seenAtRef.current.get(job.id) ?? Date.now()} /> : <LiveProcessing stage={job.stage ?? null} />)}
          {job.status === "failed" && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{job.error ?? "We couldn't edit this recording."}</div>}

          {job.status === "ready" && result && (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />Your edited video is ready{result.demo ? " (sample result)" : ""}
              </p>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500"><Scissors className="h-3.5 w-3.5" />Pauses cut</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-900">
                    {result.originalSeconds != null && result.editedSeconds != null ? <>{clock(result.originalSeconds)} → {clock(result.editedSeconds)}</>
                      : result.editedSeconds != null ? <>{clock(result.editedSeconds)} long</> : "Long pauses removed"}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {[result.silencesRemoved != null ? `${result.silencesRemoved} pauses removed` : null, result.secondsRemoved != null ? `${clock(result.secondsRemoved)} shorter` : null].filter(Boolean).join(" · ") || "Silences and dead air cut out"}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500"><AudioLines className="h-3.5 w-3.5" />Audio</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-900">
                    {result.loudnessBefore && result.loudnessAfter ? <>{result.loudnessBefore} → {result.loudnessAfter}</> : result.loudnessAfter ?? "Levelled"}
                  </p>
                  <p className="text-xs text-zinc-600">Evened out to a standard listening level</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500"><Captions className="h-3.5 w-3.5" />Subtitles</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-900">{result.vtt ? <>{result.subtitleLanguage} · {result.subtitleCues} lines</> : "Added by YouTube"}</p>
                  <p className="text-xs text-zinc-600">{result.vtt ? `About ${result.wordCount.toLocaleString()} words transcribed` : "YouTube captions the video automatically after you upload it"}</p>
                </div>
              </div>

              {!result.demo && result.downloadUrl ? (
                <EditedPreview src={result.downloadUrl} vtt={result.vtt} />
              ) : localUrl ? (
                <div className="space-y-1.5">
                  <SubtitledPreview src={localUrl} cues={result.subtitlePreview} />
                  {result.demo && <p className="text-xs text-zinc-500">Preview: your original recording, played from your device, with sample subtitles on top. The cuts and audio levelling aren&apos;t applied in demo mode.</p>}
                </div>
              ) : (
                <div className="rounded-lg bg-zinc-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Subtitles{result.demo ? " (sample)" : ""}</p>
                  <ul className="mt-1.5 space-y-1 text-sm text-zinc-700">
                    {result.subtitlePreview.slice(0, 4).map((cue) => <li key={cue.start}><span className="mr-2 tabular-nums text-xs text-zinc-400">{clock(cue.start)}</span>{cue.text}</li>)}
                  </ul>
                </div>
              )}

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-zinc-800">
                {job.youtubeVideoId ? (
                  <p className="flex items-center gap-2 font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" />Posted to YouTube and set as this lesson&apos;s video.</p>
                ) : youtubeMode ? (
                  <>
                    <p className="font-semibold">Last step: put it on YouTube</p>
                    {config.youtube.connected ? (
                      <>
                        <p className="mt-1 text-zinc-600">We&apos;ll post it to <strong>{config.youtube.channelTitle ?? "your channel"}</strong> as unlisted, with the subtitles, and set it as this lesson&apos;s video.</p>
                        <Button type="button" size="sm" className="mt-3" onClick={() => void postToYouTube()} disabled={posting}>
                          {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />}Post to YouTube
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="mt-1 text-zinc-600">Connect your YouTube channel once, and edited videos can be posted for you.</p>
                        <a href="/api/tutor/youtube/connect/" className="focus-ring mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white"><Youtube className="h-4 w-4" />Connect YouTube</a>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-semibold">Last step: put it on YouTube</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>Download the edited video{result.demo ? <span className="text-zinc-500"> (available once the editing service is connected)</span> : null}.</li>
                      <li>Upload it to your YouTube channel (public or unlisted){result.vtt ? ", and add the subtitle file there" : ". YouTube adds captions automatically, usually within a few hours"}.</li>
                      <li>Paste its YouTube link as this lesson&apos;s video.</li>
                    </ol>
                  </>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.downloadUrl ? (
                    <a href={result.downloadUrl} className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"><Download className="h-3.5 w-3.5" />Download edited video</a>
                  ) : (
                    <span title="Sample result — there is no edited file in demo mode" className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-400"><Download className="h-3.5 w-3.5" />Download edited video</span>
                  )}
                  {onEdit && !result.demo && result.downloadUrl && (
                    <Button type="button" size="sm" variant="outline" onClick={() => onEdit({ url: `${result.downloadUrl}?inline=1`, vtt: result.vtt })}><Scissors className="h-3.5 w-3.5" />Trim &amp; add titles</Button>
                  )}
                  {result.vtt && <Button type="button" size="sm" variant="outline" onClick={() => downloadSubtitles(result)}><Captions className="h-3.5 w-3.5" />{result.demo ? "Download sample subtitles" : "Download subtitles"}</Button>}
                  {!job.youtubeVideoId && !youtubeMode && <Button type="button" size="sm" onClick={onReadyToLink}><Youtube className="h-4 w-4" />Paste the YouTube link</Button>}
                </div>
                {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
              </div>
            </>
          )}
        </div>
      )}

      {recent.length > 0 && (
        <details className="rounded-xl border border-border bg-white p-3 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 font-medium text-zinc-700"><History className="h-4 w-4" />Your recent edits ({recent.length})</summary>
          <ul className="mt-2 space-y-1">
            {recent.map((j) => (
              <li key={j.id}>
                <button type="button" onClick={() => { setJob(j); setError(null); onJobChange(j.id); }} className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-50", j.id === job?.id && "bg-primary/5")}>
                  <span className="flex min-w-0 items-center gap-2"><span className="truncate">{j.title}</span>{j.demo && <DemoBadge />}</span>
                  <span className={cn("shrink-0 text-xs", j.status === "ready" ? "text-emerald-700" : j.status === "failed" ? "text-red-700" : "text-zinc-500")}>
                    {j.status === "ready" ? "ready" : j.status === "failed" ? "failed" : "editing…"} · {new Date(j.createdAt).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
