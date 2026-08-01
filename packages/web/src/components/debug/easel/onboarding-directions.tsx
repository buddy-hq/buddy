import { useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "@buddy/ui"
import { ArrowLeftIcon, ArrowUpRightIcon, XIcon } from "@/icons/app-icons"
import { chatgptGlyph } from "@/components/onboarding/cinematic/primitives"
import { resolveBuddyIconUrl } from "@/lib/static-asset"

/**
 * Easel · Onboarding · three art directions for the same three steps
 *
 * The steps stay: mode → engine → location. What changes is how much shouts
 * at you, where the beauty budget goes, and how hard the surface leans on
 * ChatGPT.
 *
 * Three fixes carried by all three directions:
 *   1. less on screen  — the eyebrow, the footnote and the progress rail are
 *      gone from every step; a choice explains itself only while you consider it
 *   2. ChatGPT         — never a peer row in a menu of two; it gets the whole
 *      plinth and free models get one quiet line
 *   3. the folder      — the folder NAME is typeset as the hero, "in Documents"
 *      is the whole context, the absolute path lives in a tooltip
 *
 * Free-hand: local tokens, no design system, async mocked with timers.
 */

// ── Type ──────────────────────────────────────────────────────────────────

const FONT_LINK_ID = "ob-directions-fonts"
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@400;500;600&display=swap"
const FRAUNCES = '"Fraunces", Georgia, "Times New Roman", serif'
const INSTRUMENT = '"Instrument Serif", Georgia, "Times New Roman", serif'
const TIGHT = '"Inter Tight", ui-sans-serif, -apple-system, "Segoe UI", sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", monospace'

// ── Timing ────────────────────────────────────────────────────────────────

const CONNECT_DELAY_MS = 1_900
const FOLDER_PICK_DELAY_MS = 620
const ADVANCE_AFTER_SELECT_MS = 380
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]
const EASE_SOFT: [number, number, number, number] = [0.4, 0, 0.2, 1]

// ── Domain (mirrors the real onboarding contract) ─────────────────────────

const STEP_ORDER = ["mode", "engine", "location"] as const
type StepID = (typeof STEP_ORDER)[number]

const MODES = ["learn", "teach"] as const
type Mode = (typeof MODES)[number]

type Engine = "chatgpt" | "free"

const HOME_DIRECTORY = "/Users/prashantbhudwal"
const DEFAULT_DIRECTORY = `${HOME_DIRECTORY}/Documents/Buddy`
const PICKED_DIRECTORY = `${HOME_DIRECTORY}/Projects/Study Room`
const DIRECTORY_SEPARATOR = "/"

const MODE_COPY: Record<Mode, { verb: string; sentence: string; blurb: string }> = {
  learn: {
    verb: "Learn",
    sentence: "I'm here to learn.",
    blurb: "For students, researchers and lifelong learners.",
  },
  teach: {
    verb: "Teach",
    sentence: "I'm here to teach.",
    blurb: "For school teachers and homeschoolers.",
  },
}

const STEP_TITLE: Record<StepID, string> = { mode: "Mode", engine: "Engine", location: "Space" }

type DirectoryDescription = { name: string; parent?: string; short: string }

/**
 * The path fix. The folder NAME is the only thing that carries meaning at this
 * moment; the parent is context; the absolute path is a tooltip, never a
 * headline. Home collapses to `~`.
 */
function describeDirectory(absolutePath: string): DirectoryDescription {
  const segments = absolutePath.split(DIRECTORY_SEPARATOR).filter(Boolean)
  const name = segments.at(-1) ?? absolutePath
  const parent = segments.at(-2)
  const short = absolutePath.startsWith(HOME_DIRECTORY)
    ? `~${absolutePath.slice(HOME_DIRECTORY.length)}`
    : absolutePath

  return { name, parent, short }
}

// ── Shared flow state (one machine, three skins) ──────────────────────────

type OnboardingFlow = {
  step: StepID
  stepIndex: number
  mode?: Mode
  engine?: Engine
  directory: string
  picking: boolean
  connecting: boolean
  done: boolean
  goTo: (step: StepID) => void
  chooseMode: (mode: Mode) => void
  connectChatGpt: () => void
  cancelConnect: () => void
  chooseFree: () => void
  pickFolder: () => void
  confirm: () => void
  back: () => void
  reset: () => void
}

function useOnboardingFlow(): OnboardingFlow {
  const [step, setStep] = useState<StepID>("mode")
  const [mode, setMode] = useState<Mode>()
  const [engine, setEngine] = useState<Engine>()
  const [directory, setDirectory] = useState(DEFAULT_DIRECTORY)
  const [picking, setPicking] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [done, setDone] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer)
    },
    [],
  )

  function schedule(delayMs: number, run: () => void) {
    timers.current.push(setTimeout(run, delayMs))
  }

  function clearTimers() {
    for (const timer of timers.current) clearTimeout(timer)
    timers.current = []
  }

  return {
    step,
    stepIndex: STEP_ORDER.indexOf(step),
    mode,
    engine,
    directory,
    picking,
    connecting,
    done,
    goTo: setStep,
    chooseMode(next) {
      setMode(next)
      schedule(ADVANCE_AFTER_SELECT_MS, () => setStep("engine"))
    },
    connectChatGpt() {
      setConnecting(true)
      schedule(CONNECT_DELAY_MS, () => {
        setConnecting(false)
        setEngine("chatgpt")
        setStep("location")
      })
    },
    cancelConnect() {
      clearTimers()
      setConnecting(false)
    },
    chooseFree() {
      setEngine("free")
      schedule(ADVANCE_AFTER_SELECT_MS, () => setStep("location"))
    },
    pickFolder() {
      setPicking(true)
      schedule(FOLDER_PICK_DELAY_MS, () => {
        setPicking(false)
        setDirectory((current) =>
          current === DEFAULT_DIRECTORY ? PICKED_DIRECTORY : DEFAULT_DIRECTORY,
        )
      })
    },
    confirm() {
      setDone(true)
    },
    back() {
      const index = STEP_ORDER.indexOf(step)
      if (index > 0) setStep(STEP_ORDER[index - 1])
    },
    reset() {
      clearTimers()
      setStep("mode")
      setMode(undefined)
      setEngine(undefined)
      setDirectory(DEFAULT_DIRECTORY)
      setPicking(false)
      setConnecting(false)
      setDone(false)
    },
  }
}

