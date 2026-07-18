import type { ToolLayoutRole } from "@buddy/opencode-adapter/tool-presentation"

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

export function transcriptGapClass(
  previous: ToolLayoutRole | undefined,
  next: ToolLayoutRole,
): string {
  if (!previous) return TRANSCRIPT_GAP_CLASS[20]
  return TRANSCRIPT_GAP_CLASS[TRANSCRIPT_GAP_PX[previous][next]]
}
