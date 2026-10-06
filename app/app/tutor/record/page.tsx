"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VideoRecorder } from "@/components/video-recorder";

/**
 * The full-screen lesson recorder. Opened in its own tab from the lesson
 * wizard's Record tab, which passes the lesson title and a session id used to
 * hand the finished recording back (see components/video-recorder.tsx).
 */
function Recorder() {
  const params = useSearchParams();
  return <VideoRecorder lessonTitle={params.get("title") ?? ""} sessionId={params.get("rid") ?? ""} />;
}

export default function RecordPage() {
  return <Suspense fallback={null}><Recorder /></Suspense>;
}
