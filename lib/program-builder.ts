/**
 * Program Builder: turns an employer's training need into a curriculum and a
 * priced proposal. Everything here is plain logic with no network or DOM, so
 * the builder works without AI: the transcript reader, the curriculum engine,
 * the proposal, and the commands the AI assistant uses to drive the builder.
 */
export const INDUSTRIES = [
  { key: "construction", label: "Construction & engineering" },
  { key: "finance", label: "Banking & credit unions" },
  { key: "healthcare", label: "Healthcare" },
  { key: "manufacturing", label: "Manufacturing" },
  { key: "general", label: "General / professional services" },
] as const;
export type Industry = (typeof INDUSTRIES)[number]["key"];

export const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
export type Level = (typeof LEVELS)[number];

export const FORMATS = ["Blended — async + live application labs", "Fully asynchronous", "Live cohort"] as const;
export const MODULE_COUNTS = [3, 4, 5, 6] as const;

export type Discovery = {
  transcript: string;
  employer: string;
  industry: Industry;
  level: Level;
  audience: string;
  topic: string;
  /** One pain or goal per line. */
  pains: string;
  modules: number;
  format: string;
};

export const EMPTY_DISCOVERY: Discovery = {
  transcript: "", employer: "", industry: "construction", level: "Intermediate", audience: "", topic: "", pains: "", modules: 4, format: FORMATS[0],
};

export type ProgramModule = { title: string; description: string; submodules: string[]; activities: string[] };
export type Curriculum = {
  title: string;
  description: string;
  audience: string;
  level: string;
  format: string;
  duration: string;
  outcomes: string[];
  modules: ProgramModule[];
  assessment: string;
  /** Used in the proposal, not shown on the curriculum. */
  needLine: string;
  delivery: string;
};

const DOMAINS: Record<Industry, { artifacts: string[]; workflows: string[]; systems: string }> = {
  construction: {
    artifacts: ["bid packages", "quantity takeoffs", "RFIs and submittals", "site daily logs", "historical estimate data", "subcontractor scopes"],
    workflows: ["estimating and takeoff", "bid/no-bid decisions", "schedule and sequencing", "risk and constructability review"],
    systems: "Procore, Bluebeam, and estimating systems",
  },
  finance: {
    artifacts: ["member service transcripts", "loan files", "call center logs", "policy and compliance documents", "branch performance reports"],
    workflows: ["member service and support", "lending workflows", "fraud and risk review", "reporting and compliance"],
    systems: "core banking and CRM systems",
  },
  healthcare: {
    artifacts: ["de-identified discharge summaries", "scheduling data", "intake forms", "quality and safety reports", "prior-auth documentation"],
    workflows: ["documentation and summarization", "scheduling and throughput", "quality reporting", "patient communication"],
    systems: "EHR and scheduling systems",
  },
  manufacturing: {
    artifacts: ["shift QA reports", "maintenance logs", "work instructions", "supplier scorecards", "downtime records"],
    workflows: ["quality and inspection", "maintenance planning", "production reporting", "supply and inventory"],
    systems: "MES and ERP systems",
  },
  general: {
    artifacts: ["client briefs", "SOPs and playbooks", "meeting notes and proposals", "performance reports"],
    workflows: ["research and analysis", "document drafting and review", "reporting", "client communication"],
    systems: "the organization's core business systems",
  },
};

export function titleCase(text: string): string {
  return text.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1));
}

export function clampModules(n: number): number {
  return Math.min(6, Math.max(3, Number.isFinite(n) ? Math.round(n) : 4));
}

export function parseLevel(text: string): Level | null {
  if (/advanced|expert/i.test(text)) return "Advanced";
  if (/beginner|basic|new to|intro/i.test(text)) return "Beginner";
  if (/intermediate|comfortable|some experience/i.test(text)) return "Intermediate";
  return null;
}

export function detectIndustry(text: string): Industry | null {
  const t = text.toLowerCase();
  if (/construction|contractor|estimat|preconstruction|jobsite|architect/.test(t)) return "construction";
  if (/credit union|bank|member|lending|loan|financ/.test(t)) return "finance";
  if (/patient|clinic|nurse|hospital|health/.test(t)) return "healthcare";
  if (/plant|factory|assembly|production|manufactur/.test(t)) return "manufacturing";
  return null;
}

