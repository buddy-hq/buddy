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
    description: "Use Go, Plus, Pro subscriptions.",
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
        tag: "STUDY",
        title: "Drop in what you're studying",
        subtext:
          "A PDF, an EPUB, a video, a lecture recording. Buddy reads it all and you're ready to go.",
      },
      {
        tag: "READ",
        title: "Get unstuck while you read",
        subtext:
          "Highlight a passage, ask a question. Buddy sees what you're reading and explains it right there.",
      },
      {
        tag: "PLAY",
        title: "Play until it clicks",
        subtext:
          "Reading it again won't help. Sketch it on the whiteboard, play a game Buddy builds, explore until it clicks.",
      },
      {
        tag: "QUIZ",
        title: "Know if you're ready",
        subtext:
          "Buddy quizzes you on what you've learned. See what clicks and what needs another pass.",
      },
      {
        tag: "REVIEW",
        title: "Make it stick",
        subtext:
          "Stop forgetting what you learned. Buddy turns your reading and chats into flashcards automatically. Review on your schedule.",
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
        title: "Aligned to your standards",
        subtext:
          "Instead of mapping standards by hand, import them. Buddy knows the prerequisites and what comes next.",
      },
      {
        tag: "PLAN",
        title: "Plan lessons in minutes",
        subtext:
          "Buddy writes clear learning goals from your standards. Know what to teach and why, in minutes not hours.",
      },
      {
        tag: "CREATE",
        title: "One lesson, every level",
        subtext:
          "Stop making different versions for different levels. Buddy tailors worksheets, activities, and diagrams for every learner, no extra effort.",
      },
      {
        tag: "ASSESS",
        title: "Test what you actually taught",
        subtext:
          "Quizzes and practice problems built from your actual curriculum goals. Not generic, aligned to what you taught. Print, share, or assign.",
      },
      {
        tag: "EXPORT",
        title: "Ready for class tomorrow",
        subtext:
          "Quizzes, worksheets, and lessons, print-ready or digital. Export in one click. Everything stays on your machine.",
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
