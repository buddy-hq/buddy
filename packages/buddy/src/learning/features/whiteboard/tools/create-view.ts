import z from "zod"
import CREATE_VIEW_DESCRIPTION from "./create-view.md"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectIDSchema,
  BuddyObjectResultSchema,
  formatBuddyObjectRefLines,
  objectSummaryBaseFromManifest,
  readObjectManifest,
  type BuddyObjectResult,
} from "../../../../objects"
import {
  applyWhiteboardDrawingProgram,
  type WhiteboardProgramRequestedWriteMode,
} from "../service/program"
import {
  ensureWhiteboardObjectForToolCall,
  readWhiteboardObject,
  waitForCurrentWhiteboardRenderReport,
  WHITEBOARD_CURRENT_VIEW_ID,
} from "../service/store"
import { buildWhiteboardLayoutDigest, type WhiteboardLayoutDigest } from "../service/layout-digest"
import { dispatchBestEffortBenchPresent } from "../../bench/auto-open"

const CREATE_WHITEBOARD_VIEW_BOARD_ACTIONS = [
  "continue_current_board",
  "destructively_replace_current_board",
] as const
const WHITEBOARD_TITLE_MAX_CHARACTERS = 80

const CreateWhiteboardViewBoardActionSchema = z
  .enum(CREATE_WHITEBOARD_VIEW_BOARD_ACTIONS)
  .describe(
    "Required board write mode. Use continue_current_board for the first board, normal appends, repairs, local edits, delete/translate operations, new zones below or beside existing work, and anything that should preserve existing content or learner edits. Use destructively_replace_current_board only when the user explicitly asks to discard, clear, overwrite, or replace the entire current board. Replacement is destructive for the viewer: Buddy has one current board and no viewer-facing way to return to the overwritten board. Never use replacement merely for a cleaner canvas, a different layout, a new lesson/topic, or because continuing would be visually harder.",
  )

const CreateWhiteboardViewInputSchema = z
  .object({
    objectID: BuddyObjectIDSchema.nullable().describe(
      "Stable whiteboard object id to update. Pass null only when creating a new directory whiteboard. Reuse the same object id when continuing or revising an existing whiteboard, including from another chat.",
    ),
    title: z
      .string()
      .trim()
      .min(1)
      .max(WHITEBOARD_TITLE_MAX_CHARACTERS)
      .optional()
      .describe(
        "Short user-facing name for the whiteboard in Bench tabs and the Library. Provide it when creating a new whiteboard. When omitted while editing an existing whiteboard, its current title is preserved.",
      ),
    boardAction: CreateWhiteboardViewBoardActionSchema,
    elements: z
      .string()
      .trim()
      .min(2)
      .describe(
        "JSON array string containing only Excalidraw drawing elements plus local drawing controls such as delete, translate, and cameraUpdate. Must be valid JSON: no comments, no trailing commas. The argument is already a string field, so write plain JSON inside it, not a second escaped JSON string. Do not put restoreCheckpoint or replaceCurrentBoard in this array; boardAction controls whether Buddy preserves or destructively replaces the current board.",
      ),
  })
  .strict()

type CreateWhiteboardViewInput = z.infer<typeof CreateWhiteboardViewInputSchema>

function createdByCallID(ctx: BuddyToolContext): string {
  return typeof ctx.callID === "string" && ctx.callID.trim().length > 0 ? ctx.callID : "unknown"
}

function nullableCallID(ctx: BuddyToolContext): string | null {
  return typeof ctx.callID === "string" && ctx.callID.trim().length > 0 ? ctx.callID : null
}

function buildWhiteboardObjectResult(input: {
  objectID: string
  title: string
  sessionID: string
  messageID: string
  callID: string
}): BuddyObjectResult {
  const ref = {
    kind: BUDDY_OBJECT_KINDS.whiteboard,
    objectID: input.objectID,
    revisionID: null,
    itemID: null,
  }
  return BuddyObjectResultSchema.parse({
    version: 1,
    status: "ok",
    reason: null,
    message: "Whiteboard object updated.",
    primaryRef: ref,
    objects: [
      objectSummaryBaseFromManifest({
        kind: BUDDY_OBJECT_KINDS.whiteboard,
        objectID: input.objectID,
        title: input.title,
        status: "ready",
        lifecycle: "live",
        sourceRoot: null,
      }),
    ],
    presentations: [
      {
        ref,
        viewID: WHITEBOARD_CURRENT_VIEW_ID,
        surface: "bench",
        data: null,
        autoOpen: {
          policyID: "whiteboard",
          eventKey: `whiteboard:${input.sessionID}:${input.messageID}:${input.callID}`,
        },
      },
    ],
  })
}

