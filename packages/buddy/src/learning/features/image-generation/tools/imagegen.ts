import path from "node:path"
import z from "zod"
import { formatBuddyObjectRefLines } from "../../../../objects"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"
import {
  buildPresentedMediaObjectOutput,
  PresentedMediaValidationError,
} from "../../media-presentations/service/file-media"
import { buildPresentedMediaObjectResult } from "../../media-presentations/service/object-result"
import IMAGEGEN_DESCRIPTION from "../imagegen-description.md"
import { codexImagesClient } from "../service/codex-images"
import {
  IMAGE_TITLE_MAX_CHARACTERS,
  generatedImageProvenance,
  resolveGeneratedImageTitle,
  saveGeneratedImage,
} from "../service/generated-image"
import { resolveTrustedGeneratedImagePath } from "../service/generated-image-authorization"
import { recentConversationImageDataUrls, referencedImageDataUrls } from "../service/image-inputs"
import { IMAGE_EDIT_TARGET_MAX } from "../contracts"
import { authorizeFileReadPaths } from "../../../runtime/external-file-authorization"

function isAbsoluteImagePath(imagePath: string): boolean {
  return path.posix.isAbsolute(imagePath) || path.win32.isAbsolute(imagePath)
}

const ImagegenInputSchema = z
  .object({
    prompt: z
      .string()
      .min(1)
      .describe("Complete image generation or editing instructions for the image model."),
    title: z
      .string()
      .trim()
      .min(1)
      .max(IMAGE_TITLE_MAX_CHARACTERS)
      .optional()
      .describe(
        "Short semantic title for the resulting image, ideally 2 to 6 words. Do not include a path, filename, extension, or slug.",
      ),
    referenced_image_paths: z
      .array(z.string().refine(isAbsoluteImagePath, "Image paths must be absolute."))
      .max(IMAGE_EDIT_TARGET_MAX)
      .optional()
      .describe(
        "Absolute paths of up to 5 genuine local image files to edit or use as visual references. Use only when the targets are not already attached or available in recent conversation context.",
      ),
    num_last_images_to_include: z
      .number()
      .int()
      .min(1)
      .max(IMAGE_EDIT_TARGET_MAX)
      .optional()
      .describe(
        "Number of most recent conversation images to use as edit references. Prefer this for attached images and images produced by earlier imagegen calls.",
      ),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.referenced_image_paths?.length && input.num_last_images_to_include !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Provide only one of `referenced_image_paths` or `num_last_images_to_include`.",
      })
    }
  })

type ImagegenInput = z.infer<typeof ImagegenInputSchema>

function parseToolInputString<TValue>(value: TValue): string | undefined {
  const parsed = z.string().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

async function authorizeReferencedImagePaths(
  imagePaths: readonly string[],
  ctx: Pick<BuddyToolContext, "ask" | "directory" | "messages" | "sessionID">,
): Promise<string[]> {
  const trustedPaths = await Promise.all(
    imagePaths.map((imagePath) =>
      resolveTrustedGeneratedImagePath(imagePath, {
        messages: ctx.messages,
        sessionID: String(ctx.sessionID),
      }),
    ),
  )
  const untrustedPaths = imagePaths.filter((_, index) => trustedPaths[index] === undefined)
  const authorizedUntrustedPaths = await authorizeFileReadPaths(untrustedPaths, ctx)
  let authorizedUntrustedIndex = 0

  return trustedPaths.map((trustedPath) => {
    if (trustedPath) return trustedPath
    const authorizedPath = authorizedUntrustedPaths[authorizedUntrustedIndex]
    authorizedUntrustedIndex += 1
    if (!authorizedPath) {
      throw new Error("Expected one authorized image path.")
    }
    return authorizedPath
  })
}

async function resolveImageDataUrls(input: ImagegenInput, ctx: BuddyToolContext) {
  if (input.referenced_image_paths?.length) {
    const authorizedPaths = await authorizeReferencedImagePaths(input.referenced_image_paths, ctx)
    return referencedImageDataUrls(authorizedPaths)
  }

  if (input.num_last_images_to_include === undefined) {
    return []
  }

  const imageDataUrls = await recentConversationImageDataUrls(
    ctx.messages,
    input.num_last_images_to_include,
    String(ctx.sessionID),
  )
  if (imageDataUrls.length !== input.num_last_images_to_include) {
    throw new Error(
      `Requested the last ${input.num_last_images_to_include} conversation images, but only ${imageDataUrls.length} were available.`,
    )
  }
  return imageDataUrls
}

const imagegenTool = createBuddyTool({
  id: "imagegen",
  produces: {
    buddyObjectResult: true,
  },
  description: IMAGEGEN_DESCRIPTION,
  parameters: ImagegenInputSchema,
  presentation: {
    archetype: "inline-output",
    icon: "image",
    renderer: "image-generation",
    layoutRole: "media-output",
    collection: "image-gallery",
    phases: {
      pending: {
        action: "Generating image",
        detail: ({ input }) => parseToolInputString(input.title),
      },
      running: {
        action: "Generating image",
        detail: ({ input }) => parseToolInputString(input.title),
      },
      completed: {
        action: "Generated image",
        detail: ({ input }) => parseToolInputString(input.title),
      },
      error: {
        action: "Failed to generate image",
        detail: ({ input }) => parseToolInputString(input.title),
      },
    },
  },
  async execute(input, ctx) {
    const imageTitle = resolveGeneratedImageTitle(input)
    const imageDataUrls = await resolveImageDataUrls(input, ctx)
    const generated = await codexImagesClient.createImage({
      prompt: input.prompt,
      imageDataUrls,
      signal: ctx.abort,
    })
    ctx.abort.throwIfAborted()

    const savedImage = await saveGeneratedImage(
      Object.assign(
        {
          sessionID: String(ctx.sessionID),
          title: imageTitle,
          base64: generated.base64,
        },
        ctx.callID ? { callID: ctx.callID } : undefined,
      ),
    )
    const savedPath = savedImage.path
    try {
      const presentation = await buildPresentedMediaObjectOutput({
        directory: ctx.directory,
        title: imageTitle,
        items: [{ path: savedPath }],
      })
      const buddyObjectResult = buildPresentedMediaObjectResult({
        output: presentation.output,
        title: presentation.manifest.title,
        message: `Generated image saved to ${savedPath}.`,
      })

      return {
        title: generated.operation === "generate" ? "Generated image" : "Edited image",
        output: [
          buddyObjectResult.message,
          ...formatBuddyObjectRefLines(buddyObjectResult.primaryRef),
        ].join("\n"),
        metadata: Object.assign(
          {
            buddyObjectResult,
            savedPath,
            operation: generated.operation,
            referenceImageCount: imageDataUrls.length,
          },
          ctx.callID
            ? {
                generatedImageProvenance: generatedImageProvenance({
                  image: savedImage,
                  sessionID: String(ctx.sessionID),
                  callID: ctx.callID,
                }),
              }
            : undefined,
        ),
      }
    } catch (error) {
      if (error instanceof PresentedMediaValidationError) {
        throw new Error(error.message, { cause: error })
      }
      throw error
    }
  },
})

export { imagegenTool, ImagegenInputSchema, authorizeReferencedImagePaths }
export type { ImagegenInput }
