import fsp from "node:fs/promises"
import path from "node:path"
import { isWorkspaceImagePath } from "@buddy/workspace-file-policy"
import { parseNodeErrorCode } from "../storage/parse-node-error"
import { isPathInsideDirectory } from "../storage/path-containment"
import { NotesError } from "./errors"
import { activateNotesLibraryRoot } from "./library-index"

const NODE_ERROR_NOT_FOUND = "ENOENT" as const
const IMAGE_NAME_INDEX_REFRESH_MS = 10_000

type ImageNameIndex = {
  root: string
  builtAt: number
  pathsByName: Map<string, string[]>
}

let imageNameIndex: ImageNameIndex | undefined

function decodeImageSource(src: string) {
  const withoutSuffix = src.trim().split(/[?#]/u, 1)[0] ?? ""
  try {
    return decodeURIComponent(withoutSuffix)
  } catch {
    return withoutSuffix
  }
}

async function existingImageInsideLibrary(realRoot: string, candidate: string) {
  const realPath = await fsp.realpath(candidate).catch((error) => {
    if (parseNodeErrorCode(error) === NODE_ERROR_NOT_FOUND) return undefined
    throw error
  })
  if (!realPath || !isPathInsideDirectory(realRoot, realPath) || !isWorkspaceImagePath(realPath)) {
    return undefined
  }
  const stats = await fsp.stat(realPath)
  return stats.isFile() ? realPath : undefined
}

async function collectImagesByName(root: string) {
  const pathsByName = new Map<string, string[]>()
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    if (!directory) break
    const entries = await fsp.readdir(directory, { withFileTypes: true }).catch((error) => {
      if (parseNodeErrorCode(error) === NODE_ERROR_NOT_FOUND) return []
      throw error
    })
    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue
      const filepath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        pending.push(filepath)
      } else if (entry.isFile() && isWorkspaceImagePath(entry.name)) {
        const name = entry.name.toLowerCase()
        pathsByName.set(name, [...(pathsByName.get(name) ?? []), filepath])
      }
    }
  }
  return pathsByName
}

function closestFirst(noteDirectory: string, filepaths: readonly string[]) {
  return filepaths.toSorted((left, right) => {
    const leftNearby = isPathInsideDirectory(noteDirectory, left) ? 0 : 1
    const rightNearby = isPathInsideDirectory(noteDirectory, right) ? 0 : 1
    return leftNearby - rightNearby || left.length - right.length || left.localeCompare(right)
  })
}

async function findImageByName(input: {
  root: string
  realRoot: string
  noteDirectory: string
  name: string
}) {
  for (;;) {
    const cached = imageNameIndex?.root === input.root ? imageNameIndex : undefined
    const index = cached ?? {
      root: input.root,
      builtAt: Date.now(),
      pathsByName: await collectImagesByName(input.root),
    }
    imageNameIndex = index
    const candidates = index.pathsByName.get(input.name) ?? []
    for (const candidate of closestFirst(input.noteDirectory, candidates)) {
      const found = await existingImageInsideLibrary(input.realRoot, candidate)
      if (found) return found
    }
    if (!cached || Date.now() - cached.builtAt < IMAGE_NAME_INDEX_REFRESH_MS) return undefined
    imageNameIndex = undefined
  }
}

export async function resolveNoteImage(input: { notePath?: string; src: string }) {
  const root = await activateNotesLibraryRoot()
  const realRoot = await fsp.realpath(root).catch(() => {
    throw new NotesError(404, "Image not found")
  })
  const decodedSrc = decodeImageSource(input.src)
    .replaceAll("\\", "/")
    .replace(/^(?:\.\/)+/u, "")
  const rootRelative = decodedSrc.startsWith("/")
  const src = decodedSrc.replace(/^\/+/u, "")
  if (!src || path.win32.isAbsolute(src) || !isWorkspaceImagePath(src)) {
    throw new NotesError(404, "Image not found")
  }

  const notePath = input.notePath?.trim().replaceAll("\\", "/")
  const noteFile = notePath ? path.resolve(root, notePath) : undefined
  const noteDirectory =
    noteFile && isPathInsideDirectory(root, noteFile) ? path.dirname(noteFile) : root
  const candidates = rootRelative
    ? [path.resolve(root, src)]
    : [path.resolve(noteDirectory, src), path.resolve(root, src)]

  for (const candidate of candidates) {
    if (!isPathInsideDirectory(root, candidate)) continue
    const found = await existingImageInsideLibrary(realRoot, candidate)
    if (found) return found
  }

  const found = await findImageByName({
    root,
    realRoot,
    noteDirectory,
    name: path.posix.basename(src).toLowerCase(),
  })
  if (!found) throw new NotesError(404, "Image not found")
  return found
}
