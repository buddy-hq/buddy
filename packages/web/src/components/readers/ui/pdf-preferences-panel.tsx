import { RotateCcwIcon, RotateCwIcon } from "@/icons/app-icons"
import { Button } from "@buddy/ui"
import type {
  PdfReaderLayout,
  PdfReaderMode,
  PdfReaderRotation,
  PdfReaderScaleMode,
  ReaderCommonPreferences,
  ReaderThemeId,
  ReaderThemeOption,
} from "../reader-types"
import { ReaderPreferencesPanel } from "./reader-preferences-panel"
import { ReaderViewGroup, ReaderViewRow, ReaderViewSegments } from "./reader-view-controls"

export type PdfFitMode = Exclude<PdfReaderScaleMode, "custom">

const PDF_LAYOUT_OPTIONS: Array<{ id: PdfReaderLayout; label: string }> = [
  { id: "continuous", label: "Continuous" },
  { id: "single-page", label: "Single" },
  { id: "two-up", label: "Two-up" },
]

const PDF_FIT_OPTIONS: Array<{ id: PdfFitMode; label: string }> = [
  { id: "fit-width", label: "Width" },
  { id: "fit-page", label: "Whole page" },
]

const PDF_ROTATIONS: PdfReaderRotation[] = [0, 90, 180, 270]

type PdfPreferencesPanelProps = {
  preferences: ReaderCommonPreferences
  themes: ReaderThemeOption[]
  mode: PdfReaderMode
  preferredFitMode: PdfFitMode
  onThemeChange: (theme: ReaderThemeId) => void
  onReduceMotionChange: (reduceMotion: boolean) => void
  onAutohideCursorChange: (autohideCursor: boolean) => void
  onModeChange: (mode: PdfReaderMode) => void
  onPreferredFitModeChange: (mode: PdfFitMode) => void
  onOpenHelp: () => void
  onOpenLocationNavigation: () => void
}

function adjacentRotation(rotation: PdfReaderRotation, direction: 1 | -1): PdfReaderRotation {
  const index = PDF_ROTATIONS.indexOf(rotation)
  return PDF_ROTATIONS[(index + direction + PDF_ROTATIONS.length) % PDF_ROTATIONS.length] ?? 0
}

export function PdfPreferencesPanel({
  preferences,
  themes,
  mode,
  preferredFitMode,
  onThemeChange,
  onReduceMotionChange,
  onAutohideCursorChange,
  onModeChange,
  onPreferredFitModeChange,
  onOpenHelp,
  onOpenLocationNavigation,
}: PdfPreferencesPanelProps) {
  return (
    <ReaderPreferencesPanel
      preferences={preferences}
      themes={themes}
      onThemeChange={onThemeChange}
      onReduceMotionChange={onReduceMotionChange}
      onAutohideCursorChange={onAutohideCursorChange}
      onOpenHelp={onOpenHelp}
      onOpenLocationNavigation={onOpenLocationNavigation}
      engineControls={
        <ReaderViewGroup>
          <div className="flex flex-col gap-4">
            <ReaderViewRow label="Page layout">
              <ReaderViewSegments
                label="Page layout"
                options={PDF_LAYOUT_OPTIONS}
                value={mode.layout}
                onValueChange={(layout) => onModeChange({ ...mode, layout })}
              />
            </ReaderViewRow>
            <ReaderViewRow label="Fit">
              <ReaderViewSegments
                label="Fit"
                options={PDF_FIT_OPTIONS}
                value={preferredFitMode}
                onValueChange={(scaleMode) => {
                  onPreferredFitModeChange(scaleMode)
                  onModeChange({ ...mode, scaleMode })
                }}
              />
            </ReaderViewRow>
            <ReaderViewRow label="Rotation">
              <div className="flex items-stretch gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Rotate left"
                  title="Rotate left"
                  onClick={() =>
                    onModeChange({ ...mode, rotation: adjacentRotation(mode.rotation, -1) })
                  }
                  className="flex-1"
                >
                  <RotateCcwIcon />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Rotate right"
                  title="Rotate right"
                  onClick={() =>
                    onModeChange({ ...mode, rotation: adjacentRotation(mode.rotation, 1) })
                  }
                  className="flex-1"
                >
                  <RotateCwIcon />
                </Button>
              </div>
            </ReaderViewRow>
          </div>
        </ReaderViewGroup>
      }
    />
  )
}
