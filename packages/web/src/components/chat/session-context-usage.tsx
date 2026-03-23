import { useMemo } from "react"
import { Tooltip, TooltipContent, TooltipTrigger, buttonVariants, cn } from "@buddy/ui"
import { getSessionContextMetrics } from "@/state/context-metrics"
import type { MessageWithParts, ProviderInfo } from "@/state/chat-types"

type SessionContextUsageProps = {
  messages: MessageWithParts[]
  providers: ProviderInfo[]
}

function usageColor(usage: number) {
  if (usage >= 90) return "var(--destructive)"
  if (usage >= 70) return "var(--warning)"
  return "var(--success)"
}

export function SessionContextUsage(props: SessionContextUsageProps) {
  const metrics = useMemo(
    () => getSessionContextMetrics(props.messages, props.providers),
    [props.messages, props.providers],
  )

  const context = metrics.context
  const usage = Math.max(0, Math.min(context?.usage ?? 0, 100))
  const color = usageColor(usage)
  const cost = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(metrics.totalCost)

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label="Session context usage"
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-xs" }),
          "text-muted-foreground",
        )}
      >
        <span className="relative size-4">
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(${color} ${usage * 3.6}deg, color-mix(in oklab, var(--muted-foreground) 28%, transparent) ${usage * 3.6}deg 360deg)`,
            }}
          />
          <span className="absolute inset-[3px] rounded-full bg-background" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="px-2 py-1 text-[11px]">
        {context ? (
          <div>{context.total.toLocaleString()} tokens</div>
        ) : (
          <div>No token usage yet</div>
        )}
        <div>{context?.usage ?? 0}% usage</div>
        <div>{cost} cost</div>
      </TooltipContent>
    </Tooltip>
  )
}
