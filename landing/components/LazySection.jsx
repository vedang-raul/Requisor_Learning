import { Suspense, useEffect, useRef, useState } from 'react'

/* Defers both mounting (so the section's JS chunk isn't even requested yet)
   and rendering until the section is about to scroll into view. rootMargin
   gives it a head start so the swap from skeleton to real content finishes
   before the user actually scrolls there. */
export default function LazySection({ id, minHeight = 400, children }) {
  const ref = useRef(null)
  const [shouldLoad, setShouldLoad] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true)
          io.disconnect()
        }
      },
      { rootMargin: '400px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} id={id} className={id ? 'landing-anchor' : undefined}>
      {shouldLoad ? (
        <Suspense fallback={<Skeleton minHeight={minHeight} />}>{children}</Suspense>
      ) : (
        <Skeleton minHeight={minHeight} />
      )}
    </div>
  )
}

function Skeleton({ minHeight }) {
  return <div aria-hidden="true" className="section-skeleton" style={{ minHeight, background: '#060708' }} />
}
