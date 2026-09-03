import { useEffect, useState } from 'react'
import { ExternalLink, Star } from 'lucide-react'
import { Wrap, Eyebrow, H2, Lede, SectionHead, hoverLift } from './ui.jsx'
import Reveal from './Reveal.jsx'
import { tutors } from '../lib/tutors.js'
import { landingCourses } from '../../lib/courses'

function CourseRating({ slug, ratings, loading }) {
  const rating = ratings?.[slug]
  if (loading) {
    return <span className="h-4 w-16 animate-pulse rounded bg-line/60" aria-hidden="true" />
  }
  if (!rating || rating.count === 0) {
    return <span className="font-mono text-[11px] uppercase tracking-[.06em] text-ink-soft">New · no ratings yet</span>
  }
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-ink">
      <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
      {rating.average.toFixed(1)}
      <span className="font-normal text-ink-soft">({rating.count})</span>
    </span>
  )
}

export default function Tutors() {
  const [ratings, setRatings] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/public/tutor-ratings')
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setRatings(data.ratings ?? {}) })
      .catch(() => { if (!cancelled) setRatings({}) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <section id="tutors" className="py-16 sm:py-24">
      <Wrap>
        <Reveal>
          <SectionHead>
            <Eyebrow>Who you'll learn from</Eyebrow>
            <H2>Meet your tutors.</H2>
            <Lede>
              Real instructors design and own each learning path — ratings below come straight from
              learners who've taken the course.
            </Lede>
          </SectionHead>
        </Reveal>

        <div className="grid gap-6">
          {tutors.map((tutor, tIdx) => {
            const courses = tutor.courseSlugs
              .map((slug) => landingCourses.find((c) => c.slug === slug))
              .filter(Boolean)
            return (
              <Reveal key={tutor.id} delay={tIdx * 90} as="div">
                <div className={`rounded-card border border-line bg-card p-5 sm:p-[30px] ${hoverLift}`}>
                  <div className="mb-5 flex items-center gap-4">
                    {tutor.imageSrc ? (
                      <img
                        src={tutor.imageSrc}
                        alt={`${tutor.name} portrait`}
                        className="size-14 shrink-0 rounded-2xl object-cover shadow-[0_10px_24px_-10px_rgba(16,20,48,.35)]"
                      />
                    ) : (
                      <span
                        className={`flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-bold text-white shadow-[0_10px_24px_-10px_rgba(16,20,48,.35)] ${tutor.accent}`}
                        aria-hidden="true"
                      >
                        {tutor.initials}
                      </span>
                    )}
                    <div className="min-w-0">
                      <h3 className="font-display text-[20px] leading-[1.1] tracking-[-.02em]">{tutor.name}</h3>
                      <p className="font-mono text-[12px] uppercase tracking-[.08em] text-ultra">{tutor.role}</p>
                      {tutor.linkedinUrl && (
                        <a
                          href={tutor.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-ink-soft underline-offset-2 hover:text-ultra hover:underline"
                        >
                          LinkedIn <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {courses.map((course) => (
                      <a
                        key={course.slug}
                        href="/login/"
                        className="flex flex-col gap-2 rounded-2xl border border-line bg-paper/60 p-4 no-underline transition-colors duration-200 hover:border-ultra/40 hover:bg-paper"
                      >
                        <span className={`h-1.5 w-8 rounded-full bg-gradient-to-r ${course.cover}`} aria-hidden="true" />
                        <span className="text-[14.5px] font-semibold leading-snug text-ink">{course.title}</span>
                        <CourseRating slug={course.slug} ratings={ratings} loading={loading} />
                      </a>
                    ))}
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </Wrap>
    </section>
  )
}
