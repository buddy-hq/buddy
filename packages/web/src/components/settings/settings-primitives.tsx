import type { ReactNode } from "react"
import { Badge, Card, CardContent, Separator, cn } from "@buddy/ui"
import type { ProviderInfo } from "@/state/chat-types"
import type { SettingsWorkbench } from "./settings-workbench"

const PROVIDER_SOURCE_LABELS: Record<string, string> = {
  env: "Environment",
  api: "API key",
  custom: "Custom",
}

export function SettingsContent(props: {
  title?: string
  description?: string
  eyebrow?: string
  children: ReactNode
  fillHeight?: boolean
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {props.title && (
        <div className="shrink-0 border-b border-border-base/60 px-5 py-5">
          {props.eyebrow ? (
            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-text-weaker">
              {props.eyebrow}
            </p>
          ) : null}
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

export function SettingsSectionHeader(props: {
  title: string
  description?: string
  badge?: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium text-text-base">{props.title}</h3>
        {props.badge ? (
          <span className="rounded-full border border-border-base/60 bg-surface-tertiary px-2 py-0.5 text-[11px] font-medium text-text-weaker">
            {props.badge}
          </span>
        ) : null}
      </div>
      {props.description ? <p className="text-xs text-text-weak">{props.description}</p> : null}
    </div>
  )
}

export function GlobalDefaultsSection(props: { children: ReactNode; description?: string }) {
  return (
    <div className="space-y-2">
      <SettingsSectionHeader
        title="Global defaults"
        description={
          props.description ??
          "These defaults apply across Buddy unless a notebook customizes them."
        }
        badge="Global"
      />
      {props.children}
    </div>
  )
}

export function NotebookCustomizationSection(props: {
  workbench: SettingsWorkbench
  children: ReactNode
  description?: string
}) {
  return (
    <div className="space-y-2">
      <SettingsSectionHeader
        title="Current notebook customization"
        description={
          props.description ??
          "These controls customize the selected notebook without changing global defaults."
        }
        badge={props.workbench.selectedNotebookName}
      />
      {props.workbench.hasSelectedNotebook ? (
        props.children
      ) : (
        <div className="rounded-md border border-border-base/60 p-3 text-sm text-text-weak">
          Open a notebook to customize notebook-specific behavior.
        </div>
      )}
    </div>
  )
}

export function EffectiveBehaviorSection(props: { children: ReactNode; description?: string }) {
  return (
    <div className="space-y-2">
      <SettingsSectionHeader
        title="Effective behavior"
        description={props.description ?? "This is what Buddy will do for the selected notebook."}
        badge="Preview"
      />
      {props.children}
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
