import { useEffect, useRef, useState } from 'react'
import { Settings, Volume2, VolumeX, Check } from 'lucide-react'
import Message, { TypingBubble } from './Message.jsx'
import CourseSuggestion, { parseCourseTags } from './CourseSuggestion.jsx'
import LandingCourseCard from './LandingCourseCard.jsx'
import { landingCourses } from '../lib/courses.js'
import { PersonaAvatar } from '@/components/persona-avatar'
import { useVoice } from '@/hooks/use-voice'
import { PERSONAS, LANGUAGES, DEFAULT_PERSONA_ID } from '@/lib/personas'

const PERSONA_KEY = 'requisor-landing-persona'
const LANGUAGE_KEY = 'requisor-landing-language'
const MUTE_KEY = 'requisor-landing-muted'

function readLocal(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable — preference just won't persist */
  }
}

/** Plain speakable text: course chips -> their titles, tag markup stripped. */
function stripForSpeech(text) {
  return parseCourseTags(text)
    .map((seg) => (seg.type === 'course' ? seg.title : seg.value))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

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

/* Rendered as a fixed-position sibling OUTSIDE the widget's overflow-hidden
   card (see the `open &&` block in TutorDemo below) — an absolutely
   positioned dropdown nested inside that card would get clipped. */
function GuideSettingsPanel({ pos, personaId, onPersona, language, onLanguage, muted, onToggleMute, ttsSupported, onClose }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-64 rounded-2xl border border-alma-line bg-[#0C0E0F] p-3 shadow-[0_24px_60px_-24px_rgba(0,0,0,.6)]"
        style={{ top: pos.top, right: pos.right }}
      >
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-alma-muted">Appearance</p>
        <div className="mb-3 grid grid-cols-6 gap-1.5">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPersona(p.id)}
              title={p.name}
              aria-label={p.name}
              className={`rounded-lg p-0.5 ring-2 transition ${personaId === p.id ? 'ring-pulse' : 'ring-transparent hover:ring-alma-line'}`}
            >
              <PersonaAvatar personaId={p.id} size="xs" />
            </button>
          ))}
        </div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-alma-muted">Language</p>
        <select
          value={language}
          onChange={(e) => onLanguage(e.target.value)}
          className="mb-3 w-full rounded-lg border border-alma-line bg-white/5 px-2.5 py-1.5 text-[13px] text-alma-text focus:border-pulse focus:outline-none"
        >
          <option className="bg-[#0C0E0F]" value="">English (default)</option>
          {LANGUAGES.map((l) => (
            <option className="bg-[#0C0E0F]" key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
        {ttsSupported && (
          <button
            type="button"
            onClick={onToggleMute}
            className="flex w-full items-center gap-2 rounded-lg border border-alma-line px-2.5 py-1.5 text-[13px] text-alma-text transition hover:border-pulse/50"
          >
            {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5 text-pulse" />}
            {muted ? 'Voice replies off' : 'Voice replies on'}
            {!muted && <Check className="ml-auto size-3.5 text-pulse" />}
          </button>
        )}
      </div>
    </>
  )
}

export default function TutorDemo() {
  const [messages, setMessages] = useState([])
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const [personaId, setPersonaId] = useState(DEFAULT_PERSONA_ID)
  const [language, setLanguage] = useState('')
  const [muted, setMuted] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsPos, setSettingsPos] = useState({ top: 0, right: 0 })
  const settingsBtnRef = useRef(null)

  const chatRef = useRef(null)
  const historyRef = useRef([])
  const cannedRef = useRef(0)
  const voice = useVoice()

  // The initial HTML must match on the server and browser. Browser-only saved
  // choices are restored after hydration so they cannot change first render.
  useEffect(() => {
    setPersonaId(readLocal(PERSONA_KEY, DEFAULT_PERSONA_ID))
    setLanguage(readLocal(LANGUAGE_KEY, ''))
    setMuted(readLocal(MUTE_KEY, 'false') === 'true')
  }, [])

  function toggleSettings() {
    if (!showSettings && settingsBtnRef.current) {
      const r = settingsBtnRef.current.getBoundingClientRect()
      setSettingsPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    setShowSettings((v) => !v)
  }

  function choosePersona(id) {
    setPersonaId(id)
    writeLocal(PERSONA_KEY, id)
  }
  function chooseLanguage(code) {
    setLanguage(code)
    writeLocal(LANGUAGE_KEY, code)
  }
  function toggleMute() {
    setMuted((prev) => {
      const next = !prev
      writeLocal(MUTE_KEY, String(next))
      if (next) voice.stopSpeaking()
      return next
    })
  }

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
    voice.stopSpeaking()
    let reply
    try {
      const nextHistory = [...historyRef.current, { role: 'user', content: userText }]
      const res = await fetch(TUTOR_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextHistory, language: language || undefined }),
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
    if (!muted && voice.ttsSupported) voice.speak(stripForSpeech(reply))
  }

  function submitChat() {
    const v = draft.trim()
    if (!v) return
    setMessages((prev) => [...prev, { role: 'me', text: v }])
    setDraft('')
    tutorReply(v)
  }

  return (
    <>
    <div
      className="flex min-h-[470px] flex-col overflow-hidden rounded-[22px] border border-alma-line bg-gradient-to-b from-white/[0.06] to-white/[0.02] shadow-[0_40px_120px_rgba(0,0,0,.55),0_0_80px_rgba(125,243,216,.05)] sm:min-h-[520px]"
      aria-label="Live tutor demo"
    >
      <div className="flex items-center gap-2.5 border-b border-alma-line px-4 py-[15px] sm:px-[18px]">
        <PersonaAvatar personaId={personaId} size="md" state={voice.isSpeaking ? 'speaking' : 'idle'} />
        <div className="flex-1 leading-[1.25]">
          <b className="block text-[14.5px] text-alma-text">{PERSONAS.find((p) => p.id === personaId)?.name ?? 'Your Requisor Guide'}</b>
          <span className="font-mono text-[12px] text-pulse before:mr-1.5 before:content-['●']">
            live · adapts to you
          </span>
        </div>
        <div className="flex h-[22px] items-end gap-[3px] px-1" aria-hidden="true">
          {[8, 16, 11, 18, 7].map((h, idx) => (
            <i
              key={idx}
              className="w-[3px] animate-eq rounded-[2px] bg-pulse"
              style={{ height: `${h}px`, animationDelay: `${idx * 0.15}s` }}
            />
          ))}
        </div>
        <button
          ref={settingsBtnRef}
          type="button"
          onClick={toggleSettings}
          aria-label="Customize your guide"
          title="Customize your guide"
          className="rounded-lg p-1.5 text-alma-muted transition hover:bg-white/10 hover:text-alma-text"
        >
          <Settings className="size-4" />
        </button>
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

      <div className="flex gap-2.5 border-t border-alma-line bg-black/20 p-3 sm:p-3.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitChat()}
          placeholder="Ask the tutor anything…"
          aria-label="Message the tutor"
          className="min-w-0 flex-1 rounded-xl border-[1.5px] border-alma-line bg-white/5 px-3.5 py-3 font-sans text-[14.5px] text-alma-text placeholder:text-alma-faint focus:border-pulse focus:outline-none"
        />
        <button
          onClick={submitChat}
          className="shrink-0 rounded-xl bg-alma-text px-4 text-[14.5px] font-semibold text-[#0A0C0B] transition hover:bg-pulse sm:px-[18px]"
        >
          Send
        </button>
      </div>

      <p className="bg-black/20 px-3.5 pb-3 text-center text-[11.5px] text-alma-faint">
        Ask about any learning path — full courses unlock after you sign in.
      </p>
    </div>
    {showSettings && (
      <GuideSettingsPanel
        pos={settingsPos}
        personaId={personaId}
        onPersona={choosePersona}
        language={language}
        onLanguage={chooseLanguage}
        muted={muted}
        onToggleMute={toggleMute}
        ttsSupported={voice.ttsSupported}
        onClose={() => setShowSettings(false)}
      />
    )}
    </>
  )
}
