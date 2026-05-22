import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { resolveDirectory } from "./directory"
import { Global } from "../storage/global"

const PROJECT_METADATA_FILENAME = "projects.json"
const PROJECT_HASH_LENGTH = 16
const PROJECT_ID_PREFIX = "pi"
const GIT_MARKER_NAME = ".git"

export type ProjectIcon = {
  url?: string
  override?: string
  color?: string
}

export type ProjectCommands = {
  start?: string
}

export type BuddyProjectInfo = {
  id: string
  worktree: string
  vcs?: "git"
  name?: string
  icon?: ProjectIcon
  commands?: ProjectCommands
  time: {
    created: number
    updated: number
    initialized?: number
  }
  sandboxes: string[]
}

export type BuddyProjectUpdate = {
  name?: string
  icon?: ProjectIcon
  commands?: ProjectCommands
}

type ProjectStore = Record<string, BuddyProjectInfo>
type ErrnoLike = {
  code?: unknown
}

let writeQueue = Promise.resolve()

function projectMetadataPath() {
  return path.join(Global.Path.state, PROJECT_METADATA_FILENAME)
}

function projectIDForWorktree(worktree: string) {
  const hash = createHash("sha256").update(worktree).digest("hex").slice(0, PROJECT_HASH_LENGTH)
  return `${PROJECT_ID_PREFIX}-${hash}`
}

async function readProjectStore(): Promise<ProjectStore> {
  try {
    const raw = await fs.readFile(projectMetadataPath(), "utf8")
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }

    const entries = Object.entries(parsed).filter((entry): entry is [string, BuddyProjectInfo] => {
      const [key, value] = entry
      return (
        typeof key === "string" && !!value && typeof value === "object" && !Array.isArray(value)
      )
    })
    return Object.fromEntries(entries)
  } catch (error) {
    const code = readErrnoCode(error)
    if (code === "ENOENT") {
      return {}
    }
    return {}
  }
}

function readErrnoCode(error: unknown) {
  if (!error || typeof error !== "object") return undefined
  const value: ErrnoLike = error
  return typeof value.code === "string" ? value.code : undefined
}

async function writeProjectStore(store: ProjectStore) {
  const targetPath = projectMetadataPath()
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8")
  await fs.rename(tempPath, targetPath)
}

async function updateProjectStore(
  mutator: (store: ProjectStore) => Promise<ProjectStore> | ProjectStore,
): Promise<ProjectStore> {
  const resultPromise = writeQueue.then(async () => {
    const current = await readProjectStore()
    const next = await mutator(current)
    await writeProjectStore(next)
    return next
  })

  writeQueue = resultPromise.then(
    () => undefined,
    () => undefined,
  )

  return resultPromise
}

async function fileExists(candidate: string) {
  try {
    await fs.stat(candidate)
    return true
  } catch {
    return false
  }
}

async function resolveProjectRoot(directory: string) {
  const normalizedDirectory = resolveDirectory(directory)
  let current = normalizedDirectory

  while (true) {
    if (await fileExists(path.join(current, GIT_MARKER_NAME))) {
      return {
        directory: normalizedDirectory,
        worktree: current,
        vcs: "git" as const,
      }
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return {
        directory: normalizedDirectory,
        worktree: normalizedDirectory,
      }
    }
    current = parent
  }
}

function defaultProjectName(worktree: string) {
  const basename = path.basename(worktree)
  return basename.trim().length > 0 ? basename : worktree
}

function normalizeProjectInfo(info: BuddyProjectInfo): BuddyProjectInfo {
  return {
    ...info,
    worktree: resolveDirectory(info.worktree),
    sandboxes: Array.from(new Set(info.sandboxes.map((entry) => resolveDirectory(entry)))),
  }
}

function createProjectInfo(input: {
  worktree: string
  directory: string
  vcs?: "git"
  now: number
}): BuddyProjectInfo {
  return {
    id: projectIDForWorktree(input.worktree),
    worktree: input.worktree,
    ...(input.vcs ? { vcs: input.vcs } : {}),
    name: defaultProjectName(input.worktree),
    time: {
      created: input.now,
      updated: input.now,
    },
    sandboxes: input.directory === input.worktree ? [] : [input.directory],
  }
}

function mergeProjectInfo(
  existing: BuddyProjectInfo | undefined,
  input: {
    worktree: string
    directory: string
    vcs?: "git"
    now: number
  },
): BuddyProjectInfo {
  if (!existing) {
    return createProjectInfo(input)
  }

  const normalized = normalizeProjectInfo(existing)
  return {
    ...normalized,
    worktree: input.worktree,
    ...(input.vcs ? { vcs: input.vcs } : {}),
    sandboxes:
      input.directory === input.worktree
        ? normalized.sandboxes
        : Array.from(new Set([...normalized.sandboxes, input.directory])),
    time: {
      ...normalized.time,
      updated: input.now,
    },
  }
}

export async function ensureProjectDirectory(directory: string) {
  const normalizedDirectory = resolveDirectory(directory)
  const stats = await fs.stat(normalizedDirectory)
  if (!stats.isDirectory()) {
    throw new Error(`Directory not found: ${normalizedDirectory}`)
  }
  return normalizedDirectory
}

export async function upsertProjectInfoForDirectory(directory: string): Promise<BuddyProjectInfo> {
  const normalizedDirectory = await ensureProjectDirectory(directory)
  const resolved = await resolveProjectRoot(normalizedDirectory)
  const now = Date.now()
  const projectID = projectIDForWorktree(resolved.worktree)

  const store = await updateProjectStore((current) => {
    const nextInfo = mergeProjectInfo(current[projectID], {
      directory: resolved.directory,
      worktree: resolved.worktree,
      ...(resolved.vcs ? { vcs: resolved.vcs } : {}),
      now,
    })
    return {
      ...current,
      [projectID]: nextInfo,
    }
  })

  return normalizeProjectInfo(store[projectID] ?? createProjectInfo({ ...resolved, now }))
}

export async function listProjectInfos(): Promise<BuddyProjectInfo[]> {
  return Object.values(await readProjectStore())
    .map(normalizeProjectInfo)
    .toSorted((left, right) => right.time.updated - left.time.updated)
}

export async function getProjectInfoByID(projectID: string): Promise<BuddyProjectInfo | undefined> {
  const store = await readProjectStore()
  const info = store[projectID]
  return info ? normalizeProjectInfo(info) : undefined
}

export async function updateProjectInfoByID(
  projectID: string,
  patch: BuddyProjectUpdate,
): Promise<BuddyProjectInfo | undefined> {
  const now = Date.now()
  const store = await updateProjectStore((current) => {
    const existing = current[projectID]
    if (!existing) return current

    return {
      ...current,
      [projectID]: {
        ...normalizeProjectInfo(existing),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
        ...(patch.commands !== undefined ? { commands: patch.commands } : {}),
        time: {
          ...existing.time,
          updated: now,
        },
      },
    }
  })

  const info = store[projectID]
  return info ? normalizeProjectInfo(info) : undefined
}

export async function resolveProjectConfigRoot(directory: string) {
  return (await resolveProjectRoot(directory)).worktree
}
