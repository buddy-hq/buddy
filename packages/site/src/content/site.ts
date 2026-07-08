export type Audience = "learners" | "educators"

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
  readonly tagline: string
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
  readonly title: string
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
    "No account, no cloud, no tracking. Your curriculum and your learners' data never leave your computer.",
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
      detail: "We can't see what you teach. Your chats go to your AI provider.",
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

const meta: Meta = {
  siteUrl: "https://hibuddy.in",
  siteName: "Buddy",
  defaultTitle: "Buddy - Agentic Learning Companion for Mac and Windows",
  defaultDescription:
    "Learn with a local-first AI desktop app for students and educators. Use your own AI, keep files on your computer, and make study stick. Download Buddy.",
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
  title: "made for you",
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

export const content = {
  learners: {
    hero: {
      headlineLines: ["A learning buddy", "that lives on your computer."],
      subtext:
        "Read, understand, and remember with a learning companion that never leaves your side.",
    },
    featuresHeader: {
      headline: "Built for how you actually learn.",
      subtext: "",
    },
    features: [
      {
        tag: "READ",
        title: "Read, with Buddy at your side.",
        subtext:
          "Bring your ebooks, PDFs, or papers. Buddy reads alongside you. Ask for summaries, save highlights, take notes.",
      },
      {
        tag: "PLAY",
        title: "Make games and apps to learn.",
        subtext:
          "Turn any topic into a game. Buddy can create games, interactive apps, or anything else you can imagine.",
      },
      {
        tag: "DRAW",
        title: "Draw on Excalidraw boards.",
        subtext:
          "Buddy can sketch for you or see what you're sketching. Ask for diagrams, map concepts, or visualize structures.",
      },
      {
        tag: "QUIZ",
        title: "Test yourself, with Quizzes.",
        subtext: "Ask Buddy to generate a quiz on any resource, book, or topic you are studying.",
      },
      {
        tag: "REMEMBER",
        title: "Make it stick, with Flashcards.",
        subtext:
          "Stop forgetting what you learned. Buddy turns your reading and chats into flashcards. Review on your schedule.",
      },
    ] as const,
    philosophy: learnersPhilosophy,
    download: {
      tagline: "The learning superapp",
    },
  },
  educators: {
    hero: {
      headlineLines: ["A teaching buddy", "for whatever's next on your list."],
      subtext: "Plan, create, and assess with a teaching assistant that lives on your computer.",
    },
    featuresHeader: {
      headline: "Built for how you actually teach.",
      subtext: "",
    },
    features: [
      {
        tag: "ALIGN",
        title: "Align content to standards or books.",
        subtext:
          "Buddy comes with built-in CCSS, NGSS, and all-U.S.-state standards. For Indian teachers, it can download NCERT and state board books, DIKSHA resources, and any public resource published on GOI websites.",
      },
      {
        tag: "PLAN",
        title: "Plan with any learning framework.",
        subtext:
          "Buddy can align your content to Bloom levels, DOK levels, or Piaget's stages. It can sequence your lessons using instruction models. It can also help you with materials for project-based learning, SEL, scaffolding, and formative and summative assessment.",
      },
      {
        tag: "CREATE",
        title: "Create docs, presentations, or spreadsheets.",
        subtext:
          "Buddy can create worksheets or lesson plans for your students. And it can create reports, presentations, or spreadsheets for your peers. All ready to export.",
      },
      {
        tag: "RESEARCH",
        title: "Research around your material.",
        subtext:
          "Upload your PDFs, ebooks, documents, or web links. Buddy can parse, understand, and answer questions about them. Buddy has a built-in ebook reader, whiteboarding area, and source system to make your research easier.",
      },
      {
        tag: "BUILD",
        title: "Build interactive experiences.",
        subtext:
          "Ask for an app, a game, or a website, and Buddy builds and publishes it, ready to share with students or peers. Every teacher, a builder.",
      },
    ] as const,
    philosophy: educatorsPhilosophy,
    download: {
      tagline: "The teaching superapp",
    },
  },
  bringYourOwn,
  capabilities,
  header,
  install,
  meta,
} as const satisfies Record<
  Audience,
  {
    hero: {
      headlineLines: readonly [string, string]
      subtext: string
    }
    featuresHeader: {
      readonly headline: string
      readonly subtext: string
    }
    features: readonly [FeatureItem, FeatureItem, FeatureItem, FeatureItem, FeatureItem]
    philosophy: Philosophy
    download: Download
  }
> & {
  bringYourOwn: BringYourOwn
  capabilities: Capabilities
  header: Header
  install: Install
  meta: Meta
}
