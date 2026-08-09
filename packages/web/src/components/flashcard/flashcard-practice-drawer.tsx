import type { ReactNode } from "react"
import { PlayIcon, type AppIcon } from "@/icons/app-icons"

export const FLASHCARD_PRACTICE_ROW_ACTION_W_PX = 104

export type FlashcardPracticeRowAction =
  | { kind: "action"; label: string; onClick: () => void }
  | { kind: "note"; label: string }

/** The ruled mixed-list language shared by the Easel and the live drawer. */
export function FlashcardPracticeDrawerRuledHead(props: {
  label: string
  trailing: ReactNode
}) {
  return (
    <div className="shrink-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-weaker">
          {props.label}
        </span>
        {props.trailing}
      </div>
      <div className="mt-2 h-px w-full bg-border-base" />
    </div>
  )
}

export function FlashcardPracticeDrawerColumnLabel() {
  return (
    <span
      style={{ width: FLASHCARD_PRACTICE_ROW_ACTION_W_PX }}
      className="text-center text-[10px] uppercase tracking-[0.14em] text-text-weaker"
    >
      Next
    </span>
  )
}

export function FlashcardPracticeDrawerRow(props: {
  icon: AppIcon
  title: string
  metadata: string
  action: FlashcardPracticeRowAction
  onOpen: () => void
}) {
  const Icon = props.icon

  return (
    <div
      data-component="practice-drawer-row"
      className="flex items-stretch border-b border-border-base/50"
    >
      <button
        type="button"
        onClick={props.onOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-2 py-3 text-left transition-colors hover:bg-surface-base"
      >
        <Icon className="size-4 shrink-0 text-icon-base" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[13px] text-text-base">{props.title}</span>
          <span className="truncate text-[11px] text-text-weaker">{props.metadata}</span>
        </span>
      </button>

      <div className="w-px shrink-0 bg-border-base/50" aria-hidden />

      {props.action.kind === "action" ? (
        <button
          type="button"
          onClick={props.action.onClick}
          style={{ width: FLASHCARD_PRACTICE_ROW_ACTION_W_PX }}
          className="flex shrink-0 cursor-pointer items-center justify-center gap-1.5 text-[12px] font-medium text-text-interactive-base transition-colors hover:bg-surface-interactive-weak"
        >
          <PlayIcon className="size-3" aria-hidden />
          {props.action.label}
        </button>
      ) : (
        <div
          style={{ width: FLASHCARD_PRACTICE_ROW_ACTION_W_PX }}
          className="flex shrink-0 items-center justify-center px-2 text-center text-[11px] text-text-weaker"
        >
          {props.action.label}
        </div>
      )}
    </div>
  )
}
