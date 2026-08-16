import { useCallback, useState, type ReactNode } from "react"
import { motion } from "motion/react"
import { Badge, Button, ToggleGroup, ToggleGroupItem, cn } from "@buddy/ui"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenIcon,
  BrainIcon,
  FolderIcon,
  Layers3Icon,
  ListChecksIcon,
  PlayIcon,
  PresentationIcon,
  RotateCcwIcon,
  SearchIcon,
  ShapesIcon,
  XIcon,
  type AppIcon,
} from "@/icons/app-icons"
import {
  FLASHCARD_PRACTICE_ROW_ACTION_W_PX,
  FlashcardPracticeDrawerColumnLabel,
  FlashcardPracticeDrawerRow,
  FlashcardPracticeDrawerRuledHead,
} from "@/components/flashcard/flashcard-practice-drawer"

/**
 * Easel · Flashcard deck · the surface around the reviewer
 *
 * Today a flashcard-deck bench target renders the reviewer directly, so a
 * drained queue is a dead end — "all cards are done" is the only screen a
 * finished deck can show. This prototype puts the deck itself on the Bench,
 * where every other object already opens.
 *
 * Two rules it obeys, both learned the hard way:
 *
 *   1. The drawer lists, the Bench opens. Clicking a deck row commits a bench
 *      target and closes the drawer, exactly like a file, a creation or a
 *      board. The deck does NOT become a second screen inside the drawer —
 *      that would give flashcards a level of hierarchy no other object has.
 *      Review is a *mode* of the same bench target, not another level.
 *
 *   2. Nothing here invents an endpoint. The whole deck API is three
 *      operations — readDeck, queuedCards, submitReview — plus objects.delete.
 *      Every affordance below is traceable to one of them; see API_LEDGER at
 *      the bottom, which also lists what was cut for having no backing.
 *
 * The interesting consequence of rule 2: the backend already computes four
 * distinct reasons a queue drains (`FlashcardQueueCompletion`: nextLearningAt,
 * nextQueueAt, newLimitReached, reviewLimitReached) and the UI renders one
 * sentence for all four. Telling them apart costs no new API at all.
 *
 * The same rule is why the done screen ends on the other decks still waiting
 * rather than on canned chat prompts: firing a prompt needs composer wiring,
 * while the drawer already knows every deck's queue.
 */

// ─── Material ──────────────────────────────────────────────────────────────

const PAPER = "bg-surface-raised-stronger-non-alpha"
const UNDER = "bg-surface-float-base"
const CARD_RADIUS = "rounded-sm"
const CARD_CHROME = cn(PAPER, "border border-border-strong-base shadow-md")
const STACK_CHROME = cn(UNDER, "border border-border-base")
const STAGE_BACKGROUND = "bg-background-strong"

const RATING_TONE = {
  again: { rule: "bg-surface-critical-base", text: "text-text-critical-base" },
  hard: { rule: "bg-surface-warning-base", text: "text-text-warning-base" },
  good: { rule: "bg-surface-success-base", text: "text-text-success-base" },
  easy: { rule: "bg-surface-interactive-base", text: "text-text-interactive-base" },
} satisfies Record<RatingID, { rule: string; text: string }>

const CARD_STATE_TONE = {
  new: { dot: "bg-surface-interactive-base", text: "text-text-interactive-base", label: "new" },
  learning: { dot: "bg-surface-warning-base", text: "text-text-warning-base", label: "learning" },
  review: { dot: "bg-surface-success-base", text: "text-text-success-base", label: "review" },
  relearning: {
    dot: "bg-surface-critical-base",
    text: "text-text-critical-base",
    label: "relearning",
  },
} satisfies Record<CardStateID, { dot: string; text: string; label: string }>

// ─── Geometry ──────────────────────────────────────────────────────────────

const HEADER_H_PX = 44
const RAIL_W_PX = 44
const RULER_H_PX = 46
const RULER_GAP_PX = 14
const STACK_COUNT = 3
const STACK_STEP_PX = 9
const STACK_TOTAL_PX = STACK_COUNT * STACK_STEP_PX
const HINGE_PERSPECTIVE_PX = 1500
const STAGE_CARD_MAX_W_PX = 460

const WORKSPACE_W_PX = 620
const CHAT_W_PX = 400
const FRAME_H_PX = 660
const CONTACT_H_PX = 660

const HINGE_TRANSITION = { type: "spring", stiffness: 260, damping: 30 } as const

// ─── Fixtures ──────────────────────────────────────────────────────────────

type RatingID = "again" | "hard" | "good" | "easy"
type CardStateID = "new" | "learning" | "review" | "relearning"
type FrameID = "workspace" | "beside-chat"

type DeckCard = {
  id: string
  front: string
  back: string
  state: CardStateID
  /** Rendered from `card.due` + `card.state`, never shown as a raw timestamp. */
  due: string
  lapses: number
}

const DECK_TITLE = "Western education"
const DECK_SOURCE = "The History of Western Education · ch. 4"
const DECK_CARD_COUNT = 24
const LEECH_THRESHOLD = 8

const DECK_CARDS: DeckCard[] = [
  {
    id: "sophists",
    front: "What did the Sophists sell, and why was that controversial in Athens?",
    back: "Paid instruction in rhetoric and civic persuasion — controversial because it made political skill purchasable rather than inherited.",
    state: "review",
    due: "today",
    lapses: 0,
  },
  {
    id: "trivium",
    front: "Name the three arts of the trivium.",
    back: "Grammar, logic, rhetoric.",
    state: "learning",
    due: "6m",
    lapses: 0,
  },
  {
    id: "quadrivium",
    front: "Name the four arts of the quadrivium.",
    back: "Arithmetic, geometry, music, astronomy.",
    state: "relearning",
    due: "10m",
    lapses: 9,
  },
  {
    id: "humanism",
    front: "What did Renaissance humanists put at the centre of the curriculum?",
    back: "The studia humanitatis — grammar, rhetoric, poetry, history and moral philosophy, read in the original sources.",
    state: "new",
    due: "",
    lapses: 0,
  },
  {
    id: "comenius",
    front: "What was Comenius's argument in Didactica Magna?",
    back: "That everyone should be taught everything, in the order the mind actually learns it — sense before word, whole before part.",
    state: "new",
    due: "",
    lapses: 0,
  },
  {
    id: "lancaster",
    front: "How did the monitorial system make mass schooling cheap?",
    back: "One master taught senior pupils, who then drilled the rest — teaching labour scaled without hiring teachers.",
    state: "review",
    due: "4d",
    lapses: 1,
  },
  {
    id: "kindergarten",
    front: "What did Fröbel mean by the 'gifts'?",
    back: "A graded set of physical objects — ball, sphere, cube, blocks — meant to let a child discover form and relation by handling them.",
    state: "review",
    due: "11d",
    lapses: 0,
  },
]

