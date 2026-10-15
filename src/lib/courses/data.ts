import { Course, Lesson, CategoryKey } from "../types";
import { PLACEHOLDER_VIDEO } from "../utils";

/**
 * Seed content for Alma 41.
 * Every lesson ships with a PLACEHOLDER_VIDEO id — paste real YouTube URLs
 * from the Admin panel (Admin → Lessons → Edit) and the thumbnail, player
 * and duration wire up automatically.
 */

function lesson(
  courseSlug: string,
  index: number,
  title: string,
  durationMin: number,
  description: string,
  keyTakeaways: string[],
  assignment?: string,
  youtubeId?: string,
  section?: string,
  /** For reading-based lessons (an article/tool, not a video): links resources to the real source instead of the generic placeholders. */
  resourceUrl?: string
): Lesson {
  return {
    id: `${courseSlug}-${String(index + 1).padStart(2, "0")}`,
    title,
    description,
    youtubeId: youtubeId ?? PLACEHOLDER_VIDEO,
    section,
    durationMin,
    format: resourceUrl ? "reading" : "video",
    resources: resourceUrl
      ? [{ label: `${title} — Read the source`, url: resourceUrl, type: "link" }]
      : [
          { label: `${title} — Slides (PDF)`, url: "#", type: "pdf" },
          { label: `${title} — Further reading`, url: "#", type: "link" },
        ],
    keyTakeaways,
    assignment,
  };
}

function buildCourse(
  slug: string,
  title: string,
  tagline: string,
  category: CategoryKey,
  level: Course["level"],
  tags: string[],
  cover: string,
  addedAt: string,
  topics: Array<[string, number, string, string[], string?, string?, string?, string?]>,
  baseAssessment?: string
): Course {
  return {
    slug,
    title,
    tagline,
    category,
    level,
    tags,
    cover,
    addedAt,
    lessons: topics.map(([t, d, desc, takeaways, assignment, youtubeId, section, resourceUrl], i) =>
      lesson(slug, i, t, d, desc, takeaways, assignment, youtubeId, section, resourceUrl)
    ),
    baseAssessment,
  };
}

