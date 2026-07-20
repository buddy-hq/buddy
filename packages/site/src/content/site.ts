export type Audience = "learners" | "educators"

export type Seo = {
  readonly title: string
  readonly description: string
  readonly ogImagePath: string
  readonly ogImageAlt: string
}

export type Header = {
  readonly brandName: string
  readonly audienceLearnersLabel: string
  readonly audienceEducatorsLabel: string
  readonly downloadLabel: string
}

export type FeatureItem = {
  readonly tag: string
  readonly title: string
  readonly subtext: string
}

export type LoginOption = {
  readonly name: string
  readonly icon: string
  readonly description: string
}

export type BYOOption = {
  readonly title: string
  readonly description: string
}

export type BringYourOwn = {
  readonly headline: string
  readonly subtext: string
  readonly primary: LoginOption
  readonly secondary: {
    readonly label: string
    readonly options: readonly string[]
    readonly providers: readonly string[]
    readonly providerCount: string
  }
  readonly promo: string
  readonly options: readonly [BYOOption, BYOOption, BYOOption, BYOOption]
}

export type Download = {
  readonly eyebrow?: string
  readonly headlineLines: readonly [string, string]
}

export type PhilosophyItem = {
  readonly label: string
  readonly detail: string
}

export type Philosophy = {
  readonly headline: string
  readonly subtext?: string
  readonly items: readonly [PhilosophyItem, PhilosophyItem, PhilosophyItem, PhilosophyItem]
  readonly closingStatement: string
}

export type CapabilityItem = {
  readonly name: string
  readonly detail: string
}

export type Capabilities = {
  readonly headline: string
  readonly subtext: string
  readonly items: readonly [
    CapabilityItem,
    CapabilityItem,
    CapabilityItem,
    CapabilityItem,
    CapabilityItem,
  ]
}

export type InstallStep = {
  readonly title: string
  readonly desc: string
}

export type InstallOS = {
  readonly modalTitle: string
  readonly terminal: string
  readonly prefix: string
  readonly steps: readonly [InstallStep, InstallStep, InstallStep]
}

export type Install = {
  readonly downloadMac: string
  readonly downloadWin: string
  readonly copyLabel: string
  readonly copiedLabel: string
  readonly shareLabel: string
  readonly shareCopiedLabel: string
  readonly shareTitle: string
  readonly shareText: string
  readonly mac: InstallOS
  readonly win: InstallOS
}

export type Meta = {
  readonly siteUrl: string
  readonly siteName: string
  readonly defaultTitle: string
  readonly defaultDescription: string
  readonly defaultOgImagePath: string
  readonly defaultOgImageAlt: string
  readonly twitterHandle: string
  readonly organizationSameAs: readonly [string, string, string]
  readonly analytics: {
    readonly postHogCaptureEndpoint: string
    readonly postHogProjectToken: string
  }
  readonly ogImageWidth: string
  readonly ogImageHeight: string
  readonly jsonLd: {
    readonly applicationCategory: string
    readonly operatingSystem: string
    readonly price: string
    readonly priceCurrency: string
  }
}

export type PrivacyLine = {
  readonly muted: string
  readonly strong: string
}

export type Privacy = {
  readonly eyebrow: string
  readonly headline: string
  readonly lines: readonly [PrivacyLine, PrivacyLine, PrivacyLine, PrivacyLine]
  readonly pivot: string
}

// The prep artifacts on the desk (week plan, worksheet versions, quiz
// with key, warm-up slip) are bespoke markup in WhySection.astro, same
// convention as the workspace mocks.
export type WhySection = {
  readonly headline: string
  readonly askLabel: string
  readonly askPrompt: string
  readonly closing: string
}

export type EducatorFluency = {
  readonly headline: string
  readonly subtext: string
  readonly standards: readonly string[]
  readonly frameworks: readonly string[]
}

export type AnswerItem = {
  readonly q: string
  readonly a: string
  readonly chips?: readonly string[]
}

export type Answers = {
  readonly eyebrow: string
  readonly headline: string
  readonly items: readonly AnswerItem[]
}

