import { Wrap, btnPrimary } from './ui.jsx'

const links = [
  { href: '#tailored', label: 'Why Adept' },
  { href: '#how', label: 'How it works' },
  { href: '#partners', label: 'Universities' },
  { href: '#credentials', label: 'Credentials' },
]

export default function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur-[12px]">
      <Wrap className="flex h-[68px] items-center justify-between">
        <a
          className="flex items-center gap-[9px] font-display text-[22px] font-extrabold tracking-[-.02em] no-underline"
          href="#"
        >
          <span className="size-3 rounded-full bg-ultra shadow-[0_0_0_4px_rgba(35,174,151,.15)]" />
          Adept
        </a>

        <div className="flex gap-[26px] text-[15px] font-medium text-ink-soft max-[820px]:hidden">
          {links.map((l) => (
            <a
              key={l.href}
              className="relative no-underline after:absolute after:inset-x-0 after:-bottom-[3px] after:h-[2px] after:origin-left after:scale-x-0 after:bg-ultra after:transition-transform after:duration-300 after:content-[''] hover:text-ink hover:after:scale-x-100"
              href={l.href}
            >
              {l.label}
            </a>
          ))}
        </div>

        <a className={btnPrimary} href="/login/">
          Log in
        </a>
      </Wrap>
    </nav>
  )
}