/** Reads what it can out of a discovery transcript by keyword. Everything it finds stays editable. */
export function analyzeTranscript(transcript: string): Partial<Discovery> {
  const t = transcript.toLowerCase();
  const found: Partial<Discovery> = {};
  found.industry = /construction|contractor|estimat|preconstruction|jobsite/.test(t) ? "construction"
    : /credit union|bank|member|lending|loan/.test(t) ? "finance"
    : /patient|clinic|nurse|hospital|care team/.test(t) ? "healthcare"
    : /plant|factory|assembly|production line|manufactur/.test(t) ? "manufacturing" : "general";

  const audience = /(?:for|train|training)\s+(?:our|the)\s+([a-z ]{3,40}?)(?:\.|,|\s+(?:on|to|who|and)\b)/.exec(t);
  if (audience) found.audience = audience[1].trim();

  // A level the client names outright ("call it intermediate") beats one implied in passing ("new to AI").
  if (/intermediate/.test(t)) found.level = "Intermediate";
  else if (/advanced|expert/.test(t)) found.level = "Advanced";
  else if (/beginner|new to|no experience|basics/.test(t)) found.level = "Beginner";

  const topic = /(?:course|training|program)\s+(?:on|in|about|around)\s+([a-z \-]{4,60}?)(?:\.|,|\s+for\b)/.exec(t);
  if (topic) found.topic = titleCase(topic[1].trim());

  const pains: string[] = [];
  for (const sentence of t.split(/[.\n]/)) {
    const s = sentence.trim();
    if (pains.length < 4 && s.length > 15 && /too long|too slow|manual|error|inconsisten|gut feel|can'?t keep up|missing out|behind|bottleneck|waste|risk/.test(s)) pains.push(s);
  }
  if (pains.length) found.pains = pains.join("\n");
  return found;
}

export const SAMPLE_TRANSCRIPT = `Discovery call — regional general contractor, recorded via Concap.
We need a training program on AI applications in pre-construction for our construction managers. Most are comfortable with technology but new to AI — call it intermediate. The pain is that estimates take too long and still miss scope, bid/no-bid decisions rely on gut feel, and our historical project data sits unused in old folders. RFIs pile up and reviews are inconsistent across teams. We want them to leave able to actually apply AI on a live project, not just talk about it. Probably four sessions. Mix of self-paced and live application labs works best for our schedules.`;

/** The sample pre-construction discovery call, analysed and tidied. */
export function sampleDiscovery(current: Discovery): Discovery {
  return {
    ...current,
    ...analyzeTranscript(SAMPLE_TRANSCRIPT),
    transcript: SAMPLE_TRANSCRIPT,
    audience: "construction managers",
    topic: "AI Applications in Pre-Construction",
    employer: "Regional General Contractor (sample)",
  };
}

export function painList(pains: string): string[] {
  return pains.split("\n").map((line) => line.trim()).filter(Boolean);
}

/** The built-in curriculum engine: composes a program from the discovery fields. No AI, no network. */
export function composeCurriculum(form: Discovery): Curriculum {
  const topic = form.topic.trim() || "Applied AI for the Organization";
  const audience = form.audience.trim() || "working professionals";
  const domain = DOMAINS[form.industry] ?? DOMAINS.general;
  const pains = painList(form.pains);
  const count = clampModules(form.modules);

  const outcomes = [
    `Explain how current AI systems work — capabilities, limits, and failure modes — in the context of ${domain.workflows[0]}.`,
    `Identify and prioritize specific, high-value AI applications across ${audience.endsWith("s") ? `${audience}'` : `${audience}'s`} daily workflows.`,
    `Apply AI tools to real ${domain.artifacts[0]} and ${domain.artifacts[1]}, with verification habits that catch errors before they ship.`,
    "Design a guarded rollout for one AI use case — data handling, review steps, and how success will be measured.",
  ];

  const library: ProgramModule[] = [
    {
      title: `Foundations: How AI Actually Works for ${titleCase(audience)}`,
      description: `Mental models before tools — what AI can and cannot do, told in the language of ${domain.workflows[0]}.`,
      submodules: [
        "How large language models behave: prediction, context, hallucination",
        `What AI changes — and doesn't — in ${domain.workflows[0]}`,
        "Data privacy and what may never be pasted into a public tool",
        "Reading AI output critically: verification as a habit",
      ],
      activities: [
        `Baseline exercise: run a real task through an AI tool, then audit its output against the source ${domain.artifacts[0].split(" ").pop()}`,
        `Case discussion: one documented AI failure in ${form.industry === "general" ? "a professional setting" : "the industry"} — what went wrong and the check that would have caught it`,
      ],
    },
    {
      title: "High-Value Applications Across the Workflow",
      description: `A structured tour of where AI pays off first: ${domain.workflows.slice(0, 3).join(", ")}.`,
      submodules: domain.workflows.map((workflow) => `AI in ${workflow}: current tools, realistic gains, common traps`),
      activities: [
        "Opportunity mapping: each learner scores their own workflow steps by AI leverage vs. risk",
        `Hands-on lab: draft, critique, and improve AI output on live ${domain.artifacts[1]}`,
      ],
    },
    {
      title: `Working Session: AI on Your Own ${titleCase(domain.artifacts[0])}`,
      description: "Applied lab — learners bring real (sanitized) materials and build reusable prompt workflows against them.",
      submodules: [
        "Structuring a reliable prompt: role, context, task, constraints, format",
        "Grounding AI in your own documents and data safely",
        "Building a reusable template your team can share",
        "Verifying and citing: making output defensible",
      ],
      activities: [
        `Build and test a prompt template against three real ${domain.artifacts[0]}; document its failure cases`,
        "Peer review: exchange templates and attempt to break them",
      ],
    },
    {
      title: "From Pilot to Practice: Rollout, Guardrails, and Measurement",
      description: `Turning individual wins into an organizational capability — with ${domain.systems} in the loop.`,
      submodules: [
        "Choosing the first official use case: value, risk, reversibility",
        "Review gates and human sign-off: where approval must live",
        "Measuring impact: time saved, error rates, adoption",
        "A 90-day adoption plan for the team",
      ],
      activities: [
        "Capstone: each learner drafts a one-page AI rollout memo for their own department, with metrics and guardrails",
        "Leadership readout: present the memo and defend its risk choices",
      ],
    },
    {
      title: "Advanced Patterns: Automation and Agents",
      description: "Beyond single prompts — chaining steps, light automation, and when an AI agent is (and isn't) the answer.",
      submodules: [
        "Workflow chaining: multi-step AI processes",
        "Agents vs. automation: what each is for",
        `Connecting AI to ${domain.systems}: what's real today`,
        "Cost, latency, and reliability budgets",
      ],
      activities: ["Design (on paper) one multi-step AI workflow for a recurring process, with its checkpoints"],
    },
    {
      title: "Team Enablement: Standards and Shared Practice",
      description: "Making the capability stick — shared prompt libraries, standards, and onboarding others.",
      submodules: [
        "A team prompt library: structure and ownership",
        "Writing an internal AI usage standard",
        "Coaching colleagues: the 30-minute enablement session",
      ],
      activities: ["Draft two entries for the team prompt library, tested and documented"],
    },
  ];

  const modules = library.slice(0, count);
  return {
    title: titleCase(topic),
    description: `A ${form.level.toLowerCase()}-level applied program for ${audience}, built around the organization's own workflows and documents. Learners don't study AI in the abstract — every session applies it to the ${domain.artifacts[0]} and ${domain.workflows[0]} they already own, and the program ends with each learner delivering a working AI practice for their role.`,
    audience: titleCase(audience),
    level: form.level,
    format: form.format.split("—")[0].trim(),
    duration: `${modules.length} modules · ${modules.length} weeks`,
    outcomes,
    modules,
    needLine: pains.length
      ? `The organization identified the following needs: ${pains.map((pain) => pain.replace(/\.$/, "")).join("; ")}.`
      : `The organization is seeking practical AI capability for its ${audience}, applied directly to current workflows.`,
    assessment: "Each module closes with a mastery check (fresh questions per attempt) and an applied deliverable graded on a rubric mapped to the learning outcomes. The capstone rollout memo and template library constitute portfolio evidence. Leadership receives a per-learner competency report — completion is demonstrated, not assumed.",
    delivery: `${form.format}. Delivered on the Requisor Learning platform: lessons authored by the program team, an always-available AI tutor scoped to the program content, assignments tailored to each learner's role, and spaced review to retain what's mastered.`,
  };
}

const text = (value: unknown, max: number): string =>
  // eslint-disable-next-line no-control-regex
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const list = (value: unknown, maxItems: number, maxChars: number): string[] =>
  Array.isArray(value) ? value.map((item) => text(item, maxChars)).filter(Boolean).slice(0, maxItems) : [];

/**
 * Lays an AI-written curriculum over the engine's one. The AI's answer is
 * untrusted: only well-formed parts are taken, and anything missing keeps the
 * engine's version, so the result is always a complete curriculum.
 */
export function mergeAiCurriculum(base: Curriculum, raw: unknown, moduleCount: number): Curriculum {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const ai = raw as Record<string, unknown>;
  const modules = (Array.isArray(ai.mods) ? ai.mods : Array.isArray(ai.modules) ? ai.modules : [])
    .map((item): ProgramModule | null => {
      const m = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const title = text(m.t ?? m.title, 160);
      const submodules = list(m.subs ?? m.submodules, 6, 200);
      if (!title || !submodules.length) return null;
      return { title, description: text(m.d ?? m.description, 400), submodules, activities: list(m.acts ?? m.activities, 4, 300) };
    })
    .filter((m): m is ProgramModule => m !== null)
    .slice(0, clampModules(moduleCount));
  const outcomes = list(ai.outcomes, 6, 300);
  const useModules = modules.length >= 3 ? modules : base.modules;
  return {
    ...base,
    title: text(ai.title, 160) || base.title,
    description: text(ai.desc ?? ai.description, 900) || base.description,
    outcomes: outcomes.length >= 3 ? outcomes : base.outcomes,
    modules: useModules,
    duration: `${useModules.length} modules · ${useModules.length} weeks`,
    assessment: text(ai.assess ?? ai.assessment, 900) || base.assessment,
    needLine: text(ai.needLine, 600) || base.needLine,
  };
}

// ── Proposal ────────────────────────────────────────────────────────────────
export type PricingRow = { item: string; basis: string; amount: string };
export type Proposal = {
  title: string;
  employer: string;
  date: string;
  preparedBy: string;
  platform: string;
  need: string;
  description: string;
  outcomes: string[];
  modules: { title: string; summary: string }[];
  delivery: string;
  deliveryPoints: string[];
  pricing: PricingRow[];
  total: string;
  pricingNote: string;
};

/** Assembles the employer proposal from the curriculum as it currently stands, edits included. */
export function buildProposal(curriculum: Curriculum, employer: string, today: Date): Proposal {
  return {
    title: curriculum.title,
    employer: employer.trim() || "Employer Partner",
    date: today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    preparedBy: "Prepared by: Professional & Continuing Education",
    platform: "Delivered on the Requisor Learning platform",
    need: `${curriculum.needLine} This program addresses those needs directly, using the organization’s own documents and workflows as the training material.`,
    description: curriculum.description,
    outcomes: [...curriculum.outcomes],
    modules: curriculum.modules.map((module, index) => ({ title: `Module ${index + 1}: ${module.title}`, summary: module.submodules.join(" · ") })),
    delivery: curriculum.delivery,
    deliveryPoints: [
      "Every learner is supported by a 24/7 AI tutor trained on the program content, with assignments tailored to their own role and department.",
      "Mastery checks gate each module; leadership receives a completion and competency report per learner — evidence, not attendance.",
      "Learner questions and struggle points are aggregated into a program insights report, informing the next training investment.",
    ],
    pricing: [
      { item: "Program development & customization", basis: "One-time", amount: "$ —" },
      { item: "Cohort delivery (up to 20 learners)", basis: "Per cohort", amount: "$ —" },
      { item: "Additional learners", basis: "Per learner", amount: "$ —" },
    ],
    total: "$ —",
    pricingNote: "Pricing finalized by the program team following scope confirmation. Valid 30 days.",
  };
}

// ── Commands from the AI assistant ──────────────────────────────────────────
/**
 * How the AI assistant drives the builder. The assistant's confirmation card
 * leaves a command in this browser tab's storage and announces it; the builder
 * picks it up, whether it was already open or is opened for the purpose.
 *   fill             put these values in the discovery fields
 *   generate         fill, then write the curriculum
 *   proposal         fill, write a curriculum if needed, then assemble the proposal
 *   open-curriculum  go back from the proposal to the curriculum
 */
export const PROGRAM_RUNS = ["fill", "generate", "proposal", "open-curriculum"] as const;
export type ProgramRun = (typeof PROGRAM_RUNS)[number];
export type ProgramCommand = { form: Partial<Discovery>; run: ProgramRun };

export const PROGRAM_DRAFT_KEY = "requisor-program-builder";
export const PROGRAM_COMMAND_KEY = "requisor-program-builder-command";
export const PROGRAM_COMMAND_EVENT = "requisor:program-builder-command";

/** Keeps only real discovery fields with sensible values; anything else is dropped. */
export function cleanDiscoveryFields(raw: unknown): Partial<Discovery> {
  const v = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Partial<Discovery> = {};
  if (typeof v.transcript === "string" && v.transcript.trim()) {
    // Line breaks are kept: the transcript reader works sentence by sentence.
    // eslint-disable-next-line no-control-regex
    out.transcript = v.transcript.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, 6000);
  }
  if (text(v.employer, 160)) out.employer = text(v.employer, 160);
  if (text(v.audience, 160)) out.audience = text(v.audience, 160);
  if (text(v.topic, 200)) out.topic = text(v.topic, 200);
  const industry = INDUSTRIES.find((i) => i.key === v.industry)?.key;
  if (industry) out.industry = industry;
  const level = typeof v.level === "string" ? LEVELS.find((l) => l.toLowerCase() === (v.level as string).trim().toLowerCase()) : undefined;
  if (level) out.level = level;
  const wanted = typeof v.format === "string" ? v.format.trim().toLowerCase() : "";
  const format = wanted ? FORMATS.find((f) => f.toLowerCase() === wanted || f.toLowerCase().startsWith(wanted)) : undefined;
  if (format) out.format = format;
  if (typeof v.modules === "number" && Number.isFinite(v.modules)) out.modules = clampModules(v.modules);
  const pains = Array.isArray(v.pains) ? list(v.pains, 6, 200) : typeof v.pains === "string" ? list(painList(v.pains), 6, 200) : [];
  if (pains.length) out.pains = pains.join("\n");
  return out;
}

