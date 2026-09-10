import styles from './alma.module.css'

const cells = [
  { b: 'Mastery-gated', text: 'Advance by proving it, not by watching it.' },
  { b: 'Fresh exams', text: 'New questions, every attempt. Nothing to cram.' },
  { b: 'Your industry', text: 'Assignments built from your real work.' },
  { b: 'Always on', text: 'Voice & chat tutoring at 2 PM or 2 AM.' },
]

export default function AlmaStrip() {
  return (
    <div className={styles.strip}>
      <div className={styles.wrap}>
        {cells.map((c) => (
          <div key={c.b} className={styles.cell}>
            <b>{c.b}</b>{c.text}
          </div>
        ))}
      </div>
    </div>
  )
}