export const seedCourses: Course[] = [
  buildCourse(
    "product-management",
    "Product Management",
    "Modern Product Teams — from discovery to go-to-market.",
    "product",
    "Beginner",
    ["Product", "Strategy", "Agile", "Roadmaps"],
    "from-indigo-700 to-blue-500",
    "2026-05-04",
    [
      ["Mini Case Study: The SPACE PEN Example", 5, "The famous space pen story and what it teaches about solving the right problem.", ["Question the problem before the solution", "Simple solutions often beat clever ones", "Constraints sharpen thinking"], undefined, "P24rA65kn_k"],
      ["3 Questions to Ask Before Starting Product Development", 1, "Three quick checks to run before any build begins.", ["Validate the problem is real", "Know who you are building for", "Define what success looks like"], undefined, "RI1ybrAnjtU"],
      ["Product Management in Less than 10 Words", 1, "A crisp definition of what product management really is.", ["PM in one sentence", "Value and viability at the core"], undefined, "KOt0OgCdf3I"],
      ["The Secrets Nobody Talks About in Product Management", 12, "An honest look at the messy, unglamorous parts of the PM job.", ["The job is messier than the title", "Influence without authority", "Expect ambiguity"], undefined, "BQf_cY6MZT4"],
      ["4 Tips to Make Your Demo Great", 2, "Practical tips for demos that land with stakeholders.", ["Tell a story, not a feature list", "Rehearse the happy path", "Know your audience"], undefined, "TWH5PzqYjjc"],
      ["Ideation Phase: Problems First, Solutions Later", 2, "Why great products start from problems, not ideas.", ["Fall in love with the problem", "Defer solutions until the problem is clear"], undefined, "Xa_8uaACT08"],
      ["How to Build Great Products: 4 Tips for Product Discovery", 4, "Four discovery habits that de-risk what you build.", ["Talk to users early", "Prototype before you build", "Evidence over opinion"], undefined, "X-CuKVU-rcA"],
      ["Importance of Launching Early and Getting Feedback", 2, "Why shipping early beats polishing in private.", ["Launch to learn", "Feedback loops compound", "Perfect is the enemy of shipped"], undefined, "X2p5bJbOTQE"],
      ["4 Product Management Tips in Less than 1 Minute", 1, "Rapid-fire PM tips you can apply today.", ["Small habits, big impact"], undefined, "2N9qolMM6Hg"],
      ["Product Management Fundamentals Explained in 1 Min", 2, "The fundamentals of the PM role in sixty seconds.", ["The PM role at a glance"], undefined, "zKRgVG74Ez4"],
      ["How to Avoid Bad Requirements", 1, "Spotting and fixing weak requirements before they cost you.", ["Vague requirements create rework", "Ask why until it is concrete"], undefined, "PUr-4-kJtqk"],
      ["Building Effective Roadmaps: A Product Management Guide", 5, "Roadmaps that communicate strategy, not just dates.", ["Roadmaps are communication tools", "Outcomes over feature lists", "Keep it living, not static"], undefined, "4WAF4tzaMSQ"],
      ["Mastering SMART Goals: Your Path to Achieving Success", 8, "Setting goals that are specific, measurable and achievable.", ["SMART criteria explained", "Goals drive focus", "Review and adjust regularly"], undefined, "bNyILRTDKU8"],
      ["How to Manage Client Expectations", 6, "Keeping clients aligned and confident throughout delivery.", ["Set expectations early", "Communicate trade-offs honestly", "No surprises rule"], undefined, "rS0hgMseyc8"],
      ["I Gathered Requirements for a Pizza App", 7, "A worked example of gathering requirements end to end.", ["Requirements come from real conversations", "Functional vs non-functional requirements", "Write it down, confirm it back"], "Pick a simple everyday app idea and write one page of requirements the way shown in the video.", "Xj66742z7fc"],
      ["How to Be a Product Manager with No Experience", 6, "Breaking into product management without a PM title.", ["Build a portfolio of product thinking", "Transferable skills count", "Start where you are"], undefined, "PYZ5BDyUBOY"],
      ["Collaborate with Customers to Build Winning Products (Part 2)", 8, "Turning customer collaboration into better product decisions.", ["Co-create with customers", "Structured feedback sessions", "Close the loop"], undefined, "KHLuSylZ9c8"],
      ["How to Focus on the Right Market & Problem (Part 1)", 6, "Choosing the market and problem worth solving.", ["Market selection criteria", "Problem-market fit first", "Narrow beats broad early"], undefined, "2gxhuJsJ0nQ"],
      ["SaaS Product Management: Pricing, Growth and the Future", 8, "Pricing models and growth strategies for SaaS products.", ["Common SaaS pricing models", "Growth levers for SaaS", "Where SaaS is heading"], undefined, "ePF2BoEZgR4"],
      ["3 Simple UI/UX Tricks to Instantly Improve Your App Design", 11, "Quick design principles PMs can apply without a designer.", ["Hierarchy and spacing", "Consistency builds trust", "Reduce cognitive load"], undefined, "6bI7nRnZ1jo"],
      ["Live Walkthrough: Building an Ideal Customer Profile", 25, "Building an ICP live, for an AI-based hiring tool.", ["ICP step by step", "Segment before you target", "Use real signals, not guesses"], undefined, "2MzrRac2dKc"],
      ["Product Management + a Real Startup Case Study", 10, "What you will learn, grounded in a real startup case study.", ["Theory grounded in a real case", "How the pieces fit together"], undefined, "FRJREvQxmo4"],
      ["How to Gather Requirements as a Product Manager", 7, "Ask better questions, build better products.", ["Ask better, build better", "Listen for the underlying need", "Validate before committing"], undefined, "ip6Pf9TdxDs"],
      ["Voice of Customer (VoC): The PM's Listening System", 4, "Setting up a system to continuously hear your customers.", ["VoC is a system, not an event", "Multiple listening channels", "Turn feedback into action"], undefined, "O9yYLoLKHQg"],
      ["Building Ideal Customer Profiles", 6, "The fundamentals of defining who your product serves.", ["Attributes of a strong ICP", "Focus your roadmap on the ICP"], undefined, "tq-gJEO1VHQ"],
      ["How Product Managers Use Asana: Sprints & Tracking", 13, "Organizing sprints and tracking progress with Asana.", ["Sprint boards in practice", "Visibility drives accountability", "Keep tooling simple"], undefined, "1uxL3j4xY9Q"],
      ["Expectation Management: Aligning Teams & Stakeholders", 7, "Keeping teams and stakeholders aligned on what ships when.", ["Align early and often", "Manage scope, time and quality trade-offs"], undefined, "C44s5d18qt4"],
      ["How to Use AI for Acceptance Criteria and User Stories", 7, "Using AI to draft user stories and acceptance criteria faster.", ["AI as a drafting partner", "Always review AI output", "Better stories, faster"], undefined, "uckL4tz7Dlg"],
      ["Agile Made Simple! Key Concepts Explained", 10, "Agile's key concepts explained in plain language.", ["Agile values over rituals", "Iterate and inspect", "Scrum vocabulary demystified"], undefined, "lQDybkIdMUo"],
    ],
    "Produce a one-page Product Requirements Document (PRD) for an app idea of your choice — including problem statement, target user, key features, and success metrics."
  ),
  buildCourse(
    "data-analytics",
    "Data Analytics",
    "From data science to dashboards — make decisions with data.",
    "data",
    "Beginner",
    ["Data Science", "Data Visualization", "Tableau", "BI"],
    "from-fuchsia-700 to-pink-500",
    "2026-05-11",
    [
      // Sub-part 1: Data Science
      ["Podcast Intro: Data Science and AI", 3, "A short podcast intro framing how data science and AI fit together.", ["Data science and AI are complementary, not the same thing", "Sets up the themes for this sub-part"], undefined, "Hd7zbiJWLxo", "Data Science"],
      // Sub-part 2: Data Visualization
      ["History of Data Visualization", 4, "How the charts we use every day came alive through history.", ["Charts are a surprisingly recent invention", "Visuals evolved to answer real questions", "Knowing the history sharpens your chart choices"], undefined, "wz6XYqUnJrw", "Data Visualization"],
      ["Viz History: William Playfair — Bar & Line Charts", 1, "The inventor of the bar and line chart, in under a minute.", ["Playfair invented the bar and line chart", "Old ideas still power modern dashboards"], undefined, "c9fEG7xlyMg", "Data Visualization"],
      ["Viz History: Florence Nightingale — Polar Area Diagram", 1, "How Nightingale used a polar area diagram to change public health.", ["A chart helped reform army hospitals", "Visuals can drive real-world decisions"], undefined, "XD8nKjelg3I", "Data Visualization"],
      ["Why Data Visualization is Essential (Avoid These Mistakes)", 4, "Common visualization mistakes and why visuals matter for understanding information.", ["Bad charts mislead readers", "Match the chart to the question", "Simplicity beats decoration"], undefined, "3Lr4Mpy6ghE", "Data Visualization"],
      ["Why Data Visualization is Essential — Part 2", 2, "Continuing the case for visualization as a core analysis skill.", ["Visuals reveal what tables hide", "Perception drives comprehension"], undefined, "-Dq9QsocFn0", "Data Visualization"],
      ["How to Make Great Bar Charts: Best Practices", 5, "Best practices and comparisons for the most common chart of all.", ["Start bars at zero", "Sort for readability", "Label directly where possible"], "Take one bar chart from a recent report and redesign it using the best practices from this lesson.", "zXM3CM-d7Xw", "Data Visualization"],
      ["Assignment Walkthrough: Visualization Solution", 3, "A worked solution to a visualization home assignment.", ["See how a viz task is approached end to end", "Compare your approach to the solution"], undefined, "C10Dx2c1cMs", "Data Visualization"],
      ["Future of Data: BI Dashboards with a ChatGPT-Style Interface", 3, "Where BI is heading — conversational, automated dashboards.", ["Natural-language BI is coming", "Automation changes the analyst's role"], undefined, "v3CNJao4nA8", "Data Visualization"],
      ["Tableau and Data: Podcast with Felicia Styer", 30, "A conversation about Tableau, data careers and the visualization community.", ["How practitioners really use Tableau", "Community accelerates learning", "Career paths in data viz"], undefined, "GPNgZVYnofE", "Data Visualization"],
      ["From Data to Graphics: The 'Graph Hopper' Story", 1, "The meaning behind Graph Hopper — turning data into graphics.", ["Naming ideas makes them memorable"], undefined, "Ay_fxMM1PUU", "Data Visualization"],
      ["Unlocking Your Story: Data Visualization with Tableau", 1, "Telling your data story visually with Tableau.", ["Every dataset has a story", "Tableau lowers the barrier to telling it"], undefined, "dpywnr29sMI", "Data Visualization"],
      ["Unlock Your Mind: Logic Puzzles and Challenges", 1, "Sharpening analytical thinking with logic puzzles.", ["Puzzle practice builds analyst instincts"], undefined, "z78jjAeu888", "Data Visualization"],
      ["Overcoming Challenges in Tech: Insights for Graduates", 1, "Short advice for graduates starting out in tech and data.", ["Persistence beats raw talent", "Everyone starts somewhere"], undefined, "OGGpkC7bl5E", "Data Visualization"],
      ["Why I Love Working with Data: The Thrill of Problem Solving", 1, "What makes data work genuinely exciting.", ["Data work is problem solving at heart"], undefined, "6F7ZytonoaM", "Data Visualization"],
      ["Harness the Power of Data: Collect, Analyze, Automate!", 1, "The collect → analyze → automate loop in a nutshell.", ["Collect, analyze, automate", "Small automations compound"], undefined, "uVohGX0r2HM", "Data Visualization"],
      ["Join the Excitement: IronViz Competition for Students", 1, "IronViz — Tableau's viz competition and why students should join.", ["Competitions accelerate skill-building", "Deadlines force finished work"], undefined, "PM7ppnxa4Mo", "Data Visualization"],
      // Sub-part 3: Business Intelligence (Tableau)
      ["Introduction to BI Tools: Free Tableau Public", 6, "An overview of BI tooling and getting started with Tableau Public at no cost.", ["Tableau Public is free to start with", "BI tools turn raw data into decisions", "Tableau vs Power BI at a glance"], undefined, "ntROhhwNEYM", "Business Intelligence (Tableau)"],
      ["Tableau Basics: Dashboards, Worksheets, Workbooks", 5, "The core building blocks of a Tableau project and how they relate.", ["Worksheets build up into dashboards", "Workbooks organize your project", "Navigating the Tableau interface"], undefined, "50wFjY1975s", "Business Intelligence (Tableau)"],
      ["What Are Dimensions and Measures in Tableau?", 3, "The most important distinction in Tableau, explained clearly.", ["Dimensions categorize, measures quantify", "Getting this right shapes every chart", "Common mistakes to avoid"], undefined, "Qd4vKHRJGzQ", "Business Intelligence (Tableau)"],
      ["What Are Tableau Extracts?", 3, "Data extracts explained: what they are and when to use them.", ["Extracts vs live connections", "Performance benefits of extracts", "Refresh schedules"], undefined, "JdG4dFx7hio", "Business Intelligence (Tableau)"],
      ["Getting Started with Tableau Calculations", 2, "The basics of writing calculated fields in Tableau.", ["Calculated fields extend your data", "Basic syntax and structure", "Where calculations fit in your workflow"], undefined, "jy-t6T8QCQ4", "Business Intelligence (Tableau)"],
      ["Table Calculations: Percent of Total", 8, "Using table calculations to show percent-of-total breakdowns.", ["What makes a table calculation different", "Percent of total step by step", "Common use cases"], undefined, "FTuQ9f4d3sY", "Business Intelligence (Tableau)"],
      ["Table Calculations: Running Total and Advantage", 4, "Building running totals and advantage calculations in Tableau.", ["Running totals over time", "Advantage calculations explained", "Choosing the right compute-using field"], undefined, "_oJMXIHFOoA", "Business Intelligence (Tableau)"],
      ["Secondary Table Calculations", 5, "Layering a second table calculation on top of the first.", ["What a secondary calculation adds", "When one calculation is not enough", "Practical examples"], undefined, "aKus7XmLvs0", "Business Intelligence (Tableau)"],
      ["Level of Detail Calculations: FIXED", 7, "Building FIXED LOD calculations to control aggregation precisely.", ["FIXED ignores the view's dimensions", "When to reach for FIXED", "Common pitfalls"], undefined, "FBweJYIMwgY", "Business Intelligence (Tableau)"],
      ["Level of Detail Calculations: INCLUDE & EXCLUDE", 12, "Building INCLUDE and EXCLUDE LOD calculations for finer control.", ["INCLUDE adds detail, EXCLUDE removes it", "Choosing between FIXED, INCLUDE and EXCLUDE", "Worked examples"], undefined, "cIrlCrC_3-Q", "Business Intelligence (Tableau)"],
      ["Understanding LOD Calculations: INCLUDE and EXCLUDE", 14, "A deeper look at how INCLUDE and EXCLUDE LOD calculations behave.", ["How the view's granularity affects results", "Debugging unexpected LOD output", "Building intuition through examples"], undefined, "tsRBJtMmJYc", "Business Intelligence (Tableau)"],
      ["Tableau LOD Homework: Example and Demo", 10, "A worked LOD-expressions homework example to practice the concepts.", ["Apply FIXED, INCLUDE and EXCLUDE together", "Check your work against the demo", "Where LOD calculations trip people up"], "Complete the Tableau LOD homework exercise shown in the video using your own sample dataset.", "P4FLG9z6kSs", "Business Intelligence (Tableau)"],
      ["Tableau + Data Science: Forecasting and Clustering", 4, "An overview of Tableau's built-in forecasting and clustering features.", ["Tableau can forecast without external tools", "Clustering groups similar data points", "When to use built-in analytics vs a full model"], undefined, "1KNwef1XtWY", "Business Intelligence (Tableau)"],
      ["Tableau + Data Science: Forecasting Example", 2, "A hands-on example of building a forecast in Tableau.", ["Setting up a forecast in a few clicks", "Reading forecast confidence bands", "Limitations of built-in forecasting"], undefined, "Ksq21KS6hKc", "Business Intelligence (Tableau)"],
      ["Tableau + Data Science: How to Perform Clustering", 5, "Using Tableau's clustering feature to find natural groupings in data.", ["Clustering surfaces hidden segments", "Interpreting cluster results", "Pairing clusters with dashboards"], undefined, "CuY89mcCBtk", "Business Intelligence (Tableau)"],
      ["Assignment: 6 Steps to Make the Dataset Work", 3, "Preparing a dataset so it behaves correctly in Tableau.", ["Data prep before visualization", "Six repeatable prep steps", "Avoiding rework later in the project"], "Follow the six steps shown to prepare your own dataset for a Tableau project.", "9ZgvSBjml-w", "Business Intelligence (Tableau)"],
    ],
    "Choose a public dataset, clean it, build 3 charts that tell a coherent story, and write a 200-word narrative summary of your findings."
  ),
  buildCourse(
    "agentic-ai",
    "Agentic AI",
    "Build with LLMs, agents and automation — the Requisor way.",
    "ai",
    "Beginner",
    ["AI Agents", "Automation", "ChatGPT", "AI Tools", "Foundations"],
    "from-teal-700 to-cyan-500",
    "2026-06-01",
    [
      ["AI Agents vs Automation: What's the Real Difference?", 6, "Where classic automation ends and agentic AI begins.", ["Automation follows rules, agents pursue goals", "When an agent is overkill", "Spotting agent-shaped problems"], undefined, "qOP3zROnr5w"],
      ["What Are AI Agents? Agentic AI Explained Simply", 3, "A plain-language overview of what makes AI agentic.", ["Agents perceive, plan and act", "Tool use is the superpower", "The agent loop in one picture"], undefined, "_kpSp65gX14"],
      ["Module Overview & Project Management: Introducing Requisor", 9, "How this module fits together, introduced through the Requisor project.", ["The module roadmap", "Learning by building a real product", "How AI fits into project delivery"], undefined, "5OYphTfFFvg"],
      ["AI Deepfake Reveal — Was It Me or the Machine?", 13, "A hands-on look at how convincing AI-generated video has become.", ["Deepfakes are cheap and accessible", "Tells that give synthetic media away", "Why verification matters"], undefined, "K2dFYr9KFf8"],
      ["How to Set Up Lovable.dev in 2 Minutes", 3, "Getting started with an AI website assistant, fast.", ["Zero-to-project setup", "What AI builders are good at", "Where you still need judgment"], undefined, "dsPhxncnb54"],
      ["Building AI Websites: Prompt Stacking + ChatGPT + Lovable.dev", 13, "A practical workflow for building polished sites with AI tools.", ["Prompt stacking technique", "Combining tools into a pipeline", "Iterate in small passes"], "Use the prompt-stacking approach to build a one-page site for a product idea and share the result.", "ZhCeOs_f5AY"],
      ["AI Foundations Podcast Ep. 1: 15 Core Concepts", 13, "The core concepts that power tools like ChatGPT, in podcast form.", ["Tokens, embeddings and context", "Training vs inference", "Why models hallucinate"], undefined, "gqMPVNSTFWU"],
      ["15 AI Concepts You Must Know in 2025", 8, "A rapid, plain-English tour of the AI vocabulary that matters.", ["The 15 concepts at a glance", "Jargon decoded", "How the pieces relate"], undefined, "wLTAeQXh--4"],
      ["Getting the Best out of ChatGPT: Privacy & Hidden Content", 4, "Using ChatGPT effectively while staying safe with your data.", ["Better prompts, better answers", "What not to paste into a chatbot", "Privacy settings that matter"], undefined, "XZ4RlIOxaYE"],
      ["AI vs ML vs Deep Learning vs LLM: The Real Difference", 4, "Untangling the terms people use interchangeably.", ["AI is the umbrella", "ML learns from data", "LLMs are one kind of deep learning"], undefined, "eCWEzubJ4iI"],
      ["AI for Organizational Efficiency: Course Introduction", 8, "Applying AI to make organizations measurably more efficient.", ["Efficiency use-cases for AI", "Start with the process, not the model", "Measuring impact"], undefined, "HKOodPFP6S8"],
      ["Tokens: How LLMs Actually Read Text", 10, "A clear explanation of what tokens are and why they matter for every interaction with an LLM.", ["Text is split into tokens, not words or characters", "Token limits shape what a model can 'see' at once", "Token count directly affects speed and cost"], undefined, "LH8mtILzM3Y"],
      ["Is Prompt Engineering Dead?", 8, "An honest look at whether prompt engineering still matters as models get smarter.", ["Models are more capable, but prompting still drives results", "Structured prompting remains a durable skill", "Shifting from crafting prompts to designing agent workflows"], undefined, "ENDQTiScfCw"],
      ["Embeddings Explained", 12, "What embeddings are, how they work, and why they power semantic search and RAG systems.", ["Embeddings turn meaning into numbers", "Similar concepts land close together in vector space", "Foundation for semantic search, RAG and memory in agents"], undefined, "KnSkZU8yELQ"],
      ["Model Context Protocol (MCP) Explained", 10, "What MCP is, why Anthropic introduced it, and how it standardises tool use across AI agents.", ["MCP gives agents a universal way to call external tools", "Replaces one-off integrations with a common open protocol", "Practical impact on how multi-agent systems are built today"], undefined, "Veujt6JWGR0"],
      ["AI Prompting for Everyone", 10, "DeepLearning.AI's hub of prompting and applied-AI courses — including the widely used \"ChatGPT Prompt Engineering for Developers\" — built for both technical and non-technical learners.", ["Effective prompting: summarizing, inferring, transforming and expanding text with LLMs", "Courses span every level, from no-code AI literacy to hands-on developer prompting", "Built with OpenAI and other AI labs, used by 7M+ learners"], undefined, undefined, undefined, "https://www.deeplearning.ai"],
      // Sub-part: Hands-On Agent Courses (DeepLearning.AI)
      ["Design, Develop, and Deploy Multi-Agent Systems with CrewAI", 780, "A hands-on DeepLearning.AI course on building production-grade multi-agent systems with CrewAI — memory, tools, guardrails, Flows and Crews — taught by CrewAI founder João Moura.", ["Master agent building blocks: memory, tools (including MCP servers), guardrails and hooks", "Orchestrate multi-agent workflows with Flows and Crews", "Test and deploy with observability and LLM-as-a-Judge evaluation"], undefined, undefined, "Hands-On Agent Courses (DeepLearning.AI)", "https://www.deeplearning.ai/courses/design-develop-and-deploy-multi-agent-systems-with-crewai"],
      ["Building and Evaluating Data Agents", 119, "Build and evaluate multi-agent workflows that autonomously extract insights from data, using LangGraph and LLM-as-a-judge techniques — taught by Snowflake's AI research team.", ["Coordinate specialized sub-agents for database access, web search and visualization with LangGraph", "Evaluate agents with LLM-as-a-judge: relevance, groundedness and goal-plan-action alignment", "Use inline evaluations at runtime so agents can adjust strategy dynamically"], undefined, undefined, "Hands-On Agent Courses (DeepLearning.AI)", "https://www.deeplearning.ai/courses/building-and-evaluating-data-agents"],
      ["Building AI Browser Agents", 65, "Learn to build autonomous web agents that fill forms, scrape pages and gather information, including the self-correcting AgentQ framework — taught by AGI Inc's co-founders.", ["Web agents reason over visual and structural page data to decide what to click or fill", "Build agents that scrape sites and return structured, usable output", "AgentQ combines Monte Carlo Tree Search, self-critique and DPO to self-correct"], undefined, undefined, "Hands-On Agent Courses (DeepLearning.AI)", "https://www.deeplearning.ai/courses/building-ai-browser-agents"],
      ["Vibe Coding 101 with Replit", 94, "An introduction to \"vibe coding\" — building and deploying real web apps with AI coding agents in Replit's cloud environment, taught by Replit's own team.", ["Apply the five-skill framework: thinking, frameworks, checkpoints, debugging, context", "Precise prompting and effective debugging are the core agentic-coding skills", "Build and ship two real apps end-to-end inside Replit"], undefined, undefined, "Hands-On Agent Courses (DeepLearning.AI)", "https://www.deeplearning.ai/courses/vibe-coding-101-with-replit"],
    ],
    "Design and describe a multi-agent workflow that automates a real task in your work or life — include the agents, tools, triggers, and expected output."
  ),
];

