import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge, buttonVariants, cn } from "@buddy/ui"
import { Popover, PopoverContent, PopoverTrigger } from "@buddy/ui/components/ui/popover"
import { Loader2Icon, RefreshCwIcon } from "@/icons/app-icons"
import { language } from "@/context/language"
import { getSessionContextMetrics } from "@/state/context-metrics"
import {
  formatChatGptPlan,
  formatCompactTokens,
  formatRelativeTime,
  formatUsageWindowLabel,
} from "@/state/openai-usage-format"
import { openAIUsageQueryOptions, refreshOpenAIUsage } from "@/state/openai-usage-query"
import { OPENAI_PROVIDER_ID } from "@/lib/provider-ids"
import type { MessageWithParts, ProviderInfo } from "@/state/chat-types"

type SessionContextUsageProps = {
  messages: MessageWithParts[]
  providers: ProviderInfo[]
  /**
   * The model currently selected in the composer — what the next turn will run
   * on. The header, plan limits, and context window all follow this so they
   * update the moment the model is switched, rather than lagging on the last
   * assistant turn. Token usage still reflects the actual conversation.
   */
  selectedModel?: {
    name: string
    providerID: string
    contextLimit?: number
  }
}

// The filled portion of a meter is a foreground *mark* carrying a status, so it
// draws from the icon (foreground) family — the surface family is reserved for
// backgrounds and the track groove. Base reads as the interactive accent and
// escalates to the system's real warning / critical colours across the same
// thresholds for every meter, so equal spend reads the same colour everywhere.
type MeterTone = "normal" | "warning" | "critical" | "empty"

const METER_FILL: Record<MeterTone, string> = {
  normal: "bg-icon-interactive-base",
  warning: "bg-icon-warning-base",
  critical: "bg-icon-critical-base",
  empty: "bg-transparent",
}

const RING_ARC: Record<MeterTone, string> = {
  normal: "var(--icon-interactive-base)",
  warning: "var(--icon-warning-base)",
  critical: "var(--icon-critical-base)",
  empty: "var(--icon-weak-base)",
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(value, 100))
}

/** Risk tone is always derived from budget *spent*, regardless of display. */
function meterTone(usedPercent: number): MeterTone {
  if (usedPercent >= 90) return "critical"
  if (usedPercent >= 75) return "warning"
  return "normal"
}

function MeterBar(props: { percent: number; tone: MeterTone }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-weak">
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", METER_FILL[props.tone])}
        style={{ width: `${clampPercent(props.percent)}%` }}
      />
    </div>
  )
}

