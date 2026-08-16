import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import {
  Badge,
  BookOpenIcon,
  BrainIcon,
  Button,
  ChevronDownIcon,
  ChevronRightIcon,
  Clock3Icon,
  FolderIcon,
  Input,
  PlusIcon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  SlidersHorizontalIcon,
  SparklesIcon,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
  XIcon,
  Z_INDEX,
  cn,
} from "@buddy/ui"
import {
  FileIcon,
  FileTextIcon,
  ImagesIcon,
  Layers3Icon,
  ListChecksIcon,
  PanelsTopLeftIcon,
  PlayIcon,
  PresentationIcon,
  SearchIcon,
  ScrollTextIcon,
  WorkflowIcon,
  type AppIcon,
} from "@/icons/app-icons"
import * as AppIcons from "@/icons/app-icons"
import { NotebookSearchDrawer, type EaselSearchResult } from "./easel/notebook-search-drawer"
import { EaselOnboarding } from "./easel/easel-onboarding"
import { OnboardingNocturne } from "./easel/onboarding-nocturne"
import { OnboardingAtelier } from "./easel/onboarding-atelier"
import { OnboardingDirectionsEasel } from "./easel/onboarding-directions"
import { EngineStepOptionsEasel } from "./easel/engine-step-options"
import { LocationStepOptionsEasel } from "./easel/location-step-options"
import { QuestionToolAnsweredEasel } from "./easel/question-tool-answered"
import { QuestionDockRedesignsEasel } from "./easel/question-dock-redesigns"
import { GradientAnimationLoaderEasel } from "./easel/gradient-animation-loader"
import { WhiteboardOpeningLottieEasel } from "./easel/whiteboard-opening-lottie"
import { CreationsPanelRedesignsEasel } from "./easel/creations-panel-redesigns"
import { SkillsPanelRedesignsEasel } from "./easel/skills-panel-redesigns"
import { SkillsDrawerCalmDensityEasel } from "./easel/skills-drawer-calm-density"
import { InlineTodoRedesignsEasel } from "./easel/inline-todo-redesigns"
import { ErrorSystemRedesignEasel } from "./easel/error-system-redesign"
import { ErrorCardPreviewEasel } from "./easel/error-card-preview"
import { TokenCounterMeterEasel } from "./easel/token-counter-meter"
import { ObjectRowLanguageEasel } from "./easel/object-row-language"
import { SidebarAlignmentRedesignEasel } from "./easel/sidebar-alignment-redesign"
import { SkillIconAtlasEasel } from "./easel/skill-icon-atlas"
import { NotebookDialogRedesignEasel } from "./easel/notebook-dialog-redesign"
import { ChatGptAccountCardRedesignEasel } from "./easel/chatgpt-account-card-redesign"
import { SubagentCardRedesignsEasel } from "./easel/subagent-card-redesigns"
import { FlashcardReviewRedesignsEasel } from "./easel/flashcard-review-redesigns"
import { FlashcardDeckJourneyEasel } from "./easel/flashcard-deck-journey"
import { WorkingStateCanvasEasel } from "./easel/working-state-canvas"
import { CommandSelectionTokensEasel } from "./easel/command-selection-tokens"
import { ReaderLayoutConsistencyEasel } from "./easel/reader-layout-consistency"
import { SegmentedActiveStateEasel } from "./easel/segmented-active-state"
import { SettingsUpdatesAndModeEasel } from "./easel/settings-updates-and-mode"
import { ThemeSelectors } from "./theme-selectors"
import { findCatalogID } from "./easel/select-value"

const FigureGlyph = AppIcons["ShapesIcon"]

type EaselSectionID = "search" | "sources" | "practice" | "creations" | "boards" | "files"
type EaselRailItemID = EaselSectionID | "agents"

type EaselPracticeFilter = "all" | "flashcards" | "question-sets"

type EaselRailItem = {
  id: EaselRailItemID
  label: string
  icon: AppIcon
}

type EaselPrototype =
  | "settings-updates-and-mode"
  | "segmented-active-state"
  | "reader-layout-consistency"
  | "command-selection-tokens"
  | "flashcard-deck-journey"
  | "flashcard-review-redesigns"
  | "working-state-canvas"
  | "subagent-card-redesigns"
  | "chatgpt-account-card-redesign"
  | "notebook-dialog-redesign"
  | "location-step-options"
  | "engine-step-options"
  | "onboarding-directions"
  | "skills-drawer-calm-density"
  | "skill-icon-atlas"
  | "sidebar-alignment-redesign"
  | "whiteboard-opening-lottie"
  | "object-row-language"
  | "token-counter-meter"
  | "error-card-preview"
  | "error-system-redesign"
  | "inline-todo-redesigns"
  | "skills-panel-redesigns"
  | "creations-panel-redesigns"
  | "gradient-animation-loader"
  | "right-workspace"
  | "onboarding-easel"
  | "onboarding-nocturne"
  | "onboarding-atelier"
  | "question-tool-answered"
  | "question-dock-redesigns"

type EaselPrototypeConfig = {
  id: EaselPrototype
  label: string
  subtitle: string
}

