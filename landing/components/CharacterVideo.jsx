import { useEffect, useRef } from 'react'

const LEFT_SRC = '/left.mp4'
const RIGHT_SRC = '/right.mp4'
const OPACITY = 0.35

// Both clips open on a near-identical starting pose — the pose that
// actually distinguishes "looking left" from "looking right" only
// appears a couple seconds in. Freeze on that frame instead of frame 0,
// or the two are indistinguishable and switching between them reads as
// nothing happening.
const FREEZE_TIME = 3

/* The character "looks" toward whichever half of Hero the cursor is
   currently in — a discrete snap at the midpoint (CSS transition just
   softens the cut), not a continuous blend as the cursor crosses the box.
   Both clips stay paused/frozen on their own — nothing moves on screen
   unless the mouse does. Opacity is written directly to the DOM (not React
   state) so this doesn't trigger a re-render on every mousemove. */
export default function CharacterVideo() {
  const containerRef = useRef(null)
  const leftRef = useRef(null)
  const rightRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    const left = leftRef.current
    const right = rightRef.current
    if (!container || !left || !right) return

    const seekToFreezeFrame = (video) => {
      const apply = () => {
        video.currentTime = Math.min(FREEZE_TIME, video.duration || FREEZE_TIME)
      }
      if (video.readyState >= 1) apply()
      else video.addEventListener('loadedmetadata', apply, { once: true })
    }
    seekToFreezeFrame(left)
    seekToFreezeFrame(right)

    let side = 'left'

    const applySide = () => {
      left.style.opacity = side === 'left' ? String(OPACITY) : '0'
      right.style.opacity = side === 'right' ? String(OPACITY) : '0'
    }

    applySide()

    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect()
      const within =
        e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
      if (!within) return

      const midpoint = rect.left + rect.width / 2
      const nextSide = e.clientX < midpoint ? 'left' : 'right'
      if (nextSide !== side) {
        side = nextSide
        applySide()
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  return (
    <div ref={containerRef} aria-hidden="true" className="absolute inset-0 z-0 overflow-hidden">
      <video
        ref={leftRef}
        src={LEFT_SRC}
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out"
      />
      <video
        ref={rightRef}
        src={RIGHT_SRC}
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out"
      />
    </div>
  )
}
