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
        "Compact JSON-array string containing Excalidraw shorthand elements and supported pseudo-elements. Omit restoreCheckpoint for a new scene. Begin with restoreCheckpoint when continuing a scene. Use update for patch-style edits, translate to move related ids together, and layoutCleanup immediately after restoreCheckpoint for one warning-driven repair pass. If layoutWarnings requests redraw_crowded_zone_once_before_reply, use layoutCleanup strategy redraw_zone with its redrawZone.id, delete exactly redrawZone.ids, recreate only that zone and its children with new ids in a substantially larger area, and keep every outside element unchanged.",
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
    const layoutCleanupOutput = result.layoutCleanup
      ? result.layoutCleanup.accepted
        ? `Roomy relayout accepted: hard collisions improved from ${result.layoutCleanup.hardBefore} to ${result.layoutCleanup.hardAfter}. Do not run another warning-driven relayout in this answer.`
        : `Roomy relayout rejected: hard collisions did not improve enough (${result.layoutCleanup.hardBefore} to ${result.layoutCleanup.hardAfter}). The previous whiteboard head remains active. Do not run another warning-driven relayout in this answer.`
      : undefined
    return {
      title: "Updated Whiteboard",
      output: [
        result.saved
          ? `Whiteboard scene updated at revision '${result.revisionID}'.`
          : `Whiteboard scene remains at revision '${result.revisionID}'.`,
        `Checkpoint/continuation handle: '${result.sceneID}'.`,
        "If the user asks for a new diagram, omit restoreCheckpoint and create a fresh whiteboard scene.",
        `If the user wants to edit this diagram, first call whiteboard_read_context, then start the next elements array with [{"type":"restoreCheckpoint","id":"${result.sceneID}"}, ...new elements...].`,
        'To remove elements, use {"type":"delete","ids":"<id1>,<id2>"} or {"type":"delete","id":"<id>"} before adding replacements.',
        'To patch an existing element, use {"type":"update","id":"<id>","x":760,"y":260}. To move related elements together, use {"type":"translate","ids":"<id1>,<id2>","dx":180,"dy":0}.',
        ...(layoutCleanupOutput ? [layoutCleanupOutput] : []),
        ...(result.warnings.length > 0
          ? [
              `The drawing was saved after skipping or normalizing ${result.warnings.length} recoverable issue(s):`,
              ...result.warnings.map((warning) => `- ${warning}`),
            ]
          : []),
        ...(result.layoutWarnings
          ? formatWhiteboardLayoutWarningsForModel(result.layoutWarnings)
          : []),
        "Use whiteboard_read_context before a precise follow-up edit.",
      ].join("\n"),
      metadata: {
        sceneID: result.sceneID,
        checkpointId: result.sceneID,
        revisionID: result.revisionID,
        saved: result.saved,
        warnings: result.warnings,
        ...(result.layoutWarnings ? { layoutWarnings: result.layoutWarnings } : {}),
        ...(result.layoutCleanup ? { layoutCleanup: result.layoutCleanup } : {}),
      },
    }
  },
})

export { CreateWhiteboardViewInputSchema, createWhiteboardViewTool }
