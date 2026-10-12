'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import s from './alma-landing.module.css'

/* Alma by Requisor — the public landing page.
   Structure follows the "Alma landing page" design; colours are Requisor's
   (see alma-landing.module.css). Sign-in goes to /login/, and the Nova demo
   talks to the same anonymous endpoint the previous landing page used. */

const LOGIN = '/login/'
const TUTOR_API = '/api/landing-chat'

/* The decorative "seal" lines run through the brand palette. */
const HOLO = ['#0E7490', '#1C9583', '#23AE97', '#17B890', '#7DF3D8', '#FF9E5E']
const HOLO_STOPS = [0, 0.22, 0.42, 0.6, 0.78, 1]

function HoloGradient({ id, x1 = 0, y1 = 0, x2 = 1, y2 = 1 }) {
  return (
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
      {HOLO.map((color, i) => <stop key={i} offset={HOLO_STOPS[i]} stopColor={color} />)}
    </linearGradient>
  )
}

/* ── generated artwork ─────────────────────────────────────────────────── */
const TAU = Math.PI * 2

/** A closed wavy ring around (500, 500); fn gives the radius at each angle. */
function ring(fn, steps) {
  let d = ''
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * TAU
    const r = fn(t)
    d += (i ? 'L' : 'M') + (500 + r * Math.cos(t)).toFixed(1) + ' ' + (500 + r * Math.sin(t)).toFixed(1)
  }
  return d + 'Z'
}

/** The large guilloché seal behind the hero and the closing section. */
function buildSeal() {
  const outer = [], bead = [], rose = [], lace = []
  for (let i = 0; i < 14; i++) { const ph = (i / 14) * TAU; outer.push(ring((t) => 468 + 16 * Math.sin(36 * t + ph), 540)) }
  for (let i = 0; i < 5; i++) { const ph = (i / 5) * TAU; bead.push(ring((t) => 436 + 5 * Math.sin(72 * t + ph), 900)) }
  for (let i = 0; i < 9; i++) { const ph = (i / 9) * (TAU / 14); rose.push(ring((t) => 378 + 38 * Math.sin(14 * (t + ph)) + 8 * Math.sin(42 * (t + ph)), 640)) }
  for (let i = 0; i < 6; i++) { const ph = (i / 6) * TAU; lace.push(ring((t) => 320 + 6 * Math.sin(90 * t + ph), 1100)) }
  return { outer, bead, rose, lace }
}

/** A small rosette used on the assignment card and the transcript. */
function buildMini(k, shift) {
  const out = []
  for (let i = 0; i < 7; i++) { const ph = (i / 7) * (TAU / k) + shift; out.push(ring((t) => 300 + 70 * Math.sin(k * (t + ph)) + 16 * Math.sin(3 * k * (t + ph)), 520)) }
  for (let i = 0; i < 6; i++) { const ph = (i / 6) * TAU; out.push(ring((t) => 440 + 14 * Math.sin(40 * t + ph), 520)) }
  return out
}

/** A lecture hall seen from the stage: rows of seats in perspective, one of them lit. */
function buildHall() {
  const f = 560, D = 4, cam = 2.5, cx = 600, top = 181, N = 12
  const span = (58 * Math.PI) / 180
  const aisles = [(-24 * Math.PI) / 180, (24 * Math.PI) / 180]
  const proj = (R, th, Y) => {
    const Z = R * Math.cos(th) + D
    return { x: cx + (f * R * Math.sin(th)) / Z, y: top - (f * (Y - cam)) / Z, z: Z }
  }
  const rows = []
  let lit = null
  for (let i = 0; i < N; i++) {
    const R = 4.2 + i * 0.98, Y = 0.95 + i * 0.42, seatW = 0.52, gap = 0.1
    const n = Math.floor((R * 2 * span) / (seatW + gap))
    const start = -span + (R * 2 * span - n * (seatW + gap)) / 2 / R
    const seats = []
    for (let k = 0; k < n; k++) {
      const s0 = start + (k * (seatW + gap) + gap / 2) / R
      const s1 = s0 + seatW / R
      const sm = (s0 + s1) / 2
      if (aisles.some((a) => Math.abs((sm - a) * R) < 0.55)) continue
      const a = proj(R, s0, Y), b = proj(R, s1, Y)
      const w = Math.max(0.9, Math.min(3.4, (f * 0.075) / ((a.z + b.z) / 2)))
      if (i === 4 && !lit && sm > -0.16) {
        const h = proj(R, sm, Y + 0.42)
        const hr = Math.max(2.6, (f * 0.12) / h.z)
        lit = {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y, w: w * 1.45, hx: h.x, hy: h.y, hr: hr * 1.08, glowR: hr * 9,
          bx1: h.x - 30, bx2: h.x + 92, maskH: h.y + 12,
          beam: `${(h.x + 74).toFixed(1)},-12 ${(h.x + 92).toFixed(1)},-12 ${(h.x + 30).toFixed(1)},${(h.y + 10).toFixed(1)} ${(h.x - 30).toFixed(1)},${(h.y + 10).toFixed(1)}`,
        }
        continue
      }
      seats.push({ x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: b.x.toFixed(1), y2: b.y.toFixed(1), w: w.toFixed(2) })
    }
    rows.push({ seats, inDelay: `${(0.15 + i * 0.075).toFixed(3)}s`, outDelay: `${(1.7 + (N - 1 - i) * 0.06).toFixed(3)}s` })
  }
  return { rows, lit }
}

