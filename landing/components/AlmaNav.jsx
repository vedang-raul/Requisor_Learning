import styles from './alma.module.css'
import LoginPowerButton from './LoginPowerButton.jsx'

const links = [
  { href: '#how', label: 'How it works' },
  { href: '#industry', label: 'Your industry' },
  { href: '#universities', label: 'Universities' },
  { href: '#tutors', label: 'Tutors' },
  { href: '#credential', label: 'Credential' },
]

/* Same LoginPowerButton used by the previous design — unchanged, so login
   behavior (hard nav to /login/) is identical. */
export default function AlmaNav() {
  return (
    <nav className={styles.nav}>
      <div className={`${styles.wrap} ${styles.navIn}`}>
        <a className={styles.wordmark} href="#">
          alma <small>by Requisor</small>
        </a>
        <div className={styles.navLinks}>
          {links.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
        </div>
        <LoginPowerButton />
      </div>
    </nav>
  )
}