const REVIEW_QUEUE = [DECK_CARDS[0], DECK_CARDS[1], DECK_CARDS[5]].filter(
  (card): card is DeckCard => card !== undefined,
)

/**
 * The drawer's mixed feed. A question set sits in here too — the row has to
 * carry both, which is the reason the type glyph survives and the boxed icon
 * tile does not.
 */
const PRACTICE_ROWS: {
  icon: AppIcon
  title: string
  meta: string
  action: FixtureRowAction
}[] = [
  {
    icon: Layers3Icon,
    title: DECK_TITLE,
    meta: "24 cards",
    action: { kind: "action", label: "Study 12" },
  },
  {
    icon: Layers3Icon,
    title: "Learning theories",
    meta: "32 cards",
    action: { kind: "note", label: "tomorrow" },
  },
  {
    icon: Layers3Icon,
    title: "Assessment vocabulary",
    meta: "18 cards",
    action: { kind: "action", label: "Study 6" },
  },
  {
    icon: Layers3Icon,
    title: "Reformation and the printing press",
    meta: "12 cards",
    action: { kind: "note", label: "in 6m" },
  },
  {
    icon: ListChecksIcon,
    title: "Chapter 4 review",
    meta: "6 questions",
    action: { kind: "action", label: "Start" },
  },
]

// ─── Standings ─────────────────────────────────────────────────────────────

type StandingID = "due" | "fresh" | "learning-wait" | "clear" | "review-limit" | "new-limit"

type Standing = {
  id: StandingID
  eyebrow: string
  headline: string
  detail: string
  /**
   * What the reviewer prints when the queue drains for this reason. Same fact
   * as `detail`, addressed to someone who just finished — one source, so the
   * done screen and the deck can never disagree about why you stopped.
   */
  sessionLine: string
  /**
   * Only two verbs, because only two are backed: study runs the real
   * queuedCards → submitReview loop, practice reads readDeck and rates nothing.
   */
  action: { label: string; mode: "study" | "practice" }
  tone: "ready" | "calm" | "limit"
  /** Which piece of the existing payload decides this standing. */
  source: string
}

/**
 * Every number below traces to a field the API actually returns.
 *
 * An earlier pass quoted counts that read well and do not exist — "20 of 20
 * reviews done", "34 cards held back", "3 cards are still in learning", "9
 * cards come back tomorrow". `FlashcardQueueCompletion` carries two booleans
 * and two timestamps, and nothing else; the quantities behind those booleans
 * stay inside `buildFlashcardQueue` as locals. Deriving them on the client is
 * ruled out at queue.ts:142 — "callers must not reconstruct counts from raw
 * cards" — and would mean a second copy of the limit and rollover maths.
 *
 * So the limits state what the deck is *configured* to allow (config, which
 * readDeck does return) and let the boolean carry the fact that more is
 * waiting, which is exactly what the boolean means.
 */
const STANDINGS = {
  due: {
    id: "due",
    eyebrow: "Ready",
    headline: "12 due now",
    detail: "4 new · 3 learning · 5 review",
    sessionLine: "Still 12 due.",
    action: { label: "Study 12", mode: "study" },
    tone: "ready",
    source: "queuedCards.newCount · learningCount · reviewCount",
  },
  fresh: {
    id: "fresh",
    eyebrow: "New deck",
    headline: "24 cards, none studied yet",
    detail: "Buddy wrote these from chapter 4. At 5 new a day, that's 5 days to meet them all.",
    sessionLine: "Nothing studied yet.",
    action: { label: "Start studying", mode: "study" },
    tone: "ready",
    source: "readDeck.cards every reps === 0 · config.newPerDay · deck.source",
  },
  "learning-wait": {
    id: "learning-wait",
    eyebrow: "Scheduled",
    headline: "Next card in 6 minutes",
    detail: "These are learning cards on short steps. Leave the deck open — it refills itself.",
    sessionLine: "The next learning card is ready in 6 minutes.",
    action: { label: "Practice off schedule", mode: "practice" },
    tone: "calm",
    source: "completion.nextLearningAt",
  },
  clear: {
    id: "clear",
    eyebrow: "Clear",
    headline: "All caught up",
    detail: "Nothing is due. The next cards unlock at 4:00 tomorrow.",
    sessionLine: "That's everything scheduled for today. The next cards unlock at 4:00 tomorrow.",
    action: { label: "Practice off schedule", mode: "practice" },
    tone: "calm",
    source: "all three queue counts zero · completion.nextQueueAt",
  },
  "review-limit": {
    id: "review-limit",
    eyebrow: "Daily limit",
    headline: "Today's review limit is spent",
    detail: "This deck is set to 20 reviews a day. More are due — they'll come after the rollover.",
    sessionLine: "You've spent today's 20 reviews. More are due — they'll come after the rollover.",
    action: { label: "Practice off schedule", mode: "practice" },
    tone: "limit",
    source: "completion.reviewLimitReached · config.reviewsPerDay",
  },
  "new-limit": {
    id: "new-limit",
    eyebrow: "Daily limit",
    headline: "No new cards left today",
    detail:
      "This deck is set to 5 new cards a day. More are waiting — they'll come after the rollover.",
    sessionLine: "That's today's 5 new cards. More are waiting for the rollover.",
    action: { label: "Practice off schedule", mode: "practice" },
    tone: "limit",
    source: "completion.newLimitReached · config.newPerDay",
  },
} satisfies Record<StandingID, Standing>

const STANDING_RULE = {
  ready: "bg-border-interactive-base",
  calm: "bg-border-base",
  limit: "bg-surface-warning-base",
} satisfies Record<Standing["tone"], string>

const STANDING_EYEBROW = {
  ready: "text-text-interactive-base",
  calm: "text-text-weaker",
  limit: "text-text-warning-base",
} satisfies Record<Standing["tone"], string>

/**
 * What to do after this deck drains.
 *
 * This slot used to hold three canned chat prompts ("explain the two I keep
 * missing"). They were generic, and firing one needs composer wiring that
 * doesn't exist. The honest answer to "what now" is the other work already
 * waiting — and the Practice drawer already queries every deck's queue, so
 * this costs nothing new.
 */
const UP_NEXT: { title: string; due: string }[] = [
  { title: "Assessment vocabulary", due: "6 due" },
  { title: "Chapter 4 review", due: "6 questions" },
]

// ─── Workspace state ───────────────────────────────────────────────────────

type BenchMode =
  | { kind: "deck"; standing: StandingID; peek: string | null }
  | { kind: "review"; index: number; revealed: boolean }
  | { kind: "practice"; index: number; revealed: boolean }
  | { kind: "done" }

