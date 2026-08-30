/* Renders {{course|slug|Title}} tags from the landing chatbot as clickable
   chips. The visitor isn't signed in yet, so every chip routes to the login
   page rather than the course itself — the course slug is carried along so
   the app can jump straight there once the visitor signs in. */

const VALID_SLUGS = new Set([
  'product-management',
  'data-analytics',
  'agentic-ai',
  'cyber-security',
])

const TAG_PATTERN = /\{\{course\|([^|}]+)\|([^}]+)\}\}/g

/** Splits chatbot text into plain-text and course-tag segments. */
export function parseCourseTags(text) {
  const segments = []
  let lastIndex = 0

  for (const match of text.matchAll(TAG_PATTERN)) {
    const [full, slug, title] = match
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'course', slug: slug.trim(), title: title.trim() })
    lastIndex = match.index + full.length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return segments
}

export default function CourseSuggestion({ slug, title }) {
  const cleanSlug = VALID_SLUGS.has(slug) ? slug : null
  const href = cleanSlug ? `/login/?course=${cleanSlug}` : '/login/'

  return (
    <a
      href={href}
      className="my-1.5 flex max-w-full items-center gap-2 rounded-xl border border-ultra/20 bg-ultra/[0.06] px-3 py-2 text-[13.5px] font-semibold text-ink no-underline transition hover:border-ultra/40 hover:bg-ultra/10"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-ultra/15 text-ultra">
        ▶
      </span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="shrink-0 text-[11px] font-medium text-ink-soft">Sign in →</span>
    </a>
  )
}
