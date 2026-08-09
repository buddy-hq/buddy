import {
  BookAIcon,
  LayoutPanelLeftIcon,
  ScrollTextIcon,
  AlignLeftIcon,
  AlignJustifyIcon,
} from "@/icons/app-icons"
import { Field, FieldGroup, FieldLabel, Separator, ToggleGroup, ToggleGroupItem } from "@buddy/ui"
import {
  FLOW_PAGINATED,
  FLOW_SCROLLED,
  FONT_PUBLISHER,
  FONT_SANS,
  FONT_SERIF,
} from "../foliate-reader-constants"
import type { FoliateReaderPreferences } from "../foliate-reader-types"
import {
  foliatePreferencesToReaderPreferences,
  foliateThemesToReaderThemes,
} from "../foliate-reader-adapters"
import {
  ReaderPreferenceSlider,
  ReaderPreferencesPanel,
  ReaderPreferenceToggle,
} from "./reader-preferences-panel"

type FoliatePreferencesPanelProps = {
  preferences: FoliateReaderPreferences
  setPreferences: React.Dispatch<React.SetStateAction<FoliateReaderPreferences>>
  canChangeFlow: boolean
}

const FOLIATE_READER_THEME_OPTIONS = foliateThemesToReaderThemes()

export function FoliatePreferencesPanel({
  preferences,
  setPreferences,
  canChangeFlow,
}: FoliatePreferencesPanelProps) {
  const engineControls = (
    <div className="flex flex-col gap-4">
      <FieldGroup className="gap-3 px-5">
        <Field>
          <FieldLabel id="foliate-font-family-label">Font family</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            value={preferences.fontPreset}
            aria-labelledby="foliate-font-family-label"
            onValueChange={(value) => {
              if (value === FONT_SERIF || value === FONT_SANS || value === FONT_PUBLISHER) {
                setPreferences((current) => ({ ...current, fontPreset: value }))
              }
            }}
            className="w-full"
          >
            <ToggleGroupItem value={FONT_SERIF} className="flex-1 font-serif">
              Serif
            </ToggleGroupItem>
            <ToggleGroupItem value={FONT_SANS} className="flex-1 font-sans">
              Sans
            </ToggleGroupItem>
            <ToggleGroupItem value={FONT_PUBLISHER} className="flex-1">
              <BookAIcon data-icon="inline-start" />
              Publisher
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <div className="flex gap-2">
          {canChangeFlow ? (
            <Field className="flex-1">
              <FieldLabel id="foliate-reading-flow-label">Reading flow</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={preferences.flow}
                aria-labelledby="foliate-reading-flow-label"
                onValueChange={(value) => {
                  if (value === FLOW_PAGINATED || value === FLOW_SCROLLED) {
                    setPreferences((current) => ({ ...current, flow: value }))
                  }
                }}
                className="w-full"
              >
                <ToggleGroupItem value={FLOW_PAGINATED} className="flex-1">
                  <LayoutPanelLeftIcon data-icon="inline-start" />
                  Pages
                </ToggleGroupItem>
                <ToggleGroupItem value={FLOW_SCROLLED} className="flex-1">
                  <ScrollTextIcon data-icon="inline-start" />
                  Scroll
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
          ) : null}

          <Field className="w-28">
            <FieldLabel id="foliate-text-alignment-label">Alignment</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              value={preferences.justify ? "justify" : "left"}
              aria-labelledby="foliate-text-alignment-label"
              onValueChange={(value) => {
                if (value) {
                  setPreferences((current) => ({ ...current, justify: value === "justify" }))
                }
              }}
              className="w-full"
            >
              <ToggleGroupItem value="left" className="flex-1" aria-label="Align left">
                <AlignLeftIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="justify" className="flex-1" aria-label="Justify text">
                <AlignJustifyIcon />
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
        </div>

        {canChangeFlow && preferences.flow === FLOW_SCROLLED ? (
          <p className="text-xs leading-relaxed text-text-weaker">
            Scrolls within the current EPUB section, then advances to the next section.
          </p>
        ) : null}
      </FieldGroup>

      <Separator />
      <FieldGroup className="gap-1">
        <ReaderPreferenceSlider
          id="foliate-text-size"
          label="Text size"
          min={0.85}
          max={1.4}
          step={0.01}
          value={preferences.fontScaleRem}
          onChange={(value) => setPreferences((current) => ({ ...current, fontScaleRem: value }))}
          formatValue={(value) => `${Math.round(value * 100)}%`}
        />
        <ReaderPreferenceSlider
          id="foliate-line-height"
          label="Line height"
          min={1.2}
          max={2}
          step={0.02}
          value={preferences.lineHeight}
          onChange={(value) => setPreferences((current) => ({ ...current, lineHeight: value }))}
          formatValue={(value) => value.toFixed(2)}
        />
        <ReaderPreferenceSlider
          id="foliate-column-gap"
          label="Column gap"
          min={0}
          max={18}
          step={1}
          value={preferences.gapPercent}
          onChange={(value) => setPreferences((current) => ({ ...current, gapPercent: value }))}
          formatValue={(value) => `${value}%`}
        />
        <ReaderPreferenceSlider
          id="foliate-margins"
          label="Margins"
          min={16}
          max={120}
          step={2}
          value={preferences.marginPx}
          onChange={(value) => setPreferences((current) => ({ ...current, marginPx: value }))}
          formatValue={(value) => `${value}px`}
        />
        <ReaderPreferenceSlider
          id="foliate-max-width"
          label="Max width"
          min={520}
          max={1100}
          step={10}
          value={preferences.maxInlineSizePx}
          onChange={(value) =>
            setPreferences((current) => ({ ...current, maxInlineSizePx: value }))
          }
          formatValue={(value) => String(value)}
        />
      </FieldGroup>

      <ReaderPreferenceToggle
        id="foliate-hyphenation"
        label="Hyphenation"
        checked={preferences.hyphenate}
        onCheckedChange={(hyphenate) => setPreferences((current) => ({ ...current, hyphenate }))}
      />
    </div>
  )

  return (
    <ReaderPreferencesPanel
      preferences={foliatePreferencesToReaderPreferences(preferences)}
      themes={FOLIATE_READER_THEME_OPTIONS}
      onThemeChange={(themeId) => setPreferences((current) => ({ ...current, themeId }))}
      onReduceMotionChange={(reduceMotion) =>
        setPreferences((current) => ({ ...current, reduceMotion }))
      }
      onAutohideCursorChange={(autohideCursor) =>
        setPreferences((current) => ({ ...current, autohideCursor }))
      }
      engineControls={engineControls}
    />
  )
}
