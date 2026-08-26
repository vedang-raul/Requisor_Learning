import { useEffect, useRef, useState } from 'react'
import { Wrap, Eyebrow, H2, Lede, SectionHead, hoverLift } from './ui.jsx'
import Reveal from './Reveal.jsx'

const INDUSTRIES = [
  {
    id: 'finance',
    button: 'Credit union analyst',
    tag: 'Finance',
    assignTitle: 'Build a member-data retrieval assistant',
    assignBody:
      'Design a RAG pipeline over anonymized member transaction data that answers branch staff questions — and refuses to speculate beyond retrieved records. Defend your chunking strategy.',
    quizTitle: 'Q: Your retrieval step returns a stale rate sheet…',
    quizBody:
      "…and the model confidently quotes last quarter's APY to a member. Which two failure points allowed this, and which do you fix first? Explain your ordering.",
  },
  {
    id: 'mfg',
    button: 'Manufacturing engineer',
    tag: 'Manufacturing',
    assignTitle: 'Build a defect-triage agent for the line',
    assignBody:
      'Design an agent that reads shift QA reports, classifies defect patterns, and drafts a triage ticket — with a human approval gate before anything reaches the floor. Justify where the gate sits.',
    quizTitle: 'Q: Your agent flags a false defect pattern…',
    quizBody:
      '…and a line stops for 40 minutes on bad evidence. What in your evaluation setup failed to catch this before deployment, and what metric would have?',
  },
  {
    id: 'health',
    button: 'Healthcare PM',
    tag: 'Healthcare',
    assignTitle: 'Build a care-summary assistant with citations',
    assignBody:
      "Design a system that summarizes discharge notes for care coordinators, citing the exact source passage for every claim — and refusing when records conflict. Define 'conflict' precisely.",
    quizTitle: 'Q: Two records disagree on a medication dosage…',
    quizBody:
      "…and your assistant must not guess. Design its exact behavior in this case, and explain why 'pick the newer record' is not automatically safe.",
  },
]

export default function Tailored() {
  const [active, setActive] = useState(INDUSTRIES[0])
  const [fading, setFading] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function pick(industry) {
    if (industry.id === active.id) return
    setFading(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setActive(industry)
      setFading(false)
    }, 250)
  }

  return (
    <section id="tailored" className="py-16 sm:py-24">
      <Wrap>
        <Reveal>
          <SectionHead>
            <Eyebrow>Highly, highly personalized</Eyebrow>
            <H2>Same skill. Your world.</H2>
            <Lede>
              Every assignment, quiz, and example is generated for your background — not pulled from
              a bank. Pick an industry and watch the course rewrite itself:
            </Lede>
          </SectionHead>
        </Reveal>

        <Reveal
          delay={80}
          as="div"
          className="mb-8 flex flex-wrap gap-2.5 sm:mb-[34px]"
          role="group"
          aria-label="Choose an industry"
        >
          {INDUSTRIES.map((ind) => {
            const on = ind.id === active.id
            return (
              <button
                key={ind.id}
                onClick={() => pick(ind)}
                aria-pressed={on}
                className={[
                   'min-h-12 rounded-full border-[1.5px] px-5 py-[11px] text-[15px] font-semibold transition duration-200 max-[480px]:w-full',
                  on
                    ? 'border-ink bg-ink text-white shadow-[0_10px_22px_-12px_rgba(16,20,48,.5)]'
                    : 'border-line bg-card text-ink-soft hover:-translate-y-px hover:border-ink hover:text-ink',
                ].join(' ')}
              >
                {ind.button}
              </button>
            )
          })}
        </Reveal>

        <Reveal delay={160} className="grid grid-cols-2 gap-6 max-[820px]:grid-cols-1">
          <Card fading={fading}>
            <Label left="Your assignment" right={active.tag} />
            <CardTitle>{active.assignTitle}</CardTitle>
            <CardBody>{active.assignBody}</CardBody>
            <Skill>Skill tested: Retrieval-augmented generation</Skill>
          </Card>

          <Card fading={fading}>
            <Label left="Your adaptive quiz question" right="Generated fresh, every attempt" />
            <CardTitle>{active.quizTitle}</CardTitle>
            <CardBody>{active.quizBody}</CardBody>
            <Skill>Never the same question twice</Skill>
          </Card>
        </Reveal>

        <p className="mt-[26px] text-[15px] text-ink-soft">
          <b className="text-ink">One objective, infinite framings.</b> The rubric stays rigorous and
          identical — only the world around the problem changes to match yours. That's how skill
          transfers to Monday morning.
        </p>
      </Wrap>
    </section>
  )
}

function Card({ fading, children }) {
  return (
    <div
      className={`rounded-card border border-line bg-card p-5 shadow-[0_14px_34px_-22px_rgba(16,20,48,.16)] sm:p-[30px] ${hoverLift} ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {children}
    </div>
  )
}

function Label({ left, right }) {
  return (
    <div className="mb-4 flex flex-col gap-2 font-mono text-[11.5px] uppercase tracking-[.12em] text-ink-soft sm:flex-row sm:items-center sm:justify-between sm:gap-0">
      <span>{left}</span>
      <em className="not-italic text-ultra">{right}</em>
    </div>
  )
}

function CardTitle({ children }) {
  return (
    <h3 className="mb-3 font-display text-[21px] leading-[1.3] tracking-[-.02em]">{children}</h3>
  )
}

function CardBody({ children }) {
  return <p className="text-[15.5px] text-ink-soft">{children}</p>
}

function Skill({ children }) {
  return (
    <span className="mt-[18px] inline-block rounded-full border border-mint/25 bg-mint/9 px-3 py-[5px] font-mono text-[12px] text-mint">
      {children}
    </span>
  )
}
