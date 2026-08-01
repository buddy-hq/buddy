import { useEffect, useRef, useState, type ReactNode } from "react"
import { motion } from "motion/react"
import { ArrowLeftIcon, ArrowUpRightIcon, XIcon } from "@/icons/app-icons"
import { chatgptGlyph } from "@/components/onboarding/cinematic/primitives"

/**
 * Easel · Onboarding step 2 (engine)
 *
 * One decision, one kind of object. Every previous pass mixed control species
 * on this screen — a filled pill or a solid sign-in button stacked on top of
 * menu rows — which is why it read as "half button, half others". A filled
 * button and a hairline row are not the same thing, so a user cannot tell
 * whether they are looking at one choice with a footnote or three choices.
 *
 * Now: three rows. ChatGPT is first, carries the mark, and is a size brighter.
 * That is the entire nudge. Removed from the previous pass:
 *   · the pill / sign-in button (a second control species)
 *   · the "or choose another engine" label (the rows below a recommendation
 *     are self-evidently the alternatives)
 *   · the "Recommended" tag (the subline already says it — saying it twice is
 *     not emphasis, it is clutter)
 *   · the right-aligned count meta (the headline already carries the count)
 *
 * Truth: Buddy works with 100+ AI providers (144 in the cached models.dev
 * catalog). ChatGPT is a recommendation, never the only path.
 */

// ── Type ──────────────────────────────────────────────────────────────────

const FONT_LINK_ID = "ob-engine-fonts"
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter+Tight:wght@400;500;600&display=swap"
const FRAUNCES = '"Fraunces", Georgia, "Times New Roman", serif'
const TIGHT = '"Inter Tight", ui-sans-serif, -apple-system, "Segoe UI", sans-serif'

// ── Tokens ────────────────────────────────────────────────────────────────

const INK = "#070406"
const PAPER = "#F7F1E8"
const EMBER = "#FF6A2C"
const EMBER_WARM = "#FF9256"
const EASEL_BG = "#0A0A0C"

/** One descending scale. Nothing below a level may outweigh the level above. */
const SCALE = {
  subline: 15,
  recommendedTitle: 24,
  peerTitle: 21,
  blurb: 13,
} as const

const CONNECT_DELAY_MS = 1_900
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

// ── Domain ────────────────────────────────────────────────────────────────

const STEP_COUNT = 3
const ENGINE_STEP_INDEX = 1
const PROVIDER_COUNT_LABEL = "100+"

const HEADING_LINES = ["Buddy works with", `${PROVIDER_COUNT_LABEL} AI providers.`] as const
const SUBLINE = "ChatGPT gives you the best experience."

const ENGINE_CHOICES = ["chatgpt", "free"] as const
type EngineChoice = (typeof ENGINE_CHOICES)[number]

/** Only what onboarding can actually do today. No row without a destination. */
const ENGINE_ROWS: { id: EngineChoice; title: string; blurb: string }[] = [
  { id: "chatgpt", title: "ChatGPT", blurb: "Works with free and paid accounts." },
  { id: "free", title: "Free models", blurb: "No sign-in. Limited messages and intelligence." },
]

/**
 * The other 140-odd providers are real but unreachable from onboarding, so
 * they are stated, never offered. Naming four makes the count concrete, and
 * naming Settings tells you where they are. Plain text — nothing to wire.
 */
const BREADTH_NOTE =
  "Anthropic, Gemini, OpenRouter, Ollama and 100+ more. Add any of them in Settings once you're in."

const CHOSEN_NOTE: Record<EngineChoice, string> = {
  chatgpt: "ChatGPT connected",
  free: "Running on free models",
}

// ── State ─────────────────────────────────────────────────────────────────

function useEngineState() {
  const [chosen, setChosen] = useState<EngineChoice>()
  const [connecting, setConnecting] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer)
    },
    [],
  )

  function clearTimers() {
    for (const timer of timers.current) clearTimeout(timer)
    timers.current = []
  }

  return {
    chosen,
    connecting,
    select(choice: EngineChoice) {
      if (choice !== "chatgpt") {
        setChosen(choice)
        return
      }
      setConnecting(true)
      timers.current.push(
        setTimeout(() => {
          setConnecting(false)
          setChosen("chatgpt")
        }, CONNECT_DELAY_MS),
      )
    },
    cancel() {
      clearTimers()
      setConnecting(false)
    },
    reset() {
      clearTimers()
      setChosen(undefined)
      setConnecting(false)
    },
  }
}

// ── Atoms ─────────────────────────────────────────────────────────────────