/* ── content ───────────────────────────────────────────────────────────── */
const NAV = [
  ['#tutors', 'Tutors'], ['#how', 'How it works'], ['#industry', 'Your industry'],
  ['#credential', 'Credential'], ['#universities', 'Universities'], ['#team', 'Team'],
]

const HIGHLIGHTS = [
  { title: 'Mastery-gated', text: 'Advance by proving it, not by watching it.', icon: <><circle cx="12" cy="12" r="9" /><path d="M8 12.4l2.7 2.7L16.2 9.6" /></> },
  { title: 'Fresh exams', text: 'New questions, every attempt. Nothing to cram.', icon: <><path d="M19.5 10.5A7.5 7.5 0 0 0 6.2 7.2L4.5 9" /><path d="M4.5 4.8V9h4.2" /><path d="M4.5 13.5a7.5 7.5 0 0 0 13.3 3.3l1.7-1.8" /><path d="M19.5 19.2V15h-4.2" /></> },
  { title: 'Your industry', text: 'Assignments built from your real work.', icon: <><rect x="3.5" y="7.5" width="17" height="12" rx="2.5" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" /><path d="M3.5 12.5h17" /></> },
  { title: 'Always on', text: 'Voice & chat tutoring at 2 PM or 2 AM.', icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7.2V12l3.2 2" /></> },
]

const STEPS = [
  { label: 'Diagnose', title: 'Alma maps what you already know.', body: 'A placement conversation finds your true starting point. Prove a unit up front and you skip it — your time is respected from minute one.' },
  { label: 'Learn', title: 'Lessons taught in the language of your work.', body: 'Courses authored by practitioners, delivered by a tutor that swaps every example for your industry and answers your actual questions.' },
  { label: 'Prove', title: 'Mastery exams gate every unit.', body: "Fresh questions each attempt. There's nothing to cram — only things to genuinely know." },
  { label: 'Keep', title: "Spaced review before you'd forget.", body: 'Mastered skills resurface at precisely the right moment. Your transcript reflects what you can still do — not what you once sat through.' },
]
const RING_ARCS = [
  'M 213.07 50.57 A 150 150 0 0 1 349.43 186.93', 'M 349.43 213.07 A 150 150 0 0 1 213.07 349.43',
  'M 186.93 349.43 A 150 150 0 0 1 50.57 213.07', 'M 50.57 186.93 A 150 150 0 0 1 186.93 50.57',
]
const RING_STOPS = [[306.07, 93.93], [306.07, 306.07], [93.93, 306.07], [93.93, 93.93]]

const INDUSTRIES = {
  finance: { label: 'Banking & credit unions', industry: 'Banking', petals: 12, shift: 0.2, title: 'Ground an AI summary in member records', body: 'Take three anonymized member-service transcripts and design a prompt that produces an accurate case summary with citations back to each transcript — and refuses to speculate when the record is silent. Submit your prompt and the rationale for its guardrails.' },
  mfg: { label: 'Manufacturing', industry: 'Manufacturing', petals: 9, shift: 0.5, title: 'Ground an AI summary in shift QA reports', body: 'Take a week of shift quality reports and design a prompt that produces a defect-trend summary with citations back to each report — and refuses to speculate where the data is silent. Submit your prompt and the rationale for its guardrails.' },
  health: { label: 'Healthcare', industry: 'Healthcare', petals: 16, shift: 0.8, title: 'Ground an AI summary in discharge notes', body: 'Take three de-identified discharge summaries and design a prompt that produces a follow-up care checklist with citations back to each note — and refuses to infer anything not documented. Submit your prompt and the rationale for its guardrails.' },
}

const UNITS = [
  { name: 'Why models guess', state: 'mastered' }, { name: 'When to search the web', state: 'review' },
  { name: 'Judging sources', state: 'mastered' }, { name: 'Iterating on a prompt', state: 'mastered' },
  { name: 'Grounding and citations', state: 'next' }, { name: 'Prompt patterns', state: 'locked' },
]

const UNIVERSITY_POINTS = [
  ['Outcomes', 'Mastery data your assessment office and accreditors keep asking for — per student, per skill, per attempt.'],
  ['Faculty leverage', 'Professors stay the authors. Alma handles the 2 AM questions, the regrading, the fifth explanation.'],
  ['New reach', "Continuing-ed programs that serve working adults your campus model can't."],
]

const FOUNDER_FACTS = [
  ['Now', 'Founder of Requisor AI in Milwaukee, the official AI agentic partner of Wisconsin Tech Month'],
  ['Teaches', 'AI engineering at the Milwaukee School of Engineering and UW-Milwaukee'],
  ['Before', 'Senior product manager at Northwestern Mutual. Founding engineer at Remedy Analytics, through its exit.'],
  ['Built', 'Staythanks, DataSor, BizBarter, Toffi and RickshawWala'],
  ['Studied', 'M.S., Management & Information Systems, University of Illinois Chicago. B.E., Information Technology, University of Mumbai.'],
  ['Speaks', 'Host of the Debugging Success podcast. Speaker at Summerfest Tech and Wisconsin Tech Month.'],
]

const CREW = [
  ['Islam', 'Platform engineering'], ['Soham', 'Platform and course production'], ['Aditya', 'Infrastructure'],
  ['Kshitij', 'Engineering'], ['Vedang', 'Engineering'],
]

const CHAT_OPENING = [
  { from: 'nova', text: "Hi — I'm Nova. Tell me what you do for work, and I'll show you how a course here would be taught to you specifically." },
  { from: 'me', text: 'I run member services at a credit union.' },
  { from: 'nova', text: "Perfect — then every assignment swaps its examples for documents you already work with. Unit 1 starts with why models guess when they don't know. Want to see your placement diagnostic?" },
]
const CHAT_PROMPTS = ["I'm a nurse", 'I work in manufacturing', 'How do the exams work?']

/** Scripted answers, used when the live assistant can't be reached. */
function scriptedReply(text) {
  const t = text.toLowerCase()
  if (/(nurs|health|hospital|clinic|patient|medic)/.test(t)) return "Then your assignments use de-identified discharge notes, not toy examples. In Unit 5 you'll ground an AI summary in them — with citations, and no guessing. Full courses unlock when you sign in."
  if (/(manufactur|plant|factory|shift|quality|production)/.test(t)) return "Then you'll work with shift quality reports. In Unit 5 you'll build a defect-trend summary that cites every report — and refuses to speculate where the data is silent. Full courses unlock when you sign in."
  if (/(bank|credit union|financ|loan|member)/.test(t)) return "Then you'll practice on anonymized member-service transcripts. In Unit 5 you'll ground a case summary in them, with citations back to each one. Full courses unlock when you sign in."
  if (/(exam|test|quiz|grade|pass)/.test(t)) return "That's exactly what mastery exams check — fresh questions every attempt, so there's nothing to cram. Full courses unlock when you sign in."
  return "Good question. Sign in and I'll build your learner profile — about four minutes, and it shapes everything after."
}

/** The assistant marks course names and emphasis for the in-app chat; show them as plain text here. */
const plainReply = (text) => text.replace(/\{\{course\|[^|}]*\|([^}]*)\}\}/g, '$1').replace(/\{\{[^}]*\}\}/g, '').replace(/\*\*/g, '').trim()

