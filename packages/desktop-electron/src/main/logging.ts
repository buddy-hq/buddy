import log from "electron-log/main.js"
import { dirname, join } from "node:path"
import { readFileSync, readdirSync, statSync, unlinkSync } from "node:fs"

const MAX_LOG_AGE_DAYS = 7
const LOG_SIZE_LIMIT_BYTES = 5 * 1024 * 1024
const LOG_TAIL_LINES = 1000

export function initLogging() {
  log.transports.file.maxSize = LOG_SIZE_LIMIT_BYTES
  cleanupOldLogs()
  return log
}

export function tailLogs() {
  try {
    const path = log.transports.file.getFile().path
    const contents = readFileSync(path, "utf8")
    const lines = contents.split("\n")
    return lines.slice(Math.max(0, lines.length - LOG_TAIL_LINES)).join("\n")
  } catch {
    return ""
  }
}

function cleanupOldLogs() {
  const logPath = log.transports.file.getFile().path
  const directory = dirname(logPath)
  const cutoff = Date.now() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000

  for (const entry of readdirSync(directory)) {
    const filePath = join(directory, entry)
    try {
      const info = statSync(filePath)
      if (!info.isFile()) continue
      if (info.mtimeMs < cutoff) {
        unlinkSync(filePath)
      }
    } catch {
      continue
    }
  }
}
