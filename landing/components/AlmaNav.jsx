'use client'

import { useEffect, useState } from 'react'
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
  const [activeSection, setActiveSection] = useState('')

  useEffect(() => {
    const sections = links
      .map(({ href }) => document.querySelector(href))
      .filter(Boolean)

    const updateActiveSection = () => {
      const marker = window.innerHeight * 0.32
      let current = ''

      for (const section of sections) {
        if (section.getBoundingClientRect().top <= marker) current = section.id
      }

      setActiveSection(current)
    }

    updateActiveSection()
    window.addEventListener('scroll', updateActiveSection, { passive: true })
    window.addEventListener('resize', updateActiveSection)

    return () => {
      window.removeEventListener('scroll', updateActiveSection)
      window.removeEventListener('resize', updateActiveSection)
    }
  }, [])

  return (
    <nav className={styles.nav} aria-label="Landing page">
      <div className={`${styles.wrap} ${styles.navIn}`}>
        <a className={styles.wordmark} href="#" aria-label="Alma home" onClick={() => setActiveSection('')}>
          alma <small>by Requisor</small>
        </a>
        <div className={styles.navLinks}>
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={activeSection === l.href.slice(1) ? styles.navLinkActive : undefined}
              aria-current={activeSection === l.href.slice(1) ? 'location' : undefined}
              onClick={() => setActiveSection(l.href.slice(1))}
            >
              {l.label}
            </a>
          ))}
        </div>
        <LoginPowerButton />
      </div>
    </nav>
  )
}