seedCourses.push(
  buildCourse(
  "cyber-security",
  "Cyber Security",
  "Defend Requisor — from networking basics to incident response.",
  "security",
  "Beginner",
  ["Security", "Awareness", "Best Practices"],
  "from-blue-800 to-blue-600",
  "2026-06-15",
  [
    ["Powerful Cybersecurity Talk: Essential Security Tips + Q&A", 83, "A full security-awareness talk covering essential tips everyone should follow, with an interactive Q&A session.", ["Everyday security habits that matter", "How attackers actually target people", "Answers to common security questions"], "Note three security habits from the talk you will adopt this week and share them with your team.", "sFAWpeA0u2Y"],
    // Sub-part: Application Security & DevSecOps
    ["Mozilla Web Security Guidelines: Securing the Basics", 12, "Mozilla's reference guide to the web security fundamentals every engineer should apply — HTTPS, security headers, cookies and Content Security Policy.", ["Enforce HTTPS everywhere, including third-party resources", "A strict Content Security Policy is the strongest defense against XSS", "Set Secure, HttpOnly and SameSite on every cookie"], undefined, undefined, "Application Security & DevSecOps", "https://infosec.mozilla.org/guidelines/web_security"],
    ["OWASP Top 10 (2025): The Ten Risks to Know", 15, "The industry-standard awareness list of the ten most critical web application security risks, updated for 2025.", ["Broken Access Control and Security Misconfiguration top the list", "Software Supply Chain Failures is a newly elevated, higher-priority category", "Use it as shared vocabulary between engineering and security teams"], undefined, undefined, "Application Security & DevSecOps", "https://owasp.org/Top10/2025/"],
    ["SAST vs DAST: Two Halves of Application Security", 8, "How static and dynamic application security testing differ, and why an effective DevSecOps pipeline needs both.", ["SAST scans source code early; DAST attacks a running app like a real attacker would", "SAST catches code-level bugs, DAST catches runtime issues neither alone would find", "Automate both in CI/CD and block merges on critical findings"], undefined, undefined, "Application Security & DevSecOps", "https://about.gitlab.com/topics/devsecops/sast-vs-dast/"],
    ["Semgrep: Static Analysis Developers Actually Use", 10, "An AI-assisted SAST, SCA and secrets-detection platform built to cut false positives and catch real vulnerabilities in code review.", ["Combines rule-based scanning with AI reasoning to catch logic and authorization flaws", "Automatically triages false positives so real issues surface first", "Runs in CI/CD, IDEs and pull requests without slowing developers down"], undefined, undefined, "Application Security & DevSecOps", "https://semgrep.dev/"],
    ["Getting Started with OWASP ZAP", 10, "A hands-on introduction to the free, open-source penetration testing proxy for finding vulnerabilities in running web applications.", ["Run a Quick Start automated scan against a target URL to begin", "Pair automated scanning with manual browsing for authenticated flows", "Review the Alerts tab by risk level before acting on findings"], "Run a ZAP Quick Start scan against a staging app you have permission to test and note the top 3 alerts.", undefined, "Application Security & DevSecOps", "https://www.zaproxy.org/getting-started/"],
    ["Case Study: The Axios npm Supply Chain Compromise", 9, "Microsoft's incident write-up on malicious Axios package versions used by a state-sponsored actor to plant remote access trojans across npm installs.", ["Pin exact dependency versions — drop ^ and ~ to block malicious auto-updates", "Roll back to known-safe versions and rotate any exposed credentials immediately", "Watch CI/CD logs and outbound traffic for indicators of compromise"], undefined, undefined, "Application Security & DevSecOps", "https://www.microsoft.com/en-us/security/blog/2026/04/01/mitigating-the-axios-npm-supply-chain-compromise/"],
    ["OWASP Top 10 for LLM Applications", 12, "The OWASP framework for the security and safety risks unique to generative AI systems — directly relevant to the agents and tools built in our Agentic AI path.", ["Prompt injection and insecure output handling are the top input/output risks", "Training data and model supply chains can be compromised or stolen", "Limit LLM autonomy and validate outputs — don't over-trust agent decisions"], undefined, undefined, "Application Security & DevSecOps", "https://owasp.org/www-project-top-10-for-large-language-model-applications/"],
    ],
    "Perform a security review of a simple web app (real or hypothetical) using the OWASP Top 10 as a checklist and write up the top 3 risks with recommended mitigations."
  )
);

