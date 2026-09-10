import styles from './alma.module.css'
import Reveal from './Reveal.jsx'

export default function AlmaFinale() {
  return (
    <section className={styles.finale}>
      <div className={styles.wrap}>
        <Reveal>
          <h2>
            Mastery, <span className={styles.finaleMint}>proven.</span>
          </h2>
          <p>For every single student.</p>
          <a className={`${styles.btn} ${styles.btnSolid}`} href="/login/">Start learning</a>
        </Reveal>
      </div>
    </section>
  )
}