/**
 * Drawer and Bench share one slot, the way the right workspace already works:
 * opening an object commits the target and closes the drawer.
 */
type WorkspaceState = { drawerOpen: boolean; bench: BenchMode }

const RAIL_ITEMS: { id: string; label: string; icon: AppIcon }[] = [
  { id: "search", label: "Search", icon: SearchIcon },
  { id: "sources", label: "Sources", icon: BookOpenIcon },
  { id: "practice", label: "Practice", icon: BrainIcon },
  { id: "creations", label: "Creations", icon: ShapesIcon },
  { id: "boards", label: "Boards", icon: PresentationIcon },
  { id: "files", label: "Files", icon: FolderIcon },
]

// ─── The Practice drawer: a list, and nothing more ─────────────────────────

/**
 * Right-hand cell of a practice row. Either something to do, or when it comes
 * back — the slot is never empty, which is what keeps the column straight.
 */
type FixtureRowAction = { kind: "action"; label: string } | { kind: "note"; label: string }

function PracticeDrawer(props: {
  onOpenDeck: () => void
  onStudyDeck: () => void
  onClose: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background-base">
      <div
        className="flex shrink-0 items-center gap-2 border-b border-border-weaker-base px-4"
        style={{ height: HEADER_H_PX }}
      >
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-strong">
          Practice
        </p>
        <Badge variant="outline">18 due</Badge>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close Practice"
          className="cursor-pointer rounded-md p-1 text-text-weaker transition-colors hover:bg-surface-base hover:text-text-base"
        >
          <XIcon className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <section className="flex flex-col gap-2">
          <FlashcardPracticeDrawerRuledHead
            label="Practice"
            trailing={<FlashcardPracticeDrawerColumnLabel />}
          />
          <div className="flex flex-col">
            {PRACTICE_ROWS.map((row) => (
              <FlashcardPracticeDrawerRow
                key={row.title}
                icon={row.icon}
                title={row.title}
                metadata={row.meta}
                action={
                  row.action.kind === "action"
                    ? { ...row.action, onClick: props.onStudyDeck }
                    : row.action
                }
                onOpen={props.onOpenDeck}
              />
            ))}
          </div>
        </section>

        <p className="text-[11px] leading-relaxed text-text-weaker">
          Left region opens the object on the Bench. Right column either offers the verb or says
          when it comes back — never empty, so the column stays straight. The drawer never navigates
          into itself.
        </p>
      </div>
    </div>
  )
}

// ─── The deck, on the Bench ────────────────────────────────────────────────

/** Chrome, deliberately thin. The document names itself in its own body. */
function BenchHeader(props: { title: string; onClose: () => void }) {
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-border-weaker-base px-4"
      style={{ height: HEADER_H_PX }}
    >
      <Layers3Icon className="size-4 shrink-0 text-icon-base" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-[12px] text-text-weak">{props.title}</p>
      <button
        type="button"
        onClick={props.onClose}
        aria-label="Close Bench"
        className="cursor-pointer rounded-md p-1 text-text-weaker transition-colors hover:bg-surface-base hover:text-text-base"
      >
        <XIcon className="size-4" aria-hidden />
      </button>
    </div>
  )
}

/**
 * The standing — the one thing on this page that has to dominate.
 *
 * It gets a container back, because a container does two jobs and only one of
 * them was decoration: it binds four lines into a single object. What it does
 * NOT get back is `CARD_CHROME`. Wearing the flashcard's own paper, border and
 * shadow is what made it read as a flashcard that wandered onto the deck page.
 * A plain inset surface in the page's material groups just as well and
 * impersonates nothing.
 *
 * Inside, the gaps are deliberately tight (6–20px) against the 28–40px that
 * separates this block from its neighbours. That ratio is the grouping.
 */
function StandingBlock(props: { standing: Standing; onAction: () => void }) {
  const { standing } = props

  return (
    <section className="flex flex-col rounded-md bg-surface-base px-5 py-5">
      {/* No "12 reviewed today" here any more: dailyReviewCounts is optional
          on the deck and only valid when its schedulingDay matches today,
          which needs schedulingDayKey(now, rolloverHour) — server-side only. */}
      <span
        className={cn(
          "text-[10px] font-medium uppercase tracking-[0.14em]",
          STANDING_EYEBROW[standing.tone],
        )}
      >
        {standing.eyebrow}
      </span>
      <div className={cn("mt-2 h-px w-full", STANDING_RULE[standing.tone])} />

      <p className="mt-4 text-[25px] font-semibold leading-[1.15] tracking-tight text-text-stronger">
        {standing.headline}
      </p>
      <p className="mt-1.5 max-w-[44ch] text-[12.5px] leading-relaxed text-text-weak">
        {standing.detail}
      </p>

      {/* A button only where there is a verb. When the queue is drained the
          honest answer is "nothing to do", so practice is a quiet link rather
          than a CTA arguing with the headline above it — and the link names
          the mode it opens, which is also the guarantee, so it needs no
          caption propped beside it. */}
      {standing.action.mode === "study" ? (
        <div className="mt-5">
          <Button size="sm" onClick={props.onAction}>
            <PlayIcon data-icon="inline-start" aria-hidden />
            {standing.action.label}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={props.onAction}
          className="mt-4 w-fit cursor-pointer text-[12px] text-text-weak underline-offset-4 transition-colors hover:text-text-base hover:underline"
        >
          {standing.action.label}
        </button>
      )}
    </section>
  )
}

/**
 * One card in the list.
 *
 * The metadata moved to a right column — the same move that fixed the practice
 * row. Underneath the question it read as a continuation of the sentence, and
 * it doubled the list's line count: seven cards meant fourteen lines of
 * near-identical type separated by seven more rules. Now the left column is a
 * clean run of questions to scan and the timing sits out of that path.
 *
 * State is the dot's job alone. The word said the same thing the colour did,
 * and the due value already implies it — `6m` is a learning card, `11d` is a
 * review. `new` shows as a word because those cards have no time to show, and
 * `leech` survives in colour because it is the one thing here worth acting on.
 *
 * No separators. One line per row at py-4 leaves a 32px gap between rows
 * against ~20px inside a wrapped question, which is enough to group without
 * drawing anything.
 */