/** A w3schools-style code lesson: markdown `body` plus a live "Try it
 *  Yourself" editor (CodeMirror + a Web Worker runtime) seeded with
 *  `starterCode`. No video — see format "code-tutorial". */
function makeCodeLessonFactory(courseSlug: string, language: "python" | "javascript", docsUrl: string, docsLabel: string) {
  return function codeLesson(
    index: number,
    title: string,
    durationMin: number,
    description: string,
    keyTakeaways: string[],
    body: string,
    starterCode: string,
    section?: string
  ): Lesson {
    return {
      id: `${courseSlug}-${String(index + 1).padStart(2, "0")}`,
      title,
      description,
      youtubeId: "",
      durationMin,
      format: "code-tutorial",
      language,
      section,
      resources: [{ label: `${docsLabel} — ${title}`, url: docsUrl, type: "link" }],
      keyTakeaways,
      body,
      starterCode,
    };
  };
}

/** A w3schools-style reading lesson for a language with no in-browser runtime
 *  (e.g. Java — no lightweight in-browser JVM): markdown `body` with fenced
 *  code examples, same renderer as a code-tutorial lesson's text, just
 *  without a live editor. */
function makeReadingLessonFactory(courseSlug: string, docsUrl: string, docsLabel: string) {
  return function readingLesson(
    index: number,
    title: string,
    durationMin: number,
    description: string,
    keyTakeaways: string[],
    body: string,
    section?: string
  ): Lesson {
    return {
      id: `${courseSlug}-${String(index + 1).padStart(2, "0")}`,
      title,
      description,
      youtubeId: "",
      durationMin,
      format: "reading",
      section,
      resources: [{ label: `${docsLabel} — ${title}`, url: docsUrl, type: "link" }],
      keyTakeaways,
      body,
    };
  };
}

