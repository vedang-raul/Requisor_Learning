"use client";

import { isPlaceholder } from "@/lib/utils";
import { ExternalLink, FileText, MonitorPlay } from "lucide-react";

export function VideoEmbed({
  youtubeId,
  title,
  format = "video",
  resourceUrl,
}: {
  youtubeId: string;
  title: string;
  format?: "video" | "reading";
  resourceUrl?: string;
}) {
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
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-black shadow-soft">
      <iframe
        className="aspect-video w-full"
        src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&modestbranding=1`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}
