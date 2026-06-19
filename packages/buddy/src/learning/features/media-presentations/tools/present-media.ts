import z from "zod"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectResultSchema,
  formatBuddyObjectRefLines,
  nonEmptyString,
  objectSummaryBaseFromManifest,
  type BuddyObjectResult,
} from "../../../../objects"
import {
  buildPresentedMediaObjectOutput,
  MEDIA_PRESENTATION_KIND,
  normalizePresentedMediaPermissionPath,
  PresentedMediaValidationError,
  type PresentedMediaObjectOutput,
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

function buildPresentMediaObjectResult(input: {
  output: PresentedMediaObjectOutput
  title: string
}): BuddyObjectResult {
  const ref = {
    kind: BUDDY_OBJECT_KINDS.mediaPresentation,
    objectID: input.output.objectID,
    revisionID: null,
    itemID: null,
  }
  return BuddyObjectResultSchema.parse({
    version: 1,
    status: "ok",
    reason: null,
    message: `Presented ${input.output.items.length} media item${input.output.items.length === 1 ? "" : "s"}.`,
    primaryRef: ref,
    objects: [
      objectSummaryBaseFromManifest({
        kind: BUDDY_OBJECT_KINDS.mediaPresentation,
        objectID: input.output.objectID,
        title: input.title,
        status: "ready",
        lifecycle: "external-reference",
        sourceRoot: null,
      }),
    ],
    presentations: [
      {
        ref,
        viewID: "gallery",
        surface: "inline",
        data: {
          renderer: "media-gallery",
          layout: input.output.layout,
          items: input.output.items.map((item) => ({
            itemID: item.id,
            title: item.fileName,
            mediaType: item.mediaKind,
            mimeType: item.mimeType,
            source: {
              role: "external",
              path: item.absolutePath,
              displayPath: item.displayPath,
              workspacePath: item.workspacePath,
              availability: item.availability.status,
            },
            availability: item.availability.status,
            rawUrl: item.rawUrl,
            fileName: item.fileName,
          })),
        },
        autoOpen: null,
      },
    ],
  })
}

const presentMediaTool = createBuddyTool({
  id: "present_media",
  produces: {
    buddyObjectResult: true,
  },
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
      const result = await buildPresentedMediaObjectOutput({
        directory: ctx.directory,
        items: params.items.map((item) => ({
          path: item.path,
        })),
      })
      const buddyObjectResult = buildPresentMediaObjectResult({
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
