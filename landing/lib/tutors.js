/* Static tutor roster for the landing page. There's no tutor-bio field in
   the data model (see lib/db.ts), so this is hand-maintained — update it
   here when a course changes hands or a new tutor joins. */
export const tutors = [
  {
    id: 'naveen-kankate',
    name: 'Naveen Kankate',
    role: 'Course Instructor',
    initials: 'NK',
    accent: 'from-primary to-secondary',
    courseSlugs: ['product-management', 'data-analytics', 'agentic-ai', 'cyber-security'],
  },
]
