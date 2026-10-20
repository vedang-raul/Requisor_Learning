"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Accessibility, BookPlus, Check, Compass, Ear, Headphones, ListChecks, Loader2, RotateCcw, Send, Sparkles, Square, ThumbsDown, ThumbsUp, TrendingUp, Volume2, VolumeX, X, ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { getNudge, markNudgeSeen, type Nudge } from "@/lib/ai/nudges";
import { cn } from "@/lib/utils";
import { parseCourseLessonCount } from "@/lib/ai/course-interview";
import { renderMarkdownLite, endsInOpenTag } from "@/components/ui/markdown-lite";
import { useVoice } from "@/hooks/use-voice";
import { useApprovedSpeech } from "@/hooks/use-approved-speech";
import { ChatbotVoiceSelect } from "@/components/chatbot-voice-select";
import { programDraftSummary } from "@/lib/courses/program-builder";
import { PersonaAvatar } from "@/components/assistant/persona-avatar";
import { AI_GUIDE_PREFERENCES_UPDATED, ASSISTANT_NAME } from "@/lib/assistant/personas";
import { trackEvent } from "@/lib/analytics";
import type { Course } from "@/lib/types";
import { splitActionFrames, type AssistantAction } from "@/lib/assistant/assistant-actions";
import { AssistantActionCard, cardPrompt, type ActionOutcome } from "@/components/assistant/assistant-action-card";
import { classifySpokenAnswer, isStopCommand, isStopUtterance } from "@/lib/accessibility/voice-commands";
import { startWakeWord, wakeWordAvailable, type WakeState, type WakeWordListener } from "@/lib/voice/wake-word";
import { useAccessibility } from "@/components/layout/accessibility-provider";
import { ACCESSIBILITY_UPDATED, type AccessibilityPrefs } from "@/lib/accessibility/preferences";
/** An assistant reply may carry actions the user can confirm (see src/lib/assistant/assistant-actions.ts). */
type ChatMessage = {
  role: "user" | "assistant"; content: string; actions?: AssistantAction[];
  /** The user's thumbs up or down on this reply, and the id it is stored under. */
  feedback?: "up" | "down"; feedbackId?: string;
  /** The user cut this reply short. */
  stopped?: boolean;
};

/** What the model is told happened to its proposals, so the conversation stays accurate. */
function describeOutcome(action: AssistantAction, outcome: ActionOutcome | undefined): string {
  const what = action.kind.replace(/_/g, " ");
  if (!outcome) return `[Proposed ${what}: not confirmed yet]`;
  return outcome.status === "done" ? `[User confirmed ${what}: ${outcome.message}]` : `[User cancelled ${what}]`;
}
const COURSE_INTERVIEW_QUESTIONS = [
  "What topic should this course teach?",
  "Who is the course for? Describe the target learners.",
  "What level should it be: beginner, intermediate, or advanced?",
  "What should learners be able to do by the end? List the main outcomes.",
  "Should the lessons be reading, video, or a mix of both?",
  "How many lessons should the course have? Choose between 3 and 12.",
] as const;
const LEARNER_QUICK_PROMPTS = [
  { icon: Sparkles, label: "Explain this lesson simply" },
  { icon: ListChecks, label: "Help me with my assignment" },
  { icon: Check, label: "Quiz me on a lesson" },
  { icon: Compass, label: "What should I learn next?" },
  { icon: TrendingUp, label: "What grades did I get?" },
  { icon: Sparkles, label: "Give me a practice assignment" },
];
const TUTOR_QUICK_PROMPTS = [
  { icon: Sparkles, label: "Design a course from my topic" },
  { icon: ListChecks, label: "What needs grading?" },
  { icon: BookPlus, label: "Add a lesson to one of my courses" },
  { icon: Compass, label: "Publish or unpublish a course or lesson" },
  { icon: TrendingUp, label: "Create activities and assessments" },
  { icon: Check, label: "Check my video edits" },
];
const dotTransition = (delay: number) => ({
  duration: 0.9,
  repeat: Infinity,
  ease: [0.45, 0, 0.55, 1] as const,
  delay,
});
function TypingDots() {
  return (
    <span className="flex items-center gap-1 px-1 py-2">
      {[0, 0.15, 0.3].map((delay, i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-primary to-secondary"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={dotTransition(delay)}
        />
      ))}
    </span>
  );
}
function StreamCursor() {
  return (
    <motion.span
      aria-hidden
      className="ml-0.5 inline-block h-3.5 w-[3px] rounded-full bg-gradient-to-b from-primary to-secondary align-middle"
      animate={{ opacity: [1, 1, 0, 0] }}
      transition={{ duration: 0.9, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
      style={{ boxShadow: "0 0 6px rgba(0,0,0,0.15)" }}
    />
  );
}
/**
 * Live mic waveform (Claude-style dictation).
 * While `active`, opens an AnalyserNode on the mic stream and samples the real
 * input level ~18×/s. Each sample is pushed onto a rolling buffer, so the bars
 * scroll left as you speak — exactly like Claude's recording animation.
 * Falls back to a gentle synthetic pulse if the audio stream can't be opened.
 */
function useMicWaveform(active: boolean, barCount = 28) {
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: barCount }, () => 0.06));
  useEffect(() => {
    if (!active) {
      setBars(Array.from({ length: barCount }, () => 0.06));
      return;
    }
    let cancelled = false;
    let raf: number | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let lastPush = 0;

    const push = (level: number) =>
      setBars((prev) => [...prev.slice(1), Math.min(1, Math.max(0.06, level))]);

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.6;
        ctx.createMediaStreamSource(s).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const tick = (now: number) => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          if (now - lastPush > 55) {
            lastPush = now;
            push(rms * 4.5); // scale RMS into a visible 0..1 range
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (cancelled) return;
        fallback = setInterval(() => push(0.12 + Math.random() * 0.35), 90);
      });

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (fallback) clearInterval(fallback);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    };
  }, [active, barCount]);
  return bars;
}
/** The scrolling bar strip rendered while recording. */
function RecordingWaveform({ bars }: { bars: number[] }) {
  return (
    <div className="flex h-9 min-w-0 flex-1 items-center justify-center gap-[3px] overflow-hidden px-1">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-[3px] shrink-0 rounded-full bg-gradient-to-b from-primary to-secondary transition-[height] duration-100 ease-out"
          style={{ height: `${Math.max(4, Math.round(h * 28))}px`, opacity: 0.45 + h * 0.55 }}
        />
      ))}
    </div>
  );
}
/** Extract the first navigable URL from a message. Returns null if none found. */
function extractFirstNavUrl(
  text: string,
  resolveLesson: (courseTitle: string, lessonTitle: string) => string | null
): string | null {
  // Check lesson tags first
  const lessonMatch = /\{\{lesson\|([^|]+)\|([^}]+)\}\}/.exec(text);
  if (lessonMatch) {
    const url = resolveLesson(lessonMatch[1].trim(), lessonMatch[2].trim());
    if (url) return url;
  }
  // Then course tags
  const courseMatch = /\{\{course\|([^|]+)\|([^}]+)\}\}/.exec(text);
  if (courseMatch) {
    const slug = courseMatch[1].trim();
    if (slug) return `/app/course/?slug=${slug}`;
  }
  return null;
}
const MUTE_KEY = "ai-assistant-muted";
/**
 * The voice characters' portraits (public/voices/<key>.svg) are hidden for now:
 * the picker lists each voice by name, language and accent, and the chat shows
 * the robot from the corner launcher. Set to true to show them in the picker again.
 */
