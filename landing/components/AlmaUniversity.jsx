import styles from './alma.module.css'
import Reveal from './Reveal.jsx'

const rows = [
  { b: 'Outcomes', text: 'Mastery data your assessment office and accreditors keep asking for — per student, per skill, per attempt.' },
  { b: 'Faculty leverage', text: 'Professors stay the authors. Alma handles the 2 AM questions, the regrading, the fifth explanation.' },
  { b: 'New reach', text: "Continuing-ed programs that serve working adults your campus model can't." },
]

export default function AlmaUniversities() {
  return (
    <section id="universities" className={styles.section}>
      <div className={styles.wrap}>
        <Reveal as="div" className={styles.uniPanel}>
          <h2>Give every one of your students a personal tutor.</h2>
          <p className={styles.uniSub}>
            Alma doesn&apos;t replace your institution — it&apos;s your faculty&apos;s course, amplified. Your
            curriculum, your credit, delivered through an intelligence that meets each student where they are
            and hands you the evidence.
          </p>
          <div className={styles.uniRows}>
            {rows.map((r) => (
              <div key={r.b} className={styles.uniRow}>
                <b>{r.b}</b>
                <span>{r.text}</span>
              </div>
            ))}
          </div>
          <a className={`${styles.btn} ${styles.btnSolid}`} href="mailto:naveen@requisor.io?subject=Alma university pilot">
            Book a pilot call
          </a>
          <div className={styles.uniNote}>
            Built in association with the <b>Milwaukee School of Engineering</b>, where Alma&apos;s founder
            teaches AI engineering.
          </div>
        </Reveal>
      </div>
    </section>
  )
}