const EASEL_PROTOTYPES: EaselPrototypeConfig[] = [
  {
    id: "segmented-active-state",
    label: "Segmented active state · on vs hover",
    subtitle:
      "Why a selected segment does not look selected: `toggleVariants` paints hover, aria-pressed and data-[state=on] with one token, and that token sits close to the popover fill it lives on \u00b7 the collision shown statically, before/after on the live ToggleGroup, five candidate on-states over both surfaces, and the one-string change",
  },
  {
    id: "settings-updates-and-mode",
    label: "Settings · update channel + Buddy mode",
    subtitle:
      "Two controls that hide what the pick costs · the channel toggle downloads a release candidate on selection and can't be undone (allowDowngrade = false), the mode cards flood with brand purple · baseline with the defects measured, then two update-tab directions across six updater states and three mode directions",
  },
  {
    id: "reader-layout-consistency",
    label: "Reader chrome · EPUB + PDF side by side",
    subtitle:
      "Two readers built to the same brief, drifted · original with the defects pinned, then four directions where both engines get the identical bar · depth ranked by frequency, the ⋯ menu and the footer deleted, one scroller per surface",
  },
  {
    id: "command-selection-tokens",
    label: "Command selection · variant + token",
    subtitle:
      'Why a cmdk row never lit up: `data-selected` is retargeted to `[data-state="selected"]`, an attribute cmdk never writes · broken vs value-matching side by side, candidate highlight tokens on the real popover surface, and the live primitive',
  },
  {
    id: "flashcard-deck-journey",
    label: "Flashcard deck · the surface around the reviewer",
    subtitle:
      "The drawer lists, the Bench opens, review is a mode of the same target · nothing invented: readDeck + queuedCards + submitReview only, with an API ledger for what got cut · the four drain reasons the scheduler already returns, told apart · 12 phases, all live",
  },
  {
    id: "flashcard-review-redesigns",
    label: "Flashcard review · the index card",
    subtitle:
      "One material end to end — tight radius, hairline rules, paper · rating ruler cut from the card · deck stacked underneath, and absent when the queue is empty, drained or unreachable · hover-aim + throw · slow-motion scrub · every state, one per row",
  },
  {
    id: "working-state-canvas",
    label: "Working states · 2D canvas",
    subtitle:
      "53 loading states that move in two dimensions · a live-integrated Chaotic family that never repeats (Mandelbrot zoom, strange attractors, double pendulum) plus field, blob, tile, orbital, path, physical, form",
  },
  {
    id: "subagent-card-redesigns",
    label: "Subagent card · current states",
    subtitle:
      "The real SubagentCard in every state it can reach · pending, running, artifacts, errors, fan-out · baseline for redesign",
  },
  {
    id: "chatgpt-account-card-redesign",
    label: "Connected account · ChatGPT card",
    subtitle:
      "Composer plan-usage hierarchy in the settings card · two rails, every row spanning between them",
  },
  {
    id: "notebook-dialog-redesign",
    label: "Notebook dialog · layout directions",
    subtitle: "Split footer · under field · attached",
  },
  {
    id: "location-step-options",
    label: "Onboarding · location step",
    subtitle:
      "Nine elements down to three · one line of orientation, the folder, accept or change · path / prose / object",
  },
  {
    id: "engine-step-options",
    label: "Onboarding · engine step",
    subtitle:
      "One list · 50+ providers stated, ChatGPT first and heaviest · no button stacked on top of rows",
  },
  {
    id: "onboarding-directions",
    label: "Onboarding · three art directions",
    subtitle:
      "Same three steps, three treatments · Ember (nocturne, disciplined) · Aperture (split canvas) · Letterpress (daylight)",
  },
  {
    id: "skills-drawer-calm-density",
    label: "Skills drawer · calm + density",
    subtitle:
      "Density is a function of state · calm while browsing · rows earn a taller box only when a search needs them to explain themselves",
  },
  {
    id: "skill-icon-atlas",
    label: "Skill icons · atlas",
    subtitle: "All skill identities · YAML-backed plans · real assets replace placeholders",
  },
  {
    id: "sidebar-alignment-redesign",
    label: "Left sidebar · alignment + status",
    subtitle:
      "Four text baselines collapse to one · status dot becomes a real layout slot · retry stops impersonating busy",
  },
  {
    id: "whiteboard-opening-lottie",
    label: "Whiteboard opening · diagram assembling",
    subtitle: "Flow ships in the bench pane · Branch and Curve kept for comparison",
  },
  {
    id: "object-row-language",
    label: "Inline object language · one row",
    subtitle:
      "Kills the three card systems · kind supplies data, never layout · receipt vs default density",
  },
  {
    id: "token-counter-meter",
    label: "Token counter · filled meters",
    subtitle:
      "Composer counter as meters · folds in ChatGPT plan limits when connected · context + cost otherwise",
  },
  {
    id: "error-card-preview",
    label: "Error card · breathing pass",
    subtitle: "Real AssistantErrorCard with roomier spacing · every terminal category",
  },
  {
    id: "error-system-redesign",
    label: "Error system · retry + terminal + dock",
    subtitle: "Retries recover quietly · terminal cards in product language · one failure, one box",
  },
  {
    id: "inline-todo-redesigns",
    label: "Inline todo list · 5 variants",
    subtitle: "Whiteboard Task Canvas · Mapped for all runtime states (In Progress → Todo → Done)",
  },
  {
    id: "skills-panel-redesigns",
    label: "Skills drawer · four directions",
    subtitle:
      "Category glyphs instead of identical text rows · calm list · gallery · grouped · marketplace",
  },
  {
    id: "creations-panel-redesigns",
    label: "Creations drawer · four directions",
    subtitle:
      "Inline previews instead of one repeated glyph · contact sheet · mosaic · shelves · peek",
  },
  {
    id: "gradient-animation-loader",
    label: "Gradient animation loader",
    subtitle: "Original fallback palette · Theme-adapted palette",
  },
  {
    id: "question-dock-redesigns",
    label: "Question dock · Spotlight",
    subtitle: "One question owns the surface · Skip is first-class",
  },
  {
    id: "question-tool-answered",
    label: "Question tool · answered",
    subtitle: "Full-fidelity transcript card options after the user submits answers",
  },
  {
    id: "onboarding-nocturne",
    label: "Onboarding · Nocturne (Brief A)",
    subtitle: "Cinematic single-canvas · living aurora recolours to your goal",
  },
  {
    id: "onboarding-atelier",
    label: "Onboarding · Atelier (Brief B)",
    subtitle: "Two-panel · a living identity card assembles itself as you answer",
  },
  {
    id: "right-workspace",
    label: "Right workspace navigator",
    subtitle: "Drawer-only concept · the rail owns category navigation",
  },
  {
    id: "onboarding-easel",
    label: "Onboarding Easel (old brainstorm)",
    subtitle: "Interview-paradigm suite · 5 layout concepts",
  },
]

type EaselDrawerShellProps = {
  title: string
  searchLabel?: string
  actionLabel?: string
  onAction?: () => void
  onClose: () => void
  children: ReactNode
}

type EaselListRowProps = {
  icon: AppIcon
  title: string
  metadata: string
  badge?: string
  active?: boolean
  onClick?: () => void
  onPreviewIntent?: (anchor: HTMLButtonElement) => void
  onPreviewEnd?: () => void
}

type EaselStressItem = {
  title: string
  metadata: string
}

type EaselPracticeItem = EaselStressItem & {
  kind: Exclude<EaselPracticeFilter, "all">
  badge?: string
}

type EaselCreationKind = "widget" | "diagram" | "media" | "interactive"

type EaselCreationItem = EaselStressItem & {
  id: string
  kind: EaselCreationKind
  icon: AppIcon
}

type EaselBenchSurface =
  | { type: "reading" }
  | { type: "agents" }
  | { type: "creation"; item: EaselCreationItem }
  | { type: "search-result"; result: EaselSearchResult }

type EaselCreationPreview = {
  item: EaselCreationItem
  left: number
  top: number
}

const STRESS_SOURCE_COUNT = 80
const STRESS_FLASHCARD_COUNT = 36
const STRESS_QUESTION_SET_COUNT = 28
const STRESS_CREATION_COUNT = 72
const STRESS_BOARD_COUNT = 48
const STRESS_FILE_COUNT = 90
const CREATION_PREVIEW_PREFETCH_DELAY_MS = 120
const CREATION_PREVIEW_OPEN_DELAY_MS = 500
const CREATION_PREVIEW_CLOSE_DELAY_MS = 150
const CREATION_PREVIEW_WIDTH_PX = 160
const CREATION_PREVIEW_ASPECT_RATIO = 16 / 9
const CREATION_PREVIEW_HEIGHT_PX = CREATION_PREVIEW_WIDTH_PX / CREATION_PREVIEW_ASPECT_RATIO
const CREATION_PREVIEW_GAP_PX = 12
const CREATION_PREVIEW_VIEWPORT_GUTTER_PX = 8