const pythonLesson = makeCodeLessonFactory("python", "python", "https://docs.python.org/3/", "Python docs");

seedCourses.push({
  slug: "python",
  title: "Python Programming",
  tagline: "Learn Python the w3schools way — short lessons, real code, run it instantly.",
  category: "programming",
  level: "Beginner",
  tags: ["Python", "Programming", "Coding"],
  cover: "from-sky-600 via-blue-600 to-indigo-700",
  addedAt: "2026-07-10",
  baseAssessment: "Write a short Python program (at least 15 lines) that uses a variable, a loop, a conditional and a function, then run it in the course's own editor and paste the output.",
  lessons: [
    pythonLesson(
      0, "Python Introduction", 5,
      "What Python is, why it's everywhere, and how this course's live editor works.",
      ["Python is a general-purpose, beginner-friendly language", "No install needed here — every lesson has a live editor", "Click Run to execute real Python in your browser"],
      `# Python Introduction

Python is one of the most popular programming languages in the world. It is used for web development, data analysis, automation, AI and much more.

Python is known for its simple, readable syntax — close to plain English — which makes it a great first language.

## Why Python?
- Runs on Windows, Mac, Linux and more
- A huge standard library plus thousands of third-party packages
- Readable syntax that reads almost like English
- Used heavily in AI, data science and automation

## Your first line of Python
Every lesson in this course has a live editor like the one below. Press **Run** to execute the code and see its output.

\`\`\`python
print("Hello, World!")
\`\`\`

Try changing the text inside the quotes and running it again.`,
      'print("Hello, World!")',
      "Python Basics"
    ),
    pythonLesson(
      1, "Python Syntax", 6,
      "print(), comments and why indentation matters in Python.",
      ["print() writes text to the output", "# starts a comment — Python ignores the rest of the line", "Indentation (not braces) defines blocks of code"],
      `# Python Syntax

## print()
print() outputs text or values:

\`\`\`python
print("Learning Python")
print(2 + 3)
\`\`\`

## Comments
A line starting with # is a comment — Python skips it entirely. Use comments to explain *why*, not *what*.

\`\`\`python
# This is a comment, Python ignores this line
print("This runs")
\`\`\`

## Indentation
Unlike many languages, Python uses indentation (spaces) — not curly braces { } — to mark a block of code. This will matter a lot once you reach if-statements and loops.

\`\`\`python
if 5 > 2:
    print("Five is greater than two!")
\`\`\``,
      `print("Learning Python")\nprint(2 + 3)\n\n# Try adding your own comment and print statement below\n`,
      "Python Basics"
    ),
    pythonLesson(
      2, "Python Variables", 7,
      "Creating variables, naming rules, and Python's dynamic typing.",
      ["A variable is created the moment you first assign it a value", "No need to declare a type — Python infers it", "Variable names are case-sensitive and can't start with a number"],
      `# Python Variables

Variables store data. Python has no command for declaring a variable — it's created the moment you assign a value:

\`\`\`python
x = 5
y = "Hello, World!"
print(x)
print(y)
\`\`\`

## Naming rules
- Must start with a letter or underscore, not a number
- Can contain letters, numbers and underscores (A-z, 0-9, _)
- Case-sensitive: \`age\`, \`Age\` and \`AGE\` are three different variables

## Dynamic typing
A variable's type can change as your program runs:

\`\`\`python
x = 5       # x is an integer
x = "five"  # now x is a string
print(x)
\`\`\``,
      `x = 5\ny = "Hello, World!"\nprint(x)\nprint(y)\n`,
      "Python Basics"
    ),
    pythonLesson(
      3, "Python Data Types", 8,
      "The built-in types: str, int, float, bool, list and dict — and how to check one with type().",
      ["Common types: str, int, float, bool, list, dict", "type() tells you a value's data type", "Numbers, text and collections are all first-class values"],
      `# Python Data Types

Python has several built-in data types:
- **str** — text, e.g. "hello"
- **int** — whole numbers, e.g. 42
- **float** — decimal numbers, e.g. 3.14
- **bool** — True / False
- **list** — an ordered collection, e.g. [1, 2, 3]
- **dict** — key/value pairs, e.g. {"a": 1}

Use type() to check what you're working with:

\`\`\`python
name = "Alex"
age = 30
height = 1.75
is_member = True

print(type(name))
print(type(age))
print(type(height))
print(type(is_member))
\`\`\``,
      `name = "Alex"\nage = 30\nheight = 1.75\nis_member = True\n\nprint(type(name))\nprint(type(age))\nprint(type(height))\nprint(type(is_member))\n`,
      "Python Basics"
    ),
    pythonLesson(
      4, "Python Strings", 8,
      "Quoting, concatenation, f-strings and slicing text.",
      ["Strings can use single or double quotes", "f-strings (f\"...\") embed variables directly in text", "Slice a string with [start:end]"],
      `# Python Strings

Strings are text, wrapped in single or double quotes:

\`\`\`python
greeting = "Hello"
name = 'World'
print(greeting + ", " + name + "!")
\`\`\`

## f-strings
The easiest way to mix variables into text is an f-string — put an f before the quotes:

\`\`\`python
name = "Alex"
age = 30
print(f"{name} is {age} years old.")
\`\`\`

## Slicing
Grab part of a string with [start:end] (end is excluded):

\`\`\`python
text = "Hello, World!"
print(text[0:5])   # Hello
print(text[7:])    # World!
print(text.upper())
\`\`\``,
      `name = "Alex"\nage = 30\nprint(f"{name} is {age} years old.")\n\ntext = "Hello, World!"\nprint(text[0:5])\nprint(text.upper())\n`,
      "Python Basics"
    ),
    pythonLesson(
      5, "Python Lists", 9,
      "Creating lists, indexing, and the most common list methods.",
      ["A list holds an ordered, changeable collection of items", "Indexing starts at 0; negative indexes count from the end", "append(), remove() and len() are the methods you'll use most"],
      `# Python Lists

A list stores multiple items in a single variable:

\`\`\`python
fruits = ["apple", "banana", "cherry"]
print(fruits)
print(fruits[0])    # first item
print(fruits[-1])   # last item
\`\`\`

## Changing a list
\`\`\`python
fruits = ["apple", "banana", "cherry"]
fruits.append("orange")
fruits.remove("banana")
print(fruits)
print(len(fruits))
\`\`\`

## Looping over a list
\`\`\`python
for fruit in fruits:
    print(fruit)
\`\`\``,
      `fruits = ["apple", "banana", "cherry"]\nfruits.append("orange")\nprint(fruits)\n\nfor fruit in fruits:\n    print(fruit)\n`,
      "Control Flow"
    ),
    pythonLesson(
      6, "Python If...Else", 9,
      "Comparison and logical operators, and writing conditional branches.",
      ["if, elif and else branch your program's logic", "Comparison operators: ==, !=, >, <, >=, <=", "Combine conditions with and, or, not"],
      `# Python If...Else

Python relies on indentation to mark which lines belong to a condition:

\`\`\`python
age = 20

if age < 13:
    print("Child")
elif age < 20:
    print("Teenager")
else:
    print("Adult")
\`\`\`

## Logical operators
\`\`\`python
age = 20
has_id = True

if age >= 18 and has_id:
    print("Entry allowed")
else:
    print("Entry denied")
\`\`\``,
      `age = 20\nhas_id = True\n\nif age >= 18 and has_id:\n    print("Entry allowed")\nelse:\n    print("Entry denied")\n`,
      "Control Flow"
    ),
    pythonLesson(
      7, "Python Loops", 9,
      "for loops, while loops, range(), and break/continue.",
      ["for loops iterate over a sequence; while loops repeat while a condition holds", "range(n) generates numbers 0 to n-1", "break exits a loop early; continue skips to the next iteration"],
      `# Python Loops

## for loop
\`\`\`python
for i in range(5):
    print(i)
\`\`\`

## while loop
\`\`\`python
count = 0
while count < 5:
    print(count)
    count += 1
\`\`\`

## break and continue
\`\`\`python
for i in range(10):
    if i == 3:
        continue   # skip 3
    if i == 6:
        break      # stop at 6
    print(i)
\`\`\``,
      `for i in range(5):\n    print(i)\n\ncount = 0\nwhile count < 3:\n    print("count is", count)\n    count += 1\n`,
      "Control Flow"
    ),
    pythonLesson(
      8, "Python Functions", 10,
      "Defining reusable functions with def, parameters, defaults and return values.",
      ["def defines a reusable block of code", "Parameters can have default values", "return sends a value back to the caller"],
      `# Python Functions

A function is a reusable block of code, defined with def:

\`\`\`python
def greet(name):
    return f"Hello, {name}!"

print(greet("Alex"))
\`\`\`

## Default parameters
\`\`\`python
def greet(name="World"):
    return f"Hello, {name}!"

print(greet())
print(greet("Python"))
\`\`\`

## Multiple parameters and return values
\`\`\`python
def add(a, b):
    return a + b

result = add(4, 7)
print(result)
\`\`\`

Now try writing your own function in the editor below — this is your final exercise for the Python basics path.`,
      `def greet(name="World"):\n    return f"Hello, {name}!"\n\nprint(greet())\nprint(greet("Python"))\n\ndef add(a, b):\n    return a + b\n\nprint(add(4, 7))\n`,
      "Control Flow"
    ),
  ],
});

