import type { Audience } from "../content/site"

export const AUDIENCE_LEARNERS = "learners" satisfies Audience
export const AUDIENCE_EDUCATORS = "educators" satisfies Audience
export const LEARNER_PATH = "/"
export const EDUCATOR_PATH = "/teachers/"
export const DOCS_PATH = "/docs/"
export const COMPARE_PATH = "/compare/"
export const GITHUB_URL = "https://github.com/buddy-hq/buddy"
export const GITHUB_RELEASES_URL = "https://github.com/prashantbhudwal/buddy-releases/releases"
export const GITHUB_DISCUSSIONS_URL = "https://github.com/buddy-hq/buddy/discussions"
/**
 * The launch video. `nocookie` and `rel=0` keep YouTube from setting tracking
 * cookies before playback and from ending on other channels' videos.
 */
export const LAUNCH_VIDEO_ID = "FCq4janO7pE"
export const LAUNCH_VIDEO_WATCH_URL = `https://www.youtube.com/watch?v=${LAUNCH_VIDEO_ID}`
export const LAUNCH_VIDEO_EMBED_URL = `https://www.youtube-nocookie.com/embed/${LAUNCH_VIDEO_ID}?autoplay=1&rel=0`

/**
 * The DOM contract between a lightbox trigger and the dialog that answers it.
 * Shared so a trigger and its dialog can live in different components without
 * agreeing on a string by hand.
 */
export const VIDEO_LIGHTBOX = {
  openAttribute: "data-video-lightbox-open",
  rootAttribute: "data-video-lightbox",
  frameAttribute: "data-video-lightbox-frame",
  closeAttribute: "data-video-lightbox-close",
  embedUrlAttribute: "data-video-lightbox-embed-url",
} as const

export const SOCIAL_X_URL = "https://x.com/hibuddyai"
export const SOCIAL_YOUTUBE_URL = "https://www.youtube.com/@hibuddyin"
export const SOCIAL_LINKEDIN_URL = "https://www.linkedin.com/company/hibuddy-in"
export const MAC_INSTALL_CMD = "curl -fsSL https://hibuddy.in/install | bash"
export const WIN_INSTALL_CMD = "irm -UseBasicParsing https://hibuddy.in/install | iex"
