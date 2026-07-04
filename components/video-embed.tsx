"use client";

import { isPlaceholder } from "@/lib/utils";
import { MonitorPlay } from "lucide-react";

export function VideoEmbed({ youtubeId, title }: { youtubeId: string; title: string }) {
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