// The artifact tiles themselves (quiz card, flashcard, whiteboard, …)
// are bespoke markup in LearnerLivesSection.astro, same convention as
// the workspace mocks.
export type LearnerLives = {
  readonly headline: string
  readonly closing: string
}

export type NotFound = {
  readonly title: string
  readonly description: string
  readonly kicker: string
  readonly headline: string
  readonly subtext: string
  readonly homeLabel: string
}

const bringYourOwn: BringYourOwn = {
  headline: "Bring your own AI.",
  subtext: "No pricing page, no subscriptions to sell. Your ChatGPT, your keys, your local models.",
  primary: {
    name: "ChatGPT",
    icon: "openai",
    description: "Use Free, Plus, or Pro subscriptions.",
  },
  secondary: {
    label: "",
    options: ["API keys"],
    providers: ["Opencode", "Google", "Copilot"],
    providerCount: "50",
  },
  promo: "A few models are free out of the box",
  options: [
    {
      title: "Free models",
      description: "Free models included to start.",
    },
    {
      title: "Use ChatGPT",
      description: "Log in with Go, Plus, Pro.",
    },
    {
      title: "API keys",
      description: "Bring your own API keys.",
    },
    {
      title: "Local models",
      description: "Log in with Ollama.",
    },
  ],
}

const learnersPhilosophy: Philosophy = {
  headline: "What you learn is yours.",
  subtext:
    "No account, no cloud, no tracking. Your chats, notes, and files stay on your computer, forever.",
  items: [
    {
      label: "No logins",
      detail: "Open the app and start. No sign-up, no password, nothing to cancel later.",
    },
    {
      label: "On device",
      detail: "Your notes and files live on your computer. Only the model calls need internet.",
    },
    {
      label: "Asks permission",
      detail: "Buddy asks before it does anything. You approve every file and action.",
    },
    {
      label: "No tracking",
      detail: "We can't see what you study. Your chats go to your AI provider.",
    },
  ],
  closingStatement: "",
}

const educatorsPhilosophy: Philosophy = {
  headline: "Your classroom, your data.",
  subtext:
    "No account, no cloud, no student data leaving the room. Your curriculum, assessments, and student work stay on your machine.",
  items: [
    {
      label: "No account needed",
      detail: "Open the app and start. No sign-up, no password, no district IT ticket.",
    },
    {
      label: "Local-first",
      detail:
        "All files, lessons, and student data live on your computer. Only model calls go to your AI provider.",
    },
    {
      label: "You approve every action",
      detail: "Buddy asks before it reads, writes, or runs anything. Full permission control.",
    },
    {
      label: "Zero telemetry",
      detail:
        "We can't see what you teach or who your students are. No analytics, no tracking, no data collection.",
    },
  ],
  closingStatement: "",
}

const capabilities: Capabilities = {
  headline: "A frontier agent, at your command.",
  subtext:
    "Buddy is your learning companion, but it can do everything a frontier agent like Codex, OpenClaw, or Claude Code can.",
  items: [
    {
      name: "Subagents",
      detail: "Delegate tasks to worker agents that run in parallel.",
    },
    {
      name: "MCPs",
      detail: "Connect external tools and extend Buddy's capabilities.",
    },
    {
      name: "Skills",
      detail: "Use built-in skills, choose from a curated library, or bring your own.",
    },
    {
      name: "Tools",
      detail: "Learn or do things on your device with 30+ Buddy tools.",
    },
    {
      name: "AGENTS.md",
      detail: "Customize Buddy's behavior to your taste and style.",
    },
  ],
}

const header: Header = {
  brandName: "Buddy",
  audienceLearnersLabel: "For Learners",
  audienceEducatorsLabel: "For Educators",
  downloadLabel: "Download",
}

const learnerSeo: Seo = {
  title: "Buddy · Learning buddy on your computer",
  description:
    "A free learning buddy for Mac and Windows. Read with Buddy, think on a whiteboard, play simulations, quiz yourself, and keep notes in files you own. No account. Local-first.",
  ogImagePath: "/og-learning-superapp.png",
  ogImageAlt: "Buddy: learning buddy on your computer",
}

