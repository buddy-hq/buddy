import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectResultSchema,
  objectSummaryBaseFromManifest,
  type BuddyObjectResult,
} from "../../../../objects"
import type { PresentedMediaObjectOutput } from "./file-media"

export function buildPresentedMediaObjectResult(input: {
  output: PresentedMediaObjectOutput
  title: string
  message?: string
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
    message:
      input.message ??
      `Presented ${input.output.items.length} media item${input.output.items.length === 1 ? "" : "s"}.`,
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
            sizeBytes: item.sizeBytes,
            modifiedAt: item.modifiedAt,
          })),
        },
        autoOpen: null,
      },
    ],
  })
}
