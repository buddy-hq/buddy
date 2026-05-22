import fs from "node:fs"
import path from "node:path"
import { Global } from "../storage/global"
import { resolveConfiguredPath } from "../storage/constants"

const BUDDY_AGENT_DIR_ENV = "BUDDY_AGENT_DIR"
const BUDDY_AGENT_DIR_NAME = "agent"
const BUDDY_SESSIONS_DIR_NAME = "sessions"
const BUDDY_AUTH_FILE_NAME = "auth.json"
const BUDDY_MODELS_FILE_NAME = "models.json"
const BUDDY_SESSION_DIRECTORY_BOUNDARY = "--"
const BUDDY_SESSION_DIRECTORY_SEPARATOR_PATTERN = /[/\\:]/g

function ensureDirectory(directory: string) {
  fs.mkdirSync(directory, { recursive: true })
  return directory
}

export function piAgentDirectory() {
  return ensureDirectory(
    resolveConfiguredPath(process.env[BUDDY_AGENT_DIR_ENV]) ??
      path.join(Global.Path.config, BUDDY_AGENT_DIR_NAME),
  )
}

export function piAuthFilePath() {
  return path.join(piAgentDirectory(), BUDDY_AUTH_FILE_NAME)
}

export function piModelsFilePath() {
  return path.join(piAgentDirectory(), BUDDY_MODELS_FILE_NAME)
}

export function encodePiSessionDirectory(cwd: string) {
  const withoutLeadingSeparator = cwd.replace(/^[/\\]/, "")
  return `${BUDDY_SESSION_DIRECTORY_BOUNDARY}${withoutLeadingSeparator.replace(
    BUDDY_SESSION_DIRECTORY_SEPARATOR_PATTERN,
    "-",
  )}${BUDDY_SESSION_DIRECTORY_BOUNDARY}`
}

export function piSessionDirectory(cwd: string) {
  return ensureDirectory(
    path.join(piAgentDirectory(), BUDDY_SESSIONS_DIR_NAME, encodePiSessionDirectory(cwd)),
  )
}
