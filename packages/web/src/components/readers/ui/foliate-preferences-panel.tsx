import type { Dispatch, SetStateAction } from "react"
import { AlignJustifyIcon, AlignLeftIcon } from "@/icons/app-icons"
import { Button } from "@buddy/ui"
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
import { ReaderPreferenceSlider, ReaderPreferencesPanel } from "./reader-preferences-panel"
import {
  ReaderViewGroup,
  ReaderViewRow,
  ReaderViewSegments,
  ReaderViewToggle,
} from "./reader-view-controls"

const FOLIATE_READER_THEME_OPTIONS = foliateThemesToReaderThemes()
const FOLIATE_TEXT_SIZE_MIN = 0.85
const FOLIATE_TEXT_SIZE_MAX = 1.4
const FOLIATE_TEXT_SIZE_STEP = 0.05

type FoliatePreferencesPanelProps = {
  preferences: FoliateReaderPreferences
  setPreferences: Dispatch<SetStateAction<FoliateReaderPreferences>>
  canChangeFlow: boolean
  onOpenHelp: () => void
  onOpenLocationNavigation: () => void
}

function clampTextSize(value: number): number {
  return Math.max(FOLIATE_TEXT_SIZE_MIN, Math.min(FOLIATE_TEXT_SIZE_MAX, value))
}

export function FoliatePreferencesPanel({
  preferences,
  setPreferences,
  canChangeFlow,
  onOpenHelp,
  onOpenLocationNavigation,
}: FoliatePreferencesPanelProps) {
  const engineControls = canChangeFlow ? (
    <>
      <ReaderViewGroup>
        <div className="flex flex-col gap-4">
          <ReaderViewRow label="Text size">
            <div className="flex items-stretch gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Smaller text"
                title="Smaller text"
                onClick={() =>
                  setPreferences((current) => ({
                    ...current,
                    fontScaleRem: clampTextSize(current.fontScaleRem - FOLIATE_TEXT_SIZE_STEP),
                  }))
                }
                className="flex-1 font-serif text-[13px] leading-none"
              >
                A
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Larger text"
                title="Larger text"
                onClick={() =>
                  setPreferences((current) => ({
                    ...current,
                    fontScaleRem: clampTextSize(current.fontScaleRem + FOLIATE_TEXT_SIZE_STEP),
                  }))
                }
                className="flex-1 font-serif text-lg leading-none"
              >
                A
              </Button>
            </div>
          </ReaderViewRow>

          <ReaderViewRow label="Typeface">
            <ReaderViewSegments
              label="Typeface"
              value={preferences.fontPreset}
              options={[
                { id: FONT_SERIF, label: "Serif" },
                { id: FONT_SANS, label: "Sans" },
                { id: FONT_PUBLISHER, label: "Publisher" },
              ]}
              onValueChange={(fontPreset) =>
                setPreferences((current) => ({ ...current, fontPreset }))
              }
            />
          </ReaderViewRow>

          <ReaderViewRow label="Alignment">
            <ReaderViewSegments
              label="Alignment"
              value={preferences.justify ? "justify" : "left"}
              options={[
                { id: "left", label: "Left", icon: AlignLeftIcon, iconOnly: true },
                { id: "justify", label: "Justify", icon: AlignJustifyIcon, iconOnly: true },
              ]}
              onValueChange={(alignment) =>
                setPreferences((current) => ({
                  ...current,
                  justify: alignment === "justify",
                }))
              }
            />
          </ReaderViewRow>

          <div className="flex flex-col gap-0.5">
            <ReaderPreferenceSlider
              id="foliate-line-height"
              label="Line height"
              min={1.2}
              max={2}
              step={0.02}
              value={preferences.lineHeight}
              onChange={(lineHeight) =>
                setPreferences((current) => ({ ...current, lineHeight }))
              }
              formatValue={(value) => value.toFixed(2)}
            />
            <ReaderPreferenceSlider
              id="foliate-margins"
              label="Margins"
              min={16}
              max={120}
              step={2}
              value={preferences.marginPx}
              onChange={(marginPx) => setPreferences((current) => ({ ...current, marginPx }))}
              formatValue={(value) => `${value}px`}
            />
            <ReaderPreferenceSlider
              id="foliate-column-gap"
              label="Column gap"
              min={0}
              max={18}
              step={1}
              value={preferences.gapPercent}
              onChange={(gapPercent) =>
                setPreferences((current) => ({ ...current, gapPercent }))
              }
              formatValue={(value) => `${value}%`}
            />
            <ReaderPreferenceSlider
              id="foliate-max-width"
              label="Max width"
              min={520}
              max={1100}
              step={10}
              value={preferences.maxInlineSizePx}
              onChange={(maxInlineSizePx) =>
                setPreferences((current) => ({ ...current, maxInlineSizePx }))
              }
              formatValue={(value) => String(value)}
            />
          </div>

          <ReaderViewToggle
            id="foliate-hyphenation"
            label="Hyphenation"
            checked={preferences.hyphenate}
            onCheckedChange={(hyphenate) =>
              setPreferences((current) => ({ ...current, hyphenate }))
            }
          />
        </div>
      </ReaderViewGroup>

      <ReaderViewGroup>
        <ReaderViewRow label="Reading flow">
          <ReaderViewSegments
            label="Reading flow"
            value={preferences.flow}
            options={[
              { id: FLOW_PAGINATED, label: "Pages" },
              { id: FLOW_SCROLLED, label: "Scroll" },
            ]}
            onValueChange={(flow) => setPreferences((current) => ({ ...current, flow }))}
          />
        </ReaderViewRow>
      </ReaderViewGroup>
    </>
  ) : null

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
      onOpenHelp={onOpenHelp}
      onOpenLocationNavigation={onOpenLocationNavigation}
      engineControls={engineControls}
    />
  )
}
