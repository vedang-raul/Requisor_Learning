import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import styles from './alma.module.css'
import Reveal from './Reveal.jsx'
import { tutors } from '../lib/tutors.js'
import { landingCourses } from '../lib/courses.js'

function CourseRating({ slug, ratings, loading }) {
  const rating = ratings?.[slug]
  if (loading) {
    return <span className="h-4 w-16 animate-pulse rounded bg-white/10" aria-hidden="true" />
  }
  if (!rating || rating.count === 0) {
    return <span className="font-mono text-[11px] uppercase tracking-[.06em] text-alma-faint">New · no ratings yet</span>
  }
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-alma-text">
      <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
      {rating.average.toFixed(1)}
      <span className="font-normal text-alma-muted">({rating.count})</span>
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
    <section id="tutors" className={styles.tutorsSection}>
      <div className={styles.wrap}>
        <Reveal className="mb-14">
          <span className="mb-4 inline-flex items-center gap-2.5 font-mono text-[12px] uppercase tracking-[.14em] text-pulse">
            <span aria-hidden="true" className="h-0.5 w-[22px] bg-current" />
            Who you&apos;ll learn from
          </span>
          <h2 className="mt-3 text-[clamp(34px,4.2vw,56px)] leading-[1.08] tracking-[-.02em] text-alma-text" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
            Meet your tutors.
          </h2>
          <p className="mt-4 max-w-[56ch] text-[18px] leading-relaxed text-alma-muted">
            Real instructors design and own each learning path — ratings below come straight from learners
            who&apos;ve taken the course.
          </p>
        </Reveal>

        <div className="grid gap-6">
          {tutors.map((tutor, tIdx) => {
            const courses = tutor.courseSlugs
              .map((slug) => landingCourses.find((c) => c.slug === slug))
              .filter(Boolean)
            return (
              <Reveal key={tutor.id} delay={tIdx * 90} as="div">
                <div className="rounded-[22px] border border-alma-line bg-white/[0.03] p-5 transition-colors duration-300 hover:border-pulse/30 sm:p-[30px]">
                  <div className="mb-5 flex items-center gap-4">
                    <span
                      className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pulse to-pulse-deep text-lg font-bold text-[#062017] shadow-[0_10px_24px_-10px_rgba(125,243,216,.4)]"
                      aria-hidden="true"
                    >
                      {tutor.initials}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[20px] leading-[1.1] tracking-[-.02em] text-alma-text" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>{tutor.name}</h3>
                      <p className="font-mono text-[12px] uppercase tracking-[.08em] text-pulse">{tutor.role}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {courses.map((course) => (
                      <a
                        key={course.slug}
                        href="/login/"
                        className="flex flex-col gap-2 rounded-2xl border border-alma-line bg-white/[0.02] p-4 no-underline transition-colors duration-200 hover:border-pulse/40 hover:bg-white/[0.05]"
                      >
                        <span className={`h-1.5 w-8 rounded-full bg-gradient-to-r ${course.cover}`} aria-hidden="true" />
                        <span className="text-[14.5px] font-semibold leading-snug text-alma-text">{course.title}</span>
                        <CourseRating slug={course.slug} ratings={ratings} loading={loading} />
                      </a>
                    ))}
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
