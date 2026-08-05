export type Audience = "learners" | "educators"

export type LearnerSeo = {
  readonly title: string
  readonly description: string
  readonly ogImagePath: string
  readonly ogImageAlt: string
}

export type EducatorSeo = {
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

/**
 * The hero's launch-video chip.
 *
 * `label` says the format and nothing else. It deliberately does not carry the
 * video's own title — that title is the learner headline word for word, and a
 * chip repeating the h1 above it reads as an echo rather than an announcement.
 * Runtime and platform are left out for the same reason: neither changes
 * anyone's mind about clicking, and both add a second line of type to an object
 * that has to be read at a glance.
 *
 * `title` is the real video title, used where a machine needs it — the iframe's
 * accessible name and the dialog's label.
 */
export type LaunchVideo = {
  readonly badge: string
  readonly label: string
  readonly title: string
}

export type LearnerFeatureVisual =
  | "learner-draw"
  | "learner-play"
  | "learner-read"
  | "learner-remember"
  | "learner-vault"

export type LearnerFeatureItem = {
  readonly tag: string
  readonly title: string
  readonly subtext: string
  readonly visual: LearnerFeatureVisual
}

export type EducatorFeatureVisual =
  | "educator-assess"
  | "educator-build"
  | "educator-differentiate"
  | "educator-plan"

export type EducatorFeatureItem = {
  readonly tag: string
  readonly title: string
  readonly subtext: string
  readonly visual: EducatorFeatureVisual
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

/**
 * The three marks the pricing section can render, one per way of supplying AI.
 * Declared here rather than in lib/constants.ts because that module already
 * type-imports from this one.
 */
export const PRICING_ICON_OPENAI = "openai"
export const PRICING_ICON_KEY = "key"
export const PRICING_ICON_OLLAMA = "ollama"

export type PricingIcon =
  | typeof PRICING_ICON_OPENAI
  | typeof PRICING_ICON_KEY
  | typeof PRICING_ICON_OLLAMA

export type PricingWay = {
  readonly icon: PricingIcon
  readonly label: string
}

/**
 * The price section. Two groups, and the split between them is the whole point:
 * `price`/`caption` say what the app costs, `statement`/`ways` say what you
 * supply instead. Keeping them apart is what stops readers taking the models to
 * be free too.
 */
export type Pricing = {
  readonly price: string
  readonly caption: string
  readonly statement: string
  readonly ways: readonly [PricingWay, PricingWay, PricingWay]
}

export type LearnerDownload = {
  readonly headlineLines: readonly [string, string]
}

export type EducatorDownload = {
  readonly eyebrow?: string
  readonly headlineLines: readonly [string, string]
}

export type LearnerHero = {
  readonly headlineLines: readonly [string, string]
  readonly subtext: string
}

export type LearnerPhilosophyItem = {
  readonly label: string
  readonly detail: string
}

export type LearnerPhilosophy = {
  readonly headline: string
  readonly subtext?: string
  readonly items: readonly [
    LearnerPhilosophyItem,
    LearnerPhilosophyItem,
    LearnerPhilosophyItem,
    LearnerPhilosophyItem,
  ]
  readonly closingStatement: string
}

export type EducatorHero = {
  readonly headlineLines: readonly [string, string]
  readonly subtext: string
}

export type LearnerLandingContent = {
  readonly seo: LearnerSeo
  readonly hero: LearnerHero
  readonly features: readonly LearnerFeatureItem[]
  readonly philosophy: LearnerPhilosophy
  readonly download: LearnerDownload
}

export type EducatorLandingContent = {
  readonly seo: EducatorSeo
  readonly hero: EducatorHero
  readonly features: readonly EducatorFeatureItem[]
  readonly download: EducatorDownload
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
  readonly shareCopyLabel: string
  readonly shareCopiedLabel: string
  readonly shareCopiedText: string
  readonly shareFailedText: string
  readonly shareFallbackText: string
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

// The artifact tiles themselves (quiz card, flashcard, whiteboard, …)
// are bespoke markup in LearnerLivesSection.astro, same convention as
// the workspace mocks.
export type LearnerLives = {
  readonly headlineLines: readonly [string, string]
  readonly closing: string
}

export type LearnerCapabilities = {
  readonly headline: string
  readonly subtext: string
  readonly primary: readonly string[]
  readonly secondary: readonly string[]
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

/**
 * Present tense on "free" on purpose — "forever" is a promise the page would be
 * stuck with. The count tracks the provider catalog the launch video rolls
 * (packages/videos/src/providerCatalog.ts, 157 names), so 150+ stays true as it
 * moves. Free models are deliberately unmentioned: the point is reach, not a
 * freebie.
 */
const pricing: Pricing = {
  price: "$0",
  caption: "The app is free.",
  statement: "Connect any model or subscription, from 150+ AI providers.",
  ways: [
    { icon: PRICING_ICON_OPENAI, label: "Connect ChatGPT" },
    { icon: PRICING_ICON_KEY, label: "Use API keys" },
    { icon: PRICING_ICON_OLLAMA, label: "Run local models" },
  ],
}

const learnerPhilosophy: LearnerPhilosophy = {
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

const launchVideo: LaunchVideo = {
  badge: "New",
  label: "Launch video",
  title: "Buddy: An AI Agent for the Curious",
}

const learnerSeo: LearnerSeo = {
  title: "Buddy · An AI agent for the curious",
  description:
    "Buddy is a desktop AI agent for the curious. Bring your books and notes, research questions, think on a whiteboard, and build simulations in one place.",
  ogImagePath: "/og-ai-agent-for-the-curious.png",
  ogImageAlt: "Buddy: an AI agent for the curious",
}

const educatorSeo: EducatorSeo = {
  title: "Buddy · AI teaching partner on your computer",
  description:
    "Free AI teaching partner for Mac and Windows. Plan lessons, differentiate worksheets, build quizzes, and keep class files on your machine. No account. No cloud. Your data stays yours.",
  ogImagePath: "/og-ai-teaching-partner.png",
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
  twitterHandle: "@hibuddyai",
  organizationSameAs: [
    "https://x.com/hibuddyai",
    "https://www.youtube.com/@hibuddyin",
    "https://www.linkedin.com/company/hibuddy-in",
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
  shareCopyLabel: "Copy download link",
  shareCopiedLabel: "Link copied",
  shareCopiedText: "Link copied. Send it to your computer to install Buddy.",
  shareFailedText: "Copy is blocked here. Use your browser's Share button instead.",
  shareFallbackText: "Sharing didn't open. Tap Copy download link.",
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

const educatorWhy: WhySection = {
  headline: "The job grew. The week didn't.",
  askLabel: "Sunday · 7:14 pm · you ask once",
  askPrompt:
    "Plan next week: area and perimeter, grade 4. Half my class is still shaky on multiplication.",
  closing: "By 7:19, the week is on your desk. You keep the teaching, and your Sunday.",
}

const learnerLives: LearnerLives = {
  headlineLines: ["For everything you'll", "ever learn."],
  closing:
    "Whatever you're learning, for a grade, a career, or the joy of it, Buddy meets you there.",
}

const learnerCapabilities: LearnerCapabilities = {
  headline: "There's more in the box.",
  /**
   * Deliberately does not list anything. The feature steps above already walk
   * through books, notes, whiteboard, simulations and flashcards, and the
   * marquee below names them again as chips, so an enumerating subtext was the
   * same information a third time and made "more" ring false.
   */
  subtext:
    "Whatever you end up studying, the tool for it is already sitting there, ready the moment you think to ask for it.",
  primary: [
    "Ebook reader",
    "Whiteboards",
    "Research",
    "Simulations",
    "Games",
    "Flashcards",
    "Notes",
    "Quizzes",
  ],
  secondary: [
    "Image generation",
    "Skills",
    "Local-first",
    "File editor",
    "Subagents",
    "MCP",
    "50+ models",
    "Themes",
  ],
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
      headlineLines: ["An AI agent", "for the curious."],
      subtext:
        "Read books, bring your notes, research, draw on a whiteboard, build simulations, and practice with flashcards, all in one place.",
    },
    features: [
      {
        tag: "READ",
        title: "Bring your Books to Buddy.",
        subtext:
          "Open a PDF or EPUB beside the conversation. Highlight a passage, ask about it, and keep the source in view while you learn.",
        visual: "learner-read",
      },
      {
        tag: "CONNECT",
        title: "Bring your Notes to Buddy.",
        subtext:
          "Open your existing Obsidian vault. Wikilinks, embeds, and callouts continue working, and Buddy can read and write plain Markdown in the same folder.",
        visual: "learner-vault",
      },
      {
        tag: "DRAW",
        title: "Think with Buddy on a Whiteboard.",
        subtext:
          "Ask Buddy to sketch an idea step by step, then take over the board yourself. Map a chapter, diagram a system, untangle a proof.",
        visual: "learner-draw",
      },
      {
        tag: "PLAY",
        title: "Ask Buddy for a Simulation.",
        subtext:
          "Turn an explanation into a game, model, or interactive experiment you can actually use. Buddy writes the code, you shape the outcome.",
        visual: "learner-play",
      },
      {
        tag: "REMEMBER",
        title: "Buddy helps you Remember.",
        subtext:
          "Ask for a quiz or flashcards, and the deck lands in the app. Buddy uses smart spaced-repetition and deliberate practice techniques to help you remember.",
        visual: "learner-remember",
      },
    ] as const,
    philosophy: learnerPhilosophy,
    download: {
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
        visual: "educator-plan",
      },
      {
        tag: "DIFFERENTIATE",
        title: "One task, ready for every reading level.",
        subtext:
          "Buddy writes each worksheet at three levels: support, on-level, and extension, with worked examples, guided practice, and independent work, so no student is lost or bored.",
        visual: "educator-differentiate",
      },
      {
        tag: "ASSESS",
        title: "A quiz and its answer key, in one ask.",
        subtext:
          "Ask for a formative check, a question set, or a flashcard deck. Buddy tags each question by Bloom's level, hands you the answer key, and flags the misconceptions to watch for.",
        visual: "educator-assess",
      },
      {
        tag: "BUILD",
        title: "Turn any topic into something to show.",
        subtext:
          "Ask for a simulation, an interactive diagram, or a slide deck. Buddy builds it and opens it right in the app, ready for class tomorrow, no coding required.",
        visual: "educator-build",
      },
    ] as const,
    download: {
      eyebrow: "Free · Mac & Windows · No account",
      headlineLines: ["Tomorrow's lesson,", "one ask away."],
    },
  },
  bringYourOwn,
  capabilities,
  pricing,
  header,
  launchVideo,
  install,
  meta,
  notFound,
  educatorWhy,
  educatorFluency,
  learnerCapabilities,
  learnerLives,
  educatorFeatureNarrative,
} as const satisfies {
  learners: LearnerLandingContent
  educators: EducatorLandingContent
  bringYourOwn: BringYourOwn
  capabilities: Capabilities
  pricing: Pricing
  header: Header
  launchVideo: LaunchVideo
  install: Install
  meta: Meta
  notFound: NotFound
  educatorWhy: WhySection
  educatorFluency: EducatorFluency
  learnerCapabilities: LearnerCapabilities
  learnerLives: LearnerLives
  educatorFeatureNarrative: string
}