const educatorSeo: Seo = {
  title: "Buddy · AI teaching partner on your computer",
  description:
    "Free AI teaching partner for Mac and Windows. Plan lessons, differentiate worksheets, build quizzes, and keep class files on your machine. No account. No cloud. Your data stays yours.",
  ogImagePath: "/og-teaching-superapp.png",
  ogImageAlt: "Buddy: AI teaching partner for educators",
}

const notFound: NotFound = {
  title: "Page not found · Buddy",
  description: "That page isn't here. Head home, or jump to teachers, compare, or docs.",
  kicker: "404",
  headline: "This page got lost.",
  subtext: "Nothing here matches that URL.",
  homeLabel: "Back home",
}

const meta: Meta = {
  siteUrl: "https://hibuddy.in",
  siteName: "Buddy",
  defaultTitle: learnerSeo.title,
  defaultDescription: learnerSeo.description,
  defaultOgImagePath: learnerSeo.ogImagePath,
  defaultOgImageAlt: learnerSeo.ogImageAlt,
  twitterHandle: "@prashant_hq",
  organizationSameAs: [
    "https://x.com/prashant_hq",
    "https://github.com/prashantbhudwal",
    "https://www.linkedin.com/in/prashantbhudwal/",
  ],
  analytics: {
    postHogCaptureEndpoint: "https://us.i.posthog.com/i/v0/e/",
    postHogProjectToken: "phc_kK4K3GjXXwroa6dEM8tzCa8HVLWh63vKS3cGoLgNiqdv",
  },
  ogImageWidth: "1200",
  ogImageHeight: "630",
  jsonLd: {
    applicationCategory: "EducationApplication",
    operatingSystem: "macOS, Windows",
    price: "0",
    priceCurrency: "USD",
  },
}

const install: Install = {
  downloadMac: "Download for Mac",
  downloadWin: "Download for Windows",
  copyLabel: "Copy",
  copiedLabel: "Copied!",
  shareLabel: "Send download link",
  shareCopiedLabel: "Link copied",
  shareTitle: "Download Buddy for desktop",
  shareText: "Open this link on your computer to install Buddy for macOS or Windows.",
  mac: {
    modalTitle: "Install Buddy for macOS",
    terminal: "Terminal",
    prefix: "$",
    steps: [
      { title: "Copy Command", desc: "Copy command above" },
      { title: "Open Terminal", desc: "Press ⌘+Space & type Terminal" },
      { title: "Run", desc: "Paste & press Return" },
    ],
  },
  win: {
    modalTitle: "Install Buddy for Windows",
    terminal: "PowerShell",
    prefix: "PS>",
    steps: [
      { title: "Copy Command", desc: "Copy command above" },
      { title: "Open PowerShell", desc: "Press Win & type PowerShell" },
      { title: "Run", desc: "Paste & press Enter" },
    ],
  },
}

const learnersPrivacy: Privacy = {
  eyebrow: "No account · No cloud · No telemetry",
  headline: "What you learn is yours.",
  lines: [
    { muted: "We can't see", strong: "what you read." },
    { muted: "We can't see", strong: "what you ask." },
    { muted: "We can't see", strong: "who you are." },
    { muted: "We can't even", strong: "count you." },
  ],
  pivot:
    "Not by policy, by architecture. Your notes and files stay on your computer; only model calls leave, to your AI provider, with your keys. And Buddy asks before it reads, writes, or runs anything.",
}

const educatorsPrivacy: Privacy = {
  eyebrow: "No account · No cloud · No telemetry",
  headline: "Your classroom, your data.",
  lines: [
    { muted: "We can't see", strong: "what you teach." },
    { muted: "We can't see", strong: "your students." },
    { muted: "We can't see", strong: "who you are." },
    { muted: "We can't even", strong: "count you." },
  ],
  pivot:
    "Not by policy, by architecture. Curriculum, assessments, and student work stay on your machine; only model calls leave, to your AI provider, with your keys. And Buddy asks before it reads, writes, or runs anything.",
}