function DeckCardRow(props: { card: DeckCard; open: boolean; onToggle: () => void }) {
  const tone = CARD_STATE_TONE[props.card.state]
  const leech = props.card.lapses >= LEECH_THRESHOLD

  return (
    <div
      className={cn(
        "-mx-3 rounded-md px-3 transition-colors",
        props.open ? "bg-surface-base" : "hover:bg-surface-base/50",
      )}
    >
      <button
        type="button"
        onClick={props.onToggle}
        className="flex w-full cursor-pointer items-start gap-3 py-4 text-left"
      >
        <span
          className={cn("mt-[7px] size-2 shrink-0 rounded-full", tone.dot)}
          title={tone.label}
          aria-label={tone.label}
        />
        <span
          className={cn(
            "min-w-0 flex-1 text-[13.5px] leading-relaxed text-text-base",
            !props.open && "line-clamp-2",
          )}
        >
          {props.card.front}
        </span>
        <span className="mt-[3px] flex shrink-0 items-baseline gap-2 text-[11px] tabular-nums text-text-weaker">
          {leech ? <span className="text-text-critical-base">leech</span> : null}
          <span>{props.card.due || tone.label}</span>
        </span>
      </button>

      {props.open ? (
        <div className="pb-5 pl-[20px]">
          <p className="max-w-[56ch] text-[13.5px] leading-relaxed text-text-interactive-base">
            {props.card.back}
          </p>
          {/* The guarantee, in a sentence rather than a shouted label. */}
          <p className="mt-5 text-[11px] leading-relaxed text-text-weaker">
            Reading this changes nothing. Only a rating moves a due date.
          </p>
        </div>
      ) : null}
    </div>
  )
}

const CARD_FILTERS = ["All", "Due", "New", "Leeches"]

/**
 * Filters as type, not as chrome — and on the section's own head line rather
 * than a band of their own. A bordered four-segment toggle group used to carry
 * more visual weight than anything else on a page whose subject is a list of
 * sentences.
 */
function CardFilters() {
  return (
    <div className="flex items-center gap-3.5">
      {CARD_FILTERS.map((filter, index) => (
        <button
          key={filter}
          type="button"
          className={cn(
            "cursor-pointer text-[11px] transition-colors",
            index === 0 ? "font-medium text-text-base" : "text-text-weaker hover:text-text-base",
          )}
        >
          {filter}
        </button>
      ))}
      <button
        type="button"
        aria-label="Search cards"
        className="cursor-pointer text-text-weaker transition-colors hover:text-text-base"
      >
        <SearchIcon className="size-3.5" aria-hidden />
      </button>
    </div>
  )
}

/**
 * The deck.
 *
 * Three groups, and the hierarchy between them is the whole design:
 *
 *   identity   quiet, tight, 4px internal — a caption, not a headline. The
 *              bench header already names the object; saying it again at 22px
 *              only competed with the number that actually matters.
 *   standing   the hero. Bound in a surface, 25px headline, the only button.
 *   cards      long and quiet. One head line carrying label, count and
 *              filters; hairlines light enough to read as texture.
 *
 * Internal gaps run 4–20px, the gaps between groups 28–40px. Without that
 * ratio every line floats at the same distance from every other line and the
 * page reads as one undifferentiated column of text.
 */
