import z from "zod"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"
import { formatBuddyObjectRefLines, nonEmptyString } from "../../../../objects"
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
        path: nonEmptyString.describe(
          "Existing local file to show: a workspace-relative path, absolute path, file:// URL, or ~/ path. Never invent a path.",
        ),
      }),
    )
    .min(1)
    .max(12)
    .describe("One to twelve related files to show together, in display order."),
})

type PresentMediaInput = z.infer<typeof PresentMediaInputSchema>

const presentMediaTool = createBuddyTool({
  id: "present_media",
  produces: {
    buddyObjectResult: true,
  },
  description: [
    "Show one or more existing local files to the user inline in the chat as a media gallery: images, PDFs, video, audio, or other media. Use it when the user should see a file now, such as a photograph or figure you saved, an image the user provided, a recording, or a file produced by another step. Group related files in one call and leave out temporary or intermediate outputs.",
    "",
    "Paths may be workspace-relative, absolute local paths, file:// URLs, or ~/ home-relative paths; paths outside the workspace ask the user for permission.",
    "",
    "Use present_html_widget for HTML, and skip this for plots the calculator already returned or images imagegen already displayed. Readable books, papers, and chapters belong in the resource pipeline and the Bench reader rather than a gallery. To show a web page, online video, or simulation, open it in the Browser.",
    "",
    "The gallery is saved as a media object; move it onto the Bench with bench_present present_object when the user will keep working with it.",
  ].join("\n"),
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
