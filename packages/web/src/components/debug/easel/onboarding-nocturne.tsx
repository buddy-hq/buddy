import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useInView,
  type Transition,
} from "motion/react"
import { cn } from "@buddy/ui"
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  FolderIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { resolveBuddyIconUrl } from "@/lib/static-asset"

/**
 * Brief A — "Nocturne" (v3) with Dual Selectors and Full Visual Background Customization
 *
 * A cinematic, single-canvas onboarding built around:
 * 1. UI Branding Accent Themes (colors for text, buttons, input blanks, and icons).
 * 2. Background Space Styles (11 different visual styles: pandas, jellyfish, paper cranes, mandalas, rain, and nebulae).
 */

// ── Timing ──
const CONNECT_DELAY_MS = 1_900
const FOLDER_PICK_DELAY_MS = 650
const ADVANCE_AFTER_SELECT_MS = 340
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]
const SELECT_SPRING: Transition = { type: "spring", bounce: 0.24, duration: 0.5 }

const FONT_LINK_ID = "ob-nocturne-fonts"
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&display=swap"
const SERIF = '"Fraunces", Georgia, "Times New Roman", serif'
const SANS = 'ui-sans-serif, -apple-system, "Segoe UI", sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", monospace'

// ── Domain ──
const MODES = ["learn", "teach"] as const
type Mode = (typeof MODES)[number]
type Engine = "chatgpt" | "free"
type LocationKind = "default" | "custom"
type Details = { name: string; occupation: string; about: string }
const EMPTY_DETAILS: Details = { name: "", occupation: "", about: "" }

const DEFAULT_HOME = "~/Documents/Buddy"
const MOCK_PICKED_HOME = "~/Projects/StudyRoom"

const STEPS = ["mode", "engine", "location", "details"] as const
type Step = (typeof STEPS)[number]

type MoodKey = "neutral" | Mode
type MoodColors = { a: string; b: string; c: string; core: string }

// ── UI Branding Accent Themes ──
export type ThemeId = "nocturne"

export type ThemeConfig = {
  id: ThemeId
  name: string
  ring: string
  ring2: string
  soft: string
  word: string
  ink: string
  bloom: string
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
  nocturne: {
    id: "nocturne",
    name: "Ember Nocturne",
    ring: "#FF6A2C",
    ring2: "#FF8A4C",
    soft: "rgba(255, 106, 44, 0.16)",
    word: "#FF9256",
    ink: "#180b04",
    bloom: "rgba(255, 120, 60, 0.45)",
  },
}

// ── Background Space Styles ──
export type SpaceId = "nebula-orion"

export type SpaceColorId = "amethyst"

export type TransitionId = "diagonal" | "ripple" | "warp" | "dissolve" | "eclipse"

export function getBgFilter(_spaceColorId: SpaceColorId, _themeId: ThemeId): string {
  return "hue-rotate(295deg) saturate(1.3)" // Cosmic Orion Nebula purple-blue mix
}

export const COPY = {
  intro: {
    heading: ["Hey — I'm Buddy."],
    subtitle: "Let's make this space yours. Takes about a minute.",
    clickToBegin: "Click to begin",
  },
  mode: {
    eyebrow: "Let's begin",
    heading: ["What brings you", "to Buddy today?"],
    choiceLearn: {
      title: "I'm here to learn.",
      description: "For students, researchers, and lifelong learners.",
    },
    choiceTeach: {
      title: "I'm here to teach.",
      description: "For school teachers and homeschoolers.",
    },
    footnote: "You can change this anytime in Settings.",
  },
  engine: {
    eyebrow: "The Engine",
    heading: ["Pick the mind", "behind Buddy."],
    choiceChatGPT: {
      title: "Connect ChatGPT",
      description: "Works with both free and paid plans. Recommended.",
    },
    choiceFree: {
      title: "Use Free Models",
      description: "No login, but limited messages and intelligence.",
      tag: "Instant",
    },
    footnote: "More connection options available in the Settings.",
  },
  location: {
    eyebrow: "Your space",
    heading: ["Buddy keeps your", "work in one place."],
    folderLabelCustom: "Chosen folder",
    folderLabelDefault: "Recommended",
    btnConfirm: "Use this location",
    btnConfirmSettingUp: "Setting up…",
    btnCustom: "Choose a different folder",
    btnCustomOpening: "Opening picker…",
    footnote: "You can still open folders from anywhere later.",
  },
  details: {
    eyebrow: "Last thing — optional",
    heading: ["Tell me about", "yourself."],
    labelName: "What should Buddy call you?",
    placeholderName: "Your name",
    labelOccupation: "What do you do?",
    placeholderOccupation: "e.g. Student, Software Developer, Teacher",
    labelAbout: "Goals, context, or how you like to work",
    placeholderAbout: "Write a line or two (optional)...",
    btnFinish: "Enter Buddy",
    btnSkip: "Skip for now",
  },
  finish: {
    recapEyebrow: "You're all set",
    welcomeHeading: ["Welcome", "to Buddy."],
    welcomeUser: "Welcome,",
    subtitle: "Your space is ready. Here's how Buddy is tuned for you —",
    chipTeach: "Teaching mode",
    chipLearn: "Learning mode",
    chipChatGPT: "ChatGPT",
    chipFree: "Free models",
    btnOpen: "Open Buddy",
  },
  end: {
    heading: "Welcome to your Workspace",
    description: "This is the main application workspace where your custom learning environments, workspace index, and chat session would load.",
    btnReplay: "Replay onboarding",
  },
  chrome: {
    onboardingTitle: "Buddy Onboarding",
    backButton: "Back",
  },
  controlPanel: {
    customize: "Easel Customize",
    headerTheme: "1. UI Theme Accent",
    headerSpace: "2. Background Space Layer",
    headerColor: "3. Canvas Color Scheme",
    headerTransition: "4. Nav & Finish Transition",
    footer: "Select accent themes, canvas backgrounds, colors, and transition overlays.",
  },
}

