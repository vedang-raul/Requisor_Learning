import { Wrap, Eyebrow, H2, SectionHead, hoverLift } from './ui.jsx'
import Reveal from './Reveal.jsx'

export default function Problem() {
  return (
    <section className="relative overflow-hidden bg-paper py-16 text-ink sm:py-24">
      <Wrap>
        <Reveal>
          <SectionHead>
            <Eyebrow>The problem</Eyebrow>
            <H2>
              Education got heavy.
              <br />
              Learning got left behind.
            </H2>
          </SectionHead>
        </Reveal>

        <div className="mt-3.5 grid grid-cols-2 gap-7 max-[820px]:grid-cols-1">
          <Reveal delay={80}>
            <Card>
              <Big>$120K+</Big>
              <CardTitle>Bloated by buildings</CardTitle>
              <CardBody>
                Campuses, overhead, and administration drive tuition to astronomical levels — while
                the ROI of a traditional degree keeps shrinking. You pay for the institution. The
                learning is what's left over.
              </CardBody>
            </Card>
          </Reveal>

          <Reveal delay={160}>
            <Card>
              <Big>1-size-fits-0</Big>
              <CardTitle>Cookie-cutter by design</CardTitle>
              <CardBody>
                A banker, a nurse, and a manufacturing engineer take the same course, watch the same
                videos, do the same toy exercises — and walk out asking the same question:{' '}
                <em>what do I actually take back to my job?</em>
              </CardBody>
            </Card>
          </Reveal>

          <Reveal delay={240} className="col-span-full">
            <blockquote className="border-l-[3px] border-apricot py-1.5 pl-5 font-display text-[clamp(20px,2.6vw,28px)] font-semibold leading-[1.35] sm:pl-[26px]">
              "The lecture was built for the room. The video was built for the masses. Nothing was
              ever built for <em>you</em> — until AI made it possible."
              <small className="mt-2.5 block font-mono text-[12px] font-normal uppercase tracking-[.08em] text-ink-soft">
                Why we exist
              </small>
            </blockquote>
          </Reveal>
        </div>
      </Wrap>
    </section>
  )
}

function Card({ children }) {
  return (
    <div
      className={`h-full rounded-card border border-line bg-card p-5 shadow-[0_14px_34px_-22px_rgba(16,20,48,.16)] sm:p-[34px] ${hoverLift}`}
    >
      {children}
    </div>
  )
}

function Big({ children }) {
  return (
    <div className="font-display text-[clamp(40px,4.5vw,60px)] font-extrabold leading-none tracking-[-.02em] text-apricot">
      {children}
    </div>
  )
}

function CardTitle({ children }) {
  return (
    <h3 className="mb-2.5 mt-3.5 font-display text-[22px] leading-[1.06] tracking-[-.02em]">
      {children}
    </h3>
  )
}

function CardBody({ children }) {
  return <p className="text-[15.5px] text-ink-soft">{children}</p>
}
