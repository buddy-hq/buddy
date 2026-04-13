import { ToggleGroup, ToggleGroupItem, Switch, ScrollArea, Separator } from "@buddy/ui"
import {
  SunIcon,
  MoonIcon,
  MonitorIcon,
  BookAIcon,
  LayoutPanelLeftIcon,
  ScrollTextIcon,
  AlignLeftIcon,
  AlignJustifyIcon,
} from "lucide-react"

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
import type { FoliateReaderPreferences, FoliateReaderThemeId } from "../foliate-reader-types"
import { isFoliateReaderThemeId } from "../utils/foliate-themes"
import { cn } from "@buddy/ui/lib/utils"

export interface FoliatePreferencesPanelProps {
  preferences: FoliateReaderPreferences
  setPreferences: React.Dispatch<React.SetStateAction<FoliateReaderPreferences>>
  canChangeFlow: boolean
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <label className="flex items-center gap-4 px-5 py-2">
      <span className="w-24 shrink-0 text-[13px] font-medium text-text-weak">{label}</span>
      <div className="relative flex-1 flex items-center">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="peer h-[3px] w-full cursor-pointer appearance-none rounded-full bg-border-base/40 accent-text-interactive-base outline-none hover:bg-border-base/60 [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-text-interactive-base [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110"
        />
      </div>
      {format && (
        <span className="w-12 shrink-0 text-right font-mono text-[10px] text-text-weak">
          {format(value)}
        </span>
      )}
    </label>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-border-base/30 first:border-t-0">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-text-base">{label}</span>
        {description && <span className="text-[11px] text-text-weak">{description}</span>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="scale-90 shadow-sm" />
    </div>
  )
}

const THEME_COLORS: Record<FoliateReaderThemeId, { bg: string; text: string }> = {
  paper: { bg: "#fcfaf6", text: "#111" },
  sepia: { bg: "#f1ece4", text: "#433422" },
  night: { bg: "#0a0a0a", text: "#ddd" },
  mist: { bg: "#1f2122", text: "#ddd" },
  graphite: { bg: "#121212", text: "#ccc" },
}