function DeckSurface(props: {
  standing: Standing
  peek: string | null
  onAction: () => void
  onPeek: (cardID: string | null) => void
  onClose: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background-base">
      <BenchHeader title={DECK_TITLE} onClose={props.onClose} />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6">
        <header className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold leading-snug text-text-strong">{DECK_TITLE}</h2>
          <p className="flex items-center gap-1.5 text-[11px] text-text-weaker">
            <BookOpenIcon className="size-3 shrink-0" aria-hidden />
            <span className="truncate">
              {DECK_SOURCE} · {DECK_CARD_COUNT} cards
            </span>
          </p>
        </header>

        <div className="mt-7">
          <StandingBlock standing={props.standing} onAction={props.onAction} />
        </div>

        <section className="mt-10 flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-border-base pb-2.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-weaker">
              Cards
            </span>
            <CardFilters />
          </div>
          <div className="flex flex-col">
            {DECK_CARDS.map((card) => (
              <DeckCardRow
                key={card.id}
                card={card}
                open={props.peek === card.id}
                onToggle={() => props.onPeek(props.peek === card.id ? null : card.id)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

// ─── Review and practice: the same stage, different contract ──────────────

function StageCardFace(props: { eyebrow: string; body: string; answer?: boolean }) {
  return (
    <div className={cn("flex h-full flex-col overflow-hidden", CARD_RADIUS, CARD_CHROME)}>
      <div className="shrink-0 px-6 pb-2 pt-5">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-weaker">
          {props.eyebrow}
        </span>
        <div className="mt-2 h-px w-full bg-border-base" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <p
          className={cn(
            "text-pretty text-[16px] leading-relaxed",
            props.answer ? "text-text-interactive-base" : "text-text-stronger",
          )}
        >
          {props.body}
        </p>
      </div>
    </div>
  )
}

function StageDeck(props: { remaining: number }) {
  return (
    <>
      {Array.from({ length: STACK_COUNT }, (_, index) => {
        const depth = STACK_COUNT - index
        if (depth >= props.remaining) return null
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
      })}
    </>
  )
}

function RatingRuler(props: { onRate: (rating: RatingID) => void }) {
  const [aimed, setAimed] = useState<RatingID | null>(null)
  const ratings: RatingID[] = ["again", "hard", "good", "easy"]

  return (
    <div
      className={cn(
        "flex h-full w-full overflow-hidden border border-border-strong-base",
        CARD_RADIUS,
      )}
    >
      {ratings.map((rating, index) => {
        const tone = RATING_TONE[rating]
        return (
          <button
            key={rating}
            type="button"
            onClick={() => {
              setAimed(null)
              props.onRate(rating)
            }}
            onMouseEnter={() => setAimed(rating)}
            onMouseLeave={() => setAimed(null)}
            className={cn(
              "relative flex flex-1 cursor-pointer items-center justify-center transition-colors",
              PAPER,
              "hover:bg-surface-float-base",
              index > 0 && "border-l border-border-base",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-0 top-0 h-[3px] transition-opacity",
                tone.rule,
                aimed === rating ? "opacity-100" : "opacity-70",
              )}
            />
            <span
              className={cn(
                "text-[12px] font-medium capitalize transition-colors",
                aimed === rating ? tone.text : "text-text-strong",
              )}
            >
              {rating}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function HingeCard(props: { card: DeckCard; revealed: boolean; onToggle: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={props.onToggle}
      className={cn("absolute inset-0 cursor-pointer text-left", CARD_RADIUS)}
      style={{ transformStyle: "preserve-3d" }}
      initial={false}
      animate={{ rotateY: props.revealed ? 180 : 0 }}
      transition={HINGE_TRANSITION}
    >
      <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
        <StageCardFace eyebrow="Question" body={props.card.front} />
      </div>
      <div
        className="absolute inset-0"
        style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
      >
        <StageCardFace eyebrow="Answer" body={props.card.back} answer />
      </div>
    </motion.button>
  )
}

function StageShell(props: {
  eyebrow: string
  onExit: () => void
  progress: ReactNode
  banner?: ReactNode
  remaining: number
  card: ReactNode
  footer: ReactNode
}) {
  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col", STAGE_BACKGROUND)}>
      <header className="flex shrink-0 items-center gap-3 px-4" style={{ height: HEADER_H_PX }}>
        {/* Exit returns to the deck — the same bench target, other mode. */}
        <button
          type="button"
          onClick={props.onExit}
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1 py-1 text-[10px] uppercase tracking-[0.14em] text-text-weaker transition-colors hover:text-text-base"
        >
          <ArrowLeftIcon className="size-3" aria-hidden />
          Deck
        </button>
        <span className="h-3 w-px shrink-0 bg-border-base" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[10px] uppercase tracking-[0.14em] text-text-weaker">
          {props.eyebrow}
        </span>
        {props.progress}
      </header>

      {props.banner ? <div className="shrink-0 px-4 pb-3">{props.banner}</div> : null}

      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-5">
        <div className="flex h-full w-full flex-col" style={{ maxWidth: STAGE_CARD_MAX_W_PX }}>
          <div
            className="relative min-h-0 w-full flex-1"
            style={{ perspective: HINGE_PERSPECTIVE_PX }}
          >
            <StageDeck remaining={props.remaining} />
            <div className="absolute inset-x-0 top-0" style={{ bottom: STACK_TOTAL_PX }}>
              {props.card}
            </div>
          </div>
          <div
            className="flex w-full shrink-0 items-center justify-center"
            style={{ height: RULER_H_PX, marginTop: RULER_GAP_PX }}
          >
            {props.footer}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReviewSurface(props: {
  index: number
  revealed: boolean
  onToggle: () => void
  onRate: () => void
  onExit: () => void
}) {
  const card = REVIEW_QUEUE[props.index]
  if (!card) return null
  const total = REVIEW_QUEUE.length

  return (
    <StageShell
      eyebrow={CARD_STATE_TONE[card.state].label}
      onExit={props.onExit}
      remaining={total - props.index}
      progress={
        <>
          <div className="h-1 w-20 shrink-0 overflow-hidden bg-surface-inset-strong">
            <div
              className="h-full bg-surface-interactive-base transition-[width] duration-300"
              style={{ width: `${(props.index / total) * 100}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-weaker">
            {props.index}/{total}
          </span>
        </>
      }
      card={<HingeCard card={card} revealed={props.revealed} onToggle={props.onToggle} />}
      footer={
        props.revealed ? (
          <RatingRuler onRate={props.onRate} />
        ) : (
          <p className="text-[11px] text-text-weaker">Tap the card to reveal</p>
        )
      }
    />
  )
}

function PracticeSurface(props: {
  index: number
  revealed: boolean
  onToggle: () => void
  onNext: () => void
  onExit: () => void
}) {
  const card = DECK_CARDS[props.index % DECK_CARDS.length]
  if (!card) return null

  return (
    <StageShell
      eyebrow="Practice"
      onExit={props.onExit}
      remaining={0}
      progress={
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-weaker">
          {(props.index % DECK_CARDS.length) + 1}/{DECK_CARDS.length}
        </span>
      }
      banner={
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-l-2 border-border-strong-base bg-surface-base px-3 py-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-text-weaker">
            Off schedule
          </span>
          <span className="text-[11px] text-text-weak">
            Nothing here is rated. Your due dates don't move.
          </span>
        </div>
      }
      card={<HingeCard card={card} revealed={props.revealed} onToggle={props.onToggle} />}
      footer={
        /* No ruler at all. A rating is a write to the scheduler, so the honest
           way to promise practice is free is to have nothing here that writes. */
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={props.onToggle}>
            {props.revealed ? "Hide answer" : "Show answer"}
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onNext}>
            Next card
            <ArrowRightIcon data-icon="inline-end" aria-hidden />
          </Button>
        </div>
      }
    />
  )
}

// ─── Done: a receipt, the reason, and a way into the conversation ─────────

const SESSION_BREAKDOWN: { rating: RatingID; count: number }[] = [
  { rating: "again", count: 1 },
  { rating: "hard", count: 2 },
  { rating: "good", count: 8 },
  { rating: "easy", count: 1 },
]

function DoneSurface(props: {
  standing: Standing
  onBackToDeck: () => void
  onPractice: () => void
}) {
  const total = SESSION_BREAKDOWN.reduce((sum, entry) => sum + entry.count, 0)

  return (
    <div className={cn("flex h-full min-h-0 flex-col", STAGE_BACKGROUND)}>
      <header className="flex shrink-0 items-center gap-3 px-4" style={{ height: HEADER_H_PX }}>
        <span className="min-w-0 flex-1 truncate text-[10px] uppercase tracking-[0.14em] text-text-weaker">
          {DECK_TITLE}
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-weaker">
          {total}/{total}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-5">
        <div
          className={cn(
            "flex max-h-full w-full flex-col overflow-y-auto p-7",
            CARD_RADIUS,
            CARD_CHROME,
          )}
          style={{ maxWidth: STAGE_CARD_MAX_W_PX }}
        >
          {/* What you did — the hero, and the bar and counts belong to it, so
              they sit 10–12px under it while the next block sits 28px away. */}
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-weaker">
            Session
          </p>
          <p className="mt-3.5 text-[24px] font-semibold leading-tight tracking-tight text-text-stronger">
            12 reviewed in 2m 40s
          </p>
          {/* The strip carries the colour. The counts underneath used to repeat
              it word for word in four accents — they read plainly now. */}
          <div className="mt-3 flex h-1 w-full overflow-hidden">
            {SESSION_BREAKDOWN.map((entry) => (
              <span
                key={entry.rating}
                className={RATING_TONE[entry.rating].rule}
                style={{ width: `${(entry.count / total) * 100}%` }}
                aria-hidden
              />
            ))}
          </div>
          <p className="mt-2.5 text-[11px] text-text-weaker">
            {SESSION_BREAKDOWN.map((entry) => `${entry.count} ${entry.rating}`).join(" · ")}
          </p>

          {/* Why it stopped — the same sentence the deck will greet you with. */}
          <p className="mt-7 max-w-[42ch] text-[13.5px] leading-relaxed text-text-weak">
            {props.standing.sessionLine}
          </p>

          {/* One verb, one button. Practice is the quiet alternative, not a
              second CTA — same rule as the deck's standing block. */}
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Button size="sm" onClick={props.onBackToDeck}>
              Back to deck
            </Button>
            <button
              type="button"
              onClick={props.onPractice}
              className="cursor-pointer text-[12px] text-text-weak underline-offset-4 transition-colors hover:text-text-base hover:underline"
            >
              Practice off schedule
            </button>
          </div>

          {/* What's next — the real work still waiting, not three canned
              prompts. Two rows, no separators; the right column carries the
              count exactly as the practice drawer does. */}
          <div className="mt-9 flex flex-col">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-weaker">
              Up next
            </p>
            <div className="mt-1 flex flex-col">
              {UP_NEXT.map((entry) => (
                <button
                  key={entry.title}
                  type="button"
                  className="group -mx-2 flex cursor-pointer items-baseline gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-surface-base"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text-base">
                    {entry.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-text-weaker transition-colors group-hover:text-text-interactive-base">
                    {entry.due}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── The right workspace: one slot, drawer or Bench, plus the rail ────────

function BenchSlot(props: { bench: BenchMode; onBench: (next: BenchMode) => void }) {
  const { bench, onBench } = props

  switch (bench.kind) {
    case "deck": {
      const standing = STANDINGS[bench.standing]
      return (
        <DeckSurface
          standing={standing}
          peek={bench.peek}
          onAction={() =>
            onBench(
              standing.action.mode === "study"
                ? { kind: "review", index: 0, revealed: false }
                : { kind: "practice", index: 0, revealed: false },
            )
          }
          onPeek={(cardID) => onBench({ ...bench, peek: cardID })}
          onClose={() => onBench({ kind: "deck", standing: bench.standing, peek: null })}
        />
      )
    }
    case "review":
      return (
        <ReviewSurface
          index={bench.index}
          revealed={bench.revealed}
          onToggle={() => onBench({ ...bench, revealed: !bench.revealed })}
          onRate={() =>
            onBench(
              bench.index + 1 >= REVIEW_QUEUE.length
                ? { kind: "done" }
                : { kind: "review", index: bench.index + 1, revealed: false },
            )
          }
          onExit={() => onBench({ kind: "deck", standing: "due", peek: null })}
        />
      )
    case "practice":
      return (
        <PracticeSurface
          index={bench.index}
          revealed={bench.revealed}
          onToggle={() => onBench({ ...bench, revealed: !bench.revealed })}
          onNext={() => onBench({ kind: "practice", index: bench.index + 1, revealed: false })}
          onExit={() => onBench({ kind: "deck", standing: "clear", peek: null })}
        />
      )
    case "done":
      return (
        <DoneSurface
          standing={STANDINGS["learning-wait"]}
          onBackToDeck={() => onBench({ kind: "deck", standing: "learning-wait", peek: null })}
          onPractice={() => onBench({ kind: "practice", index: 0, revealed: false })}
        />
      )
  }
}

function RightWorkspace(props: { state: WorkspaceState; onState: (next: WorkspaceState) => void }) {
  const { state, onState } = props

  return (
    <div className="flex h-full min-h-0 w-full">
      <main className="min-w-0 flex-1">
        {state.drawerOpen ? (
          <PracticeDrawer
            onOpenDeck={() =>
              onState({ drawerOpen: false, bench: { kind: "deck", standing: "due", peek: null } })
            }
            onStudyDeck={() =>
              onState({ drawerOpen: false, bench: { kind: "review", index: 0, revealed: false } })
            }
            onClose={() => onState({ ...state, drawerOpen: false })}
          />
        ) : (
          <BenchSlot bench={state.bench} onBench={(bench) => onState({ ...state, bench })} />
        )}
      </main>

      <nav
        aria-label="Right workspace sections"
        className="flex shrink-0 flex-col items-center gap-1 border-l border-border-weaker-base bg-background-base px-1 py-2"
        style={{ width: RAIL_W_PX }}
      >
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon
          const active = item.id === "practice" && state.drawerOpen
          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              title={item.label}
              onClick={() =>
                onState({ ...state, drawerOpen: item.id === "practice" ? !state.drawerOpen : true })
              }
              className={cn(
                "flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors",
                active
                  ? "bg-surface-raised-base text-text-strong"
                  : "text-icon-base hover:bg-surface-base hover:text-text-base",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          )
        })}
      </nav>
    </div>
  )
}

/** A stub, only so the Bench is visibly *beside* the conversation. */
function ChatPaneStub() {
  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border-weaker-base bg-background-base">
      <div
        className="flex shrink-0 items-center border-b border-border-weaker-base px-4"
        style={{ height: HEADER_H_PX }}
      >
        <p className="truncate text-[13px] font-medium text-text-strong">Western education</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 opacity-60">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-4/5 rounded bg-surface-base" />
          <div className="h-3 w-full rounded bg-surface-base" />
          <div className="h-3 w-3/5 rounded bg-surface-base" />
        </div>
        <div className="ml-auto flex w-3/4 flex-col gap-2 rounded-md bg-surface-raised-base p-3">
          <div className="h-3 w-full rounded bg-surface-base" />
          <div className="h-3 w-2/3 rounded bg-surface-base" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="h-3 w-full rounded bg-surface-base" />
          <div className="h-3 w-11/12 rounded bg-surface-base" />
          <div className="h-3 w-1/2 rounded bg-surface-base" />
        </div>
        <div className="mt-auto h-10 shrink-0 rounded-md border border-border-base bg-surface-base" />
      </div>
    </div>
  )
}

// ─── Phases ────────────────────────────────────────────────────────────────

type PhaseEntry = { id: string; label: string; note: string; state: WorkspaceState }

const PHASES: PhaseEntry[] = [
  {
    id: "drawer",
    label: "Practice drawer",
    note: "A list. Row opens on the Bench, count studies. Never navigates into itself.",
    state: { drawerOpen: true, bench: { kind: "deck", standing: "due", peek: null } },
  },
  {
    id: "deck-due",
    label: "Bench · deck, due",
    note: "readDeck + queuedCards. The surface that does not exist today.",
    state: { drawerOpen: false, bench: { kind: "deck", standing: "due", peek: null } },
  },
  {
    id: "deck-fresh",
    label: "Bench · never studied",
    note: "readDeck.cards, all still new. Tells you the finish date.",
    state: { drawerOpen: false, bench: { kind: "deck", standing: "fresh", peek: null } },
  },
  {
    id: "deck-peek",
    label: "Bench · peeking",
    note: "readDeck.notes.fields. The list is the browser; reading costs nothing.",
    state: { drawerOpen: false, bench: { kind: "deck", standing: "due", peek: "quadrivium" } },
  },
  {
    id: "deck-learning",
    label: "Bench · learning wait",
    note: "completion.nextLearningAt — the queue refills itself in 6 minutes",
    state: { drawerOpen: false, bench: { kind: "deck", standing: "learning-wait", peek: null } },
  },
  {
    id: "deck-clear",
    label: "Bench · all caught up",
    note: "completion.nextQueueAt — the only cause today's screen is honest about",
    state: { drawerOpen: false, bench: { kind: "deck", standing: "clear", peek: null } },
  },
  {
    id: "deck-review-limit",
    label: "Bench · review limit",
    note: "completion.reviewLimitReached — cards are due, the limit is hiding them",
    state: { drawerOpen: false, bench: { kind: "deck", standing: "review-limit", peek: null } },
  },
  {
    id: "deck-new-limit",
    label: "Bench · new-card limit",
    note: "completion.newLimitReached — different cause, different sentence",
    state: { drawerOpen: false, bench: { kind: "deck", standing: "new-limit", peek: null } },
  },
  {
    id: "review",
    label: "Bench · review, question",
    note: "Unchanged stage, now a mode of the deck rather than the whole target",
    state: { drawerOpen: false, bench: { kind: "review", index: 0, revealed: false } },
  },
  {
    id: "review-revealed",
    label: "Bench · review, answer",
    note: "submitReview is the only call in the prototype that writes",
    state: { drawerOpen: false, bench: { kind: "review", index: 1, revealed: true } },
  },
  {
    id: "done",
    label: "Bench · done",
    note: "Client-side counters + completion, then three chat messages",
    state: { drawerOpen: false, bench: { kind: "done" } },
  },
  {
    id: "practice",
    label: "Bench · practice",
    note: "readDeck only, never submitReview. The missing ruler is the promise.",
    state: { drawerOpen: false, bench: { kind: "practice", index: 3, revealed: true } },
  },
]

// ─── API ledger ────────────────────────────────────────────────────────────

type LedgerRow = {
  affordance: string
  backing: string
  /**
   * exists  — a field the API returns today
   * derived — computed on the client from data already fetched, no scheduler
   *           logic duplicated
   * extend  — the value exists as a local inside buildFlashcardQueue and is
   *           simply not returned; a contained backend change
   * missing — no route, no path
   */
  status: "exists" | "derived" | "extend" | "missing"
}

const API_LEDGER: LedgerRow[] = [
  { affordance: "Deck title, source, card count", backing: "readDeck", status: "exists" },
  { affordance: "Card list · state, due, lapses", backing: "readDeck.cards", status: "exists" },
  { affordance: "Peek a card front/back", backing: "readDeck.notes.fields", status: "exists" },
  {
    affordance: "Filters · All / Due / New / Leeches",
    backing: "readDeck.cards + config.leechThreshold, client-side",
    status: "derived",
  },
  { affordance: "Search cards", backing: "readDeck.notes, client-side", status: "derived" },
  {
    affordance: "Standing · which of the four reasons",
    backing: "completion.nextLearningAt / nextQueueAt / newLimitReached / reviewLimitReached",
    status: "exists",
  },
  {
    affordance: "Standing · the daily limits themselves",
    backing: "config.reviewsPerDay · config.newPerDay",
    status: "exists",
  },
  {
    affordance: "Standing · relative times (in 6 minutes, at 4:00)",
    backing: "completion timestamps, formatted client-side",
    status: "derived",
  },
  {
    affordance: "n of N reviews done today",
    backing:
      "dailyReviewCounts is optional and only valid when schedulingDay matches — validating needs schedulingDayKey(rolloverHour), server-side only",
    status: "extend",
  },
  {
    affordance: "How many cards the limit is holding back",
    backing: "queue.ts:217 computes it to set reviewLimitReached, then returns only the boolean",
    status: "extend",
  },
  {
    affordance: "How many cards are still in learning later today",
    backing: "queue.ts:216 has intradayLater + interdayLater; not returned",
    status: "extend",
  },
  {
    affordance: "How many cards come back tomorrow",
    backing: "queue.ts:170 has reviewLater; not returned",
    status: "extend",
  },
  {
    affordance: "Study → rate → next",
    backing: "queuedCards + submitReview",
    status: "exists",
  },
  {
    affordance: "Session receipt · count, time, breakdown",
    backing: "client-side tally of submitReview calls",
    status: "derived",
  },
  {
    affordance: "Practice anyway",
    backing: "readDeck only — never calls submitReview",
    status: "derived",
  },
  {
    affordance: "Up next · other pending decks",
    backing: "objects.list + queuedCards per deck — the Practice drawer already runs this",
    status: "derived",
  },
  {
    affordance: "Ask Buddy · canned session prompts",
    backing: "needs prompt-composer wiring",
    status: "missing",
  },
  { affordance: "Edit / add / delete a card", backing: "no route", status: "missing" },
  { affordance: "Rename the deck", backing: "no route", status: "missing" },
  {
    affordance: "Change limits · extend today · custom study",
    backing: "no deck-config write",
    status: "missing",
  },
  {
    affordance: "Suspend · bury · forget · set due",
    backing: "no route",
    status: "missing",
  },
  {
    affordance: "Review history · stats",
    backing: "ReviewRecord is persisted, but has no read route",
    status: "missing",
  },
]

const LEDGER_TONE = {
  exists: "text-text-success-base",
  derived: "text-text-interactive-base",
  extend: "text-text-warning-base",
  missing: "text-text-critical-base",
} satisfies Record<LedgerRow["status"], string>

// ─── Easel ─────────────────────────────────────────────────────────────────

const INITIAL_STATE: WorkspaceState = {
  drawerOpen: true,
  bench: { kind: "deck", standing: "due", peek: null },
}

export function FlashcardDeckJourneyEasel() {
  const [state, setState] = useState<WorkspaceState>(INITIAL_STATE)
  const [frameID, setFrameID] = useState<FrameID>("beside-chat")

  const navigate = useCallback((next: WorkspaceState) => setState(next), [])
  const frameWidth =
    frameID === "beside-chat" ? CHAT_W_PX + WORKSPACE_W_PX + RAIL_W_PX : WORKSPACE_W_PX + RAIL_W_PX

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background-base">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-base px-4 py-2">
        <div className="flex min-w-0 flex-col">
          <p className="text-[12px] font-medium text-text-strong">
            The drawer lists · the Bench opens · review is a mode
          </p>
          <p className="truncate text-[11px] text-text-weaker">
            Three endpoints, no invented ones · the four drain reasons the scheduler already returns
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ToggleGroup
            type="single"
            value={frameID}
            variant="outline"
            size="sm"
            aria-label="Frame"
            onValueChange={(value) => {
              if (value) {
                // SAFETY: This select only emits identifiers from the configured frame list.
                setFrameID(value as FrameID)
              }
            }}
          >
            <ToggleGroupItem value="beside-chat">Beside chat</ToggleGroupItem>
            <ToggleGroupItem value="workspace">Workspace only</ToggleGroupItem>
          </ToggleGroup>
          <Button size="sm" variant="ghost" onClick={() => setState(INITIAL_STATE)}>
            <RotateCcwIcon data-icon="inline-start" aria-hidden />
            Restart
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ── Live walkthrough ──────────────────────────────────────────── */}
        <section className="flex flex-col items-center gap-4 border-b border-border-base bg-surface-inset-base px-4 py-6">
          <div className="flex w-full max-w-[75rem] items-baseline justify-between gap-3">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-text-strong">
              Walk it
            </h3>
            <p className="font-mono text-[10px] text-text-weaker">
              drawer → bench target → study → done → deck · one target throughout
            </p>
          </div>

          <div
            className="flex overflow-hidden rounded-lg border border-border-base shadow-sm"
            style={{ width: frameWidth, maxWidth: "100%", height: FRAME_H_PX }}
          >
            {frameID === "beside-chat" ? (
              <div className="shrink-0" style={{ width: CHAT_W_PX }}>
                <ChatPaneStub />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <RightWorkspace state={state} onState={navigate} />
            </div>
          </div>

          <div className="flex w-full max-w-[75rem] flex-col gap-3 rounded-lg border border-border-base bg-surface-base p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-text-weaker">
                Jump to
              </span>
              {PHASES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  title={entry.note}
                  onClick={() => setState(entry.state)}
                  className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-text-weak transition-colors hover:bg-surface-weak hover:text-text-base"
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-text-weak">
              Click the deck row and the <span className="text-text-base">Study 12</span> chip
              separately — the row fills the Bench, the chip starts a session, and the drawer closes
              either way. Rate through three cards to reach done, take{" "}
              <span className="text-text-base">Back to deck</span>, and watch the same sentence
              become the deck's standing. The Practice rail button reopens the drawer over the
              Bench; the Bench keeps its target underneath.
            </p>
          </div>
        </section>

        {/* ── The row, in isolation ─────────────────────────────────────── */}
        <section className="space-y-4 border-b border-border-base px-4 py-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border-base pb-1.5">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-text-strong">
              The row · one column, no chevron
            </h3>
            <span className="font-mono text-[10px] text-text-weaker">
              action column {FLASHCARD_PRACTICE_ROW_ACTION_W_PX}px
            </span>
          </div>

          <p className="max-w-[80ch] text-[11px] leading-relaxed text-text-weaker">
            The chevron was the fault: it claims "this navigates", which the whole left region
            already does, and sitting it next to a second target is what put the arrow mid-row on
            some rows and hard right on others. Gone. What is left is a fixed right column that is
            never empty — the verb when there is one, otherwise when it comes back. Ruled instead of
            carded, unboxed glyph, accent spent on text and a hover fill rather than a filled pill.
          </p>

          <div className="max-w-[520px] rounded-md border border-border-base bg-background-base p-4">
            <div className="flex flex-col gap-2">
              <FlashcardPracticeDrawerRuledHead
                label="Practice"
                trailing={<FlashcardPracticeDrawerColumnLabel />}
              />
              <div className="flex flex-col">
                {PRACTICE_ROWS.map((row) => (
                  <FlashcardPracticeDrawerRow
                    key={row.title}
                    icon={row.icon}
                    title={row.title}
                    metadata={row.meta}
                    action={
                      row.action.kind === "action"
                        ? { ...row.action, onClick: () => undefined }
                        : row.action
                    }
                    onOpen={() => undefined}
                  />
                ))}
              </div>
            </div>
          </div>

          <p className="max-w-[80ch] text-[11px] leading-relaxed text-text-weaker">
            Hover the two regions separately — the split tint is what teaches the two targets, so
            the row never needs a button heavy enough to announce itself. The glyph stays because
            the feed is mixed: decks and question sets share this list.
          </p>
        </section>

        {/* ── Every phase ───────────────────────────────────────────────── */}
        <section className="space-y-4 border-b border-border-base px-4 py-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border-base pb-1.5">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-text-strong">
              Every phase · {PHASES.length} states
            </h3>
            <span className="font-mono text-[10px] text-text-weaker">
              right workspace only · all live
            </span>
          </div>

          <p className="text-[11px] leading-relaxed text-text-weaker">
            Seven of these are the Bench deck surface, which does not exist today. Four of the seven
            are the same "all cards are done" screen you're looking at now, told apart entirely by
            the completion payload the scheduler already returns.
          </p>

          <div className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(380px,1fr))]">
            {PHASES.map((entry) => (
              <div key={entry.id} className="flex flex-col gap-2">
                <div>
                  <p className="font-mono text-[11px] font-semibold text-text-strong">
                    {entry.label}
                  </p>
                  <p className="text-[10px] leading-snug text-text-weaker">{entry.note}</p>
                </div>
                <div
                  className="overflow-hidden rounded-md border border-border-base"
                  style={{ height: CONTACT_H_PX }}
                >
                  <RightWorkspace state={entry.state} onState={navigate} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── API ledger ────────────────────────────────────────────────── */}
        <section className="space-y-3 px-4 py-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border-base pb-1.5">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-text-strong">
              What each affordance costs
            </h3>
            <span className="font-mono text-[10px] text-text-weaker">
              readDeck · queuedCards · submitReview
            </span>
          </div>

          <p className="max-w-[90ch] text-[11px] leading-relaxed text-text-weaker">
            The whole deck API is three operations plus objects.delete.{" "}
            <span className="text-text-success-base">exists</span> is a field the API returns today.{" "}
            <span className="text-text-interactive-base">derived</span> is computed on the client
            from data already fetched, with no scheduler logic duplicated.{" "}
            <span className="text-text-warning-base">extend</span> is a value that already exists as
            a local inside buildFlashcardQueue and simply is not returned — a contained backend
            change, and the only thing on this page that needs your approval.{" "}
            <span className="text-text-critical-base">missing</span> has no route and no path;
            nothing in the prototype depends on it.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border-base">
                  <th className="py-2 pr-4 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-weaker">
                    Affordance
                  </th>
                  <th className="py-2 pr-4 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-weaker">
                    Backing
                  </th>
                  <th className="py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-weaker">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {API_LEDGER.map((row) => (
                  <tr
                    key={row.affordance}
                    className={cn(
                      "border-b border-border-base/40",
                      row.status === "missing" && "opacity-70",
                    )}
                  >
                    <td className="py-2 pr-4 text-[12px] text-text-base">{row.affordance}</td>
                    <td className="py-2 pr-4 font-mono text-[11px] text-text-weak">
                      {row.backing}
                    </td>
                    <td className={cn("py-2 text-[11px] font-medium", LEDGER_TONE[row.status])}>
                      {row.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