const educatorWhy: WhySection = {
  headline: "The job grew. The week didn't.",
  askLabel: "Sunday · 7:14 pm · you ask once",
  askPrompt:
    "Plan next week: area and perimeter, grade 4. Half my class is still shaky on multiplication.",
  closing: "By 7:19, the week is on your desk. You keep the teaching, and your Sunday.",
}

const educatorAnswers: Answers = {
  eyebrow: "Straight answers",
  headline: "The fine print, up front.",
  items: [
    {
      q: "Where does student work go?",
      a: "Nowhere. Buddy lives on your computer. Lessons, materials, and student work stay on your machine. Only AI calls leave, to your provider, with your keys. We can't see your classroom; we can't even count you.",
    },
    {
      q: "What does it cost?",
      a: "Nothing. Buddy is free: no pricing page, no subscription, no trial that expires mid-semester.",
    },
    {
      q: "So who pays for the AI?",
      a: "You bring the AI you already have: log in with your ChatGPT plan, paste an API key, or run local models. A few free models are included, so you can start tonight.",
      chips: ["ChatGPT login", "API keys", "Ollama", "Free models included"],
    },
  ],
}

const learnerAnswers: Answers = {
  eyebrow: "Straight answers",
  headline: "The fine print, up front.",
  items: [
    {
      q: "Is this another chatbot wrapper?",
      a: "No. Buddy is a full agent, the same breed as Claude Code or Codex, raised for learning instead of code. It reads your files, builds real apps and boards, and asks before it touches anything.",
    },
    {
      q: "Where does my data go?",
      a: "Nowhere. Buddy lives on your computer. Notes, chats, and files stay on your machine, as plain files you can open without Buddy. Only AI calls leave, to your provider, with your keys.",
    },
    {
      q: "What does it cost?",
      a: "Nothing. Buddy is free: no pricing page, no subscription, no trial that expires. A few models are included so you can start right now.",
    },
    {
      q: "Where does the AI come from?",
      a: "You bring the AI you already have: log in with your ChatGPT plan, paste an API key, or run local models. Your keys, your provider, your choice.",
      chips: ["ChatGPT login", "API keys", "Ollama", "Free models included"],
    },
  ],
}

const learnerLives: LearnerLives = {
  headline: "For everything you'll ever learn.",
  closing:
    "Whatever you're learning, for a grade, a career, or the joy of it, Buddy meets you there.",
}

const educatorFeatureNarrative =
  "One unit: photosynthesis, grade 8, from the first ask to Friday's quiz."

const educatorFluency: EducatorFluency = {
  headline: "Fluent in your standards. Grounded in learning science.",
  subtext:
    "Wherever you teach, whether a US public school, an Indian classroom, or your own kitchen table, Buddy plans in the language of your curriculum.",
  standards: [
    "CCSS",
    "NGSS",
    "All 50 US state standards",
    "NCERT",
    "DIKSHA",
    "Indian state boards",
    "Your own textbooks",
    "Your own framework",
  ],
  frameworks: [
    "Bloom's Taxonomy",
    "Webb's DOK",
    "Understanding by Design",
    "UDL",
    "5E Model",
    "Explicit instruction",
    "Gradual release",
    "Formative assessment",
    "SOLO Taxonomy",
    "Hess Cognitive Rigor",
    "SIOP",
    "Project-based learning",
    "CASEL SEL",
    "Visible thinking",
  ],
}

