import fsp from "node:fs/promises"
import path from "node:path"
import { ulid } from "ulid"
import z from "zod"
import { readNotebookHomeState } from "../project/buddy-home"
import { resolveDirectory } from "../project/directory"
import { listManagedNotebooks } from "../project/managed-notebook"
import { INBOX_NOTEBOOK_NAME } from "../project/notebook-constants"
import { listOpenProjects } from "../project/open-project-registry"
import { writeJsonFileAtomic } from "../storage/atomic-file"
import { withFileLock } from "../storage/file-lock"
import { Global } from "../storage/global"
import { parseNodeErrorCode } from "../storage/parse-node-error"

export type NotesNotebookIdentity = {
  id: string
  name: string
}

const NOTEBOOK_IDENTITIES_FILENAME = "notes-notebook-identities.json"
const NOTEBOOK_IDENTITIES_VERSION = 1 as const
const QUICK_CHATS_KIND = "quick-chats" as const
const NOTEBOOK_KIND = "notebook" as const

const filesystemIdentitySchema = z.object({
  device: z.string(),
  inode: z.string(),
})

const notebookIdentityRegistrySchema = z.object({
  version: z.literal(NOTEBOOK_IDENTITIES_VERSION),
  entries: z.array(
    z.object({
      id: z.string().trim().min(1),
      directory: z.string().trim().min(1),
      kind: z.enum([NOTEBOOK_KIND, QUICK_CHATS_KIND]),
      filesystem: filesystemIdentitySchema.optional(),
    }),
  ),
})

type NotebookIdentityRegistry = z.infer<typeof notebookIdentityRegistrySchema>
type NotebookIdentityEntry = NotebookIdentityRegistry["entries"][number]
type FilesystemIdentity = z.infer<typeof filesystemIdentitySchema>

const notebookIdentityTasks = new Map<string, Promise<NotesNotebookIdentity>>()

function registryPath() {
  return path.join(Global.Path.state, NOTEBOOK_IDENTITIES_FILENAME)
}

function registryLockPath() {
  return `${registryPath()}.lock`
}

function emptyRegistry(): NotebookIdentityRegistry {
  return {
    version: NOTEBOOK_IDENTITIES_VERSION,
    entries: [],
  }
}

async function readRegistryUnlocked(): Promise<NotebookIdentityRegistry> {
  let raw: string
  try {
    raw = await fsp.readFile(registryPath(), "utf8")
  } catch (error) {
    if (parseNodeErrorCode(error) === "ENOENT") return emptyRegistry()
    throw error
  }

  try {
    const parsed = notebookIdentityRegistrySchema.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data
  } catch {}

  const quarantinedPath = `${registryPath()}.corrupt-${ulid()}`
  await fsp.rename(registryPath(), quarantinedPath)
  console.warn(`Quarantined corrupt Notes notebook identity registry at ${quarantinedPath}`)
  return emptyRegistry()
}

function normalizedDirectory(directory: string) {
  return resolveDirectory(directory)
}

export function displayNameForNotebook(directory: string, inboxDirectory: string) {
  if (normalizedDirectory(directory) === normalizedDirectory(inboxDirectory)) {
    return "Quick Chats"
  }
  return path.basename(directory) || INBOX_NOTEBOOK_NAME
}

function entryForDirectory(
  entries: NotebookIdentityEntry[],
  directory: string,
  inboxDirectory: string,
) {
  const normalized = normalizedDirectory(directory)
  const kind =
    normalized === normalizedDirectory(inboxDirectory) ? QUICK_CHATS_KIND : NOTEBOOK_KIND
  return entries.find((entry) =>
    kind === QUICK_CHATS_KIND
      ? entry.kind === QUICK_CHATS_KIND
      : entry.kind === NOTEBOOK_KIND && normalizedDirectory(entry.directory) === normalized,
  )
}

async function filesystemIdentity(directory: string): Promise<FilesystemIdentity | undefined> {
  try {
    const stat = await fsp.stat(directory, { bigint: true })
    if (!stat.isDirectory() || stat.ino === 0n) return undefined
    return {
      device: stat.dev.toString(),
      inode: stat.ino.toString(),
    }
  } catch (error) {
    if (parseNodeErrorCode(error) === "ENOENT") return undefined
    throw error
  }
}

function sameFilesystemIdentity(
  left: FilesystemIdentity | undefined,
  right: FilesystemIdentity | undefined,
) {
  return !!left && !!right && left.device === right.device && left.inode === right.inode
}

