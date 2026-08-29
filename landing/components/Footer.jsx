import { Wrap } from './ui.jsx'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer id="site-footer" className="border-t border-line py-[34px] text-[13.5px] text-ink-soft">
      <Wrap className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span>
          
          <strong className="font-semibold text-ink">Requisor Learning</strong> — The AI-Native University · Milwaukee, WI
        </span>

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

        <span className="font-mono">
          © {year} · Built by{' '} <a href="https://requisor.io"
            className="text-ink underline decoration-current decoration-1 underline-offset-4 transition-colors duration-200 hover:text-[#23AE97] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#23AE97]"
          >
            Requisor.io
          </a>
          . Personalized by design.
        </span>
      </Wrap>
    </footer>
  )
}