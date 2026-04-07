import type { ReactNode } from "react"
import { Badge, Card, CardContent, Separator, cn } from "@buddy/ui"
import type { ProviderInfo } from "@/state/chat-types"

const PROVIDER_SOURCE_LABELS: Record<string, string> = {
  env: "Environment",
  api: "API key",
  custom: "Custom",
}

export function SettingsContent(props: {
  title?: string
  description?: string
  children: ReactNode
  fillHeight?: boolean
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {props.title && (
        <div className="shrink-0 border-b border-border-base/60 px-5 py-5">
          <h2 className="text-base font-medium text-text-base">{props.title}</h2>
          {props.description && <p className="mt-1 text-sm text-text-weak">{props.description}</p>}
        </div>
      )}
      <div
        className={cn(
          "min-h-0 flex-1 px-5 py-5",
          props.fillHeight ? "overflow-hidden" : "overflow-x-hidden overflow-y-auto",
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-3xl flex-col gap-6",
            props.fillHeight ? "h-full min-h-0" : "min-h-full",
          )}
        >
          {props.children}
        </div>
      </div>
    </div>
  )
}

export function SettingsListCard(props: { children: ReactNode }) {
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="px-0">{props.children}</CardContent>
    </Card>
  )
}

export function SettingsRow(props: {
  title: ReactNode
  description: string
  control: ReactNode
  last?: boolean
}) {
  return (
    <>
      <div className="px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-base">{props.title}</p>
            <p className="mt-1 text-xs text-text-weak">{props.description}</p>
          </div>
          <div className="min-w-0 lg:w-[260px] lg:max-w-[260px]">{props.control}</div>
        </div>
      </div>
      {props.last ? null : <Separator />}
    </>
  )
}

export function ProviderSourceBadge(props: { provider: ProviderInfo }) {
  const label = PROVIDER_SOURCE_LABELS[props.provider.source] ?? "Config"

  return (
    <Badge variant="outline" className="h-5">
      {label}
    </Badge>
  )
}
