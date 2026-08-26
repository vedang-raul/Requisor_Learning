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
      <Wrap className="flex h-16 items-center justify-between sm:h-[68px]">
        <div className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
          <a
            className="flex min-w-0 items-center gap-1.5 text-[18px] font-bold text-teal-500 sm:gap-0 sm:text-[22px]"
            href="#"
          >
            <img className="size-10 shrink-0 sm:size-[52px]" src="/requisor.png" alt="" width="52" height="52" />
            <span className="truncate">Requisor Learning</span>
          </a>

          <div
            className="hidden items-center gap-2 border-l border-line pl-2 min-[380px]:flex sm:gap-2.5 sm:pl-3"
            aria-label="In association with Milwaukee School of Engineering"
          >
            <img
              src="/msoe-logo.png"
              alt="Milwaukee School of Engineering"
              className="size-7 shrink-0 object-contain sm:size-8"
              width="32"
              height="32"
            />
            <span className="hidden text-[10px] leading-tight text-ink-soft min-[640px]:block">
              In association with
              <strong className="block font-semibold text-ink">Milwaukee School of Engineering</strong>
            </span>
          </div>
        </div>

        <div className="flex gap-[26px] text-[15px] font-medium text-ink-soft max-[1080px]:hidden">
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

        <a className={`${btnPrimary} shrink-0 max-[480px]:px-4 max-[480px]:py-2.5 max-[480px]:text-sm`} href="/login/">
          Log in
        </a>
      </Wrap>
    </nav>
  )
}
