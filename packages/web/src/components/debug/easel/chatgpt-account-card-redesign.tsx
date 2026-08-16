import { useState, type ReactNode } from "react"
import { Badge, Button, cn } from "@buddy/ui"
import { RefreshCwIcon } from "@/icons/app-icons"
import { ProviderIcon } from "@/components/provider-icon"
import { OPENAI_PROVIDER_ID } from "@/lib/provider-ids"

/**
 * Easel · Connected ChatGPT account card
 *
 * Direction A, refined. The hierarchy is the composer's plan-usage popover
 * (`session-context-usage.tsx`) — block label, row, rail, caption, stamp —
 * and it stays; what changes here is how that block sits in a card five times
 * the popover's width.
 *
 * The imbalance being fixed: the header ran edge to edge while the limits
 * block was capped at the popover's own 280px, so everything under "Edit
 * connection" was dead space and the card had a ragged right edge. Capping was
 * the wrong instinct — a wide rail is not a problem to solve, it is a longer
 * ruler for the same reading.
 *
 * So the card is built on two rails and every row spans between them:
 *
 *   ChatGPT Plus  ─────────────────────────────  Edit connection
 *   ══════════════════════════════════════════════════════════
 *   PLAN USAGE LIMITS  ──────────  Updated 1 minute ago  ·  ⟳
 *   7-day limit  ────────────────────────────────────────  1% used
 *   ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
 *   Resets in 6 days
 *
 * Two consequences worth naming:
 *
 *   · the stamp moves up onto the block-label row. It is block-level metadata,
 *     the same as the refresh icon it now sits beside — and pairing them ends
 *     the orphan line that used to hang under the rail with nothing across
 *     from it. In a 288px popover there is no room for that; in 600px the row
 *     was otherwise empty. Per-window facts stay in the window's own rows, so
 *     this holds identically for one limit or two.
 *   · the block starts at the card's padding, not at the name's rail. The rule
 *     is what licenses that: it closes the header — where the mark owns a
 *     gutter — and opens a full-width zone belonging to the card itself.
 *
 * The mark, the plan-as-name, the icon-only refresh, spend-filled rails on the
 * composer's 75/90 thresholds, and the absence of the model count all carry
 * over from the previous pass unchanged.
 *
 * On adoption the meter should be extracted so this card and the composer
 * popover share one component; it is duplicated here to keep the easel
 * standalone.
 */

// ── Domain ────────────────────────────────────────────────────────────────

type UsageWindow = {
  /** Shipped `formatUsageWindowLabel` output. */
  label: string
  usedPercent: number
  /** Shipped `formatRelativeTime` output. */
  resets: string
}

type AccountData = {
  /** Absent on accounts with no paid plan; the name then stands alone. */
  plan?: string
  windows: UsageWindow[]
  updated: string
  reconnectRequired?: boolean
}

const LABEL = {
  provider: "ChatGPT",
  planUsageLimits: "Plan usage limits",
  edit: "Edit connection",
  reconnect: "Reconnect",
  reconnectHint: "Reconnect to see limits.",
  unavailable: "Usage information is unavailable right now.",
  refresh: "Refresh usage limits",
  used: (percent: number) => `${percent}% used`,
  resets: (time: string) => `Resets ${time}`,
  updated: (time: string) => `Updated ${time}`,
} as const

function accountName(data: AccountData) {
  return data.plan ? `${LABEL.provider} ${data.plan}` : LABEL.provider
}

// ── Meter ─────────────────────────────────────────────────────────────────

/**
 * From the composer popover, unchanged in substance: the fill is a foreground
 * mark carrying a status, so it comes from the icon family, and the track from
 * the surface family.
 */
type MeterTone = "normal" | "warning" | "critical"

const METER_FILL = {
  normal: "bg-icon-interactive-base",
  warning: "bg-icon-warning-base",
  critical: "bg-icon-critical-base",
} satisfies Record<MeterTone, string>

const WARNING_USED_PERCENT = 75
const CRITICAL_USED_PERCENT = 90

/** At 600px wide, 1% is 6px of fill — but a fraction of a percent would round
 *  away to nothing. Any spend at all is worth a visible tick. */
const MINIMUM_FILL = "3px"

function meterTone(usedPercent: number): MeterTone {
  if (usedPercent >= CRITICAL_USED_PERCENT) return "critical"
  if (usedPercent >= WARNING_USED_PERCENT) return "warning"
  return "normal"
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(value, 100))
}

/**
 * Three lines, full width, justified to the card's rails. The label is the
 * only thing set in medium — it is what you scan down when there are two
 * windows; the number is a reading, so it is weak and tabular.
 */
