import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  ScrollArea,
  Separator,
} from "@buddy/ui"
import {
  APPEARANCE_DARK,
  APPEARANCE_LIGHT,
  APPEARANCE_SYSTEM,
  FONT_PUBLISHER,
  FONT_SANS,
  FONT_SERIF,
  FLOW_PAGINATED,
  FLOW_SCROLLED,
  READER_THEMES,
} from "../foliate-reader-constants"
import type { FoliateReaderPreferences } from "../foliate-reader-types"
import { isFoliateReaderThemeId } from "../utils/foliate-themes"

export interface FoliatePreferencesPanelProps {
  preferences: FoliateReaderPreferences
  setPreferences: React.Dispatch<React.SetStateAction<FoliateReaderPreferences>>
  canChangeFlow: boolean
}

interface SectionLabelProps {
  children: React.ReactNode
}
function SectionLabel({ children }: SectionLabelProps) {
  return (
    <div className="px-3 pb-1.5 pt-3 text-[10px] font-medium uppercase tracking-[0.12em] text-text-weaker">
      {children}
    </div>
  )
}

interface SliderRowProps {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
  format?: (value: number) => string
}
function SliderRow({ label, min, max, step, value, onChange, format }: SliderRowProps) {
  return (
    <label className="flex items-center gap-3 px-3 py-1.5">
      <span className="w-28 shrink-0 text-[12px] text-text-weak">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-0.5 flex-1 cursor-pointer appearance-none bg-border-base/50 accent-text-interactive-base [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-text-interactive-base"
      />
      {format ? (
        <span className="w-10 shrink-0 text-right font-mono text-[10px] text-text-weaker">
          {format(value)}
        </span>
      ) : null}
    </label>
  )
}

interface ToggleRowProps {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}
function ToggleRow({ label, checked, onCheckedChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <span className="text-[12px] text-text-weak">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="scale-80" />
    </div>
  )
}

export function FoliatePreferencesPanel({
  preferences,
  setPreferences,
  canChangeFlow,
}: FoliatePreferencesPanelProps) {
  return (
    <ScrollArea className="h-full">
      <div className="pb-4">
        {/* Appearance */}
        <SectionLabel>Appearance</SectionLabel>
        <div className="space-y-1.5 px-3">
          <Select
            value={preferences.themeId}
            onValueChange={(value) => {
              if (isFoliateReaderThemeId(value)) {
                setPreferences((current) => ({ ...current, themeId: value }))
              }
            }}
          >
            <SelectTrigger className="h-8 text-[12px]">
              <SelectValue placeholder="Theme" />
            </SelectTrigger>
            <SelectContent>
              {READER_THEMES.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={preferences.appearanceMode}
            onValueChange={(value) => {
              if (
                value === APPEARANCE_SYSTEM ||
                value === APPEARANCE_LIGHT ||
                value === APPEARANCE_DARK
              ) {
                setPreferences((current) => ({ ...current, appearanceMode: value }))
              }
            }}
          >
            <SelectTrigger className="h-8 text-[12px]">
              <SelectValue placeholder="Chrome style" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={APPEARANCE_SYSTEM}>System</SelectItem>
              <SelectItem value={APPEARANCE_LIGHT}>Light chrome</SelectItem>
              <SelectItem value={APPEARANCE_DARK}>Dark chrome</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={preferences.fontPreset}
            onValueChange={(value) => {
              if (value === FONT_PUBLISHER || value === FONT_SERIF || value === FONT_SANS) {
                setPreferences((current) => ({ ...current, fontPreset: value }))
              }
            }}
          >
            <SelectTrigger className="h-8 text-[12px]">
              <SelectValue placeholder="Font" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FONT_PUBLISHER}>Publisher fonts</SelectItem>
              <SelectItem value={FONT_SERIF}>Serif</SelectItem>
              <SelectItem value={FONT_SANS}>Sans-serif</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator className="my-2 opacity-50" />

        {/* Layout */}
        <SectionLabel>Layout</SectionLabel>

        {canChangeFlow ? (
          <div className="px-3 pb-1.5">
            <Select
              value={preferences.flow}
              onValueChange={(value) => {
                if (value === FLOW_PAGINATED || value === FLOW_SCROLLED) {
                  setPreferences((current) => ({ ...current, flow: value }))
                }
              }}
            >
              <SelectTrigger className="h-8 text-[12px]">
                <SelectValue placeholder="Reading flow" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FLOW_PAGINATED}>Paginated</SelectItem>
                <SelectItem value={FLOW_SCROLLED}>Vertical scroll</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <SliderRow
          label="Font size"
          min={0.85}
          max={1.4}
          step={0.01}
          value={preferences.fontScaleRem}
          onChange={(v) => setPreferences((c) => ({ ...c, fontScaleRem: v }))}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <SliderRow
          label="Line height"
          min={1.2}
          max={2}
          step={0.02}
          value={preferences.lineHeight}
          onChange={(v) => setPreferences((c) => ({ ...c, lineHeight: v }))}
          format={(v) => v.toFixed(2)}
        />
        <SliderRow
          label="Column gap"
          min={0}
          max={18}
          step={1}
          value={preferences.gapPercent}
          onChange={(v) => setPreferences((c) => ({ ...c, gapPercent: v }))}
          format={(v) => `${v}%`}
        />
        <SliderRow
          label="Margins"
          min={16}
          max={120}
          step={2}
          value={preferences.marginPx}
          onChange={(v) => setPreferences((c) => ({ ...c, marginPx: v }))}
          format={(v) => `${v}px`}
        />
        <SliderRow
          label="Max width"
          min={520}
          max={1100}
          step={10}
          value={preferences.maxInlineSizePx}
          onChange={(v) => setPreferences((c) => ({ ...c, maxInlineSizePx: v }))}
          format={(v) => `${v}`}
        />
        <SliderRow
          label="Max height"
          min={900}
          max={2200}
          step={25}
          value={preferences.maxBlockSizePx}
          onChange={(v) => setPreferences((c) => ({ ...c, maxBlockSizePx: v }))}
          format={(v) => `${v}`}
        />

        <Separator className="my-2 opacity-50" />

        {/* Behavior */}
        <SectionLabel>Behavior</SectionLabel>
        <ToggleRow
          label="Justify text"
          checked={preferences.justify}
          onCheckedChange={(v) => setPreferences((c) => ({ ...c, justify: v }))}
        />
        <ToggleRow
          label="Hyphenation"
          checked={preferences.hyphenate}
          onCheckedChange={(v) => setPreferences((c) => ({ ...c, hyphenate: v }))}
        />
        <ToggleRow
          label="Reduce motion"
          checked={preferences.reduceMotion}
          onCheckedChange={(v) => setPreferences((c) => ({ ...c, reduceMotion: v }))}
        />
        <ToggleRow
          label="Autohide cursor"
          checked={preferences.autohideCursor}
          onCheckedChange={(v) => setPreferences((c) => ({ ...c, autohideCursor: v }))}
        />
      </div>
    </ScrollArea>
  )
}