function Wordmark({ by = false }) {
  return (
    <>
      <span className={s.wordmarkName}>alma</span>
      <span className={s.wordmarkDot} aria-hidden="true" />
      {by && <span className={s.wordmarkBy}>by Requisor</span>}
    </>
  )
}

/* ── sections ──────────────────────────────────────────────────────────── */
function SealLayers({ seal, idPrefix, finale = false }) {
  if (!seal) return null
  const layer = (cls, spin, id, grad, paths, strokeWidth, opacity, extra) => (
    <div className={`${s.sealLayer} ${cls}`} aria-hidden="true">
      <svg className={spin} viewBox="0 0 1000 1000">
        <defs><HoloGradient id={idPrefix + id} {...grad} /></defs>
        <g fill="none" stroke={`url(#${idPrefix + id})`} strokeWidth={strokeWidth} strokeOpacity={opacity}>
          {paths.map((d, i) => <path key={i} d={d} />)}
          {extra}
        </g>
      </svg>
    </div>
  )
  const inner = <circle cx="500" cy="500" r="303" strokeWidth="0.9" strokeOpacity="0.55" />
  if (finale) {
    return (
      <>
        {layer('', s.spinCCW, 'F1', { x1: 0, y1: 1, x2: 1, y2: 0 }, seal.outer, 0.8, 0.85)}
        {layer('', s.spinCW, 'F2', { x1: 1, y1: 1, x2: 0, y2: 0 }, seal.rose, 0.8, 0.9, inner)}
      </>
    )
  }
  return (
    <>
      {layer(s.sealA, s.spinCW, 'A', { x1: 0, y1: 0, x2: 1, y2: 1 }, seal.outer, 0.8, 0.85)}
      {layer(s.sealB, '', 'B', { x1: 1, y1: 0, x2: 0, y2: 1 }, seal.bead, 0.6, 0.7)}
      {layer(s.sealC, s.spinCCW, 'C', { x1: 0, y1: 1, x2: 1, y2: 0 }, seal.rose, 0.8, 0.9)}
      {layer(s.sealD, s.spinSlow, 'D', { x1: 0, y1: 0, x2: 1, y2: 0 }, seal.lace, 0.55, 0.75, inner)}
    </>
  )
}

