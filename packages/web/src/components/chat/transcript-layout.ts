import type { ToolLayoutRole } from "@buddy/opencode-adapter/tool-presentation"

/** Gap applied to the first row of a turn, which has no preceding layout role. */
export const TRANSCRIPT_LEADING_GAP_PX = 20

/**
 * Height of a collapsed ActivityRow header button: `py-1.5` (6 + 6) plus the
 * `text-xs` line box (16). Virtual size estimates are derived from this, so keep
 * it in step with the button's classes in `tools/activity-row/index.tsx`.
 */
export const ACTIVITY_ROW_COLLAPSED_HEIGHT_PX = 28

/**
 * The action footer the owning text row mounts once its turn is terminal:
 * `mt-3` (12) plus a `min-h-6` control strip (24).
 */
export const PROSE_ROW_ACTION_FOOTER_PX = 36

/** `text-sm` line box inside the markdown root. */
export const PROSE_ROW_LINE_HEIGHT_PX = 24

/**
 * The transcript column is `max-w-200` (800px) less `px-4`, and `text-sm`
 * averages ~7px per character. Paragraph margins are not modelled — they add
 * 16px per break, which is not derivable from a character count.
 */
export const PROSE_ROW_CHARS_PER_LINE_ESTIMATE = 110

export const TRANSCRIPT_GAP_PX = {
  prose: {
    prose: 8,
    activity: 12,
    "compact-output": 12,
    "card-output": 16,
    "media-output": 20,
  },
  activity: {
    prose: 12,
    activity: 8,
    "compact-output": 12,
    "card-output": 16,
    "media-output": 20,
  },
  "compact-output": {
    prose: 12,
    activity: 12,
    "compact-output": 8,
    "card-output": 12,
    "media-output": 16,
  },
  "card-output": {
    prose: 16,
    activity: 16,
    "compact-output": 12,
    "card-output": 12,
    "media-output": 16,
  },
  "media-output": {
    prose: 20,
    activity: 20,
    "compact-output": 16,
    "card-output": 16,
    "media-output": 16,
  },
} satisfies Record<ToolLayoutRole, Record<ToolLayoutRole, 8 | 12 | 16 | 20>>

const TRANSCRIPT_GAP_CLASS = {
  8: "pt-2",
  12: "pt-3",
  16: "pt-4",
  20: "pt-5",
} satisfies Record<8 | 12 | 16 | 20, string>

/**
 * Rendered height of a collapsed activity row, including the gap the renderer
 * applies above it. Virtual size estimates use this so a newly appended activity
 * row enters at its real size: an estimate that is corrected in the same frame a
 * bottom write lands leaves the two disagreeing about where the end is.
 */
export function collapsedActivityRowHeightPx(previous: ToolLayoutRole | undefined): number {
  const gap = previous ? TRANSCRIPT_GAP_PX[previous].activity : TRANSCRIPT_LEADING_GAP_PX
  return ACTIVITY_ROW_COLLAPSED_HEIGHT_PX + gap
}

/**
 * Rendered height of an assistant prose row, including the gap above it.
 *
 * The old estimate was `VIRTUAL_CHAT_TURN_ESTIMATE_PX` — a whole-turn number
 * applied to a single part row that is empty at the moment it is appended. A
 * recorded send entered at 360px and measured 48px, and the bottom-follow
 * chased all 360 before unwinding 312 of it a frame later.
 *
 * `hasActionFooter` is the terminal owner's footer, which exists only once the
 * turn ends — a streaming row must not reserve its height.
 */
export function proseRowHeightPx(input: {
  previous: ToolLayoutRole | undefined
  textLength: number
  hasActionFooter: boolean
}): number {
  const gap = input.previous ? TRANSCRIPT_GAP_PX[input.previous].prose : TRANSCRIPT_LEADING_GAP_PX
  const lines = Math.ceil(Math.max(0, input.textLength) / PROSE_ROW_CHARS_PER_LINE_ESTIMATE)
  const footer = input.hasActionFooter ? PROSE_ROW_ACTION_FOOTER_PX : 0
  return footer + lines * PROSE_ROW_LINE_HEIGHT_PX + gap
}

export function transcriptGapClass(
  previous: ToolLayoutRole | undefined,
  next: ToolLayoutRole,
): string {
  if (!previous) return TRANSCRIPT_GAP_CLASS[TRANSCRIPT_LEADING_GAP_PX]
  return TRANSCRIPT_GAP_CLASS[TRANSCRIPT_GAP_PX[previous][next]]
}
