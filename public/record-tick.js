// Frame clock for the lesson recorder (components/video-recorder.tsx).
// A page's own timers slow to a crawl when its tab is in the background —
// exactly when a tutor is presenting from another window — but a worker's
// timers keep going, so the recording keeps its frame rate.
setInterval(() => postMessage(0), 1000 / 30);
