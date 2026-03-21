import fs from "node:fs/promises"
import path from "node:path"
import { Project as OpenCodeProject } from "@buddy/opencode-adapter/project"
import { Global } from "../storage/global"
import { allowedDirectoryRoots, isAllowedDirectory, resolveDirectory } from "./directory"
import { projectUpdateErrorMessage } from "./orchestration/project-operations"

const OPEN_PROJECTS_FILENAME = "desktop-notebooks.json"

class OpenProjectRegistryError extends Error {
  status: 400 | 403

  constructor(status: 400 | 403, message: string) {
    super(message)
    this.name = "OpenProjectRegistryError"
    this.status = status
  }
}

let writeQueue = Promise.resolve()

function registryPath() {
  return path.join(Global.Path.state, OPEN_PROJECTS_FILENAME)
}

function normalizeRegistryDirectory(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  const directory = resolveDirectory(trimmed)
  if (!directory || directory === "/") return undefined
  return directory
}

function normalizeRegistryDirectories(entries: unknown) {
  if (!Array.isArray(entries)) return []

  const unique = new Set<string>()
  const directories: string[] = []

  for (const entry of entries) {
    if (typeof entry !== "string") continue
    const normalized = normalizeRegistryDirectory(entry)
    if (!normalized || unique.has(normalized)) continue
    unique.add(normalized)
    directories.push(normalized)
  }

  return directories
}

async function readRegistryFile() {
  try {
    const raw = await fs.readFile(registryPath(), "utf8")
    return normalizeRegistryDirectories(JSON.parse(raw))
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return []
    }
    return []
  }
}

async function writeRegistryFile(directories: string[]) {
  const targetPath = registryPath()
  await fs.mkdir(path.dirname(targetPath), { recursive: true })

  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`
  const payload = `${JSON.stringify(directories, null, 2)}\n`

  await fs.writeFile(tempPath, payload, "utf8")
  await fs.rename(tempPath, targetPath)
}

async function updateRegistry(mutator: (current: string[]) => Promise<string[]> | string[]) {
  const resultPromise = writeQueue.then(async () => {
    const current = await readRegistryFile()
    const next = normalizeRegistryDirectories(await mutator(current))
    await writeRegistryFile(next)
    return next
  })

  writeQueue = resultPromise.then(
    () => undefined,
    () => undefined,
  )

  return resultPromise
}

function requireRegistryDirectory(rawDirectory: string) {
  const directory = normalizeRegistryDirectory(rawDirectory)
  if (!directory) {
    throw new OpenProjectRegistryError(400, "Directory is required")
  }
  return directory
}

function sameDirectorySet(left: string[], right: string[]) {
  if (left.length !== right.length) return false

  const leftSet = new Set(left)
  if (leftSet.size !== left.length) return false

  for (const entry of right) {
    if (!leftSet.has(entry)) return false
  }

  return true
}

export async function listOpenProjects() {
  return readRegistryFile()
}

export async function openProjectRegistryEntry(rawDirectory: string) {
  const directory = requireRegistryDirectory(rawDirectory)
  if (!isAllowedDirectory(directory, allowedDirectoryRoots())) {
    throw new OpenProjectRegistryError(403, "Directory is outside allowed roots")
  }

  try {
    await OpenCodeProject.fromDirectory(directory)
  } catch (error) {
    throw new OpenProjectRegistryError(400, projectUpdateErrorMessage(error))
  }

  await updateRegistry((current) => (current.includes(directory) ? current : [directory, ...current]))
  return directory
}

export async function closeOpenProjectRegistryEntry(rawDirectory: string) {
  const directory = requireRegistryDirectory(rawDirectory)

  await updateRegistry((current) => current.filter((entry) => entry !== directory))
  return directory
}

export async function reorderOpenProjectRegistryEntries(rawDirectories: string[]) {
  const directories = normalizeRegistryDirectories(rawDirectories)
  return updateRegistry((current) => {
    if (!sameDirectorySet(current, directories)) {
      throw new OpenProjectRegistryError(400, "Directory order must match the current open-project set")
    }
    return directories
  })
}

export function isOpenProjectRegistryError(error: unknown): error is OpenProjectRegistryError {
  return error instanceof OpenProjectRegistryError
}
