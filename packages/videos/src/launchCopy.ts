export type LaunchFeatureCopy = {
  readonly tag: string
}

export type PromptComposerCopy = {
  readonly modelLabel: string
  readonly placeholder: string
  readonly thinkingLabel: string
}

export type PromptCopy = {
  readonly composer: PromptComposerCopy
  readonly text: string
  readonly wordsPerMinute: number
}

const PROMPT_COMPOSER_COPY = {
  modelLabel: "GPT-5.6 Sol",
  placeholder: "Ask Buddy…",
  thinkingLabel: "High",
} satisfies PromptComposerCopy

export const LAUNCH_COPY = {
  opening: {
    brandName: "Buddy",
    feynman: {
      captions: [
        {
          endAtSourceSeconds: 3.48,
          text: "I don’t see that it makes any point",
        },
        {
          endAtSourceSeconds: 6.39,
          text: "that someone in the Swedish Academy decides",
        },
        {
          endAtSourceSeconds: 8.19,
          text: "if this work is noble enough",
        },
        {
          endAtSourceSeconds: 9.36,
          text: "to receive a prize.",
        },
        {
          endAtSourceSeconds: 10.62,
          text: "I’ve already got the prize.",
        },
        {
          endAtSourceSeconds: 11.61,
          text: "The prize is",
        },
        {
          endAtSourceSeconds: 13.469,
          text: "the pleasure of finding a thing out.",
        },
      ],
    },
    subtitle: "An AI Agent for the Curious.",
  },
  agentWhiteboard: {
    prompt: {
      composer: PROMPT_COMPOSER_COPY,
      text: "How does an AI agent work?",
      wordsPerMinute: 250,
    } satisfies PromptCopy,
  },
  transitionToClassicReader: {
    copy: "Bring your Books to Buddy.",
  },
  classicReader: {
    prompt: {
      composer: PROMPT_COMPOSER_COPY,
      text: "Tell me the story of Argos.",
      wordsPerMinute: 300,
    } satisfies PromptCopy,
  },
  transitionToObsidian: {
    copy: "Bring your Notes to Buddy.",
  },
  transitionToWormholeGame: {
    copy: "Ask Buddy for a Simulation.",
  },
  wormholeGame: {
    prompt: {
      composer: PROMPT_COMPOSER_COPY,
      text: "What is it like to travel through a wormhole?",
      wordsPerMinute: 300,
    } satisfies PromptCopy,
  },
  transitionToResearch: {
    copy: "Ask Buddy for Research.",
  },
  transitionToBringYourOwnAi: {
    copy: "Connect any Model or Subscription.",
  },
  providerWall: {
    /**
     * Two naming tiers on purpose: the hero and its companions use the brand a
     * viewer already knows, and the roll underneath uses the catalog's own
     * provider names. The step between them is what says "and then some".
     */
    hero: {
      name: "ChatGPT",
    },
    companions: ["GitHub Copilot", "Kimi", "Grok"],
    closing: {
      /**
       * The bridge out of the scene, not a tally — the roll already made the
       * "many" argument visually, so the line spends itself on the hand-off to
       * the feature wall instead. "And" is load-bearing: it makes the card a
       * continuation rather than a new announcement.
       */
      headline: "There’s More in the Box.",
    },
  },
  featureMontage: {
    /**
     * Dealt down each column in order. Tone is not authored here — the montage
     * derives it from the grid position so the wall always alternates.
     */
    features: [
      { tag: "Ebook Reader" },
      { tag: "Whiteboards" },
      { tag: "Image Gen" },
      { tag: "Skills" },

      { tag: "Local-first" },
      { tag: "Games" },
      { tag: "Flashcards" },
      { tag: "File Editor" },

      { tag: "Curriculum" },
      { tag: "Subagents" },
      { tag: "Notes" },
      { tag: "Quizzes" },

      { tag: "MCP" },
      { tag: "Free" },
      { tag: "Any Model" },
      { tag: "Themes" },
    ] satisfies readonly LaunchFeatureCopy[],
  },
  ending: {
    brandName: "Buddy",
    availability: "Free desktop app",
    platforms: {
      mac: "macOS",
      windows: "Windows",
    },
    website: "hibuddy.in",
  },
} as const