export function FoliatePreferencesPanel({
  preferences,
  setPreferences,
  canChangeFlow,
}: FoliatePreferencesPanelProps) {
  return (
    <ScrollArea className="flex-1 bg-surface-raised-base">
      <div className="flex flex-col pb-4 pt-4">
        {/* Theme Swatches */}
        <div className="px-5 pb-3">
          <ToggleGroup
            type="single"
            value={preferences.themeId}
            spacing={4}
            onValueChange={(val) => {
              if (val && isFoliateReaderThemeId(val)) {
                setPreferences((c) => ({ ...c, themeId: val }))
              }
            }}
            className="flex w-full justify-between"
          >
            {READER_THEMES.map((theme) => {
              const colors = THEME_COLORS[theme.id as FoliateReaderThemeId] || THEME_COLORS.paper
              const isActive = preferences.themeId === theme.id
              return (
                <ToggleGroupItem
                  key={theme.id}
                  value={theme.id}
                  className={cn(
                    "relative size-12 rounded-full p-0 border border-black/5 dark:border-white/5 shadow-md flex items-center justify-center transition-transform active:scale-95",
                    isActive
                      ? "ring-2 ring-text-interactive-base outline outline-2 outline-offset-2 outline-transparent"
                      : "hover:scale-105",
                  )}
                  style={{ backgroundColor: colors.bg, color: colors.text }}
                  aria-label={theme.label}
                >
                  <span className="font-serif text-[22px] leading-none tracking-tight">A</span>
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>
        </div>

        {/* Display Toggles */}
        <div className="px-5 space-y-4 py-2">
          {/* Chrome Mode */}
          <ToggleGroup
            type="single"
            variant="outline"
            value={preferences.appearanceMode}
            onValueChange={(val) => {
              if (val) setPreferences((c) => ({ ...c, appearanceMode: val as any }))
            }}
            className="flex w-full"
          >
            <ToggleGroupItem value={APPEARANCE_SYSTEM} className="flex-1 h-9 text-xs">
              <MonitorIcon data-icon="inline-start" />
              System
            </ToggleGroupItem>
            <ToggleGroupItem value={APPEARANCE_LIGHT} className="flex-1 h-9 text-xs">
              <SunIcon data-icon="inline-start" />
              Light
            </ToggleGroupItem>
            <ToggleGroupItem value={APPEARANCE_DARK} className="flex-1 h-9 text-xs">
              <MoonIcon data-icon="inline-start" />
              Dark
            </ToggleGroupItem>
          </ToggleGroup>

          {/* Typography */}
          <ToggleGroup
            type="single"
            variant="outline"
            value={preferences.fontPreset}
            onValueChange={(val) => {
              if (val) setPreferences((c) => ({ ...c, fontPreset: val as any }))
            }}
            className="flex w-full"
          >
            <ToggleGroupItem value={FONT_SERIF} className="flex-1 h-9 text-xs font-serif">
              Serif
            </ToggleGroupItem>
            <ToggleGroupItem value={FONT_SANS} className="flex-1 h-9 text-xs font-sans">
              Sans
            </ToggleGroupItem>
            <ToggleGroupItem value={FONT_PUBLISHER} className="flex-[1.2] h-9 text-xs">
              <BookAIcon data-icon="inline-start" />
              Publisher
            </ToggleGroupItem>
          </ToggleGroup>

          {/* Reading Flow & Alignment combined or stacked */}
          <div className="flex gap-2">
            {canChangeFlow && (
              <ToggleGroup
                type="single"
                variant="outline"
                value={preferences.flow}
                onValueChange={(val) => {
                  if (val) setPreferences((c) => ({ ...c, flow: val as any }))
                }}
                className="flex-1"
              >
                <ToggleGroupItem value={FLOW_PAGINATED} className="flex-1 h-9 text-xs">
                  <LayoutPanelLeftIcon data-icon="inline-start" />
                  Pages
                </ToggleGroupItem>
                <ToggleGroupItem value={FLOW_SCROLLED} className="flex-1 h-9 text-xs">
                  <ScrollTextIcon data-icon="inline-start" />
                  Scroll
                </ToggleGroupItem>
              </ToggleGroup>
            )}

            <ToggleGroup
              type="single"
              variant="outline"
              value={preferences.justify ? "justify" : "left"}
              onValueChange={(val) => {
                if (val) setPreferences((c) => ({ ...c, justify: val === "justify" }))
              }}
              className="w-24"
            >
              <ToggleGroupItem value="left" className="flex-1 h-9 p-0" aria-label="Align Left">
                <AlignLeftIcon data-icon="inline-start" className="m-0" />
              </ToggleGroupItem>
              <ToggleGroupItem value="justify" className="flex-1 h-9 p-0" aria-label="Justify Text">
                <AlignJustifyIcon data-icon="inline-start" className="m-0" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <Separator className="mx-5 my-3 opacity-30" />

        {/* Sliders */}
        <div className="flex flex-col py-1 space-y-1">
          <SliderRow
            label="Text Size"
            min={0.85}
            max={1.4}
            step={0.01}
            value={preferences.fontScaleRem}
            onChange={(v) => setPreferences((c) => ({ ...c, fontScaleRem: v }))}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <SliderRow
            label="Line Height"
            min={1.2}
            max={2}
            step={0.02}
            value={preferences.lineHeight}
            onChange={(v) => setPreferences((c) => ({ ...c, lineHeight: v }))}
            format={(v) => v.toFixed(2)}
          />
          <SliderRow
            label="Column Gap"
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
            label="Max Width"
            min={520}
            max={1100}
            step={10}
            value={preferences.maxInlineSizePx}
            onChange={(v) => setPreferences((c) => ({ ...c, maxInlineSizePx: v }))}
            format={(v) => `${v}`}
          />
        </div>

        <Separator className="mx-5 my-3 opacity-30" />

        {/* Behavior */}
        <div className="flex flex-col py-1">
          <ToggleRow
            label="Hyphenation"
            checked={preferences.hyphenate}
            onCheckedChange={(v) => setPreferences((c) => ({ ...c, hyphenate: v }))}
          />
          <ToggleRow
            label="Reduce Motion"
            description="Disable book page turning animations"
            checked={preferences.reduceMotion}
            onCheckedChange={(v) => setPreferences((c) => ({ ...c, reduceMotion: v }))}
          />
          <ToggleRow
            label="Autohide Cursor"
            description="Hide mouse cursor while reading"
            checked={preferences.autohideCursor}
            onCheckedChange={(v) => setPreferences((c) => ({ ...c, autohideCursor: v }))}
          />
        </div>
      </div>
    </ScrollArea>
  )
}
