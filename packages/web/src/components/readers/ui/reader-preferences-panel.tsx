import type { ReactNode } from "react"
import { ScrollArea } from "@buddy/ui"
import type { ReaderCommonPreferences, ReaderThemeId, ReaderThemeOption } from "../reader-types"
import {
  ReaderThemePicker,
  ReaderViewBody,
  ReaderViewGroup,
  ReaderViewToggle,
} from "./reader-view-controls"

type ReaderPreferenceSliderProps = {
  id: string
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
  formatValue?: (value: number) => string
}

export function ReaderPreferenceSlider({
  id,
  label,
  min,
  max,
  step,
  value,
  onChange,
  formatValue,
}: ReaderPreferenceSliderProps) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div className="flex items-center gap-3 py-1.5">
      <label htmlFor={id} className="w-20 shrink-0 text-xs text-text-weak">
        {label}
      </label>
      <div className="relative h-4 min-w-0 flex-1 focus-within:ring-2 focus-within:ring-border-interactive-base">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-weak">
          <div
            className="h-full rounded-full bg-text-interactive-base/70"
            style={{ width: `${fill}%` }}
          />
          <span
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-interactive-base"
            style={{ left: `${fill}%` }}
          />
        </div>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="absolute inset-0 size-full cursor-pointer appearance-none bg-transparent opacity-0"
        />
      </div>
      {formatValue ? (
        <output
          htmlFor={id}
          className="w-12 shrink-0 text-right font-mono text-[10px] text-text-weaker"
        >
          {formatValue(value)}
        </output>
      ) : null}
    </div>
  )
}

type ReaderPreferenceToggleProps = {
  id: string
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function ReaderPreferenceToggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: ReaderPreferenceToggleProps) {
  return (
    <div>
      <ReaderViewToggle id={id} label={label} checked={checked} onCheckedChange={onCheckedChange} />
      {description ? <p className="-mt-1 text-[10px] text-text-weaker">{description}</p> : null}
    </div>
  )
}

type ReaderPreferencesPanelProps = {
  preferences: ReaderCommonPreferences
  themes: ReaderThemeOption[]
  onThemeChange: (themeId: ReaderThemeId) => void
  onReduceMotionChange: (reduceMotion: boolean) => void
  onAutohideCursorChange: (autohideCursor: boolean) => void
  onOpenHelp: () => void
  onOpenLocationNavigation?: () => void
  engineControls?: ReactNode
}

export function ReaderPreferencesPanel({
  preferences,
  themes,
  onThemeChange,
  onReduceMotionChange,
  onAutohideCursorChange,
  onOpenHelp,
  onOpenLocationNavigation,
  engineControls,
}: ReaderPreferencesPanelProps) {
  return (
    <ScrollArea className="h-full">
      <ReaderViewBody className="p-4">
        <ReaderViewGroup>
          <ReaderThemePicker themes={themes} value={preferences.themeId} onChange={onThemeChange} />
        </ReaderViewGroup>

        {engineControls}

        <ReaderViewGroup>
          <div className="flex flex-col gap-1">
            <ReaderViewToggle
              id="reader-reduce-motion"
              label="Reduce motion"
              checked={preferences.reduceMotion}
              onCheckedChange={onReduceMotionChange}
            />
            <ReaderViewToggle
              id="reader-autohide-cursor"
              label="Autohide cursor"
              checked={preferences.autohideCursor}
              onCheckedChange={onAutohideCursorChange}
            />
          </div>
        </ReaderViewGroup>

        <ReaderViewGroup>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={onOpenHelp}
              className="flex w-full items-center justify-between rounded py-1 text-xs text-text-weak hover:text-text-base"
            >
              Keyboard shortcuts
              <span className="font-mono text-[10px] text-text-weaker">?</span>
            </button>
            {onOpenLocationNavigation ? (
              <button
                type="button"
                onClick={onOpenLocationNavigation}
                className="flex w-full items-center justify-between rounded py-1 text-xs text-text-weak hover:text-text-base"
              >
                Location &amp; navigation
                <span className="font-mono text-[10px] text-text-weaker">⌘L</span>
              </button>
            ) : null}
          </div>
        </ReaderViewGroup>
      </ReaderViewBody>
    </ScrollArea>
  )
}
