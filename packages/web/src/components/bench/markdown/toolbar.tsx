import { memo } from "react"
import { Button, ToggleGroup, ToggleGroupItem } from "@buddy/ui"
import {
  InfoIcon,
  MinusIcon,
  MoonIcon,
  PlusIcon,
  PrinterIcon,
  Redo2Icon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
  SunIcon,
  Undo2Icon,
} from "@/icons/app-icons"
import type { MarkdownBenchContentThemeMode } from "@/components/bench/markdown/document-theme"

const ICON_BUTTON_CLASS_NAME =
  "size-8 rounded-lg text-text-weak hover:bg-surface-base-hover hover:text-text-base"

const separator = <div className="mx-1 h-4 w-px bg-border-base/70" />

export type MarkdownBenchToolbarProps = {
  advancedToolsOpen: boolean
  canDecreaseFontScale: boolean
  canIncreaseFontScale: boolean
  canRedo: boolean
  canUndo: boolean
  contentThemeMode: MarkdownBenchContentThemeMode
  fileInfoOpen: boolean
  fontScaleLabel: string
  printView: boolean
  onDecreaseFontScale(): void
  onIncreaseFontScale(): void
  onRedo(): void
  onResetFontScale(): void
  onToggleAdvancedTools(): void
  onToggleFileInfo(): void
  onUndo(): void
  onContentThemeModeChange(mode: string): void
}

export const MarkdownBenchToolbar = memo(function MarkdownBenchToolbar(
  props: MarkdownBenchToolbarProps,
) {
  const resetLabel = props.printView
    ? "Print view uses PDF text size"
    : `Reset document text size (${props.fontScaleLabel})`

  return (
    <>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={ICON_BUTTON_CLASS_NAME}
        aria-label="Undo"
        title="Undo"
        disabled={!props.canUndo}
        data-action="markdown-undo"
        onClick={props.onUndo}
      >
        <Undo2Icon className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={ICON_BUTTON_CLASS_NAME}
        aria-label="Redo"
        title="Redo"
        disabled={!props.canRedo}
        data-action="markdown-redo"
        onClick={props.onRedo}
      >
        <Redo2Icon className="size-4" aria-hidden />
      </Button>
      {separator}
      <ToggleGroup
        type="single"
        value={props.contentThemeMode}
        variant="default"
        size="sm"
        onValueChange={props.onContentThemeModeChange}
      >
        <ToggleGroupItem
          value="light"
          aria-label="Light document view"
          title="Light document view"
          data-action="markdown-document-light"
        >
          <SunIcon className="size-4" aria-hidden />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="dark"
          aria-label="Dark document view"
          title="Dark document view"
          data-action="markdown-document-dark"
        >
          <MoonIcon className="size-4" aria-hidden />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="print"
          aria-label="Print document view"
          title="Print document view"
          data-action="markdown-document-print"
        >
          <PrinterIcon className="size-4" aria-hidden />
        </ToggleGroupItem>
      </ToggleGroup>
      {separator}
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={ICON_BUTTON_CLASS_NAME}
        aria-label={`Decrease document text size (${props.fontScaleLabel})`}
        title={`Decrease document text size (${props.fontScaleLabel})`}
        disabled={!props.canDecreaseFontScale}
        data-action="markdown-font-size-decrease"
        onClick={props.onDecreaseFontScale}
      >
        <MinusIcon className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={ICON_BUTTON_CLASS_NAME}
        aria-label={resetLabel}
        title={resetLabel}
        disabled={props.printView}
        data-action="markdown-font-size-reset"
        onClick={props.onResetFontScale}
      >
        <RotateCcwIcon className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={ICON_BUTTON_CLASS_NAME}
        aria-label={`Increase document text size (${props.fontScaleLabel})`}
        title={`Increase document text size (${props.fontScaleLabel})`}
        disabled={!props.canIncreaseFontScale}
        data-action="markdown-font-size-increase"
        onClick={props.onIncreaseFontScale}
      >
        <PlusIcon className="size-4" aria-hidden />
      </Button>
      {separator}
      <Button
        type="button"
        size="icon-sm"
        variant={props.advancedToolsOpen ? "secondary" : "ghost"}
        aria-label="Advanced editing tools"
        aria-pressed={props.advancedToolsOpen}
        title="Advanced editing tools"
        disabled={props.printView}
        data-action="markdown-advanced-tools"
        onClick={props.onToggleAdvancedTools}
      >
        <SlidersHorizontalIcon data-icon="inline-start" aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant={props.fileInfoOpen ? "secondary" : "ghost"}
        aria-label="File information"
        aria-pressed={props.fileInfoOpen}
        title="File information"
        data-action="markdown-file-info"
        onClick={props.onToggleFileInfo}
      >
        <InfoIcon data-icon="inline-start" aria-hidden />
      </Button>
    </>
  )
})
