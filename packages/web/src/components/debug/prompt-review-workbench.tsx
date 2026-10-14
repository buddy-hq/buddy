import { Fragment, useMemo, useRef, useState, type CSSProperties } from "react"
import { diffArrays } from "diff"
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToggleGroup,
  ToggleGroupItem,
  Z_INDEX,
  cn,
  toast,
} from "@buddy/ui"
import { CHAT_BODY_TEXT_STYLE } from "@/components/chat/chat-text-styles"
import { usePlatform } from "@/context/platform"
import { ArrowLeftIcon, ArrowRightIcon } from "@/icons/app-icons"
import { useDevToolsNavigation, type PromptViewMode } from "./devtools-navigation-store"
import { PROMPT_COMPARISONS, PROMPT_REVIEWS } from "./prompt-reviews"
import type { PromptReviewStatus, RegisteredPromptComparison } from "./prompt-reviews/model"

const UNCHANGED_PROMPT_TEXT_STYLE: CSSProperties = { color: "var(--text-weakest)" }
const CONTEXT_LINE_COUNT = 3

type AlignedPromptLine = {
  readonly id: number
  readonly before?: string
  readonly after?: string
  readonly changed: boolean
}

type PromptChangeArea = {
  readonly start: number
  readonly preview: string
}

type PromptDisplayRow =
  | { readonly kind: "line"; readonly line: AlignedPromptLine }
  | { readonly kind: "gap"; readonly start: number; readonly lines: readonly AlignedPromptLine[] }

function alignPromptLines(before: string, after: string): AlignedPromptLine[] {
  const lines: AlignedPromptLine[] = []
  let removed: string[] = []
  let added: string[] = []

  function append(beforeLine: string | undefined, afterLine: string | undefined, changed: boolean) {
    lines.push({
      id: lines.length,
      before: beforeLine,
      after: afterLine,
      changed,
    })
  }

  function flushChange() {
    const count = Math.max(removed.length, added.length)
    for (let index = 0; index < count; index++) {
      append(removed[index], added[index], true)
    }
    removed = []
    added = []
  }

  for (const change of diffArrays(before.split("\n"), after.split("\n"))) {
    if (change.removed) {
      removed.push(...change.value)
    } else if (change.added) {
      added.push(...change.value)
    } else {
      flushChange()
      for (const line of change.value) append(line, line, false)
    }
  }
  flushChange()
  return lines
}

function getChangeAreas(lines: readonly AlignedPromptLine[]): PromptChangeArea[] {
  const areas: PromptChangeArea[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!line?.changed || lines[index - 1]?.changed) continue

    let preview = "Changed lines"
    for (let end = index; lines[end]?.changed; end++) {
      const candidate = (lines[end]?.after ?? lines[end]?.before)?.trim().replace(/\s+/gu, " ")
      if (candidate) {
        preview = candidate.length > 72 ? `${candidate.slice(0, 69)}…` : candidate
        break
      }
    }
    areas.push({ start: index, preview })
  }
  return areas
}

function getDisplayRows(
  lines: readonly AlignedPromptLine[],
  mode: PromptViewMode,
): PromptDisplayRow[] {
  if (mode === "full") return lines.map((line) => ({ kind: "line", line }))
  if (mode === "changes") {
    return lines.filter((line) => line.changed).map((line) => ({ kind: "line", line }))
  }

  const visible = Array.from({ length: lines.length }, () => false)
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index]?.changed) continue
    const from = Math.max(0, index - CONTEXT_LINE_COUNT)
    const to = Math.min(lines.length - 1, index + CONTEXT_LINE_COUNT)
    for (let context = from; context <= to; context++) visible[context] = true
  }

  const rows: PromptDisplayRow[] = []
  for (let index = 0; index < lines.length; ) {
    if (visible[index]) {
      const line = lines[index]
      if (line) rows.push({ kind: "line", line })
      index++
      continue
    }

    const start = index
    while (index < lines.length && !visible[index]) index++
    rows.push({ kind: "gap", start, lines: lines.slice(start, index) })
  }
  return rows
}

