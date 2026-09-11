import { useState } from 'react'
import styles from './alma.module.css'
import Reveal from './Reveal.jsx'

const INDUSTRIES = {
  finance: {
    label: 'Banking & credit unions',
    tag: 'Unit 5 — Banking',
    title: 'Ground an AI summary in member records',
    body: 'Take three anonymized member-service transcripts and design a prompt that produces an accurate case summary with citations back to each transcript — and refuses to speculate when the record is silent. Submit your prompt and the rationale for its guardrails.',
  },
  mfg: {
    label: 'Manufacturing',
    tag: 'Unit 5 — Manufacturing',
    title: 'Ground an AI summary in shift QA reports',
    body: 'Take a week of shift quality reports and design a prompt that produces a defect-trend summary with citations back to each report — and refuses to speculate where the data is silent. Submit your prompt and the rationale for its guardrails.',
  },
  health: {
    label: 'Healthcare',
    tag: 'Unit 5 — Healthcare',
    title: 'Ground an AI summary in discharge notes',
    body: 'Take three de-identified discharge summaries and design a prompt that produces a follow-up care checklist with citations back to each note — and refuses to infer anything not documented. Submit your prompt and the rationale for its guardrails.',
  },
}

export default function AlmaIndustry() {
  const [active, setActive] = useState('finance')
  const d = INDUSTRIES[active]

  return (
    <section className={`${styles.section} ${styles.industry}`}>
      <div className={styles.wrap}>
        <Reveal as="h2">The same course reads differently to a banker and a nurse.</Reveal>
        <Reveal as="p" className={styles.industryIntro}>
          Choose your industry — Alma rewrites every assignment around artifacts you actually touch at work. One
          assignment from the prompt engineering course, three ways:
        </Reveal>
        <Reveal as="div" className={styles.chips} role="group" aria-label="Choose an industry">
          {Object.entries(INDUSTRIES).map(([key, ind]) => (
            <button
              key={key}
              type="button"
              className={`${styles.chip} ${active === key ? styles.chipActive : ''}`}
              aria-pressed={active === key}
              onClick={() => setActive(key)}
            >
              {ind.label}
            </button>
          ))}
        </Reveal>
        <Reveal as="div" className={styles.assign}>
          <div className={styles.assignTag}>{d.tag}</div>
          <h3>{d.title}</h3>
          <p>{d.body}</p>
        </Reveal>
      </div>
    </section>
  )
}
