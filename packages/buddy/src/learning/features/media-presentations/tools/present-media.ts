import z from "zod"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"
import {
  formatBuddyObjectRefLines,
  nonEmptyString,
} from "../../../../objects"
import {
  buildPresentedMediaObjectOutput,
  MEDIA_PRESENTATION_KIND,
  normalizePresentedMediaPermissionPath,
  PresentedMediaValidationError,
} from "../service/file-media"
import { buildPresentedMediaObjectResult } from "../service/object-result"
import { authorizeFileReadPaths } from "../../../runtime/external-file-authorization"

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
  produces: {
    buddyObjectResult: true,
  },
  description:
    "Present one or more existing local files to the learner inside Buddy's conversation UI. Use this after creating or finding a learner-facing file that should be shown now. Paths may be workspace-relative, absolute local paths, file:// URLs, or ~/ home-relative paths. Use one call with multiple items for related files and avoid temporary or intermediate outputs.",
  parameters: PresentMediaInputSchema,
  presentation: {
    archetype: "inline-output",
    icon: "image",
    renderer: "media",
    layoutRole: "media-output",
    phases: {
      pending: { action: "Preparing media" },
      running: { action: "Presenting media" },
      completed: { action: "Presented media" },
      error: { action: "Failed to present media" },
    },
  },
  async execute(params: PresentMediaInput, ctx) {
    const permissionPaths = params.items.map((item) =>
      normalizePresentedMediaPermissionPath(ctx.directory, item.path),
    )
    const authorizedPaths = await authorizeFileReadPaths(permissionPaths, ctx)

    await ctx.ask({
      permission: "present_media",
      patterns: authorizedPaths,
      always: authorizedPaths,
      metadata: {
        kind: MEDIA_PRESENTATION_KIND,
      },
    })

    try {
      const result = await buildPresentedMediaObjectOutput({
        directory: ctx.directory,
        items: authorizedPaths.map((authorizedPath) => ({ path: authorizedPath })),
      })
      const buddyObjectResult = buildPresentedMediaObjectResult({
        output: result.output,
        title: result.manifest.title,
      })

      return {
        title: "Presented media",
        output: [
          buddyObjectResult.message,
          ...formatBuddyObjectRefLines(buddyObjectResult.primaryRef),
        ].join("\n"),
        metadata: {
          buddyObjectResult,
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
