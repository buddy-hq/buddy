import type { ComponentType, ReactNode } from "react"
import { CheckIcon } from "@/icons/app-icons"
import { Switch, ToggleGroup, ToggleGroupItem, cn } from "@buddy/ui"
import type { ReaderThemeId, ReaderThemeOption } from "../reader-types"

export function ReaderViewBody(props: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-5", props.className)}>{props.children}</div>
}

export function ReaderViewGroup(props: { children: ReactNode }) {
  return (
    <section className="border-t border-border-weaker-base pt-5 first:border-t-0 first:pt-0">
      {props.children}
    </section>
  )
}

export function ReaderViewRow(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-text-weak">{props.label}</p>
      {props.children}
    </div>
  )
}

type ReaderViewSegmentsProps<T extends string> = {
  label: string
  options: Array<{
    id: T
    label: string
    icon?: ComponentType<{ className?: string }>
    iconOnly?: boolean
  }>
  value: T
  onValueChange: (value: T) => void
}

export function ReaderViewSegments<T extends string>({
  label,
  options,
  value,
  onValueChange,
}: ReaderViewSegmentsProps<T>) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={value}
      aria-label={label}
      className="w-full"
      onValueChange={(nextValue) => {
        const option = options.find((candidate) => candidate.id === nextValue)
        if (option) onValueChange(option.id)
      }}
    >
      {options.map((option) => {
        const Icon = option.icon
        return (
          <ToggleGroupItem
            key={option.id}
            value={option.id}
            aria-label={option.iconOnly ? option.label : undefined}
            title={option.iconOnly ? option.label : undefined}
            className="min-w-0 flex-1"
          >
            {Icon ? <Icon /> : null}
            {option.iconOnly ? null : <span className="truncate">{option.label}</span>}
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}

type ReaderThemePickerProps = {
  themes: ReaderThemeOption[]
  value: ReaderThemeId
  onChange: (themeId: ReaderThemeId) => void
}

export function ReaderThemePicker({ themes, value, onChange }: ReaderThemePickerProps) {
  return (
    <div className="flex items-center gap-3">
      {themes.map((theme) => {
        const selected = theme.id === value
        return (
          <button
            key={theme.id}
            type="button"
            aria-label={theme.label}
            title={theme.label}
            aria-pressed={selected}
            onClick={() => onChange(theme.id)}
            className={cn(
              "relative flex size-9 shrink-0 items-center justify-center rounded-full font-serif text-base ring-1 ring-border-weak-base transition-shadow",
              selected &&
                "ring-2 ring-border-interactive-base ring-offset-2 ring-offset-surface-raised-stronger-non-alpha",
            )}
            style={{
              backgroundColor: theme.contentBackground,
              color: theme.contentForeground,
            }}
          >
            A
            {selected ? (
              <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-text-interactive-base ring-2 ring-surface-raised-stronger-non-alpha">
                <CheckIcon className="size-2 text-text-on-interactive-base" />
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

type ReaderViewToggleProps = {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function ReaderViewToggle({ id, label, checked, onCheckedChange }: ReaderViewToggleProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <label htmlFor={id} className="min-w-0 text-xs text-text-weak">
        {label}
      </label>
      <Switch id={id} size="sm" checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
