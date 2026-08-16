import { useEffect, useMemo, useRef, useState } from "react"
import { Badge, ChevronRightIcon, ToggleGroup, ToggleGroupItem, cn } from "@buddy/ui"
import { Loader2Icon, RefreshCwIcon } from "@/icons/app-icons"
import {
  formatChatGptPlan,
  formatRelativeTime,
  formatUsageWindowLabel,
} from "@/components/settings/settings-providers"
import type { OpenAIUsageSnapshot } from "@/state/openai-usage-query"

/**
 * Easel · Token counter meter
 *
 * The composer token counter (`SessionContextUsage`) currently opens a plain
 * three-row tooltip: Tokens Used / Context Usage / Session Cost. This prototype
 * turns it into a filled-meter surface and — when the session's provider is
 * ChatGPT — folds in the very same rate-limit windows we already render in
 * Settings › Providers, so the plan budget lives next to the context budget.
 *
 * Every value rendered here is bound to data we already have:
 *
 *   • Context + cost  ← `getSessionContextMetrics(messages, providers)`
 *       context.modelLabel / providerLabel / total / limit / usage, totalCost
 *   • Plan usage      ← `openAIUsageQueryOptions` → `OpenAIUsageSnapshot`
 *       status, plan, rateLimit.primary|secondary {usedPercent,resetsAt,windowSeconds}, fetchedAt
 *
 * Formatting reuses the exact production helpers (`formatUsageWindowLabel`,
 * `formatRelativeTime`, `formatChatGptPlan`) so the labels can't drift from
 * Settings. Nothing here is fabricated shape — only the sample values are.
 */

// ── Data contract (narrowed views of what production already computes) ───────

/** Subset of `SessionContextMetrics["context"]` the meter reads. */
type ContextSummary = {
  providerLabel: string
  modelLabel: string
  total: number
  limit?: number
  usage: number | null
}

type TokenCounterModel = {
  context: ContextSummary | undefined
  totalCost: number
  /** True when ChatGPT is connected — the plan section shows even before usage loads. */
  usageConnected: boolean
  /** OpenAI usage snapshot, or undefined while it is still loading. */
  usage: OpenAIUsageSnapshot | undefined
  usageLoading: boolean
}

/** Whether meters read as budget spent ("used") or budget left ("remaining"). */
type MeterFraming = "used" | "remaining"

// ── Meter primitives ─────────────────────────────────────────────────────────

type MeterTone = "normal" | "warning" | "critical" | "empty"

// The filled portion of a meter is a foreground *mark* carrying a status,
// so it draws from the icon (foreground) family — not the surface family,
// which is reserved for backgrounds and the track groove. Base reads as the
// interactive accent; it escalates to the system's real warning / critical
// colours as spend crosses the thresholds below.
const METER_FILL = {
  normal: "bg-icon-interactive-base",
  warning: "bg-icon-warning-base",
  critical: "bg-icon-critical-base",
  empty: "bg-transparent",
} satisfies Record<MeterTone, string>

const RING_ARC = {
  normal: "var(--icon-interactive-base)",
  warning: "var(--icon-warning-base)",
  critical: "var(--icon-critical-base)",
  empty: "var(--icon-weak-base)",
} satisfies Record<MeterTone, string>

function clampPercent(value: number) {
  return Math.max(0, Math.min(value, 100))
}

/** Risk tone is always derived from budget *spent*, regardless of framing. */
function meterTone(usedPercent: number): MeterTone {
  if (usedPercent >= 90) return "critical"
  if (usedPercent >= 75) return "warning"
  return "normal"
}

function MeterBar(props: { percent: number; tone: MeterTone }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-weak">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300",
          METER_FILL[props.tone],
        )}
        style={{ width: `${clampPercent(props.percent)}%` }}
      />
    </div>
  )
}

function Meter(props: {
  label: string
  /** Budget spent, 0–100, or null when the model exposes no limit. */
  usedPercent: number | null
  framing: MeterFraming
  caption?: string
}) {
  const known = props.usedPercent != null
  const used = known ? clampPercent(props.usedPercent as number) : 0
  const shown = props.framing === "remaining" ? 100 - used : used
  const tone: MeterTone = known ? meterTone(used) : "empty"

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium text-text-base">{props.label}</span>
        <span className="text-[11px] tabular-nums text-text-weak">
          {known ? `${Math.round(shown)}%` : "—"}
        </span>
      </div>
      <MeterBar percent={known ? shown : 0} tone={tone} />
      {props.caption ? (
        <span className="text-[10px] leading-tight text-text-weaker">{props.caption}</span>
      ) : null}
    </div>
  )
}

