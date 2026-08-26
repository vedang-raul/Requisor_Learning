import { Wrap } from './ui.jsx'
import Reveal from './Reveal.jsx'

export default function Footer() {
  return (
    <footer className="border-t border-line py-[34px] text-[13.5px] text-ink-soft">
      <Reveal>
        <Wrap className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between sm:gap-4">
          <span>
            <b>Adept</b> — The AI-Native University · Milwaukee, WI
          </span>
          <span className="font-mono">Built by practitioners. Personalized by design.</span>
        </Wrap>
      </Reveal>
    </footer>
  )
}
