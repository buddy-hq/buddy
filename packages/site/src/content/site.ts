export type Audience = "learners" | "educators"

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
  promo: "Free models included for a limited time.",
}

const learnersPhilosophy: Philosophy = {
  headline: "What you learn is yours.",
  subtext: "No account, no cloud, no tracking. Your data never leaves your computer.",
  items: [
    {
      label: "No logins",
      detail: "Open the app and start. No sign-up, no password, nothing to cancel later.",
    },
    {
      label: "On device",
      detail: "Your notes, chats, and files live on your computer. No internet needed.",
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
      detail: "Your curriculum and lessons live on your computer. No internet needed.",
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
  headline: "Not a wrapper around ChatGPT.",
  subtext:
    "A complete agent system with its own tools, skills, and subagents. Running entirely on your machine.",
  items: [
    {
      name: "Subagents",
      detail:
        "Specialized agents with their own tools and context. Ships with built-in ones, or build your own.",
    },
    {
      name: "MCPs",
      detail: "Connect external tools and data via Model Context Protocol.",
    },
    {
      name: "Skills",
      detail:
        "Reusable, versioned capability bundles. Ships with built-in ones, or build your own.",
    },
    {
      name: "Tools",
      detail: "30+ built-in tools for learning. Or define your own with full runtime control.",
    },
    {
      name: "AGENTS.md",
      detail: "Instructions you give the agent. Per project, per context.",
    },
  ],
}

export const content = {
  learners: {
    hero: {
      headlineLines: ["The personal learning system", "for curious minds"],
      subtext: "Read, understand, and remember with a learning agent on your machine.",
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
          "Bring your ebooks, PDFs or papers and read them with Buddy always at your side. Ask for summaries, save highlights, take notes.",
      },
      {
        tag: "PLAY",
        title: "Make games and apps, to learn.",
        subtext:
          "Gamify your own learning. Buddy can make and publish games, interactive apps, or anything else you can imagine.",
      },
      {
        tag: "DRAW",
        title: "Draw on Excalidraw boards.",
        subtext:
          "Buddy can draw for you, and see what you are drawing on the built-in Excalidraw board. Ask for diagrams, map concepts, or visualize structures.",
      },
      {
        tag: "QUIZ",
        title: "Test yourself, with Quizzes.",
        subtext: "Ask Buddy to generate a quiz on any resource, book or topic you are studying.",
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
      headlineLines: ["The personal teaching assistant", "for every task"],
      subtext: "Plan, create, and assess with a teaching assistant on your machine.",
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
          "Buddy comes with built-in CCSS standards, NGSS standards, and standards for all U.S. states. For Indian teachers, it can download NCERT and state board books, DIKSHA resources, and any public resource published on GOI websites.",
      },
      {
        tag: "PLAN",
        title: "Plan with any learning framework.",
        subtext:
          "Buddy can align your content to Bloom levels, DOK levels, or Piaget's stages. It can sequence your lessons using instruction models. It can also help you with materials for project-based learning, SEL, scaffolding, and formative and summative assessment.",
      },
      {
        tag: "CREATE",
        title: "Create docs, presentations, or sheets.",
        subtext:
          "Buddy can create worksheets or lesson plans for your students. And it can create reports, presentations, or spreadsheets for your peers. All ready to export.",
      },
      {
        tag: "RESEARCH",
        title: "Research around your material.",
        subtext:
          "Upload your PDFs, ebooks, documents, or web links. Buddy can parse them, understand them, and answer any questions about them. Buddy has a built-in ebook reader, whiteboarding area, and source system to make your research easier.",
      },
      {
        tag: "BUILD",
        title: "Build interactive experiences.",
        subtext:
          "Buddy can create apps, games, and websites for you. You can ask Buddy to publish them and then share them with your students or peers. With Buddy, every teacher is a builder.",
      },
    ] as const,
    philosophy: educatorsPhilosophy,
    download: {
      tagline: "The teaching superapp",
    },
  },
  bringYourOwn,
  capabilities,
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
> & { bringYourOwn: BringYourOwn; capabilities: Capabilities }