export function readProgramCommand(raw: unknown): ProgramCommand | null {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const run = PROGRAM_RUNS.find((r) => r === v.run);
  return run ? { run, form: cleanDiscoveryFields(v.form) } : null;
}

/** Leaves a command for the builder and announces it (browser only). */
export function sendProgramCommand(command: ProgramCommand): void {
  try { sessionStorage.setItem(PROGRAM_COMMAND_KEY, JSON.stringify(command)); } catch { /* storage is unavailable */ }
  window.dispatchEvent(new CustomEvent(PROGRAM_COMMAND_EVENT));
}

/** Whether a command is waiting, without taking it. */
export function hasProgramCommand(): boolean {
  try { return sessionStorage.getItem(PROGRAM_COMMAND_KEY) !== null; } catch { return false; }
}

/** Takes the waiting command, if any, so it runs once. */
export function takeProgramCommand(): ProgramCommand | null {
  try {
    const stored = sessionStorage.getItem(PROGRAM_COMMAND_KEY);
    if (stored === null) return null;
    sessionStorage.removeItem(PROGRAM_COMMAND_KEY);
    return readProgramCommand(JSON.parse(stored));
  } catch {
    return null;
  }
}

/** A one-line account of the builder's saved state, for the assistant's context (browser only). */
export function programDraftSummary(): { topic: string; audience: string; employer: string; level: string; industry: string; modules: number; hasCurriculum: boolean; curriculumTitle: string; hasProposal: boolean } | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(PROGRAM_DRAFT_KEY) ?? "null") as { form?: Partial<Discovery>; curriculum?: Partial<Curriculum> | null; proposal?: unknown } | null;
    if (!saved?.form) return null;
    const form = { ...EMPTY_DISCOVERY, ...cleanDiscoveryFields(saved.form) };
    return {
      topic: form.topic, audience: form.audience, employer: form.employer, level: form.level, industry: form.industry, modules: form.modules,
      hasCurriculum: Boolean(saved.curriculum), curriculumTitle: text(saved.curriculum?.title, 160), hasProposal: Boolean(saved.proposal),
    };
  } catch {
    return null;
  }
}