function buildWhiteboardAutoOpenCandidate(input: {
  objectID: string
  sessionID: string
  messageID: string
  callID: string
}) {
  return {
    policyID: "whiteboard",
    eventKey: `whiteboard:${input.sessionID}:${input.messageID}:${input.callID}`,
    target: {
      type: "object",
      ref: {
        kind: BUDDY_OBJECT_KINDS.whiteboard,
        objectID: input.objectID,
        revisionID: null,
        itemID: null,
      },
      viewID: WHITEBOARD_CURRENT_VIEW_ID,
    },
  }
}

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
    JSON.stringify(
      Object.assign(
        {
          issues: layout.issues,
        },
        layout.issuesTruncated ? ({ issuesTruncated: true } as const) : undefined,
      ),
    ),
    'Before replying, make at most one follow-up whiteboard_create_view repair using boardAction="continue_current_board". Trust only these rendered-bounds issues. For text_too_small, increase the listed text font size, use a less dense local layout, or narrow the camera viewport. For text_overflow, fix the listed container/text ids in the reported axis. For text_occluded, redraw locally so the text is above the occluding filled shape or move/delete the occluder. For sibling_collision, separate the listed ids in the reported axis. Preserve all unrelated content.',
  ]
}

const createWhiteboardViewTool = createBuddyTool({
  id: "whiteboard_create_view",
  produces: {
    buddyObjectResult: true,
  },
  description: CREATE_VIEW_DESCRIPTION,
  parameters: CreateWhiteboardViewInputSchema,
  presentation: {
    archetype: "activity",
    icon: "presentation",
    renderer: "buddy-custom",
    layoutRole: "activity",
    phases: {
      pending: { action: "Updating Whiteboard" },
      running: { action: "Updating Whiteboard" },
      completed: { action: "Updated Whiteboard" },
      error: { action: "Failed to update Whiteboard" },
    },
    summary: {
      category: "update-whiteboard",
      pending: "Updating Whiteboard",
      running: "Updating Whiteboard",
      completed: "Updated Whiteboard",
      error: "Failed to update Whiteboard",
    },
  },
  async execute(params: CreateWhiteboardViewInput, ctx: BuddyToolContext) {
    const sessionID = String(ctx.sessionID)
    const messageID = String(ctx.messageID)
    const callID = nullableCallID(ctx)
    const eventCallID = callID ?? createdByCallID(ctx)
    await ctx.ask({
      permission: "whiteboard_create_view",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })
    const whiteboardObject = params.objectID
      ? await readWhiteboardObject(ctx.directory, params.objectID)
      : await ensureWhiteboardObjectForToolCall(
          Object.assign(
            {
              directory: ctx.directory,
              reservation: {
                sessionID,
                messageID,
                callID: eventCallID,
              },
            },
            params.title ? { title: params.title } : undefined,
          ),
        )
    const objectID = whiteboardObject.objectID
    await ctx.metadata({
      title: "Opening Whiteboard",
      metadata: {
        objectID,
        benchAutoOpenCandidate: buildWhiteboardAutoOpenCandidate({
          objectID,
          sessionID,
          messageID,
          callID: eventCallID,
        }),
      },
    })
    dispatchBestEffortBenchPresent({
      directory: ctx.directory,
      sessionID,
      messageID,
      callID,
      autoOpen: {
        policyID: "whiteboard",
        eventKey: `whiteboard:${sessionID}:${messageID}:${eventCallID}`,
      },
      target: {
        type: "object",
        ref: {
          kind: BUDDY_OBJECT_KINDS.whiteboard,
          objectID,
          revisionID: null,
          itemID: null,
        },
        viewID: WHITEBOARD_CURRENT_VIEW_ID,
      },
    })
    const result = await applyWhiteboardDrawingProgram(
      Object.assign(
        {
          directory: ctx.directory,
          objectID,
        },
        params.title ? { title: params.title } : undefined,
        {
          elements: params.elements,
          writeMode: toWhiteboardProgramWriteMode(params.boardAction),
        },
      ),
    )
    const measuredBoard = result.saved
      ? await waitForCurrentWhiteboardRenderReport({
          directory: ctx.directory,
          objectID,
          boardID: result.boardID,
        })
      : undefined
    const layout = buildWhiteboardLayoutDigest(measuredBoard?.renderReport, {
      priorityElementIDs: new Set(result.layoutPriorityElementIDs),
    })
    const manifest = await readObjectManifest({
      directory: ctx.directory,
      kind: BUDDY_OBJECT_KINDS.whiteboard,
      objectID,
    })
    const buddyObjectResult = buildWhiteboardObjectResult({
      objectID,
      title: manifest.title,
      sessionID,
      messageID,
      callID: eventCallID,
    })
    return {
      title: "Updated Whiteboard",
      output: [
        result.saved
          ? `Whiteboard updated. Continuation handle: '${result.continuationHandle}'.`
          : `Whiteboard unchanged. Continuation handle: '${result.continuationHandle}'.`,
        ...formatBuddyObjectRefLines(buddyObjectResult.primaryRef),
        `If you need to edit this board again, first call whiteboard_read_context with objectID='${objectID}', then call whiteboard_create_view with the same objectID and boardAction='continue_current_board'.`,
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
      metadata: Object.assign(
        {
          buddyObjectResult,
          objectID,
          continuationHandle: result.continuationHandle,
          boardID: result.boardID,
          saved: result.saved,
          boardAction: params.boardAction,
          warnings: result.warnings,
        },
        layout ? { layout } : undefined,
      ),
    }
  },
})

export { CreateWhiteboardViewInputSchema, createWhiteboardViewTool }
