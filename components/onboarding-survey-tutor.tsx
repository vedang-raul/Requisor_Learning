import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

type QuestionKey = "expertise" | "qualification" | "experience" | "purpose";

interface Question {
  key: QuestionKey;
  step: string;
  title: string;
  helper: string;
  placeholder: string;
  multiline?: boolean;
}

const QUESTIONS: Question[] = [
  {
    key: "expertise",
    step: "01",
    title: "What subjects do you teach?",
    helper: "Separate multiple subjects with commas.",
    placeholder: "e.g. Calculus, Organic Chemistry, Python",
  },
  {
    key: "qualification",
    step: "02",
    title: "What's your highest qualification?",
    helper: "Degree, institution, and year, if you have it handy.",
    placeholder: "e.g. M.Sc. Mathematics — Stanford University, 2021",
  },
  {
    key: "experience",
    step: "03",
    title: "How much teaching experience do you have?",
    helper: "A rough number is fine.",
    placeholder: "e.g. 5 years, mostly high-school algebra",
  },
  {
    key: "purpose",
    step: "04",
    title: "Why did you choose Requisor?",
    helper: "One or two sentences is plenty.",
    placeholder: "Tell us what brought you here…",
    multiline: true,
  },
];

type Answers = Record<QuestionKey, string>;
const EMPTY_ANSWERS: Answers = { expertise: "", qualification: "", experience: "", purpose: "" };

type Stage = "question" | "review" | "submitting" | "done";
type Direction = "forward" | "back";

export interface TutorSurveyProps {
  onSubmit?: (answers: Answers) => void | Promise<void>;
}

