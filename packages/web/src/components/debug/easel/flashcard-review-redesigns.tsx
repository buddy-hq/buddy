import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, type Variants } from "motion/react"
import { Badge, Button, ToggleGroup, ToggleGroupItem, cn } from "@buddy/ui"
import { PauseIcon, PlayIcon, RotateCcwIcon } from "@/icons/app-icons"

/**
 * Easel · Flashcard review · the index card
 *
 * One design, carried all the way through. Every surface in the stage now
 * speaks the index card's language: tight radius, hairline rules, paper, and
 * a labelled eyebrow over left-aligned document type. Nothing is a pill and
 * nothing is a capsule, because the card isn't.
 *
 * Interaction model:
 *   reveal — hinge (rotateY)
 *   aim    — hovering a rating rules its cell in that rating's colour
 *   leave  — the rating throws the card: Again ← … → Easy, Hard/Good fall
 *   enter  — the next card lifts off the deck underneath
 *
 * Invariants:
 *   · Zero layout shift. Header / body / footer are fixed rows, and every phase
 *     renders in the same box the card uses.
 *   · Deck depth is fixed pixels reserved *inside* the card box, never `scale`
 *     and never overflow — the deck peeks the same amount at 360px or 900px,
 *     and can never paint over the footer.
 *   · The deck is only drawn when a deck actually exists. An empty, drained or
 *     unreachable queue has nothing under the card, so it shows nothing.
 */

// ─── Geometry ──────────────────────────────────────────────────────────────

const HEADER_H_PX = 44
const BODY_MIN_H_PX = 220

const CARD_MAX_W_PX = 520
const CARD_MAX_H_PX = 330

/**
 * The ruler belongs to the card, not to the window: it sits directly under the
 * deck at the card's own width and the whole group centres together. Pinning it
 * to the bottom of a tall panel divorces the action from the thing being acted
 * on. Its slot is a fixed height so revealing cannot move the card.
 */
const ACTIONS_H_PX = 46
const ACTIONS_GAP_PX = 14

/** The deck under the card. Space for it is reserved in the box, not borrowed. */
const STACK_COUNT = 3
const STACK_STEP_PX = 9
const STACK_TOTAL_PX = STACK_COUNT * STACK_STEP_PX
const BOX_MAX_H_PX = CARD_MAX_H_PX + STACK_TOTAL_PX
/** Card + deck + gap + ruler, centred as one object. */
const GROUP_MAX_H_PX = BOX_MAX_H_PX + ACTIONS_GAP_PX + ACTIONS_H_PX

/**
 * Hinge faces must be opaque. In dark themes most `surface-*` tokens resolve to
 * neutralAlpha(), so a translucent face lets the stage — and mid-turn, the
 * mirrored back face — bleed through. Only these families are solid in both
 * light and dark, so faces may only use these.
 */
const OPAQUE_PAPER = "bg-surface-raised-stronger-non-alpha"
const OPAQUE_UNDER = "bg-surface-float-base"

/** The card's material, reused by the deck slabs, the footer and the panels. */
const CARD_RADIUS = "rounded-sm"
const CARD_CHROME = cn(OPAQUE_PAPER, "border border-border-strong-base shadow-md")
const STACK_CHROME = cn(OPAQUE_UNDER, "border border-border-base")

const DEFAULT_STAGE_H_PX = 560

/**
 * Contact tiles are true miniatures: the stage renders at its *own live pixel
 * size* and is then scaled down, so every tile carries the real aspect ratio,
 * the real measure, and the real line wrapping. A fixed portrait box would show
 * a layout the product never has.
 *
 * The zoom is a fraction of the *available row width*, not a fixed pixel width —
 * a fixed width made tiles collapse to ~36% on a wide bench, which is unreadable.
 * `fit` never upscales past 1:1, so a small stage stays honest.
 */
type ContactZoomID = "fit" | "three-quarter" | "half"
const CONTACT_ZOOMS: { id: ContactZoomID; label: string; fraction: number }[] = [
  { id: "fit", label: "Fit", fraction: 1 },
  { id: "three-quarter", label: "75%", fraction: 0.75 },
  { id: "half", label: "50%", fraction: 0.5 },
]
/** Matches the `w-40` label gutter and the `sm:gap-5` beside it. */
const CONTACT_GUTTER_PX = 160
const CONTACT_GAP_PX = 20
const CONTACT_MIN_W_PX = 320
const FALLBACK_STAGE_W_PX = 960

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, size }
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

type RatingID = "again" | "hard" | "good" | "easy"