function UsageMeter(props: { window: UsageWindow }) {
  const used = clampPercent(props.window.usedPercent)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-text-base text-xs font-medium">{props.window.label}</span>
        <span className="text-text-weak text-xs tabular-nums">{LABEL.used(Math.round(used))}</span>
      </div>
      <div className="bg-surface-weak h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full", METER_FILL[meterTone(used)])}
          style={{ width: `${used}%`, minWidth: used > 0 ? MINIMUM_FILL : undefined }}
        />
      </div>
      <span className="text-text-weaker text-[11px] leading-tight">
        {LABEL.resets(props.window.resets)}
      </span>
    </div>
  )
}

// ── Parts ─────────────────────────────────────────────────────────────────

/** No status ring. The card sits under a "Connected" heading; a green border
 *  around the mark was the third place saying so. */
function AccountMark() {
  return (
    <span className="border-border-weak-base bg-background-base flex size-9 shrink-0 items-center justify-center rounded-xl border">
      <ProviderIcon id={OPENAI_PROVIDER_ID} className="size-4" />
    </span>
  )
}

/** Icon only, sized and toned as in the popover — refreshing is a repair
 *  action, so it never takes a label or a button box. */
function RefreshButton() {
  return (
    <button
      type="button"
      aria-label={LABEL.refresh}
      className="text-text-weaker hover:bg-surface-base hover:text-text-base flex size-5 shrink-0 items-center justify-center rounded-md transition-colors"
    >
      <RefreshCwIcon className="size-3.5" aria-hidden />
    </button>
  )
}

function PrimaryAction(props: { data: AccountData }) {
  if (props.data.reconnectRequired) {
    return (
      <Button type="button" size="sm" className="shrink-0">
        {LABEL.reconnect}
      </Button>
    )
  }

  return (
    <Button type="button" size="sm" variant="secondary" className="shrink-0">
      {LABEL.edit}
    </Button>
  )
}

/**
 * Block-level metadata, right rail: when it was last read, and how to read it
 * again. The stamp is text and stays text — it is a reading, not a verb — but
 * it lives next to the verb it describes.
 */
function BlockMeta(props: { data: AccountData; hasWindows: boolean }) {
  if (props.data.reconnectRequired) return null

  return (
    <div className="flex shrink-0 items-center gap-2">
      {props.hasWindows ? (
        <span className="text-text-weaker text-[11px]">{LABEL.updated(props.data.updated)}</span>
      ) : null}
      <RefreshButton />
    </div>
  )
}

/**
 * Everything that is not a set of meters, in one line. The card has no numbers
 * to show in either case, and the popover's convention — a short line in place
 * of the meters — is the whole treatment.
 */
function UsageFallback(props: { data: AccountData }) {
  if (props.data.reconnectRequired) {
    return <p className="text-text-warning-base text-xs">{LABEL.reconnectHint}</p>
  }
  return <p className="text-text-weak text-xs">{LABEL.unavailable}</p>
}

function CardShell(props: { children: ReactNode }) {
  return (
    <section
      aria-label={LABEL.provider}
      className="border-border-base/50 bg-surface-raised-base relative w-full overflow-hidden rounded-2xl border p-5 shadow-xs"
    >
      {props.children}
    </section>
  )
}

// ── The card ──────────────────────────────────────────────────────────────

function AccountCard(props: { data: AccountData }) {
  const hasWindows = props.data.windows.length > 0 && !props.data.reconnectRequired

  return (
    <CardShell>
      <div className="flex items-center gap-3">
        <AccountMark />
        <p className="text-text-strong min-w-0 flex-1 truncate text-[13px] font-medium">
          {accountName(props.data)}
        </p>
        <PrimaryAction data={props.data} />
      </div>

      {/* Closes the header — where the mark owns a gutter — and opens a
          full-width zone that belongs to the card rather than to the name. */}
      <div className="bg-border-base/40 my-4 h-px" />

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-weaker text-[11px] font-medium tracking-wide uppercase">
            {LABEL.planUsageLimits}
          </span>
          <BlockMeta data={props.data} hasWindows={hasWindows} />
        </div>

        {hasWindows ? (
          props.data.windows.map((window) => <UsageMeter key={window.label} window={window} />)
        ) : (
          <UsageFallback data={props.data} />
        )}
      </div>
    </CardShell>
  )
}

// ── Shipped, for reference ────────────────────────────────────────────────

/** Today's card, rebuilt from `settings-providers.tsx` so the comparison is
 *  against the real thing rather than a memory of it. */
