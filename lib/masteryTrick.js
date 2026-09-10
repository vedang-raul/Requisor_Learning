/* Tick marks around the "mastery ring" SVG — ported from the source page's
   imperative ticks() DOM-builder into a pure function returning plain
   objects, so the ring can be rendered declaratively as <line> elements. */
export function masteryTicks(cx, cy, r1, r2, n, filled) {
  const ticks = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    ticks.push({
      x1: cx + Math.cos(a) * r1,
      y1: cy + Math.sin(a) * r1,
      x2: cx + Math.cos(a) * r2,
      y2: cy + Math.sin(a) * r2,
      filled: i < filled,
    })
  }
  return ticks
}