const SHOW_VOICE_PORTRAITS = false;

/** The assistant's robot (styled as .ai-bot in globals.css), as on the corner launcher. */
function RobotFace({ scale }: { scale?: number }) {
  return (
    <span className="ai-bot" aria-hidden="true" style={scale ? { scale: String(scale) } : undefined}>
      <span className="head">
        <span className="face">
          <span className="eyes" />
          <span className="mouth" />
        </span>
      </span>
    </span>
  );
}

/** The robot in a small circle: the assistant's picture in the chat header and beside its replies. */
function RobotAvatar({ size, speaking, className }: { size: 28 | 36; speaking?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 ring-1 ring-primary/20",
        speaking && "ring-2 ring-primary/50",
        className
      )}
      style={{ width: size, height: size }}
    >
      <RobotFace scale={size === 36 ? 0.95 : 0.72} />
    </span>
  );
}
/** "Hey Requisor" is switched on per device (it uses this device's microphone). */
const WAKE_WORD_KEY = "requisor-wake-word";
/** Reply text as it should be read out: no markdown symbols or {{ }} tag syntax. */
function plainForAnnouncement(text: string): string {
  return text
    // {{lesson|Course|Lesson Title}} / {{course|slug|Title}}: read just the title.
    .replace(/\{\{[^}]*\|([^|}]*)\}\}/g, "$1")
    .replace(/\{\{([^}]*)\}\}/g, "$1")
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
/** A short, soft two-note chime so someone who can't see the screen knows it heard them. */
function playChime() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch { /* no audio: the screen-reader announcement still happens */ }
}
const COURSE_DRAFT_KEY = "requisor-ai-course-draft";
const COURSE_DRAFT_EVENT = "requisor:open-ai-course-draft";
export function AiAssistant() {
  const { state, hydrated } = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const isTutorMode = state.user?.role === "tutor" || state.user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [retryText, setRetryText] = useState<string | null>(null);
  const [courseDraft, setCourseDraft] = useState<Course | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [courseInterviewStep, setCourseInterviewStep] = useState<number | null>(null);
  const [courseInterviewAnswers, setCourseInterviewAnswers] = useState<string[]>([]);
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [hintVisible, setHintVisible] = useState(false);

  // Introduce the assistant once per browser session with a short-lived
  // hint, so it never sits on top of page content.
  useEffect(() => {
    const KEY = "requisor-assistant-hint-shown";
    try {
      if (sessionStorage.getItem(KEY)) return;
    } catch {
      // Storage blocked: still show the hint once for this page view.
    }
    // Mark it shown only when it actually appears, so an effect that is
    // cancelled before then (e.g. React's dev double-run) doesn't skip it.
    const show = setTimeout(() => {
      try { sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ }
      setHintVisible(true);
    }, 1200);
    const hide = setTimeout(() => setHintVisible(false), 7200);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);
  const [assistantPersona, setAssistantPersona] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Typewriter reveal
  const fullTextRef = useRef("");
  // Raw streamed text including action frames; fullTextRef holds the visible part.
  const rawTextRef = useRef("");
  const replyActionsRef = useRef<AssistantAction[]>([]);
  const [actionOutcomes, setActionOutcomes] = useState<Record<string, ActionOutcome>>({});
  const revealedRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const draftAbortRef = useRef<AbortController | null>(null);
  const draftRequestIdRef = useRef(0);
  const interviewSubmittingRef = useRef(false);
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const networkDoneRef = useRef(false);
  const pauseUntilRef = useRef(0);
  // Track whether we've already navigated for the current AI reply.
  const didNavigateRef = useRef(false);
  const requestStartedAtRef = useRef(0);
  const requestFailedRef = useRef(false);
  const quickPrompts = isTutorMode ? TUTOR_QUICK_PROMPTS : LEARNER_QUICK_PROMPTS;
  const initials = (state.user?.name ?? "U").slice(0, 1).toUpperCase();
  const voice = useVoice();
  const speech = useApprovedSpeech(state.user?.id != null ? String(state.user.id) : null);
  const voiceCharacter = speech.voices.find((item) => item.key === speech.selectedVoiceKey && item.enabled);
  const waveBars = useMicWaveform(voice.isListening);
  const avatarState = speech.isSpeaking ? "speaking" : voice.isListening ? "listening" : "idle";

  // ── Accessibility: screen readers, keyboard, hands-free and "Hey Requisor" ──
  // Device setting "reduce motion": replies appear at once instead of typing out.
  const { prefs: a11y } = useAccessibility();
  // Replies appear at once (no typing effect) for less motion and for screen readers.
  const reduceMotion = useReducedMotion() === true || a11y.reduceMotion || a11y.screenReader;
  const launcherRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // A polite live region: screen readers read what's put here, nobody else notices.
  const [announcement, setAnnouncement] = useState("");
  const announce = useCallback((text: string) => {
    setAnnouncement("");
    // A fresh value each time, so repeating the same words is still read out.
    setTimeout(() => setAnnouncement(text), 60);
  }, []);
  /** Speaks a status line when voice is on, and always tells screen readers. */
  const voiceOnRef = useRef(false);
  voiceOnRef.current = speech.canSpeak;
  const speakRef = useRef(speech.speak);
  speakRef.current = speech.speak;
  const sayStatus = useCallback((text: string) => {
    announce(text);
    if (voiceOnRef.current) speakRef.current(text);
  }, [announce]);
  // Hands-free: after each spoken reply, listen again; "stop" ends it.
  const [handsFree, setHandsFree] = useState(false);
  const handsFreeRef = useRef(false);
  handsFreeRef.current = handsFree;
  // The confirmation card still waiting for an answer, so a spoken "yes"/"no" can answer it.
  const pendingAction = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "user") return null;
      if (m.actions?.length) return m.actions.find((a) => !actionOutcomes[a.id]) ?? null;
    }
    return null;
  }, [messages, actionOutcomes]);
  const pendingActionRef = useRef(pendingAction);
  pendingActionRef.current = pendingAction;
  const [voiceAnswer, setVoiceAnswer] = useState<{ actionId: string; nonce: number; answer: "yes" | "no" } | null>(null);
  // Read out (or announce) a new card once the reply before it has finished speaking.
  const cardToPromptRef = useRef<string | null>(null);
  const promptedCardsRef = useRef(new Set<string>());
  // "Hey Requisor", opt-in on this device.
  const [wakeEnabled, setWakeEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem(WAKE_WORD_KEY) === "on"; } catch { return false; }
  });
  const [wakeState, setWakeState] = useState<WakeState | "off" | "unavailable">("off");
  const [showA11yPanel, setShowA11yPanel] = useState(false);
  const lastAssistantText = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant" && m.content.trim())?.content ?? "",
    [messages]
  );
  // Load persisted preferences and also react immediately when Settings or
  // onboarding changes them while this shared assistant remains mounted.
  useEffect(() => {
    if (!hydrated || !state.user) return;
    function applyPreferences(data: {
      assistantPersona?: string;
    }) {
      if (data.assistantPersona !== undefined) setAssistantPersona(data.assistantPersona);
    }
    function handlePreferenceUpdate(event: Event) {
      applyPreferences((event as CustomEvent<{
        assistantPersona?: string;
      }>).detail ?? {});
    }
    window.addEventListener(AI_GUIDE_PREFERENCES_UPDATED, handlePreferenceUpdate);
    fetch("/api/profile")
      .then((r) => r.json())
      .then(applyPreferences)
      .catch(() => {});
    return () => {
      window.removeEventListener(AI_GUIDE_PREFERENCES_UPDATED, handlePreferenceUpdate);
    };
  }, [hydrated, state.user]);
  // When a transcript arrives from STT, put it in the input box so the user
  // can see what was heard before it's sent.
  useEffect(() => {
    if (voice.transcript) {
      setInput(voice.transcript);
    }
  }, [voice.transcript]);
  // Auto-send as soon as the user stops speaking — no tap required.
  // We keep a stable ref to `send` so the effect closure never goes stale.
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });
  // The transcript arrives a moment after the recording ends; each new one is sent once.
  const sentSpokenRef = useRef("");
  useEffect(() => {
    const spoken = voice.transcript.trim();
    if (!spoken) { sentSpokenRef.current = ""; return; }
    if (spoken === sentSpokenRef.current) return;
    sentSpokenRef.current = spoken;
    // "Stop" ends hands-free mode rather than being sent.
    if (handsFreeRef.current && isStopCommand(spoken)) {
      setInput("");
      stopHandsFreeRef.current("Hands-free is off.");
      return;
    }
    // A short "yes"/"no" answers the confirmation card that's waiting, instead of being sent.
    const card = pendingActionRef.current;
    const answer = card ? classifySpokenAnswer(spoken) : null;
    if (card && answer) {
      setInput("");
      setVoiceAnswer({ actionId: card.id, nonce: Date.now(), answer });
      return;
    }
    // A plain "stop" / "be quiet" isn't a question for the assistant.
    if (isStopUtterance(spoken)) {
      setInput("");
      stopTalkingRef.current();
      announce("Stopped.");
      return;
    }
    sendRef.current(spoken);
  }, [voice.transcript]);
  // Cuts the assistant off mid-reply (spoken "stop", Alt+Shift+S): the voice
  // stops and the rest of the reply appears as text at once.
  const stopTalkingRef = useRef(() => {});
  stopTalkingRef.current = () => {
    stopResponse();
  };
  // ── Hands-free mode ──────────────────────────────────────────────────────
  const { startListening } = voice;
  const stopHandsFreeRef = useRef((message?: string) => {
    setHandsFree(false);
    if (message) sayStatus(message);
  });
  stopHandsFreeRef.current = (message?: string) => {
    setHandsFree(false);
    voice.cancelListening();
    if (message) sayStatus(message);
  };
  function toggleHandsFree() {
    if (!voice.sttSupported) {
      announce("Hands-free needs voice input, which isn't set up on this site.");
      return;
    }
    if (handsFreeRef.current) { stopHandsFreeRef.current("Hands-free is off."); return; }
    setHandsFree(true);
    if (!open) openPanel();
    sayStatus("Hands-free is on. I'll listen after each reply. Say stop while I'm talking to cut me off, or say stop when I'm listening to end hands-free.");
  }
  // After each reply (and its voice) finishes, listen again — unless a card is being read out.
  useEffect(() => {
    if (!handsFree || !open || streaming || speech.isSpeaking || speech.loading || voice.isListening || voice.isTranscribing || cardToPromptRef.current) return;
    const timer = setTimeout(() => { if (handsFreeRef.current) startListening(); }, 500);
    return () => clearTimeout(timer);
  }, [handsFree, open, streaming, speech.isSpeaking, speech.loading, voice.isListening, voice.isTranscribing, startListening, messages]);
  // Nothing heard (or a mic problem): pause hands-free instead of looping.
  useEffect(() => {
    if (handsFree && voice.listenError) stopHandsFreeRef.current(`Hands-free paused. ${voice.listenError}`);
    else if (voice.listenError) announce(voice.listenError);
  }, [voice.listenError, handsFree, announce]);
  // Tell screen readers when voice input starts and is being sent.
  useEffect(() => { if (voice.isListening) announce("Listening."); }, [voice.isListening, announce]);

  // A new confirmation card: queue its question to be read out once the reply has been spoken.
  useEffect(() => {
    if (!pendingAction || streaming || promptedCardsRef.current.has(pendingAction.id)) return;
    promptedCardsRef.current.add(pendingAction.id);
    cardToPromptRef.current = cardPrompt(pendingAction);
  }, [pendingAction, streaming]);
  useEffect(() => {
    const prompt = cardToPromptRef.current;
    if (!prompt || streaming || speech.isSpeaking || speech.loading) return;
    cardToPromptRef.current = null;
    sayStatus(prompt);
  }, [pendingAction, streaming, speech.isSpeaking, speech.loading, sayStatus]);

  // ── Keyboard shortcuts (Alt+Shift, matched by key position so they work on any layout) ──
  const shortcutRef = useRef<(code: string) => void>(() => {});
  shortcutRef.current = (code: string) => {
    if (code === "KeyA") {
      if (open) closePanel(); else openPanel();
    } else if (code === "KeyV") {
      if (!voice.sttSupported) { announce("Voice input isn't set up on this site."); return; }
      if (!open) openPanel();
      if (voice.isListening) voice.stopListening(); else { speech.stop(); voice.startListening(); }
    } else if (code === "KeyH") {
      toggleHandsFree();
    } else if (code === "KeyS") {
      const wasActive = speech.isSpeaking || speech.loading || voice.isListening || streaming || handsFreeRef.current;
      stopTalkingRef.current();
      voice.cancelListening();
      if (handsFreeRef.current) stopHandsFreeRef.current("Stopped. Hands-free is off.");
      else announce(wasActive ? "Stopped." : "Nothing to stop.");
    } else if (code === "KeyR") {
      const text = plainForAnnouncement(lastAssistantText);
      if (!text) { announce("There's no reply to read yet."); return; }
      if (speech.canSpeak) void speech.speak(text); else announce(text);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
      if (!["KeyA", "KeyV", "KeyH", "KeyS", "KeyR"].includes(e.code)) return;
      e.preventDefault();
      shortcutRef.current(e.code);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── "Hey Requisor" wake word (on-device, opt-in) ─────────────────────────
  const wakeRef = useRef<WakeWordListener | null>(null);
  const wakeEnabledRef = useRef(wakeEnabled);
  wakeEnabledRef.current = wakeEnabled;
  const onWakeRef = useRef<() => void>(() => {});
  onWakeRef.current = () => {
    playChime();
    if (!open) openPanel();
    speech.stop();
    announce("Yes? I'm listening.");
    setTimeout(() => voice.startListening(), 350);
  };
  function setWakeWord(on: boolean) {
    setWakeEnabled(on);
    try { localStorage.setItem(WAKE_WORD_KEY, on ? "on" : "off"); } catch { /* private window */ }
    announce(on ? "Hey Requisor is on. Starting the on-device listener." : "Hey Requisor is off. The microphone is released.");
  }
  // "Use my voice" in onboarding or Settings turns "Hey Requisor" on or off. On
  // another device it starts on too, unless it was switched off there.
  const setWakeWordRef = useRef(setWakeWord);
  setWakeWordRef.current = setWakeWord;
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const prefs = (e as CustomEvent<AccessibilityPrefs>).detail;
      if (prefs && prefs.voiceControl !== wakeEnabledRef.current) setWakeWordRef.current(prefs.voiceControl);
    };
    window.addEventListener(ACCESSIBILITY_UPDATED, onUpdated);
    return () => window.removeEventListener(ACCESSIBILITY_UPDATED, onUpdated);
  }, []);
  useEffect(() => {
    let choice: string | null = null;
    try { choice = localStorage.getItem(WAKE_WORD_KEY); } catch { /* private window */ }
    if (a11y.voiceControl && choice === null) setWakeWordRef.current(true);
  }, [a11y.voiceControl]);
  // The same on-device listener also hears "stop" while the assistant talks
  // (the normal voice input is off then), so it runs for hands-free too.
  const onStopRef = useRef<() => void>(() => {});
  onStopRef.current = () => {
    if (!speech.isSpeaking && !speech.loading && !(streaming && voiceOnRef.current)) return;
    stopTalkingRef.current();
    announce("Stopped.");
  };
  const listenerWanted = (wakeEnabled || handsFree) && voice.sttSupported;
  useEffect(() => {
    if (!listenerWanted) { setWakeState("off"); return; }
    let cancelled = false;
    let listener: WakeWordListener | null = null;
    const begin = async () => {
      if (!(await wakeWordAvailable())) { if (!cancelled) setWakeState("unavailable"); return; }
      try {
        listener = await startWakeWord({
          onWake: () => onWakeRef.current(),
          onStop: () => onStopRef.current(),
          onState: (s, detail) => {
            if (cancelled) return;
            setWakeState(s);
            if (s === "error" && wakeEnabledRef.current) announce(`Hey Requisor couldn't start${detail && /denied|NotAllowed/i.test(detail) ? ": the microphone was blocked" : ""}.`);
          },
        });
        if (cancelled) { listener.stop(); return; }
        wakeRef.current = listener;
      } catch { /* state already set to error */ }
    };
    void begin();
    return () => { cancelled = true; listener?.stop(); wakeRef.current = null; };
  }, [listenerWanted, announce]);
  // Don't listen for the wake word while recording, speaking or in a hidden tab.
  const [tabHidden, setTabHidden] = useState(false);
  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    const listener = wakeRef.current;
    if (!listener) return;
    const talking = speech.isSpeaking || speech.loading || (streaming && speech.canSpeak);
    const recording = voice.isListening || voice.isTranscribing;
    listener.setMode({
      wake: wakeEnabled && !handsFree && !tabHidden && !talking && !recording,
      stop: !tabHidden && talking && !recording,
    });
  }, [tabHidden, voice.isListening, speech.isSpeaking, speech.loading, voice.isTranscribing, speech.canSpeak, streaming, handsFree, wakeEnabled, wakeState]);

  const resolveLesson = useMemo(
    () => (courseTitle: string, lessonTitle: string) => {
      const course = state.courses.find((c) => c.title.toLowerCase() === courseTitle.toLowerCase());
      const lesson = course?.lessons.find((l) => l.title.toLowerCase() === lessonTitle.toLowerCase());
      return course && lesson ? `/app/learn/?course=${course.slug}&lesson=${lesson.id}` : null;
    },
    [state.courses]
  );
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming, draftLoading, courseDraft, draftError]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.target instanceof HTMLSelectElement) return;
      if (e.target instanceof Element && e.target.closest('[data-chatbot-voice-dropdown][data-open="true"]')) return;
      closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    speech.stop();
  }, [pathname, searchKey]);
  useEffect(() => () => {
    requestAbortRef.current?.abort();
    draftAbortRef.current?.abort();
    void streamReaderRef.current?.cancel("component_unmount").catch(() => undefined);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    speech.stop();
  }, []);
  // Auto-grow the composer textarea up to ~4 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);
  // Once hydrated, check for a rule-based nudge (stalled course).
  useEffect(() => {
    if (!hydrated || !state.user || isTutorMode) {
      setNudge(null);
      return;
    }
    setNudge(getNudge(state));
  }, [hydrated, isTutorMode, state]);
  function toggleMute() {
    const next = !speech.muted;
    speech.setMuted(next);
    if (next) speech.stop();
  }
  function cancelActiveRequest() {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    void streamReaderRef.current?.cancel("user_cancelled").catch(() => undefined);
    streamReaderRef.current = null;
    networkDoneRef.current = true;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setStreaming(false);
  }
  /** Cuts the reply short: stops the writing and the voice, and keeps what is on screen. */
  function stopResponse() {
    const wasWriting = streaming;
    cancelActiveRequest();
    speech.stop();
    if (!wasWriting) return;
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role !== "assistant") return prev;
      updated[updated.length - 1] = { ...last, content: last.content.trim() || "Stopped before answering.", stopped: true };
      return updated;
    });
  }
  /** Records a thumbs up or down on a reply. Choosing the same one again takes it back. */
  function rateReply(index: number, rating: "up" | "down") {
    const message = messages[index];
    if (!message || message.role !== "assistant" || !message.content.trim()) return;
    const next = message.feedback === rating ? null : rating;
    const feedbackId = message.feedbackId ?? crypto.randomUUID();
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, feedback: next ?? undefined, feedbackId } : m)));
    const question = [...messages.slice(0, index)].reverse().find((m) => m.role === "user")?.content ?? "";
    trackEvent("ai_reply_rated", { mode: isTutorMode ? "tutor" : "learner", rating: next ?? "cleared" });
    void fetch("/api/chat/feedback/", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: feedbackId, rating: next, reply: message.content, question, mode: isTutorMode ? "tutor" : "learner" }),
    }).catch(() => { /* a lost rating is not worth interrupting the chat for */ });
  }
  function closePanel() {
    cancelActiveRequest();
    voice.cancelListening();
    speech.stop();
    setOpen(false);
    setHandsFree(false);
    setShowA11yPanel(false);
    // Keyboard and screen-reader users land back on the button that opened it.
    setTimeout(() => launcherRef.current?.focus(), 0);
  }
  function startRevealLoop() {
    // "Reduce motion": no typing-out effect, the reply appears as it arrives.
    const BASE_CPS = reduceMotion ? Number.POSITIVE_INFINITY : 60;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const target = fullTextRef.current.length;
      if (revealedRef.current < target && now >= pauseUntilRef.current) {
        const jitter = 0.75 + Math.sin(now / 137) * 0.25 + Math.random() * 0.15;
        revealedRef.current = Math.min(target, revealedRef.current + BASE_CPS * jitter * dt);
        let count = Math.floor(revealedRef.current);
        while (count > 0 && endsInOpenTag(fullTextRef.current.slice(0, count))) count--;
        const lastChar = fullTextRef.current[count - 1];
        if (lastChar && ".!?\n".includes(lastChar) && count === Math.floor(revealedRef.current)) {
          pauseUntilRef.current = now + 110;
        }
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], role: "assistant", content: fullTextRef.current.slice(0, count) };
          return updated;
        });
      }
      const done = revealedRef.current >= target && networkDoneRef.current;
      if (!done) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setStreaming(false);
        speech.stop();
        const finalText = fullTextRef.current;
        if (!requestFailedRef.current && finalText.trim()) void speech.speak(finalText);
        // Screen readers hear the finished reply once (not word by word) — unless it's being spoken aloud.
        if (!speech.canSpeak && finalText.trim()) announce(plainForAnnouncement(finalText));
        trackEvent("ai_response_completed", {
          mode: isTutorMode ? "tutor" : "learner",
          response_length: finalText.length,
          duration_ms: Math.max(0, Math.round(performance.now() - requestStartedAtRef.current)),
          success: !requestFailedRef.current,
        });
        // Auto-navigate to the first course/lesson tag in the reply
        if (!isTutorMode && !speech.canSpeak && !didNavigateRef.current && replyActionsRef.current.length === 0) {
          didNavigateRef.current = true;
          const navUrl = extractFirstNavUrl(finalText, resolveLesson);
          if (navUrl) {
            // Small delay so the user sees the reply before being redirected
            setTimeout(() => router.push(navUrl), 1200);
          }
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }
  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming || interviewSubmittingRef.current) return;
    speech.stop();
    if (courseInterviewStep !== null && courseInterviewStep < COURSE_INTERVIEW_QUESTIONS.length) {
      interviewSubmittingRef.current = true;
      if (courseInterviewStep === COURSE_INTERVIEW_QUESTIONS.length - 2) {
        const format = trimmed.toLowerCase();
        if (!format.includes("reading") && !format.includes("video") && !format.includes("mix") && !format.includes("both")) {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: trimmed },
            { role: "assistant", content: "Please choose reading, video, or a mix of both." },
          ]);
          setInput("");
          interviewSubmittingRef.current = false;
          return;
        }
      }
      if (courseInterviewStep === COURSE_INTERVIEW_QUESTIONS.length - 1) {
        const lessonCount = parseCourseLessonCount(trimmed);
        if (lessonCount === null) {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: trimmed },
            { role: "assistant", content: "Please choose a lesson count between 3 and 12." },
          ]);
          setInput("");
          interviewSubmittingRef.current = false;
          return;
        }
      }
      setInput("");
      setDraftError(null);
      const answers = [...courseInterviewAnswers, trimmed];
      const answeredMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
      setCourseInterviewAnswers(answers);
      const nextStep = courseInterviewStep + 1;
      if (nextStep < COURSE_INTERVIEW_QUESTIONS.length) {
        const question = COURSE_INTERVIEW_QUESTIONS[nextStep];
        setCourseInterviewStep(nextStep);
        setMessages([...answeredMessages, { role: "assistant", content: question }]);
        void speech.speak(question);
      } else {
        const summary = `Thanks — I have everything I need:\n\n• Topic: ${answers[0]}\n• Audience: ${answers[1]}\n• Level: ${answers[2]}\n• Outcomes: ${answers[3]}\n• Lesson format: ${answers[4]}\n• Lessons: ${answers[5]}\n\nI’m creating your editable, unpublished course draft now.`;
        const completedMessages = [...answeredMessages, { role: "assistant" as const, content: summary }];
        setCourseInterviewStep(COURSE_INTERVIEW_QUESTIONS.length);
        setMessages(completedMessages);
        void speech.speak(summary);
        await generateCourseDraft(answers);
      }
      interviewSubmittingRef.current = false;
      return;
    }
    // Stop any ongoing speech before sending
    speech.stop();
    setRetryText(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    fullTextRef.current = "";
    rawTextRef.current = "";
    replyActionsRef.current = [];
    revealedRef.current = 0;
    networkDoneRef.current = false;
    pauseUntilRef.current = 0;
    didNavigateRef.current = false;
    requestStartedAtRef.current = performance.now();
    requestFailedRef.current = false;
    trackEvent("ai_message_sent", {
      mode: isTutorMode ? "tutor" : "learner",
      message_length: trimmed.length,
    });
    startRevealLoop();
    const requestController = new AbortController();
    requestAbortRef.current = requestController;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: requestController.signal,
        body: JSON.stringify({
          // On a lesson page, tell the assistant which lesson is open.
          // Sent even while muted: the assistant still goes by this character's name.
          // A browser voice (no ElevenLabs): its language, so a Spanish voice gets a Spanish reply, not English in an accent.
          // What is in the Program Builder, so the assistant can pick up where the tutor left it.
          ...(isTutorMode && programDraftSummary(state.user?.email) ? { programBuilder: programDraftSummary(state.user?.email) } : {}),
          ...(window.location.pathname.startsWith("/app/learn") ? { viewingLessonId: new URLSearchParams(window.location.search).get("lesson") ?? undefined } : {}),
          messages: next.map((m) => ({
            role: m.role,
            content: m.actions?.length
              ? [m.content, ...m.actions.map((a) => describeOutcome(a, actionOutcomes[a.id]))].filter(Boolean).join("\n")
              : m.content,
          })),
        }),
      });
      if (!res.body) throw new Error("No response body");
      if (!res.ok) setRetryText(trimmed);
      const reader = res.body.getReader();
      streamReaderRef.current = reader;
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        rawTextRef.current += decoder.decode(value, { stream: true });
        const split = splitActionFrames(rawTextRef.current);
        fullTextRef.current = split.text;
        if (split.actions.length !== replyActionsRef.current.length) {
          replyActionsRef.current = split.actions;
          const actions = split.actions;
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "assistant") updated[updated.length - 1] = { ...last, actions };
            return updated;
          });
        }
      }
    } catch (error) {
      if (requestController.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }
      requestFailedRef.current = true;
      fullTextRef.current += "Sorry, something went wrong reaching the AI assistant.";
      setRetryText(trimmed);
    } finally {
      if (requestAbortRef.current === requestController) {
        requestAbortRef.current = null;
        streamReaderRef.current = null;
        networkDoneRef.current = true;
      }
    }
  }
  function openPanel() {
    setOpen(true);
    // Start typing straight away (and put screen readers inside the dialog).
    setTimeout(() => textareaRef.current?.focus(), 80);
    if (!isTutorMode && nudge && messages.length === 0) {
      setMessages([{ role: "assistant", content: nudge.message }]);
      markNudgeSeen(nudge.id);
      setNudge(null);
    }
  }
  function newChat() {
    cancelActiveRequest();
    cancelDraftGeneration();
    voice.cancelListening();
    speech.stop();
    setMessages([]);
    setActionOutcomes({});
    setRetryText(null);
    setCourseDraft(null);
    setDraftError(null);
    setCourseInterviewStep(null);
    setCourseInterviewAnswers([]);
  }
  function startCourseInterview() {
    if (!isTutorMode || draftLoading || streaming) return;
    cancelActiveRequest();
    cancelDraftGeneration();
    interviewSubmittingRef.current = false;
    voice.cancelListening();
    speech.stop();
    setCourseDraft(null);
    setDraftError(null);
    setCourseInterviewAnswers([]);
    setCourseInterviewStep(0);
    setMessages([{ role: "assistant", content: COURSE_INTERVIEW_QUESTIONS[0] }]);
    void speech.speak(COURSE_INTERVIEW_QUESTIONS[0]);
    setInput("");
    textareaRef.current?.focus();
  }
  function cancelDraftGeneration() {
    draftRequestIdRef.current += 1;
    draftAbortRef.current?.abort();
    draftAbortRef.current = null;
    setDraftLoading(false);
  }
  async function generateCourseDraft(answers: string[]) {
    if (!isTutorMode || draftLoading || streaming) return;
    if (answers.length !== COURSE_INTERVIEW_QUESTIONS.length) return;
    const lessonCount = Number(answers[5].match(/\d+/)?.[0]);
    if (!Number.isInteger(lessonCount) || lessonCount < 3 || lessonCount > 12) return;
    const formatAnswer = answers[4].toLowerCase();
    const lessonFormat =
      formatAnswer.includes("mix") || formatAnswer.includes("both")
        ? "mixed"
        : formatAnswer.includes("video")
          ? "video"
          : formatAnswer.includes("reading")
            ? "reading"
            : null;
    if (!lessonFormat) return;
    const requestId = draftRequestIdRef.current + 1;
    draftRequestIdRef.current = requestId;
    const controller = new AbortController();
    draftAbortRef.current = controller;
    setDraftLoading(true);
    setDraftError(null);
    try {
      const response = await fetch("/api/tutor/course-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          courseBrief: {
            topic: answers[0],
            audience: answers[1],
            level: answers[2],
            outcomes: answers[3],
            lessonFormat,
            lessonCount,
          },
        }),
      });
      const data = await response.json().catch(() => ({})) as { course?: Course; error?: string };
      if (!response.ok || !data.course) throw new Error(data.error ?? "Unable to generate a course draft.");
      if (draftRequestIdRef.current !== requestId) return;
      setCourseDraft(data.course);
      trackEvent("ai_course_draft_generated", { lesson_count: data.course.lessons.length });
    } catch (error) {
      if (controller.signal.aborted || draftRequestIdRef.current !== requestId) return;
      setDraftError(error instanceof Error ? error.message : "Unable to generate a course draft.");
    } finally {
      if (draftRequestIdRef.current === requestId) {
        draftAbortRef.current = null;
        setDraftLoading(false);
      }
    }
  }
  function openCourseDraft() {
    if (!courseDraft) return;
    try {
      sessionStorage.setItem(COURSE_DRAFT_KEY, JSON.stringify(courseDraft));
    } catch {
      setDraftError("Your browser could not transfer the draft. Keep this chat open and try again.");
      return;
    }
    window.dispatchEvent(new CustomEvent(COURSE_DRAFT_EVENT, { detail: courseDraft }));
    closePanel();
    router.push(state.user?.role === "admin" ? "/app/admin/?aiCourseDraft=1" : "/app/tutor/?aiCourseDraft=1");
  }
  /** Keeps Tab and Shift+Tab inside the open assistant (it's a modal dialog). */
  function trapFocus(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((el) => el.offsetParent !== null && !(el as HTMLButtonElement).disabled);
    if (!focusable.length) return;
    // Focus the first element (from one end) that actually takes focus.
    const focusFrom = (list: HTMLElement[]) => { for (const el of list) { el.focus(); if (document.activeElement === el) return; } };
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); focusFrom([...focusable].reverse()); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); focusFrom(focusable); }
  }
  function handleMicClick() {
    if (voice.isListening) {
      voice.stopListening();
    } else {
      speech.stop();
      voice.startListening();
    }
  }
  return (
    <>
      {/* Screen readers read what's put here (replies, card questions, voice status). Always mounted so
          announcements also work while the panel opens. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>
      {/* Floating trigger */}
      <div
        className="fixed bottom-4 right-4 z-40 flex h-16 w-16 items-center justify-center"
        onMouseEnter={() => setHintVisible(true)}
        onMouseLeave={() => setHintVisible(false)}
        onFocus={() => setHintVisible(true)}
        onBlur={() => setHintVisible(false)}
      >
        {/* Speech bubble — shown briefly once per session, then only on
            hover/focus, and never catches clicks meant for page content. */}
        <AnimatePresence>
          {!open && hintVisible && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-none absolute bottom-full right-0 mb-1.5 w-40 rounded-xl rounded-br-sm bg-gray-200/95 px-2.5 py-1.5 shadow-soft"
            >
              <p className="text-[10px] font-medium leading-snug text-zinc-700">
                {isTutorMode
                  ? "Tell me your course topic and I’ll help shape the learning experience."
                  : "I’ll recommend courses using your background and progress."}
              </p>
              {/* Tail */}
              <span className="absolute -bottom-1.5 right-4 h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-gray-200" />
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          ref={launcherRef}
          onClick={() => (open ? closePanel() : openPanel())}
          aria-label={open ? "Close AI assistant" : "Open AI assistant"}
          aria-keyshortcuts="Alt+Shift+A"
          aria-expanded={open}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.95 }}
          className="relative z-10 flex h-16 w-16 items-center justify-center"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={open ? "close" : "open"}
              initial={{ rotate: -45, scale: 0.7 }}
              animate={{ rotate: 0, scale: 1 }}
              exit={{ rotate: 45, scale: 0.7 }}
              transition={{ duration: 0.15 }}
              className="flex h-full w-full items-center justify-center rounded-full"
            >
              {open ? (
                <span className="flex h-full w-full items-center justify-center rounded-full bg-white">
                  <X className="h-5 w-5 text-zinc-700" />
                </span>
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <RobotFace />
                </span>
              )}
            </motion.span>
          </AnimatePresence>
        </motion.button>
        {/* "Hey Requisor" is listening on this device. */}
        {wakeEnabled && wakeState === "listening" && (
          <span className="absolute -left-1 top-0 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-white text-primary shadow ring-1 ring-primary/30" title="Listening for “Hey Requisor”">
            <Ear className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">Listening for Hey Requisor</span>
          </span>
        )}
        {nudge && !open && (
          <span className="absolute right-1 top-1 z-20 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-amber-500 ring-2 ring-white" />
          </span>
        )}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.94, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 16, scale: 0.96, filter: "blur(2px)" }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="assistant-title"
            aria-describedby="assistant-shortcuts-hint"
            onKeyDown={trapFocus}
            className="fixed bottom-20 right-4 z-40 flex h-[34rem] w-[23rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-3xl border border-zinc-100 bg-card shadow-[0_25px_60px_-15px_rgba(15,23,42,0.25)]"
          >
            {/* Header */}
            <div className="relative flex items-center gap-2.5 overflow-hidden bg-gradient-to-r from-primary/[0.07] via-white to-white px-4 py-3.5">
              <motion.div
                className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary via-secondary to-primary"
                animate={{ backgroundPositionX: ["0%", "200%"] }}
                transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                style={{ backgroundSize: "200% 100%" }}
              />
              <div className="relative shrink-0">
                <PersonaAvatar personaId={assistantPersona} size="sm" state={avatarState} className="shadow-glow-sm" />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p id="assistant-title" className="flex items-center gap-1 truncate text-sm font-semibold text-zinc-900">
                  {/* One name for the assistant, whichever voice it speaks in. */}
                  {isTutorMode ? "Requisor Assistant" : ASSISTANT_NAME}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {isTutorMode ? "Design courses, add lessons, grade and publish" : "Guidance, practice assignments, quizzes and grades"}
                </p>
              </div>
              <div className="relative flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={speech.muted ? "Unmute chatbot voice" : "Mute chatbot voice"}
                  aria-pressed={speech.muted}
                  title={speech.muted ? "Unmute chatbot voice" : "Mute chatbot voice"}
                  className="focus-ring rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
                >
                  {speech.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className={cn("h-4 w-4", speech.isSpeaking && "text-primary")} />}
                </button>
                {(speech.isSpeaking || speech.loading) && (
                  <button
                    type="button"
                    onClick={speech.stop}
                    aria-label="Stop voice playback"
                    title="Stop voice playback"
                    className="focus-ring rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                )}
                <ChatbotVoiceSelect
                  voices={speech.voices}
                  selectedVoiceKey={speech.selectedVoiceKey}
                  onSelectVoice={speech.selectVoice}
                />
              </div>
              {messages.length > 0 && (
                <button
                  onClick={newChat}
                  aria-label="Start a new chat"
                  title="New chat"
                  className="focus-ring shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setShowA11yPanel((v) => !v)}
                aria-label="Accessibility and voice options"
                aria-expanded={showA11yPanel}
                aria-controls="assistant-a11y-panel"
                title="Accessibility"
                className={cn("focus-ring shrink-0 rounded-lg p-1.5 transition hover:bg-zinc-100 hover:text-zinc-700", showA11yPanel || handsFree || wakeEnabled ? "text-primary" : "text-zinc-400")}
              >
                <Accessibility className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={closePanel}
                aria-label="Close"
                className="focus-ring shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Messages */}
            {speech.setupMessage && (
              <p role="status" className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                {speech.setupMessage}
              </p>
            )}
            {speech.error && (
              <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-800">
                {speech.error}
              </p>
            )}
            <p id="assistant-shortcuts-hint" className="sr-only">
              Shortcuts: Alt Shift A opens or closes the assistant, Alt Shift V talks, Alt Shift H turns hands-free on or off, Alt Shift S stops me talking or listening, Alt Shift R reads the last reply again.
            </p>
            {showA11yPanel && (
              <AccessibilityPanel
                id="assistant-a11y-panel"
                voiceInput={voice.sttSupported}
                handsFree={handsFree}
                onToggleHandsFree={toggleHandsFree}
                wakeEnabled={wakeEnabled}
                wakeState={wakeState}
                onToggleWake={() => setWakeWord(!wakeEnabled)}
              />
            )}
            {/* Messages: announced through the live region below, so streaming isn't read out word by word. */}
            <div ref={scrollRef} role="log" aria-label="Conversation" aria-live="off" className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {draftError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{draftError}</div>}
              {messages.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="space-y-4">
                  <p className="text-sm font-light text-zinc-600">
                    Hi {state.user?.name?.split(" ")[0] ?? "there"}.{" "}
                    {isTutorMode
                      ? "Ask me to create a course, add or edit a lesson, check submissions, or anything about your courses."
                      : "Ask which course fits your background, or what to learn next based on your progress."}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {quickPrompts.map(({ icon: Icon, label }, i) => (
                      <motion.button
                        key={label}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.05 }}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          if (isTutorMode && label === "Design a course from my topic") startCourseInterview();
                          else void send(label);
                        }}
                        className="focus-ring group flex items-center gap-2.5 rounded-xl border border-border bg-white px-3 py-2.5 text-left text-xs font-medium text-zinc-700 shadow-soft transition-colors hover:border-primary/50 hover:text-primary"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-gradient-to-br group-hover:from-primary group-hover:to-secondary group-hover:text-white">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        {label}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
              {messages.map((m, i) => {
                const isLastAssistant = streaming && m.role === "assistant" && i === messages.length - 1;
                const isUser = m.role === "user";
                const actionCards = m.role === "assistant" && m.actions?.length ? (
                  <div key={`${i}-actions`} className="space-y-2 pl-8">
                    {m.actions.map((action) => (
                      <AssistantActionCard
                        key={action.id}
                        action={action}
                        onOutcome={(outcome) => setActionOutcomes((prev) => ({ ...prev, [action.id]: outcome }))}
                        voiceAnswer={voiceAnswer?.actionId === action.id ? voiceAnswer : undefined}
                        onAnnounce={sayStatus}
                      />
                    ))}
                  </div>
                ) : null;
                // A reply that is only a proposal has no text bubble, just its card(s).
                if (actionCards && !m.content.trim() && !isLastAssistant) return actionCards;
                return [
                  <motion.div
                    key={i}
                    layout="position"
                    initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className={cn("flex items-end gap-2", isUser ? "justify-end" : "justify-start")}
                  >
                    {!isUser && (
                      <PersonaAvatar
                        personaId={assistantPersona}
                        size="xs"
                        state={speech.isSpeaking ? "speaking" : "idle"}
                        className="mb-0.5"
                      />
                    )}
                    <motion.div
                      layout
                      transition={{ layout: { duration: 0.18, ease: "easeOut" } }}
                      className={cn(
                        "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm font-light leading-relaxed",
                        isUser
                          ? "rounded-br-md bg-gradient-to-br from-primary to-secondary text-white shadow-glow-sm"
                          : "rounded-bl-md bg-white text-zinc-800 shadow-soft"
                      )}
                    >
                      {isLastAssistant && !m.content ? (
                        <TypingDots />
                      ) : m.role === "assistant" ? (
                        renderMarkdownLite(
                          m.content,
                          isLastAssistant ? <StreamCursor /> : null,
                          resolveLesson
                        )
                      ) : (
                        m.content
                      )}
                      {m.role === "assistant" && !isLastAssistant && m.content.trim() && (
                        <span className="mt-1.5 flex items-center gap-0.5 border-t border-zinc-100 pt-1.5 text-zinc-400">
                          {m.stopped && <span className="mr-auto text-[11px] font-normal text-zinc-500">Stopped</span>}
                          {/* A reply that was cut short isn't rated: there is no finished answer to judge. */}
                          <span className={cn("flex items-center gap-0.5", m.stopped ? "hidden" : "ml-auto")}>
                            {m.feedback && <span className="mr-1 text-[11px] font-normal text-zinc-500">Thanks for the feedback</span>}
                            <button
                              type="button"
                              onClick={() => rateReply(i, "up")}
                              aria-label="Good response"
                              aria-pressed={m.feedback === "up"}
                              title="Good response"
                              className={cn("focus-ring rounded-md p-1 transition hover:bg-zinc-100 hover:text-zinc-700", m.feedback === "up" && "bg-emerald-50 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-600")}
                            >
                              <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => rateReply(i, "down")}
                              aria-label="Bad response"
                              aria-pressed={m.feedback === "down"}
                              title="Bad response"
                              className={cn("focus-ring rounded-md p-1 transition hover:bg-zinc-100 hover:text-zinc-700", m.feedback === "down" && "bg-rose-50 text-rose-600 hover:bg-rose-50 hover:text-rose-600")}
                            >
                              <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </span>
                        </span>
                      )}
                    </motion.div>
                    {isUser && (
                      <div className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-700">
                        {initials}
                      </div>
                    )}
                  </motion.div>,
                  actionCards,
                ];
              })}
              {retryText && !streaming && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start pl-8">
                  <button
                    onClick={() => send(retryText)}
                    className="focus-ring flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-soft transition hover:border-primary/60 hover:text-primary"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </button>
                </motion.div>
              )}
              {draftLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  role="status"
                  aria-live="polite"
                  className="flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-900"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Building course draft…
                </motion.div>
              )}
              {courseDraft && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm"
                >
                  <p className="font-semibold text-zinc-900">{courseDraft.title}</p>
                  <p className="mt-1 text-xs text-zinc-600">{courseDraft.lessons.length} lessons · {courseDraft.level} · Unpublished draft</p>
                  <button type="button" onClick={openCourseDraft} className="focus-ring mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white">
                    <BookPlus className="h-3.5 w-3.5" />Review in course editor
                  </button>
                </motion.div>
              )}
            </div>
            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="border-t border-zinc-100 p-3"
            >
              {/* Why voice input gave nothing, when it has a reason. */}
              {voice.listenError && !voice.isListening && !voice.isTranscribing && (
                <p role="alert" className="mb-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">{voice.listenError}</p>
              )}
              <div
                className={cn(
                  "flex items-end gap-1.5 rounded-2xl border p-1.5 pl-3.5 transition",
                  voice.isListening
                    ? "border-primary/40 bg-white ring-2 ring-primary/15"
                    : "border-border bg-zinc-50 focus-within:border-primary/50 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/15"
                )}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {voice.isListening ? (
                    <motion.div
                      key="waveform"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="flex min-w-0 flex-1 flex-col gap-1 py-1"
                    >
                      {/* The words heard so far, shown as the user speaks. */}
                      <p aria-live="polite" className={cn("max-h-20 overflow-y-auto text-sm leading-snug", voice.liveTranscript ? "text-zinc-900" : "text-zinc-400")}>
                        {voice.liveTranscript || "Listening… start speaking"}
                      </p>
                      <RecordingWaveform bars={waveBars} />
                    </motion.div>
                  ) : voice.isTranscribing ? (
                    <motion.div
                      key="transcribing"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      role="status"
                      className="flex min-h-9 min-w-0 flex-1 items-center gap-2 py-1 text-sm text-zinc-600"
                    >
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
                      {voice.liveTranscript ? <span className="max-h-20 overflow-y-auto leading-snug">{voice.liveTranscript}</span> : "Writing out what you said…"}
                    </motion.div>
                  ) : (
                    <motion.textarea
                      key="composer"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      ref={textareaRef}
                      rows={1}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      maxLength={2000}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          send(input);
                        }
                      }}
                      placeholder={isTutorMode ? "Ask me to grade, add a lesson, publish…" : "Ask for a next step, an assignment, a quiz…"}
                      disabled={streaming}
                      className="max-h-[120px] flex-1 resize-none bg-transparent py-1.5 text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none disabled:opacity-60"
                    />
                  )}
                </AnimatePresence>
                {/* Mic voice orb — only shown when STT is supported */}
                {voice.sttSupported && (
                  <div className="container-vao-input">
                    {/* Hidden SVG gooey filter for the mic orb */}
                    <svg
                      style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
                      aria-hidden="true"
                    >
                      <defs>
                        <filter id="gooey-mic">
                          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                          <feColorMatrix
                            in="blur"
                            mode="matrix"
                            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
                            result="gooey"
                          />
                          <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
                        </filter>
                      </defs>
                    </svg>
                    <button
                      type="button"
                      onClick={handleMicClick}
                      disabled={streaming || voice.isTranscribing}
                      aria-label={voice.isListening ? "Stop and send" : "Start voice input"}
                      aria-keyshortcuts="Alt+Shift+V"
                      title={voice.isListening ? "Stop and send" : "Start voice input"}
                      className={cn(
                        "orb orb-input focus-ring disabled:opacity-40",
                        voice.isListening && "orb-listening"
                      )}
                    >
                      <div className="icons">
                        {voice.isListening ? (
                          /* Mic-off icon */
                          <svg
                            className="svg"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="1" y1="1" x2="23" y2="23" />
                            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                            <line x1="12" y1="19" x2="12" y2="23" />
                            <line x1="8" y1="23" x2="16" y2="23" />
                          </svg>
                        ) : (
                          /* Mic icon */
                          <svg
                            className="svg"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                            <line x1="12" y1="19" x2="12" y2="23" />
                            <line x1="8" y1="23" x2="16" y2="23" />
                          </svg>
                        )}
                      </div>
                      <div className="ball">
                        <div className="container-lines" />
                        <div className="container-rings" />
                      </div>
                    </button>
                  </div>
                )}
                {(streaming || speech.isSpeaking || speech.loading) ? (
                  <motion.button
                    type="button"
                    onClick={stopResponse}
                    aria-label={streaming ? "Stop the response" : "Stop the voice"}
                    title={streaming ? "Stop the response" : "Stop the voice"}
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.94 }}
                    className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 shadow-sm ring-1 ring-inset ring-rose-200 transition-colors hover:bg-rose-200"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  </motion.button>
                ) : (
                <motion.button
                  type="submit"
                  disabled={streaming || !input.trim()}
                  aria-label="Send message"
                  whileHover={{ scale: streaming || !input.trim() ? 1 : 1.06 }}
                  whileTap={{ scale: streaming || !input.trim() ? 1 : 0.94 }}
                  className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white shadow-sm transition-opacity disabled:opacity-40"
                >
                  {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </motion.button>
                )}
              </div>
              <p className="mt-2 text-center text-[11px] leading-snug text-zinc-500">AI can make mistakes. Check important information.</p>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

    </>
  );
}

