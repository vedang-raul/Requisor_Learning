import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ExternalLink, Star, Users, BookOpen, Sparkles } from 'lucide-react'
import { Wrap, Eyebrow, H2, Lede, SectionHead } from './ui.jsx'
import Reveal from './Reveal.jsx'
import { tutors } from '../lib/tutors.js'
import { landingCourses } from '../../lib/courses'

/* ================================================================== */
/*  Scoped styles — layout, type and motion in plain CSS so nothing     */
/*  depends on Tailwind generating new arbitrary classes. Tailwind is   */
/*  used only for the color tokens (ink, ink-soft, ultra, line, …).     */
/* ================================================================== */
const styles = `
.tu { --ease: cubic-bezier(.16,1,.3,1); --mono: ui-monospace, SFMono-Regular, Menlo, monospace; }

/* ---- instructor card ---- */
.tu-card {
  position: relative; overflow: hidden; border-width: 1px; border-style: solid; border-radius: 24px;
  display: grid; grid-template-columns: minmax(0, 1fr);
  opacity: 0; transform: translateY(18px);
  transition: box-shadow .5s var(--ease), transform .5s var(--ease), opacity .7s var(--ease);
}
.tu-card.is-in { opacity: 1; transform: none; }
.tu-card:hover { box-shadow: 0 30px 60px -36px rgba(16,20,48,.35); }
@media (min-width: 1024px) { .tu-card { grid-template-columns: 340px minmax(0, 1fr); } }

/* ---- profile panel ---- */
.tu-profile { position: relative; padding: 28px; display: flex; flex-direction: column; gap: 20px; }
@media (min-width: 1024px) { .tu-profile { padding: 36px; border-right-width: 1px; border-right-style: solid; border-color: inherit; } }
.tu-profile-glow {
  position: absolute; inset: 0; z-index: 0; opacity: .10; pointer-events: none;
  mask-image: radial-gradient(360px 260px at 20% 0%, #000, transparent 70%);
  -webkit-mask-image: radial-gradient(360px 260px at 20% 0%, #000, transparent 70%);
}
.tu-profile > * { position: relative; z-index: 1; }
.tu-avatar-row { display: flex; align-items: center; gap: 18px; }
.tu-avatar { position: relative; flex: none; width: 88px; height: 88px; border-radius: 22px; overflow: hidden; box-shadow: 0 14px 30px -14px rgba(16,20,48,.45); }
.tu-avatar img, .tu-avatar .tu-initials { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.tu-initials { display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; color: #fff; }
.tu-avatar-ring { position: absolute; inset: -5px; border-radius: 27px; border-width: 1.5px; border-style: solid; opacity: .35; transition: opacity .4s, transform .6s var(--ease); }
.tu-card:hover .tu-avatar-ring { opacity: .9; transform: scale(1.04); }
.tu-role { font-family: var(--mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; }
.tu-name { margin: 4px 0 0; font-size: 26px; line-height: 1.1; letter-spacing: -.025em; font-weight: 600; }
@media (min-width: 1024px) { .tu-name { font-size: 30px; } }

/* stats strip */
.tu-stats { display: grid; grid-template-columns: repeat(3, 1fr); border-width: 1px; border-style: solid; border-radius: 16px; overflow: hidden; }
.tu-stat { padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
.tu-stat + .tu-stat { border-left-width: 1px; border-left-style: solid; }
.tu-stat-label { font-family: var(--mono); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; }
.tu-stat-value { font-size: 20px; line-height: 1; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; display: inline-flex; align-items: center; gap: 5px; }
.tu-stat-value svg { width: 14px; height: 14px; }

.tu-link {
  display: inline-flex; align-items: center; gap: 8px; align-self: flex-start;
  padding: 10px 16px; border-radius: 9999px; border-width: 1px; border-style: solid; text-decoration: none;
  font-size: 13px; font-weight: 600; transition: background-color .25s, border-color .25s, color .25s, transform .4s var(--ease);
}
.tu-link svg { width: 14px; height: 14px; }
.tu-link:hover { transform: translateY(-1px); }

/* ---- course list ---- */
.tu-courses { padding: 8px 12px 12px; }
@media (min-width: 1024px) { .tu-courses { padding: 16px 20px 20px; } }
.tu-courses-head {
  display: flex; align-items: baseline; justify-content: space-between; padding: 16px 12px 10px;
  font-family: var(--mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
}
.tu-row {
  position: relative; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: 14px;
  padding: 14px 12px; border-radius: 16px; text-decoration: none;
  opacity: 0; transform: translateY(10px);
  transition: background-color .3s, transform .5s var(--ease), opacity .6s var(--ease);
}
.is-in .tu-row { opacity: 1; transform: none; transition-delay: var(--d, 0ms); }
.tu-row:hover, .tu-row:focus-visible { background-color: rgba(16,20,48,.035); }
.tu-row:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.tu-row + .tu-row::before { content: ''; position: absolute; left: 68px; right: 12px; top: -1px; height: 1px; opacity: .6; background: currentColor; }
@media (min-width: 640px) { .tu-row { grid-template-columns: 52px minmax(0, 1fr) auto; gap: 18px; padding: 18px 16px; } .tu-row + .tu-row::before { left: 86px; right: 16px; } }
.tu-cover { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff; font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: .04em; transition: transform .5s var(--ease); }
@media (min-width: 640px) { .tu-cover { width: 52px; height: 52px; border-radius: 14px; font-size: 12px; } }
.tu-row:hover .tu-cover { transform: scale(1.06) rotate(-2deg); }
.tu-course-title { font-size: 16px; font-weight: 600; letter-spacing: -.01em; line-height: 1.25; }
@media (min-width: 640px) { .tu-course-title { font-size: 17px; } }
.tu-course-meta { margin-top: 6px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12.5px; }
.tu-meter { display: inline-flex; gap: 3px; }
.tu-meter i { display: block; width: 14px; height: 5px; border-radius: 3px; background: rgba(16,20,48,.12); overflow: hidden; position: relative; }
.tu-meter i::after { content: ''; position: absolute; inset: 0; background: #f59e0b; transform: scaleX(var(--fill, 0)); transform-origin: left; transition: transform .8s var(--ease); transition-delay: var(--d, 0ms); opacity: 0; }
.is-in .tu-meter i::after { opacity: 1; }
.tu-score { font-weight: 600; font-variant-numeric: tabular-nums; }
.tu-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 9999px; border-width: 1px; border-style: solid; font-family: var(--mono); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; }
.tu-badge svg { width: 11px; height: 11px; }
.tu-cta { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; white-space: nowrap; }
.tu-cta span { display: none; }
@media (min-width: 640px) { .tu-cta span { display: inline; } }
.tu-cta svg { width: 16px; height: 16px; transition: transform .5s var(--ease); }
.tu-row:hover .tu-cta svg { transform: translateX(4px); }
.tu-shimmer { display: inline-block; height: 12px; width: 120px; border-radius: 4px; background: linear-gradient(90deg, rgba(0,0,0,.06) 25%, rgba(0,0,0,.12) 50%, rgba(0,0,0,.06) 75%); background-size: 200% 100%; animation: tu-shimmer 1.6s linear infinite; }
@keyframes tu-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

@media (prefers-reduced-motion: reduce) {
  .tu-card, .tu-row, .tu-meter i::after, .tu-cover, .tu-cta svg, .tu-avatar-ring, .tu-link { transition: none !important; }
  .tu-card, .tu-row { opacity: 1 !important; transform: none !important; }
  .tu-meter i::after { opacity: 1 !important; }
  .tu-shimmer { animation: none; }
}
`

