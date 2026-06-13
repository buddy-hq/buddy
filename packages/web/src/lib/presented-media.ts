import type {
  WorkspaceFilePanelItem,
  WorkspaceFilePanelMediaKind,
  WorkspaceFilePanelRenderMode,
} from "@/state/workspace-file-panel-store"
import type {
  MediaPresentationReadResponse,
  MediaPresentationResolveResponse,
} from "@buddy/sdk/types"
import type { WorkspaceFileActionInput } from "./use-workspace-file-open"
import { getBuddyClient, requireBuddyData } from "./buddy-client"

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

const WORKSPACE_FILE_PANEL_MEDIA_KINDS = [
  "image",
  "pdf",
  "presentation",
  "document",
  "spreadsheet",
  "video",
  "audio",
  "archive",
  "other",
] satisfies readonly WorkspaceFilePanelMediaKind[]

const WORKSPACE_FILE_PANEL_RENDER_MODES = [
  "image",
  "audio",
  "video",
  "pdf",
  "file",
] satisfies readonly WorkspaceFilePanelRenderMode[]

const PRESENTED_MEDIA_LAYOUTS = [
  "single",
  "gallery",
  "deck",
  "list",
] satisfies readonly PresentedMediaOutput["layout"][]

export type PresentedMediaItem = MediaPresentationReadResponse["summary"]["items"][number]
export type PresentedMediaActionCapabilities = PresentedMediaItem["actionCapabilities"]
export type PresentedMediaAvailability = PresentedMediaItem["availability"]
export type PresentedMediaPathInfo = MediaPresentationResolveResponse

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

export type PresentedMediaOutput = {
  artifactID: string
  kind: "media-presentation"
  layout: MediaPresentationReadResponse["summary"]["layout"]
  items: PresentedMediaItem[]
}

export type PresentedMediaAvailabilityResolution = {
  item: PresentedMediaItem
  availability: PresentedMediaAvailability
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

function readNonNegativeInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined
}

function isWorkspaceFilePanelMediaKind(value: string): value is WorkspaceFilePanelMediaKind {
  return WORKSPACE_FILE_PANEL_MEDIA_KINDS.some((kind) => kind === value)
}

function isWorkspaceFilePanelRenderMode(value: string): value is WorkspaceFilePanelRenderMode {
  return WORKSPACE_FILE_PANEL_RENDER_MODES.some((mode) => mode === value)
}

function isPresentedMediaLayout(value: string): value is PresentedMediaOutput["layout"] {
  return PRESENTED_MEDIA_LAYOUTS.some((layout) => layout === value)
}

export function readPresentedMediaItem(value: unknown): PresentedMediaItem | undefined {
  if (!isRecord(value)) return undefined

  const id = readNonEmptyString(value.id)
  const inputPath = readNonEmptyString(value.inputPath)
  const absolutePath = readNonEmptyString(value.absolutePath)
  const displayPath = readNonEmptyString(value.displayPath)
  const workspacePath = readNullableString(value.workspacePath)
  const fileName = readNonEmptyString(value.fileName)
  const mediaKind = readNonEmptyString(value.mediaKind)
  const renderMode = readNonEmptyString(value.renderMode)
  const rawUrl = readNonEmptyString(value.rawUrl)
  const validMediaKind =
    mediaKind && isWorkspaceFilePanelMediaKind(mediaKind) ? mediaKind : undefined
  const validRenderMode =
    renderMode && isWorkspaceFilePanelRenderMode(renderMode) ? renderMode : undefined

  if (
    !id ||
    !inputPath ||
    !absolutePath ||
    !displayPath ||
    !fileName ||
    !validMediaKind ||
    !validRenderMode ||
    !rawUrl
  ) {
    return undefined
  }

  return {
    id,
    inputPath,
    absolutePath,
    displayPath,
    workspacePath,
    fileName,
    mediaKind: validMediaKind,
    renderMode: validRenderMode,
    mimeType: readNullableString(value.mimeType),
    sizeBytes: readNonNegativeInt(value.sizeBytes) ?? null,
    modifiedAt: readNullableString(value.modifiedAt),
    rawUrl,
    actionCapabilities: isRecord(value.actionCapabilities)
      ? {
          canOpenDefaultApp: value.actionCapabilities.canOpenDefaultApp === true,
          canRevealInFileManager: value.actionCapabilities.canRevealInFileManager === true,
          canOpenInWorkspacePanel: value.actionCapabilities.canOpenInWorkspacePanel === true,
        }
      : {
          canOpenDefaultApp: false,
          canRevealInFileManager: false,
          canOpenInWorkspacePanel: false,
        },
    availability: isRecord(value.availability)
      ? {
          status:
            value.availability.status === "missing" || value.availability.status === "error"
              ? value.availability.status
              : "available",
          message: readNullableString(value.availability.message),
        }
      : {
          status: "available",
          message: null,
        },
  }
}

export function readPresentedMediaOutputValue(value: unknown): PresentedMediaOutput | undefined {
  if (!isRecord(value)) return undefined

  const artifactID = readNonEmptyString(value.artifactID)
  const kind = value.kind === "media-presentation" ? "media-presentation" : undefined
  const layoutValue = readNonEmptyString(value.layout)
  const layout =
    layoutValue && isPresentedMediaLayout(layoutValue) ? layoutValue : undefined
  const rawItems = Array.isArray(value.items) ? value.items : undefined

  if (!artifactID || !kind || !layout || !rawItems) return undefined

  const items: PresentedMediaItem[] = []
  for (const item of rawItems) {
    const parsedItem = readPresentedMediaItem(item)
    if (!parsedItem) return undefined
    items.push(parsedItem)
  }

  return {
    artifactID,
    kind,
    layout,
    items,
  }
}

export function readPresentedMediaOutputArtifact(
  metadata: Record<string, unknown>,
): PresentedMediaOutput | undefined {
  return readNonEmptyString(metadata.artifact) === "PresentedMediaOutput"
    ? readPresentedMediaOutputValue(metadata.value)
    : undefined
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

export function toWorkspaceFilePanelItem(
  item: PresentedMediaItem,
): WorkspaceFilePanelItem | undefined {
  if (!item.actionCapabilities.canOpenInWorkspacePanel || !item.workspacePath) return undefined
  const absolutePath = item.absolutePath.trim()
  return {
    path: item.workspacePath,
    ...(absolutePath ? { absolutePath } : {}),
  }
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
      input.item.actionCapabilities.canOpenInWorkspacePanel && input.item.workspacePath !== null,
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
  return requireBuddyData(
    await getBuddyClient(input.directory).mediaPresentation.resolve({
      directory: input.directory,
      path: input.path,
    }),
  )
}

export async function resolvePresentedMediaAvailability(
  directory: string,
  artifactID: string,
  item: PresentedMediaItem,
): Promise<PresentedMediaAvailabilityResolution> {
  try {
    const availability = requireBuddyData(
      await getBuddyClient(directory).mediaPresentation.availability({
        directory,
        artifactID,
        itemID: item.id,
      }),
    )
    return { item, availability }
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
  artifactID: string,
  item: PresentedMediaItem,
): Promise<PresentedMediaAvailability> {
  const result = await resolvePresentedMediaAvailability(directory, artifactID, item)
  return result.availability
}
