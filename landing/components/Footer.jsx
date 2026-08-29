import { Wrap } from './ui.jsx'

export default function Footer() {
  return (
    <footer id="site-footer" className="border-t border-line py-[34px] text-[13.5px] text-ink-soft">
      <Wrap className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span>
          <b>Requisor Learning</b> — The AI-Native University · Milwaukee, WI
        </span>
        <div className="flex items-center gap-2.5" aria-label="In association with Milwaukee School of Engineering">
          <img
            src="/msoe-logo.png"
            alt="Milwaukee School of Engineering"
            className="size-8 shrink-0 object-contain"
            width="32"
            height="32"
          />
          <span className="text-[11px] leading-tight text-ink-soft">
            In association with
            <strong className="block font-semibold text-ink">Milwaukee School of Engineering</strong>
          </span>
        </div>
        <span className="font-mono">Built by <a href="https://requisor.io" className="font-mono ">Requisor.io</a>. Personalized by design.</span>
      </Wrap>
    </footer>
  )
}