function useEngineFont() {
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
      .obe-grain {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      }
      .obe-spin { animation: obe-spin 1.1s linear infinite; }
      @keyframes obe-spin { to { transform: rotate(360deg); } }
      .obe-breathe { animation: obe-breathe 7s ease-in-out infinite; }
      @keyframes obe-breathe {
        0%, 100% { transform: scale(1); opacity: 0.85; }
        50% { transform: scale(1.05); opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .obe-spin, .obe-breathe { animation: none; }
      }
    `}</style>
  )
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.06 } },
}

const rise = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.44, ease: EASE_OUT } },
}

function Spinner({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      className="obe-spin inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(from 0deg, transparent, ${EMBER}, transparent 68%)`,
        WebkitMask:
          "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
        mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
      }}
    />
  )
}

/** Fixed-width leading slot on every row, so all three titles share a margin. */
const LEADING_SLOT_PX = 26

function LeadingSlot({ children }: { children?: ReactNode }) {
  return (
    <span
      aria-hidden={children === undefined}
      className="flex shrink-0 items-center justify-start"
      style={{ width: LEADING_SLOT_PX }}
    >
      {children}
    </span>
  )
}

function Knot({ size, color }: { size: number; color: string }) {
  return (
    <span className="inline-flex shrink-0" style={{ width: size, height: size, color }}>
      {chatgptGlyph}
    </span>
  )
}

// ── The row: the only interactive object on this screen ───────────────────

function EngineRow({
  title,
  blurb,
  recommended,
  onClick,
}: {
  title: string
  blurb: string
  recommended?: boolean
  onClick: () => void
}) {
  const [hovering, setHovering] = useState(false)

  return (
    <motion.button
      variants={rise}
      type="button"
      onClick={onClick}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      className="group relative flex w-full cursor-pointer items-center gap-4 overflow-hidden border-t border-white/10 py-5 pl-6 pr-2 text-left outline-none last:border-b"
    >
      {recommended ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          initial={false}
          animate={{ opacity: hovering ? 1 : 0.55 }}
          transition={{ duration: 0.3 }}
          style={{
            background:
              "linear-gradient(90deg, rgba(255,106,44,0.09), rgba(255,106,44,0.015) 55%, transparent)",
          }}
        />
      ) : null}

      <motion.span
        aria-hidden
        className="absolute left-0 top-1/2 h-8 w-[2px] -translate-y-1/2 rounded-full"
        initial={false}
        animate={{
          scaleY: hovering || recommended ? 1 : 0,
          opacity: hovering || recommended ? 1 : 0,
        }}
        transition={{ duration: 0.28, ease: EASE_OUT }}
        style={{ background: EMBER, boxShadow: `0 0 16px ${EMBER}` }}
      />

      <LeadingSlot>
        {recommended ? <Knot size={22} color="rgba(255,255,255,0.6)" /> : undefined}
      </LeadingSlot>

      <motion.span
        className="min-w-0 flex-1"
        animate={{ x: hovering ? 4 : 0 }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.42 }}
      >
        <span
          className="block leading-tight tracking-[-0.01em]"
          style={{
            fontFamily: FRAUNCES,
            fontWeight: 500,
            fontSize: recommended ? SCALE.recommendedTitle : SCALE.peerTitle,
            color: recommended ? PAPER : "rgba(247,241,232,0.7)",
          }}
        >
          {title}
        </span>
        <span
          className="mt-1 block leading-snug"
          style={{
            fontSize: SCALE.blurb,
            color: recommended ? "rgba(255,255,255,0.48)" : "rgba(255,255,255,0.3)",
          }}
        >
          {blurb}
        </span>
      </motion.span>

      <ArrowUpRightIcon
        className="size-5 shrink-0 -translate-x-1.5 text-white/20 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:text-white/70 group-hover:opacity-100"
        strokeWidth={1.6}
      />
    </motion.button>
  )
}

/** Occupies the ChatGPT row exactly, so the list never reflows mid-connect. */
function ConnectingRow({ onCancel }: { onCancel: () => void }) {
  return (
    <motion.div
      variants={rise}
      className="flex w-full items-center gap-4 border-t border-white/10 py-5 pl-6 pr-2"
    >
      <LeadingSlot>
        <Spinner size={20} />
      </LeadingSlot>
      <div className="min-w-0 flex-1">
        <p
          className="leading-tight tracking-[-0.01em]"
          style={{
            fontFamily: FRAUNCES,
            fontWeight: 500,
            fontSize: SCALE.recommendedTitle,
            color: PAPER,
          }}
        >
          Signing in…
        </p>
        <p className="mt-1 leading-snug text-white/48" style={{ fontSize: SCALE.blurb }}>
          Finish in your browser.
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-[12.5px] text-white/35 transition-colors hover:text-white/85"
      >
        <XIcon className="size-3" />
        Cancel
      </button>
    </motion.div>
  )
}

// ── The step ──────────────────────────────────────────────────────────────

