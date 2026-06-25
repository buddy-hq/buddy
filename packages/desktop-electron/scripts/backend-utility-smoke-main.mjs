/* eslint-disable unicorn/require-post-message-target-origin */

import { access, writeFile } from "node:fs/promises"
import readline from "node:readline"
import { app, utilityProcess } from "electron"

const UTILITY_SERVICE_NAME = "Buddy backend utility smoke"
const UTILITY_CWD_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_CWD"
const UTILITY_EXIT_TIMEOUT_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_EXIT_TIMEOUT_MS"
const UTILITY_HOSTNAME_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_HOSTNAME"
const UTILITY_PATH_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_PATH"
const UTILITY_READY_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_READY_PATH"
const UTILITY_STARTUP_TIMEOUT_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_STARTUP_TIMEOUT_MS"
const UTILITY_STOP_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_STOP_PATH"

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(name + " is required")
  return value
}

function requiredNumberEnv(name) {
  const value = Number.parseInt(requiredEnv(name), 10)
  if (!Number.isFinite(value)) throw new Error(name + " must be numeric")
  return value
}

const HOSTNAME = requiredEnv(UTILITY_HOSTNAME_ENV)
const STARTUP_TIMEOUT_MS = requiredNumberEnv(UTILITY_STARTUP_TIMEOUT_ENV)
const EXIT_TIMEOUT_MS = requiredNumberEnv(UTILITY_EXIT_TIMEOUT_ENV)

function backendEnvironment() {
  const next = { ...process.env }
  delete next.DEBUG
  delete next.NODE_PATH
  if (process.platform === "linux") delete next.LD_PRELOAD
  return next
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function waitForStopFile(stopPath) {
  while (!(await fileExists(stopPath))) {
    await delay(250)
  }
}

let backendChild
let stopping = false
let stopTask

async function stopUtility() {
  if (!backendChild) return
  if (stopTask) return stopTask

  stopTask = (async () => {
    const child = backendChild
    backendChild = undefined

    const stopped = new Promise((resolve) => {
      child.on("message", (message) => {
        if (message?.type === "stopped") resolve()
      })
      child.once("exit", () => resolve())
    })

    child.postMessage({ type: "stop" })
    await Promise.race([
      stopped,
      delay(EXIT_TIMEOUT_MS).then(() => {
        throw new Error("Backend utility did not stop cleanly")
      }),
    ])
  })()

  return stopTask
}

async function shutdown(exitCode) {
  if (stopping) return
  stopping = true

  try {
    await stopUtility()
    app.exit(exitCode)
  } catch (error) {
    console.error(error)
    app.exit(exitCode === 0 ? 1 : exitCode)
  }
}

async function main() {
  await app.whenReady()

  const utilityPath = requiredEnv(UTILITY_PATH_ENV)
  const utilityCwd = requiredEnv(UTILITY_CWD_ENV)
  const readyPath = requiredEnv(UTILITY_READY_ENV)
  const stopPath = requiredEnv(UTILITY_STOP_ENV)
  const port = requiredNumberEnv("PORT")

  const child = utilityProcess.fork(utilityPath, [], {
    cwd: utilityCwd,
    env: backendEnvironment(),
    serviceName: UTILITY_SERVICE_NAME,
    stdio: "pipe",
  })
  backendChild = child

  if (child.stdout) {
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      console.log("[backend-utility stdout] " + line)
    })
  }
  if (child.stderr) {
    readline.createInterface({ input: child.stderr }).on("line", (line) => {
      console.error("[backend-utility stderr] " + line)
    })
  }

  let readyComplete = false
  const exitedBeforeReady = new Promise((_, reject) => {
    child.once("exit", (code) => {
      if (!readyComplete) {
        reject(new Error("Backend utility exited early with code " + String(code)))
      }
    })
  })

  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Backend utility did not send ready"))
    }, STARTUP_TIMEOUT_MS)

    child.on("message", (message) => {
      if (message?.type === "ready") {
        clearTimeout(timeout)
        resolve()
      }
      if (message?.type === "error") {
        clearTimeout(timeout)
        reject(new Error(message.error?.message ?? "Backend utility error"))
      }
    })
  })

  child.postMessage({ type: "start", hostname: HOSTNAME, port })
  await Promise.race([ready, exitedBeforeReady])
  readyComplete = true

  await writeFile(readyPath, JSON.stringify({ ready: true }), "utf8")
  await waitForStopFile(stopPath)
  await shutdown(0)
}

process.once("SIGTERM", () => {
  void shutdown(0)
})
process.once("SIGINT", () => {
  void shutdown(130)
})

app.on("before-quit", (event) => {
  if (stopping) return
  event.preventDefault()
  void shutdown(0)
})

main().catch((error) => {
  console.error(error)
  void shutdown(1)
})