function Meter(props: { label: string; usedPercent: number | null; caption?: string }) {
  const known = props.usedPercent != null
  const used = known ? clampPercent(props.usedPercent as number) : 0
  const tone: MeterTone = known ? meterTone(used) : "empty"

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium text-text-base">{props.label}</span>
        <span className="text-[11px] tabular-nums text-text-weak">
          {known
            ? language.t("chat.sessionContextUsage.percentUsed", { percent: Math.round(used) })
            : "—"}
        </span>
      </div>
      <MeterBar percent={used} tone={tone} />
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

export function SessionContextUsage(props: SessionContextUsageProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const queryClient = useQueryClient()

  const metrics = useMemo(
    () => getSessionContextMetrics(props.messages, props.providers),
    [props.messages, props.providers],
  )

  const context = metrics.context

  // Everything about "which model" follows the composer's current selection, so
  // switching models updates the popover immediately. Token usage stays the
  // last turn's actual count — that's the real conversation size — but it's
  // measured against the selected model's window.
  const selectedModel = props.selectedModel
  const modelLabel = selectedModel?.name ?? context?.modelLabel
  const currentProviderID = selectedModel?.providerID ?? context?.message.providerID
  const tokensUsed = context?.total ?? 0
  const contextLimit = selectedModel?.contextLimit ?? context?.limit
  const contextPercent =
    contextLimit && contextLimit > 0 ? Math.round((tokensUsed / contextLimit) * 100) : null

  // Surface ChatGPT's plan limits only when the selected model is an OpenAI
  // model — not merely because the provider is connected. A DeepSeek selection
  // must never borrow ChatGPT's budget (the usage query is a shared cache
  // settings also fills).
  const currentProviderIsOpenAI = currentProviderID === OPENAI_PROVIDER_ID
  const usageQuery = useQuery(openAIUsageQueryOptions(currentProviderIsOpenAI))
  const usage = usageQuery.data
  const usageLoading = usageQuery.isPending
  const cost = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(metrics.totalCost)

  const readyUsage = usage?.status === "ready" ? usage : undefined
  const windows = readyUsage
    ? [readyUsage.rateLimit.primary, readyUsage.rateLimit.secondary].filter(
        (window): window is NonNullable<typeof window> => Boolean(window),
      )
    : []
  const showPlanSection = currentProviderIsOpenAI && usage?.status !== "not_connected"

  const contextCaption = contextLimit
    ? language.t("chat.sessionContextUsage.tokensOfLimit", {
        used: formatCompactTokens(tokensUsed),
        limit: formatCompactTokens(contextLimit),
      })
    : tokensUsed > 0
      ? language.t("chat.sessionContextUsage.tokensCaption", {
          used: formatCompactTokens(tokensUsed),
        })
      : language.t("chat.sessionContextUsage.noTokens")

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await refreshOpenAIUsage(queryClient)
    } catch {
      // The snapshot surfaces its own error state on the next read; nothing to do here.
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={language.t("chat.sessionContextUsage.ariaLabel")}
          className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }), "text-text-weak")}
        >
          <ContextRing usage={contextPercent} />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="composer-surface-menu composer-grain w-72 gap-3 p-3"
      >
        {/* Header — selected model, plan badge when known */}
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-[12px] font-medium text-text-strong">
            {modelLabel ?? language.t("chat.sessionContextUsage.noModel")}
          </span>
          {showPlanSection && readyUsage?.plan ? (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {formatChatGptPlan(readyUsage.plan)}
            </Badge>
          ) : null}
        </div>

        <div className="h-px bg-border-base/40" />

        {/* Context window — always shown */}
        <Meter
          label={language.t("chat.sessionContextUsage.contextWindow")}
          usedPercent={contextPercent}
          caption={contextCaption}
        />

        {/* Plan usage limits — only when ChatGPT is connected */}
        {showPlanSection ? (
          <>
            <div className="h-px bg-border-base/40" />
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-text-weaker">
                  {language.t("chat.sessionContextUsage.planUsageLimits")}
                </span>
                {usage?.status === "reconnect_required" ? null : (
                  <button
                    type="button"
                    className="flex size-5 items-center justify-center rounded-md text-text-weaker transition-colors hover:bg-surface-base hover:text-text-base disabled:opacity-60"
                    aria-label={language.t("chat.sessionContextUsage.refreshLimits")}
                    onClick={() => void handleRefresh()}
                    disabled={refreshing}
                  >
                    {refreshing ? (
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
                  {language.t("chat.sessionContextUsage.loadingLimits")}
                </div>
              ) : usage?.status === "error" ? (
                <p className="text-[11px] text-text-weak">
                  {language.t("chat.sessionContextUsage.limitsUnavailable")}
                </p>
              ) : usage?.status === "reconnect_required" ? (
                <p className="text-[11px] text-text-warning-base">
                  {language.t("chat.sessionContextUsage.reconnect")}
                </p>
              ) : windows.length > 0 ? (
                windows.map((window) => (
                  <Meter
                    key={`${window.windowSeconds}:${window.resetsAt}`}
                    label={formatUsageWindowLabel(window.windowSeconds)}
                    usedPercent={window.usedPercent}
                    caption={language.t("chat.sessionContextUsage.resets", {
                      time: formatRelativeTime(window.resetsAt),
                    })}
                  />
                ))
              ) : null}

              {readyUsage ? (
                <span className="text-[10px] text-text-weaker">
                  {language.t("chat.sessionContextUsage.updated", {
                    time: formatRelativeTime(readyUsage.fetchedAt),
                  })}
                </span>
              ) : null}
            </div>
          </>
        ) : null}

        <div className="h-px bg-border-base/40" />

        {/* Session cost — always shown */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-[11px] text-text-weak">
            {language.t("chat.sessionContextUsage.sessionCost")}
          </span>
          <span className="text-[12px] font-semibold tabular-nums text-text-strong">{cost}</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