function LectureHall({ hall }) {
  const ref = useRef(null)
  const [play, setPlay] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || play) return
    if (typeof IntersectionObserver === 'undefined') { setPlay(true); return }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { io.disconnect(); setPlay(true) } }, { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [play])
  const lit = hall?.lit
  return (
    <div ref={ref} className={`${s.hall} ${play ? s.hallPlay : s.hallArmed}`} role="img" aria-label="A lecture hall seen from the stage. The seats fade until one student remains, in the light.">
      {hall && lit && (
        <svg viewBox="0 0 1200 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <radialGradient id="almaHallGlow"><stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5" /><stop offset="0.35" stopColor={HOLO[4]} stopOpacity="0.3" /><stop offset="1" stopColor={HOLO[2]} stopOpacity="0" /></radialGradient>
            <linearGradient id="almaHallBeam" gradientUnits="userSpaceOnUse" x1={lit.bx1} y1="0" x2={lit.bx2} y2="0">{HOLO.map((c, i) => <stop key={i} offset={HOLO_STOPS[i]} stopColor={c} />)}</linearGradient>
            <linearGradient id="almaHallBeamFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" stopOpacity="0" /><stop offset="0.3" stopColor="#FFFFFF" stopOpacity="0.12" /><stop offset="1" stopColor="#FFFFFF" stopOpacity="1" /></linearGradient>
            <mask id="almaHallBeamMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1200" height="400"><rect x="0" y="0" width="1200" height={lit.maskH} fill="url(#almaHallBeamFade)" /></mask>
            <linearGradient id="almaHallSeat" gradientUnits="userSpaceOnUse" x1={lit.x1} y1="0" x2={lit.x2} y2="0"><stop offset="0" stopColor={HOLO[2]} /><stop offset="0.5" stopColor={HOLO[4]} /><stop offset="1" stopColor={HOLO[5]} /></linearGradient>
            <radialGradient id="almaHallHead" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#FFFFFF" /><stop offset="0.4" stopColor={HOLO[4]} /><stop offset="1" stopColor={HOLO[2]} /></radialGradient>
          </defs>
          <g stroke="#F1F7F5" strokeOpacity="0.55" strokeLinecap="round" fill="none">
            {hall.rows.map((row, i) => (
              <g key={i} className={s.hallIn} style={{ animationDelay: row.inDelay }}>
                <g className={s.hallOut} style={{ opacity: 0.3, animationDelay: row.outDelay }}>
                  {row.seats.map((seat, j) => <line key={j} x1={seat.x1} y1={seat.y1} x2={seat.x2} y2={seat.y2} strokeWidth={seat.w} />)}
                </g>
              </g>
            ))}
          </g>
          <g className={s.beam}><polygon points={lit.beam} fill="url(#almaHallBeam)" mask="url(#almaHallBeamMask)" opacity="0.38" /></g>
          <g className={s.glow}><circle className={s.glowBreathe} cx={lit.hx} cy={lit.hy} r={lit.glowR} fill="url(#almaHallGlow)" /></g>
          <g className={s.lit}>
            <line x1={lit.x1} y1={lit.y1} x2={lit.x2} y2={lit.y2} stroke="url(#almaHallSeat)" strokeWidth={lit.w} strokeLinecap="round" />
            <circle cx={lit.hx} cy={lit.hy} r={lit.hr} fill="url(#almaHallHead)" />
          </g>
        </svg>
      )}
    </div>
  )
}

