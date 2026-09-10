/* Chat bubble — used by the hero tutor demo. */
export default function Message({ role, tag, animate = true, full = false, children }) {
  const isAi = role === 'ai'

  return (
    <div
      className={[
        'rounded-2xl px-[15px] py-3 text-[14.8px] leading-[1.55]',
        full ? 'max-w-full' : 'max-w-[86%]',
        animate ? 'translate-y-2 animate-pop opacity-0' : 'opacity-100',
        isAi
          ? 'self-start rounded-bl-[5px] border border-alma-line bg-white/[0.055] text-alma-text'
          : 'self-end rounded-br-[5px] bg-gradient-to-br from-pulse to-pulse-deep text-[#062017]',
      ].join(' ')}
    >
      {tag && (
        <span className="mb-1.5 inline-block rounded-full bg-pulse/10 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[.08em] text-pulse">
          {tag}
        </span>
      )}
      {children}
    </div>
  )
}

export function TypingBubble() {
  return (
    <div className="inline-flex max-w-[86%] gap-1 self-start rounded-2xl rounded-bl-[5px] border border-alma-line bg-white/[0.055] px-4 py-3.5">
      <i className="size-1.5 animate-blink rounded-full bg-alma-muted" />
      <i className="size-1.5 animate-blink rounded-full bg-alma-muted [animation-delay:.2s]" />
      <i className="size-1.5 animate-blink rounded-full bg-alma-muted [animation-delay:.4s]" />
    </div>
  )
}
