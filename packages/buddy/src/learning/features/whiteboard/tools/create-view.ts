import z from "zod"
import CREATE_VIEW_DESCRIPTION from "./create-view.md"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"
import { applyWhiteboardDrawingProgram } from "../service/program"
import { formatWhiteboardLayoutWarningsForModel } from "../service/layout-warnings"

const CreateWhiteboardViewInputSchema = z
  .object({
    elements: z
      .string()
      .trim()
      .min(2)
      .describe(
        "JSON array string of Excalidraw elements and Buddy whiteboard control objects. Must be valid JSON: no comments, no trailing commas. Keep compact. The argument is already a string field, so write plain JSON inside it, not a second escaped JSON string. To continue the current board, start the array with restoreCheckpoint.",
      ),
  })
  .strict()

type CreateWhiteboardViewInput = z.infer<typeof CreateWhiteboardViewInputSchema>

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
    })
    return {
      title: "Updated Whiteboard",
      output: [
        result.saved
          ? `Whiteboard updated. Continuation handle: '${result.continuationHandle}'.`
          : `Whiteboard unchanged. Continuation handle: '${result.continuationHandle}'.`,
        `If you need to edit this board again, first call whiteboard_read_context, then start the next elements array with [{"type":"restoreCheckpoint","id":"${result.continuationHandle}"}, ...new elements...].`,
        "Omit restoreCheckpoint only when intentionally replacing the current board from scratch.",
        'To remove elements, use {"type":"delete","ids":"<id1>,<id2>"} or {"type":"delete","id":"<id>"} before adding replacements.',
        'To move related elements together, use {"type":"translate","ids":"<id1>,<id2>","dx":180,"dy":0}. For local redesigns, delete the old ids and redraw that area with new ids.',
        ...(result.warnings.length > 0
          ? [
              `The drawing was saved after skipping or normalizing ${result.warnings.length} recoverable issue(s):`,
              ...result.warnings.map((warning) => `- ${warning}`),
            ]
          : []),
        ...(result.layoutWarnings
          ? formatWhiteboardLayoutWarningsForModel(result.layoutWarnings)
          : []),
      ].join("\n"),
      metadata: {
        checkpointId: result.continuationHandle,
        boardID: result.boardID,
        saved: result.saved,
        warnings: result.warnings,
        ...(result.layoutWarnings ? { layoutWarnings: result.layoutWarnings } : {}),
      },
    }
  },
})

export { CreateWhiteboardViewInputSchema, createWhiteboardViewTool }