export default function TutorSurvey({ onSubmit }: TutorSurveyProps) {
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>("question");
  const [direction, setDirection] = useState<Direction>("forward");
  const [entering, setEntering] = useState(true);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [drafts, setDrafts] = useState<Answers>(EMPTY_ANSWERS);
  const [shake, setShake] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const question = QUESTIONS[index];
  const total = QUESTIONS.length;
  const progress =
    stage === "review" || stage === "submitting" || stage === "done"
      ? 100
      : ((index + (drafts[question.key].trim() ? 1 : 0.4)) / total) * 100;

  useEffect(() => {
    if (stage !== "question") return;
    setEntering(true);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setEntering(false)));
    const focusTimer = window.setTimeout(() => {
      (question.multiline ? textareaRef.current : inputRef.current)?.focus();
    }, 260);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(focusTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, stage]);

  function setDraft(value: string) {
    setDrafts((d) => ({ ...d, [question.key]: value }));
  }

  function goToQuestion(i: number, dir: Direction) {
    setDirection(dir);
    setIndex(i);
    setStage("question");
  }

  function next() {
    const value = drafts[question.key].trim();
    if (!value) {
      setShake(true);
      window.setTimeout(() => setShake(false), 420);
      return;
    }
    setAnswers((a) => ({ ...a, [question.key]: value }));
    if (index < total - 1) {
      goToQuestion(index + 1, "forward");
    } else {
      setDirection("forward");
      setStage("review");
    }
  }

  function back() {
    if (stage === "review") {
      goToQuestion(total - 1, "back");
      return;
    }
    if (index === 0) return;
    goToQuestion(index - 1, "back");
  }

  function editQuestion(i: number) {
    setDirection("back");
    setIndex(i);
    setStage("question");
  }

  function submit() {
    setStage("submitting");
    setSubmitError("");
    window.setTimeout(async () => {
      try {
        await onSubmit?.(answers);
        setStage("done");
      } catch {
        setSubmitError("We couldn't save your profile. Please try again.");
        setStage("review");
      }
    }, 1100);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      next();
    } else if (e.key === "Escape") {
      back();
    }
  }

  const slideClass = useMemo(() => {
    const base = "transition-all duration-[420ms] ease-[cubic-bezier(.65,0,.35,1)]";
    if (entering) {
      return `${base} opacity-0 ${direction === "forward" ? "translate-y-5" : "-translate-y-5"}`;
    }
    return `${base} opacity-100 translate-y-0`;
  }, [entering, direction]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6] font-[Inter,system-ui,-apple-system,'Segoe_UI',Roboto,sans-serif] text-[#1E2430]">
      <style>{`
        @keyframes ts-shake { 10%,90%{ transform: translateX(-1px);} 20%,80%{ transform: translateX(2px);} 30%,50%,70%{ transform: translateX(-4px);} 40%,60%{ transform: translateX(4px);} }
        .ts-shake { animation: ts-shake .42s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes ts-pop { from{ opacity:0; transform: scale(.9);} to{ opacity:1; transform:none; } }
        .ts-pop { animation: ts-pop .4s cubic-bezier(.34,1.56,.64,1) both; }
        @keyframes ts-draw-circle { to{ stroke-dashoffset:0; } }
        @keyframes ts-draw-check { to{ stroke-dashoffset:0; } }
        .ts-check-circle { stroke-dasharray:76; stroke-dashoffset:76; animation: ts-draw-circle .5s cubic-bezier(.65,0,.35,1) forwards; }
        .ts-check-path { stroke-dasharray:20; stroke-dashoffset:20; animation: ts-draw-check .35s cubic-bezier(.65,0,.35,1) .45s forwards; }
        @keyframes ts-spin { to{ transform: rotate(360deg); } }
        .ts-spinner { animation: ts-spin .7s linear infinite; }
        .ts-underline { background-image: linear-gradient(#23AE97,#23AE97); background-position: 0 100%; background-repeat: no-repeat; background-size: 0% 2px; transition: background-size .3s cubic-bezier(.65,0,.35,1); }
        .ts-underline:focus { background-size: 100% 2px; }
      `}</style>

      {/* progress bar */}
      <div className="h-1 w-full bg-[#E5E7EB]">
        <div
          className="h-full bg-[#23AE97] transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* top bar */}
      <div className="flex items-center justify-between px-6 py-5 sm:px-10">
        <button
          type="button"
          onClick={back}
          disabled={index === 0 && stage === "question"}
          className="flex items-center gap-1.5 text-sm font-semibold text-[#6B7280] transition-colors duration-200 hover:text-[#1E2430] disabled:cursor-not-allowed disabled:opacity-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Back
        </button>
        <div className="flex items-center gap-2 text-sm font-bold text-[#9CA3AF]">
          <span className="text-[#23AE97]">
            {stage === "question" ? question.step : String(total).padStart(2, "0")}
          </span>
          <span className="text-[#D6D9DE]">/</span>
          <span>{String(total).padStart(2, "0")}</span>
        </div>
      </div>

      {/* content */}
      <div className="flex flex-1 items-center justify-center px-6 pb-16 sm:px-10">
        <div className="w-full max-w-[560px]">
          {stage === "question" && (
            <div key={question.key} className={slideClass}>
              <p className="mb-3 text-sm font-bold tracking-wide text-[#23AE97]">
                Question {question.step}
              </p>
              <h1 className="mb-2 text-[28px] font-extrabold leading-tight [text-wrap:balance] sm:text-[34px]">
                {question.title}
              </h1>
              <p className="mb-8 text-[15px] text-[#6B7280]">{question.helper}</p>

              <div className={shake ? "ts-shake" : ""}>
                {question.multiline ? (
                  <textarea
                    ref={textareaRef}
                    value={drafts[question.key]}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={question.placeholder}
                    rows={3}
                    className="ts-underline w-full resize-none border-b-2 border-[#E5E7EB] bg-transparent py-2 text-xl text-[#1E2430] outline-none transition-colors duration-200 placeholder:text-[#9CA3AF] focus:border-[#E5E7EB]"
                  />
                ) : (
                  <input
                    ref={inputRef}
                    type="text"
                    value={drafts[question.key]}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={question.placeholder}
                    className="ts-underline w-full border-b-2 border-[#E5E7EB] bg-transparent py-2 text-xl text-[#1E2430] outline-none transition-colors duration-200 placeholder:text-[#9CA3AF] focus:border-[#E5E7EB]"
                  />
                )}
              </div>

              <div className="mt-8 flex items-center gap-4">
                <button
                  type="button"
                  onClick={next}
                  className="group flex items-center gap-2 rounded-xl bg-[#23AE97] px-6 py-3 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(35,174,151,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#1C9481] hover:shadow-[0_16px_32px_-10px_rgba(35,174,151,0.65)] active:scale-[.98]"
                >
                  {index < total - 1 ? "OK" : "Review"}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.6}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
                <span className="text-[13px] text-[#9CA3AF]">
                  press <kbd className="rounded border border-[#E5E7EB] bg-white px-1.5 py-0.5 font-sans text-[12px] font-semibold text-[#6B7280]">Enter ↵</kbd>
                </span>
              </div>
            </div>
          )}

          {stage === "review" && (
            <div className={slideClass}>
              <p className="mb-3 text-sm font-bold tracking-wide text-[#23AE97]">Almost done</p>
              <h1 className="mb-8 text-[28px] font-extrabold leading-tight [text-wrap:balance] sm:text-[34px]">
                Review your answers
              </h1>
              {submitError && (
                <p role="alert" className="mb-4 rounded-xl bg-red-50 px-3.5 py-2 text-sm text-red-600">
                  {submitError}
                </p>
              )}

              <div className="flex flex-col gap-3">
                {QUESTIONS.map((q, i) => (
                  <button
                    key={q.key}
                    type="button"
                    onClick={() => editQuestion(i)}
                    className="group flex items-start justify-between gap-4 rounded-2xl border border-[#E5E7EB] bg-white px-5 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#CFEEE7] hover:shadow-[0_10px_24px_-14px_rgba(30,36,48,0.25)]"
                  >
                    <div className="min-w-0">
                      <p className="mb-1 text-[12px] font-bold text-[#9CA3AF]">{q.title}</p>
                      <p className="truncate text-[15px] font-semibold text-[#1E2430]">{answers[q.key]}</p>
                    </div>
                    <span className="mt-0.5 flex-shrink-0 text-[13px] font-bold text-[#23AE97] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      Edit
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={submit}
                className="group mt-8 flex items-center gap-2 rounded-xl bg-[#23AE97] px-6 py-3 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(35,174,151,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#1C9481] hover:shadow-[0_16px_32px_-10px_rgba(35,174,151,0.65)] active:scale-[.98]"
              >
                Submit profile
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.6}
                  className="transition-transform duration-200 group-hover:translate-x-1"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          )}

          {stage === "submitting" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="ts-spinner h-8 w-8 rounded-full border-[3px] border-[#CFEEE7] border-t-[#23AE97]" />
              <p className="text-[15px] font-semibold text-[#6B7280]">Saving your profile…</p>
            </div>
          )}

          {stage === "done" && (
            <div className="ts-pop flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E7F6F3]">
                <svg className="h-[30px] w-[30px]" viewBox="0 0 36 36" fill="none">
                  <circle cx="18" cy="18" r="12" className="ts-check-circle stroke-[#23AE97]" strokeWidth="2" />
                  <path d="M12 18l4 4 8-8" className="ts-check-path stroke-[#23AE97]" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h1 className="text-[26px] font-extrabold">Profile complete</h1>
              <p className="max-w-[360px] text-[15px] text-[#6B7280]">
                Thanks — your tutor profile is saved. You're ready to start on Requisor.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}