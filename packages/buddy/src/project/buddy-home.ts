import fs from "node:fs"
import path from "node:path"
import { Config } from "../config"
import { Global } from "../storage/global"
import { resolveDirectory } from "./directory"
import { BUDDY_HOME_DEFAULT_PATH_SEGMENTS, INBOX_NOTEBOOK_NAME } from "./notebook-constants"

export type BuddyHomeState = {
  configuredPath: string | null
  defaultPath: string
  resolvedPath: string
}

export type BuddyHomeAccessState = {
  defaultPath: string
  granted: boolean
}

const BUDDY_HOME_ACCESS_MODE = fs.constants.R_OK | fs.constants.W_OK
const DIRECTORY_ACCESS_DENIED_ERROR_CODES = new Set(["EACCES", "EPERM"])

type NodeErrorWithCode = {
  code?: unknown
}

export class BuddyHomeError extends Error {
  readonly status: 400 | 403

  constructor(status: 400 | 403, message: string) {
    super(message)
    this.name = "BuddyHomeError"
    this.status = status
  }
}

function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined
  const candidate = error as NodeErrorWithCode
  return typeof candidate.code === "string" ? candidate.code : undefined
}

function findExistingDirectoryAncestor(directory: string) {
  let current = directory

  while (true) {
    if (fs.existsSync(current)) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return undefined
    }

    current = parent
  }
}

function hasDirectoryAccess(directory: string) {
  const directoryToCheck = findExistingDirectoryAncestor(directory) ?? directory

  try {
    fs.accessSync(directoryToCheck, BUDDY_HOME_ACCESS_MODE)
    return true
  } catch (error) {
    const code = readErrorCode(error)
    if (code === "ENOENT" || DIRECTORY_ACCESS_DENIED_ERROR_CODES.has(code ?? "")) {
      return false
    }

    return false
  }
}

function isBuddyHomeError(error: unknown): error is BuddyHomeError {
  return error instanceof BuddyHomeError
}

export function mapBuddyHomeError(error: unknown): Response | undefined {
  if (!isBuddyHomeError(error)) return undefined
  return Response.json({ error: error.message }, { status: error.status })
}

export function resolveBuddyHomeDefaultPath() {
  return path.join(Global.Path.home, ...BUDDY_HOME_DEFAULT_PATH_SEGMENTS)
}

export function readBuddyHomeDefaultAccessState(): BuddyHomeAccessState {
  const defaultPath = resolveBuddyHomeDefaultPath()
  return {
    defaultPath,
    granted: hasDirectoryAccess(defaultPath),
  }
}

function normalizeConfiguredBuddyHomePath(configuredPath: string) {
  const trimmed = configuredPath.trim()
  if (!trimmed) {
    throw new BuddyHomeError(400, "Buddy Home is required")
  }

  if (!path.isAbsolute(trimmed)) {
    throw new BuddyHomeError(400, "Buddy Home must be an absolute path")
  }

  return resolveDirectory(trimmed)
}

export function resolveBuddyHomeState(configuredPath?: string | null): BuddyHomeState {
  const defaultPath = resolveBuddyHomeDefaultPath()
  const configuredResolvedPath =
    typeof configuredPath === "string" ? normalizeConfiguredBuddyHomePath(configuredPath) : null
  const resolvedPath = configuredResolvedPath ?? defaultPath

  return {
    configuredPath: configuredResolvedPath,
    defaultPath,
    resolvedPath,
  }
}

export async function readNotebookHomeState() {
  const config = await Config.getGlobal()
  const home = resolveBuddyHomeState(config.notebook_home)
  return {
    configuredDirectory: home.configuredPath ?? undefined,
    defaultDirectory: home.defaultPath,
    resolvedDirectory: home.resolvedPath,
    inboxDirectory: path.join(home.resolvedPath, INBOX_NOTEBOOK_NAME),
    inboxName: INBOX_NOTEBOOK_NAME,
  }
}

export async function saveNotebookHome(directory: string) {
  const resolved = resolveBuddyHomeState(directory)
  await Config.updateGlobal({
    notebook_home: resolved.resolvedPath,
  })
  return readNotebookHomeState()
}
