import { useMemo } from "react"
import { Tooltip, TooltipContent, TooltipTrigger, buttonVariants, cn } from "@buddy/ui"
import { language } from "@/context/language"
import { getSessionContextMetrics } from "@/state/context-metrics"
import type { MessageWithParts, ProviderInfo } from "@/state/chat-types"

type SessionContextUsageProps = {
  messages: MessageWithParts[]
  providers: ProviderInfo[]
}

export function SessionContextUsage(props: SessionContextUsageProps) {
  const metrics = useMemo(
    () => getSessionContextMetrics(props.messages, props.providers),
    [props.messages, props.providers],
  )

  const context = metrics.context
  const usage = Math.max(0, Math.min(context?.usage ?? 0, 100))
  const color = "var(--text-base)"
  const cost = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(metrics.totalCost)

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={language.t("chat.sessionContextUsage.ariaLabel")}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }), "text-text-weak")}
      >
        <span className="relative size-4">
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(${color} ${usage * 3.6}deg, color-mix(in oklab, var(--text-weak) 28%, transparent) ${usage * 3.6}deg 360deg)`,
            }}
          />
          <span className="absolute inset-[3px] rounded-full bg-background-base" />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="flex min-w-32 flex-col gap-1.5 p-2.5 text-[11px]"
      >
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-weak">
            {language.t("chat.sessionContextUsage.tokensUsed")}
          </span>
          <span className="font-medium text-text-strong">
            {context ? context.total.toLocaleString() : "0"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-weak">
            {language.t("chat.sessionContextUsage.contextUsage")}
          </span>
          <span className="font-medium text-text-strong">{context?.usage ?? 0}%</span>
        </div>
        <div className="my-0.5 h-px bg-border-base/40" />
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-weak">
            {language.t("chat.sessionContextUsage.sessionCost")}
          </span>
          <span className="font-semibold text-text-strong">{cost}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
