import styles from './alma.module.css'
import Reveal from './Reveal.jsx'
import { masteryTicks } from '../../lib/masteryTrick.js'

const ticks = masteryTicks(120, 120, 88, 100, 24, 9)

export default function AlmaCredential() {
  return (
    <section id="credential" className={`${styles.section} ${styles.credential}`}>
      <div className={styles.wrap}>
        <Reveal>
          <svg className={styles.ringBig} viewBox="0 0 240 240" aria-label="Alma mastery ring">
            <defs>
              <linearGradient id="alma-ring-gradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#7DF3D8" />
                <stop offset="1" stopColor="#17A78C" />
              </linearGradient>
            </defs>
            <circle cx="120" cy="120" r="78" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="1" />
            {ticks.map((t, i) => (
              <line
                key={i}
                x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                stroke={t.filled ? 'url(#alma-ring-gradient)' : 'rgba(255,255,255,.12)'}
                strokeWidth={3}
                strokeLinecap="round"
              />
            ))}
            <text x="120" y="114" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="500" fontSize="26" fill="#F4F6F5" letterSpacing="-1">alma</text>
            <text x="120" y="138" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="rgba(244,246,245,.45)" letterSpacing="2">MASTERY TRANSCRIPT</text>
          </svg>
          <h2>A transcript of what you can do — not hours you sat.</h2>
          <p>
            Every mastered unit is backed by evidence: the exams you passed, the work you produced, the skills
            you&apos;ve kept sharp. Share an Alma transcript and an employer sees proof, not attendance.
          </p>
          <p>Courses today confer certificates of mastery. University-credit pathways are in progress with our institutional partners.</p>
        </Reveal>
      </div>
    </section>
  )
}