type MockCard = {
  id: string
  label: string
  kind: "basic" | "cloze"
  /** Basic: the question. Cloze: full text with {{c1::…}} markers. */
  prompt: string
  /** Basic only. */
  answer: string
  ordinal: number
  intervals: Record<RatingID, string>
  stats: { ease: string; reps: number; lapses: number; due: string }
}

const DECK_TITLE = "GLM-5: Main Ideas and Learning Path"
const DECK_TOTAL = 24

const CARDS: MockCard[] = [
  {
    id: "mla",
    label: "long answer",
    kind: "basic",
    prompt: "What problem does Multi-Latent Attention (MLA) address in GLM-5?",
    answer:
      "It compresses the key-value representation so the cache stays small, which is what makes long-context inference affordable — while aiming to hold attention quality level with grouped-query attention.",
    ordinal: 0,
    intervals: { again: "<1m", hard: "6m", good: "10m", easy: "4d" },
    stats: { ease: "2.35", reps: 4, lapses: 1, due: "today" },
  },
  {
    id: "moe",
    label: "short answer",
    kind: "basic",
    prompt: "What does MoE stand for?",
    answer: "Mixture of Experts.",
    ordinal: 0,
    intervals: { again: "<1m", hard: "8m", good: "1d", easy: "6d" },
    stats: { ease: "2.80", reps: 9, lapses: 0, due: "today" },
  },
  {
    id: "cloze",
    label: "cloze",
    kind: "cloze",
    prompt:
      "GLM-5 routes each token to {{c1::a small subset of experts}}, so the {{c2::activated}} parameter count stays far below the total.",
    answer: "",
    ordinal: 1,
    intervals: { again: "<1m", hard: "10m", good: "2d", easy: "9d" },
    stats: { ease: "2.10", reps: 2, lapses: 3, due: "today" },
  },
  {
    id: "balance",
    label: "essay-length",
    kind: "basic",
    prompt: "Why does a mixture-of-experts model need a load-balancing loss during training?",
    answer:
      "Without one the router collapses onto a handful of experts. Those experts see nearly all the tokens, train faster, and so become even more attractive to the router — a feedback loop. The rest stay undertrained, effective capacity falls far below what the parameter count implies, and throughput suffers because the busy experts become a scheduling bottleneck across devices.",
    ordinal: 0,
    intervals: { again: "<1m", hard: "5m", good: "10m", easy: "3d" },
    stats: { ease: "1.95", reps: 6, lapses: 4, due: "today" },
  },
]

const RATINGS: { id: RatingID; label: string; key: string }[] = [
  { id: "again", label: "Again", key: "1" },
  { id: "hard", label: "Hard", key: "2" },
  { id: "good", label: "Good", key: "3" },
  { id: "easy", label: "Easy", key: "4" },
]

/** Seeds the session so progress opens mid-deck rather than at zero. */
const SEED_HISTORY: RatingID[] = ["good", "good", "again", "good", "easy", "hard", "good"]
const AUTOPLAY_RATINGS: RatingID[] = ["good", "again", "easy", "hard"]

/** One colour per rating, spent only on hairlines — never on a filled pill. */
const RATING_TONE: Record<RatingID, { rule: string; text: string }> = {
  again: { rule: "bg-surface-critical-base", text: "text-text-critical-base" },
  hard: { rule: "bg-surface-warning-base", text: "text-text-warning-base" },
  good: { rule: "bg-surface-success-base", text: "text-text-success-base" },
  easy: { rule: "bg-surface-interactive-base", text: "text-text-interactive-base" },
}

// ─── Axes ──────────────────────────────────────────────────────────────────

type PhaseID = "front" | "revealed" | "leech" | "loading" | "no-due" | "complete" | "error"
type StageID = "bench" | "panel" | "short" | "tall"
type SpeedID = "full" | "half" | "quarter"

const PHASES: { id: PhaseID; label: string; note: string }[] = [
  { id: "front", label: "Front", note: "Answer hidden" },
  { id: "revealed", label: "Revealed", note: "Ratings live" },
  { id: "leech", label: "Leech", note: "Revealed + 4 lapses" },
  { id: "loading", label: "Loading", note: "Dealing next card · deck stays" },
  { id: "no-due", label: "No due", note: "Nothing scheduled · no deck" },
  { id: "complete", label: "Complete", note: "Queue drained · no deck" },
  { id: "error", label: "Error", note: "Fetch failed · no deck" },
]

const STAGES: { id: StageID; label: string; width?: number; height?: number }[] = [
  { id: "bench", label: "Bench" },
  { id: "panel", label: "420 wide", width: 420 },
  { id: "short", label: "620×360", width: 620, height: 360 },
  { id: "tall", label: "760×900", width: 760, height: 900 },
]

