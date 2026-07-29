import fs from "node:fs/promises"
import path from "node:path"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
import { mimeTypeForPath } from "../../../../http/mime"
import { resolveTrustedGeneratedImagePath } from "./generated-image-authorization"

const IMAGE_DATA_URL_PREFIX = "data:image/"
const BASE64_DATA_URL_ENCODING = ";base64"
const DEFAULT_IMAGE_MIME_TYPE = "application/octet-stream"
const IMAGE_INPUT_MAX_FILE_BYTES = 50 * 1024 * 1024
const IMAGE_INPUT_MAX_TOTAL_BYTES = 100 * 1024 * 1024

function isImageDataUrl(value: string): boolean {
  return value.startsWith(IMAGE_DATA_URL_PREFIX)
}

type RecentImageSource = { type: "data-url"; value: string } | { type: "path"; value: string }

type ReferencedImageInput = {
  imagePath: string
  mime: string
  size: number
}

type ResolvedRecentImageSource =
  | { type: "data-url"; value: string; size: number }
  | { type: "path"; input: ReferencedImageInput; size: number }

function imageSourcesFromPart(part: MessageV2.Part): RecentImageSource[] {
  if (part.type === "file") {
    return part.mime.startsWith("image/") && isImageDataUrl(part.url)
      ? [{ type: "data-url", value: part.url }]
      : []
  }

  if (part.type !== "tool" || part.state.status !== "completed") {
    return []
  }

  const attachments: RecentImageSource[] = (part.state.attachments ?? []).flatMap((attachment) =>
    attachment.mime.startsWith("image/") && isImageDataUrl(attachment.url)
      ? [{ type: "data-url" as const, value: attachment.url }]
      : [],
  )
  if (attachments.length > 0) return attachments

  const savedPath = part.state.metadata.savedPath
  return part.tool === "imagegen" && typeof savedPath === "string"
    ? [{ type: "path", value: savedPath }]
    : []
}

export async function recentConversationImageDataUrls(
  messages: readonly MessageV2.WithParts[],
  count: number,
  sessionID: string,
): Promise<string[]> {
  const sources: RecentImageSource[] = []

  for (const message of messages.toReversed()) {
    for (const part of message.parts.toReversed()) {
      for (const source of imageSourcesFromPart(part).toReversed()) {
        sources.push(source)
        if (sources.length === count) {
          return resolveRecentImageSources(sources.toReversed(), messages, sessionID)
        }
      }
    }
  }

  return resolveRecentImageSources(sources.toReversed(), messages, sessionID)
}

function imageDataUrlByteLength(dataUrl: string): number {
  const separator = dataUrl.indexOf(",")
  const metadata = separator === -1 ? "" : dataUrl.slice(0, separator).toLowerCase()
  if (separator === -1 || !metadata.endsWith(BASE64_DATA_URL_ENCODING)) {
    throw new Error("Recent conversation image must be a base64 data URL.")
  }

  const payload = dataUrl.slice(separator + 1)
  const paddingBytes = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0
  return Math.max(0, Math.floor((payload.length * 3) / 4) - paddingBytes)
}

function assertImageInputFileSize(size: number, label: string, imagePath?: string): void {
  if (size > IMAGE_INPUT_MAX_FILE_BYTES) {
    throw new Error(
      `${label} exceeds the ${IMAGE_INPUT_MAX_FILE_BYTES}-byte limit${imagePath ? `: ${imagePath}` : "."}`,
    )
  }
}

function assertImageInputTotalSize(inputs: readonly { size: number }[]): void {
  const totalBytes = inputs.reduce((total, input) => total + input.size, 0)
  if (totalBytes > IMAGE_INPUT_MAX_TOTAL_BYTES) {
    throw new Error(`Image inputs exceed the ${IMAGE_INPUT_MAX_TOTAL_BYTES}-byte aggregate limit.`)
  }
}

async function inspectReferencedImage(imagePath: string): Promise<ReferencedImageInput> {
  if (!path.isAbsolute(imagePath)) {
    throw new Error(`Referenced image path must be absolute: ${imagePath}`)
  }

  const mime = mimeTypeForPath(imagePath, DEFAULT_IMAGE_MIME_TYPE)
  if (!mime.startsWith("image/")) {
    throw new Error(`Referenced file is not a supported image: ${imagePath}`)
  }

  const stats = await fs.stat(imagePath)
  if (!stats.isFile()) {
    throw new Error(`Referenced image path is not a file: ${imagePath}`)
  }
  assertImageInputFileSize(stats.size, "Referenced image", imagePath)

  return { imagePath, mime, size: stats.size }
}

async function readReferencedImage(input: ReferencedImageInput): Promise<string> {
  const bytes = await fs.readFile(input.imagePath)
  return `data:${input.mime};base64,${bytes.toString("base64")}`
}

async function resolveRecentImageSources(
  sources: readonly RecentImageSource[],
  messages: readonly MessageV2.WithParts[],
  sessionID: string,
): Promise<string[]> {
  const inputs: ResolvedRecentImageSource[] = await Promise.all(
    sources.map(async (source) => {
      if (source.type === "data-url") {
        const size = imageDataUrlByteLength(source.value)
        assertImageInputFileSize(size, "Recent conversation image")
        return { ...source, size }
      }

      const trustedPath = await resolveTrustedGeneratedImagePath(source.value, {
        messages,
        sessionID,
      })
      if (!trustedPath) {
        throw new Error(
          "Recent conversation image is not a trusted generated output from the current session.",
        )
      }
      const input = await inspectReferencedImage(trustedPath)
      return { type: "path", input, size: input.size }
    }),
  )
  assertImageInputTotalSize(inputs)

  return Promise.all(
    inputs.map((input) =>
      input.type === "data-url" ? input.value : readReferencedImage(input.input),
    ),
  )
}

export async function referencedImageDataUrls(paths: readonly string[]): Promise<string[]> {
  const inputs = await Promise.all(paths.map(inspectReferencedImage))
  assertImageInputTotalSize(inputs)
  return Promise.all(inputs.map(readReferencedImage))
}

export { IMAGE_INPUT_MAX_FILE_BYTES, IMAGE_INPUT_MAX_TOTAL_BYTES }