/* ================================================================== */
/*  Hooks                                                               */
/* ================================================================== */
function useInView(threshold = 0.2) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect() } }, { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return [ref, inView]
}

function useCountUp(target, active, duration = 900) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!active) return
    if (!target) { setV(0); return }
    let raf; const t0 = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration)
      setV(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, active, duration])
  return v
}

/* ================================================================== */
/*  Helpers                                                             */
/* ================================================================== */
const initialsOf = (title) => title.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

function summarize(courses, ratings) {
  let reviews = 0, weighted = 0
  for (const c of courses) {
    const r = ratings?.[c.slug]
    if (r?.count) { reviews += r.count; weighted += r.average * r.count }
  }
  return { reviews, average: reviews ? weighted / reviews : null }
}

/* ================================================================== */
/*  Pieces                                                              */
/* ================================================================== */
function Meter({ value, delay }) {
  return (
    <span className="tu-meter text-ink" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <i key={i} style={{ '--fill': Math.max(0, Math.min(1, value - i)), '--d': `${delay + i * 60}ms` }} />
      ))}
    </span>
  )
}

function CourseMeta({ rating, loading, active, delay }) {
  const shown = useCountUp(rating?.average ?? 0, active && !loading)
  if (loading) return <span className="tu-course-meta"><span className="tu-shimmer" aria-hidden="true" /></span>
  if (!rating || rating.count === 0) {
    return (
      <span className="tu-course-meta text-ink-soft">
        <span className="tu-badge border-line text-ultra"><Sparkles aria-hidden="true" /> New course</span>
        <span>Be among the first learners</span>
      </span>
    )
  }
  return (
    <span className="tu-course-meta text-ink-soft" aria-label={`Rated ${rating.average.toFixed(1)} out of 5 from ${rating.count} learner reviews`}>
      <Meter value={rating.average} delay={delay + 200} />
      <span className="tu-score text-ink">{shown.toFixed(1)}</span>
      <span>{rating.count.toLocaleString()} learner {rating.count === 1 ? 'review' : 'reviews'}</span>
    </span>
  )
}

