"use client";

import { useEffect, useRef, useState } from "react";
import { extractYouTubeId, isPlaceholder } from "@/lib/utils";
import { ExternalLink, FileText, Loader2, MonitorPlay } from "lucide-react";
import { renderMarkdownLite } from "@/components/markdown-lite";
/* ── YouTube IFrame API globals ─────────────────────────────────────── */
declare global {
  interface Window {
    YT: {
      Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayerInstance;
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}
interface YTPlayerOptions {
  videoId: string;
  width?: string;
  height?: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: () => void;
    onError?: (e: { data: number }) => void;
    onStateChange?: (e: { data: number }) => void;
  };
}
interface YTPlayerInstance {
  destroy(): void;
}

/** Queue of callbacks waiting for the YT IFrame API to load. */
const _ytQueue: Array<() => void> = [];

function onYTReady(cb: () => void) {
  if (typeof window === "undefined") return;
  if (window.YT?.Player) { cb(); return; }
  _ytQueue.push(cb);
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  }
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    prev?.();
    _ytQueue.splice(0).forEach((fn) => fn());
  };
}

/* ── Component ────────────────────────────────────────────────────────── */
export function VideoEmbed({
  youtubeId,
  title,
  format = "video",
  body,
  bodyFileUrl,
  resourceUrl,
  onEnded,
}: {
  youtubeId: string;
  title: string;
  format?: "video" | "reading";
  resourceUrl?: string;
  body?: string;
  bodyFileUrl?: string;
  /** Called when the YouTube video reaches the end. */
  onEnded?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const [playerStatus, setPlayerStatus] = useState<"loading" | "ready" | "error">("loading");
  const [playerErrorCode, setPlayerErrorCode] = useState<number | null>(null);
  const normalizedVideoId = extractYouTubeId(youtubeId);
  // Keep onEnded in a ref so the effect doesn't need it as a dependency
  // (avoids destroying/recreating the player when the callback identity changes).
  const onEndedRef = useRef(onEnded);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  useEffect(() => {
    if (format !== "video" || !normalizedVideoId) return;
    let cancelled = false;
    setPlayerStatus("loading");
    setPlayerErrorCode(null);
    const timeout = window.setTimeout(() => {
      if (!cancelled) setPlayerStatus("error");
    }, 10_000);

    onYTReady(() => {
      if (cancelled || !containerRef.current) return;
      // Clear any previous player DOM
      containerRef.current.innerHTML = "";
      const div = document.createElement("div");
      containerRef.current.appendChild(div);

      playerRef.current = new window.YT.Player(div, {
        videoId: normalizedVideoId,
        width: "100%",
        height: "100%",
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          // YouTube error 153 occurs when an IFrame API client does not
          // identify its parent origin. This is especially common behind
          // hosted preview proxies, where relying on the Referer is brittle.
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            window.clearTimeout(timeout);
            if (!cancelled) setPlayerStatus("ready");
          },
          onError: (event) => {
            window.clearTimeout(timeout);
            if (!cancelled) {
              console.warn("YouTube player error", { videoId: normalizedVideoId, code: event.data });
              setPlayerErrorCode(event.data);
              setPlayerStatus("error");
            }
          },
          onStateChange: (e) => {
            if (e.data === window.YT.PlayerState.ENDED) {
              onEndedRef.current?.();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [normalizedVideoId, format]);

  if (format === "reading" && body?.trim()) {
    return (
      <div className="glass w-full rounded-2xl p-6">
        <div className="prose prose-sm max-w-none text-sm leading-relaxed text-zinc-800">
          {renderMarkdownLite(body)}
        </div>
      </div>
    );
  }

  /* Reading lesson — viewable attached PDF/TXT, rendered inline */
  if (format === "reading" && bodyFileUrl) {
    return (
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-soft">
        <iframe src={bodyFileUrl} title={title} className="h-[70vh] w-full" />
        <a
          href={bodyFileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring flex items-center justify-center gap-1.5 border-t border-zinc-100 bg-zinc-50 px-4 py-2.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
        >
          Open in a new tab <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    );
  }

  /* Reading lesson */
  if (format === "reading") {
    return (
      <div className="glass flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl text-center">
        <div className="rounded-2xl bg-primary/15 p-4">
          <FileText className="h-10 w-10 text-primary" />
        </div>
        <p className="text-sm font-medium text-zinc-800">This lesson is a reading, not a video</p>
        <p className="max-w-sm px-6 text-xs leading-relaxed text-zinc-500">
          Open the source below and work through it — mark the lesson complete once you&apos;re done.
        </p>
        {resourceUrl && (
          <a
            href={resourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-secondary"
          >
            Open article <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    );
  }

  /* Placeholder — video not yet uploaded */
  if (isPlaceholder(youtubeId) || !normalizedVideoId) {
    return (
      <div className="glass flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl text-center">
        <div className="rounded-2xl bg-primary/15 p-4">
          <MonitorPlay className="h-10 w-10 text-primary" />
        </div>
        <p className="text-sm font-medium text-zinc-800">Video coming soon</p>
        <p className="max-w-sm px-6 text-xs leading-relaxed text-zinc-500">
          This lesson doesn&apos;t have a valid video yet. A tutor can paste a YouTube URL or video ID
          in the lesson editor and it will appear here automatically.
        </p>
      </div>
    );
  }

  /* Real YouTube video — YT IFrame API manages the iframe inside the div */
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-black shadow-soft">
      <div className="relative aspect-video w-full">
        <div ref={containerRef} className="h-full w-full" />
        {playerStatus !== "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center text-white">
            {playerStatus === "loading" ? (
              <>
                <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
                <p className="text-sm">Loading video…</p>
              </>
            ) : (
              <>
                <MonitorPlay className="h-8 w-8 text-primary" aria-hidden="true" />
                <p className="text-sm font-medium">This video could not be embedded.</p>
                <p className="text-xs text-zinc-400">
                  {playerErrorCode === 101 || playerErrorCode === 150
                    ? "The video owner has disabled playback on other websites."
                    : "Try opening it on YouTube below, or ask the tutor to check the video link."}
                </p>
              </>
            )}
          </div>
        )}
      </div>
      <a
        href={`https://www.youtube.com/watch?v=${normalizedVideoId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="focus-ring flex items-center justify-center gap-1.5 border-t border-white/10 bg-zinc-950 px-4 py-2.5 text-xs font-medium text-white transition hover:bg-zinc-900"
      >
        Open {title} on YouTube <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </div>
  );
}