export type SpaceConfig = {
  id: SpaceId
  name: string
  bg: string
  moods: Record<MoodKey, MoodColors>
  grainOpacity?: number
}

export const SPACES: Record<SpaceId, SpaceConfig> = {
  "nebula-orion": {
    id: "nebula-orion",
    name: "Cosmic Orion Nebula",
    bg: "#010102",
    moods: {
      neutral: {
        a: "rgba(255, 0, 85, 0.35)",
        b: "rgba(186, 104, 200, 0.25)",
        c: "rgba(236, 72, 153, 0.15)",
        core: "rgba(255, 64, 129, 0.55)",
      },
      learn: {
        a: "rgba(255, 0, 85, 0.35)",
        b: "rgba(186, 104, 200, 0.25)",
        c: "rgba(236, 72, 153, 0.15)",
        core: "rgba(255, 64, 129, 0.55)",
      },
      teach: {
        a: "rgba(255, 0, 85, 0.35)",
        b: "rgba(186, 104, 200, 0.25)",
        c: "rgba(236, 72, 153, 0.15)",
        core: "rgba(255, 64, 129, 0.55)",
      },
    },
    grainOpacity: 0.05,
  },
}





function useFont() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return
    const link = document.createElement("link")
    link.id = FONT_LINK_ID
    link.rel = "stylesheet"
    link.href = FONT_HREF
    document.head.appendChild(link)
  }, [])
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.06 } },
  exit: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
}
const rise = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE_OUT } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2, ease: EASE_OUT } },
}
const lineMask = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.02 } },
  exit: { transition: { staggerChildren: 0.03 } },
}
const lineInner = {
  hidden: { y: "115%" },
  show: { y: "0%", transition: { duration: 0.62, ease: EASE_OUT } },
  exit: { y: "-45%", opacity: 0, transition: { duration: 0.24, ease: EASE_OUT } },
}

