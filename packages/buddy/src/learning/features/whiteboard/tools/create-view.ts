import z from "zod"
import CREATE_VIEW_DESCRIPTION from "./create-view.md"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"
import {
  applyWhiteboardDrawingProgram,
  type WhiteboardProgramRequestedWriteMode,
} from "../service/program"
import { waitForCurrentWhiteboardRenderReport } from "../service/store"
import {
  buildWhiteboardLayoutDigest,
  type WhiteboardLayoutDigest,
} from "../service/layout-digest"

const CREATE_WHITEBOARD_VIEW_BOARD_ACTIONS = [
  "continue_current_board",
  "destructively_replace_current_board",
] as const

const CreateWhiteboardViewBoardActionSchema = z
  .enum(CREATE_WHITEBOARD_VIEW_BOARD_ACTIONS)
  .describe(
    "Required board write mode. Use continue_current_board for the first board, normal appends, repairs, local edits, delete/translate operations, new zones below or beside existing work, and anything that should preserve existing content or learner edits. Use destructively_replace_current_board only when the user explicitly asks to discard, clear, overwrite, or replace the entire current board. Replacement is destructive for the viewer: Buddy has one current board and no viewer-facing way to return to the overwritten board. Never use replacement merely for a cleaner canvas, a different layout, a new lesson/topic, or because continuing would be visually harder.",
  )

const CreateWhiteboardViewInputSchema = z
  .object({
    boardAction: CreateWhiteboardViewBoardActionSchema,
    elements: z
      .string()
      .trim()
      .min(2)
      .describe(
        'JSON array string containing only Excalidraw drawing elements plus local drawing controls such as delete, translate, and cameraUpdate. Must be valid JSON: no comments, no trailing commas. The argument is already a string field, so write plain JSON inside it, not a second escaped JSON string. Do not put restoreCheckpoint or replaceCurrentBoard in this array; boardAction controls whether Buddy preserves or destructively replaces the current board.',
      ),
  })
  .strict()

type CreateWhiteboardViewInput = z.infer<typeof CreateWhiteboardViewInputSchema>

function toWhiteboardProgramWriteMode(
  boardAction: CreateWhiteboardViewInput["boardAction"],
): WhiteboardProgramRequestedWriteMode {
  switch (boardAction) {
    case "continue_current_board":
      return "continue"
    case "destructively_replace_current_board":
      return "replace"
  }
}

function formatMeasuredLayoutForModel(layout: WhiteboardLayoutDigest | undefined): string[] {
  if (!layout) {
    return [
      "Measured whiteboard layout was not available before tool completion. Do not repair layout from raw JSON geometry; call whiteboard_read_context before a layout repair.",
    ]
  }
  if (layout.status === "ok") {
    return ["Measured whiteboard layout: ok."]
  }
  return [
    "Measured whiteboard layout issues from rendered bounds:",
    JSON.stringify({
      issues: layout.issues,
      ...(layout.issuesTruncated ? { issuesTruncated: true } : {}),
    }),
    'Before replying, make at most one follow-up whiteboard_create_view repair using boardAction="continue_current_board". Trust only these rendered-bounds issues. For text_too_small, increase the listed text font size, use a less dense local layout, or narrow the camera viewport. For text_overflow, fix the listed container/text ids in the reported axis. For text_occluded, redraw locally so the text is above the occluding filled shape or move/delete the occluder. For sibling_collision, separate the listed ids in the reported axis. Preserve all unrelated content.',
  ]
}

const createWhiteboardViewTool = createBuddyTool({
  id: "whiteboard_create_view",
  description: CREATE_VIEW_DESCRIPTION,
  parameters: CreateWhiteboardViewInputSchema,
  ui: {
    presentation: "hidden-summary",
    labels: {
      running: "Updating Whiteboard",
      idle: "Updated Whiteboard",
    },
  },
  async execute(params: CreateWhiteboardViewInput, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "whiteboard_create_view",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })
    const result = await applyWhiteboardDrawingProgram({
      directory: ctx.directory,
      sessionID: String(ctx.sessionID),
      elements: params.elements,
      writeMode: toWhiteboardProgramWriteMode(params.boardAction),
    })
    const measuredBoard = result.saved
      ? await waitForCurrentWhiteboardRenderReport({
          directory: ctx.directory,
          sessionID: String(ctx.sessionID),
          boardID: result.boardID,
        })
      : undefined
    const layout = buildWhiteboardLayoutDigest(measuredBoard?.renderReport, {
      priorityElementIDs: new Set(result.layoutPriorityElementIDs),
    })
    return {
      title: "Updated Whiteboard",
      output: [
        result.saved
          ? `Whiteboard updated. Continuation handle: '${result.continuationHandle}'.`
          : `Whiteboard unchanged. Continuation handle: '${result.continuationHandle}'.`,
        "If you need to edit this board again, first call whiteboard_read_context for precise edits, then call whiteboard_create_view with boardAction='continue_current_board'.",
        "Use boardAction='destructively_replace_current_board' only when the user explicitly asked to discard, clear, overwrite, or replace the entire current board; the viewer has no in-app way back to the overwritten board.",
        'To remove elements, use {"type":"delete","ids":"<id1>,<id2>"} or {"type":"delete","id":"<id>"} before adding replacements.',
        'To move related elements together, use {"type":"translate","ids":"<id1>,<id2>","dx":180,"dy":0}. For local redesigns, delete the old ids and redraw that area with new ids.',
        ...(result.warnings.length > 0
          ? [
              `The drawing was saved after skipping or normalizing ${result.warnings.length} recoverable issue(s):`,
              ...result.warnings.map((warning) => `- ${warning}`),
            ]
          : []),
        ...(result.saved ? formatMeasuredLayoutForModel(layout) : []),
      ].join("\n"),
      metadata: {
        checkpointId: result.continuationHandle,
        boardID: result.boardID,
        saved: result.saved,
        boardAction: params.boardAction,
        warnings: result.warnings,
        ...(layout ? { layout } : {}),
      },
    }
  },
})

export { CreateWhiteboardViewInputSchema, createWhiteboardViewTool }
