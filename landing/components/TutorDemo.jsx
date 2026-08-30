import { useEffect, useRef, useState } from 'react'
import Message, { TypingBubble } from './Message.jsx'
import CourseSuggestion, { parseCourseTags } from './CourseSuggestion.jsx'
import LandingCourseCard from './LandingCourseCard.jsx'
import { landingCourses } from '../../lib/courses'

/* A reply naming 3+ paths reads as "show me everything you offer" — render
   the full learning-path card grid instead of inline chips. */
const ALL_COURSES_THRESHOLD = 3

function renderAiMessage(text, tag, idx) {
  const segments = parseCourseTags(text)
  const courseSlugs = new Set(segments.filter((s) => s.type === 'course').map((s) => s.slug))

  if (courseSlugs.size >= ALL_COURSES_THRESHOLD) {
    const introText = segments
      .filter((s) => s.type === 'text')
      .map((s) => s.value)
      .join(' ')
      .trim()
    return (
      <div key={idx} className="flex flex-col gap-3">
        {introText && (
          <Message role="ai" tag={tag}>
            <span>{introText}</span>
          </Message>
        )}
        <div className="grid grid-cols-2 gap-2.5" aria-label="All learning paths">
          {landingCourses.map((course) => (
            <LandingCourseCard key={course.slug} course={course} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <Message key={idx} role="ai" tag={tag}>
      {segments.map((seg, si) =>
        seg.type === 'course' ? (
          <CourseSuggestion key={si} slug={seg.slug} title={seg.title} />
        ) : (
          <span key={si}>{seg.value}</span>
        )
      )}
    </Message>
  )
}

const SEED = [
  {
    role: 'ai',
    tag: 'Ask me anything',
    text: "Hi — I'm the Requisor Learning assistant. Tell me about your role or what you're trying to learn, and I'll point you to the right path.",
  },
]

const CANNED = [
  "I'm having trouble reaching the assistant right now — but here's a starting point: {{course|product-management|Product Management}}, {{course|data-analytics|Data Analytics}}, {{course|agentic-ai|Agentic AI}}, and {{course|cyber-security|Cyber Security}} are our four learning paths. Sign in to explore any of them.",
]

/* Same-origin Next.js API route — no key needed client-side, no CORS issue. */
const TUTOR_API = '/api/landing-chat'

export default function TutorDemo() {
  const [messages, setMessages] = useState([])
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')

  const chatRef = useRef(null)
  const historyRef = useRef([])
  const cannedRef = useRef(0)

  /* scripted opening exchange */
  useEffect(() => {
    let cancelled = false
    const timers = []
    const wait = (ms) => new Promise((r) => timers.push(setTimeout(r, ms)))

    ;(async () => {
      await wait(700)
      for (const m of SEED) {
        if (cancelled) return
        if (m.role === 'ai') {
          setTyping(true)
          await wait(1100)
          if (cancelled) return
          setTyping(false)
          setMessages((prev) => [...prev, m])
          await wait(900)
        } else {
          setMessages((prev) => [...prev, m])
          await wait(800)
        }
      }
    })()

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
      setTyping(false)
    }
  }, [])

  /* keep the transcript pinned to the bottom */
  useEffect(() => {
    const el = chatRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, typing])

  async function tutorReply(userText) {
    setTyping(true)
    let reply
    try {
      const nextHistory = [...historyRef.current, { role: 'user', content: userText }]
      const res = await fetch(TUTOR_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextHistory }),
      })
      const data = await res.json()
      if (!res.ok || !data.reply) throw new Error(data.error || 'empty')
      reply = data.reply
      historyRef.current = [...nextHistory, { role: 'assistant', content: reply }]
    } catch {
      reply = CANNED[cannedRef.current++ % CANNED.length]
    }
    setTyping(false)
    setMessages((prev) => [...prev, { role: 'ai', text: reply }])
  }

  function submitChat() {
    const v = draft.trim()
    if (!v) return
    setMessages((prev) => [...prev, { role: 'me', text: v }])
    setDraft('')
    tutorReply(v)
  }

  return (
    <div
      className="flex min-h-[470px] flex-col overflow-hidden rounded-[22px] border border-line bg-card shadow-landing-soft sm:min-h-[520px]"
      aria-label="Live tutor demo"
    >
      <div className="flex items-center gap-1 border-b border-line px-4 py-[15px] sm:px-[18px]">
          <img src = "/requisor.png" alt="Requisor" className="size-14" width="24" height="24" />
        <div className="flex-1 leading-[1.25]">
          <b className="block text-[14.5px]">Your Requisor Tutor</b>
          <span className="font-mono text-[12px] text-mint before:mr-1.5 before:content-['●']">
            live · adapts to you
          </span>
        </div>
        <div className="flex h-[22px] items-end gap-[3px] px-2.5" aria-hidden="true">
          {[8, 16, 11, 18, 7].map((h, idx) => (
            <i
              key={idx}
              className="w-[3px] animate-eq rounded-[2px] bg-ultra"
              style={{ height: `${h}px`, animationDelay: `${idx * 0.15}s` }}
            />
          ))}
        </div>
      </div>

      <div
        ref={chatRef}
        className="flex max-h-[340px] flex-1 flex-col gap-3 overflow-y-auto px-4 py-5 sm:max-h-[380px] sm:px-[18px]"
      >
        {messages.map((m, idx) =>
          m.role === 'ai' ? (
            renderAiMessage(m.text, m.tag, idx)
          ) : (
            <Message key={idx} role={m.role} tag={m.tag}>
              {m.text}
            </Message>
          )
        )}
        {typing && <TypingBubble />}
      </div>

      <div className="flex gap-2.5 border-t border-line bg-[#FBFBFE] p-3 sm:p-3.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitChat()}
          placeholder="Ask the tutor anything…"
          aria-label="Message the tutor"
          className="min-w-0 flex-1 rounded-xl border-[1.5px] border-line bg-white px-3.5 py-3 font-sans text-[14.5px] focus:border-ultra focus:outline-none"
        />
        <button
          onClick={submitChat}
          className="shrink-0 rounded-xl bg-ink px-4 text-[14.5px] font-semibold text-white hover:bg-ultra sm:px-[18px]"
        >
          Send
        </button>
      </div>

      <p className="bg-[#FBFBFE] px-3.5 pb-3 text-center text-[11.5px] text-ink-soft">
        Ask about any learning path — full courses unlock after you sign in.
      </p>
    </div>
  )
}
