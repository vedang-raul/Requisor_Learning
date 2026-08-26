import { useEffect, useRef, useState } from 'react'

/* Fades/rises an element into place the first time it crosses into the viewport. */
export default function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Wait a couple of frames before flipping the class so the browser
          // has actually painted the hidden state at least once — otherwise,
          // for elements already in view on first load, React can add
          // `is-visible` before that first paint ever lands, and the
          // transition has nothing to interpolate from, so it just snaps.
          requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
          io.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`}
      style={{ '--reveal-delay': `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  )
}
