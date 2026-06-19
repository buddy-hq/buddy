import type { WorkspaceMediaKind, WorkspaceMediaRenderMode } from "./workspace-file-media"
import type { WorkspaceFileActionInput } from "./use-workspace-file-open"
import { getBuddyClient, requireBuddyData } from "./buddy-client"
import { classifyWorkspaceMedia } from "./workspace-file-media"
import { fileNameFromPath, normalizeRelativePath } from "./workspace-file-paths"

export const MAX_INLINE_PRESENTED_MEDIA_BYTES = 512 * 1024 * 1024

const LOCAL_MEDIA_EXTENSION_PATTERN = String.raw`(?:[a-z0-9][a-z0-9_+-]{0,15})`
const LOCAL_MEDIA_FILENAME_PATTERN = String.raw`[^\r\n/\\>'"()]+\.${LOCAL_MEDIA_EXTENSION_PATTERN}`
const LOCAL_MEDIA_CANDIDATE_PATTERN = String.raw`(?:file:\/\/[^\r\n>'"]*[\\/]${LOCAL_MEDIA_FILENAME_PATTERN}|~[\\/][^\r\n>'"]*[\\/]${LOCAL_MEDIA_FILENAME_PATTERN}|(?:[A-Za-z]:[\\/]|\/)[^\r\n>'"]*[\\/]${LOCAL_MEDIA_FILENAME_PATTERN}|(?:\.\.?[\\/]|[^\r\n>'"]+[\\/])[^\r\n>'"()]*[\\/]?${LOCAL_MEDIA_FILENAME_PATTERN})`
const LOCAL_MEDIA_CANDIDATE_REGEX = new RegExp(LOCAL_MEDIA_CANDIDATE_PATTERN, "giu")
const LOCAL_MEDIA_CANDIDATE_EXACT_REGEX = new RegExp(`^(?:${LOCAL_MEDIA_CANDIDATE_PATTERN})$`, "iu")
const LOCAL_MEDIA_CANDIDATE_PREFIX_BOUNDARY_REGEX = /[\s([{"'`:,;=-]/u
const LOCAL_MEDIA_CANDIDATE_SUFFIX_BOUNDARY_REGEX = /[\s)\]}>'"`.,;:!?]/u
const IMPLIED_ABSOLUTE_UNIX_PREFIX_REGEX =
  /^(?:Users|Applications|Library|System|Volumes|private|var|tmp|usr|opt|etc|home)\//u
const NOISY_PRESENTED_MEDIA_SEGMENTS = [
  ".git/",
  ".next/",
  ".turbo/",
  "node_modules/",
  "dist/",
  "build/",
  "coverage/",
  ".cache/",
  "tmp/",
  "temp/",
  ".tmp/",
  ".log",
  ".lock",
  ".map",
] as const

const WORKSPACE_MEDIA_KINDS = [
  "image",
  "pdf",
  "presentation",
  "document",
  "spreadsheet",
  "video",
  "audio",
  "archive",
  "other",
] satisfies readonly WorkspaceMediaKind[]

type PresentedMediaActionCapabilities = {
  canOpenDefaultApp: boolean
  canRevealInFileManager: boolean
  canOpenInBuddy: boolean
}

export type PresentedMediaAvailability = {
  status: "available" | "missing" | "error"
  message: string | null
}

export type PresentedMediaItem = {
  id: string
  inputPath: string
  absolutePath: string
  displayPath: string
  workspacePath: string | null
  fileName: string
  mediaKind: WorkspaceMediaKind
  renderMode: WorkspaceMediaRenderMode
  mimeType: string | null
  sizeBytes: number | null
  modifiedAt: string | null
  rawUrl: string | null
  actionCapabilities: PresentedMediaActionCapabilities
  availability: PresentedMediaAvailability
}

export type PresentedMediaPathInfo = Omit<PresentedMediaItem, "id" | "rawUrl">

type PresentedMediaActionInputSource = Pick<
  PresentedMediaPathInfo,
  | "absolutePath"
  | "displayPath"
  | "workspacePath"
  | "fileName"
  | "mimeType"
  | "sizeBytes"
  | "actionCapabilities"
  | "availability"
>

export type MediaPresentationOutput = {
  objectID: string
  kind: "media-presentation"
  layout: "single" | "grid" | "strip"
  items: PresentedMediaItem[]
}

export type PresentedMediaAvailabilityResolution = {
  item: PresentedMediaItem
  availability: PresentedMediaAvailability
}

type PresentedMediaInlineSource = {
  path: string
  displayPath?: string
  workspacePath?: string | null
  availability: "available" | "missing" | "error"
}

export type PresentedMediaInlineItem = {
  itemID: string
  title: string | null
  mediaType: string
  mimeType: string | null
  source: PresentedMediaInlineSource
  availability: "available" | "missing" | "error" | "unavailable"
  rawUrl: string | null
  fileName: string | null
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isWorkspaceMediaKind(value: string): value is WorkspaceMediaKind {
  return WORKSPACE_MEDIA_KINDS.some((kind) => kind === value)
}

function mediaRenderModeFromKind(kind: WorkspaceMediaKind): WorkspaceMediaRenderMode {
  if (kind === "image" || kind === "audio" || kind === "video" || kind === "pdf") return kind
  return "file"
}

function mediaAvailability(
  status: PresentedMediaInlineItem["availability"],
): PresentedMediaAvailability {
  if (status === "available" || status === "missing" || status === "error") {
    return { status, message: null }
  }
  return {
    status: "missing",
    message: "Media item is unavailable.",
  }
}

function actionCapabilitiesForWorkspacePath(
  workspacePath: string | null,
): PresentedMediaActionCapabilities {
  return {
    canOpenDefaultApp: true,
    canRevealInFileManager: true,
    canOpenInBuddy: workspacePath !== null,
  }
}

export function presentedMediaItemFromInlineItem(
  item: PresentedMediaInlineItem,
): PresentedMediaItem | undefined {
  const mediaKind = isWorkspaceMediaKind(item.mediaType) ? item.mediaType : undefined
  const fileName = readNonEmptyString(item.fileName) ?? readNonEmptyString(item.title)
  const displayPath = readNonEmptyString(item.source.displayPath) ?? item.source.path
  if (!mediaKind || !fileName) return undefined

  const workspacePath = item.source.workspacePath === undefined ? null : item.source.workspacePath
  const availability = mediaAvailability(item.availability)

  return {
    id: item.itemID,
    inputPath: displayPath,
    absolutePath: item.source.path,
    displayPath,
    workspacePath,
    fileName,
    mediaKind,
    renderMode: mediaRenderModeFromKind(mediaKind),
    mimeType: item.mimeType,
    sizeBytes: null,
    modifiedAt: null,
    rawUrl: item.rawUrl,
    actionCapabilities: actionCapabilitiesForWorkspacePath(workspacePath),
    availability,
  }
}

function isExternalPath(path: string): boolean {
  if (path.startsWith("file://")) return true
  if (path.startsWith("~/") || path === "~") return true
  if (path.startsWith("/")) return true
  if (/^[A-Za-z]:[/\\]/u.test(path)) return true
  if (path.includes("../") || path.includes("..\\")) return true
  return false
}

export function normalizePresentedMediaCandidatePath(path: string) {
  const normalized = path
    .trim()
    .replace(/^[([]+/gu, "")
    .replace(/^[*`]+/gu, "")
    .replace(/[),.;!?]+$/gu, "")
    .replace(/[\])]+$/gu, "")
    .replace(/[*`]+$/gu, "")

  if (
    IMPLIED_ABSOLUTE_UNIX_PREFIX_REGEX.test(normalized) &&
    !normalized.startsWith("/") &&
    !normalized.startsWith("~/") &&
    !normalized.startsWith("./") &&
    !normalized.startsWith("../") &&
    !normalized.startsWith("file://")
  ) {
    return `/${normalized}`
  }

  return normalized
}

export function isLikelyPresentedMediaPathCandidate(path: string) {
  const normalized = normalizePresentedMediaCandidatePath(path)
  if (normalized.length === 0) return false
  if (normalized.includes("<") || normalized.includes(">")) return false
  if (!LOCAL_MEDIA_CANDIDATE_EXACT_REGEX.test(normalized)) return false
  if (isExternalPath(normalized)) return false

  const lowered = normalized.toLowerCase()
  return !NOISY_PRESENTED_MEDIA_SEGMENTS.some((segment) => lowered.includes(segment))
}

export function isLikelyExternalMediaPathCandidate(path: string): boolean {
  const normalized = normalizePresentedMediaCandidatePath(path)
  if (normalized.length === 0) return false
  return isExternalPath(normalized)
}

export function collectPresentedMediaCandidatePaths(text: string) {
  return findPresentedMediaCandidateMatches(text).map((match) => match.path)
}

export function findPresentedMediaCandidateMatches(text: string) {
  return Array.from(text.matchAll(LOCAL_MEDIA_CANDIDATE_REGEX), (match) => {
    const candidate = normalizePresentedMediaCandidatePath(match[0])
    const startIndex = match.index ?? 0
    const endIndex = startIndex + match[0].length
    const before = startIndex > 0 ? text[startIndex - 1] : ""
    const after = endIndex < text.length ? text[endIndex] : ""

    if (before && !LOCAL_MEDIA_CANDIDATE_PREFIX_BOUNDARY_REGEX.test(before)) {
      return null
    }
    if (after && !LOCAL_MEDIA_CANDIDATE_SUFFIX_BOUNDARY_REGEX.test(after)) {
      return null
    }
    if (!candidate || !isLikelyPresentedMediaPathCandidate(candidate)) {
      return null
    }

    return {
      path: candidate,
      start: startIndex,
      end: endIndex,
    }
  }).filter((match): match is { path: string; start: number; end: number } => Boolean(match))
}

export function buildPresentedMediaFileActionInput(input: {
  item: PresentedMediaActionInputSource
  canOpenDefaultApp: boolean
  canReveal: boolean
}): WorkspaceFileActionInput {
  return {
    path: input.item.workspacePath ?? input.item.displayPath,
    absolutePath: input.item.absolutePath,
    name: input.item.fileName,
    available: input.item.availability.status === "available",
    canOpenInBuddy:
      input.item.actionCapabilities.canOpenInBuddy && input.item.workspacePath !== null,
    canOpenDefaultApp: input.item.actionCapabilities.canOpenDefaultApp && input.canOpenDefaultApp,
    canReveal: input.item.actionCapabilities.canRevealInFileManager && input.canReveal,
    mimeType: input.item.mimeType ?? undefined,
    sizeBytes: input.item.sizeBytes ?? undefined,
  }
}

export function isPresentedMediaOutsideNotebook(item: { workspacePath: string | null }) {
  return item.workspacePath === null
}

export async function resolvePresentedMediaPathInfo(input: {
  directory: string
  path: string
}): Promise<PresentedMediaPathInfo> {
  const normalized = normalizePresentedMediaCandidatePath(input.path)
  const workspacePath = isExternalPath(normalized) ? null : normalizeRelativePath(normalized)
  const displayPath = workspacePath ?? normalized
  const fileName = fileNameFromPath(displayPath)
  const classification = classifyWorkspaceMedia({
    path: displayPath,
    mimeType: undefined,
    sizeBytes: undefined,
  })

  return {
    inputPath: normalized,
    absolutePath: workspacePath ? "" : normalized,
    displayPath,
    workspacePath,
    fileName,
    mediaKind: classification.mediaKind,
    renderMode: classification.renderMode,
    mimeType: null,
    sizeBytes: null,
    modifiedAt: null,
    actionCapabilities: actionCapabilitiesForWorkspacePath(workspacePath),
    availability: {
      status: "available",
      message: null,
    },
  }
}

export async function resolvePresentedMediaAvailability(
  directory: string,
  objectID: string,
  item: PresentedMediaItem,
): Promise<PresentedMediaAvailabilityResolution> {
  try {
    const availability = requireBuddyData(
      await getBuddyClient(directory).objectMediaPresentation.availability({
        directory,
        objectID,
        itemID: item.id,
      }),
    )
    return {
      item: {
        ...item,
        availability,
      },
      availability,
    }
  } catch (error) {
    return {
      item,
      availability: {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

export async function readPresentedMediaAvailability(
  directory: string,
  objectID: string,
  item: PresentedMediaItem,
): Promise<PresentedMediaAvailability> {
  const result = await resolvePresentedMediaAvailability(directory, objectID, item)
  return result.availability
}
