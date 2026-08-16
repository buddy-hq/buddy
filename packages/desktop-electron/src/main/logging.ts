import { app } from "electron"
import log from "electron-log/main.js"
import { dirname, join } from "node:path"
import {
  closeSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  mkdirSync,
} from "node:fs"

import { parseTErrorCode } from "../shared/parse-external"

const MAX_LOG_AGE_DAYS = 7
const LOG_SIZE_LIMIT_BYTES = 5 * 1024 * 1024
const LOG_TAIL_LINES = 1000
const MAIN_LOG_FILENAME = "main.log"
const BROKEN_STANDARD_IO_ERROR_CODES = new Set(["EIO", "EPIPE", "ERR_STREAM_DESTROYED"])

export function initLogging() {
  log.transports.file.resolvePathFn = () => ensureLogFilePath()
  log.transports.file.maxSize = LOG_SIZE_LIMIT_BYTES
  const writeConsoleTransport = log.transports.console.writeFn
  log.transports.console.writeFn = (options) => {
    try {
      writeConsoleTransport(options)
    } catch (error) {
      if (!isBrokenStandardIoError(error)) {
        throw error
      }
    }
  }
  ensureLogFilePath()
  cleanupOldLogs()
  return log
}

export function safelyWriteToStandardStream(stream: NodeJS.WriteStream, chunk: string) {
  try {
    stream.write(chunk)
  } catch (error) {
    if (!isBrokenStandardIoError(error)) {
      throw error
    }
  }
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
  const logPath = ensureLogFilePath()
  const directory = dirname(logPath)
  const cutoff = Date.now() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000

  let entries: string[] = []
  try {
    entries = readdirSync(directory)
  } catch {
    return
  }

  for (const entry of entries) {
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

function ensureLogFilePath() {
  const logPath = resolveLogFilePath()
  const directory = dirname(logPath)
  mkdirSync(directory, { recursive: true })

  try {
    const descriptor = openSync(logPath, "a")
    closeSync(descriptor)
  } catch {
    // Ignore creation failures here; electron-log will report write errors.
  }

  return logPath
}

function resolveLogFilePath() {
  const logsDirectory = app.getPath("logs")
  return join(logsDirectory, MAIN_LOG_FILENAME)
}

function isBrokenStandardIoError<TError>(error: TError) {
  const code = parseTErrorCode(error)
  return code !== undefined && BROKEN_STANDARD_IO_ERROR_CODES.has(code)
}
