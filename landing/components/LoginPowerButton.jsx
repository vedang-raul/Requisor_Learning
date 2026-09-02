import { btnPrimary } from './ui.jsx'

export default function LoginPowerButton() {
  return (
    <a
      className={`${btnPrimary} shrink-0 max-[480px]:px-4 max-[480px]:py-2.5 max-[480px]:text-sm`}
      href="/login/"
    >
      Log in
    </a>
  )
}