// ── Shared atoms ──────────────────────────────────────────────────────────

function useOnboardingFont() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return
    const link = document.createElement("link")
    link.id = FONT_LINK_ID
    link.rel = "stylesheet"
    link.href = FONT_HREF
    document.head.appendChild(link)
  }, [])
}

function StyleTag() {
  return (
    <style>{`
      .obd-grain {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      }
      .obd-spin { animation: obd-spin 1.1s linear infinite; }
      .obd-orbit-slow { animation: obd-spin 26s linear infinite; }
      .obd-orbit-fast { animation: obd-spin 9s linear infinite; }
      @keyframes obd-spin { to { transform: rotate(360deg); } }
      .obd-breathe { animation: obd-breathe 7s ease-in-out infinite; }
      @keyframes obd-breathe {
        0%, 100% { transform: scale(1) translate3d(0,0,0); opacity: 0.85; }
        50% { transform: scale(1.06) translate3d(0,-1.5%,0); opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .obd-spin, .obd-orbit-slow, .obd-orbit-fast, .obd-breathe { animation: none; }
      }
    `}</style>
  )
}

function Grain({ opacity }: { opacity: number }) {
  return (
    <div
      aria-hidden
      className="obd-grain pointer-events-none absolute inset-0 z-[1] mix-blend-overlay"
      style={{ opacity }}
    />
  )
}

/** Masked line-by-line reveal. The one piece of choreography worth keeping. */
function DisplayLines({
  lines,
  className,
  style,
  accentLast,
  accentColor,
}: {
  lines: readonly string[]
  className?: string
  style?: React.CSSProperties
  accentLast?: boolean
  accentColor?: string
}) {
  return (
    <motion.h2
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.075, delayChildren: 0.04 } },
        exit: { transition: { staggerChildren: 0.028, staggerDirection: -1 } },
      }}
      className={className}
      style={style}
    >
      {lines.map((line, index) => (
        <span key={line} className="block overflow-hidden pb-[0.09em]">
          <motion.span
            variants={{
              hidden: { y: "112%" },
              show: { y: "0%", transition: { duration: 0.66, ease: EASE_OUT } },
              exit: { y: "-52%", opacity: 0, transition: { duration: 0.26, ease: EASE_OUT } },
            }}
            className="block"
            style={
              accentLast && index === lines.length - 1 && accentColor
                ? { color: accentColor }
                : undefined
            }
          >
            {line}
          </motion.span>
        </span>
      ))}
    </motion.h2>
  )
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.14 } },
  exit: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
}

const rise = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.46, ease: EASE_OUT } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.22, ease: EASE_OUT } },
}