function NebulaOrionBackground({ mood }: { mood: MoodColors; bloom: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none bg-[#010102]">
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="orion-nebula-filter">
            <feTurbulence type="fractalNoise" baseFrequency="0.007" numOctaves="4" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="110" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      {/* Warped clouds in outer regions */}
      <div
        className="ob-drift absolute inset-0 opacity-[0.55]"
        style={{
          filter: "url(#orion-nebula-filter)",
          backgroundImage: [
            `radial-gradient(55% 55% at 15% 15%, ${mood.a}, transparent 70%)`,
            `radial-gradient(65% 65% at 85% 85%, ${mood.b}, transparent 70%)`,
            `radial-gradient(45% 45% at 80% 15%, ${mood.c}, transparent 65%)`,
          ].join(", "),
        }}
      />
    </div>
  )
}





// ── Master Background Assembly ──
function Aurora({
  space,
  activeKey,
  bloom,
  expanding,
  spaceColorId = "amethyst",
  themeId = "nocturne",
}: {
  space: SpaceConfig
  activeKey: MoodKey
  bloom: boolean
  expanding: boolean
  spaceColorId?: SpaceColorId
  themeId?: ThemeId
}) {
  const mood = space.moods[activeKey]
  const filter = getBgFilter(spaceColorId, themeId)

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ filter }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${space.id}-${spaceColorId}`}
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            scale: expanding ? 2.5 : 1,
          }}
          exit={{ opacity: 0 }}
          transition={{
            scale: { duration: 2.8, ease: [0.16, 1, 0.3, 1] }, // super smooth transition
            default: { duration: 0.8, ease: EASE_OUT },
          }}
          className="absolute inset-0 origin-center"
        >
          {space.id === "nebula-orion" && <NebulaOrionBackground mood={mood} bloom={bloom} />}
        </motion.div>
      </AnimatePresence>

      <div className="absolute inset-0 bg-[radial-gradient(130%_120%_at_50%_-10%,transparent_44%,rgba(0,0,0,0.66)_100%)]" />
      <div
        className="ob-grain absolute inset-0 mix-blend-soft-light"
        style={{ opacity: space.grainOpacity ?? 0.05 }}
      />
      <AnimatePresence>
        {bloom ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 0.95, 0], scale: 1.7 }}
            transition={{ duration: 1.5, ease: EASE_OUT }}
            className="absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: "radial-gradient(closest-side, var(--brand-bloom), transparent 70%)" }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function Sweep({
  stepKey,
  transitionId = "diagonal",
  spaceColorId = "amethyst",
  themeId = "nocturne",
}: {
  stepKey: string
  transitionId?: TransitionId
  spaceColorId?: SpaceColorId
  themeId?: ThemeId
}) {
  const filter = getBgFilter(spaceColorId, themeId)

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden" style={{ filter }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={stepKey}
          initial="initial"
          animate="animate"
          exit="exit"
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          {transitionId === "diagonal" && (
            <motion.div
              variants={{
                initial: { x: "-110vw", opacity: 0 },
                animate: { x: "110vw", opacity: [0, 0.5, 0.5, 0] },
              }}
              transition={{ duration: 1.8, ease: "easeInOut" }}
              className="absolute inset-y-0 w-[80vw] pointer-events-none -skew-x-12"
              style={{
                background: "linear-gradient(90deg, transparent 0%, var(--brand-soft) 50%, transparent 100%)",
              }}
            />
          )}

          {transitionId === "ripple" && (
            <motion.div
              variants={{
                initial: { scale: 0.4, opacity: 0 },
                animate: { scale: 2.2, opacity: [0, 0.55, 0] },
              }}
              transition={{ duration: 1.8, ease: "easeOut" }}
              className="absolute size-[600px] rounded-full"
              style={{
                background: "radial-gradient(circle, var(--brand-bloom) 0%, transparent 70%)",
                filter: "blur(60px)",
              }}
            />
          )}

          {transitionId === "warp" && (
            <motion.div
              variants={{
                initial: { scale: 0.95, opacity: 0 },
                animate: { scale: 1.05, opacity: [0, 0.5, 0] },
              }}
              transition={{ duration: 1.6, ease: "easeInOut" }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div
                className="absolute inset-0 opacity-40"
                style={{
                  backgroundImage: "radial-gradient(1.5px 1.5px at 20px 30px, #ffffff, transparent), radial-gradient(2px 2px at 40px 70px, #ffffff, transparent), radial-gradient(1.5px 1.5px at 50px 10px, #ffffff, transparent)",
                  backgroundSize: "80px 80px",
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/5 to-transparent" />
            </motion.div>
          )}

          {transitionId === "dissolve" && (
            <motion.div
              variants={{
                initial: { opacity: 0 },
                animate: { opacity: [0, 0.65, 0] },
              }}
              transition={{ duration: 1.4, ease: "easeInOut" }}
              className="absolute inset-0 bg-[#090a0f]/40 backdrop-blur-[12px] flex items-center justify-center"
            >
              <div
                className="absolute size-[400px] rounded-full opacity-40 blur-[80px]"
                style={{ background: "var(--brand-soft)" }}
              />
            </motion.div>
          )}

          {transitionId === "eclipse" && (
            <motion.div
              variants={{
                initial: { opacity: 0 },
                animate: { opacity: [0, 0.6, 0] },
              }}
              transition={{ duration: 1.6, ease: "easeInOut" }}
              className="absolute inset-0"
              style={{
                background: "radial-gradient(circle at center, transparent 30%, rgba(10, 10, 12, 0.75) 70%, rgba(10, 10, 12, 0.95) 100%)",
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ── Big masked-line serif heading (choreographed) ──
function Heading({
  lines,
  emphasizeLast,
  className,
}: {
  lines: ReactNode[]
  emphasizeLast?: boolean
  className?: string
}) {
  return (
    <motion.h2
      variants={lineMask}
      className={
        className ??
        "text-[clamp(30px,4.4vw,46px)] leading-[1.04] tracking-[-0.01em]"
      }
      style={{ fontFamily: SERIF, fontWeight: 500, color: "#faf6f0" }}
    >
      {lines.map((line, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <span key={i} className="block overflow-hidden pb-[0.08em]">
          <motion.span
            variants={lineInner}
            className="block"
            style={emphasizeLast && i === lines.length - 1 ? { color: "var(--brand-word)" } : undefined}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </motion.h2>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <motion.p
      variants={rise}
      className="mb-5 flex items-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.28em] text-white/45"
    >
      <span className="inline-block h-px w-6" style={{ background: "var(--brand-ring)" }} />
      {children}
    </motion.p>
  )
}

// ── Editorial "menu" choice (type-led, hairline — not a box) ──
type MenuChoiceProps = {
  index?: string
  title: string
  description: string
  selected?: boolean
  busy?: boolean
  trailing?: ReactNode
  onHover?: (hovering: boolean) => void
  onClick: () => void
}
function MenuChoice(props: MenuChoiceProps) {
  return (
    <motion.button
      type="button"
      variants={rise}
      onClick={props.onClick}
      onPointerEnter={() => props.onHover?.(true)}
      onPointerLeave={() => props.onHover?.(false)}
      onFocus={() => props.onHover?.(true)}
      onBlur={() => props.onHover?.(false)}
      disabled={props.busy}
      aria-pressed={props.selected}
      className="group relative flex w-full items-center gap-5 border-t border-white/10 py-5 pl-6 text-left outline-none transition-opacity last:border-b disabled:cursor-default"
      style={{ opacity: props.busy && !props.selected ? 0.4 : 1 }}
    >
      <motion.span
        aria-hidden
        className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-full"
        initial={false}
        animate={{ scaleY: props.selected ? 1 : 0, opacity: props.selected ? 1 : 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        style={{ background: "var(--brand-ring)", boxShadow: "0 0 16px var(--brand-ring)" }}
      />
      {props.index ? (
        <span
          className="w-7 shrink-0 text-[13px] tabular-nums text-white/30 transition-colors group-hover:text-white/60"
          style={{ fontFamily: MONO }}
        >
          {props.index}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span
          className="block text-[22px] leading-tight tracking-[-0.01em] transition-colors duration-200"
          style={{ fontFamily: SERIF, fontWeight: 500, color: props.selected ? "var(--brand-word)" : "#f3ede4" }}
        >
          {props.title}
        </span>
        <span className="mt-1 block text-[13.5px] leading-snug text-white/45">
          {props.description}
        </span>
      </span>
      <span className="flex shrink-0 items-center">
        {props.trailing ?? (
          <ArrowUpRightIcon className="size-5 -translate-x-1 text-white/25 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-hover:text-white/70" />
        )}
      </span>
    </motion.button>
  )
}

// ── Inline fill-in-the-blank (auto-width, baseline-aligned inside the sentence) ──


function Pill({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      variants={rise}
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
      className="inline-flex items-center gap-2 rounded-full px-7 py-3 text-[14px] font-medium"
      style={{ background: "var(--brand-ring)", color: "var(--brand-ink)", boxShadow: "0 14px 44px var(--brand-soft)" }}
    >
      {children}
    </motion.button>
  )
}

// ── Floating Control Panel containing UI Theme and Background selectors ──


const chatgptGlyph = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="size-full">
    <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .75 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.5zM3.6 18.3a4.47 4.47 0 0 1-.53-3.01l.14.08 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06L9.74 19.95A4.5 4.5 0 0 1 3.6 18.3zM2.34 7.9a4.49 4.49 0 0 1 2.37-1.98v5.68a.77.77 0 0 0 .39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0L3.99 14a4.5 4.5 0 0 1-1.65-6.1zm16.6 3.86L13.1 8.36l2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.67a.79.79 0 0 0-.4-.67zm2.01-3.02-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.31 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08L8.7 5.46a.79.79 0 0 0-.39.68zm1.1-2.37 2.6-1.5 2.61 1.5v3l-2.6 1.5-2.61-1.5z" />
  </svg>
)

// ── Opening sequence: Buddy greets you ──
function Intro({ onSkip }: { onSkip: () => void }) {
  const iconUrl = resolveBuddyIconUrl()
  return (
    <motion.div
      key="intro"
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, y: -26, filter: "blur(8px)", transition: { duration: 0.5, ease: EASE_OUT } }}
      variants={container}
      onClick={onSkip}
      className="flex cursor-pointer flex-col items-center text-center"
    >
      <motion.div
        variants={{
          hidden: { opacity: 0, scale: 0.82, y: 8 },
          show: { opacity: 1, scale: 1, y: 0, transition: { ...SELECT_SPRING, delay: 0.05 } },
        }}
        className="relative mb-8"
      >
        <div
          className="absolute inset-0 -z-10 scale-[1.7] rounded-full blur-2xl opacity-70"
          style={{ background: "radial-gradient(closest-side, var(--brand-bloom), transparent 70%)" }}
        />
        <img
          src={iconUrl}
          alt="Buddy"
          className="ob-float size-32"
          style={{ filter: "drop-shadow(0 10px 40px var(--brand-bloom))" }}
        />
      </motion.div>
      <Heading lines={COPY.intro.heading} className="text-[clamp(34px,5vw,52px)] leading-[1.02]" />
      <motion.p variants={rise} className="mt-4 text-[15px]" style={{ color: "rgba(255,255,255,0.5)" }}>
        {COPY.intro.subtitle}
      </motion.p>
      <motion.span variants={rise} className="mt-10 text-[12px] uppercase tracking-[0.24em]" style={{ color: "rgba(255,255,255,0.3)" }}>
        {COPY.intro.clickToBegin}
      </motion.span>
    </motion.div>
  )
}

export function OnboardingNocturne() {
  useFont()
  const reduce = useReducedMotion() === true

  const themeId: ThemeId = "nocturne"
  const spaceId: SpaceId = "nebula-orion"
  const spaceColorId: SpaceColorId = "amethyst"
  const transitionId: TransitionId = "dissolve"

  const theme = THEMES[themeId]
  const space = SPACES[spaceId]

  const [intro, setIntro] = useState(true)
  const [step, setStep] = useState<Step>("mode")
  const [dir, setDir] = useState<1 | -1>(1)
  const [mode, setMode] = useState<Mode>()
  const [hoverMode, setHoverMode] = useState<Mode>()
  const [engine, setEngine] = useState<Engine>()
  const [connecting, setConnecting] = useState(false)
  const [locationKind, setLocationKind] = useState<LocationKind>()
  const [homePath, setHomePath] = useState(DEFAULT_HOME)
  const [pickingFolder, setPickingFolder] = useState(false)
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS)
  const [finished, setFinished] = useState(false)
  const [ended, setEnded] = useState(false)
  const [expanding, setExpanding] = useState(false)

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const defer = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms))
  }, [])
  useEffect(
    () => () => {
      for (const id of timers.current) clearTimeout(id)
    },
    [],
  )

  useEffect(() => {
    if (!finished || ended) return

    const t1 = setTimeout(() => {
      setExpanding(true)
    }, 2800)

    const t2 = setTimeout(() => {
      setEnded(true)
      setExpanding(false)
    }, 5600)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [finished, ended])



  const moodKey: MoodKey = mode ?? hoverMode ?? "neutral"
  const index = STEPS.indexOf(step)

  const goTo = useCallback((next: Step, direction: 1 | -1) => {
    setDir(direction)
    setStep(next)
  }, [])
  const back = useCallback(() => {
    setConnecting(false)
    const prev = STEPS[index - 1]
    if (prev) goTo(prev, -1)
  }, [index, goTo])

  const chooseMode = (m: Mode) => {
    setMode(m)
    setHoverMode(undefined)
    defer(() => goTo("engine", 1), ADVANCE_AFTER_SELECT_MS)
  }
  const chooseEngine = (e: Engine) => {
    setEngine(e)
    if (e === "free") {
      defer(() => goTo("location", 1), ADVANCE_AFTER_SELECT_MS)
      return
    }
    setConnecting(true)
    defer(() => {
      setConnecting(false)
      goTo("location", 1)
    }, CONNECT_DELAY_MS)
  }
  const chooseDefaultHome = () => {
    setLocationKind("default")
    setHomePath(DEFAULT_HOME)
    defer(() => goTo("details", 1), ADVANCE_AFTER_SELECT_MS)
  }
  const chooseCustomHome = () => {
    setPickingFolder(true)
    defer(() => {
      setPickingFolder(false)
      setLocationKind("custom")
      setHomePath(MOCK_PICKED_HOME)
      defer(() => goTo("details", 1), ADVANCE_AFTER_SELECT_MS)
    }, FOLDER_PICK_DELAY_MS)
  }
  const finish = () => setFinished(true)
  const restart = () => {
    setFinished(false)
    setEnded(false)
    setExpanding(false)
    setMode(undefined)
    setHoverMode(undefined)
    setEngine(undefined)
    setLocationKind(undefined)
    setHomePath(DEFAULT_HOME)
    setDetails(EMPTY_DETAILS)
    setStep("mode")
    setDir(1)
    setIntro(true)
  }

  const showChrome = !intro && !finished && !ended

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden text-[#ffffff]"
      style={{
        background: space.bg,
        fontFamily: SANS,
        ["--brand-ring" as any]: theme.ring,
        ["--brand-ring2" as any]: theme.ring2,
        ["--brand-soft" as any]: theme.soft,
        ["--brand-word" as any]: theme.word,
        ["--brand-ink" as any]: theme.ink,
        ["--brand-bloom" as any]: theme.bloom,
      }}
    >
      {/*
      <ControlPanel
        themeId={themeId}
        onThemeChange={setThemeId}
        spaceId={spaceId}
        onSpaceChange={setSpaceId}
        spaceColorId={spaceColorId}
        onSpaceColorChange={setSpaceColorId}
        transitionId={transitionId}
        onTransitionChange={setTransitionId}
      />
      */}
      {!ended && (
        <Aurora space={space} activeKey={moodKey} bloom={finished && !reduce} expanding={expanding} spaceColorId={spaceColorId} themeId={themeId} />
      )}
      {!reduce && (showChrome || finished) ? (
        <Sweep stepKey={finished ? "finished-nav" : step} transitionId={transitionId} spaceColorId={spaceColorId} themeId={themeId} />
      ) : null}

      {/* header rail */}
      <motion.div
        initial={false}
        animate={{ opacity: intro ? 0 : 1 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        className="relative z-10 flex items-center justify-between px-9 pt-8 sm:px-14"
      >
        <div className="flex w-16 justify-start">
          <AnimatePresence>
            {showChrome && index > 0 ? (
              <motion.button
                type="button"
                onClick={back}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="inline-flex items-center gap-1.5 text-[13px] text-white/40 transition-colors hover:text-white/80"
              >
                <ArrowLeftIcon className="size-3.5" />
                {COPY.chrome.backButton}
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>

        {/* progress is absolutely centred so it never drifts with the side widths */}
        {showChrome ? (
          <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2" aria-hidden>
            {STEPS.map((s, i) => (
              <div key={s} className="h-[3px] w-9 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full w-full origin-left rounded-full"
                  initial={false}
                  animate={{ scaleX: i <= index ? 1 : 0, opacity: i < index ? 0.55 : i === index ? 1 : 0 }}
                  transition={{ duration: 0.45, ease: EASE_OUT }}
                  style={{ background: "var(--brand-ring)" }}
                />
              </div>
            ))}
          </div>
        ) : null}

        <div className="w-16" />
      </motion.div>

      {/* stage */}
      <div className="relative z-10 flex flex-1 items-center px-9 sm:px-14">
        <div className={intro || finished || ended ? "mx-auto w-full max-w-xl" : "w-full max-w-xl"}>
          <AnimatePresence mode="wait" custom={dir}>
            {intro ? (
              <Intro key="intro" onSkip={() => setIntro(false)} />
            ) : ended ? (
              <End key="end" onRestart={restart} />
            ) : finished ? (
              <Finish key="done" expanding={expanding} />
            ) : (
              <motion.div key={step} variants={container} initial="hidden" animate="show" exit="exit">
                {step === "mode" ? (
                  <>
                    <Eyebrow>{COPY.mode.eyebrow}</Eyebrow>
                    <Heading lines={COPY.mode.heading} />
                    <motion.div variants={rise} className="mt-10">
                      <MenuChoice
                        title={COPY.mode.choiceLearn.title}
                        description={COPY.mode.choiceLearn.description}
                        selected={mode === "learn"}
                        onHover={(h) => setHoverMode(h ? "learn" : undefined)}
                        onClick={() => chooseMode("learn")}
                      />
                      <MenuChoice
                        title={COPY.mode.choiceTeach.title}
                        description={COPY.mode.choiceTeach.description}
                        selected={mode === "teach"}
                        onHover={(h) => setHoverMode(h ? "teach" : undefined)}
                        onClick={() => chooseMode("teach")}
                      />
                    </motion.div>
                    <motion.p variants={rise} className="mt-6 pl-6 text-[12px] text-white/30">
                      {COPY.mode.footnote}
                    </motion.p>
                  </>
                ) : null}

                {step === "engine" ? (
                  <>
                    <Eyebrow>{COPY.engine.eyebrow}</Eyebrow>
                    <Heading lines={COPY.engine.heading} emphasizeLast />
                    <motion.div variants={rise} className="mt-10">
                      <MenuChoice
                        title={COPY.engine.choiceChatGPT.title}
                        description={COPY.engine.choiceChatGPT.description}
                        selected={engine === "chatgpt"}
                        busy={connecting}
                        onClick={() => chooseEngine("chatgpt")}
                        trailing={<span className="size-6 text-white/60">{chatgptGlyph}</span>}
                      />
                      <MenuChoice
                        title={COPY.engine.choiceFree.title}
                        description={COPY.engine.choiceFree.description}
                        selected={engine === "free"}
                        busy={connecting}
                        onClick={() => chooseEngine("free")}
                        trailing={
                          <span className="text-[11px] uppercase tracking-widest text-white/35">
                            {COPY.engine.choiceFree.tag}
                          </span>
                        }
                      />
                    </motion.div>
                    <motion.p variants={rise} className="mt-6 pl-6 text-[12px] text-white/30">
                      {COPY.engine.footnote}
                    </motion.p>
                  </>
                ) : null}

                {step === "location" ? (
                  <>
                    <Eyebrow>{COPY.location.eyebrow}</Eyebrow>
                    <Heading lines={COPY.location.heading} />
                    <motion.div
                      variants={rise}
                      className="mt-10 flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4"
                    >
                      <span
                        className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"
                        style={{ color: "var(--brand-ring)" }}
                      >
                        <FolderIcon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">
                          {locationKind === "custom" ? COPY.location.folderLabelCustom : COPY.location.folderLabelDefault}
                        </p>
                        <p className="mt-1 truncate text-[15px] text-white/90" style={{ fontFamily: MONO }}>
                          {homePath}
                        </p>
                      </div>
                    </motion.div>
                    <motion.div variants={rise} className="mt-7 flex items-center gap-6">
                      <Pill onClick={chooseDefaultHome}>
                        {pickingFolder && locationKind !== "custom" ? COPY.location.btnConfirmSettingUp : COPY.location.btnConfirm}
                        <ArrowUpRightIcon className="size-4" strokeWidth={2.4} />
                      </Pill>
                      <button
                        type="button"
                        onClick={chooseCustomHome}
                        disabled={pickingFolder}
                        className="text-[13px] text-white/45 underline-offset-4 transition-colors hover:text-white/85 hover:underline disabled:opacity-50"
                      >
                        {pickingFolder ? COPY.location.btnCustomOpening : COPY.location.btnCustom}
                      </button>
                    </motion.div>
                    <motion.p variants={rise} className="mt-6 text-[12px] text-white/30">
                      {COPY.location.footnote}
                    </motion.p>
                  </>
                ) : null}

                {step === "details" ? (
                  <>
                    <Eyebrow>{COPY.details.eyebrow}</Eyebrow>
                    <Heading lines={COPY.details.heading} />
                    
                    <motion.div variants={rise} className="mt-8 flex flex-col gap-6">
                      <div className="flex flex-col gap-2">
                        <label className="text-[12px] font-medium tracking-wide text-white/50" htmlFor="ob-name">
                          {COPY.details.labelName}
                        </label>
                        <input
                          id="ob-name"
                          type="text"
                          value={details.name}
                          placeholder={COPY.details.placeholderName}
                          onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))}
                          className="w-full rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.05] focus:border-white/20 px-4 py-3 text-[15px] text-[#ffffff] outline-none transition-colors placeholder:text-white/20"
                          style={{ caretColor: "var(--brand-ring)" }}
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-[12px] font-medium tracking-wide text-white/50" htmlFor="ob-occupation">
                          {COPY.details.labelOccupation}
                        </label>
                        <input
                          id="ob-occupation"
                          type="text"
                          value={details.occupation}
                          placeholder={COPY.details.placeholderOccupation}
                          onChange={(e) => setDetails((d) => ({ ...d, occupation: e.target.value }))}
                          className="w-full rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.05] focus:border-white/20 px-4 py-3 text-[15px] text-[#ffffff] outline-none transition-colors placeholder:text-white/20"
                          style={{ caretColor: "var(--brand-ring)" }}
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-[12px] font-medium tracking-wide text-white/50" htmlFor="ob-about">
                          {COPY.details.labelAbout}
                        </label>
                        <textarea
                          id="ob-about"
                          value={details.about}
                          onChange={(e) => setDetails((d) => ({ ...d, about: e.target.value }))}
                          rows={3}
                          placeholder={COPY.details.placeholderAbout}
                          className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.05] focus:border-white/20 px-4 py-3 text-[15px] leading-relaxed text-[#ffffff] outline-none transition-colors placeholder:text-white/20"
                          style={{ caretColor: "var(--brand-ring)" }}
                        />
                      </div>
                    </motion.div>

                    <motion.div variants={rise} className="mt-8 flex items-center gap-6">
                      <Pill onClick={finish}>
                        {COPY.details.btnFinish}
                        <ArrowUpRightIcon className="size-4" strokeWidth={2.4} />
                      </Pill>
                      <button
                        type="button"
                        onClick={finish}
                        className="text-[13px] text-white/40 underline-offset-4 transition-colors hover:text-white/75 hover:underline"
                      >
                        {COPY.details.btnSkip}
                      </button>
                    </motion.div>
                  </>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* cinematic ChatGPT connect overlay */}
      <AnimatePresence>
        {connecting ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center backdrop-blur-md"
            style={{ background: "rgba(10,10,12,0.74)" }}
          >
            <div className="relative flex size-24 items-center justify-center">
              <div
                className="ob-orbit absolute inset-0 rounded-full"
                style={{
                  background: "conic-gradient(from 0deg, transparent, var(--brand-ring), transparent 62%)",
                  WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
                  mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
                }}
              />
              <span className="size-7 text-white/85">{chatgptGlyph}</span>
            </div>
            <p className="mt-7 text-[22px] text-white/95" style={{ fontFamily: SERIF, fontWeight: 500 }}>
              Connecting ChatGPT
            </p>
            <p className="mt-1.5 text-[13px] text-white/40">Finish sign-in in your browser…</p>
            <button
              type="button"
              onClick={() => setConnecting(false)}
              className="mt-8 inline-flex items-center gap-1.5 rounded-full border border-white/12 px-4 py-2 text-[13px] text-white/55 transition-colors hover:border-white/25 hover:text-white/85"
            >
              <XIcon className="size-3.5" />
              Cancel sign-in
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <StyleTag />
    </div>
  )
}

type EncryptedTextProps = {
  text: string
  className?: string
  revealDelayMs?: number
  charset?: string
  flipDelayMs?: number
  encryptedClassName?: string
  revealedClassName?: string
}

const DEFAULT_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-={}[];:,.<>/?"

function generateRandomCharacter(charset: string): string {
  const index = Math.floor(Math.random() * charset.length)
  return charset.charAt(index)
}

function generateGibberishPreservingSpaces(original: string, charset: string): string {
  if (!original) return ""
  let result = ""
  for (let i = 0; i < original.length; i += 1) {
    const ch = original[i]
    result += ch === " " ? " " : generateRandomCharacter(charset)
  }
  return result
}

function EncryptedText({
  text,
  className,
  revealDelayMs = 50,
  charset = DEFAULT_CHARSET,
  flipDelayMs = 50,
  encryptedClassName,
  revealedClassName,
}: EncryptedTextProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true })

  const [revealCount, setRevealCount] = useState<number>(0)
  const animationFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const lastFlipTimeRef = useRef<number>(0)
  const scrambleCharsRef = useRef<string[]>(
    text ? generateGibberishPreservingSpaces(text, charset).split("") : [],
  )

  useEffect(() => {
    if (!isInView) return

    const initial = text ? generateGibberishPreservingSpaces(text, charset) : ""
    scrambleCharsRef.current = initial.split("")
    startTimeRef.current = performance.now()
    lastFlipTimeRef.current = startTimeRef.current
    setRevealCount(0)

    let isCancelled = false

    const update = (now: number) => {
      if (isCancelled) return

      const elapsedMs = now - startTimeRef.current
      const totalLength = text.length
      const currentRevealCount = Math.min(
        totalLength,
        Math.floor(elapsedMs / Math.max(1, revealDelayMs)),
      )

      setRevealCount(currentRevealCount)

      if (currentRevealCount >= totalLength) {
        return
      }

      const timeSinceLastFlip = now - lastFlipTimeRef.current
      if (timeSinceLastFlip >= Math.max(0, flipDelayMs)) {
        for (let index = 0; index < totalLength; index += 1) {
          if (index >= currentRevealCount) {
            if (text[index] !== " ") {
              scrambleCharsRef.current[index] = generateRandomCharacter(charset)
            } else {
              scrambleCharsRef.current[index] = " "
            }
          }
        }
        lastFlipTimeRef.current = now
      }

      animationFrameRef.current = requestAnimationFrame(update)
    }

    animationFrameRef.current = requestAnimationFrame(update)

    return () => {
      isCancelled = true
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isInView, text, revealDelayMs, charset, flipDelayMs])

  if (!text) return null

  return (
    <motion.span ref={ref} className={cn(className)} aria-label={text} role="text">
      {text.split("").map((char, index) => {
        const isRevealed = index < revealCount
        const displayChar = isRevealed
          ? char
          : char === " "
            ? " "
            : (scrambleCharsRef.current[index] ?? generateRandomCharacter(charset))

        return (
          // eslint-disable-next-line react/no-array-index-key
          <span key={index} className={cn(isRevealed ? revealedClassName : encryptedClassName)}>
            {displayChar}
          </span>
        )
      })}
    </motion.span>
  )
}

function Finish({
  expanding,
}: {
  expanding: boolean
}) {
  return (
    <motion.div
      key="done"
      variants={container}
      initial="hidden"
      animate="show"
      className="flex flex-col items-center justify-center text-center"
    >
      <motion.div
        animate={{
          opacity: expanding ? 0 : 1,
          y: expanding ? -30 : 0,
        }}
        transition={{
          duration: 1.2,
          ease: "easeInOut",
        }}
      >
        <h2
          className="text-[clamp(38px,5.4vw,58px)] leading-[1.0] font-semibold whitespace-nowrap"
          style={{ fontFamily: SERIF, color: "#faf6f0" }}
        >
          <EncryptedText
            text="Welcome to Buddy."
            revealDelayMs={95}
            encryptedClassName="opacity-40 font-mono text-white/30"
            revealedClassName="text-[#ffffff]"
          />
        </h2>
      </motion.div>
    </motion.div>
  )
}

function End({ onRestart }: { onRestart: () => void }) {
  return (
    <motion.div
      key="end"
      variants={container}
      initial="hidden"
      animate="show"
      className="flex flex-col items-center justify-center text-center font-sans"
    >
      <motion.div
        variants={rise}
        className="relative mx-auto max-w-xl rounded-3xl border border-white/10 bg-black/40 backdrop-blur-2xl p-8 shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
      >
        {/* Decorative ambient workspace glow */}
        <div
          className="absolute inset-0 -z-10 rounded-3xl opacity-20 blur-xl animate-pulse"
          style={{ background: "radial-gradient(circle at 50% 50%, var(--brand-ring), transparent 70%)" }}
        />

        <div className="flex flex-col items-center">
          <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/12 shadow-[0_8px_20px_var(--brand-soft)]">
            <span className="size-4 rounded-full animate-ping" style={{ background: "var(--brand-ring)" }} />
          </div>

          <h2 className="text-[28px] font-semibold tracking-tight text-white/95" style={{ fontFamily: SERIF }}>
            {COPY.end.heading}
          </h2>

          <p className="mt-4 text-[14px] leading-relaxed text-white/50 max-w-sm">
            {COPY.end.description}
          </p>

          {/* Replay Onboarding Button */}
          <div className="mt-8">
            <button
              type="button"
              onClick={onRestart}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/20 px-6 py-2.5 text-[13px] font-medium text-white/80 transition-all hover:text-[#ffffff]"
              style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}
            >
              <SparklesIcon className="size-3.5" style={{ color: "var(--brand-word)" }} />
              <span>{COPY.end.btnReplay}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function StyleTag() {
  return (
    <style>{`
      .ob-star {
        position: absolute;
        border-radius: 9999px;
        background: #fff;
        opacity: var(--o, 0.5);
        animation: ob-twinkle var(--d, 4s) ease-in-out infinite;
        will-change: opacity, transform;
      }
      @keyframes ob-twinkle {
        0%, 100% { opacity: var(--o, 0.5); transform: scale(1); }
        50% { opacity: 0.12; transform: scale(0.6); }
      }
      @keyframes ob-horizon-breathe {
        0%, 100% { transform: scaleY(1); opacity: 0.7; }
        50% { transform: scaleY(1.18); opacity: 0.95; }
      }
      @keyframes ob-constellation-pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.75; }
      }
      @keyframes ob-eclipse-drift {
        0%, 100% { transform: scale(1) translate3d(0, 0, 0); opacity: 0.55; }
        50% { transform: scale(1.04) translate3d(-6px, 4px, 0); opacity: 0.85; }
      }
      @keyframes ob-topo-pan {
        0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
        50% { transform: translate3d(-15px, -15px, 0) scale(1.03); }
      }
      @keyframes ob-prism-spin {
        from { transform: rotate(0deg) scale(1); }
        to { transform: rotate(360deg) scale(1.15); }
      }
      @keyframes ob-spacetime-warp {
        0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.55; }
        50% { transform: scale(1.05) rotate(0.5deg); opacity: 0.8; }
      }
      @keyframes ob-aurora-wave-1 {
        0%, 100% { transform: translate3d(0, 0, 0) scaleY(1); }
        50% { transform: translate3d(-30px, 15px, 0) scaleY(1.08); }
      }
      @keyframes ob-aurora-wave-2 {
        0%, 100% { transform: translate3d(0, 0, 0) scaleY(1); }
        50% { transform: translate3d(25px, -20px, 0) scaleY(0.92); }
      }
      @keyframes ob-firefly-drift {
        0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.2; }
        25% { transform: translate(25px, -15px) scale(1.15); opacity: 0.85; }
        50% { transform: translate(10px, -35px) scale(0.9); opacity: 0.35; }
        75% { transform: translate(-15px, -20px) scale(1.1); opacity: 0.9; }
      }
      @keyframes ob-dust-drift {
        0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
        15% { opacity: 0.65; }
        85% { opacity: 0.65; }
        100% { transform: translate(80px, -80px) rotate(360deg); opacity: 0; }
      }
      @keyframes ob-cyber-flicker {
        0%, 100% { opacity: var(--o, 0.5); transform: scale(1); }
        20% { opacity: 0.05; transform: scale(0.85); }
        40% { opacity: 0.95; transform: scale(1.1); }
        60% { opacity: 0.15; transform: scale(0.9); }
        80% { opacity: 0.85; transform: scale(1.05); }
      }
      @keyframes ob-cyber-glitch {
        0%, 100% { opacity: 0.1; }
        5% { opacity: 0.85; }
        10% { opacity: 0.2; }
        15% { opacity: 0.75; }
        20% { opacity: 0.1; }
        50% { opacity: 0.1; }
        52% { opacity: 0.9; }
        58% { opacity: 0.15; }
      }
      @keyframes ob-bubble-rise {
        0% { transform: translateY(40px) translateX(0) scale(0.8); opacity: 0; }
        10% { opacity: var(--o, 0.5); }
        90% { opacity: var(--o, 0.5); }
        100% { transform: translateY(-680px) translateX(25px) scale(1.2); opacity: 0; }
      }
      @keyframes ob-cosmic-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes ob-jelly-pulse {
        0%, 100% { transform: translateY(0) scaleY(1) scaleX(1); opacity: 0.35; }
        50% { transform: translateY(-30px) scaleY(0.9) scaleX(1.06); opacity: 0.8; }
      }
      @keyframes ob-crane-glide {
        0% { transform: translate(-80px, 80px) rotate(15deg); opacity: 0; }
        15% { opacity: 0.65; }
        85% { opacity: 0.65; }
        100% { transform: translate(180px, -180px) rotate(15deg); opacity: 0; }
      }
      @keyframes ob-crane-flap {
        0%, 100% { transform: scaleY(1); }
        50% { transform: scaleY(0.3) skewX(6deg); }
      }
      @keyframes ob-leaf-drift {
        0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
        15% { opacity: 1; }
        85% { opacity: 1; }
        100% { transform: translate(80px, 180px) rotate(180deg); opacity: 0; }
      }
      @keyframes ob-rain-fall {
        0% { transform: translateY(0); }
        95% { transform: translateY(680px); opacity: var(--o, 0.5); }
        100% { transform: translateY(680px); opacity: 0; }
      }
      @keyframes ob-rain-splash {
        0% { transform: scale(0.3); opacity: 0; }
        40% { opacity: 0.4; }
        80% { opacity: 0; }
        100% { transform: scale(1.5); opacity: 0; }
      }
      .ob-drift-slow { animation: ob-drift-slow 38s ease-in-out infinite; }
      .ob-drift { animation: ob-drift 24s ease-in-out infinite; }
      @keyframes ob-drift-slow {
        0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
        50% { transform: translate3d(2%, 3%, 0) scale(1.05); }
      }
      @keyframes ob-drift {
        0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
        50% { transform: translate3d(-3%, -2%, 0) rotate(5deg); }
      }
      .ob-orbit { animation: ob-spin 1.05s linear infinite; }
      @keyframes ob-spin { to { transform: rotate(360deg); } }
      .ob-float { animation: ob-float 4.5s ease-in-out infinite; }
      @keyframes ob-float {
        0%,100% { transform: translateY(0); }
        50% { transform: translateY(-7px); }
      }
      .ob-grain {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
      }
      @media (prefers-reduced-motion: reduce) {
        .ob-star, .ob-orbit, .ob-float { animation: none; }
      }
    `}</style>
  )
}
