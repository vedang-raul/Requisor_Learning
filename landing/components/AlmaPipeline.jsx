import styles from './alma.module.css'
import Reveal from './Reveal.jsx'

const stages = [
  {
    k: 'Diagnose',
    h: 'Alma maps what you already know.',
    p: 'A placement conversation finds your true starting point. Prove a unit up front and you skip it — your time is respected from minute one.',
  },
  {
    k: 'Learn',
    h: 'Lessons taught in the language of your work.',
    p: 'Courses authored by practitioners, delivered by a tutor that swaps every example for your industry and answers your actual questions.',
  },
  {
    k: 'Prove',
    h: 'Mastery exams gate every unit.',
    p: "Fresh questions each attempt. There's nothing to cram — only things to genuinely know.",
  },
  {
    k: 'Keep',
    h: "Spaced review before you'd forget.",
    p: 'Mastered skills resurface at precisely the right moment. Your transcript reflects what you can still do — not what you once sat through.',
  },
]

export default function AlmaPipeline() {
  return (
    <section id="how" className={`${styles.section} ${styles.pipeline}`}>
      <div className={styles.wrap}>
        <Reveal as="h2">Four moves, repeated until it&apos;s yours.</Reveal>
        <div className={styles.rail}>
          {stages.map((s, i) => (
            <Reveal key={s.k} as="div" delay={i * 90} className={styles.stage}>
              <span className={styles.stageKicker}>{s.k}</span>
              <h3>{s.h}</h3>
              <p>{s.p}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
