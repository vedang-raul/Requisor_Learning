"use client";

import { useEffect, useRef } from "react";
import { isPlaceholder } from "@/lib/utils";
import { ExternalLink, FileText, MonitorPlay } from "lucide-react";

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
  events?: { onStateChange?: (e: { data: number }) => void };
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
  resourceUrl,
  onEnded,
}: {
  youtubeId: string;
  title: string;
  format?: "video" | "reading";
  resourceUrl?: string;
  /** Called when the YouTube video reaches the end. */
  onEnded?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  // Keep onEnded in a ref so the effect doesn't need it as a dependency
  // (avoids destroying/recreating the player when the callback identity changes).
  const onEndedRef = useRef(onEnded);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  useEffect(() => {
    if (format !== "video" || isPlaceholder(youtubeId)) return;
    let cancelled = false;

    onYTReady(() => {
      if (cancelled || !containerRef.current) return;
      // Clear any previous player DOM
      containerRef.current.innerHTML = "";
      const div = document.createElement("div");
      containerRef.current.appendChild(div);

      playerRef.current = new window.YT.Player(div, {
        videoId: youtubeId,
        width: "100%",
        height: "100%",
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
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
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [youtubeId, format]);

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
  if (isPlaceholder(youtubeId)) {
    return (
      <div className="glass flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl text-center">
        <div className="rounded-2xl bg-primary/15 p-4">
          <MonitorPlay className="h-10 w-10 text-primary" />
        </div>
        <p className="text-sm font-medium text-zinc-800">Video coming soon</p>
        <p className="max-w-sm px-6 text-xs leading-relaxed text-zinc-500">
          This lesson doesn&apos;t have a video yet. An admin can paste a YouTube URL in{" "}
          <span className="text-primary">Admin → Lessons</span> and it will appear here automatically.
        </p>
      </div>
    );
  }

  /* Real YouTube video — YT IFrame API manages the iframe inside the div */
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-black shadow-soft">
      <div ref={containerRef} className="aspect-video w-full" />
    </div>
  );
}