function Spinner({ size, color }: { size: number; color: string }) {
  return (
    <span
      aria-hidden
      className="obd-spin inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(from 0deg, transparent, ${color}, transparent 68%)`,
        WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))`,
        mask: `radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))`,
      }}
    />
  )
}

function OpenAiKnot({ size, color }: { size: number; color: string }) {
  return (
    <span className="inline-flex shrink-0" style={{ width: size, height: size, color }}>
      {chatgptGlyph}
    </span>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// Direction 1 · EMBER — their nocturne, disciplined
// ══════════════════════════════════════════════════════════════════════════
//
// Same DNA they already have: warm black, Fraunces, ember. Everything that was
// chrome is gone — no eyebrow, no footnote, no dot rail. Progress becomes a
// single thread of light down the left edge, so the one decorative element on
// screen is also the only wayfinding element. A choice explains itself only
// while you are considering it, which is how the word count falls without
// losing the copy.

const EMBER_INK = "#070406"
const EMBER = "#FF6A2C"
const EMBER_WARM = "#FF9256"
const EMBER_PAPER = "#F7F1E8"

function EmberThread({ index, total }: { index: number; total: number }) {
  return (
    <div aria-hidden className="absolute inset-y-0 left-16 z-[2] w-px">
      <div className="absolute inset-0" style={{ background: "rgba(255,255,255,0.07)" }} />
      <motion.div
        className="absolute inset-x-0 top-0 origin-top"
        initial={false}
        animate={{ height: `${((index + 1) / total) * 100}%` }}
        transition={{ duration: 0.85, ease: EASE_OUT }}
        style={{
          background: `linear-gradient(180deg, transparent, ${EMBER} 22%, ${EMBER})`,
          boxShadow: `0 0 22px ${EMBER}`,
        }}
      />
      <motion.span
        className="absolute -left-[3px] size-[7px] rounded-full"
        initial={false}
        animate={{ top: `calc(${((index + 1) / total) * 100}% - 3.5px)` }}
        transition={{ duration: 0.85, ease: EASE_OUT }}
        style={{ background: EMBER_WARM, boxShadow: `0 0 18px ${EMBER}, 0 0 44px ${EMBER}` }}
      />
    </div>
  )
}

function EmberChoice({
  title,
  blurb,
  active,
  selected,
  dimmed,
  trailing,
  onHover,
  onClick,
}: {
  title: string
  blurb?: string
  active: boolean
  selected: boolean
  dimmed: boolean
  trailing?: ReactNode
  onHover: (hovering: boolean) => void
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      variants={rise}
      onClick={onClick}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className="group relative block w-full border-t border-white/[0.08] py-6 pl-7 pr-2 text-left outline-none last:border-b"
      animate={{ opacity: dimmed ? 0.32 : 1 }}
      transition={{ duration: 0.28, ease: EASE_SOFT }}
    >
      <motion.span
        aria-hidden
        className="absolute left-0 top-1/2 h-9 w-[2px] -translate-y-1/2 rounded-full"
        initial={false}
        animate={{ scaleY: active || selected ? 1 : 0, opacity: active || selected ? 1 : 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        style={{ background: EMBER, boxShadow: `0 0 16px ${EMBER}` }}
      />
      <span className="flex items-center gap-5">
        <motion.span
          className="min-w-0 flex-1"
          animate={{ x: active ? 5 : 0 }}
          transition={{ type: "spring", bounce: 0.2, duration: 0.45 }}
        >
          <span
            className="block text-[27px] leading-[1.15] tracking-[-0.015em] transition-colors duration-300"
            style={{
              fontFamily: FRAUNCES,
              fontWeight: 500,
              color: active || selected ? EMBER_WARM : EMBER_PAPER,
            }}
          >
            {title}
          </span>
          {blurb ? (
            <motion.span
              className="block overflow-hidden"
              initial={false}
              animate={{ height: active ? 26 : 0, opacity: active ? 1 : 0 }}
              transition={{ duration: 0.34, ease: EASE_OUT }}
            >
              <span className="block pt-1.5 text-[13px] leading-none text-white/40">{blurb}</span>
            </motion.span>
          ) : null}
        </motion.span>
        <span className="flex shrink-0 items-center">
          {trailing ?? (
            <ArrowUpRightIcon
              className="size-5 -translate-x-1.5 text-white/20 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:text-white/70 group-hover:opacity-100"
              strokeWidth={1.6}
            />
          )}
        </span>
      </span>
    </motion.button>
  )
}

function DirectionEmber({ flow }: { flow: OnboardingFlow }) {
  const [hovered, setHovered] = useState<string>()
  const described = describeDirectory(flow.directory)

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: EMBER_INK, fontFamily: TIGHT }}
    >
      {/* one warm light source, one cold rim — nothing else */}
      <div
        aria-hidden
        className="obd-breathe pointer-events-none absolute -left-[14%] -top-[34%] size-[78%] rounded-full blur-[120px]"
        style={{ background: `radial-gradient(closest-side, rgba(255,106,44,0.30), transparent 70%)` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[34%] -right-[16%] size-[62%] rounded-full blur-[140px]"
        style={{ background: "radial-gradient(closest-side, rgba(96,64,190,0.20), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(120% 80% at 50% 40%, transparent 40%, rgba(0,0,0,0.72))" }}
      />
      <Grain opacity={0.05} />

      <EmberThread index={flow.stepIndex} total={STEP_ORDER.length} />

      {flow.stepIndex > 0 && !flow.done ? (
        <button
          type="button"
          onClick={flow.back}
          className="absolute left-[88px] top-10 z-10 inline-flex items-center gap-1.5 text-[12.5px] text-white/25 transition-colors hover:text-white/70"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back
        </button>
      ) : null}

      <div className="relative z-[3] flex h-full items-center pl-[132px] pr-14">
        <AnimatePresence mode="wait">
          {flow.done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT }}
              className="w-full max-w-[560px]"
            >
              <p
                className="text-[52px] leading-none tracking-[-0.02em]"
                style={{ fontFamily: FRAUNCES, fontWeight: 500, color: EMBER_PAPER }}
              >
                Welcome to Buddy.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key={flow.step}
              variants={stagger}
              initial="hidden"
              animate="show"
              exit="exit"
              className="w-full max-w-[560px]"
            >
              {flow.step === "mode" ? (
                <>
                  <DisplayLines
                    lines={["What brings you", "to Buddy?"]}
                    className="text-[clamp(36px,4.6vw,52px)] leading-[1.02] tracking-[-0.02em]"
                    style={{ fontFamily: FRAUNCES, fontWeight: 500, color: EMBER_PAPER }}
                  />
                  <div className="mt-11">
                    {MODES.map((value) => (
                      <EmberChoice
                        key={value}
                        title={MODE_COPY[value].sentence}
                        blurb={MODE_COPY[value].blurb}
                        active={hovered === value}
                        selected={flow.mode === value}
                        dimmed={flow.mode !== undefined && flow.mode !== value}
                        onHover={(hovering) => setHovered(hovering ? value : undefined)}
                        onClick={() => flow.chooseMode(value)}
                      />
                    ))}
                  </div>
                </>
              ) : null}

              {flow.step === "engine" ? (
                <>
                  <DisplayLines
                    lines={["Buddy thinks", "with ChatGPT."]}
                    className="text-[clamp(36px,4.6vw,52px)] leading-[1.02] tracking-[-0.02em]"
                    style={{ fontFamily: FRAUNCES, fontWeight: 500, color: EMBER_PAPER }}
                    accentLast
                    accentColor={EMBER_WARM}
                  />

                  {/* the plinth — ChatGPT is not a row in a list of two */}
                  <motion.div variants={rise} className="mt-10">
                    <AnimatePresence mode="wait" initial={false}>
                      {flow.connecting ? (
                        <motion.div
                          key="connecting"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex h-[124px] items-center gap-5 rounded-2xl border border-white/[0.09] px-7"
                          style={{ background: "rgba(255,255,255,0.022)" }}
                        >
                          <Spinner size={24} color={EMBER} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[17px] text-white/85">Finish sign-in in your browser</p>
                            <p className="mt-1 text-[13px] text-white/35">Waiting for ChatGPT…</p>
                          </div>
                          <button
                            type="button"
                            onClick={flow.cancelConnect}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-[12.5px] text-white/45 transition-colors hover:border-white/25 hover:text-white/85"
                          >
                            <XIcon className="size-3" />
                            Cancel
                          </button>
                        </motion.div>
                      ) : (
                        <motion.button
                          key="plinth"
                          type="button"
                          onClick={flow.connectChatGpt}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.99 }}
                          transition={{ type: "spring", bounce: 0.22, duration: 0.4 }}
                          className="relative flex h-[124px] w-full items-center gap-6 overflow-hidden rounded-2xl px-7 text-left"
                          style={{
                            background: `linear-gradient(148deg, rgba(255,138,76,0.16), rgba(255,106,44,0.05) 46%, rgba(255,255,255,0.02))`,
                            border: "1px solid rgba(255,140,90,0.26)",
                            boxShadow: `0 26px 70px rgba(255,106,44,0.14), inset 0 1px 0 rgba(255,255,255,0.10)`,
                          }}
                        >
                          <span
                            aria-hidden
                            className="pointer-events-none absolute -right-10 -top-16 size-52 rounded-full blur-3xl"
                            style={{ background: "rgba(255,138,76,0.24)" }}
                          />
                          <OpenAiKnot size={44} color={EMBER_PAPER} />
                          <span className="min-w-0 flex-1">
                            <span
                              className="block text-[26px] leading-tight tracking-[-0.015em]"
                              style={{ fontFamily: FRAUNCES, fontWeight: 500, color: EMBER_PAPER }}
                            >
                              Connect ChatGPT
                            </span>
                            <span className="mt-1 block text-[13.5px] text-white/45">
                              Free or paid account — both work.
                            </span>
                          </span>
                          <span
                            className="shrink-0 rounded-full px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.16em]"
                            style={{ background: "rgba(255,106,44,0.16)", color: EMBER_WARM }}
                          >
                            Best
                          </span>
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  <motion.button
                    variants={rise}
                    type="button"
                    onClick={flow.chooseFree}
                    className="group mt-6 inline-flex items-center gap-2.5 text-[13px] text-white/28 transition-colors hover:text-white/70"
                  >
                    <span className="h-px w-6 bg-white/15 transition-colors group-hover:bg-white/40" />
                    Use free models instead — limited, no sign-in
                  </motion.button>
                </>
              ) : null}

              {flow.step === "location" ? (
                <>
                  <DisplayLines
                    lines={["Your work", "lives here."]}
                    className="text-[clamp(36px,4.6vw,52px)] leading-[1.02] tracking-[-0.02em]"
                    style={{ fontFamily: FRAUNCES, fontWeight: 500, color: EMBER_PAPER }}
                  />

                  {/* the folder NAME is the hero. the path is a tooltip. */}
                  <motion.div
                    variants={rise}
                    title={described.short}
                    className="mt-10 flex items-end gap-5 border-b border-white/[0.09] pb-6"
                  >
                    <span
                      className="text-[clamp(38px,4.8vw,56px)] leading-[0.95] tracking-[-0.025em]"
                      style={{ fontFamily: FRAUNCES, fontWeight: 500, color: EMBER_PAPER }}
                    >
                      {described.name}
                    </span>
                    {described.parent ? (
                      <span className="pb-2 text-[11px] uppercase tracking-[0.2em] text-white/28">
                        in {described.parent}
                      </span>
                    ) : null}
                  </motion.div>

                  <motion.div variants={rise} className="mt-8 flex items-center gap-7">
                    <motion.button
                      type="button"
                      onClick={flow.confirm}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ type: "spring", bounce: 0.24, duration: 0.36 }}
                      className="inline-flex h-12 items-center gap-2.5 rounded-full px-8 text-[14.5px] font-medium"
                      style={{
                        background: EMBER,
                        color: "#1A0A02",
                        boxShadow: `0 18px 50px rgba(255,106,44,0.28)`,
                      }}
                    >
                      Use this location
                      <ArrowUpRightIcon className="size-4" strokeWidth={2.4} />
                    </motion.button>
                    <button
                      type="button"
                      onClick={flow.pickFolder}
                      disabled={flow.picking}
                      className="text-[13px] text-white/30 underline-offset-4 transition-colors hover:text-white/75 hover:underline disabled:opacity-40"
                    >
                      {flow.picking ? "Opening picker…" : "Choose a different folder"}
                    </button>
                  </motion.div>
                </>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// Direction 2 · APERTURE — split canvas, the art carries the weight
// ══════════════════════════════════════════════════════════════════════════
//
// The left half gets quieter than anything they have now: one question, tiny
// numerals, no ornament. All the beauty budget moves to the right half, which
// is a living panel that answers the question back — it blooms toward the
// choice you hover, it becomes the ChatGPT knot when the engine is at stake,
// and it becomes a room with the folder name in it at the end. Restraint on
// the reading side, spectacle on the other.

const APERTURE_INK = "#08090C"
const APERTURE_PAPER = "#EDEEF2"
const APERTURE_ACCENT = "#FF6A2C"

const APERTURE_MOOD: Record<Mode, { a: string; b: string }> = {
  learn: { a: "rgba(56,189,248,0.55)", b: "rgba(129,140,248,0.45)" },
  teach: { a: "rgba(255,138,76,0.55)", b: "rgba(244,114,182,0.42)" },
}

function ApertureArt({
  step,
  mood,
  connecting,
  engine,
  directory,
}: {
  step: StepID
  mood?: Mode
  connecting: boolean
  engine?: Engine
  directory: string
}) {
  const palette = mood ? APERTURE_MOOD[mood] : { a: "rgba(148,163,184,0.42)", b: "rgba(99,102,241,0.32)" }
  const described = describeDirectory(directory)

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "#0B0D12" }}>
      <AnimatePresence mode="wait">
        {step === "mode" ? (
          <motion.div
            key="art-mode"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE_SOFT }}
            className="absolute inset-0"
          >
            <motion.div
              className="obd-breathe absolute left-[16%] top-[20%] size-[58%] rounded-full blur-[70px]"
              animate={{ background: `radial-gradient(closest-side, ${palette.a}, transparent 72%)` }}
              transition={{ duration: 0.7, ease: EASE_SOFT }}
            />
            <motion.div
              className="absolute bottom-[14%] right-[12%] size-[52%] rounded-full blur-[80px]"
              animate={{ background: `radial-gradient(closest-side, ${palette.b}, transparent 72%)` }}
              transition={{ duration: 0.7, ease: EASE_SOFT }}
            />
            <motion.div
              aria-hidden
              className="absolute left-1/2 top-1/2 aspect-square w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-full border"
              animate={{ borderColor: mood ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.07)" }}
              transition={{ duration: 0.6 }}
            />
            <div
              aria-hidden
              className="absolute left-1/2 top-1/2 aspect-square w-[74%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.05]"
            />
          </motion.div>
        ) : null}

        {step === "engine" ? (
          <motion.div
            key="art-engine"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div
              className="absolute size-[62%] rounded-full blur-[80px]"
              style={{ background: "radial-gradient(closest-side, rgba(255,138,76,0.42), transparent 72%)" }}
            />
            <div
              className={cn(
                "absolute aspect-square w-[64%] rounded-full border border-white/[0.09]",
                connecting ? "obd-orbit-fast" : "obd-orbit-slow",
              )}
              style={{ borderTopColor: connecting ? APERTURE_ACCENT : "rgba(255,255,255,0.22)" }}
            />
            <div
              className={cn(
                "absolute aspect-square w-[46%] rounded-full border border-white/[0.07]",
                connecting ? "obd-orbit-slow" : "",
              )}
            />
            <motion.div
              animate={{ scale: connecting ? 0.92 : 1 }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
              className="relative"
              style={{ filter: "drop-shadow(0 20px 60px rgba(255,106,44,0.45))" }}
            >
              <OpenAiKnot size={150} color={APERTURE_PAPER} />
            </motion.div>
          </motion.div>
        ) : null}

        {step === "location" ? (
          <motion.div
            key="art-location"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div
              className="absolute size-[70%] rounded-full blur-[90px]"
              style={{ background: "radial-gradient(closest-side, rgba(255,138,76,0.26), transparent 72%)" }}
            />
            {/* a receding room, with the folder name standing in it */}
            {[0, 1, 2, 3].map((depth) => (
              <div
                key={depth}
                aria-hidden
                className="absolute rounded-[22px] border"
                style={{
                  width: `${74 - depth * 13}%`,
                  height: `${72 - depth * 13}%`,
                  borderColor: `rgba(255,255,255,${0.05 + depth * 0.035})`,
                  transform: `translateY(${depth * -6}px)`,
                }}
              />
            ))}
            <div className="relative flex flex-col items-center gap-3 text-center" title={described.short}>
              <span
                className="text-[clamp(30px,3.6vw,44px)] leading-none tracking-[-0.025em]"
                style={{ fontFamily: TIGHT, fontWeight: 600, color: APERTURE_PAPER }}
              >
                {described.name}
              </span>
              {described.parent ? (
                <span
                  className="text-[10.5px] uppercase tracking-[0.28em] text-white/32"
                  style={{ fontFamily: MONO }}
                >
                  in {described.parent}
                </span>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {engine === "free" && step === "location" ? (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] text-white/25">
          Running on free models
        </div>
      ) : null}

      <Grain opacity={0.06} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(110% 70% at 50% 50%, transparent 45%, rgba(0,0,0,0.6))" }}
      />
    </div>
  )
}

function ApertureRow({
  index,
  title,
  active,
  selected,
  onHover,
  onClick,
}: {
  index: number
  title: string
  active: boolean
  selected: boolean
  onHover: (hovering: boolean) => void
  onClick: () => void
}) {
  return (
    <motion.button
      variants={rise}
      type="button"
      onClick={onClick}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className="group flex w-full items-baseline gap-5 border-b border-white/[0.07] py-5 text-left outline-none"
    >
      <span
        className="w-6 shrink-0 text-[11px] tabular-nums transition-colors"
        style={{ fontFamily: MONO, color: active || selected ? APERTURE_ACCENT : "rgba(255,255,255,0.22)" }}
      >
        {String(index).padStart(2, "0")}
      </span>
      <motion.span
        className="min-w-0 flex-1 text-[24px] leading-tight tracking-[-0.02em]"
        animate={{
          x: active ? 4 : 0,
          color: active || selected ? APERTURE_PAPER : "rgba(237,238,242,0.55)",
        }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.42 }}
        style={{ fontFamily: TIGHT, fontWeight: 500 }}
      >
        {title}
      </motion.span>
      <ArrowUpRightIcon
        className="size-4 shrink-0 -translate-x-1 text-white/20 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:text-white/70 group-hover:opacity-100"
        strokeWidth={1.8}
      />
    </motion.button>
  )
}

function DirectionAperture({ flow }: { flow: OnboardingFlow }) {
  const [hovered, setHovered] = useState<Mode>()
  const described = describeDirectory(flow.directory)
  const mood = hovered ?? flow.mode

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ fontFamily: TIGHT }}>
      {/* reading side — deliberately the emptiest screen in the app */}
      <div
        className="relative flex min-w-0 flex-1 flex-col justify-center px-14"
        style={{ background: APERTURE_INK }}
      >
        <div className="absolute left-14 top-11 flex items-center gap-3">
          <img src={resolveBuddyIconUrl()} alt="" className="size-6" />
          <span className="text-[11px] uppercase tracking-[0.24em] text-white/25">Buddy</span>
        </div>

        <AnimatePresence mode="wait">
          {flow.done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE_OUT }}
              className="max-w-[420px]"
            >
              <p
                className="text-[40px] leading-[1.05] tracking-[-0.03em]"
                style={{ fontFamily: TIGHT, fontWeight: 600, color: APERTURE_PAPER }}
              >
                Welcome to Buddy.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key={flow.step}
              variants={stagger}
              initial="hidden"
              animate="show"
              exit="exit"
              className="max-w-[420px]"
            >
              {flow.step === "mode" ? (
                <>
                  <DisplayLines
                    lines={["Are you here", "to learn or teach?"]}
                    className="text-[clamp(28px,3.2vw,38px)] leading-[1.12] tracking-[-0.03em]"
                    style={{ fontFamily: TIGHT, fontWeight: 600, color: APERTURE_PAPER }}
                  />
                  <div className="mt-9">
                    {MODES.map((value, index) => (
                      <ApertureRow
                        key={value}
                        index={index + 1}
                        title={MODE_COPY[value].verb}
                        active={hovered === value}
                        selected={flow.mode === value}
                        onHover={(hovering) => setHovered(hovering ? value : undefined)}
                        onClick={() => flow.chooseMode(value)}
                      />
                    ))}
                  </div>
                </>
              ) : null}

              {flow.step === "engine" ? (
                <>
                  <DisplayLines
                    lines={["Buddy thinks", "with ChatGPT."]}
                    className="text-[clamp(28px,3.2vw,38px)] leading-[1.12] tracking-[-0.03em]"
                    style={{ fontFamily: TIGHT, fontWeight: 600, color: APERTURE_PAPER }}
                  />
                  <motion.p variants={rise} className="mt-4 text-[14px] leading-relaxed text-white/40">
                    Sign in once. Free and paid accounts both work.
                  </motion.p>

                  <motion.div variants={rise} className="mt-9">
                    {flow.connecting ? (
                      <div className="flex h-[52px] items-center gap-3 rounded-xl border border-white/[0.1] px-4">
                        <Spinner size={16} color={APERTURE_ACCENT} />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] text-white/55">
                          Finish sign-in in your browser…
                        </span>
                        <button
                          type="button"
                          onClick={flow.cancelConnect}
                          className="text-[12.5px] text-white/35 transition-colors hover:text-white/80"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <motion.button
                        type="button"
                        onClick={flow.connectChatGpt}
                        whileHover={{ y: -1.5 }}
                        whileTap={{ scale: 0.985 }}
                        transition={{ type: "spring", bounce: 0.24, duration: 0.36 }}
                        className="flex h-[52px] w-full items-center justify-center gap-3 rounded-xl text-[15px] font-medium"
                        style={{
                          background: APERTURE_PAPER,
                          color: "#0B0D12",
                          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
                        }}
                      >
                        <OpenAiKnot size={18} color="#0B0D12" />
                        Continue with ChatGPT
                      </motion.button>
                    )}
                  </motion.div>

                  <motion.button
                    variants={rise}
                    type="button"
                    onClick={flow.chooseFree}
                    className="mt-5 text-[12.5px] text-white/25 underline-offset-4 transition-colors hover:text-white/65 hover:underline"
                  >
                    Continue without an account
                  </motion.button>
                </>
              ) : null}

              {flow.step === "location" ? (
                <>
                  <DisplayLines
                    lines={["Everything lands", "in one folder."]}
                    className="text-[clamp(28px,3.2vw,38px)] leading-[1.12] tracking-[-0.03em]"
                    style={{ fontFamily: TIGHT, fontWeight: 600, color: APERTURE_PAPER }}
                  />
                  <motion.p
                    variants={rise}
                    title={described.short}
                    className="mt-4 text-[14px] leading-relaxed text-white/40"
                  >
                    <span className="text-white/85">{described.name}</span>
                    {described.parent ? `, in ${described.parent}. ` : ". "}
                    You can open folders anywhere later.
                  </motion.p>

                  <motion.div variants={rise} className="mt-9 flex items-center gap-6">
                    <motion.button
                      type="button"
                      onClick={flow.confirm}
                      whileHover={{ y: -1.5 }}
                      whileTap={{ scale: 0.985 }}
                      transition={{ type: "spring", bounce: 0.24, duration: 0.36 }}
                      className="inline-flex h-[52px] items-center gap-2.5 rounded-xl px-7 text-[15px] font-medium"
                      style={{
                        background: APERTURE_ACCENT,
                        color: "#1A0A02",
                        boxShadow: "0 20px 50px rgba(255,106,44,0.24)",
                      }}
                    >
                      Use this location
                      <ArrowUpRightIcon className="size-4" strokeWidth={2.4} />
                    </motion.button>
                    <button
                      type="button"
                      onClick={flow.pickFolder}
                      disabled={flow.picking}
                      className="text-[12.5px] text-white/30 underline-offset-4 transition-colors hover:text-white/75 hover:underline disabled:opacity-40"
                    >
                      {flow.picking ? "Opening…" : "Pick another"}
                    </button>
                  </motion.div>
                </>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute bottom-11 left-14 flex items-center gap-4">
          {flow.stepIndex > 0 && !flow.done ? (
            <button
              type="button"
              onClick={flow.back}
              className="inline-flex items-center gap-1.5 text-[12px] text-white/25 transition-colors hover:text-white/70"
            >
              <ArrowLeftIcon className="size-3.5" />
              Back
            </button>
          ) : null}
          <span className="text-[11px] tabular-nums text-white/20" style={{ fontFamily: MONO }}>
            {String(flow.stepIndex + 1).padStart(2, "0")} — {String(STEP_ORDER.length).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* spectacle side */}
      <div className="relative hidden min-w-0 flex-1 lg:block">
        <ApertureArt
          step={flow.step}
          mood={mood}
          connecting={flow.connecting}
          engine={flow.engine}
          directory={flow.directory}
        />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// Direction 3 · LETTERPRESS — warm paper, ink, one red
// ══════════════════════════════════════════════════════════════════════════
//
// The contrarian option, and the reason it is here: onboarding in daylight
// makes entering the dark app feel like crossing a threshold. Print rules
// instead of borders, a page number instead of a progress bar, and one
// vermilion that only ever marks the recommended path. On paper, the black
// ChatGPT plinth is the highest-contrast object on screen — the nudge is
// carried by the ink, not by a badge.

const PRESS_PAPER = "#F2EDE3"
const PRESS_INK = "#171410"
const PRESS_SOFT = "#6C6459"
const PRESS_FAINT = "#B9B0A2"
const PRESS_RULE = "#DAD2C4"
const PRESS_RED = "#C0391B"

function PressRule() {
  return <span className="block h-px w-full" style={{ background: PRESS_RULE }} />
}

function PressChoice({
  ordinal,
  title,
  blurb,
  active,
  selected,
  onHover,
  onClick,
}: {
  ordinal: string
  title: string
  blurb: string
  active: boolean
  selected: boolean
  onHover: (hovering: boolean) => void
  onClick: () => void
}) {
  return (
    <motion.button
      variants={rise}
      type="button"
      onClick={onClick}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className="group relative block w-full py-6 text-left outline-none"
      style={{ borderTop: `1px solid ${PRESS_RULE}` }}
    >
      <motion.span
        aria-hidden
        className="absolute -left-6 top-1/2 h-7 w-[3px] -translate-y-1/2"
        initial={false}
        animate={{ scaleY: active || selected ? 1 : 0 }}
        transition={{ duration: 0.28, ease: EASE_OUT }}
        style={{ background: PRESS_RED }}
      />
      <span className="flex items-baseline gap-4">
        <span
          className="w-5 shrink-0 text-[11px] tabular-nums"
          style={{ fontFamily: MONO, color: active || selected ? PRESS_RED : PRESS_FAINT }}
        >
          {ordinal}
        </span>
        <motion.span
          className="min-w-0 flex-1"
          animate={{ x: active ? 4 : 0 }}
          transition={{ type: "spring", bounce: 0.2, duration: 0.42 }}
        >
          <span
            className="block text-[30px] leading-[1.1] tracking-[-0.01em]"
            style={{ fontFamily: INSTRUMENT, color: active || selected ? PRESS_RED : PRESS_INK }}
          >
            {title}
          </span>
          <motion.span
            className="block overflow-hidden"
            initial={false}
            animate={{ height: active ? 24 : 0, opacity: active ? 1 : 0 }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
          >
            <span className="block pt-1.5 text-[13px] leading-none" style={{ color: PRESS_SOFT }}>
              {blurb}
            </span>
          </motion.span>
        </motion.span>
        <ArrowUpRightIcon
          className="size-5 shrink-0 -translate-x-1.5 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
          strokeWidth={1.5}
          style={{ color: PRESS_RED }}
        />
      </span>
    </motion.button>
  )
}

function DirectionLetterpress({ flow }: { flow: OnboardingFlow }) {
  const [hovered, setHovered] = useState<Mode>()
  const described = describeDirectory(flow.directory)

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: PRESS_PAPER, fontFamily: TIGHT, color: PRESS_INK }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(120% 90% at 22% 8%, rgba(255,255,255,0.7), transparent 60%)" }}
      />
      <div
        aria-hidden
        className="obd-grain pointer-events-none absolute inset-0 z-[1] opacity-[0.16] mix-blend-multiply"
      />

      {/* page furniture: a hairline margin and a folio, like a book */}
      <div aria-hidden className="absolute inset-y-10 left-[76px] w-px" style={{ background: PRESS_RULE }} />
      <div className="absolute bottom-9 left-[76px] flex items-center gap-4 pl-6">
        {flow.stepIndex > 0 && !flow.done ? (
          <button
            type="button"
            onClick={flow.back}
            className="inline-flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-100"
            style={{ color: PRESS_SOFT, opacity: 0.7 }}
          >
            <ArrowLeftIcon className="size-3.5" />
            Back
          </button>
        ) : null}
        <span className="text-[11px] tabular-nums" style={{ fontFamily: MONO, color: PRESS_FAINT }}>
          {String(flow.stepIndex + 1).padStart(2, "0")} / {String(STEP_ORDER.length).padStart(2, "0")}
        </span>
      </div>
      <div className="absolute right-12 top-11 flex items-center gap-2.5">
        <img src={resolveBuddyIconUrl()} alt="" className="size-5" />
        <span className="text-[10.5px] uppercase tracking-[0.26em]" style={{ color: PRESS_FAINT }}>
          Buddy
        </span>
      </div>

      <div className="relative z-[2] flex h-full items-center pl-[140px] pr-16">
        <AnimatePresence mode="wait">
          {flow.done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE_OUT }}
            >
              <p className="text-[54px] leading-none" style={{ fontFamily: INSTRUMENT }}>
                Welcome to Buddy.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key={flow.step}
              variants={stagger}
              initial="hidden"
              animate="show"
              exit="exit"
              className="w-full max-w-[540px]"
            >
              {flow.step === "mode" ? (
                <>
                  <DisplayLines
                    lines={["What brings you", "to Buddy?"]}
                    className="text-[clamp(38px,4.8vw,56px)] leading-[1.0] tracking-[-0.015em]"
                    style={{ fontFamily: INSTRUMENT }}
                  />
                  <div className="mt-10">
                    {MODES.map((value, index) => (
                      <PressChoice
                        key={value}
                        ordinal={String(index + 1).padStart(2, "0")}
                        title={MODE_COPY[value].sentence}
                        blurb={MODE_COPY[value].blurb}
                        active={hovered === value}
                        selected={flow.mode === value}
                        onHover={(hovering) => setHovered(hovering ? value : undefined)}
                        onClick={() => flow.chooseMode(value)}
                      />
                    ))}
                    <PressRule />
                  </div>
                </>
              ) : null}

              {flow.step === "engine" ? (
                <>
                  <DisplayLines
                    lines={["Buddy thinks", "with ChatGPT."]}
                    className="text-[clamp(38px,4.8vw,56px)] leading-[1.0] tracking-[-0.015em]"
                    style={{ fontFamily: INSTRUMENT }}
                  />

                  <motion.div variants={rise} className="mt-9">
                    {flow.connecting ? (
                      <div
                        className="flex h-[68px] items-center gap-4 px-6"
                        style={{ border: `1px solid ${PRESS_RULE}` }}
                      >
                        <Spinner size={18} color={PRESS_RED} />
                        <span className="min-w-0 flex-1 text-[14px]" style={{ color: PRESS_SOFT }}>
                          Finish sign-in in your browser…
                        </span>
                        <button
                          type="button"
                          onClick={flow.cancelConnect}
                          className="text-[12.5px] underline-offset-4 hover:underline"
                          style={{ color: PRESS_FAINT }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <motion.button
                        type="button"
                        onClick={flow.connectChatGpt}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.99 }}
                        transition={{ type: "spring", bounce: 0.22, duration: 0.38 }}
                        className="flex h-[68px] w-full items-center gap-4 px-6 text-left"
                        style={{
                          background: PRESS_INK,
                          color: PRESS_PAPER,
                          boxShadow: "10px 10px 0 rgba(23,20,16,0.10)",
                        }}
                      >
                        <OpenAiKnot size={24} color={PRESS_PAPER} />
                        <span className="text-[19px]" style={{ fontFamily: INSTRUMENT }}>
                          Connect ChatGPT
                        </span>
                        <span className="ml-auto text-[12px] opacity-55">free or paid</span>
                        <ArrowUpRightIcon className="size-4 shrink-0" strokeWidth={2} />
                      </motion.button>
                    )}
                  </motion.div>

                  <motion.p variants={rise} className="mt-4 text-[13px]" style={{ color: PRESS_SOFT }}>
                    <span
                      className="mr-2 inline-block align-middle text-[10px] uppercase tracking-[0.18em]"
                      style={{ color: PRESS_RED }}
                    >
                      Recommended
                    </span>
                    Buddy never sees your password.
                  </motion.p>

                  <motion.div variants={rise} className="mt-10">
                    <PressRule />
                    <button
                      type="button"
                      onClick={flow.chooseFree}
                      className="group flex w-full items-baseline gap-4 py-4 text-left"
                    >
                      <span className="text-[15px]" style={{ color: PRESS_SOFT }}>
                        Use free models instead
                      </span>
                      <span className="text-[12.5px]" style={{ color: PRESS_FAINT }}>
                        limited messages, no sign-in
                      </span>
                      <ArrowUpRightIcon
                        className="ml-auto size-4 opacity-0 transition-opacity group-hover:opacity-100"
                        strokeWidth={1.6}
                        style={{ color: PRESS_SOFT }}
                      />
                    </button>
                  </motion.div>
                </>
              ) : null}

              {flow.step === "location" ? (
                <>
                  <DisplayLines
                    lines={["Your work", "lives here."]}
                    className="text-[clamp(38px,4.8vw,56px)] leading-[1.0] tracking-[-0.015em]"
                    style={{ fontFamily: INSTRUMENT }}
                  />

                  {/* a filing label, not a path string */}
                  <motion.div
                    variants={rise}
                    title={described.short}
                    className="mt-10 inline-flex flex-col gap-2 px-7 py-6"
                    style={{ border: `1px solid ${PRESS_INK}`, boxShadow: "8px 8px 0 rgba(23,20,16,0.08)" }}
                  >
                    <span
                      className="text-[10.5px] uppercase tracking-[0.26em]"
                      style={{ color: PRESS_RED }}
                    >
                      Folder
                    </span>
                    <span className="text-[42px] leading-none" style={{ fontFamily: INSTRUMENT }}>
                      {described.name}
                    </span>
                    {described.parent ? (
                      <span className="text-[12px]" style={{ color: PRESS_SOFT }}>
                        kept in {described.parent}
                      </span>
                    ) : null}
                  </motion.div>

                  <motion.div variants={rise} className="mt-9 flex items-center gap-7">
                    <motion.button
                      type="button"
                      onClick={flow.confirm}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.99 }}
                      transition={{ type: "spring", bounce: 0.22, duration: 0.38 }}
                      className="inline-flex h-[52px] items-center gap-2.5 px-8 text-[15px]"
                      style={{
                        background: PRESS_RED,
                        color: PRESS_PAPER,
                        boxShadow: "8px 8px 0 rgba(192,57,27,0.16)",
                      }}
                    >
                      Use this location
                      <ArrowUpRightIcon className="size-4" strokeWidth={2.2} />
                    </motion.button>
                    <button
                      type="button"
                      onClick={flow.pickFolder}
                      disabled={flow.picking}
                      className="text-[13px] underline-offset-4 transition-opacity hover:underline disabled:opacity-40"
                      style={{ color: PRESS_SOFT }}
                    >
                      {flow.picking ? "Opening picker…" : "Choose a different folder"}
                    </button>
                  </motion.div>
                </>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// Easel chrome
// ══════════════════════════════════════════════════════════════════════════

type DirectionID = "ember" | "aperture" | "letterpress"

type DirectionConfig = {
  id: DirectionID
  name: string
  thesis: string
  render: (flow: OnboardingFlow) => ReactNode
}

const DIRECTIONS: DirectionConfig[] = [
  {
    id: "ember",
    name: "Ember",
    thesis:
      "Their nocturne, disciplined. Chrome deleted, progress becomes one thread of light, and a choice explains itself only while you consider it.",
    render: (flow) => <DirectionEmber flow={flow} />,
  },
  {
    id: "aperture",
    name: "Aperture",
    thesis:
      "Split canvas. The reading side is the emptiest screen in the app; all the spectacle moves to a living panel that answers the question back.",
    render: (flow) => <DirectionAperture flow={flow} />,
  },
  {
    id: "letterpress",
    name: "Letterpress",
    thesis:
      "Daylight, so entering the dark app is a threshold. Print rules, a folio instead of a progress bar, and the black plinth does the nudging.",
    render: (flow) => <DirectionLetterpress flow={flow} />,
  },
]

export function OnboardingDirectionsEasel() {
  useOnboardingFont()
  const flow = useOnboardingFlow()
  const [directionID, setDirectionID] = useState<DirectionID>("ember")
  const [replayKey, setReplayKey] = useState(0)
  const direction = DIRECTIONS.find((entry) => entry.id === directionID) ?? DIRECTIONS[0]

  function replay() {
    flow.reset()
    setReplayKey((value) => value + 1)
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#0A0A0C]" style={{ fontFamily: TIGHT }}>
      <StyleTag />

      <div className="flex shrink-0 items-center gap-4 border-b border-white/[0.07] px-4 py-2.5">
        <div className="flex items-center gap-1">
          {DIRECTIONS.map((entry, index) => {
            const active = entry.id === direction.id
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setDirectionID(entry.id)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5 transition-colors",
                  active ? "bg-white/[0.08]" : "hover:bg-white/[0.035]",
                )}
              >
                <span
                  className="text-[10px] tabular-nums"
                  style={{ fontFamily: MONO, color: active ? EMBER : "rgba(255,255,255,0.22)" }}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  className="text-[13px] font-medium"
                  style={{ color: active ? "#F4F1EC" : "rgba(255,255,255,0.5)" }}
                >
                  {entry.name}
                </span>
              </button>
            )
          })}
        </div>

        <span className="h-5 w-px bg-white/[0.08]" />

        {/* jump to any step in any direction — the point of the easel */}
        <div className="flex items-center gap-1">
          {STEP_ORDER.map((step, index) => {
            const active = flow.step === step && !flow.done
            return (
              <button
                key={step}
                type="button"
                onClick={() => flow.goTo(step)}
                aria-pressed={active}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12px] transition-colors",
                  active ? "bg-white/[0.08] text-white/90" : "text-white/35 hover:text-white/70",
                )}
              >
                <span className="mr-1.5 text-[10px] tabular-nums text-white/25" style={{ fontFamily: MONO }}>
                  {index + 1}
                </span>
                {STEP_TITLE[step]}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={replay}
          className="ml-auto rounded-full border border-white/[0.1] px-3 py-1.5 text-[12px] text-white/45 transition-colors hover:border-white/25 hover:text-white/85"
        >
          Reset
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-stretch justify-center p-4">
        <div
          className="relative h-full w-full max-w-[1120px] overflow-hidden rounded-xl border border-white/[0.09]"
          style={{ boxShadow: "0 44px 130px rgba(0,0,0,0.6)" }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`${direction.id}-${replayKey}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24 }}
              className="h-full w-full"
            >
              {direction.render(flow)}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <p className="shrink-0 border-t border-white/[0.07] px-5 py-3 text-[12.5px] leading-relaxed text-white/45">
        {direction.thesis}
      </p>
    </div>
  )
}
