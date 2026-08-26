import { Wrap } from './ui.jsx'
import Reveal from './Reveal.jsx'

const items = [
  { label: '24/7 voice & chat tutor', dot: 'bg-apricot' },
  { label: 'Adaptive tests, unique to you', dot: 'bg-ultra' },
  { label: 'Mastery-gated progress', dot: 'bg-mint' },
  { label: 'Assignments in your industry', dot: 'bg-ink' },
]

export default function Strip() {
  return (
    <div className="border-y border-line bg-card">
      <Wrap className="grid grid-cols-1 gap-3 py-4 min-[480px]:grid-cols-2 min-[480px]:gap-x-5 min-[480px]:gap-y-3 min-[900px]:flex min-[900px]:justify-between min-[900px]:gap-5 min-[900px]:py-[18px]">
        {items.map((item, idx) => (
          <Reveal as="span" key={item.label} delay={idx * 80}>
            <span className="group flex items-center gap-[9px] font-mono text-[12.5px] uppercase tracking-[.06em] text-ink-soft transition-colors duration-200 hover:text-ink">
              <span
                className={`size-2 rounded-[2px] transition-transform duration-200 group-hover:scale-125 ${item.dot}`}
              />
              {item.label}
            </span>
          </Reveal>
        ))}
      </Wrap>
    </div>
  )
}
