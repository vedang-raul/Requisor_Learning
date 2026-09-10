import styles from './alma.module.css'
import AlmaField from './AlmaFiled.jsx'
import TutorDemo from './TutorDemo.jsx'

export default function AlmaHero() {
  return (
    <>
      <header className={styles.hero}>
        <AlmaField />
        <div className={`${styles.heroIn} ${styles.wrap}`}>
          <div className={styles.assoc}>
            The AI-Native University — in association with <b>Milwaukee School of Engineering</b>
          </div>
          <h1 className={styles.heroTitle}>
            A university built around one student: <span className={styles.you}>you.</span>
          </h1>
          <p className={styles.heroLede}>
            No lecture halls. No cohort marching at one speed. A tutor that knows your industry, your
            background, and how you learn — and is incapable of leaving you behind.
          </p>
          <div className={styles.heroCtas}>
            <a className={`${styles.btn} ${styles.btnSolid}`} href="/login/">Start learning</a>
            <a className={`${styles.btn} ${styles.btnGhost}`} href="#how">See how it works</a>
          </div>
          <div className={styles.cred}>
            Taught by <b>Naveen Kankate</b> — founder, AI engineering instructor at MSOE &amp; UW-Milwaukee
          </div>
        </div>
        <div className={styles.scrollHint} aria-hidden="true" />
      </header>

      <section className={`${styles.product} ${styles.section}`}>
        <div className={styles.wrap}>
          <div className={styles.device} aria-label="Alma tutor">
            <TutorDemo />
          </div>
          <p className={styles.caption}>
            Ask anything. Alma answers in the language of your work — full courses unlock when you sign in.
          </p>
        </div>
      </section>
    </>
  )
}
