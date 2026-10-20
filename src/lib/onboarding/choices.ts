/**
 * Ready-made answers for the onboarding questions, so people tap instead of
 * typing. Whatever they pick is saved as the same plain text the free-text
 * answers used to be (users.qualification, learning_goal…), so the assistant
 * and the course matcher (src/lib/ai/course-match.ts) read it unchanged.
 */

export const LEARNER_BACKGROUNDS = [
  "Student", "Software / IT", "Data / analytics", "Business / management", "Marketing / sales",
  "Product management", "Design / creative", "Engineering", "Finance", "Healthcare", "Education",
];

export const LEARNER_REASONS = [
  "Grow in my current job", "Get a promotion", "Change careers", "Find my first job",
  "Help with my studies", "Build something of my own", "Just curious",
];

export const TUTOR_SUBJECTS = [
  "Computer science", "Data / analytics", "AI / machine learning", "Cyber security", "Product management",
  "Business", "Marketing", "Design", "Mathematics", "Engineering",
];

export const TUTOR_QUALIFICATIONS = [
  "Bachelor's degree", "Master's degree", "PhD", "Teaching certificate", "Industry certification", "Industry experience",
];

export const TUTOR_EXPERIENCE = ["New to teaching", "1–2 years", "3–5 years", "6–10 years", "More than 10 years"];

export const TUTOR_PURPOSES = [
  "Build courses faster with AI", "Reach more students", "Teach online", "Track how my students are doing",
  "My university uses Requisor",
];

/** The picked options plus anything typed under "Other", as one answer: "Student, Finance, Nursing". */
export function joinChoices(picked: string[], other = ""): string {
  const extra = other.trim();
  return [...picked, ...(extra ? [extra] : [])].join(", ");
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "YYYY-MM-DD" from the three dropdowns, or "" if incomplete or not a real date (31 February). */
export function dateFromParts(year: string, month: string, day: string): string {
  const y = Number(year), m = Number(month), d = Number(day);
  if (!y || !m || !d) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