const SPEEDS: { id: SpeedID; label: string; factor: number }[] = [
  { id: "full", label: "1×", factor: 1 },
  { id: "half", label: "0.4×", factor: 0.4 },
  { id: "quarter", label: "0.15×", factor: 0.15 },
]

const HINGE_SPRING = { type: "spring", stiffness: 220, damping: 26, mass: 0.9 } as const

// ─── Motion ────────────────────────────────────────────────────────────────

type Ease = [number, number, number, number]
/** Arrivals decelerate hard — the card looks like it settled, not stopped. */
const EASE_SETTLE: Ease = [0.22, 1, 0.36, 1]
/** Departures accelerate — a thrown card gets faster, it does not ease out. */
const EASE_LEAVE: Ease = [0.4, 0.02, 0.85, 0.4]

function timing(seconds: number, speed: number, delay = 0, ease: Ease = EASE_SETTLE) {
  return { duration: seconds / speed, delay: delay / speed, ease }
}

function hingeTransition(speed: number) {
  if (speed >= 1) return HINGE_SPRING
  return { type: "tween", ...timing(0.55, speed) } as const
}

/** Where the rating throws the card. Again ← … → Easy; the two middles fall. */
const THROW_VECTOR: Record<RatingID, { x: number; y: number; rotate: number }> = {
  again: { x: -520, y: 30, rotate: -18 },
  hard: { x: -330, y: 260, rotate: -11 },
  good: { x: 330, y: 260, rotate: 11 },
  easy: { x: 520, y: 30, rotate: 18 },
}
const THROW_NEUTRAL = { x: 0, y: -300, rotate: 0 }

/** Hovering a rating leans the card that way, so the throw is never a surprise. */
const AIM_LEAN: Record<RatingID, { x: number; rotate: number }> = {
  again: { x: -18, rotate: -2.4 },
  hard: { x: -8, rotate: -1.1 },
  good: { x: 8, rotate: 1.1 },
  easy: { x: 18, rotate: 2.4 },
}
const NO_LEAN = { x: 0, rotate: 0 }

const SWAP_PERSPECTIVE = 1500

function swapVariants(speed: number): Variants {
  return {
    enter: { opacity: 0, x: 0, y: 30, scale: 0.9, rotate: 0, zIndex: 1 },
    settled: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      rotate: 0,
      zIndex: 1,
      transition: timing(0.38, speed, 0.06),
    },
    leave: (rating: RatingID | null) => {
      const vector = rating ? THROW_VECTOR[rating] : THROW_NEUTRAL
      return {
        ...vector,
        opacity: 0,
        scale: 0.94,
        zIndex: 3,
        transition: timing(0.44, speed, 0, EASE_LEAVE),
      }
    },
  }
}

// ─── Cloze — the blank a person could actually write on ────────────────────

const CLOZE_PATTERN = /\{\{c(\d+)::(.*?)\}\}/g

function ClozeBlank(props: { answer: string }) {
  return (
    <span className="relative mx-0.5 inline-block border-b-2 border-border-strong-base align-baseline">
      <span className="invisible">{props.answer}</span>
    </span>
  )
}

function ClozeFilled(props: { answer: string }) {
  return (
    <span className="mx-0.5 inline-block border-b-2 border-border-interactive-base text-text-interactive-base">
      {props.answer}
    </span>
  )
}

/** Non-target clozes stay plain — only the card's own ordinal is the question. */
function ClozeText(props: { text: string; ordinal: number; revealed: boolean }) {
  const pieces: ReactNode[] = []
  const pattern = new RegExp(CLOZE_PATTERN)
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(props.text)) !== null) {
    const [full, rawOrdinal, answer] = match
    if (match.index > cursor) pieces.push(props.text.slice(cursor, match.index))
    const ordinal = Number(rawOrdinal)
    const key = `${ordinal}-${match.index}`

    if (ordinal !== props.ordinal) {
      pieces.push(<span key={key}>{answer}</span>)
    } else if (props.revealed) {
      pieces.push(<ClozeFilled key={key} answer={answer ?? ""} />)
    } else {
      pieces.push(<ClozeBlank key={key} answer={answer ?? ""} />)
    }
    cursor = match.index + full.length
  }
  if (cursor < props.text.length) pieces.push(props.text.slice(cursor))

  return <>{pieces}</>
}

// ─── Card parts ────────────────────────────────────────────────────────────

