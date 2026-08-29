import { Wrap } from './ui.jsx'

// TODO: swap these for your real profile URLs before shipping.
const SOCIAL_LINKS = [
  { name: 'LinkedIn', href: '#', Icon: LinkedInIcon },
  { name: 'X (Twitter)', href: '#', Icon: XIcon },
  { name: 'Instagram', href: '#', Icon: InstagramIcon },
]

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer id="site-footer" className="border-t border-line text-ink-soft">
      <Wrap className="flex flex-col gap-7 py-10">
        {/* brand + social */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/requisor.png"
              alt=""
              width="56"
              height="56"
              className="size-14 shrink-0 object-contain"
            />
            <div className="text-[13.5px] leading-snug">
              <strong className="block text-[15px] font-semibold text-ink">Requisor Learning</strong>
              <span>The AI-Native University · Milwaukee, WI</span>
            </div>
          </div>

          <div className="flex items-center gap-3" aria-label="Follow Requisor Learning">
            {SOCIAL_LINKS.map(({ name, href, Icon }) => (
              <a key={name} href={href} aria-label={name}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex size-9 items-center justify-center rounded-full border border-line text-ink-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-[#23AE97] hover:text-[#23AE97] hover:shadow-[0_8px_18px_-8px_rgba(35,174,151,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#23AE97]"
              >
                <Icon className="size-4 transition-transform duration-200 ease-out group-hover:scale-110" />
              </a>
            ))}
          </div>
        </div>

        <div className="h-px w-full bg-line" aria-hidden="true" />

        {/* affiliation + copyright */}
        <div className="flex flex-col gap-4 text-[13px] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5" aria-label="In association with Milwaukee School of Engineering">
            <img
              src="/msoe-logo.png"
              alt="Milwaukee School of Engineering"
              className="size-8 shrink-0 object-contain transition-transform duration-300 ease-out hover:-rotate-6 hover:scale-110"
              width="32"
              height="32"
              loading="lazy"
            />
            <span className="text-[11px] leading-tight text-ink-soft">
              In association with
              <strong className="block font-semibold text-ink">Milwaukee School of Engineering</strong>
            </span>
          </div>

          <span className="font-mono text-[12.5px]">
            © {year} · Built by{' '}

    <a          href="https://requisor.io"
              className="text-ink underline decoration-current decoration-1 underline-offset-4 transition-colors duration-200 hover:text-[#23AE97] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#23AE97]"
            >
              Requisor.io
            </a>
            . Personalized by design.
          </span>
        </div>
      </Wrap>
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