function ShippedCard(props: { data: AccountData }) {
  return (
    <CardShell>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="border-border-success-base bg-surface-success-base/10 flex size-10 shrink-0 items-center justify-center rounded-xl border">
              <ProviderIcon id={OPENAI_PROVIDER_ID} className="text-text-success-base size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-text-base text-sm font-medium">{LABEL.provider}</p>
                <Badge variant="outline">
                  {LABEL.provider} {props.data.plan ?? "Connected"}
                </Badge>
              </div>
              <p className="text-text-weak text-xs">6 models available for this account</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" size="sm" variant="ghost">
              <RefreshCwIcon data-icon="inline-start" />
              Refresh
            </Button>
            <Button type="button" size="sm" variant="secondary">
              {LABEL.edit}
            </Button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {props.data.windows.map((window) => (
            <div
              key={window.label}
              className="border-border-base/60 bg-background-base flex min-w-0 flex-col gap-2 rounded-xl border px-3 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-base text-xs font-medium">{window.label}</span>
                <span className="text-text-weak text-xs">
                  {100 - Math.round(window.usedPercent)}% remaining
                </span>
              </div>
              <div className="bg-surface-weak h-1 w-full overflow-hidden rounded-full">
                <div
                  className="bg-surface-interactive-base h-full rounded-full"
                  style={{ width: `${100 - clampPercent(window.usedPercent)}%` }}
                />
              </div>
              <span className="text-text-weaker text-[11px]">{LABEL.resets(window.resets)}</span>
            </div>
          ))}
        </div>
        <p className="text-text-weaker text-[11px]">{LABEL.updated(props.data.updated)}</p>
      </div>
    </CardShell>
  )
}

// ── Easel harness ─────────────────────────────────────────────────────────

const STATES = ["plus", "two-limits", "running-low", "no-plan", "reconnect"] as const
type StateID = (typeof STATES)[number]

const STATE_LABEL = {
  plus: "Plus · 1 limit",
  "two-limits": "Plus · 2 limits",
  "running-low": "Running low",
  "no-plan": "No plan",
  reconnect: "Reconnect",
} satisfies Record<StateID, string>

const STATE_DATA = {
  plus: {
    plan: "Plus",
    updated: "1 minute ago",
    windows: [{ label: "7-day limit", usedPercent: 1, resets: "in 6 days" }],
  },
  "two-limits": {
    plan: "Plus",
    updated: "2 minutes ago",
    windows: [
      { label: "5-hour limit", usedPercent: 58, resets: "in 3 hours" },
      { label: "7-day limit", usedPercent: 12, resets: "in 6 days" },
    ],
  },
  "running-low": {
    plan: "Pro",
    updated: "just now",
    windows: [
      { label: "5-hour limit", usedPercent: 93, resets: "in 2 hours" },
      { label: "7-day limit", usedPercent: 78, resets: "in 4 days" },
    ],
  },
  "no-plan": {
    updated: "12 minutes ago",
    windows: [],
  },
  reconnect: {
    plan: "Plus",
    updated: "an hour ago",
    reconnectRequired: true,
    windows: [],
  },
} satisfies Record<StateID, AccountData>

const MODES = ["card", "compare"] as const
type Mode = (typeof MODES)[number]

const MODE_LABEL = {
  card: "Card",
  compare: "vs shipped",
} satisfies Record<Mode, string>

function SegmentedControl<Value extends string>(props: {
  value: Value
  options: readonly Value[]
  labels: Record<Value, string>
  onChange: (value: Value) => void
}) {
  return (
    <div className="bg-surface-inset-strong flex items-center gap-0.5 rounded-lg p-0.5">
      {props.options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => props.onChange(option)}
          className={cn(
            "h-6 rounded-md px-2 text-[11px] font-medium transition-colors",
            props.value === option
              ? "bg-surface-raised-base text-text-strong shadow-xs"
              : "text-text-weak hover:text-text-base",
          )}
        >
          {props.labels[option]}
        </button>
      ))}
    </div>
  )
}

/** The card never appears alone — it sits under the Connected heading, which
 *  is half the reason the old badge was redundant. */
function SectionStage(props: { children: ReactNode }) {
  return (
    <div className="bg-background-base/60 flex w-full flex-col gap-3 rounded-xl p-8">
      <h3 className="text-text-base text-sm font-medium">Connected</h3>
      {props.children}
    </div>
  )
}

export function ChatGptAccountCardRedesignEasel() {
  const [mode, setMode] = useState<Mode>("card")
  const [state, setState] = useState<StateID>("plus")
  const data = STATE_DATA[state]

  return (
    <div className="bg-surface-inset-base flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="border-border-weaker-base flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <p className="text-text-base shrink-0 text-xs font-medium">Connected account · ChatGPT</p>
          <SegmentedControl value={mode} options={MODES} labels={MODE_LABEL} onChange={setMode} />
          <SegmentedControl
            value={state}
            options={STATES}
            labels={STATE_LABEL}
            onChange={setState}
          />
        </div>
        <Badge variant="outline">Easel</Badge>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-6 py-6">
          <p className="text-text-weaker text-[11px] leading-relaxed">
            Two rails, every row spanning between them — the block no longer stops a third of the
            way across, and the stamp pairs with the refresh it describes
          </p>

          <SectionStage>
            <AccountCard data={data} />
          </SectionStage>

          {mode === "compare" ? (
            <div className="flex flex-col gap-2">
              <p className="text-text-weaker px-0.5 text-[11px] font-medium">
                Shipped today · for reference
              </p>
              <SectionStage>
                <ShippedCard data={data} />
              </SectionStage>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
