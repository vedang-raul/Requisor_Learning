import { useEffect, useRef, useState } from 'react'
import Message, { TypingBubble } from './Message.jsx'

const SEED = [
  {
    role: 'ai',
    tag: 'Adapted to: Healthcare PM',
    text: "Welcome back, Maya. Last session you mastered prompt evaluation — your retention check is due Thursday. Today: retrieval. Since you work in care coordination, let's ground it there. What patient-data problem would you *not* trust a plain chatbot with?",
  },
  { role: 'me', text: 'Anything with actual patient records — it could just make things up.' },
  {
    role: 'ai',
    text: 'Exactly — hallucination risk. So what if the model could only answer from documents we hand it, and had to cite which record it used? What would you need to build first?',
  },
]

const SYSTEM =
  "You are Adept's Socratic AI tutor on a landing page demo, teaching applied AI engineering. Be warm, brief (2-4 sentences), and guide with questions and hints. Never give direct final answers to assignment-style questions; scaffold instead. If asked something off-topic, gently steer back to learning."

const CANNED = [
  "Good question — let's reason through it. If your retrieval step returned nothing relevant, what should the tutor's honest move be: guess, or say so and ask for more context? Why?",
  "You're circling the right idea. Try this: explain it back to me as if to a colleague in your industry — where does your explanation feel shaky? That's exactly where we'll dig.",
  'Instead of the answer, here’s a nudge: think about what changes between a demo and production — data freshness, edge cases, trust. Which of those three bites first in your world?',
]

/* Point this at your own server-side proxy; the Anthropic API cannot be called
   directly from a browser (no key, and CORS blocks it). Unset -> canned replies. */
const TUTOR_API = process.env.NEXT_PUBLIC_TUTOR_API

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
      if (!TUTOR_API) throw new Error('no endpoint')
      historyRef.current.push({ role: 'user', content: userText })
      const res = await fetch(TUTOR_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 1000,
          system: SYSTEM,
          messages: historyRef.current,
        }),
      })
      const data = await res.json()
      reply = (data.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()
      if (!reply) throw new Error('empty')
      historyRef.current.push({ role: 'assistant', content: reply })
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
      className="flex min-h-[520px] flex-col overflow-hidden rounded-[22px] border border-line bg-card shadow-landing-soft"
      aria-label="Live tutor demo"
    >
      <div className="flex items-center gap-3 border-b border-line px-[18px] py-[15px]">
        <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-ultra to-[#6B4DF0] font-display font-extrabold text-white">
          A
        </div>
        <div className="flex-1 leading-[1.25]">
          <b className="block text-[14.5px]">Your Adept Tutor</b>
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
        className="flex max-h-[380px] flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-5"
      >
        {messages.map((m, idx) => (
          <Message key={idx} role={m.role} tag={m.tag}>
            {m.text}
          </Message>
        ))}
        {typing && <TypingBubble />}
      </div>

      <div className="flex gap-2.5 border-t border-line bg-[#FBFBFE] p-3.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitChat()}
          placeholder="Ask the tutor anything…"
          aria-label="Message the tutor"
          className="flex-1 rounded-xl border-[1.5px] border-line bg-white px-3.5 py-3 font-sans text-[14.5px] focus:border-ultra focus:outline-none"
        />
        <button
          onClick={submitChat}
          className="rounded-xl bg-ink px-[18px] text-[14.5px] font-semibold text-white hover:bg-ultra"
        >
          Send
        </button>
      </div>

      <p className="bg-[#FBFBFE] px-3.5 pb-3 text-center text-[11.5px] text-ink-soft">
        This is the real thing — a Socratic tutor. It will guide you to the answer, never hand it to
        you.
      </p>
    </div>
  )
}