function EngineStep({ state }: { state: ReturnType<typeof useEngineState> }) {
  const progress = ((ENGINE_STEP_INDEX + 1) / STEP_COUNT) * 100

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: INK, fontFamily: TIGHT }}
    >
      <div
        aria-hidden
        className="obe-breathe pointer-events-none absolute -left-[14%] -top-[34%] size-[76%] rounded-full blur-[120px]"
        style={{
          background: "radial-gradient(closest-side, rgba(255,106,44,0.26), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[32%] -right-[16%] size-[60%] rounded-full blur-[140px]"
        style={{
          background: "radial-gradient(closest-side, rgba(96,64,190,0.18), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(120% 80% at 50% 40%, transparent 40%, rgba(0,0,0,0.7))",
        }}
      />
      <div
        aria-hidden
        className="obe-grain pointer-events-none absolute inset-0 z-[1] opacity-[0.05] mix-blend-overlay"
      />

      <div aria-hidden className="absolute inset-y-0 left-16 z-[2] w-px">
        <div className="absolute inset-0" style={{ background: "rgba(255,255,255,0.07)" }} />
        <div
          className="absolute inset-x-0 top-0"
          style={{
            height: `${progress}%`,
            background: `linear-gradient(180deg, transparent, ${EMBER} 22%, ${EMBER})`,
            boxShadow: `0 0 22px ${EMBER}`,
          }}
        />
        <span
          className="absolute -left-[3px] size-[7px] rounded-full"
          style={{
            top: `calc(${progress}% - 3.5px)`,
            background: EMBER_WARM,
            boxShadow: `0 0 18px ${EMBER}, 0 0 44px ${EMBER}`,
          }}
        />
      </div>

      <button
        type="button"
        className="absolute left-[88px] top-10 z-10 inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] text-white/25 transition-colors hover:text-white/70"
      >
        <ArrowLeftIcon className="size-3.5" />
        Back
      </button>

      <div className="relative z-[3] flex h-full items-center pl-[132px] pr-14">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="w-full max-w-[560px]"
        >
          <motion.h2
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.075 } } }}
            className="text-[clamp(34px,4.4vw,50px)] leading-[1.03] tracking-[-0.02em]"
            style={{ fontFamily: FRAUNCES, fontWeight: 500, color: PAPER }}
          >
            {HEADING_LINES.map((line, index) => (
              <span key={line} className="block overflow-hidden pb-[0.08em]">
                <motion.span
                  variants={{
                    hidden: { y: "112%" },
                    show: { y: "0%", transition: { duration: 0.62, ease: EASE_OUT } },
                  }}
                  className="block"
                  style={index === HEADING_LINES.length - 1 ? { color: EMBER_WARM } : undefined}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </motion.h2>

          <motion.p
            variants={rise}
            className="mt-4 leading-relaxed text-white/45"
            style={{ fontSize: SCALE.subline }}
          >
            {SUBLINE}
          </motion.p>

          <motion.div variants={rise} className="mt-10">
            {ENGINE_ROWS.map((row) =>
              row.id === "chatgpt" && state.connecting ? (
                <ConnectingRow key={row.id} onCancel={state.cancel} />
              ) : (
                <EngineRow
                  key={row.id}
                  title={row.title}
                  blurb={row.blurb}
                  recommended={row.id === "chatgpt"}
                  onClick={() => state.select(row.id)}
                />
              ),
            )}
          </motion.div>

          <motion.p
            variants={rise}
            className="mt-6 max-w-[460px] text-[12.5px] leading-relaxed text-white/28"
          >
            {BREADTH_NOTE}
          </motion.p>

          {state.chosen ? (
            <motion.p variants={rise} className="mt-5 text-[12.5px]" style={{ color: EMBER_WARM }}>
              {CHOSEN_NOTE[state.chosen]}
            </motion.p>
          ) : null}
        </motion.div>
      </div>
    </div>
  )
}

// ── Easel chrome ──────────────────────────────────────────────────────────

export function EngineStepOptionsEasel() {
  useEngineFont()
  const state = useEngineState()

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col"
      style={{ background: EASEL_BG, fontFamily: TIGHT }}
    >
      <StyleTag />

      <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] px-4 py-2.5">
        <span className="text-[13px] font-medium" style={{ color: PAPER }}>
          Engine step · one list
        </span>
        <span className="text-[12px] text-white/30">
          One decision, one kind of object — no button stacked on rows
        </span>
        <button
          type="button"
          onClick={state.reset}
          className="ml-auto cursor-pointer rounded-full border border-white/[0.1] px-3 py-1.5 text-[12px] text-white/45 transition-colors hover:border-white/25 hover:text-white/85"
        >
          Reset
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-stretch justify-center p-4">
        <div
          className="relative h-full w-full max-w-[1060px] overflow-hidden rounded-xl border border-white/[0.09]"
          style={{ boxShadow: "0 44px 130px rgba(0,0,0,0.6)" }}
        >
          <EngineStep state={state} />
        </div>
      </div>
    </div>
  )
}
