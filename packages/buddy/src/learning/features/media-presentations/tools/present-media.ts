import z from "zod"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"
import { nonEmptyString } from "../../../../artifacts"
import {
  buildPresentedMediaOutput,
  MEDIA_PRESENTATION_KIND,
  normalizePresentedMediaPermissionPath,
  PresentedMediaValidationError,
} from "../service/file-media"

const PresentMediaInputSchema = z.object({
  items: z
    .array(
      z.object({
        path: nonEmptyString,
      }),
    )
    .min(1)
    .max(12),
})

type PresentMediaInput = z.infer<typeof PresentMediaInputSchema>

const presentMediaTool = createBuddyTool({
  id: "present_media",
  description:
    "Present one or more existing local files to the learner inside Buddy's conversation UI. Use this after creating or finding a learner-facing file that should be shown now. Paths may be workspace-relative, absolute local paths, file:// URLs, or ~/ home-relative paths. Use one call with multiple items for related files and avoid temporary or intermediate outputs.",
  parameters: PresentMediaInputSchema,
  async execute(params: PresentMediaInput, ctx) {
    const permissionPaths = params.items.map((item) =>
      normalizePresentedMediaPermissionPath(ctx.directory, item.path),
    )

    await ctx.ask({
      permission: "present_media",
      patterns: permissionPaths,
      always: permissionPaths,
      metadata: {
        kind: MEDIA_PRESENTATION_KIND,
      },
    })

    try {
      const output = await buildPresentedMediaOutput({
        directory: ctx.directory,
        items: params.items.map((item) => ({
          path: item.path,
        })),
      })

      return {
        title: "Presented media",
        output: `Presented ${output.items.length} media item${output.items.length === 1 ? "" : "s"}.`,
        metadata: {
          artifact: "PresentedMediaOutput",
          value: output,
        },
      }
    } catch (error) {
      if (error instanceof PresentedMediaValidationError) {
        throw new Error(error.message, { cause: error })
      }
      throw error
    }
  },
})

export { presentMediaTool, PresentMediaInputSchema }
export type { PresentMediaInput }
