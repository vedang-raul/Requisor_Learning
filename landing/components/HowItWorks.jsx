import { Wrap, Eyebrow, H2, SectionHead } from './ui.jsx'
import Reveal from './Reveal.jsx'

const STEPS = [
  {
    n: 'STEP 1',
    title: 'Start where you are',
    body: 'An intake assessment maps your role, industry, and current skill. You never sit through what you already know.',
  },
  {
    n: 'STEP 2',
    title: 'Learn in your format',
    body: (
      <>
        Text, code-first, analogies, diagrams — the tutor learns which explanations move <em>you</em>{' '}
        fastest, and adapts.
      </>
    ),
  },
  {
    n: 'STEP 3',
    title: 'Prove it to advance',
    body: 'Every unit is mastery-gated. Fail, and you get a different explanation and fresh questions — not the same test again.',
  },
  {
    n: 'STEP 4',
    title: 'Keep it for good',
    body: 'Mastered concepts resurface on a spaced schedule, timed to the edge of forgetting. Skills that survive the final exam.',
  },
]

export default function HowItWorks() {
  return (
    <section id="how" className="border-y border-line bg-card py-16 sm:py-24">
      <Wrap>
        <Reveal>
          <SectionHead>
            <Eyebrow>How learning works here</Eyebrow>
            <H2>Not lectures. A loop.</H2>
          </SectionHead>
        </Reveal>

        <div className="grid grid-cols-4 overflow-hidden rounded-card border border-line max-[960px]:grid-cols-2 max-[560px]:grid-cols-1">
          {STEPS.map((step, idx) => (
            <Reveal
              as="div"
              key={step.n}
              delay={idx * 100}
              className="border-r border-line last:border-r-0 max-[960px]:border-b last:max-[960px]:border-b-0"
            >
              <div className="group relative h-full bg-paper p-5 transition-colors duration-200 hover:bg-card sm:px-[26px] sm:py-8">
                <span className="font-mono text-[12px] tracking-[.1em] text-ultra">{step.n}</span>
                <h3 className="mb-2.5 mt-3 font-display text-[19px] leading-[1.06] tracking-[-.02em]">
                  {step.title}
                </h3>
                <p className="text-[14.5px] text-ink-soft">{step.body}</p>

                {idx < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute right-[-11px] top-8 z-[2] grid size-[22px] place-items-center rounded-full border border-line bg-card text-[11px] text-ultra transition-transform duration-200 group-hover:translate-x-1 max-[960px]:hidden"
                  >
                    →
                  </span>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </Wrap>
    </section>
  )
}