/** The eyebrow + hairline that opens every face and every panel on the card. */
function RuledHead(props: { label: string; critical?: boolean }) {
  return (
    <div className="shrink-0 px-8 pb-2 pt-5">
      <span
        className={cn(
          "text-[10px] font-medium uppercase tracking-[0.16em]",
          props.critical ? "text-text-critical-base" : "text-text-weaker",
        )}
      >
        {props.label}
      </span>
      <div
        className={cn(
          "mt-2 h-px w-full",
          props.critical ? "bg-border-critical-base" : "bg-border-base",
        )}
      />
    </div>
  )
}

function CardFace(props: { card: MockCard; revealed: boolean }) {
  const { card } = props
  return (
    <div className="flex h-full flex-col">
      <RuledHead
        label={
          props.revealed ? "Answer" : card.kind === "cloze" ? `Cloze ${card.ordinal}` : "Question"
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6">
        {card.kind === "cloze" ? (
          <p className="text-pretty text-[17px] leading-relaxed text-text-stronger">
            <ClozeText text={card.prompt} ordinal={card.ordinal} revealed={props.revealed} />
          </p>
        ) : props.revealed ? (
          <>
            <p className="mb-3 line-clamp-2 text-[12px] leading-snug text-text-weaker">
              {card.prompt}
            </p>
            <p className="text-pretty text-[17px] leading-relaxed text-text-interactive-base">
              {card.answer}
            </p>
          </>
        ) : (
          <p className="text-pretty text-[17px] leading-relaxed text-text-stronger">
            {card.prompt}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Hinge — the reveal ────────────────────────────────────────────────────

function Hinge(props: { revealed: boolean; speed: number; onToggle: () => void; card: MockCard }) {
  const face = cn("absolute inset-0 overflow-hidden", CARD_RADIUS, CARD_CHROME)
  return (
    <motion.button
      type="button"
      onClick={props.onToggle}
      className={cn("absolute inset-0 text-left", CARD_RADIUS)}
      style={{ transformStyle: "preserve-3d" }}
      initial={false}
      animate={{ rotateY: props.revealed ? 180 : 0 }}
      transition={hingeTransition(props.speed)}
    >
      <div className={face} style={{ backfaceVisibility: "hidden" }}>
        <CardFace card={props.card} revealed={false} />
      </div>
      <div className={face} style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
        <CardFace card={props.card} revealed />
      </div>
    </motion.button>
  )
}

// ─── Phases ────────────────────────────────────────────────────────────────

type PhaseCopy = { eyebrow: string; title: string; body: string; action?: string }

function phaseCopy(phase: PhaseID, reviewed: number): PhaseCopy | null {
  switch (phase) {
    case "loading":
      return { eyebrow: "Dealing", title: "Next card", body: "Pulling the next due card." }
    case "no-due":
      return {
        eyebrow: "Scheduled",
        title: "Nothing due",
        body: "The next card in this deck comes back in about 4 hours.",
        action: "Study ahead",
      }
    case "complete":
      return {
        eyebrow: "Session",
        title: "Queue cleared",
        body: `${reviewed} cards reviewed. Next batch unlocks tomorrow morning.`,
        action: "Review again",
      }
    case "error":
      return {
        eyebrow: "Interrupted",
        title: "Couldn't reach the scheduler",
        body: "Your last rating was saved. Reconnecting will resume from the same position.",
        action: "Retry",
      }
    default:
      return null
  }
}

const PHASE_ACCENT: Record<string, string> = {
  loading: "text-text-weak",
  "no-due": "text-text-weak",
  complete: "text-text-success-base",
  error: "text-text-critical-base",
}

function isCardPhase(phase: PhaseID) {
  return phase === "front" || phase === "revealed" || phase === "leech"
}

function isRevealed(phase: PhaseID) {
  return phase === "revealed" || phase === "leech"
}

/**
 * Is there a deck under the card at all? Dealing means the next card is on its
 * way, so the pile stays. An empty, drained or unreachable queue has nothing
 * behind it — drawing a stack there would be a lie about the state.
 */
function hasDeck(phase: PhaseID) {
  return phase !== "no-due" && phase !== "complete" && phase !== "error"
}

function PhasePanel(props: { phase: PhaseID; copy: PhaseCopy }) {
  const critical = props.phase === "error"
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col",
        CARD_RADIUS,
        CARD_CHROME,
        critical && "border-border-critical-base",
      )}
    >
      <RuledHead label={props.copy.eyebrow} critical={critical} />
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 px-8 pb-6">
        <p className={cn("text-lg font-medium", PHASE_ACCENT[props.phase])}>{props.copy.title}</p>
        <p className="max-w-[46ch] text-[13px] leading-relaxed text-text-weak">{props.copy.body}</p>
        {props.copy.action ? (
          <button
            type="button"
            className={cn(
              "mt-3 w-fit px-3 py-1.5 text-[12px] font-medium text-text-strong transition-colors",
              CARD_RADIUS,
              "border border-border-strong-base bg-surface-inset-base hover:bg-surface-float-base",
            )}
          >
            {props.copy.action}
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ─── The stage ─────────────────────────────────────────────────────────────

type ReviewStageProps = {
  card: MockCard
  phase: PhaseID
  reviewed: number
  /** Identity of the card on stage. Bumping it plays leave + enter. */
  seq: number
  /** The rating that ejected the previous card — aims the exit. */
  lastRating: RatingID | null
  /** 1 = real time. Lower values stretch every transition for inspection. */
  speed: number
  onToggleReveal: () => void
  onRate: (rating: RatingID) => void
}

function ReviewStage(props: ReviewStageProps) {
  const { onRate } = props
  const revealed = isRevealed(props.phase)
  const copy = phaseCopy(props.phase, props.reviewed)
  const remaining = Math.max(0, DECK_TOTAL - props.reviewed)
  const deck = hasDeck(props.phase)

  const [aimed, setAimed] = useState<RatingID | null>(null)
  /**
   * Gated on `revealed` as well as cleared on click. The rating cells unmount
   * the instant a card is thrown, so `onMouseLeave` never fires — without this
   * the stale aim would mount the *next* card already tilted.
   */
  const lean = revealed && aimed ? AIM_LEAN[aimed] : NO_LEAN

  const throwCard = useCallback(
    (rating: RatingID) => {
      setAimed(null)
      onRate(rating)
    },
    [onRate],
  )

  return (
    <div className="grid h-full min-h-0 w-full grid-rows-[auto_1fr] bg-background-strong">
      <header className="flex shrink-0 items-center gap-3 px-6" style={{ height: HEADER_H_PX }}>
        <span className="h-3 w-1 bg-surface-critical-base" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-text-weak">
          {DECK_TITLE}
        </p>
        {/* Reserved slot — occupied or not, the header never re-measures. */}
        <span className="w-14 shrink-0 text-right text-[10px] uppercase tracking-[0.14em] text-text-critical-base">
          {props.phase === "leech" ? "leech" : ""}
        </span>
        {/* Squared off, like everything else on this card. */}
        <div className="h-1 w-24 shrink-0 overflow-hidden bg-surface-inset-strong">
          <div
            className="h-full bg-surface-interactive-base"
            style={{ width: `${(props.reviewed / DECK_TOTAL) * 100}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-weaker">
          {String(props.reviewed).padStart(2, "0")}/{DECK_TOTAL}
        </span>
      </header>

      <div
        className="flex min-h-0 items-center justify-center px-6 py-4"
        style={{ minHeight: BODY_MIN_H_PX }}
      >
        {/* Card, deck and ruler are one object and centre together. The deck's
            depth is reserved inside the card box, so it never overflows and the
            card does not move when the deck disappears. */}
        <div
          className="flex w-full flex-col"
          style={{
            maxWidth: CARD_MAX_W_PX,
            height: "100%",
            maxHeight: GROUP_MAX_H_PX,
            minHeight: `min(${GROUP_MAX_H_PX}px, 100%)`,
          }}
        >
          <div className="relative w-full min-h-0 flex-1" style={{ perspective: SWAP_PERSPECTIVE }}>
            {/* Deepest first, so nearer slabs paint on top. Each one peeks a fixed
              STACK_STEP_PX further below the card — pixels, never scale. */}
            {deck
              ? Array.from({ length: STACK_COUNT }, (_, index) => {
                  const depth = STACK_COUNT - index
                  if (depth >= remaining) return null
                  return (
                    <div
                      key={depth}
                      aria-hidden
                      className={cn("absolute", CARD_RADIUS, STACK_CHROME)}
                      style={{
                        left: depth * (STACK_STEP_PX / 2),
                        right: depth * (STACK_STEP_PX / 2),
                        top: depth * STACK_STEP_PX,
                        bottom: STACK_TOTAL_PX - depth * STACK_STEP_PX,
                        opacity: 1 - depth * 0.16,
                      }}
                    />
                  )
                })
              : null}

            {/* The live card sits above the deck, inset by exactly its depth. */}
            <div className="absolute inset-x-0 top-0" style={{ bottom: STACK_TOTAL_PX }}>
              <AnimatePresence initial={false} custom={props.lastRating}>
                <motion.div
                  key={props.seq}
                  custom={props.lastRating}
                  variants={swapVariants(props.speed)}
                  initial="enter"
                  animate="settled"
                  exit="leave"
                  className="absolute inset-0"
                  style={{ transformStyle: "preserve-3d" }}
                >
                  {/* Aim lives inside the swap so a thrown card keeps its lean on
                    the way out, and outside the hinge so it survives the flip. */}
                  <motion.div
                    className="absolute inset-0"
                    style={{ transformStyle: "preserve-3d" }}
                    initial={false}
                    animate={{ x: lean.x, rotate: lean.rotate }}
                    transition={timing(0.22, props.speed)}
                  >
                    {isCardPhase(props.phase) ? (
                      <Hinge
                        card={props.card}
                        revealed={revealed}
                        speed={props.speed}
                        onToggle={props.onToggleReveal}
                      />
                    ) : copy ? (
                      <PhasePanel phase={props.phase} copy={copy} />
                    ) : null}
                  </motion.div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* The rating ruler: one strip at the card's own width, sitting
              directly under the deck. Card radius, card border, card paper,
              divided by the same hairline that rules the card's head. The aim
              shows as a coloured rule along the cell's top edge — no pills. */}
          <div
            className="flex w-full shrink-0 items-center justify-center"
            style={{ height: ACTIONS_H_PX, marginTop: ACTIONS_GAP_PX }}
          >
            {revealed ? (
              <div
                className={cn(
                  "flex h-full w-full overflow-hidden",
                  CARD_RADIUS,
                  "border border-border-strong-base",
                )}
              >
                {RATINGS.map((rating, index) => {
                  const tone = RATING_TONE[rating.id]
                  const isAimed = aimed === rating.id
                  return (
                    <button
                      key={rating.id}
                      type="button"
                      onClick={() => throwCard(rating.id)}
                      onMouseEnter={() => setAimed(rating.id)}
                      onMouseLeave={() => setAimed(null)}
                      onFocus={() => setAimed(rating.id)}
                      onBlur={() => setAimed(null)}
                      className={cn(
                        "relative flex flex-1 items-center justify-center transition-colors",
                        OPAQUE_PAPER,
                        "hover:bg-surface-float-base",
                        index > 0 && "border-l border-border-base",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-x-0 top-0 h-[3px] transition-opacity",
                          tone.rule,
                          isAimed ? "opacity-100" : "opacity-70",
                        )}
                      />
                      <span
                        className={cn(
                          "text-[12px] font-medium transition-colors",
                          isAimed ? tone.text : "text-text-strong",
                        )}
                      >
                        {rating.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : props.phase === "front" ? (
              <p className="text-[11px] text-text-weaker">Click the card to turn it over</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Easel container ───────────────────────────────────────────────────────

export function FlashcardReviewRedesignsEasel() {
  const [phase, setPhase] = useState<PhaseID>("front")
  const [stage, setStage] = useState<StageID>("bench")
  const [speedID, setSpeedID] = useState<SpeedID>("half")
  const [cardIndex, setCardIndex] = useState(0)
  const [seq, setSeq] = useState(0)
  const [lastRating, setLastRating] = useState<RatingID | null>(null)
  const [history, setHistory] = useState<RatingID[]>(SEED_HISTORY)
  const [autoplay, setAutoplay] = useState(false)
  const [contactZoomID, setContactZoomID] = useState<ContactZoomID>("fit")
  const stageBox = useElementSize<HTMLDivElement>()
  const contactColumn = useElementSize<HTMLDivElement>()

  const card = CARDS[cardIndex % CARDS.length] as MockCard
  const stageConfig = STAGES.find((entry) => entry.id === stage) ?? STAGES[0]
  const speed = SPEEDS.find((entry) => entry.id === speedID)?.factor ?? 1
  const reviewed = Math.min(DECK_TOTAL, history.length)

  // Measured from the live stage so the tiles are miniatures of the real thing,
  // not of a box invented for the grid.
  const previewWidth = stageBox.size.width || stageConfig.width || FALLBACK_STAGE_W_PX
  const previewHeight = stageBox.size.height || stageConfig.height || DEFAULT_STAGE_H_PX

  // Tiles are sized off the room the row actually has, so a wide bench gets wide
  // tiles instead of 36% postage stamps.
  const contactZoom = CONTACT_ZOOMS.find((entry) => entry.id === contactZoomID)?.fraction ?? 1
  const contactRoom = Math.max(
    CONTACT_MIN_W_PX,
    (contactColumn.size.width || FALLBACK_STAGE_W_PX) - CONTACT_GUTTER_PX - CONTACT_GAP_PX,
  )
  const contactWidth = Math.min(contactRoom, previewWidth) * contactZoom
  const contactScale = contactWidth / previewWidth

  const toggleReveal = useCallback(() => {
    setPhase((current) => (current === "front" ? "revealed" : "front"))
  }, [])

  /** One advance = one throw + one enter. `rating` aims the exit. */
  const advance = useCallback((rating: RatingID | null) => {
    setLastRating(rating)
    setSeq((current) => current + 1)
    setCardIndex((current) => current + 1)
    if (rating) setHistory((current) => [...current, rating])
    setPhase("front")
  }, [])

  const reset = useCallback(() => {
    setAutoplay(false)
    setCardIndex(0)
    setSeq(0)
    setLastRating(null)
    setHistory(SEED_HISTORY)
    setPhase("front")
  }, [])

  useEffect(() => {
    if (!autoplay) return
    if (!isCardPhase(phase)) return
    const wait = (phase === "front" ? 900 : 1300) / speed
    const timer = window.setTimeout(() => {
      if (phase === "front") {
        setPhase("revealed")
        return
      }
      const rating = AUTOPLAY_RATINGS[seq % AUTOPLAY_RATINGS.length] ?? "good"
      advance(rating)
    }, wait)
    return () => window.clearTimeout(timer)
  }, [autoplay, phase, speed, seq, advance])

  const shared = {
    card,
    reviewed,
    seq,
    lastRating,
    speed,
    onToggleReveal: toggleReveal,
    onRate: advance,
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-base">
      <div className="shrink-0 space-y-2.5 border-b border-border-base px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-text-strong">
              Flashcard review · the index card
            </h2>
            <p className="max-w-[100ch] text-xs leading-snug text-text-weak">
              One material all the way through: tight radius, hairline rules, paper, labelled
              eyebrow over left-aligned document type. The rating ruler and the panel actions are
              cut from the card, not dropped on top of it.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" onClick={reset}>
              <RotateCcwIcon data-icon="inline-start" aria-hidden />
              Reset
            </Button>
            <Badge variant="outline">Easel</Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <ToggleGroup
            type="single"
            value={stage}
            variant="outline"
            size="sm"
            aria-label="Stage size"
            onValueChange={(value) => {
              if (value) setStage(value as StageID)
            }}
          >
            {STAGES.map((entry) => (
              <ToggleGroupItem key={entry.id} value={entry.id}>
                {entry.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <ToggleGroup
            type="single"
            value={card.id}
            variant="outline"
            size="sm"
            aria-label="Card fixture"
            onValueChange={(value) => {
              const index = CARDS.findIndex((entry) => entry.id === value)
              if (index < 0) return
              // Swapping fixtures plays the hand-off too — a free way to see it.
              setLastRating(null)
              setSeq((current) => current + 1)
              setCardIndex(index)
              setPhase("front")
            }}
          >
            {CARDS.map((entry) => (
              <ToggleGroupItem key={entry.id} value={entry.id}>
                {entry.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PHASES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              title={entry.note}
              onClick={() => setPhase(entry.id)}
              className={cn(
                "shrink-0 rounded-md px-2 py-1 text-[11px] transition-colors",
                phase === entry.id
                  ? "bg-surface-interactive-weak font-bold text-text-interactive-base"
                  : "font-medium text-text-weak hover:bg-surface-weak hover:text-text-base",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="flex flex-col items-center gap-3 border-b border-border-base bg-surface-inset-base px-4 py-6">
          <div className="flex w-full max-w-[70rem] items-baseline justify-between">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-text-strong">
              Live
            </h3>
            <p className="font-mono text-[10px] text-text-weaker">
              stage {stageConfig.width ? `${stageConfig.width}px` : "fill"} ×{" "}
              {stageConfig.height ? `${stageConfig.height}px` : "fill"} · header {HEADER_H_PX} ·
              ruler {ACTIONS_H_PX} under the card · deck {STACK_TOTAL_PX} reserved · fixed in every
              phase
            </p>
          </div>

          <div
            ref={stageBox.ref}
            className="overflow-hidden rounded-lg border border-border-base shadow-sm"
            style={{
              width: stageConfig.width ?? "100%",
              maxWidth: stageConfig.width ?? undefined,
              height: stageConfig.height ?? DEFAULT_STAGE_H_PX,
            }}
          >
            <ReviewStage phase={phase} {...shared} />
          </div>

          {/* ── Transition bench ─────────────────────────────────────────── */}
          <div className="flex w-full max-w-[70rem] flex-col gap-2 rounded-lg border border-border-base bg-surface-base p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-weaker">
                  Throw
                </span>
                {RATINGS.map((entry) => {
                  const tone = RATING_TONE[entry.id]
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => advance(entry.id)}
                      className="flex items-center gap-1.5 rounded-sm border border-border-base px-2 py-1 text-[11px] font-medium text-text-base transition-colors hover:bg-surface-raised-base"
                    >
                      <span className={cn("h-2.5 w-[3px]", tone.rule)} aria-hidden />
                      {entry.label}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => advance(null)}
                  className="rounded-sm border border-border-base px-2 py-1 text-[11px] font-medium text-text-weak transition-colors hover:bg-surface-raised-base"
                >
                  Skip
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={autoplay ? "default" : "outline"}
                  onClick={() => setAutoplay((current) => !current)}
                >
                  {autoplay ? (
                    <PauseIcon data-icon="inline-start" aria-hidden />
                  ) : (
                    <PlayIcon data-icon="inline-start" aria-hidden />
                  )}
                  {autoplay ? "Stop loop" : "Loop it"}
                </Button>
                <ToggleGroup
                  type="single"
                  value={speedID}
                  variant="outline"
                  size="sm"
                  aria-label="Motion speed"
                  onValueChange={(value) => {
                    if (value) setSpeedID(value as SpeedID)
                  }}
                >
                  {SPEEDS.map((entry) => (
                    <ToggleGroupItem key={entry.id} value={entry.id}>
                      {entry.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-text-weak">
              Hinge to reveal · hover a rating to lean the card that way · the rating throws it
              (Again ← … → Easy, Hard and Good fall) · the next card lifts off the deck underneath.
              The aim clears the moment a card is thrown, so the incoming card always arrives
              square.
            </p>
          </div>
        </section>

        <section className="space-y-4 border-b border-border-base px-4 py-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border-base pb-1.5">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-text-strong">
              Every phase · one state per row
            </h3>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] text-text-weaker">
                {Math.round(previewWidth)}×{Math.round(previewHeight)} @{" "}
                {Math.round(contactScale * 100)}%
              </span>
              <ToggleGroup
                type="single"
                value={contactZoomID}
                variant="outline"
                size="sm"
                aria-label="Preview zoom"
                onValueChange={(value) => {
                  if (value) setContactZoomID(value as ContactZoomID)
                }}
              >
                {CONTACT_ZOOMS.map((entry) => (
                  <ToggleGroupItem key={entry.id} value={entry.id}>
                    {entry.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-text-weaker">
            Each row is the live stage rendered at its real{" "}
            <span className="text-text-weak">
              {Math.round(previewWidth)}×{Math.round(previewHeight)}
            </span>{" "}
            and scaled down — same aspect ratio, same measure, same line breaks. Note that only
            Front, Revealed, Leech and Loading carry a deck; the three empty-queue states do not,
            and the card still sits in exactly the same place.
          </p>

          <div ref={contactColumn.ref} className="flex flex-col gap-6">
            {PHASES.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-5"
              >
                <div className="w-40 shrink-0 sm:pt-1">
                  <p className="font-mono text-[11px] font-semibold text-text-strong">
                    {entry.label}
                  </p>
                  <p className="text-[10px] leading-snug text-text-weaker">{entry.note}</p>
                </div>
                <div
                  className="overflow-hidden rounded-md border border-border-base"
                  style={{ width: contactWidth, height: previewHeight * contactScale }}
                >
                  <div
                    style={{
                      width: previewWidth,
                      height: previewHeight,
                      transform: `scale(${contactScale})`,
                      transformOrigin: "top left",
                    }}
                  >
                    <ReviewStage phase={entry.id} {...shared} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 px-4 py-6">
          <div className="flex items-baseline justify-between border-b border-border-base pb-1.5">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-text-strong">
              Cloze · the blank
            </h3>
            <span className="text-[11px] text-text-weak">
              A rule you could write on · hidden left, filled right.
            </span>
          </div>
          <div className="grid gap-4 rounded-lg border border-border-base bg-surface-base p-4 lg:grid-cols-2">
            <p className="text-[14px] leading-loose text-text-stronger">
              <ClozeText text={CARDS[2]?.prompt ?? ""} ordinal={1} revealed={false} />
            </p>
            <p className="text-[14px] leading-loose text-text-stronger lg:border-l lg:border-border-weaker-base lg:pl-4">
              <ClozeText text={CARDS[2]?.prompt ?? ""} ordinal={1} revealed />
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