const javascriptLesson = makeCodeLessonFactory("javascript", "javascript", "https://developer.mozilla.org/en-US/docs/Web/JavaScript", "MDN");

seedCourses.push({
  slug: "javascript",
  title: "JavaScript Programming",
  tagline: "Learn JavaScript the w3schools way — short lessons, real code, run it instantly.",
  category: "programming",
  level: "Beginner",
  tags: ["JavaScript", "Programming", "Coding", "Web"],
  cover: "from-amber-500 via-orange-500 to-red-600",
  addedAt: "2026-07-11",
  baseAssessment: "Write a short JavaScript program (at least 15 lines) that uses a variable, a loop, a conditional and a function, then run it in the course's own editor and paste the output.",
  lessons: [
    javascriptLesson(
      0, "JavaScript Introduction", 5,
      "What JavaScript is, why it's everywhere, and how this course's live editor works.",
      ["JavaScript is the language of the web — every browser runs it", "No install needed here — every lesson has a live editor", "Click Run to execute real JavaScript and see console output"],
      `# JavaScript Introduction

JavaScript is the programming language of the web. It runs in every browser and powers interactivity on nearly every website — and, via Node.js, on servers too.

## Why JavaScript?
- Runs natively in every web browser, no install needed
- One language for both frontend (browsers) and backend (Node.js)
- Huge ecosystem (npm) and a role in almost every web app

## Your first line of JavaScript
Every lesson in this course has a live editor like the one below. Press **Run** to execute the code — output goes to the console panel below the editor, same as \`console.log\` in a browser's DevTools.

\`\`\`javascript
console.log("Hello, World!");
\`\`\`

Try changing the text inside the quotes and running it again.`,
      'console.log("Hello, World!");',
      "JavaScript Basics"
    ),
    javascriptLesson(
      1, "JavaScript Syntax", 6,
      "console.log(), comments, statements and semicolons.",
      ["console.log() writes a value to the console", "// starts a single-line comment; /* */ for multi-line", "Statements usually end with a semicolon"],
      `# JavaScript Syntax

## console.log()
console.log() outputs a value to the console:

\`\`\`javascript
console.log("Learning JavaScript");
console.log(2 + 3);
\`\`\`

## Comments
A line starting with // is a comment — JavaScript skips it entirely. Use /* ... */ for a multi-line comment.

\`\`\`javascript
// This is a comment, JavaScript ignores this line
console.log("This runs");
\`\`\`

## Statements and semicolons
Each instruction is a statement, usually ending with a semicolon:

\`\`\`javascript
let x = 5;
console.log(x);
\`\`\``,
      `console.log("Learning JavaScript");\nconsole.log(2 + 3);\n\n// Try adding your own comment and console.log below\n`,
      "JavaScript Basics"
    ),
    javascriptLesson(
      2, "JavaScript Variables", 7,
      "let, const and var — declaring variables and when to use each.",
      ["let declares a variable that can change", "const declares a variable that can't be reassigned", "Prefer const by default, let when a value needs to change; avoid var"],
      `# JavaScript Variables

Variables store data. Modern JavaScript declares them with let or const:

\`\`\`javascript
let x = 5;
const y = "Hello, World!";
console.log(x);
console.log(y);
\`\`\`

## let vs const vs var
- **let** — can be reassigned later
- **const** — cannot be reassigned after it's set
- **var** — the old way, avoid it in new code (confusing scoping rules)

\`\`\`javascript
let age = 30;
age = 31; // fine, let can change

const name = "Alex";
// name = "Sam"; // error — const can't be reassigned
console.log(age, name);
\`\`\``,
      `let x = 5;\nconst y = "Hello, World!";\nconsole.log(x);\nconsole.log(y);\n`,
      "JavaScript Basics"
    ),
    javascriptLesson(
      3, "JavaScript Data Types", 8,
      "The built-in types: string, number, boolean, array, object — and typeof.",
      ["Common types: string, number, boolean, array, object", "typeof tells you a value's data type", "JavaScript has one number type for both integers and decimals"],
      `# JavaScript Data Types

JavaScript has several built-in data types:
- **string** — text, e.g. "hello"
- **number** — integers and decimals, e.g. 42 or 3.14
- **boolean** — true / false
- **array** — an ordered collection, e.g. [1, 2, 3]
- **object** — key/value pairs, e.g. { a: 1 }

Use typeof to check what you're working with:

\`\`\`javascript
let name = "Alex";
let age = 30;
let height = 1.75;
let isMember = true;

console.log(typeof name);
console.log(typeof age);
console.log(typeof height);
console.log(typeof isMember);
\`\`\``,
      `let name = "Alex";\nlet age = 30;\nlet height = 1.75;\nlet isMember = true;\n\nconsole.log(typeof name);\nconsole.log(typeof age);\nconsole.log(typeof height);\nconsole.log(typeof isMember);\n`,
      "JavaScript Basics"
    ),
    javascriptLesson(
      4, "JavaScript Strings", 8,
      "Quoting, concatenation, template literals and common string methods.",
      ["Strings can use single, double quotes, or backticks", "Template literals (`...`) embed variables with ${}", "slice(), toUpperCase() and length are common string tools"],
      `# JavaScript Strings

Strings are text, wrapped in single quotes, double quotes, or backticks:

\`\`\`javascript
let greeting = "Hello";
let name = 'World';
console.log(greeting + ", " + name + "!");
\`\`\`

## Template literals
The easiest way to mix variables into text is a template literal — backticks with \${...}:

\`\`\`javascript
let name = "Alex";
let age = 30;
console.log(\`\${name} is \${age} years old.\`);
\`\`\`

## Useful string methods
\`\`\`javascript
let text = "Hello, World!";
console.log(text.slice(0, 5));   // Hello
console.log(text.toUpperCase());
console.log(text.length);
\`\`\``,
      `let name = "Alex";\nlet age = 30;\nconsole.log(\`\${name} is \${age} years old.\`);\n\nlet text = "Hello, World!";\nconsole.log(text.slice(0, 5));\nconsole.log(text.toUpperCase());\n`,
      "JavaScript Basics"
    ),
    javascriptLesson(
      5, "JavaScript Arrays", 9,
      "Creating arrays, indexing, and the most common array methods.",
      ["An array holds an ordered, changeable list of items", "Indexing starts at 0", "push(), splice() and length are the methods you'll use most"],
      `# JavaScript Arrays

An array stores multiple items in a single variable:

\`\`\`javascript
let fruits = ["apple", "banana", "cherry"];
console.log(fruits);
console.log(fruits[0]);               // first item
console.log(fruits[fruits.length - 1]); // last item
\`\`\`

## Changing an array
\`\`\`javascript
let fruits = ["apple", "banana", "cherry"];
fruits.push("orange");
console.log(fruits);
console.log(fruits.length);
\`\`\`

## Looping over an array
\`\`\`javascript
for (const fruit of fruits) {
  console.log(fruit);
}
\`\`\``,
      `let fruits = ["apple", "banana", "cherry"];\nfruits.push("orange");\nconsole.log(fruits);\n\nfor (const fruit of fruits) {\n  console.log(fruit);\n}\n`,
      "Control Flow"
    ),
    javascriptLesson(
      6, "JavaScript If...Else", 9,
      "Comparison and logical operators, and writing conditional branches.",
      ["if, else if and else branch your program's logic", "Comparison operators: ===, !==, >, <, >=, <=", "Combine conditions with && and ||"],
      `# JavaScript If...Else

\`\`\`javascript
let age = 20;

if (age < 13) {
  console.log("Child");
} else if (age < 20) {
  console.log("Teenager");
} else {
  console.log("Adult");
}
\`\`\`

## Logical operators
Always use === (strict equality), not ==, to avoid type-coercion surprises.

\`\`\`javascript
let age = 20;
let hasId = true;

if (age >= 18 && hasId) {
  console.log("Entry allowed");
} else {
  console.log("Entry denied");
}
\`\`\``,
      `let age = 20;\nlet hasId = true;\n\nif (age >= 18 && hasId) {\n  console.log("Entry allowed");\n} else {\n  console.log("Entry denied");\n}\n`,
      "Control Flow"
    ),
    javascriptLesson(
      7, "JavaScript Loops", 9,
      "for loops, while loops, and break/continue.",
      ["for loops repeat a fixed number of times; while loops repeat while a condition holds", "break exits a loop early; continue skips to the next iteration", "for...of iterates directly over an array's values"],
      `# JavaScript Loops

## for loop
\`\`\`javascript
for (let i = 0; i < 5; i++) {
  console.log(i);
}
\`\`\`

## while loop
\`\`\`javascript
let count = 0;
while (count < 3) {
  console.log("count is", count);
  count++;
}
\`\`\`

## break and continue
\`\`\`javascript
for (let i = 0; i < 10; i++) {
  if (i === 3) continue; // skip 3
  if (i === 6) break;    // stop at 6
  console.log(i);
}
\`\`\``,
      `for (let i = 0; i < 5; i++) {\n  console.log(i);\n}\n\nlet count = 0;\nwhile (count < 3) {\n  console.log("count is", count);\n  count++;\n}\n`,
      "Control Flow"
    ),
    javascriptLesson(
      8, "JavaScript Functions", 10,
      "Defining reusable functions, default parameters, arrow functions and return values.",
      ["function defines a reusable block of code", "Parameters can have default values", "Arrow functions (=>) are a shorter function syntax"],
      `# JavaScript Functions

A function is a reusable block of code:

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("Alex"));
\`\`\`

## Default parameters
\`\`\`javascript
function greet(name = "World") {
  return \`Hello, \${name}!\`;
}

console.log(greet());
console.log(greet("JavaScript"));
\`\`\`

## Arrow functions
A shorter syntax, common in modern JavaScript:

\`\`\`javascript
const add = (a, b) => a + b;
console.log(add(4, 7));
\`\`\`

Now try writing your own function in the editor below — this is your final exercise for the JavaScript basics path.`,
      `function greet(name = "World") {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet());\nconsole.log(greet("JavaScript"));\n\nconst add = (a, b) => a + b;\nconsole.log(add(4, 7));\n`,
      "Control Flow"
    ),
  ],
});

