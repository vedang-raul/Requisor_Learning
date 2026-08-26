import { Wrap, Eyebrow, Lede, btnPrimary, btnGhost } from './ui.jsx'
import TutorDemo from './TutorDemo.jsx'

export default function Hero() {
  return (
    <header className="relative overflow-hidden pb-16 pt-16 sm:pb-15 sm:pt-21">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'linear-gradient(90deg, color-mix(in srgb, var(--color-paper) 90%, transparent) 0%, color-mix(in srgb, var(--color-paper) 45%, transparent) 45%, transparent 75%), radial-gradient(680px 340px at 85% 8%, rgba(35,174,151,.09), transparent 60%), radial-gradient(500px 300px at 8% 90%, rgba(255,158,94,.12), transparent 60%)',
        }}
      />

      <Wrap className="relative z-10 grid grid-cols-[1.05fr_.95fr] items-center gap-10 max-[960px]:grid-cols-1 sm:gap-14">
        <div>
          <Eyebrow className="animate-rise" style={{ animationDelay: '80ms' }}>
            The AI-Native University
          </Eyebrow>

          <h1
            className="animate-rise mt-[18px] font-display text-[clamp(38px,10.5vw,72px)] font-extrabold leading-[1.06] tracking-[-.02em] sm:text-[clamp(42px,5.6vw,72px)]"
            style={{ animationDelay: '220ms' }}
          >
            A university rebuilt around{' '}
            <span className="relative whitespace-normal after:absolute after:inset-x-0 after:bottom-[.06em] after:-z-10 after:h-[.16em] after:rounded-[3px] after:bg-apricot after:content-[''] min-[481px]:whitespace-nowrap">
              one student.
            </span>
            <br />
            You.
          </h1>

          <Lede
            className="animate-rise mb-7 mt-[22px] text-[17px] sm:mb-8 sm:text-[19px]"
            style={{ animationDelay: '400ms' }}
          >
            No lecture halls. No cohort marching at one speed. A tutor that knows your industry, your
            background, and how you learn — available at 2 PM or 2 AM, and incapable of leaving you
            behind.
          </Lede>

          <div
            className="animate-rise flex flex-wrap gap-3.5"
            style={{ animationDelay: '560ms' }}
          >
            <a className={`${btnPrimary} max-[480px]:w-full max-[480px]:justify-center`} href="/login/">
              Log in
            </a>
            <a className={`${btnGhost} max-[480px]:w-full max-[480px]:justify-center`} href="#join">
              Join the learner waitlist
            </a>
          </div>

          <p
            className="animate-rise mt-6 text-[13.5px] text-ink-soft sm:mt-[30px]"
            style={{ animationDelay: '680ms' }}
          >
            Taught by a practicing founder &amp; university AI instructor · First course:{' '}
            <b className="text-ink">Applied AI Engineering</b>
          </p>
        </div>

        <div className="animate-rise" style={{ animationDelay: '480ms' }}>
          <TutorDemo />
        </div>
      </Wrap>
    </header>
  )
}