async function readOrCreateNotebookIdentity(directory: string): Promise<NotesNotebookIdentity> {
  const home = await readNotebookHomeState()
  const normalized = normalizedDirectory(directory)
  return withFileLock(registryLockPath(), async () => {
    const registry = await readRegistryUnlocked()
    const currentFilesystem = await filesystemIdentity(normalized)
    const pathEntry = entryForDirectory(registry.entries, normalized, home.inboxDirectory)
    const movedEntry = currentFilesystem
      ? registry.entries.find(
          (entry) =>
            entry.kind === NOTEBOOK_KIND &&
            sameFilesystemIdentity(entry.filesystem, currentFilesystem),
        )
      : undefined
    const existing = pathEntry ?? movedEntry
    if (existing) {
      if (
        existing.directory !== normalized ||
        !sameFilesystemIdentity(existing.filesystem, currentFilesystem)
      ) {
        existing.directory = normalized
        if (currentFilesystem) existing.filesystem = currentFilesystem
        else delete existing.filesystem
        await writeJsonFileAtomic(registryPath(), registry)
      }
      return {
        id: existing.id,
        name: displayNameForNotebook(normalized, home.inboxDirectory),
      }
    }

    const entry: NotebookIdentityEntry = Object.assign(
      {
        id: ulid(),
        directory: normalized,
        kind:
          normalized === normalizedDirectory(home.inboxDirectory)
            ? QUICK_CHATS_KIND
            : NOTEBOOK_KIND,
      },
      currentFilesystem ? { filesystem: currentFilesystem } : undefined,
    )
    registry.entries.push(entry)
    await writeJsonFileAtomic(registryPath(), registry)
    return {
      id: entry.id,
      name: displayNameForNotebook(normalized, home.inboxDirectory),
    }
  })
}

export function ensureNotebookIdentity(directory: string) {
  const key = normalizedDirectory(directory)
  const existing = notebookIdentityTasks.get(key)
  if (existing) return existing

  const task = readOrCreateNotebookIdentity(key).finally(() => {
    notebookIdentityTasks.delete(key)
  })
  notebookIdentityTasks.set(key, task)
  return task
}

export async function findNotebookIdentity(
  directory: string,
): Promise<NotesNotebookIdentity | undefined> {
  const home = await readNotebookHomeState()
  const normalized = normalizedDirectory(directory)
  return withFileLock(registryLockPath(), async () => {
    const registry = await readRegistryUnlocked()
    const currentFilesystem = await filesystemIdentity(normalized)
    const entry =
      entryForDirectory(registry.entries, normalized, home.inboxDirectory) ??
      (currentFilesystem
        ? registry.entries.find(
            (candidate) =>
              candidate.kind === NOTEBOOK_KIND &&
              sameFilesystemIdentity(candidate.filesystem, currentFilesystem),
          )
        : undefined)
    if (!entry) return undefined
    return {
      id: entry.id,
      name: displayNameForNotebook(normalized, home.inboxDirectory),
    }
  })
}

async function existingDirectory(directory: string) {
  return fsp
    .stat(directory)
    .then((stat) => stat.isDirectory())
    .catch(() => false)
}

export async function loadNotebookLabelsByID(currentDirectory: string) {
  const [managedNotebooks, openProjects, home, registry] = await Promise.all([
    listManagedNotebooks(),
    listOpenProjects(),
    readNotebookHomeState(),
    withFileLock(registryLockPath(), readRegistryUnlocked),
  ])
  const candidateDirectories = new Set([
    normalizedDirectory(currentDirectory),
    ...managedNotebooks.map((notebook) => normalizedDirectory(notebook.directory)),
    ...openProjects.directories.map(normalizedDirectory),
  ])
  const identities = await Promise.all(
    [...candidateDirectories].map(async (directory) => {
      if (!(await existingDirectory(directory))) return undefined
      const currentFilesystem = await filesystemIdentity(directory)
      const entry =
        entryForDirectory(registry.entries, directory, home.inboxDirectory) ??
        (currentFilesystem
          ? registry.entries.find(
              (candidate) =>
                candidate.kind === NOTEBOOK_KIND &&
                sameFilesystemIdentity(candidate.filesystem, currentFilesystem),
            )
          : undefined)
      if (!entry) return undefined
      return {
        id: entry.id,
        name: displayNameForNotebook(directory, home.inboxDirectory),
      }
    }),
  )
  return new Map(
    identities.flatMap((identity) => (identity ? [[identity.id, identity.name] as const] : [])),
  )
}