function PromptLineCell(props: {
  line?: string
  changed: boolean
  side: "before" | "after"
}) {
  return (
    <div
      className={cn(
        "min-w-0 border-l-[3px] px-4 py-0.5",
        props.changed
          ? props.side === "before"
            ? "border-border-critical-base/60"
            : "border-border-success-base/60"
          : "border-transparent",
      )}
    >
      <span
        data-chat-typography
        className="block min-w-0 whitespace-pre-wrap break-words"
        style={props.changed ? CHAT_BODY_TEXT_STYLE : UNCHANGED_PROMPT_TEXT_STYLE}
      >
        {props.line === "" ? "\u00a0" : props.line}
      </span>
    </div>
  )
}

function PromptDiffRow(props: { line: AlignedPromptLine }) {
  const { line } = props
  return (
    <div
      data-prompt-row={line.id}
      className={cn(
        "grid scroll-mt-24 grid-cols-[500px_500px]",
        line.changed && "border-b border-border-weaker-base/40",
      )}
    >
      <div className="min-w-0 border-r border-border-base">
        <PromptLineCell line={line.before} changed={line.changed} side="before" />
      </div>
      <PromptLineCell line={line.after} changed={line.changed} side="after" />
    </div>
  )
}

function PromptComparison(props: { before: string; after: string }) {
  const { lines, changeAreas } = useMemo(() => {
    const aligned = alignPromptLines(props.before, props.after)
    return { lines: aligned, changeAreas: getChangeAreas(aligned) }
  }, [props.before, props.after])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeChange, setActiveChange] = useState(-1)
  const viewMode = useDevToolsNavigation((state) => state.promptViewMode)
  const setViewMode = useDevToolsNavigation((state) => state.setPromptViewMode)
  const [expandedGaps, setExpandedGaps] = useState<ReadonlySet<number>>(() => new Set())
  const displayRows = useMemo(() => getDisplayRows(lines, viewMode), [lines, viewMode])

  function jumpToChange(index: number) {
    const area = changeAreas[index]
    if (!area) return
    setActiveChange(index)
    const row = scrollRef.current?.querySelector(`[data-prompt-row='${area.start}']`)
    row?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

  function stepChange(direction: -1 | 1) {
    if (changeAreas.length === 0) return
    const current = activeChange < 0 && direction < 0 ? 0 : activeChange
    jumpToChange((current + direction + changeAreas.length) % changeAreas.length)
  }

  return (
    <div ref={scrollRef} className="border-b border-border-base">
      <div className="sticky top-0 z-10 bg-surface-raised-base">
        <div className="flex items-center justify-between gap-2 border-b border-border-weaker-base px-4 py-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={changeAreas.length === 0}>
                Changed areas · {changeAreas.length}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-96 max-w-[calc(100vw-2rem)]"
              style={{ zIndex: Z_INDEX.devtoolsFloating }}
            >
              <DropdownMenuGroup>
                {changeAreas.map((area, index) => (
                  <DropdownMenuItem
                    key={area.start}
                    onSelect={() => requestAnimationFrame(() => jumpToChange(index))}
                  >
                    <span className="shrink-0 tabular-nums text-text-weaker">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 truncate">{area.preview}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-1">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={viewMode}
              aria-label="Prompt context"
              onValueChange={(value) => {
                if (value === "changes" || value === "context" || value === "full") {
                  setViewMode(value)
                }
              }}
            >
              <ToggleGroupItem value="changes">Changes only</ToggleGroupItem>
              <ToggleGroupItem value="context">Context</ToggleGroupItem>
              <ToggleGroupItem value="full">Full prompt</ToggleGroupItem>
            </ToggleGroup>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Previous change"
              title="Previous change"
              disabled={changeAreas.length === 0}
              onClick={() => stepChange(-1)}
            >
              <ArrowLeftIcon aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Next change"
              title="Next change"
              disabled={changeAreas.length === 0}
              onClick={() => stepChange(1)}
            >
              <ArrowRightIcon aria-hidden />
            </Button>
          </div>
        </div>
      </div>
      <div>
        {displayRows.map((row) => {
          if (row.kind === "line") return <PromptDiffRow key={row.line.id} line={row.line} />
          const expanded = expandedGaps.has(row.start)
          return (
            <Fragment key={`gap-${row.start}`}>
              <div className="border-b border-border-weaker-base px-4 py-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  aria-expanded={expanded}
                  onClick={() => {
                    setExpandedGaps((current) => {
                      const next = new Set(current)
                      if (expanded) next.delete(row.start)
                      else next.add(row.start)
                      return next
                    })
                  }}
                >
                  {expanded ? "Hide" : "Show"} {row.lines.length} unchanged{" "}
                  {row.lines.length === 1 ? "line" : "lines"}
                </Button>
              </div>
              {expanded ? row.lines.map((line) => <PromptDiffRow key={line.id} line={line} />) : null}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function PromptComparisonSection(props: { entry: RegisteredPromptComparison }) {
  const { comparison, id } = props.entry
  const platform = usePlatform()
  const repositoryRoot = import.meta.env.VITE_BUDDY_DEV_REPOSITORY_ROOT ?? ""

  function openSource() {
    if (!comparison.sourcePath || !repositoryRoot || !platform.openPath) return
    const separator = platform.os === "windows" ? "\\" : "/"
    const sourcePath = comparison.sourcePath.replaceAll("/", separator)
    const absolutePath = `${repositoryRoot.replace(/[\\/]+$/u, "")}${separator}${sourcePath}`
    void platform.openPath(absolutePath).catch(() => toast.error("Could not open source file"))
  }

  return (
    <section
      aria-labelledby={id + "-title"}
      className="rounded-lg border border-border-base bg-background-base"
    >
      <header className="flex flex-col gap-1 rounded-t-lg border-b border-border-base bg-surface-raised-base px-4 py-3">
        <h2 id={id + "-title"} className="text-sm font-medium text-text-base">
          {comparison.title}
        </h2>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 break-words text-xs text-text-weak">{comparison.target}</p>
          {comparison.sourcePath && repositoryRoot && platform.openPath ? (
            <Button type="button" variant="outline" size="xs" onClick={openSource}>
              Open source
            </Button>
          ) : null}
        </div>
      </header>

      <div className="border-b border-border-base">
        <h3 className="border-b border-border-weaker-base bg-surface-raised-base px-4 py-2 text-xs font-medium text-text-weak">
          Why
        </h3>
        <p data-chat-typography className="px-4 py-3" style={CHAT_BODY_TEXT_STYLE}>
          {comparison.explanation}
        </p>
      </div>

      <div>
        <div className="w-[1000px]">
          <div className="border-b border-border-base">
            <h3 className="border-b border-border-weaker-base bg-surface-raised-base px-4 py-2 text-xs font-medium text-text-weak">
              Expected effects
            </h3>
            <ul
              data-chat-typography
              className="flex list-disc flex-col gap-1 py-4 pl-8 pr-4"
              style={CHAT_BODY_TEXT_STYLE}
            >
              {comparison.expectedEffects.map((effect) => (
                <li key={effect}>{effect}</li>
              ))}
            </ul>
          </div>
          <div className="border-b border-border-base">
            <div className="grid grid-cols-[500px_500px] border-b border-border-weaker-base bg-surface-raised-base">
              <h3 className="border-r border-border-base px-4 py-2 text-xs font-medium text-text-weak">
                Before, in effect
              </h3>
              <h3 className="px-4 py-2 text-xs font-medium text-text-weak">After, in effect</h3>
            </div>
            <div className="grid grid-cols-[500px_500px]">
              <div className="border-r border-border-base px-4 py-4">
                <ul
                  data-chat-typography
                  className="flex list-disc flex-col gap-1 pl-4"
                  style={CHAT_BODY_TEXT_STYLE}
                >
                  {comparison.beforeSummary.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
              <div className="px-4 py-4">
                <ul
                  data-chat-typography
                  className="flex list-disc flex-col gap-1 pl-4"
                  style={CHAT_BODY_TEXT_STYLE}
                >
                  {comparison.afterSummary.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <PromptComparison before={comparison.before} after={comparison.after} />
        </div>
      </div>
    </section>
  )
}

const PROMPT_REVIEW_STATUS_SUFFIX = {
  proposed: "",
  applied: " (applied)",
  historical: " (historical)",
} satisfies Record<PromptReviewStatus, string>

/** Render every registered prompt refactor through the same comparison UI. */
export function PromptReviewWorkbench() {
  const selectedComparisonID = useDevToolsNavigation((state) => state.promptComparisonID)
  const setPromptComparisonID = useDevToolsNavigation((state) => state.setPromptComparisonID)
  const mainScrollRef = useRef<HTMLDivElement>(null)
  const changeCounts = useMemo(
    () =>
      new Map(
        PROMPT_COMPARISONS.map((entry) => [
          entry.id,
          getChangeAreas(alignPromptLines(entry.comparison.before, entry.comparison.after)).length,
        ]),
      ),
    [],
  )
  const activeEntry =
    PROMPT_COMPARISONS.find((entry) => entry.id === selectedComparisonID) ?? PROMPT_COMPARISONS.at(-1)
  const activeReview = activeEntry?.review
  const activeComparisons = PROMPT_COMPARISONS.filter((entry) => entry.review.id === activeReview?.id)

  function selectComparison(id: string) {
    setPromptComparisonID(id)
    mainScrollRef.current?.scrollTo({ top: 0, left: 0 })
  }

  if (!activeEntry || !activeReview) return null

  return (
    <Tabs
      orientation="vertical"
      value={activeEntry.id}
      onValueChange={(value) => {
        if (PROMPT_COMPARISONS.some((entry) => entry.id === value)) selectComparison(value)
      }}
      className="h-full min-h-0 w-full gap-0 bg-background-base text-text-base"
    >
      <aside className="flex min-h-0 w-72 shrink-0 flex-col border-r border-border-base bg-surface-raised-base">
        <div className="border-b border-border-base p-2">
          <Select
            value={activeReview.id}
            onValueChange={(reviewID) => {
              const firstEntry = PROMPT_COMPARISONS.find((entry) => entry.review.id === reviewID)
              if (firstEntry) selectComparison(firstEntry.id)
            }}
          >
            <SelectTrigger aria-label="Prompt proposal" className="w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={{ zIndex: Z_INDEX.devtoolsFloating }} position="popper">
              {PROMPT_REVIEWS.toReversed().map((review) => (
                <SelectItem key={review.id} value={review.id} className="text-sm">
                  {review.label} · {review.title}
                  {PROMPT_REVIEW_STATUS_SUFFIX[review.status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <TabsList
          aria-label={`${activeReview.label} files`}
          className="min-h-0 w-full flex-col items-stretch justify-start gap-1 overflow-y-auto rounded-none p-2"
        >
          {activeComparisons.map(({ id, comparison }) => (
            <TabsTrigger
              key={id}
              value={id}
              className="h-auto min-h-0 w-full flex-none whitespace-normal rounded-md px-3 py-3 text-left"
            >
              <span className="flex min-w-0 w-full flex-col items-start gap-1">
                <span className="flex w-full min-w-0 items-start justify-between gap-2">
                  <span className="min-w-0 text-sm leading-5">{comparison.title}</span>
                  <Badge
                    variant="outline"
                    className="shrink-0 tabular-nums"
                    aria-label={`${changeCounts.get(id) ?? 0} changed areas`}
                  >
                    {changeCounts.get(id) ?? 0}
                  </Badge>
                </span>
                <span className="text-xs font-normal text-text-weaker">
                  {comparison.target.split("/").at(-1)}
                </span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </aside>

      <div ref={mainScrollRef} data-chat-typography className="min-h-0 min-w-0 flex-1 overflow-auto">
        {activeEntry ? (
          <div className="mx-auto flex w-[1002px] flex-col gap-6 py-6">
            <header className="flex flex-col gap-2 px-4">
              <p className="text-xs text-text-weaker">{activeEntry.review.label}</p>
              <h1 className="text-lg font-medium text-text-base">{activeEntry.review.title}</h1>
              <p data-chat-typography style={CHAT_BODY_TEXT_STYLE}>
                {activeEntry.review.summary}
              </p>
              <p className="text-xs text-text-weaker">{activeEntry.review.note}</p>
            </header>

            {activeComparisons.map((entry) => (
              <TabsContent key={entry.id} value={entry.id} className="mt-0 min-w-0">
                <PromptComparisonSection entry={entry} />
              </TabsContent>
            ))}
          </div>
        ) : (
          <p className="p-6 text-sm text-text-weak">No prompt reviews.</p>
        )}
      </div>
    </Tabs>
  )
}
