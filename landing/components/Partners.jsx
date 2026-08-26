import { Wrap, Eyebrow, H2, Lede, SectionHead, hoverLift } from './ui.jsx'
import Reveal from './Reveal.jsx'

const CARDS = [
  {
    title: 'Augment your courses',
    body: 'Wrap existing curriculum in adaptive assessment, 24/7 tutoring, and spaced repetition — without rebuilding a single syllabus.',
    who: 'For provosts & deans',
  },
  {
    title: 'Extend your reach',
    body: "Serve working professionals your campus model can't — industry-tailored certificate programs under your institution's name.",
    who: 'For continuing education',
  },
  {
    title: 'Prove your outcomes',
    body: 'Mastery data, attempt logs, and retention curves for every learner — the evidence accreditors and employers keep asking for.',
    who: 'For assessment offices',
  },
]

export default function Partners() {
  return (
    <section id="partners" className="bg-gradient-to-b from-paper to-[#EEF0F9] py-16 sm:py-24">
      <Wrap>
        <Reveal>
          <SectionHead>
            <Eyebrow>Working with universities</Eyebrow>
            <H2>
              We don't replace universities.
              <br />
              We give them superpowers.
            </H2>
            <Lede>
              Great institutions have faculty, trust, and credentials. Adept brings the adaptive
              engine. Together: education with a century of credibility and a tutor for every single
              student.
            </Lede>
          </SectionHead>
        </Reveal>

        <Reveal delay={80} as="div" className="mb-8 sm:mb-10">
          <div className="inline-flex max-w-full items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 shadow-[0_12px_28px_-20px_rgba(16,20,48,.28)] sm:gap-4 sm:px-5 sm:py-4">
            <img
              src="/msoe-logo.png"
              alt="Milwaukee School of Engineering"
              className="size-12 shrink-0 object-contain sm:size-14"
              width="56"
              height="56"
            />
            <div className="min-w-0 leading-tight">
              <span className="block font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-soft">
                In association with
              </span>
              <span className="mt-1 block text-sm font-semibold text-ink sm:text-[15px]">
                Milwaukee School of Engineering
              </span>
            </div>
          </div>
        </Reveal>

        <div className="grid grid-cols-3 gap-6 max-[900px]:grid-cols-1">
          {CARDS.map((c, idx) => (
            <Reveal as="div" key={c.title} delay={idx * 100}>
              <div className={`rounded-card border border-line bg-card p-5 sm:p-[30px] ${hoverLift}`}>
                <h3 className="mb-2.5 font-display text-[20px] leading-[1.06] tracking-[-.02em]">
                  {c.title}
                </h3>
                <p className="text-[15px] text-ink-soft">{c.body}</p>
                <div className="mt-4 font-mono text-[12px] uppercase tracking-[.06em] text-ultra">
                  {c.who}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Wrap>
    </section>
  )
}
