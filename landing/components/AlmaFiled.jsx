import { useEffect, useRef } from 'react'
import styles from './alma.module.css'

/* "A university arranging itself around one point" — a constellation of
   drifting nodes gently gravitating toward one bright point (the hero
   focal point behind the headline). Ported 1:1 from the source page's
   <script> into a useEffect-driven canvas loop. */
export default function AlmaField() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const cx = cv.getContext('2d')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let W, H, DPR, nodes = [], center
    let raf = null
    let cancelled = false

    function size() {
      DPR = Math.min(window.devicePixelRatio || 1, 2)
      W = cv.clientWidth
      H = cv.clientHeight
      cv.width = W * DPR
      cv.height = H * DPR
      cx.setTransform(DPR, 0, 0, DPR, 0, 0)
      center = { x: W / 2, y: H * 0.46 }
    }
    function seed() {
      nodes = []
      const n = Math.min(90, Math.floor((W * H) / 16000))
      for (let i = 0; i < n; i++) {
        nodes.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.16,
          vy: (Math.random() - 0.5) * 0.16,
          r: Math.random() * 1.3 + 0.5,
        })
      }
    }
    function frame() {
      if (cancelled) return
      cx.clearRect(0, 0, W, H)
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          const dx = a.x - b.x, dy = a.y - b.y, d = dx * dx + dy * dy
          if (d < 9000) {
            cx.strokeStyle = `rgba(244,246,245,${(1 - d / 9000) * 0.07})`
            cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke()
          }
        }
        const dx = a.x - center.x, dy = a.y - center.y, d = Math.hypot(dx, dy)
        const reach = Math.min(W, H) * 0.34
        if (d < reach) {
          cx.strokeStyle = `rgba(125,243,216,${(1 - d / reach) * 0.10})`
          cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(center.x, center.y); cx.stroke()
        }
      }
      for (const p of nodes) {
        cx.fillStyle = 'rgba(244,246,245,.5)'
        cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, Math.PI * 2); cx.fill()
        p.x += p.vx; p.y += p.vy
        p.vx += (center.x - p.x) * 3e-7 * Math.min(W, 600)
        p.vy += (center.y - p.y) * 3e-7 * Math.min(W, 600)
        if (p.x < -20) p.x = W + 20
        if (p.x > W + 20) p.x = -20
        if (p.y < -20) p.y = H + 20
        if (p.y > H + 20) p.y = -20
      }
      const g = cx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 90)
      g.addColorStop(0, 'rgba(125,243,216,.30)')
      g.addColorStop(1, 'rgba(125,243,216,0)')
      cx.fillStyle = g
      cx.beginPath(); cx.arc(center.x, center.y, 90, 0, Math.PI * 2); cx.fill()
      cx.fillStyle = '#7DF3D8'
      cx.beginPath(); cx.arc(center.x, center.y, 2.6, 0, Math.PI * 2); cx.fill()
      if (!reduced) raf = requestAnimationFrame(frame)
    }

    size()
    seed()
    frame()

    function onResize() {
      size(); seed()
      if (reduced) frame()
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return <canvas ref={canvasRef} className={styles.field} aria-hidden="true" />
}