function NovaChat() {
  const [messages, setMessages] = useState(CHAT_OPENING)
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const [used, setUsed] = useState({})
  const logRef = useRef(null)
  const history = useRef([]) // what the live assistant has seen: the visitor's real turns only

  useEffect(() => {
    const el = logRef.current
    if (el && messages !== CHAT_OPENING) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, typing])

  async function ask(raw) {
    const text = (raw || '').trim()
    if (!text || typing) return
    setMessages((m) => [...m, { from: 'me', text }])
    setDraft('')
    setTyping(true)
    let reply
    try {
      const next = [...history.current, { role: 'user', content: text }]
      const res = await fetch(TUTOR_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next }) })
      const data = await res.json()
      if (!res.ok || !data.reply) throw new Error('no reply')
      reply = plainReply(data.reply)
      history.current = [...next, { role: 'assistant', content: data.reply }]
    } catch {
      reply = scriptedReply(text)
    }
    setTyping(false)
    setMessages((m) => [...m, { from: 'nova', text: reply }])
  }

  return (
    <div className={s.chatShell}>
      <div className={s.chatAura} aria-hidden="true" />
      <div className={s.chatCard}>
        <div className={s.chatHead}>
          <span className={`${s.orb} ${s.orbLg}`} aria-hidden="true" />
          <div className={s.chatWho}>
            <span className={s.chatName}>Nova</span>
            <span className={s.chatLive}><span className={s.liveDot} aria-hidden="true" />Live, and adapting to you</span>
          </div>
        </div>
        <div ref={logRef} className={s.chatLog} role="log" aria-live="polite" aria-label="Conversation with Nova">
          {messages.map((m, i) => m.from === 'nova' ? (
            <div key={i} className={s.msgNova}><span className={`${s.orb} ${s.orbSm}`} aria-hidden="true" /><p>{m.text}</p></div>
          ) : (
            <div key={i} className={s.msgMe}><p>{m.text}</p></div>
          ))}
          {typing && (
            <div className={s.typing}>
              <span className={`${s.orb} ${s.orbSm}`} style={{ marginTop: 0 }} aria-hidden="true" />
              <span className={s.typingDots} role="status" aria-label="Nova is typing"><i /><i /><i /></span>
            </div>
          )}
        </div>
        <div className={s.chips}>
          {CHAT_PROMPTS.filter((p) => !used[p]).map((p) => (
            <button key={p} type="button" className={s.chip} onClick={() => { if (typing) return; setUsed((u) => ({ ...u, [p]: true })); ask(p) }}>{p}</button>
          ))}
        </div>
        <form className={s.chatForm} onSubmit={(e) => { e.preventDefault(); ask(draft) }}>
          <label htmlFor="nova-ask" className={s.srOnly}>Message Nova</label>
          <input id="nova-ask" className={s.chatInput} type="text" autoComplete="off" maxLength={600} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about any learning path — full courses unlock after you sign in." />
          <button type="submit" className={`${s.btn} ${s.btnSolid} ${s.chatSend}`}>Send</button>
        </form>
      </div>
    </div>
  )
}

function UnitState({ state }) {
  if (state === 'mastered') return <span className={s.unitState}><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4.5" fill="#7DF3D8" /></svg>Mastered</span>
  if (state === 'review') return <span className={s.unitState}><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="none" stroke="#FF9E5E" strokeWidth="1.5" /><path d="M5 1 A4 4 0 0 1 5 9 Z" fill="#FF9E5E" /></svg>Review due</span>
  if (state === 'next') return <span className={`${s.unitState} ${s.unitMuted}`}><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>Up next</span>
  return <span className={s.unitState}><svg width="10" height="12" viewBox="0 0 10 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="1" y="5" width="8" height="6" rx="1.5" /><path d="M3 5V3.6a2 2 0 0 1 4 0V5" /></svg>Unlocks after 5</span>
}