const EASEL_RAIL_ITEMS: EaselRailItem[] = [
  { id: "search", label: "Search", icon: SearchIcon },
  { id: "sources", label: "Sources", icon: BookOpenIcon },
  { id: "practice", label: "Practice", icon: BrainIcon },
  { id: "creations", label: "Creations", icon: FigureGlyph },
  { id: "boards", label: "Boards", icon: PresentationIcon },
  { id: "files", label: "Files", icon: FolderIcon },
  { id: "agents", label: "Agents", icon: ScrollTextIcon },
]

const STRESS_SOURCES: EaselStressItem[] = Array.from(
  { length: STRESS_SOURCE_COUNT },
  (_, index) => ({
    title: `Imported source ${index + 1}`,
    metadata: index % 3 === 0 ? "EPUB · Ready" : "PDF · 240 pages",
  }),
)

const STRESS_FLASHCARDS: EaselStressItem[] = Array.from(
  { length: STRESS_FLASHCARD_COUNT },
  (_, index) => ({
    title: `Flashcard deck ${index + 1}`,
    metadata: `${24 + index} cards · Reviewed ${index + 1} days ago`,
  }),
)

const STRESS_QUESTION_SETS: EaselStressItem[] = Array.from(
  { length: STRESS_QUESTION_SET_COUNT },
  (_, index) => ({
    title: `Question set ${index + 1}`,
    metadata: `${5 + (index % 8)} questions · Not started`,
  }),
)

const STRESS_CREATIONS: EaselStressItem[] = Array.from(
  { length: STRESS_CREATION_COUNT },
  (_, index) => ({
    title: `Generated creation ${index + 1}`,
    metadata: `Updated ${index + 1} hours ago`,
  }),
)

const STRESS_BOARDS: EaselStressItem[] = Array.from({ length: STRESS_BOARD_COUNT }, (_, index) => ({
  title: `Notebook board ${index + 1}`,
  metadata: `Last edited ${index + 1} hours ago`,
}))

const STRESS_FILES = Array.from(
  { length: STRESS_FILE_COUNT },
  (_, index) => `generated-file-${index + 1}.ts`,
)

const BASE_CREATIONS: EaselCreationItem[] = [
  {
    id: "solar-system-model",
    kind: "widget",
    icon: PanelsTopLeftIcon,
    title: "Solar system model",
    metadata: "Widget · 20 minutes ago",
  },
  {
    id: "cell-structure",
    kind: "diagram",
    icon: WorkflowIcon,
    title: "Cell structure",
    metadata: "Diagram · Yesterday",
  },
  {
    id: "lesson-figures",
    kind: "media",
    icon: ImagesIcon,
    title: "Lesson figures",
    metadata: "Media · 8 items",
  },
  {
    id: "industrial-revolution-timeline",
    kind: "media",
    icon: ImagesIcon,
    title: "Industrial Revolution timeline",
    metadata: "Media · 3 days ago",
  },
  {
    id: "memory-formation",
    kind: "interactive",
    icon: SparklesIcon,
    title: "Memory formation",
    metadata: "Interactive · Last week",
  },
]

const BASE_FLASHCARD_ITEMS: EaselPracticeItem[] = [
  {
    kind: "flashcards",
    title: "Western education",
    metadata: "84 cards · Reviewed yesterday",
    badge: "12 due",
  },
  {
    kind: "flashcards",
    title: "Learning theories",
    metadata: "32 cards · No cards due",
  },
]

const BASE_QUESTION_SET_ITEMS: EaselPracticeItem[] = [
  {
    kind: "question-sets",
    title: "Chapter 4 review",
    metadata: "6 questions · Not started",
  },
  {
    kind: "question-sets",
    title: "Foundations checkpoint",
    metadata: "10 questions · 70% complete",
  },
]

function interleavePracticeItems(
  flashcards: EaselPracticeItem[],
  questionSets: EaselPracticeItem[],
): EaselPracticeItem[] {
  const items: EaselPracticeItem[] = []
  const itemCount = Math.max(flashcards.length, questionSets.length)

  for (let index = 0; index < itemCount; index += 1) {
    const flashcard = flashcards[index]
    const questionSet = questionSets[index]
    if (flashcard) items.push(flashcard)
    if (questionSet) items.push(questionSet)
  }

  return items
}

function isEaselPracticeFilter(value: string): value is EaselPracticeFilter {
  return value === "all" || value === "flashcards" || value === "question-sets"
}

function EaselSectionLabel(props: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-weaker">
        {props.children}
      </p>
      {props.trailing}
    </div>
  )
}

function EaselListRow(props: EaselListRowProps) {
  const Icon = props.icon

  return (
    <Button
      variant="ghost"
      aria-current={props.active ? "page" : undefined}
      className={cn(
        "h-auto w-full justify-start px-2 py-2 text-left",
        props.active ? "bg-surface-raised-base" : undefined,
      )}
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return
        props.onPreviewIntent?.(event.currentTarget)
      }}
      onPointerLeave={props.onPreviewEnd}
      onFocus={(event) => props.onPreviewIntent?.(event.currentTarget)}
      onBlur={props.onPreviewEnd}
      onClick={props.onClick}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border-weaker-base bg-surface-raised-base text-icon-base">
        <Icon aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="w-full truncate text-sm text-text-base">{props.title}</span>
        <span className="w-full truncate text-xs font-normal text-text-weaker">
          {props.metadata}
        </span>
      </span>
      {props.badge ? <Badge variant="outline">{props.badge}</Badge> : null}
      <ChevronRightIcon className="ml-auto text-icon-base" aria-hidden />
    </Button>
  )
}

