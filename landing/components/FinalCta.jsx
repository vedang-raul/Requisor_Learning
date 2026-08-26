import { Wrap, Eyebrow, H2, btnPrimary, btnGhost } from './ui.jsx'
import Reveal from './Reveal.jsx'

export default function FinalCta() {
  return (
    <section id="join" className="relative overflow-hidden bg-paper py-16 text-center text-ink sm:py-24">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(600px 320px at 50% 0%, rgba(35,174,151,.14), transparent 65%)',
        }}
      />
      <Wrap className="relative">
        <Reveal>
          <Eyebrow>Enrollment</Eyebrow>
          <H2 className="mt-4 text-[clamp(34px,5vw,58px)]">
            The universities of the next decade won't be buildings.
          </H2>
          <p className="mx-auto mb-[34px] mt-[18px] max-w-[52ch] text-ink-soft">
            Start with one team, one course, and proof it worked. First cohorts are forming for
            Applied AI Engineering — assignments tailored to your industry from day one.
          </p>
        </Reveal>
        <Reveal delay={120} className="flex flex-wrap justify-center gap-3.5">
          <a className={btnPrimary} href="/login/">
            Log in
          </a>
          <a className={btnGhost} href="mailto:hello@example.com?subject=Adept%20waitlist">
            Join the learner waitlist
          </a>
        </Reveal>
      </Wrap>
    </section>
  )
}
