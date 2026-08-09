import type { ReactNode } from "react"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  ScrollArea,
  Separator,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from "@buddy/ui"
import type { ReaderCommonPreferences, ReaderThemeId, ReaderThemeOption } from "../reader-types"

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
  return (
    <Field orientation="horizontal" className="px-5 py-2">
      <FieldLabel htmlFor={id} className="w-24 shrink-0">
        {label}
      </FieldLabel>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-surface-weak accent-text-interactive-base"
      />
      {formatValue ? (
        <output htmlFor={id} className="w-14 shrink-0 text-right font-mono text-xs text-text-weak">
          {formatValue(value)}
        </output>
      ) : null}
    </Field>
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
    <Field orientation="horizontal" className="px-5 py-3">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </Field>
  )
}

type ReaderPreferencesPanelProps = {
  preferences: ReaderCommonPreferences
  themes: ReaderThemeOption[]
  onThemeChange: (themeId: ReaderThemeId) => void
  onReduceMotionChange: (reduceMotion: boolean) => void
  onAutohideCursorChange: (autohideCursor: boolean) => void
  engineControls?: ReactNode
}

export function ReaderPreferencesPanel({
  preferences,
  themes,
  onThemeChange,
  onReduceMotionChange,
  onAutohideCursorChange,
  engineControls,
}: ReaderPreferencesPanelProps) {
  return (
    <ScrollArea className="h-full bg-surface-raised-base">
      <div className="flex flex-col gap-4 py-4">
        <FieldSet className="px-5">
          <FieldLegend variant="label">Theme</FieldLegend>
          <ToggleGroup
            type="single"
            value={preferences.themeId}
            spacing={4}
            onValueChange={(value) => {
              const theme = themes.find((option) => option.id === value)
              if (theme) onThemeChange(theme.id)
            }}
            className="w-full justify-between"
          >
            {themes.map((theme) => (
              <ToggleGroupItem
                key={theme.id}
                value={theme.id}
                aria-label={theme.label}
                className="size-11 rounded-full p-0"
                style={{
                  backgroundColor: theme.contentBackground,
                  color: theme.contentForeground,
                }}
              >
                <span className="font-serif text-xl" aria-hidden="true">
                  A
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldSet>

        {engineControls ? (
          <>
            <Separator />
            {engineControls}
          </>
        ) : null}

        <Separator />
        <FieldGroup className="gap-0">
          <ReaderPreferenceToggle
            id="reader-reduce-motion"
            label="Reduce motion"
            description="Disable animated reading transitions"
            checked={preferences.reduceMotion}
            onCheckedChange={onReduceMotionChange}
          />
          <ReaderPreferenceToggle
            id="reader-autohide-cursor"
            label="Autohide cursor"
            description="Hide the pointer while reading"
            checked={preferences.autohideCursor}
            onCheckedChange={onAutohideCursorChange}
          />
        </FieldGroup>
      </div>
    </ScrollArea>
  )
}
