import type { ReactNode } from "react"
import { Badge, cn } from "@buddy/ui"
import type { ProviderInfo } from "@/state/chat-types"
import type { SettingsWorkbench } from "./settings-workbench"

const PROVIDER_SOURCE_LABELS: Record<string, string> = {
  env: "Environment",
  api: "API key",
  custom: "Custom",
}

export function SettingsContent(props: {
  children: ReactNode
  fillHeight?: boolean
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div
        className={cn(
          "min-h-0 flex-1 px-6 py-6 sm:px-8 sm:py-8",
          props.fillHeight ? "overflow-hidden" : "overflow-x-hidden overflow-y-auto",
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-3xl flex-col gap-8",
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
    <div className="space-y-1 px-1">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-weaker">
        {props.title}
        {props.badge ? (
          <span className="rounded-full border border-border-base/60 bg-surface-tertiary px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-text-weaker">
            {props.badge}
          </span>
        ) : null}
      </h3>
      {props.description ? <p className="text-xs text-text-weak">{props.description}</p> : null}
    </div>
  )
}

export function SettingsSection(props: {
  title: string
  badge?: string
  headerAction?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-weaker">
          {props.title}
          {props.badge ? (
            <span className="rounded-full border border-border-base/60 bg-surface-tertiary px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-text-weaker">
              {props.badge}
            </span>
          ) : null}
        </h3>
        {props.headerAction ? (
          <div className="flex items-center">{props.headerAction}</div>
        ) : null}
      </div>
      <SettingsListCard>{props.children}</SettingsListCard>
    </div>
  )
}

export function GlobalDefaultsSection(props: { children: ReactNode; description?: string }) {
  return (
    <div className="space-y-2.5">
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
    <div className="space-y-2.5">
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
        <div className="rounded-2xl border border-border-base/50 p-4 text-sm text-text-weak">
          Open a notebook to customize notebook-specific behavior.
        </div>
      )}
    </div>
  )
}

export function EffectiveBehaviorSection(props: { children: ReactNode; description?: string }) {
  return (
    <div className="space-y-2.5">
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
    <div className="relative overflow-hidden rounded-2xl border border-border-base/50 bg-surface-raised-base shadow-xs">
      {props.children}
    </div>
  )
}

export function SettingsRow(props: {
  title: ReactNode
  description: string
  control: ReactNode
  /** @deprecated No longer needed — rows use CSS border-t separators automatically */
  last?: boolean
}) {
  return (
    <div className="border-t border-border-base/60 px-4 py-3.5 first:border-t-0 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[13px] font-medium tracking-[-0.01em] text-text-base">{props.title}</p>
          <p className="text-xs text-text-weak">{props.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:min-w-44 sm:justify-end">
          {props.control}
        </div>
      </div>
    </div>
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
