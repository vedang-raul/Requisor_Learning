/* Chat bubble — used by the hero tutor demo and the static guardrail demo. */
export default function Message({ role, tag, animate = true, full = false, children }) {
  const isAi = role === 'ai'

  return (
    <div
      className={[
        'rounded-2xl px-[15px] py-3 text-[14.8px] leading-[1.55]',
        full ? 'max-w-full' : 'max-w-[86%]',
        animate ? 'translate-y-2 animate-pop opacity-0' : 'opacity-100',
        isAi
          ? 'self-start rounded-bl-[5px] border border-line bg-[#F1F2FA]'
          : 'self-end rounded-br-[5px] bg-ultra text-white',
      ].join(' ')}
    >
      {tag && (
        <span className="mb-1.5 inline-block rounded-full bg-ultra/8 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[.08em] text-ultra">
          {tag}
        </span>
      )}
      {children}
    </div>
  )
}

export function TypingBubble() {
  return (
    <div className="inline-flex max-w-[86%] gap-1 self-start rounded-2xl rounded-bl-[5px] border border-line bg-[#F1F2FA] px-4 py-3.5">
      <i className="size-1.5 animate-blink rounded-full bg-[#9AA0C0]" />
      <i className="size-1.5 animate-blink rounded-full bg-[#9AA0C0] [animation-delay:.2s]" />
      <i className="size-1.5 animate-blink rounded-full bg-[#9AA0C0] [animation-delay:.4s]" />
    </div>
  )
}
