import { Wrap, Eyebrow, H2, Lede, SectionHead } from './ui.jsx'
import Reveal from './Reveal.jsx'

const STATUS = {
  live: 'text-mint border-mint/40 bg-mint/7',
  soon: 'text-ultra border-ultra/35 bg-ultra/6',
  road: 'text-ink-soft border-line bg-paper',
}

const ROWS = [
  {
    title: 'Adept Mastery Certificate',
    body: 'A shareable credential listing every verified skill — with the mastery data behind it. Completion means competence, by construction.',
    status: 'live',
    statusLabel: 'Pilot · now',
  },
  {
    title: 'University co-credentials',
    body: 'Certificates issued with accredited partner universities — their academic standing, our adaptive engine, one document.',
    status: 'soon',
    statusLabel: 'Partnerships forming',
  },
  {
    title: 'College credit pathway',
    body: 'Flagship courses submitted for ACE credit recommendation, making your learning portable toward degrees at thousands of institutions.',
    status: 'road',
    statusLabel: 'Roadmap',
  },
  {
    title: 'Continuing education units',
    body: "CEU-bearing tracks for regulated industries where your team's hours have to count — finance, healthcare, and beyond.",
    status: 'road',
    statusLabel: 'Roadmap',
  },
]

export default function Credentials() {
  return (
    <section id="credentials" className="py-16 sm:py-24">
      <Wrap>
        <Reveal>
          <SectionHead>
            <Eyebrow>Credentialing</Eyebrow>
            <H2>Proof of skill, not proof of attendance.</H2>
            <Lede>
              Every credential is backed by mastery evidence: what you can do, verified attempt by
              attempt — and built to travel.
            </Lede>
          </SectionHead>
        </Reveal>

        <div className="grid overflow-hidden rounded-card border border-line bg-card">
          {ROWS.map((row, idx) => (
            <Reveal as="div" key={row.title} delay={idx * 70} className="border-b border-line last:border-b-0">
              <div className="grid grid-cols-[220px_1fr_190px] items-center gap-4 px-5 py-5 transition-colors duration-200 hover:bg-paper max-[820px]:grid-cols-1 sm:gap-6 sm:px-[30px] sm:py-[26px]">
                <h3 className="font-display text-[18px] leading-[1.06] tracking-[-.02em]">
                  {row.title}
                </h3>
                <p className="text-[14.8px] text-ink-soft">{row.body}</p>
                <span
                  className={`justify-self-end rounded-full border px-[13px] py-1.5 font-mono text-[11.5px] uppercase tracking-[.08em] transition-transform duration-200 max-[820px]:justify-self-start ${
                    STATUS[row.status]
                  }`}
                >
                  {row.statusLabel}
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </Wrap>
    </section>
  )
}
