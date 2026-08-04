export type SocialLink = {
  readonly label: string
  readonly url: string
}

export type YouTubeLaunchVideoCopy = {
  readonly title: string
  readonly description: string
}

export type YouTubeChannelCopy = {
  readonly renameFrom: string
  readonly name: string
  readonly preferredHandle: string
  readonly description: string
  readonly links: readonly SocialLink[]
  readonly profileImagePath: string
  readonly launchVideo: YouTubeLaunchVideoCopy
}

const BRAND_NAME = "Buddy"
const WEBSITE_URL = "https://hibuddy.in"
const TAGLINE = "An AI Agent for the Curious."
const LOGO_PATH = "packages/site/src/assets/buddy-app-icon.png"

const YOUTUBE_DESCRIPTION = [
  `${BRAND_NAME} is a learning buddy for the pleasure of finding things out.`,
  "Here we share Buddy launch films and product demos. We also show the small experiments behind the app.",
  "Buddy is an AI agent for your computer. It reads with you, sketches on a whiteboard, builds simulations, and helps you remember with quizzes and flashcards.",
  "Buddy is free to download for macOS and Windows. No account is required. Your notes and files stay on your computer. Bring ChatGPT or your own API keys, run a local model, or start with one of the free models included in the app.",
  `Download Buddy: ${WEBSITE_URL}`,
].join("\n\n")

const YOUTUBE_LAUNCH_VIDEO_DESCRIPTION = [
  "Meet Buddy, an AI agent for your computer.",
  "Read with it, sketch on a whiteboard, build simulations, and turn what you learn into quizzes and flashcards.",
  `Download Buddy for macOS and Windows: ${WEBSITE_URL}`,
].join("\n\n")

export const SOCIAL_COPY = {
  brand: {
    name: BRAND_NAME,
    website: WEBSITE_URL,
    tagline: TAGLINE,
    logoPath: LOGO_PATH,
  },
  youtube: {
    renameFrom: "Tanstack Hindi",
    name: BRAND_NAME,
    preferredHandle: "@hibuddyin",
    description: YOUTUBE_DESCRIPTION,
    links: [
      {
        label: "Buddy website",
        url: WEBSITE_URL,
      },
    ],
    profileImagePath: LOGO_PATH,
    launchVideo: {
      title: "Buddy: An AI Agent for the Curious",
      description: YOUTUBE_LAUNCH_VIDEO_DESCRIPTION,
    },
  } satisfies YouTubeChannelCopy,
} as const