/**
 * Hands-free and "Hey Requisor" switches, plus the keyboard shortcuts — so
 * someone who can't see or use a mouse can run the assistant on their own.
 */
function AccessibilityPanel({
  id, voiceInput, handsFree, onToggleHandsFree, wakeEnabled, wakeState, onToggleWake,
}: {
  id: string;
  voiceInput: boolean;
  handsFree: boolean;
  onToggleHandsFree: () => void;
  wakeEnabled: boolean;
  wakeState: WakeState | "off" | "unavailable";
  onToggleWake: () => void;
}) {
  const wakeNote =
    !voiceInput ? "Needs voice input, which isn't set up on this site."
      : wakeState === "loading" ? "Getting ready — the first time downloads about 40 MB, once."
        : wakeState === "listening" ? "Listening on this device. Say “Hey Requisor”."
          : wakeState === "paused" ? "Paused while I'm talking or listening."
            : wakeState === "unavailable" ? "Not installed on this server yet."
              : wakeState === "error" ? "Couldn't start — check the microphone permission."
                : "Uses this device's microphone while the site is open. Recognised on your device; nothing is sent until you say it.";
  const row = "flex items-start justify-between gap-3 rounded-xl border border-zinc-100 bg-white p-2.5";
  return (
    <div id={id} className="space-y-2 border-b border-zinc-100 bg-zinc-50/80 px-4 py-3 text-xs text-zinc-700">
      <div className={row}>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold text-zinc-900"><Headphones className="h-3.5 w-3.5 text-primary" aria-hidden="true" />Hands-free conversation</p>
          <p className="mt-0.5 text-zinc-500">{voiceInput ? "After each reply I listen again. Say “stop” to end." : "Needs voice input, which isn't set up on this site."}</p>
        </div>
        <button type="button" role="switch" aria-checked={handsFree} aria-keyshortcuts="Alt+Shift+H" disabled={!voiceInput} onClick={onToggleHandsFree}
          className={cn("focus-ring relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition disabled:opacity-40", handsFree ? "bg-primary" : "bg-zinc-300")}>
          <span className="sr-only">Hands-free conversation</span>
          <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", handsFree ? "left-[18px]" : "left-0.5")} />
        </button>
      </div>
      <div className={row}>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold text-zinc-900"><Ear className="h-3.5 w-3.5 text-primary" aria-hidden="true" />“Hey Requisor”</p>
          <p className="mt-0.5 text-zinc-500" aria-live="polite">{wakeNote}</p>
        </div>
        <button type="button" role="switch" aria-checked={wakeEnabled} disabled={!voiceInput} onClick={onToggleWake}
          className={cn("focus-ring relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition disabled:opacity-40", wakeEnabled ? "bg-primary" : "bg-zinc-300")}>
          <span className="sr-only">Listen for Hey Requisor</span>
          <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", wakeEnabled ? "left-[18px]" : "left-0.5")} />
        </button>
      </div>
      <div className="rounded-xl border border-zinc-100 bg-white p-2.5">
        <p className="font-semibold text-zinc-900">Keyboard shortcuts</p>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-zinc-600">
          <dt><kbd className="font-mono">Alt+Shift+A</kbd></dt><dd>Open or close the assistant</dd>
          <dt><kbd className="font-mono">Alt+Shift+V</kbd></dt><dd>Talk (press again to send)</dd>
          <dt><kbd className="font-mono">Alt+Shift+H</kbd></dt><dd>Hands-free on or off</dd>
          <dt><kbd className="font-mono">Alt+Shift+S</kbd></dt><dd>Stop talking or listening</dd>
          <dt><kbd className="font-mono">Alt+Shift+R</kbd></dt><dd>Read the last reply again</dd>
          <dt><kbd className="font-mono">Esc</kbd></dt><dd>Close</dd>
        </dl>
        <p className="mt-1.5 text-zinc-500">When I suggest an action, say “yes” to confirm or “no” to cancel. Say “stop” while I'm talking to cut me off.</p>
      </div>
    </div>
  );
}
