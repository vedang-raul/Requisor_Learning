import type { Metadata } from "next";
import { headers } from "next/headers";
import { Clock, Lock, PlayCircle } from "lucide-react";
import { ensureCourseCatalog, getCourses } from "@/lib/courses/course-catalog";
import { openPreviewLink } from "@/lib/courses/preview-links";
import { buildPreview, type PreviewCourse, type PreviewLesson } from "@/lib/courses/preview-modules";
import { createRateLimiter } from "@/lib/server/rate-limit";

/**
 * A proposal's preview link: /p/<code>. No sign-in. The page is rendered on the
 * server from buildPreview() alone (the chosen modules' live lessons, other
 * modules as locked titles), so nothing else about the course, its tutor or the
 * site reaches the reader, and it makes no requests for app data of its own.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Course preview",
  robots: { index: false, follow: false },
  // Videos are YouTube embeds: they get this site's address, never the link's code.
  referrer: "strict-origin",
};

const visits = createRateLimiter(120, 10 * 60_000);

async function load(token: string): Promise<PreviewCourse | null> {
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (visits.check(ip).limited) return null;
  const link = await openPreviewLink(token);
  if (!link) return null;
  await ensureCourseCatalog();
  const [course] = await getCourses("WHERE c.slug = $1", [link.courseSlug]);
  return course ? buildPreview(course, link.keys, link.expiresAt) : null;
}

export default async function PreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await load(token);
  if (!preview) return <Unavailable />;
  const open = preview.modules.filter((m) => m.open);
  const lessons = open.reduce((n, m) => n + (m.open ? m.lessons.length : 0), 0);
  const until = new Date(preview.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="rounded-2xl border border-zinc-200 bg-white px-5 py-6 shadow-sm sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-primary">Course preview</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900 sm:text-3xl">{preview.title}</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {open.length} of {preview.modules.length} module{preview.modules.length === 1 ? "" : "s"} open · {lessons} lesson{lessons === 1 ? "" : "s"} · available until {until}
          </p>
        </header>

        <ol className="mt-6 space-y-4">
          {preview.modules.map((m, i) => (
            <li key={i}>
              {m.open ? (
                <details open={i === preview.modules.findIndex((x) => x.open)} className="group rounded-2xl border border-zinc-200 bg-white shadow-sm">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-5 py-4 sm:px-6">
                    <span>
                      <span className="block text-xs font-semibold text-zinc-500">Module {i + 1}</span>
                      <span className="block text-base font-semibold text-zinc-900">{m.title}</span>
                      {m.description && <span className="mt-1 block text-sm text-zinc-600">{m.description}</span>}
                    </span>
                    <span className="mt-1 shrink-0 text-xs font-semibold text-primary group-open:hidden">Show {m.lessons.length} lesson{m.lessons.length === 1 ? "" : "s"}</span>
                  </summary>
                  <div className="space-y-6 border-t border-zinc-100 px-5 py-5 sm:px-6">
                    {m.lessons.map((l, j) => <LessonView key={j} lesson={l} />)}
                  </div>
                </details>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-100/60 px-5 py-4 text-zinc-500 sm:px-6">
                  <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="block text-xs font-semibold">Module {i + 1} · not included in this preview</span>
                    <span className="block font-semibold text-zinc-600">{m.title}</span>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-8 text-center text-xs text-zinc-400">A read-only preview shared with you. Delivered on Alma 41.</p>
      </div>
    </main>
  );
}

function LessonView({ lesson }: { lesson: PreviewLesson }) {
  return (
    <article>
      <h3 className="flex items-center gap-2 text-[15px] font-semibold text-zinc-900">
        <PlayCircle className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{lesson.title}
      </h3>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500"><Clock className="h-3 w-3" aria-hidden="true" />{lesson.durationMin} min</p>
      {lesson.youtubeId && (
        <div className="mt-3 aspect-video overflow-hidden rounded-xl bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(lesson.youtubeId)}?rel=0`}
            title={lesson.title}
            className="h-full w-full"
            loading="lazy"
            referrerPolicy="strict-origin"
            allow="encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      )}
      {lesson.description && <p className="mt-3 text-sm leading-relaxed text-zinc-700">{lesson.description}</p>}
      {lesson.body && <div className="mt-3 max-h-[28rem] overflow-y-auto whitespace-pre-line rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700">{lesson.body}</div>}
      {lesson.keyTakeaways.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Key takeaways</p>
          <ul className="mt-1 ml-5 list-disc space-y-0.5 text-sm text-zinc-700">{lesson.keyTakeaways.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
    </article>
  );
}

function Unavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="max-w-md rounded-2xl border border-zinc-200 bg-white px-6 py-8 text-center shadow-sm">
        <Lock className="mx-auto h-6 w-6 text-zinc-400" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-semibold text-zinc-900">This preview isn&apos;t available</h1>
        <p className="mt-1 text-sm text-zinc-600">The link may have expired or been turned off. Ask the person who sent it for a new one.</p>
      </div>
    </main>
  );
}