function EaselDrawerShell(props: EaselDrawerShellProps) {
  const [search, setSearch] = useState("")

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-base">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border-weaker-base px-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-strong">
          {props.title}
        </h2>
        {props.actionLabel ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={props.actionLabel}
            onClick={props.onAction}
          >
            <PlusIcon aria-hidden />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Close ${props.title}`}
          onClick={props.onClose}
        >
          <XIcon aria-hidden />
        </Button>
      </div>

      {props.searchLabel ? (
        <div className="shrink-0 border-b border-border-weaker-base p-3">
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-icon-base"
              aria-hidden
            />
            <Input
              value={search}
              aria-label={props.searchLabel}
              placeholder={props.searchLabel}
              className="pl-9"
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-3">{props.children}</div>
    </div>
  )
}

function SourcesDrawer(props: { lotsOfContent: boolean; onClose: () => void }) {
  return (
    <EaselDrawerShell
      title="Sources"
      searchLabel="Search sources…"
      actionLabel="Add source"
      onClose={props.onClose}
    >
      <section className="flex flex-col gap-2">
        <EaselSectionLabel>Continue</EaselSectionLabel>
        <Button variant="secondary" className="h-auto w-full justify-start px-3 py-3 text-left">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-interactive-weak text-text-interactive-base">
            <BookOpenIcon aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <span className="w-full truncate text-sm">The History of Western Education</span>
            <span className="text-xs font-normal text-text-weak">Chapter 4 · 32% complete</span>
          </span>
          <ChevronRightIcon className="ml-auto" aria-hidden />
        </Button>
      </section>

      <section className="flex flex-col gap-1">
        <EaselSectionLabel
          trailing={
            <Button variant="ghost" size="xs">
              <SlidersHorizontalIcon data-icon="inline-start" aria-hidden />
              Recent
            </Button>
          }
        >
          {props.lotsOfContent ? 42 + STRESS_SOURCE_COUNT : 42} sources
        </EaselSectionLabel>
        <EaselListRow icon={BookOpenIcon} title="How to Read a Book" metadata="EPUB · Ready" />
        <EaselListRow
          icon={FileTextIcon}
          title="A History of Education"
          metadata="PDF · 324 pages"
        />
        <EaselListRow icon={BookOpenIcon} title="Make It Stick" metadata="EPUB · Ready" />
        <EaselListRow
          icon={FileTextIcon}
          title="Learning Science Notes"
          metadata="PDF · Preparing"
          badge="Preparing"
        />
        <EaselListRow
          icon={FileTextIcon}
          title="The Art of Explanation"
          metadata="PDF · 168 pages"
        />
        {props.lotsOfContent
          ? STRESS_SOURCES.map((source) => (
              <EaselListRow
                key={source.title}
                icon={FileTextIcon}
                title={source.title}
                metadata={source.metadata}
              />
            ))
          : null}
      </section>
    </EaselDrawerShell>
  )
}

function PracticeDrawer(props: { lotsOfContent: boolean; onClose: () => void }) {
  const [filter, setFilter] = useState<EaselPracticeFilter>("all")
  const flashcards = props.lotsOfContent
    ? [
        ...BASE_FLASHCARD_ITEMS,
        ...STRESS_FLASHCARDS.map((deck, index): EaselPracticeItem => {
          if (index % 4 === 0) {
            return {
              kind: "flashcards",
              title: deck.title,
              metadata: deck.metadata,
              badge: `${index + 2} due`,
            }
          }
          return {
            kind: "flashcards",
            title: deck.title,
            metadata: deck.metadata,
          }
        }),
      ]
    : BASE_FLASHCARD_ITEMS
  const questionSets = props.lotsOfContent
    ? [
        ...BASE_QUESTION_SET_ITEMS,
        ...STRESS_QUESTION_SETS.map(
          (questionSet): EaselPracticeItem => ({
            kind: "question-sets",
            title: questionSet.title,
            metadata: questionSet.metadata,
          }),
        ),
      ]
    : BASE_QUESTION_SET_ITEMS
  const visibleItems =
    filter === "flashcards"
      ? flashcards
      : filter === "question-sets"
        ? questionSets
        : interleavePracticeItems(flashcards, questionSets)

  return (
    <EaselDrawerShell title="Practice" searchLabel="Search practice…" onClose={props.onClose}>
      <section className="flex flex-col gap-2">
        <EaselSectionLabel>Ready to review</EaselSectionLabel>
        <div className="flex items-center gap-3 rounded-lg border border-border-interactive-base bg-surface-interactive-weak p-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-lg font-semibold text-text-strong">18 due</p>
            <p className="text-xs text-text-weak">12 flashcards · 6 questions</p>
          </div>
          <Button size="sm">
            <PlayIcon data-icon="inline-start" aria-hidden />
            Start
          </Button>
        </div>
      </section>

      <div className="flex items-center justify-between gap-2">
        <ToggleGroup
          type="single"
          value={filter}
          variant="outline"
          size="sm"
          aria-label="Filter practice items"
          onValueChange={(value) => {
            if (isEaselPracticeFilter(value)) setFilter(value)
          }}
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="flashcards">Cards</ToggleGroupItem>
          <ToggleGroupItem value="question-sets">Questions</ToggleGroupItem>
        </ToggleGroup>
        <Button variant="ghost" size="sm">
          <Clock3Icon data-icon="inline-start" aria-hidden />
          Recent
        </Button>
      </div>

      <section className="flex flex-col gap-1">
        <EaselSectionLabel>{visibleItems.length} practice items</EaselSectionLabel>
        {visibleItems.map((item) => (
          <EaselListRow
            key={`${item.kind}:${item.title}`}
            icon={item.kind === "flashcards" ? Layers3Icon : ListChecksIcon}
            title={item.title}
            metadata={item.metadata}
            badge={item.badge}
          />
        ))}
      </section>
    </EaselDrawerShell>
  )
}

function stressCreationIcon(index: number): AppIcon {
  switch (index % 4) {
    case 0:
      return PanelsTopLeftIcon
    case 1:
      return WorkflowIcon
    case 2:
      return ImagesIcon
    default:
      return PresentationIcon
  }
}

function stressCreationKind(index: number): EaselCreationKind {
  switch (index % 4) {
    case 0:
      return "widget"
    case 1:
      return "diagram"
    case 2:
      return "media"
    default:
      return "interactive"
  }
}

function EaselCreationPreviewVisual(props: { kind: EaselCreationKind }) {
  switch (props.kind) {
    case "widget":
      return (
        <div className="flex h-full flex-col gap-3 rounded-md border border-border-weaker-base bg-background-base p-3">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-surface-interactive-base" />
            <span className="h-2 w-16 rounded bg-surface-raised-base" />
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2">
            <div className="rounded-md bg-surface-raised-base" />
            <div className="flex flex-col gap-2">
              <div className="h-4 rounded bg-surface-interactive-weak" />
              <div className="flex-1 rounded bg-surface-base" />
            </div>
          </div>
        </div>
      )
    case "diagram":
      return (
        <div className="relative h-full overflow-hidden rounded-md border border-border-weaker-base bg-background-base">
          <div className="absolute left-5 top-7 h-10 w-20 rounded-md border border-border-interactive-base bg-surface-interactive-weak" />
          <div className="absolute right-5 top-7 h-10 w-20 rounded-md border border-border-weaker-base bg-surface-raised-base" />
          <div className="absolute left-1/2 top-12 h-px w-16 -translate-x-1/2 bg-border-interactive-base" />
          <div className="absolute bottom-6 left-1/2 h-9 w-24 -translate-x-1/2 rounded-md border border-border-weaker-base bg-surface-base" />
          <div className="absolute bottom-14 left-1/2 h-7 w-px bg-border-interactive-base" />
        </div>
      )
    case "media":
      return (
        <div className="grid h-full grid-cols-3 gap-2">
          <div className="rounded-md border border-border-weaker-base bg-surface-interactive-weak" />
          <div className="rounded-md border border-border-weaker-base bg-surface-raised-base" />
          <div className="rounded-md border border-border-weaker-base bg-surface-base" />
        </div>
      )
    case "interactive":
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 rounded-md border border-border-weaker-base bg-background-base">
          <span className="flex size-12 items-center justify-center rounded-full bg-surface-interactive-weak text-text-interactive-base">
            <SparklesIcon className="size-6" aria-hidden />
          </span>
          <div className="h-2 w-24 rounded bg-surface-raised-base" />
          <div className="h-2 w-16 rounded bg-surface-base" />
        </div>
      )
  }
}

function CreationsDrawer(props: {
  lotsOfContent: boolean
  onClose: () => void
  onOpenCreation: (item: EaselCreationItem) => void
  onPreviewIntent: (item: EaselCreationItem, anchor: HTMLButtonElement) => void
  onPreviewEnd: () => void
}) {
  const stressCreations: EaselCreationItem[] = props.lotsOfContent
    ? STRESS_CREATIONS.map((creation, index) => ({
        id: `stress-creation-${index + 1}`,
        kind: stressCreationKind(index),
        icon: stressCreationIcon(index),
        title: creation.title,
        metadata: creation.metadata,
      }))
    : []
  const creations = [...BASE_CREATIONS, ...stressCreations]

  return (
    <EaselDrawerShell
      title="Creations"
      searchLabel="Search creations…"
      actionLabel="Create"
      onClose={props.onClose}
    >
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm">
          <FigureGlyph data-icon="inline-start" aria-hidden />
          All types
          <ChevronDownIcon data-icon="inline-end" aria-hidden />
        </Button>
        <Button variant="ghost" size="sm">
          <Clock3Icon data-icon="inline-start" aria-hidden />
          Recent
        </Button>
      </div>

      <section className="flex flex-col gap-1">
        <EaselSectionLabel>Recent creations</EaselSectionLabel>
        {creations.map((creation) => (
          <EaselListRow
            key={creation.id}
            icon={creation.icon}
            title={creation.title}
            metadata={creation.metadata}
            onClick={() => props.onOpenCreation(creation)}
            onPreviewIntent={(anchor) => props.onPreviewIntent(creation, anchor)}
            onPreviewEnd={props.onPreviewEnd}
          />
        ))}
      </section>
    </EaselDrawerShell>
  )
}

function BoardsDrawer(props: {
  boardCreated: boolean
  lotsOfContent: boolean
  onCreateBoard: () => void
  onClose: () => void
}) {
  const hasBoards = props.boardCreated || props.lotsOfContent
  const boardCount = props.lotsOfContent ? 3 + STRESS_BOARD_COUNT : 1

  return (
    <EaselDrawerShell
      title="Boards"
      searchLabel={hasBoards ? "Search boards…" : undefined}
      actionLabel="New board"
      onAction={props.onCreateBoard}
      onClose={props.onClose}
    >
      {hasBoards ? (
        <section className="flex flex-col gap-1">
          <EaselSectionLabel
            trailing={
              <Button variant="ghost" size="xs">
                <Clock3Icon data-icon="inline-start" aria-hidden />
                Recent
              </Button>
            }
          >
            {boardCount} {boardCount === 1 ? "board" : "boards"}
          </EaselSectionLabel>
          <EaselListRow
            icon={PresentationIcon}
            title="Notebook board"
            metadata={props.boardCreated ? "Edited just now" : "Edited today"}
            active={props.boardCreated}
          />
          {props.lotsOfContent ? (
            <>
              <EaselListRow
                icon={PresentationIcon}
                title="Learning theories map"
                metadata="Edited yesterday"
              />
              <EaselListRow
                icon={PresentationIcon}
                title="Chapter 4 working notes"
                metadata="Edited 3 days ago"
              />
              {STRESS_BOARDS.map((board) => (
                <EaselListRow
                  key={board.title}
                  icon={PresentationIcon}
                  title={board.title}
                  metadata={board.metadata}
                />
              ))}
            </>
          ) : null}
        </section>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-5 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-lg border border-border-weaker-base bg-surface-raised-base text-icon-base">
            <PresentationIcon className="size-6" aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-text-strong">No board yet</p>
            <p className="text-xs leading-relaxed text-text-weak">
              Create a board for this notebook to sketch ideas and work visually with Buddy.
            </p>
          </div>
          <Button onClick={props.onCreateBoard}>
            <PlusIcon data-icon="inline-start" aria-hidden />
            Create board
          </Button>
        </div>
      )}
    </EaselDrawerShell>
  )
}

function FileTreeRow(props: {
  icon: AppIcon
  label: string
  depth: "root" | "child" | "grandchild"
  expanded?: boolean
}) {
  const Icon = props.icon

  return (
    <Button
      variant="ghost"
      className={cn(
        "h-7 w-full justify-start px-2 text-left font-normal",
        props.depth === "child" ? "pl-6" : undefined,
        props.depth === "grandchild" ? "pl-10" : undefined,
      )}
    >
      {props.expanded === undefined ? (
        <span className="size-4 shrink-0" />
      ) : props.expanded ? (
        <ChevronDownIcon aria-hidden />
      ) : (
        <ChevronRightIcon aria-hidden />
      )}
      <Icon aria-hidden />
      <span className="truncate">{props.label}</span>
    </Button>
  )
}

function FilesDrawer(props: { lotsOfContent: boolean; onClose: () => void }) {
  return (
    <EaselDrawerShell title="Files" searchLabel="Search files…" onClose={props.onClose}>
      <section className="flex flex-col gap-1">
        <EaselSectionLabel>Project</EaselSectionLabel>
        <div className="flex flex-col">
          <FileTreeRow icon={FolderIcon} label="src" depth="root" expanded />
          <FileTreeRow icon={FolderIcon} label="components" depth="child" expanded />
          <FileTreeRow icon={FileIcon} label="app.tsx" depth="grandchild" />
          <FileTreeRow icon={FileIcon} label="right-workspace.tsx" depth="grandchild" />
          <FileTreeRow icon={FolderIcon} label="lib" depth="child" expanded={false} />
          <FileTreeRow icon={FileIcon} label="package.json" depth="root" />
          <FileTreeRow icon={FileIcon} label="AGENTS.md" depth="root" />
          {props.lotsOfContent
            ? STRESS_FILES.map((filename) => (
                <FileTreeRow key={filename} icon={FileIcon} label={filename} depth="root" />
              ))
            : null}
        </div>
      </section>
    </EaselDrawerShell>
  )
}

function BenchPlaceholder(props: { surface: EaselBenchSurface }) {
  if (props.surface.type === "agents") {
    return (
      <div className="flex h-full flex-col bg-background-base">
        <div className="flex h-12 items-center gap-2 border-b border-border-weaker-base px-4">
          <ScrollTextIcon className="size-4 text-icon-base" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-strong">AGENTS.md</p>
          <Badge variant="outline">Agents</Badge>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
          <div className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-text-strong">Notebook instructions</h2>
            <p className="text-sm leading-relaxed text-text-weak">
              Guidance shared by the agents working in this notebook.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-text-weaker">
              Working agreement
            </p>
            <div className="h-3 w-full rounded bg-surface-base" />
            <div className="h-3 w-11/12 rounded bg-surface-base" />
            <div className="h-3 w-4/5 rounded bg-surface-base" />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-text-weaker">
              Current focus
            </p>
            <div className="h-3 w-5/6 rounded bg-surface-base" />
            <div className="h-3 w-full rounded bg-surface-base" />
            <div className="h-3 w-3/4 rounded bg-surface-base" />
          </div>
        </div>
      </div>
    )
  }

  if (props.surface.type === "creation") {
    const CreationIcon = props.surface.item.icon

    return (
      <div className="flex h-full flex-col bg-background-base">
        <div className="flex h-12 items-center gap-2 border-b border-border-weaker-base px-4">
          <CreationIcon className="size-4 text-icon-base" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-strong">
            {props.surface.item.title}
          </p>
          <Badge variant="outline">{props.surface.item.kind}</Badge>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-5">
          <div className="aspect-video w-full">
            <EaselCreationPreviewVisual kind={props.surface.item.kind} />
          </div>
        </div>
      </div>
    )
  }

  if (props.surface.type === "search-result") {
    return (
      <div className="flex h-full flex-col bg-background-base">
        <div className="flex h-12 items-center gap-2 border-b border-border-weaker-base px-4">
          <SearchIcon className="size-4 text-icon-base" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-strong">
            {props.surface.result.title}
          </p>
          <Badge variant="outline">{props.surface.result.kind}</Badge>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 p-5">
          <Badge variant="secondary">Opened from Search</Badge>
          <div className="flex flex-col gap-2">
            <div className="h-4 w-3/4 rounded bg-surface-raised-base" />
            <div className="h-3 w-full rounded bg-surface-base" />
            <div className="h-3 w-11/12 rounded bg-surface-base" />
            <div className="h-3 w-4/5 rounded bg-surface-base" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background-base">
      <div className="flex h-12 items-center border-b border-border-weaker-base px-4">
        <p className="text-sm font-medium text-text-strong">The History of Western Education</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-5">
        <Badge variant="secondary">Bench</Badge>
        <div className="flex flex-col gap-2">
          <div className="h-4 w-3/4 rounded bg-surface-raised-base" />
          <div className="h-3 w-full rounded bg-surface-base" />
          <div className="h-3 w-11/12 rounded bg-surface-base" />
          <div className="h-3 w-4/5 rounded bg-surface-base" />
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <div className="h-3 w-full rounded bg-surface-base" />
          <div className="h-3 w-5/6 rounded bg-surface-base" />
          <div className="h-3 w-2/3 rounded bg-surface-base" />
        </div>
        <p className="mt-auto text-xs text-text-weaker">
          Select a rail section to browse. Closing its drawer returns here.
        </p>
      </div>
    </div>
  )
}

function isEaselSectionID(value: EaselRailItemID): value is EaselSectionID {
  return value !== "agents"
}

function EaselDrawerContent(props: {
  section: EaselSectionID
  boardCreated: boolean
  lotsOfContent: boolean
  onCreateBoard: () => void
  onClose: () => void
  onOpenCreation: (item: EaselCreationItem) => void
  onOpenSearchResult: (result: EaselSearchResult) => void
  onPreviewIntent: (item: EaselCreationItem, anchor: HTMLButtonElement) => void
  onPreviewEnd: () => void
}) {
  switch (props.section) {
    case "search":
      return (
        <NotebookSearchDrawer
          lotsOfContent={props.lotsOfContent}
          onClose={props.onClose}
          onOpenResult={props.onOpenSearchResult}
        />
      )
    case "sources":
      return <SourcesDrawer lotsOfContent={props.lotsOfContent} onClose={props.onClose} />
    case "practice":
      return <PracticeDrawer lotsOfContent={props.lotsOfContent} onClose={props.onClose} />
    case "creations":
      return (
        <CreationsDrawer
          lotsOfContent={props.lotsOfContent}
          onClose={props.onClose}
          onOpenCreation={props.onOpenCreation}
          onPreviewIntent={props.onPreviewIntent}
          onPreviewEnd={props.onPreviewEnd}
        />
      )
    case "boards":
      return (
        <BoardsDrawer
          boardCreated={props.boardCreated}
          lotsOfContent={props.lotsOfContent}
          onCreateBoard={props.onCreateBoard}
          onClose={props.onClose}
        />
      )
    case "files":
      return <FilesDrawer lotsOfContent={props.lotsOfContent} onClose={props.onClose} />
  }
}

export function DevToolsEaselTab(props: { directory?: string }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const previewPrefetchTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const previewOpenTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const previewCloseTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const preparedCreationIDRef = useRef<string>()
  const [activeSection, setActiveSection] = useState<EaselSectionID>("sources")
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [lotsOfContent, setLotsOfContent] = useState(false)
  const [boardCreated, setBoardCreated] = useState(false)
  const [benchSurface, setBenchSurface] = useState<EaselBenchSurface>({ type: "reading" })
  const [creationPreview, setCreationPreview] = useState<EaselCreationPreview>()
  const [prototype, setPrototype] = useState<EaselPrototype>("segmented-active-state")

  function clearCreationPreviewTimers() {
    if (previewPrefetchTimeoutRef.current) clearTimeout(previewPrefetchTimeoutRef.current)
    if (previewOpenTimeoutRef.current) clearTimeout(previewOpenTimeoutRef.current)
    if (previewCloseTimeoutRef.current) clearTimeout(previewCloseTimeoutRef.current)
    previewPrefetchTimeoutRef.current = undefined
    previewOpenTimeoutRef.current = undefined
    previewCloseTimeoutRef.current = undefined
  }

  function clearCreationPreview() {
    clearCreationPreviewTimers()
    preparedCreationIDRef.current = undefined
    setCreationPreview(undefined)
  }

  function beginCreationPreview(item: EaselCreationItem, anchor: HTMLButtonElement) {
    clearCreationPreviewTimers()
    preparedCreationIDRef.current = undefined
    setCreationPreview(undefined)

    previewPrefetchTimeoutRef.current = setTimeout(() => {
      previewPrefetchTimeoutRef.current = undefined
      preparedCreationIDRef.current = item.id
    }, CREATION_PREVIEW_PREFETCH_DELAY_MS)
    previewOpenTimeoutRef.current = setTimeout(() => {
      previewOpenTimeoutRef.current = undefined
      const stage = stageRef.current
      if (preparedCreationIDRef.current !== item.id || !stage || !anchor.isConnected) return

      const anchorRect = anchor.getBoundingClientRect()
      const stageRect = stage.getBoundingClientRect()
      const desiredLeft =
        anchorRect.left - stageRect.left - CREATION_PREVIEW_WIDTH_PX - CREATION_PREVIEW_GAP_PX
      const desiredTop =
        anchorRect.top - stageRect.top + (anchorRect.height - CREATION_PREVIEW_HEIGHT_PX) / 2
      const maximumLeft = Math.max(
        CREATION_PREVIEW_VIEWPORT_GUTTER_PX,
        stageRect.width - CREATION_PREVIEW_WIDTH_PX - CREATION_PREVIEW_VIEWPORT_GUTTER_PX,
      )
      const maximumTop = Math.max(
        CREATION_PREVIEW_VIEWPORT_GUTTER_PX,
        stageRect.height - CREATION_PREVIEW_HEIGHT_PX - CREATION_PREVIEW_VIEWPORT_GUTTER_PX,
      )

      setCreationPreview({
        item,
        left: Math.min(Math.max(desiredLeft, CREATION_PREVIEW_VIEWPORT_GUTTER_PX), maximumLeft),
        top: Math.min(Math.max(desiredTop, CREATION_PREVIEW_VIEWPORT_GUTTER_PX), maximumTop),
      })
    }, CREATION_PREVIEW_OPEN_DELAY_MS)
  }

  function scheduleCreationPreviewClose() {
    if (previewPrefetchTimeoutRef.current) clearTimeout(previewPrefetchTimeoutRef.current)
    if (previewOpenTimeoutRef.current) clearTimeout(previewOpenTimeoutRef.current)
    if (previewCloseTimeoutRef.current) clearTimeout(previewCloseTimeoutRef.current)
    previewPrefetchTimeoutRef.current = undefined
    previewOpenTimeoutRef.current = undefined
    previewCloseTimeoutRef.current = setTimeout(() => {
      previewCloseTimeoutRef.current = undefined
      setCreationPreview(undefined)
    }, CREATION_PREVIEW_CLOSE_DELAY_MS)
  }

  function keepCreationPreviewOpen() {
    if (!previewCloseTimeoutRef.current) return
    clearTimeout(previewCloseTimeoutRef.current)
    previewCloseTimeoutRef.current = undefined
  }

  function openCreation(item: EaselCreationItem) {
    clearCreationPreview()
    setBenchSurface({ type: "creation", item })
    setDrawerOpen(false)
  }

  function openSearchResult(result: EaselSearchResult) {
    clearCreationPreview()
    setBenchSurface({ type: "search-result", result })
    setDrawerOpen(false)
  }

  function closeDrawer() {
    clearCreationPreview()
    setDrawerOpen(false)
  }

  function openRailItem(itemID: EaselRailItemID) {
    clearCreationPreview()

    if (isEaselSectionID(itemID)) {
      setActiveSection(itemID)
      setDrawerOpen(true)
      return
    }

    setBenchSurface({ type: "agents" })
    setDrawerOpen(false)
  }

  useEffect(
    () => () => {
      if (previewPrefetchTimeoutRef.current) clearTimeout(previewPrefetchTimeoutRef.current)
      if (previewOpenTimeoutRef.current) clearTimeout(previewOpenTimeoutRef.current)
      if (previewCloseTimeoutRef.current) clearTimeout(previewCloseTimeoutRef.current)
    },
    [],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-weaker-base px-3 py-2">
        <div className="flex min-w-0 flex-col">
          <Select
            value={prototype}
            onValueChange={(value) => {
              const nextPrototype = findCatalogID(value, EASEL_PROTOTYPES)
              if (nextPrototype) setPrototype(nextPrototype)
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-auto w-fit border-none bg-transparent px-0 py-0 text-xs font-medium text-text-base hover:bg-transparent focus-visible:ring-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={{ zIndex: Z_INDEX.devtoolsFloating }}>
              {EASEL_PROTOTYPES.map((config) => (
                <SelectItem key={config.id} value={config.id} className="text-xs">
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="truncate text-[11px] text-text-weaker">
            {EASEL_PROTOTYPES.find((config) => config.id === prototype)?.subtitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {prototype === "right-workspace" ? (
            <>
              <label htmlFor="easel-lots-of-content" className="text-xs text-text-weak">
                Lots of content
              </label>
              <Switch
                id="easel-lots-of-content"
                size="sm"
                checked={lotsOfContent}
                aria-label="Populate every section with lots of content"
                onCheckedChange={setLotsOfContent}
              />
            </>
          ) : null}
          <ThemeSelectors compact />
          <Badge variant="outline">Easel</Badge>
        </div>
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1",
          prototype === "location-step-options" ||
            prototype === "settings-updates-and-mode" ||
            prototype === "segmented-active-state" ||
            prototype === "reader-layout-consistency" ||
            prototype === "command-selection-tokens" ||
            prototype === "flashcard-deck-journey" ||
            prototype === "flashcard-review-redesigns" ||
            prototype === "working-state-canvas" ||
            prototype === "subagent-card-redesigns" ||
            prototype === "chatgpt-account-card-redesign" ||
            prototype === "notebook-dialog-redesign" ||
            prototype === "engine-step-options" ||
            prototype === "onboarding-directions" ||
            prototype === "skills-drawer-calm-density" ||
            prototype === "skill-icon-atlas" ||
            prototype === "question-dock-redesigns" ||
            prototype === "creations-panel-redesigns" ||
            prototype === "skills-panel-redesigns" ||
            prototype === "error-system-redesign" ||
            prototype === "error-card-preview" ||
            prototype === "token-counter-meter" ||
            prototype === "sidebar-alignment-redesign" ||
            prototype === "object-row-language"
            ? "items-stretch justify-stretch bg-background-base p-0"
            : "items-center justify-center bg-surface-inset-base p-3",
        )}
      >
        {prototype === "settings-updates-and-mode" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <SettingsUpdatesAndModeEasel />
            </div>
          </div>
        ) : null}

        {prototype === "segmented-active-state" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <SegmentedActiveStateEasel />
            </div>
          </div>
        ) : null}

        {prototype === "reader-layout-consistency" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <ReaderLayoutConsistencyEasel />
            </div>
          </div>
        ) : null}

        {prototype === "command-selection-tokens" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <CommandSelectionTokensEasel />
            </div>
          </div>
        ) : null}

        {prototype === "flashcard-deck-journey" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <FlashcardDeckJourneyEasel />
            </div>
          </div>
        ) : null}

        {prototype === "flashcard-review-redesigns" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <FlashcardReviewRedesignsEasel />
            </div>
          </div>
        ) : null}

        {prototype === "working-state-canvas" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <WorkingStateCanvasEasel />
            </div>
          </div>
        ) : null}

        {prototype === "subagent-card-redesigns" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <SubagentCardRedesignsEasel />
            </div>
          </div>
        ) : null}

        {prototype === "chatgpt-account-card-redesign" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <ChatGptAccountCardRedesignEasel />
            </div>
          </div>
        ) : null}

        {prototype === "notebook-dialog-redesign" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <NotebookDialogRedesignEasel />
            </div>
          </div>
        ) : null}

        {prototype === "location-step-options" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <LocationStepOptionsEasel />
            </div>
          </div>
        ) : null}

        {prototype === "engine-step-options" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <EngineStepOptionsEasel />
            </div>
          </div>
        ) : null}

        {prototype === "onboarding-directions" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <OnboardingDirectionsEasel />
            </div>
          </div>
        ) : null}

        {prototype === "right-workspace" ? (
          <div
            ref={stageRef}
            className="relative flex h-full min-h-0 w-full max-w-4xl items-center justify-end"
          >
            {creationPreview ? (
              <button
                type="button"
                aria-label={`Open ${creationPreview.item.title} on the Bench`}
                className="absolute z-30 aspect-video rounded-lg border border-border-base bg-background-base p-2 shadow-xl outline-none transition-[border-color,box-shadow] focus-visible:border-border-interactive-base focus-visible:ring-2 focus-visible:ring-border-interactive-base/20"
                style={{
                  left: creationPreview.left,
                  top: creationPreview.top,
                  width: CREATION_PREVIEW_WIDTH_PX,
                }}
                onPointerEnter={keepCreationPreviewOpen}
                onPointerLeave={scheduleCreationPreviewClose}
                onFocus={keepCreationPreviewOpen}
                onBlur={scheduleCreationPreviewClose}
                onClick={() => openCreation(creationPreview.item)}
              >
                <EaselCreationPreviewVisual kind={creationPreview.item.kind} />
              </button>
            ) : null}

            <div className="relative z-20 flex h-full min-h-0 w-full max-w-md overflow-hidden rounded-lg border border-border-base bg-background-base shadow-lg">
              <main className="min-w-0 flex-1">
                {drawerOpen ? (
                  <EaselDrawerContent
                    section={activeSection}
                    boardCreated={boardCreated}
                    lotsOfContent={lotsOfContent}
                    onCreateBoard={() => setBoardCreated(true)}
                    onClose={closeDrawer}
                    onOpenCreation={openCreation}
                    onOpenSearchResult={openSearchResult}
                    onPreviewIntent={beginCreationPreview}
                    onPreviewEnd={scheduleCreationPreviewClose}
                  />
                ) : (
                  <BenchPlaceholder surface={benchSurface} />
                )}
              </main>

              <nav
                aria-label="Right workspace sections"
                className="flex w-11 shrink-0 flex-col items-center gap-1 border-l border-border-weaker-base bg-background-base px-1 py-2"
              >
                {EASEL_RAIL_ITEMS.map((item) => {
                  const Icon = item.icon
                  const active = isEaselSectionID(item.id)
                    ? drawerOpen && activeSection === item.id
                    : !drawerOpen && benchSurface.type === "agents"

                  return (
                    <Fragment key={item.id}>
                      {item.id === "agents" ? <Separator className="my-1 w-5" /> : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={item.label}
                        aria-pressed={active}
                        title={item.label}
                        className={cn(
                          active ? "bg-surface-raised-base text-text-strong" : "text-icon-base",
                        )}
                        onClick={() => openRailItem(item.id)}
                      >
                        <Icon aria-hidden />
                      </Button>
                    </Fragment>
                  )
                })}
              </nav>
            </div>
          </div>
        ) : null}

        {prototype === "creations-panel-redesigns" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <CreationsPanelRedesignsEasel directory={props.directory} />
            </div>
          </div>
        ) : null}

        {prototype === "skills-panel-redesigns" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <SkillsPanelRedesignsEasel directory={props.directory} />
            </div>
          </div>
        ) : null}

        {prototype === "skills-drawer-calm-density" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <SkillsDrawerCalmDensityEasel directory={props.directory} />
            </div>
          </div>
        ) : null}

        {prototype === "skill-icon-atlas" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <SkillIconAtlasEasel directory={props.directory} />
            </div>
          </div>
        ) : null}

        {prototype === "whiteboard-opening-lottie" ? (
          <div className="relative flex h-full min-h-0 w-full max-w-6xl items-center justify-center">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden rounded-lg border border-border-base shadow-lg">
              <WhiteboardOpeningLottieEasel />
            </div>
          </div>
        ) : null}

        {prototype === "gradient-animation-loader" ? (
          <div className="relative flex h-full min-h-0 w-full max-w-6xl items-center justify-center">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden rounded-lg border border-border-base shadow-lg">
              <GradientAnimationLoaderEasel />
            </div>
          </div>
        ) : null}

        {prototype === "onboarding-nocturne" ? (
          <div className="relative flex h-full min-h-0 w-full max-w-5xl items-center justify-center">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden rounded-lg border border-border-base shadow-lg">
              <OnboardingNocturne />
            </div>
          </div>
        ) : null}

        {prototype === "onboarding-atelier" ? (
          <div className="relative flex h-full min-h-0 w-full max-w-5xl items-center justify-center">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden rounded-lg border border-border-base shadow-lg">
              <OnboardingAtelier />
            </div>
          </div>
        ) : null}

        {prototype === "onboarding-easel" ? (
          <div className="relative flex h-full min-h-0 w-full max-w-4xl items-center justify-center">
            <div className="relative z-20 flex h-full min-h-0 w-full max-w-4xl overflow-hidden rounded-lg border border-border-base shadow-lg">
              <EaselOnboarding />
            </div>
          </div>
        ) : null}

        {prototype === "question-tool-answered" ? (
          <div className="relative flex h-full min-h-0 w-full max-w-5xl items-center justify-center">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden rounded-lg border border-border-base shadow-lg">
              <QuestionToolAnsweredEasel />
            </div>
          </div>
        ) : null}

        {prototype === "inline-todo-redesigns" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <InlineTodoRedesignsEasel />
            </div>
          </div>
        ) : null}

        {prototype === "question-dock-redesigns" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <QuestionDockRedesignsEasel />
            </div>
          </div>
        ) : null}

        {prototype === "error-system-redesign" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <ErrorSystemRedesignEasel />
            </div>
          </div>
        ) : null}

        {prototype === "error-card-preview" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <ErrorCardPreviewEasel />
            </div>
          </div>
        ) : null}

        {prototype === "token-counter-meter" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <TokenCounterMeterEasel />
            </div>
          </div>
        ) : null}

        {prototype === "sidebar-alignment-redesign" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <SidebarAlignmentRedesignEasel />
            </div>
          </div>
        ) : null}

        {prototype === "object-row-language" ? (
          <div className="relative flex h-full min-h-0 w-full items-stretch justify-stretch">
            <div className="relative z-20 flex h-full min-h-0 w-full overflow-hidden">
              <ObjectRowLanguageEasel />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
