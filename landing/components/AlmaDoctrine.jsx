import styles from './alma.module.css'
import Reveal from './Reveal.jsx'

export default function AlmaDoctrine() {
  return (
    <section className={styles.section}>
      <div className={`${styles.wrap} ${styles.tight}`}>
        <Reveal className={styles.doctrine}>
          <h2>The lecture was built for the room. You were never in it.</h2>
          <p>
            One professor. Two hundred students. One speed. The format made sense when knowledge was scarce and
            rooms were the only way to share it. But a lecture can&apos;t know that you&apos;re a banker, that you
            learned statistics ten years ago, or that you almost understood yesterday&apos;s concept and need
            exactly one more example.
          </p>
          <p>
            <b>Alma can.</b> Every course is delivered by an intelligence that maps what you already know,
            teaches in the language of your work, and refuses to move on until mastery is real — then keeps it
            real.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
