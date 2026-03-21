import type { ReactNode } from "react"
import { Badge, Card, CardContent, Separator, TabsContent, cn } from "@buddy/ui"
import type { ProviderInfo } from "@/state/chat-types"

export type SettingsTab =
  | "instructions"
  | "appearance"
  | "notebook"
  | "model"
  | "providers"
  | "mcps"

const PROVIDER_SOURCE_LABELS: Record<string, string> = {
  env: "Environment",
  api: "API key",
  custom: "Custom",
}

export function SettingsPanel(props: {
  value: SettingsTab
  title: string
  description: string
  children: ReactNode
  fillHeight?: boolean
  forceMount?: boolean
}) {
  return (
    <TabsContent
      value={props.value}
      forceMount={props.forceMount ? true : undefined}
      className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden"
    >
      <div className="border-b border-border/60 px-5 py-5">
        <h2 className="text-base font-medium text-foreground">{props.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{props.description}</p>
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 px-5 py-5",
          props.fillHeight ? "overflow-hidden" : "overflow-y-auto",
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
    </TabsContent>
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
  title: string
  description: string
  control: ReactNode
  last?: boolean
}) {
  return (
    <>
      <div className="px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{props.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{props.description}</p>
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