function ContextRing(props: { usage: number | null }) {
  const known = props.usage != null
  const usage = clampPercent(props.usage ?? 0)
  const arc = RING_ARC[known ? meterTone(usage) : "empty"]

  return (
    <span className="relative size-3.5 shrink-0">
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(${arc} ${usage * 3.6}deg, var(--surface-weak) ${usage * 3.6}deg 360deg)`,
        }}
      />
      <span className="absolute inset-[3px] rounded-full bg-background-base" />
    </span>
  )
}

// ── The popover ──────────────────────────────────────────────────────────────

function usdFormatter(amount: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount)
}

function TokenCounterPopover(props: {
  model: TokenCounterModel
  framing: MeterFraming
  refreshing?: boolean
  onRefresh?: () => void
}) {
  const { context, totalCost, usage, usageLoading } = props.model

  const readyUsage = usage?.status === "ready" ? usage : undefined
  const windows = readyUsage
    ? [readyUsage.rateLimit.primary, readyUsage.rateLimit.secondary].filter(
        (window): window is NonNullable<typeof window> => Boolean(window),
      )
    : []

  // The plan section shows whenever ChatGPT is connected — including before the
  // snapshot loads. Anthropic / other providers fall back to context + cost.
  const hasUsageSurface = props.model.usageConnected && usage?.status !== "not_connected"

  const contextCaption = context
    ? context.limit
      ? `${context.total.toLocaleString()} / ${context.limit.toLocaleString()} tokens`
      : `${context.total.toLocaleString()} tokens`
    : "No tokens used yet"

  return (
    <div className="composer-surface-menu composer-grain flex w-72 flex-col gap-3 rounded-xl p-3 text-text-base shadow-lg">
      {/* Header — model + provider, plan badge on the right when known */}
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[12px] font-medium text-text-strong">
          {context?.modelLabel ?? "No model yet"}
        </span>
        {readyUsage?.plan ? (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {formatChatGptPlan(readyUsage.plan)}
          </Badge>
        ) : null}
      </div>

      <div className="h-px bg-border-base/40" />

      {/* Context window — always shown */}
      <Meter
        label="Context window"
        usedPercent={context?.usage ?? null}
        framing={props.framing}
        caption={contextCaption}
      />

      {/* Plan usage limits — only for a connected ChatGPT session */}
      {hasUsageSurface ? (
        <>
          <div className="h-px bg-border-base/40" />
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-text-weaker">
                Plan usage limits
              </span>
              {usage?.status === "reconnect_required" ? null : (
                <button
                  type="button"
                  className="flex size-5 items-center justify-center rounded-md text-text-weaker transition-colors hover:bg-surface-base hover:text-text-base disabled:opacity-60"
                  aria-label="Refresh usage limits"
                  onClick={props.onRefresh}
                  disabled={props.refreshing}
                >
                  {props.refreshing ? (
                    <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <RefreshCwIcon className="size-3.5" aria-hidden />
                  )}
                </button>
              )}
            </div>

            {usageLoading && !readyUsage ? (
              <div className="flex items-center gap-2 text-[11px] text-text-weak">
                <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
                Loading usage limits…
              </div>
            ) : usage?.status === "error" ? (
              <p className="text-[11px] text-text-weak">
                Usage information is unavailable right now.
              </p>
            ) : usage?.status === "reconnect_required" ? (
              <p className="text-[11px] text-text-warning-base">
                Reconnect ChatGPT in settings to see limits.
              </p>
            ) : windows.length > 0 ? (
              windows.map((window) => (
                <Meter
                  key={`${window.windowSeconds}:${window.resetsAt}`}
                  label={formatUsageWindowLabel(window.windowSeconds)}
                  usedPercent={window.usedPercent}
                  framing={props.framing}
                  caption={`Resets ${formatRelativeTime(window.resetsAt)}`}
                />
              ))
            ) : null}

            {readyUsage ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-text-weaker">
                  Updated {formatRelativeTime(readyUsage.fetchedAt)}
                </span>
                <button
                  type="button"
                  className="flex items-center gap-0.5 text-[10px] text-text-weaker transition-colors hover:text-text-base"
                  aria-label="Open provider settings"
                >
                  Manage
                  <ChevronRightIcon className="size-3" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="h-px bg-border-base/40" />

      {/* Session cost — always shown, no meter */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-[11px] text-text-weak">Session cost</span>
        <span className="text-[12px] font-semibold tabular-nums text-text-strong">
          {usdFormatter(totalCost)}
        </span>
      </div>
    </div>
  )
}

// ── Sample data (only the numbers are synthetic; shapes are the real contract) ─

type ProviderChoice = "openai" | "anthropic"
type UsageState = "ready" | "loading" | "error" | "reconnect"
type LoadLevel = "light" | "typical" | "heavy"

const LOAD_PROFILES = {
  light: { context: 8, contextTotal: 16_000, primary: 18, secondary: 27, cost: 0.02 },
  typical: { context: 34, contextTotal: 68_000, primary: 52, secondary: 61, cost: 0.24 },
  heavy: { context: 82, contextTotal: 164_000, primary: 88, secondary: 94, cost: 1.42 },
} satisfies Record<
  LoadLevel,
  { context: number; contextTotal: number; primary: number; secondary: number; cost: number }
>

const CONTEXT_LIMIT = 200_000

function isoIn(ms: number) {
  return new Date(Date.now() + ms).toISOString()
}

function buildModel(
  provider: ProviderChoice,
  usageState: UsageState,
  load: LoadLevel,
  fetchedAt: string,
): TokenCounterModel {
  const profile = LOAD_PROFILES[load]

  const context: ContextSummary =
    provider === "openai"
      ? {
          providerLabel: "OpenAI",
          modelLabel: "GPT-5",
          total: profile.contextTotal,
          limit: CONTEXT_LIMIT,
          usage: profile.context,
        }
      : {
          providerLabel: "Anthropic",
          modelLabel: "Claude Opus 4.8",
          total: profile.contextTotal,
          limit: CONTEXT_LIMIT,
          usage: profile.context,
        }

  if (provider === "anthropic") {
    // No usage surface for non-ChatGPT sessions → context + cost only.
    return {
      context,
      totalCost: profile.cost,
      usageConnected: false,
      usage: undefined,
      usageLoading: false,
    }
  }

  if (usageState === "loading") {
    return {
      context,
      totalCost: profile.cost,
      usageConnected: true,
      usage: undefined,
      usageLoading: true,
    }
  }
  if (usageState === "error") {
    return {
      context,
      totalCost: profile.cost,
      usageConnected: true,
      usage: { status: "error" },
      usageLoading: false,
    }
  }
  if (usageState === "reconnect") {
    return {
      context,
      totalCost: profile.cost,
      usageConnected: true,
      usage: { status: "reconnect_required" },
      usageLoading: false,
    }
  }

  return {
    context,
    totalCost: profile.cost,
    usageConnected: true,
    usageLoading: false,
    usage: {
      status: "ready",
      plan: "pro",
      rateLimit: {
        primary: {
          usedPercent: profile.primary,
          resetsAt: isoIn(4 * 60 * 60 * 1000 + 19 * 60 * 1000),
          windowSeconds: 5 * 60 * 60,
        },
        secondary: {
          usedPercent: profile.secondary,
          resetsAt: isoIn(3 * 24 * 60 * 60 * 1000),
          windowSeconds: 7 * 24 * 60 * 60,
        },
      },
      additionalRateLimits: [],
      credits: null,
      fetchedAt,
    },
  }
}

// ── Faux composer footer, to place the popover where it really lives ─────────

function ComposerFooterMock(props: { ring: React.ReactNode }) {
  return (
    <div className="composer-surface-menu composer-grain flex w-full max-w-md items-center gap-2 rounded-xl px-2.5 py-2 shadow-lg">
      <span className="size-6 rounded-md bg-surface-weak" />
      <span className="h-5 w-24 rounded-md bg-surface-weaker" />
      <div className="flex-1" />
      {props.ring}
      <span className="size-7 rounded-lg bg-surface-interactive-base" />
    </div>
  )
}

// ── Easel wrapper ─────────────────────────────────────────────────────────────

const REFRESH_SIMULATION_MS = 700

export function TokenCounterMeterEasel() {
  const [provider, setProvider] = useState<ProviderChoice>("openai")
  const [usageState, setUsageState] = useState<UsageState>("ready")
  const [load, setLoad] = useState<LoadLevel>("typical")
  const [framing, setFraming] = useState<MeterFraming>("used")
  const [refreshing, setRefreshing] = useState(false)
  // `fetchedAt` drives the "Updated …" line; a refresh (or the 60s background
  // poll, in production) stamps it to now. Seeded slightly in the past.
  const [fetchedAt, setFetchedAt] = useState(() => new Date(Date.now() - 45 * 1000).toISOString())
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(refreshTimerRef.current), [])

  function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    refreshTimerRef.current = setTimeout(() => {
      setFetchedAt(new Date().toISOString())
      setRefreshing(false)
    }, REFRESH_SIMULATION_MS)
  }

  const model = useMemo(
    () => buildModel(provider, usageState, load, fetchedAt),
    [provider, usageState, load, fetchedAt],
  )

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-base">
      {/* Controls */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-weaker-base px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-text-weaker">
            Session
          </span>
          <ToggleGroup
            type="single"
            value={provider}
            variant="outline"
            size="sm"
            onValueChange={(value) => {
              if (value) setProvider(value as ProviderChoice)
            }}
          >
            <ToggleGroupItem value="openai" className="text-xs">
              ChatGPT
            </ToggleGroupItem>
            <ToggleGroupItem value="anthropic" className="text-xs">
              Anthropic
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {provider === "openai" ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-text-weaker">
              Usage
            </span>
            <ToggleGroup
              type="single"
              value={usageState}
              variant="outline"
              size="sm"
              onValueChange={(value) => {
                if (value) setUsageState(value as UsageState)
              }}
            >
              <ToggleGroupItem value="ready" className="text-xs">
                Ready
              </ToggleGroupItem>
              <ToggleGroupItem value="loading" className="text-xs">
                Loading
              </ToggleGroupItem>
              <ToggleGroupItem value="error" className="text-xs">
                Error
              </ToggleGroupItem>
              <ToggleGroupItem value="reconnect" className="text-xs">
                Reconnect
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        ) : null}

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-text-weaker">
            Load
          </span>
          <ToggleGroup
            type="single"
            value={load}
            variant="outline"
            size="sm"
            onValueChange={(value) => {
              if (value) setLoad(value as LoadLevel)
            }}
          >
            <ToggleGroupItem value="light" className="text-xs">
              Light
            </ToggleGroupItem>
            <ToggleGroupItem value="typical" className="text-xs">
              Typical
            </ToggleGroupItem>
            <ToggleGroupItem value="heavy" className="text-xs">
              Heavy
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-text-weaker">
            Bars
          </span>
          <ToggleGroup
            type="single"
            value={framing}
            variant="outline"
            size="sm"
            onValueChange={(value) => {
              if (value) setFraming(value as MeterFraming)
            }}
          >
            <ToggleGroupItem value="used" className="text-xs">
              Used
            </ToggleGroupItem>
            <ToggleGroupItem value="remaining" className="text-xs">
              Remaining
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Stage */}
      <div className="relative min-h-0 flex-1 overflow-y-auto bg-surface-inset-base">
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-end gap-3 px-4 py-6">
          <div className="flex flex-col items-end gap-2">
            <TokenCounterPopover
              model={model}
              framing={framing}
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
            <ComposerFooterMock ring={<ContextRing usage={model.context?.usage ?? null} />} />
          </div>
          <p className="max-w-sm pt-2 text-center text-[11px] leading-relaxed text-text-weaker">
            All three meters share one scale — accent below 75%, amber at 75%, red at 90% — so the
            same spend reads the same colour everywhere. Plan limits auto-refresh every 60s in
            production; the <span className="font-medium text-text-weak">Refresh</span> control
            forces it and stamps “Updated”. Rows appear only for a connected ChatGPT session.
          </p>
        </div>
      </div>
    </div>
  )
}
