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
import {
  USAGE_METER_RING_ARC,
  UsageMeter,
  clampUsagePercent,
  resolveUsageMeterTone,
} from "@/components/usage/usage-meter"
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

function ContextRing(props: { usage: number | null }) {
  const known = props.usage != null
  const usage = clampUsagePercent(props.usage ?? 0)
  const arc = USAGE_METER_RING_ARC[known ? resolveUsageMeterTone(usage) : "empty"]

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
        <UsageMeter
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
                  {language.t("usage.planUsageLimits")}
                </span>
                {usage?.status === "reconnect_required" ? null : (
                  <button
                    type="button"
                    className="flex size-5 items-center justify-center rounded-md text-text-weaker transition-colors hover:bg-surface-base hover:text-text-base disabled:opacity-60"
                    aria-label={language.t("usage.refreshLimits")}
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
                  {language.t("usage.loadingLimits")}
                </div>
              ) : usage?.status === "error" ? (
                <p className="text-[11px] text-text-weak">{language.t("usage.unavailable")}</p>
              ) : usage?.status === "reconnect_required" ? (
                <p className="text-[11px] text-text-warning-base">
                  {language.t("chat.sessionContextUsage.reconnect")}
                </p>
              ) : windows.length > 0 ? (
                windows.map((window) => (
                  <UsageMeter
                    key={`${window.windowSeconds}:${window.resetsAt}`}
                    label={formatUsageWindowLabel(window.windowSeconds)}
                    usedPercent={window.usedPercent}
                    caption={language.t("usage.resets", {
                      time: formatRelativeTime(window.resetsAt),
                    })}
                  />
                ))
              ) : null}

              {readyUsage ? (
                <span className="text-[10px] text-text-weaker">
                  {language.t("usage.updated", {
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
