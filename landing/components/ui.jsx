/* Shared primitives — the old .wrap / .eyebrow / .btn / h2 / .lede rules. */

export function Wrap({ className = '', children, ...rest }) {
  return (
    <div className={`mx-auto w-full max-w-[1180px] px-5 sm:px-7 ${className}`} {...rest}>
      {children}
    </div>
  )
}

/* text color is inherited by the leading rule, so pass e.g. "text-apricot" to recolor both */
export function Eyebrow({ className = '', children, ...rest }) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 font-mono text-[12px] uppercase tracking-[.14em] text-ultra ${className}`}
      {...rest}
    >
      <span aria-hidden="true" className="h-0.5 w-[22px] bg-current" />
      {children}
    </span>
  )
}

export function H2({ className = '', children, ...rest }) {
  return (
    <h2
      className={`font-display text-[clamp(32px,4.4vw,52px)] font-extrabold leading-[1.06] tracking-[-.02em] ${className}`}
      {...rest}
    >
      {children}
    </h2>
  )
}

export function Lede({ className = '', children, ...rest }) {
  return (
    <p className={`max-w-[56ch] text-ink-soft ${className}`} {...rest}>
      {children}
    </p>
  )
}

export function SectionHead({ className = '', children }) {
  return <div className={`mb-10 grid gap-4 sm:mb-[52px] ${className}`}>{children}</div>
}

const btnBase =
  'inline-flex items-center gap-2 rounded-full border-[1.5px] border-transparent px-6 py-[13px] text-[15.5px] font-semibold no-underline transition duration-150 ease-out'

export const btnPrimary = `${btnBase} bg-ultra text-white hover:-translate-y-0.5 hover:bg-ultra-deep active:translate-y-0`

export const btnGhost = `${btnBase} border-line bg-card text-ink hover:-translate-y-0.5 hover:border-ink active:translate-y-0`

/* transform + box-shadow only — both paint on their own compositor layer,
   so this stays smooth even with several cards animating on screen at once. */
export const hoverLift =
  'transition-[transform,box-shadow,border-color,opacity] duration-300 ease-out will-change-transform hover:-translate-y-1.5 hover:border-ultra hover:shadow-[0_20px_40px_-20px_rgba(16,20,48,.22)]'
