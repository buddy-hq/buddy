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

export class BuddyHomeError extends Error {
  readonly status: 400 | 403

  constructor(status: 400 | 403, message: string) {
    super(message)
    this.name = "BuddyHomeError"
    this.status = status
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
  return resolveDirectory(path.join(Global.Path.home, ...BUDDY_HOME_DEFAULT_PATH_SEGMENTS))
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
