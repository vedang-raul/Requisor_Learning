import styles from './alma.module.css'

const SOCIAL_LINKS = [
  { name: 'LinkedIn', href: 'https://www.linkedin.com/company/requisor', Icon: LinkedInIcon },
  { name: 'X (Twitter)', href: 'https://x.com/Requisor_AI', Icon: XIcon },
  { name: 'Instagram', href: 'https://www.instagram.com/requisor.io/', Icon: InstagramIcon },
]

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer id="site-footer" className={styles.footer}>
      <div className={styles.wrap}>
        <div>
          <span>© {year} Citrus Innovations Inc. — Alma, by{' '}
            <a href="https://requisor.io" target="_blank" rel="noopener noreferrer">Requisor</a>. Milwaukee, WI.
          </span>
          <div className="mt-2 flex items-center gap-2.5" aria-label="In association with Milwaukee School of Engineering">
            <img
              src="/msoe-logo.png"
              alt="Milwaukee School of Engineering"
              className="size-6 shrink-0 object-contain opacity-80 transition-transform duration-300 ease-out hover:-rotate-6 hover:scale-110"
              width="24"
              height="24"
              loading="lazy"
            />
            <span className="text-[11px] leading-tight text-alma-faint">
              In association with <strong className="font-semibold text-alma-muted">Milwaukee School of Engineering</strong>
            </span>
          </div>
        </div>

        <div className={styles.footerLinks}>
          {SOCIAL_LINKS.map(({ name, href, Icon }) => (
            <a
              key={name}
              href={href}
              aria-label={name}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex size-8 items-center justify-center rounded-full border border-alma-line text-alma-faint transition-all duration-200 hover:-translate-y-0.5 hover:border-pulse hover:text-pulse"
            >
              <Icon className="size-3.5 transition-transform duration-200 ease-out group-hover:scale-110" />
            </a>
          ))}
          <a href="mailto:naveen@requisor.io">Contact</a>
        </div>
      </div>
    </footer>
  )
}

/* ---------- inline icons (no external icon package required) ---------- */

function LinkedInIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M6.94 8.5H3.56V20h3.38V8.5ZM5.25 4a1.96 1.96 0 1 0 0 3.92 1.96 1.96 0 0 0 0-3.92ZM20.44 20h-3.37v-5.6c0-1.34-.03-3.06-1.87-3.06-1.87 0-2.16 1.46-2.16 2.96V20H9.68V8.5h3.24v1.57h.05c.45-.85 1.55-1.75 3.2-1.75 3.42 0 4.05 2.25 4.05 5.17V20Z" />
    </svg>
  )
}

function XIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M13.6 10.6 20.2 3h-1.9l-5.6 6.6L8.2 3H3l6.9 9.9L3 21h1.9l5.9-7 5.7 7H21l-7.4-10.4Zm-2.1 2.4-.7-1L5.4 4.3h2.1l4.4 6.2.7 1 5.7 8.1h-2.1l-4.7-6.6Z" />
    </svg>
  )
}

function InstagramIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="3.7" />
      <circle cx="17.05" cy="6.95" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}