export default function AlmaLanding() {
  const [step, setStep] = useState(0)
  const [industryKey, setIndustryKey] = useState('finance')
  // The line art is thousands of points; draw it in the browser rather than shipping it in the page HTML.
  const [art, setArt] = useState(null)
  useEffect(() => {
    setArt({
      seal: buildSeal(), hall: buildHall(), mini: buildMini(12, 0),
      industry: Object.fromEntries(Object.entries(INDUSTRIES).map(([key, v]) => [key, buildMini(v.petals, v.shift)])),
    })
  }, [])
  const industry = INDUSTRIES[industryKey]
  const year = useMemo(() => new Date().getFullYear(), [])

  return (
    <div id="top" className={s.root}>
      <header className={s.header}>
        <nav aria-label="Main" className={`${s.wrap} ${s.nav}`}>
          <a href="#top" aria-label="Alma by Requisor home" className={s.wordmark}><Wordmark by /></a>
          <div className={s.navLinks}>
            {NAV.map(([href, label]) => <a key={href} className={s.navLink} href={href}>{label}</a>)}
          </div>
          <div className={s.navActions}>
            <a className={`${s.navLink} ${s.navLogin}`} href={LOGIN}>Log in</a>
            <a className={`${s.btn} ${s.btnSolid} ${s.btnSm}`} href={LOGIN}>Start learning</a>
          </div>
        </nav>
      </header>

      <main>
        <section className={s.hero} aria-labelledby="hero-title">
          <div className={s.heroGlow} aria-hidden="true" />
          <div className={s.sealStage}>
            <SealLayers seal={art?.seal} idPrefix="almaHero" />
            <div className={s.sealCenter}>
              <p className={s.eyebrow}>The AI-Native University</p>
              <h1 id="hero-title" className={s.heroTitle}>A university built around one student: you.</h1>
              <div className={s.heroCtas}>
                <a className={`${s.btn} ${s.btnSolid}`} href={LOGIN}>Start learning</a>
                <a className={`${s.btn} ${s.btnLine}`} href="#how">See how it works</a>
              </div>
            </div>
          </div>
          <div className={s.heroBelow}>
            <p className={s.lead}>No lecture halls. No cohort marching at one speed. A tutor that knows your industry, your background, and how you learn — and is incapable of leaving you behind.</p>
            <p className={s.heroTaught}>Taught by <a href="#team">Naveen Kankate</a> — founder, AI engineering instructor at MSOE &amp; <span className={s.nowrap}>UW-Milwaukee</span></p>
            <p className={s.heroAssoc}>In association with <span>Milwaukee School of Engineering</span></p>
          </div>
        </section>

        <section className={s.strip} aria-label="Highlights">
          <div className={`${s.wrap} ${s.stripGrid}`}>
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className={s.stripItem}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{h.icon}</svg>
                <p className={s.stripTitle}>{h.title}</p>
                <p className={s.stripText}>{h.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={s.doctrine} aria-labelledby="doctrine-title">
          <div className={s.doctrinePanel}>
            <div className={s.doctrineGlow} aria-hidden="true" />
            <LectureHall hall={art?.hall} />
            <div className={s.doctrineBody}>
              <h2 id="doctrine-title" className={s.doctrineTitle}>The lecture was built for the room. You were never in it.</h2>
              <div className={s.doctrineCols}>
                <p>One professor. Two hundred students. One speed. The format made sense when knowledge was scarce and rooms were the only way to share it. But a lecture can&apos;t know that you&apos;re a banker, that you learned statistics ten years ago, or that you almost understood yesterday&apos;s concept and need exactly one more example.</p>
                <div className={s.doctrineCan}>
                  <p className={s.canTitle}>Alma can.</p>
                  <p>Every course is delivered by an intelligence that maps what you already know, teaches in the language of your work, and refuses to move on until mastery is real — then keeps it real.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="tutors" className={s.tutors} aria-labelledby="tutors-title">
          <div className={`${s.wrap} ${s.tutorsInner}`}>
            <h2 id="tutors-title" className={s.h2}>Meet Nova, your tutor.</h2>
            <p className={`${s.lead} ${s.tutorsLead}`}>Socratic by default. Nova guides you to the answer — it never hands it to you — by voice or chat, at 2&nbsp;PM or 2&nbsp;AM.</p>
            <NovaChat />
            <p className={`${s.small} ${s.tutorsNote}`}>Ask anything. Alma answers in the language of your work — full courses unlock when you sign in.</p>
          </div>
        </section>

        <section id="how" className={s.how} aria-labelledby="how-title">
          <div className={s.wrap}>
            <h2 id="how-title" className={s.h2} style={{ maxWidth: '18ch' }}>Four moves, repeated until it&apos;s yours.</h2>
            <div className={s.howCols}>
              <div className={s.ring}>
                <svg viewBox="0 0 400 400" role="img" aria-label="Diagnose, learn, prove and keep form a loop around you">
                  <defs>
                    <HoloGradient id="almaRing" />
                    <radialGradient id="almaYou" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#FFFFFF" /><stop offset="0.35" stopColor={HOLO[2]} /><stop offset="1" stopColor={HOLO[0]} /></radialGradient>
                  </defs>
                  {RING_ARCS.map((d, i) => <path key={i} d={d} fill="none" stroke={step === i ? 'url(#almaRing)' : '#D9DDE3'} strokeWidth="6" strokeLinecap="round" />)}
                  <circle cx="200" cy="200" r="38" fill="none" stroke="#27272A" strokeOpacity="0.08" strokeWidth="1.5" />
                  <circle cx="200" cy="200" r="13" fill="url(#almaYou)" />
                  <text x="200" y="266" textAnchor="middle" fill="#575760">You</text>
                  {RING_STOPS.map(([x, y], i) => (
                    <g key={i}>
                      <circle cx={x} cy={y} r="19" fill={step === i ? '#1B8A76' : '#FFFFFF'} stroke={step === i ? '#1B8A76' : '#D9DDE3'} strokeWidth="2" />
                      <text x={x} y={y + 5.4} textAnchor="middle" fill={step === i ? '#FFFFFF' : '#575760'}>{i + 1}</text>
                    </g>
                  ))}
                </svg>
              </div>
              <ol className={s.steps}>
                {STEPS.map((item, i) => (
                  <li key={item.label}>
                    <button type="button" className={`${s.step} ${step === i ? s.stepOn : ''}`} aria-pressed={step === i} onClick={() => setStep(i)}>
                      <span className={s.stepBadge} aria-hidden="true">{i + 1}</span>
                      <span className={s.stepText}>
                        <span className={s.stepLabel}>{item.label}</span>
                        <span className={s.stepTitle}>{item.title}</span>
                        <span className={s.stepBody}>{item.body}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="industry" className={s.industry} aria-labelledby="industry-title">
          <div className={s.wrap}>
            <h2 id="industry-title" className={s.h2} style={{ maxWidth: '17ch' }}>The same course reads differently to a banker and a nurse.</h2>
            <div className={s.industryCols}>
              <div className={s.industryLeft}>
                <p className={s.lead}>Choose your industry — Alma rewrites every assignment around artifacts you actually touch at work. One assignment from the prompt engineering course, three ways:</p>
                <div className={s.pills} role="group" aria-label="Choose an industry">
                  {Object.entries(INDUSTRIES).map(([key, v]) => (
                    <button key={key} type="button" className={`${s.pill} ${industryKey === key ? s.pillOn : ''}`} aria-pressed={industryKey === key} onClick={() => setIndustryKey(key)}>{v.label}</button>
                  ))}
                </div>
              </div>
              <div className={s.stack}>
                <div className={s.stackBack1} aria-hidden="true" />
                <div className={s.stackBack2} aria-hidden="true" />
                <article className={s.assignment} aria-live="polite">
                  <svg className={s.assignmentSeal} viewBox="0 0 1000 1000" aria-hidden="true">
                    <defs><HoloGradient id="almaCard" /></defs>
                    <g fill="none" stroke="url(#almaCard)" strokeWidth="3">{(art?.industry[industryKey] ?? []).map((d, i) => <path key={i} d={d} />)}</g>
                  </svg>
                  <div className={s.assignmentTop}>
                    <span className={s.assignmentUnit}>Prompt engineering, unit 5</span>
                    <span className={s.tag}>{industry.industry}</span>
                  </div>
                  <h3 className={s.assignmentTitle}>{industry.title}</h3>
                  <p className={s.assignmentBody}>{industry.body}</p>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section id="credential" className={s.credential} aria-labelledby="credential-title">
          <div className={`${s.wrap} ${s.credentialCols}`}>
            <div className={s.credentialLeft}>
              <h2 id="credential-title" className={s.h2}>A transcript of what you can do — not hours you sat.</h2>
              <p className={s.lead}>Every mastered unit is backed by evidence: the exams you passed, the work you produced, the skills you&apos;ve kept sharp. Share an Alma transcript and an employer sees proof, not attendance.</p>
              <p className={s.small}>Courses today confer certificates of mastery. University-credit pathways are in progress with our institutional partners.</p>
            </div>
            <div className={s.credentialRight}>
              <article className={s.transcript} aria-label="Sample mastery transcript">
                <svg className={s.transcriptSeal} viewBox="0 0 1000 1000" aria-hidden="true">
                  <defs><HoloGradient id="almaTranscript" /></defs>
                  <g fill="none" stroke="url(#almaTranscript)" strokeWidth="2">{(art?.mini ?? []).map((d, i) => <path key={i} d={d} />)}</g>
                </svg>
                <div className={s.transcriptTop}>
                  <span className={s.transcriptMark}><b>alma</b><i aria-hidden="true" /></span>
                  <span className={s.transcriptKind}>Mastery transcript</span>
                </div>
                <div className={s.transcriptWho}>
                  <svg width="100" height="100" viewBox="0 0 120 120" role="img" aria-label="Four of six units mastered">
                    <defs>
                      <linearGradient id="almaRingCard" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={HOLO[2]} /><stop offset="0.6" stopColor={HOLO[4]} /><stop offset="1" stopColor={HOLO[5]} /></linearGradient>
                      <radialGradient id="almaDotCard" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#FFFFFF" /><stop offset="0.4" stopColor={HOLO[4]} /><stop offset="1" stopColor={HOLO[2]} /></radialGradient>
                    </defs>
                    <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(241, 247, 245, 0.12)" strokeWidth="7" />
                    <path d="M 60 14 A 46 46 0 1 1 20.16 83" fill="none" stroke="url(#almaRingCard)" strokeWidth="7" strokeLinecap="round" />
                    <circle cx="60" cy="60" r="8" fill="url(#almaDotCard)" />
                  </svg>
                  <div>
                    <span className={s.transcriptName}>Your name</span>
                    <span className={s.transcriptCourse}>Prompt engineering</span>
                    <span className={s.transcriptCount}>4 of 6 units mastered</span>
                  </div>
                </div>
                <ol className={s.units}>
                  {UNITS.map((u, i) => (
                    <li key={u.name} className={`${s.unit} ${u.state === 'locked' ? s.unitLocked : ''}`}>
                      <span className={s.unitName}><span>{i + 1}</span>{u.name}</span>
                      <UnitState state={u.state} />
                    </li>
                  ))}
                </ol>
                <p className={s.transcriptFoot}>Sample transcript</p>
              </article>
            </div>
          </div>
        </section>

        <section id="universities" className={s.universities} aria-labelledby="universities-title">
          <div className={`${s.wrap} ${s.uniCols}`}>
            <div className={s.uniLeft}>
              <h2 id="universities-title" className={s.h2}>Give every one of your students a personal tutor.</h2>
              <p className={s.lead}>Alma doesn&apos;t replace your institution — it&apos;s your faculty&apos;s course, amplified. Your curriculum, your credit, delivered through an intelligence that meets each student where they are and hands you the evidence.</p>
              <div className={s.uniCta}><a className={`${s.btn} ${s.btnSolid}`} href="mailto:naveen@requisor.io?subject=Alma%20university%20pilot">Book a pilot call</a></div>
              <p className={s.uniNote}>Built in association with the Milwaukee School of Engineering, where Alma&apos;s founder teaches AI engineering.</p>
            </div>
            <dl className={s.defs}>
              {UNIVERSITY_POINTS.map(([term, text]) => <div key={term} className={s.def}><dt>{term}</dt><dd>{text}</dd></div>)}
            </dl>
          </div>
        </section>

        <section id="team" className={s.team} aria-labelledby="team-title">
          <div className={s.wrap}>
            <h2 id="team-title" className={s.h2}>Taught by someone who builds AI for a living.</h2>
            <div className={s.founder}>
              <figure className={s.portrait}>
                <div className={s.portraitFrame}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/naveen-kankate-portrait.jpg" alt="Naveen Kankate" loading="lazy" />
                </div>
                <figcaption>Naveen Kankate, founder of Alma</figcaption>
              </figure>
              <div className={s.founderBody}>
                <p className={s.founderName}>Naveen Kankate</p>
                <p className={s.founderRole}>Founder, and AI engineering instructor at MSOE &amp; <span className={s.nowrap}>UW-Milwaukee</span></p>
                <p className={s.founderBio}>Naveen has spent more than a decade turning ideas into products — as a founding engineer at Remedy Analytics, as a senior product manager at Northwestern Mutual, and now as the founder of Requisor AI, where his team builds AI agents for companies. Alma&apos;s courses come straight from his classroom at the Milwaukee School of Engineering and <span className={s.nowrap}>UW-Milwaukee</span>.</p>
                <dl className={s.facts}>
                  {FOUNDER_FACTS.map(([term, text]) => <div key={term} className={s.fact}><dt>{term}</dt><dd>{text}</dd></div>)}
                </dl>
                <a className={s.inkLink} href="https://www.linkedin.com/in/naveenkankate" target="_blank" rel="noopener noreferrer">Naveen on LinkedIn</a>
              </div>
            </div>
            <div className={s.crew}>
              <div className={s.crewHead}>
                <h3>A small team, on purpose.</h3>
                <p>Alma is built by a founder-led team of engineers and course producers in Milwaukee and India.</p>
              </div>
              <ul className={s.crewGrid}>
                {CREW.map(([name, role], i) => (
                  <li key={name} className={s.member}>
                    <span className={s.memberRing} aria-hidden="true" style={{ background: `conic-gradient(from ${200 + i * 60}deg, ${HOLO.join(', ')}, ${HOLO[0]})` }}><span>{name[0]}</span></span>
                    <span className={s.memberName}>{name}</span>
                    <span className={s.memberRole}>{role}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className={s.finale} aria-labelledby="finale-title">
          <div className={s.finaleStage}>
            <SealLayers seal={art?.seal} idPrefix="almaFinale" finale />
            <div className={s.finaleCenter}>
              <h2 id="finale-title" className={s.finaleTitle}>Mastery, proven.</h2>
              <p className={s.finaleSub}>For every single student.</p>
              <a className={`${s.btn} ${s.btnSolid} ${s.finaleCta}`} href={LOGIN}>Start learning</a>
            </div>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={`${s.wrap} ${s.footerInner}`}>
          <div className={s.footerTop}>
            <div className={s.footerBrand}>
              <span className={s.wordmark} style={{ marginRight: 0 }}><Wordmark by /></span>
              <p>The AI-Native University</p>
              <p>In association with Milwaukee School of Engineering</p>
            </div>
            <nav aria-label="Footer" className={s.footerNav}>
              <div className={s.footerCol}>
                <p>Learn</p>
                {NAV.slice(0, 4).map(([href, label]) => <a key={href} className={s.navLink} href={href}>{label}</a>)}
              </div>
              <div className={s.footerCol}>
                <p>Alma</p>
                <a className={s.navLink} href="#universities">Universities</a>
                <a className={s.navLink} href="#team">Team</a>
                <a className={s.navLink} href={LOGIN}>Log in</a>
              </div>
              <div className={s.footerCol}>
                <p>Connect</p>
                <a className={s.navLink} href="https://www.linkedin.com/company/requisor" target="_blank" rel="noopener noreferrer">LinkedIn</a>
                <a className={s.navLink} href="https://x.com/Requisor_AI" target="_blank" rel="noopener noreferrer">X</a>
                <a className={s.navLink} href="https://www.instagram.com/requisor.io/" target="_blank" rel="noopener noreferrer">Instagram</a>
                <a className={s.navLink} href="mailto:naveen@requisor.io">Contact</a>
              </div>
            </nav>
          </div>
          <div className={s.footerLegal}>
            © {year} Citrus Innovations Inc. — Alma, by <a className={s.navLink} href="https://requisor.io" target="_blank" rel="noopener noreferrer">Requisor</a>. Milwaukee, WI.
          </div>
        </div>
      </footer>
    </div>
  )
}
