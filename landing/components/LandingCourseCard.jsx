/* Mirrors components/course-card.tsx (the signed-in app's Learning Paths
   card) so a course looks identical before and after login — minus the
   per-user progress bar/bookmark, since the visitor has no account yet. */
import { Bot, BarChart3, Package, Shield, Clock, Video, PlayCircle, ArrowRight } from 'lucide-react'
import { formatMinutes } from '../../lib/courses'

const categoryMeta = {
  product: { icon: Package },
  data: { icon: BarChart3 },
  ai: { icon: Bot },
  security: { icon: Shield },
}

const courseIllustrations = {
  'agentic-ai': '/course-agentic-ai.jpg',
  'data-analytics': '/course-data-analytics.jpg',
  'product-management': '/course-product-management.jpg',
  'cyber-security': '/course-cyber-security.jpg',
}

export default function LandingCourseCard({ course }) {
  const { slug, title, tagline, category, level, cover, lessonCount, totalMin } = course
  const Icon = categoryMeta[category]?.icon ?? Package

  return (
    <a
      href={`/login/?course=${slug}`}
      className="group gradient-border relative flex flex-col overflow-hidden rounded-2xl bg-card no-underline shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
    >
      {/* Cover */}
      <div className={`relative h-24 overflow-hidden bg-gradient-to-br ${cover}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.25),transparent_55%)]" />
        {courseIllustrations[slug] && (
          <img
            src={courseIllustrations[slug]}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover transition-transform duration-[400ms] ease-out group-hover:scale-[1.06]"
          />
        )}
        <div className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/25 text-white backdrop-blur-sm">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="absolute bottom-2 right-2.5 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          {level}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div>
          <h3 className="text-[13.5px] font-semibold leading-snug text-ink transition-colors group-hover:text-ultra">
            {title}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-ink-soft">{tagline}</p>
        </div>

        <div className="flex items-center gap-3 text-[10.5px] text-ink-soft">
          <span className="inline-flex items-center gap-1"><Video className="h-3 w-3" />{lessonCount} videos</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{formatMinutes(totalMin)}</span>
        </div>

        <span className="mt-auto inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-secondary text-[12px] font-medium text-white transition-all duration-200 group-hover:brightness-110">
          <PlayCircle className="h-3.5 w-3.5" />
          Sign in to start
          <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      </div>
    </a>
  )
}