export const content = {
  learners: {
    seo: learnerSeo,
    hero: {
      headlineLines: ["For the pleasure of", "finding things out."],
      subtext:
        "A learning buddy on your computer. It reads the page with you, thinks with you on a whiteboard, builds simulations you can play, and keeps every note in files you own.",
    },
    features: [
      {
        tag: "READ",
        title: "Read it with someone who's read it.",
        subtext:
          "Drop in a PDF or EPUB and it opens in a reader beside the chat. Highlight as you go, then ask about the paragraph you're stuck on. Buddy answers from the page in front of you, not from a vague memory of the book.",
      },
      {
        tag: "DRAW",
        title: "Think it out on a whiteboard.",
        subtext:
          "Every chat gets a live Excalidraw board. Buddy draws on it step by step while you watch, and you can pick up the pen yourself once the turn settles. Map a chapter, diagram a system, untangle a proof.",
      },
      {
        tag: "PLAY",
        title: "Don't just read it. Play with it.",
        subtext:
          "Ask for a simulation, a game, an interactive anything. Buddy builds it and opens it on the Bench, saved into your notebook as a real file, sandboxed, with no code and no setup on your side.",
      },
      {
        tag: "REMEMBER",
        title: "Quiz it. Card it. Keep it.",
        subtext:
          "Ask for a quiz or type /flashcard, and the deck lands in Practice. Question sets grade on submit and explain what you missed; cards come back on a spaced schedule you rate Again, Hard, Good, or Easy.",
      },
      {
        tag: "CONNECT",
        title: "Buddy speaks Obsidian.",
        subtext:
          "Open your Obsidian vault and Buddy adapts to it, natively. Wikilinks, embeds, and callouts work in the Buddy editor, links resolve between notes, and the agent stays anchored to that vault.",
      },
    ] as const,
    philosophy: learnersPhilosophy,
    privacy: learnersPrivacy,
    download: {
      eyebrow: "Free · Mac & Windows · No account",
      headlineLines: ["Whatever you're learning,", "bring it home."],
    },
  },
  educators: {
    seo: educatorSeo,
    hero: {
      headlineLines: ["Plan less.", "Teach more."],
      subtext:
        "An AI teaching partner that lives on your computer. Give it a topic and your class, and it drafts a lesson you can teach tomorrow, in the standards you teach, on a machine only you can see.",
    },
    features: [
      {
        tag: "PLAN",
        title: "Plan a lesson in the standards you teach.",
        subtext:
          "Give Buddy a topic, a grade, and your class. It drafts the lesson: objectives, sequence, timing, exit ticket, mapped to the standards you teach, or to your own textbooks and framework.",
      },
      {
        tag: "DIFFERENTIATE",
        title: "One task, ready for every reading level.",
        subtext:
          "Buddy writes each worksheet at three levels: support, on-level, and extension, with worked examples, guided practice, and independent work, so no student is lost or bored.",
      },
      {
        tag: "ASSESS",
        title: "A quiz and its answer key, in one ask.",
        subtext:
          "Ask for a formative check, a question set, or a flashcard deck. Buddy tags each question by Bloom's level, hands you the answer key, and flags the misconceptions to watch for.",
      },
      {
        tag: "BUILD",
        title: "Turn any topic into something to show.",
        subtext:
          "Ask for a simulation, an interactive diagram, or a slide deck. Buddy builds it and opens it right in the app, ready for class tomorrow, no coding required.",
      },
    ] as const,
    philosophy: educatorsPhilosophy,
    privacy: educatorsPrivacy,
    download: {
      eyebrow: "Free · Mac & Windows · No account",
      headlineLines: ["Tomorrow's lesson,", "one ask away."],
    },
  },
  bringYourOwn,
  capabilities,
  header,
  install,
  meta,
  notFound,
  educatorWhy,
  educatorFluency,
  educatorAnswers,
  learnerAnswers,
  learnerLives,
  educatorFeatureNarrative,
} as const satisfies Record<
  Audience,
  {
    seo: Seo
    hero: {
      headlineLines: readonly [string, string]
      subtext: string
    }
    features: readonly FeatureItem[]
    philosophy: Philosophy
    privacy: Privacy
    download: Download
  }
> & {
  bringYourOwn: BringYourOwn
  capabilities: Capabilities
  header: Header
  install: Install
  meta: Meta
  notFound: NotFound
  educatorWhy: WhySection
  educatorFluency: EducatorFluency
  educatorAnswers: Answers
  learnerAnswers: Answers
  learnerLives: LearnerLives
  educatorFeatureNarrative: string
}