const javaLesson = makeReadingLessonFactory("java", "https://docs.oracle.com/en/java/javase/21/docs/api/index.html", "Java docs");

seedCourses.push({
  slug: "java",
  title: "Java Programming",
  tagline: "Learn Java the w3schools way — short lessons with real, runnable-looking code examples.",
  category: "programming",
  level: "Beginner",
  tags: ["Java", "Programming", "Coding", "OOP"],
  cover: "from-red-600 via-orange-600 to-amber-600",
  addedAt: "2026-07-12",
  baseAssessment: "Write a short Java class (at least 15 lines) that uses a variable, a loop, a conditional and a method, and walk through what it would print.",
  lessons: [
    javaLesson(
      0, "Java Introduction", 6,
      "What Java is, why it's used, and the write-once-run-anywhere idea.",
      ["Java is a general-purpose, strongly-typed, object-oriented language", "Code compiles to bytecode that runs on the Java Virtual Machine (JVM)", "Used heavily in enterprise backends, Android apps and large systems"],
      `# Java Introduction

Java is a general-purpose, object-oriented programming language. It is strongly typed (every variable has a fixed type) and compiles to bytecode that runs on the Java Virtual Machine (JVM) — the same Java program can run on Windows, Mac or Linux without changes.

## Why Java?
- Strong typing catches many bugs before the program ever runs
- Runs anywhere the JVM is installed — "write once, run anywhere"
- The dominant language for Android apps and large enterprise backends

## A minimal Java program
Every Java program lives inside a **class**, and execution starts at a method called \`main\`:

\`\`\`java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
\`\`\`

\`System.out.println(...)\` is Java's equivalent of Python's \`print()\` — it writes a line to the console.`,
      "Java Basics"
    ),
    javaLesson(
      1, "Java Syntax", 7,
      "Classes, the main method, statements and semicolons, and comments.",
      ["Every Java program needs at least one class", "Execution starts at public static void main(String[] args)", "Statements end with a semicolon; // and /* */ start comments"],
      `# Java Syntax

## Classes and main()
Unlike Python, Java code can't exist outside a class. Execution always starts at \`main\`:

\`\`\`java
public class Main {
    public static void main(String[] args) {
        System.out.println("Learning Java");
    }
}
\`\`\`

## Comments
\`\`\`java
// This is a single-line comment
/* This is a
   multi-line comment */
System.out.println("This runs");
\`\`\`

## Semicolons
Every statement ends with a semicolon — missing one is the most common first mistake:

\`\`\`java
int x = 5;
System.out.println(x);
\`\`\``,
      "Java Basics"
    ),
    javaLesson(
      2, "Java Variables", 8,
      "Declaring typed variables, naming rules, and Java's static typing.",
      ["Every variable must be declared with a type (int, String, etc.)", "A variable's type cannot change once declared", "Variable names are case-sensitive and can't start with a number"],
      `# Java Variables

Unlike Python, Java is **statically typed** — you declare a variable's type, and it can never hold a different type afterward:

\`\`\`java
int x = 5;
String y = "Hello, World!";
System.out.println(x);
System.out.println(y);
\`\`\`

## Naming rules
- Must start with a letter, \$ or _, not a number
- Can contain letters, numbers and underscores
- Case-sensitive: \`age\`, \`Age\` and \`AGE\` are three different variables

## No changing type
\`\`\`java
int x = 5;
// x = "five"; // compile error — x is an int, always
x = 6; // fine — still an int
\`\`\``,
      "Java Basics"
    ),
    javaLesson(
      3, "Java Data Types", 9,
      "Primitive types (int, double, boolean, char) vs reference types (String, arrays).",
      ["Primitive types: int, double, boolean, char, long", "String is a reference type, not a primitive, but behaves like text usually does", "Each primitive type has a fixed size and range"],
      `# Java Data Types

Java has two kinds of types: **primitives** (built directly into the language) and **reference types** (objects).

## Common primitive types
- **int** — whole numbers, e.g. 42
- **double** — decimal numbers, e.g. 3.14
- **boolean** — true / false
- **char** — a single character, e.g. 'A'

## Reference types
- **String** — text, e.g. "hello" (technically an object, not a primitive)
- Arrays, e.g. \`int[] numbers = {1, 2, 3};\`

\`\`\`java
int age = 30;
double height = 1.75;
boolean isMember = true;
char grade = 'A';
String name = "Alex";

System.out.println(age);
System.out.println(height);
System.out.println(isMember);
System.out.println(grade);
System.out.println(name);
\`\`\``,
      "Java Basics"
    ),
    javaLesson(
      4, "Java Strings", 9,
      "Creating strings, concatenation, and common String methods.",
      ["Strings are created with double quotes", "+ concatenates strings (and converts other types to text)", "length(), substring() and toUpperCase() are common String methods"],
      `# Java Strings

Strings are text, wrapped in double quotes:

\`\`\`java
String greeting = "Hello";
String name = "World";
System.out.println(greeting + ", " + name + "!");
\`\`\`

## Mixing in other types
The + operator converts non-string values to text automatically:

\`\`\`java
String name = "Alex";
int age = 30;
System.out.println(name + " is " + age + " years old.");
\`\`\`

## Useful String methods
\`\`\`java
String text = "Hello, World!";
System.out.println(text.substring(0, 5)); // Hello
System.out.println(text.toUpperCase());
System.out.println(text.length());
\`\`\``,
      "Java Basics"
    ),
    javaLesson(
      5, "Java Arrays", 9,
      "Creating fixed-size arrays, indexing, and looping over them.",
      ["An array has a fixed size, set when it's created", "Indexing starts at 0", "A for-each loop (for (type item : array)) is the easiest way to iterate"],
      `# Java Arrays

An array stores a fixed number of values of the same type:

\`\`\`java
String[] fruits = {"apple", "banana", "cherry"};
System.out.println(fruits[0]);               // first item
System.out.println(fruits[fruits.length - 1]); // last item
System.out.println(fruits.length);
\`\`\`

## Looping over an array
\`\`\`java
String[] fruits = {"apple", "banana", "cherry"};
for (String fruit : fruits) {
    System.out.println(fruit);
}
\`\`\`

Unlike a Python list or JavaScript array, a Java array's size is fixed once created — for a growable list, Java has \`ArrayList\` (covered later in this path).`,
      "Control Flow"
    ),
    javaLesson(
      6, "Java If...Else", 9,
      "Comparison and logical operators, and writing conditional branches.",
      ["if, else if and else branch your program's logic", "Comparison operators: ==, !=, >, <, >=, <=", "Combine conditions with && and ||"],
      `# Java If...Else

\`\`\`java
int age = 20;

if (age < 13) {
    System.out.println("Child");
} else if (age < 20) {
    System.out.println("Teenager");
} else {
    System.out.println("Adult");
}
\`\`\`

## Logical operators
\`\`\`java
int age = 20;
boolean hasId = true;

if (age >= 18 && hasId) {
    System.out.println("Entry allowed");
} else {
    System.out.println("Entry denied");
}
\`\`\`

Note: use == to compare primitives like int and boolean, but .equals() to compare String objects — == on two String objects compares identity, not content.`,
      "Control Flow"
    ),
    javaLesson(
      7, "Java Loops", 9,
      "for loops, while loops, and break/continue.",
      ["for loops repeat a fixed number of times; while loops repeat while a condition holds", "break exits a loop early; continue skips to the next iteration"],
      `# Java Loops

## for loop
\`\`\`java
for (int i = 0; i < 5; i++) {
    System.out.println(i);
}
\`\`\`

## while loop
\`\`\`java
int count = 0;
while (count < 3) {
    System.out.println("count is " + count);
    count++;
}
\`\`\`

## break and continue
\`\`\`java
for (int i = 0; i < 10; i++) {
    if (i == 3) continue; // skip 3
    if (i == 6) break;    // stop at 6
    System.out.println(i);
}
\`\`\``,
      "Control Flow"
    ),
    javaLesson(
      8, "Java Methods", 10,
      "Defining reusable methods, parameters, return types, and a first look at classes.",
      ["A method is a reusable block of code, declared with a return type", "void means the method returns nothing", "Java methods live inside a class — this is the start of object-oriented programming"],
      `# Java Methods

A method is a reusable block of code. Unlike Python or JavaScript, you must declare its return type:

\`\`\`java
public class Main {
    static String greet(String name) {
        return "Hello, " + name + "!";
    }

    public static void main(String[] args) {
        System.out.println(greet("Alex"));
    }
}
\`\`\`

## void methods
A method that returns nothing uses \`void\` as its return type:

\`\`\`java
static void sayHello() {
    System.out.println("Hello!");
}
\`\`\`

## Parameters and return values
\`\`\`java
static int add(int a, int b) {
    return a + b;
}

int result = add(4, 7);
System.out.println(result);
\`\`\`

Every method you've seen so far is \`static\`, meaning it belongs to the class itself. Once you start creating objects from a class (e.g. \`new Car()\`), you'll write non-static methods that belong to each object — that's the next step into object-oriented programming.`,
      "Control Flow"
    ),
  ],
});

export const announcements = [
  { id: "a1", title: "Welcome, July 2026 cohort! 🎉", body: "Your onboarding learning paths are live. Start with your track's fundamentals this week.", at: "2026-07-01" },
  { id: "a2", title: "New path: Agentic AI", body: "11 lessons covering AI agents, core AI concepts and practical AI tools like ChatGPT and Lovable.dev.", at: "2026-06-20" },
  { id: "a3", title: "Badge showcase Friday", body: "Earn any path badge before Friday and get a shout-out at the all-hands.", at: "2026-06-28" },
];

export const upcomingPaths = [
  { id: "u1", title: "System Design Basics", eta: "August 2026", icon: "network" },
  { id: "u2", title: "Effective Communication", eta: "September 2026", icon: "message" },
  { id: "u3", title: "Cloud Foundations (AWS)", eta: "October 2026", icon: "cloud" },
];


export const leaderboardSeed = [
  { name: "Aarav Mehta", xp: 3250 },
  { name: "Sara Iyer", xp: 2980 },
  { name: "Dev Patel", xp: 2410 },
  { name: "Nina Rao", xp: 2100 },
  { name: "Kabir Shah", xp: 1875 },
];