function CourseRow({ course, index, rating, loading, active }) {
  const delay = 150 + index * 90
  return (
    <a href="/login/" className="tu-row text-line" style={{ '--d': `${delay}ms` }}>
      <span className={`tu-cover bg-gradient-to-br ${course.cover}`} aria-hidden="true">{initialsOf(course.title)}</span>
      <span style={{ minWidth: 0 }}>
        <span className="tu-course-title text-ink" style={{ display: 'block' }}>{course.title}</span>
        <CourseMeta rating={rating} loading={loading} active={active} delay={delay} />
      </span>
      <span className="tu-cta text-ultra"><span>View course</span><ArrowRight aria-hidden="true" /></span>
    </a>
  )
}

function InstructorCard({ tutor, courses, ratings, loading }) {
  const [ref, inView] = useInView()
  const stats = summarize(courses, ratings)
  const avg = useCountUp(stats.average ?? 0, inView && !loading)
  const reviews = useCountUp(stats.reviews, inView && !loading)

  return (
    <article ref={ref} className={`tu-card border-line bg-card ${inView ? 'is-in' : ''}`} aria-labelledby={`tutor-${tutor.id}`}>
      <div className="tu-profile border-line">
        <div className={`tu-profile-glow bg-gradient-to-br ${tutor.accent}`} aria-hidden="true" />

        <div className="tu-avatar-row">
          <div className="tu-avatar">
            {tutor.imageSrc
              ? <img src={tutor.imageSrc} alt={`${tutor.name} portrait`} />
              : <div className={`tu-initials bg-gradient-to-br ${tutor.accent}`} aria-hidden="true">{tutor.initials}</div>}
            <span className="tu-avatar-ring border-ultra" aria-hidden="true" />
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="tu-role text-ultra">{tutor.role}</p>
            <h3 id={`tutor-${tutor.id}`} className="tu-name font-display text-ink">{tutor.name}</h3>
          </div>
        </div>

        <dl className="tu-stats border-line text-ink">
          <div className="tu-stat">
            <dt className="tu-stat-label text-ink-soft">Courses</dt>
            <dd className="tu-stat-value"><BookOpen className="text-ultra" aria-hidden="true" />{courses.length}</dd>
          </div>
          <div className="tu-stat">
            <dt className="tu-stat-label text-ink-soft">Rating</dt>
            <dd className="tu-stat-value">
              {loading ? <span className="tu-shimmer" style={{ width: 40 }} /> : stats.average
                ? <><Star className="fill-amber-400 text-amber-400" aria-hidden="true" />{avg.toFixed(1)}</>
                : <span className="text-ink-soft" style={{ fontSize: 13, fontWeight: 500 }}>Not yet rated</span>}
            </dd>
          </div>
          <div className="tu-stat">
            <dt className="tu-stat-label text-ink-soft">Reviews</dt>
            <dd className="tu-stat-value">
              {loading ? <span className="tu-shimmer" style={{ width: 40 }} /> : <><Users className="text-ultra" aria-hidden="true" />{Math.round(reviews).toLocaleString()}</>}
            </dd>
          </div>
        </dl>

        {tutor.linkedinUrl && (
          <a href={tutor.linkedinUrl} target="_blank" rel="noreferrer" className="tu-link border-line text-ink hover:border-ultra hover:text-ultra">
            View LinkedIn profile <ExternalLink aria-hidden="true" />
          </a>
        )}
      </div>

      <div className="tu-courses">
        <div className="tu-courses-head text-ink-soft">
          <span>Teaches {courses.length} {courses.length === 1 ? 'course' : 'courses'}</span>
          <span>Learner ratings</span>
        </div>
        {courses.map((c, i) => (
          <CourseRow key={c.slug} course={c} index={i} rating={ratings?.[c.slug]} loading={loading} active={inView} />
        ))}
      </div>
    </article>
  )
}

/* ================================================================== */
/*  Section                                                             */
/* ================================================================== */
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
    <section id="tutors" className="tu py-16 sm:py-24">
      <style>{styles}</style>
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
        <div style={{ display: 'grid', gap: 24, marginTop: 8 }}>
          {tutors.map((tutor) => {
            const courses = tutor.courseSlugs.map((slug) => landingCourses.find((c) => c.slug === slug)).filter(Boolean)
            return <InstructorCard key={tutor.id} tutor={tutor} courses={courses} ratings={ratings} loading={loading} />
          })}
        </div>
      </Wrap>
    </section>
  )
}