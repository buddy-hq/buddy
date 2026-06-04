#!/usr/bin/env bun

import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { createServer } from "node:net"
import os from "node:os"
import path from "node:path"
import {
  currentDesktopRustTarget,
  getSidecarTargetByRustTarget,
  windowsifyBinaryName,
} from "../../../script/desktop-sidecar-targets"

const HOSTNAME = "127.0.0.1"
const SIDECAR_BINARY_NAME = "buddy-backend"
const USERNAME = "buddy"
const PASSWORD = "sidecar-smoke"
const HEALTHZ_PATH = "/api/healthz"
const HEALTH_PATH = "/api/health"
const STARTUP_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 250
const SHUTDOWN_TIMEOUT_MS = 2_000
const LOG_TAIL_CHARACTERS = 8_000

type SmokeOptions = {
  binary?: string
  entrypoint?: string
  keepRuntime: boolean
  migrationDir?: string
  port?: number
  target?: string
}

type ProbeResult = {
  body: string
  error?: string
  ok: boolean
  status?: number
}

type SmokeProcess = ReturnType<typeof Bun.spawn>

const BACKEND_DIR = path.resolve(import.meta.dir, "..")
const DEFAULT_MIGRATION_DIR = path.resolve(BACKEND_DIR, "migration")

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index < 0) return undefined
  return args[index + 1]
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag)
}

function parsePort(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseOptions(): SmokeOptions {
  const args = Bun.argv.slice(2)
  return {
    binary: readFlagValue(args, "--binary"),
    entrypoint: readFlagValue(args, "--entrypoint"),
    keepRuntime: hasFlag(args, "--keep-runtime"),
    migrationDir: readFlagValue(args, "--migration-dir"),
    port: parsePort(readFlagValue(args, "--port")),
    target: readFlagValue(args, "--target"),
  }
}

function resolveDefaultBinary(target: string): string {
  const config = getSidecarTargetByRustTarget(target)
  return path.resolve(
    BACKEND_DIR,
    "dist/release-sidecars",
    config.sidecarDir,
    "bin",
    windowsifyBinaryName(SIDECAR_BINARY_NAME, config.rustTarget),
  )
}

function resolveBinary(options: SmokeOptions): string {
  if (options.binary) return path.resolve(options.binary)
  return resolveDefaultBinary(options.target ?? currentDesktopRustTarget())
}

function createSmokeRuntimeRoot(): string {
  const runtimeRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-sidecar-smoke-"))
  mkdirSync(path.join(runtimeRoot, "notebook"), { recursive: true })
  return runtimeRoot
}

function basicAuthorizationHeader(): string {
  return `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`
}

function baseEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )
}

function sidecarEnvironment(input: {
  entrypoint?: string
  migrationDir: string
  port: number
  runtimeRoot: string
}): Record<string, string> {
  const xdgRoot = path.join(input.runtimeRoot, "xdg")
  const notebookRoot = path.join(input.runtimeRoot, "notebook")

  return {
    ...baseEnvironment(),
    ...(input.entrypoint ? { BUN_BE_BUN: "1" } : {}),
    BUDDY_ALLOWED_DIRECTORY_ROOTS: [notebookRoot, xdgRoot].join(","),
    BUDDY_APP_VERSION: "sidecar-smoke",
    BUDDY_DIRECTORY_BASE: notebookRoot,
    BUDDY_MIGRATION_DIR: input.migrationDir,
    BUDDY_RUNTIME_ROOT: xdgRoot,
    BUDDY_SERVER_PASSWORD: PASSWORD,
    BUDDY_SERVER_USERNAME: USERNAME,
    OPENCODE_CLIENT: "desktop",
    OPENCODE_EXPERIMENTAL_FILEWATCHER: "true",
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
    OPENCODE_SERVER_PASSWORD: PASSWORD,
    OPENCODE_SERVER_USERNAME: USERNAME,
    PORT: String(input.port),
    XDG_CACHE_HOME: path.join(xdgRoot, "cache"),
    XDG_CONFIG_HOME: path.join(xdgRoot, "config"),
    XDG_DATA_HOME: path.join(xdgRoot, "data"),
    XDG_STATE_HOME: path.join(xdgRoot, "state"),
  }
}

function sidecarArgs(input: { entrypoint?: string; port: number }): string[] {
  const serveArgs = ["serve", "--hostname", HOSTNAME, "--port", String(input.port)]
  return input.entrypoint ? ["run", input.entrypoint, ...serveArgs] : serveArgs
}

async function allocatePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.on("error", reject)
    server.listen(0, HOSTNAME, () => {
      const address = server.address()
      if (!address || typeof address !== "object") {
        server.close()
        reject(new Error("Failed to allocate sidecar smoke port"))
        return
      }

      const { port } = address
      server.close(() => resolve(port))
    })
  })
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function readStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return ""
  return await new Response(stream).text()
}

async function probe(baseUrl: string, pathname: string): Promise<ProbeResult> {
  try {
    const response = await fetch(new URL(pathname, baseUrl), {
      headers: { authorization: basicAuthorizationHeader() },
      signal: AbortSignal.timeout(POLL_INTERVAL_MS),
    })
    const body = await response.text()
    return {
      body,
      ok: response.ok,
      status: response.status,
    }
  } catch (error) {
    return {
      body: "",
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    }
  }
}

function tail(text: string): string {
  if (text.length <= LOG_TAIL_CHARACTERS) return text
  return text.slice(text.length - LOG_TAIL_CHARACTERS)
}

async function stopProcess(child: SmokeProcess): Promise<void> {
  child.kill()
  await Promise.race([child.exited, delay(SHUTDOWN_TIMEOUT_MS)])
}

async function waitForHealthyEndpoint(input: {
  baseUrl: string
  child: SmokeProcess
  pathname: string
}): Promise<ProbeResult> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  let last: ProbeResult = { body: "", ok: false }

  while (Date.now() < deadline) {
    const exited = await Promise.race([
      input.child.exited.then((code) => code),
      delay(0).then(() => undefined),
    ])
    if (exited !== undefined) {
      return {
        body: `Sidecar exited before ${input.pathname} became healthy (code=${exited})`,
        ok: false,
      }
    }

    last = await probe(input.baseUrl, input.pathname)
    if (last.ok) return last
    await delay(POLL_INTERVAL_MS)
  }

  return last
}

async function main(): Promise<void> {
  const options = parseOptions()
  const binary = resolveBinary(options)
  const entrypoint = options.entrypoint ? path.resolve(options.entrypoint) : undefined
  const migrationDir = path.resolve(options.migrationDir ?? DEFAULT_MIGRATION_DIR)

  if (!existsSync(binary)) {
    throw new Error(`Compiled sidecar binary not found at ${binary}`)
  }

  if (!existsSync(migrationDir)) {
    throw new Error(`Buddy migration directory not found at ${migrationDir}`)
  }

  if (entrypoint && !existsSync(entrypoint)) {
    throw new Error(`Compiled sidecar entrypoint not found at ${entrypoint}`)
  }

  const runtimeRoot = createSmokeRuntimeRoot()
  const port = options.port ?? (await allocatePort())
  const baseUrl = `http://${HOSTNAME}:${port}`
  const child = Bun.spawn([binary, ...sidecarArgs({ entrypoint, port })], {
    cwd: path.dirname(binary),
    env: sidecarEnvironment({ entrypoint, migrationDir, port, runtimeRoot }),
    stderr: "pipe",
    stdout: "pipe",
  })

  const stdout = readStream(child.stdout)
  const stderr = readStream(child.stderr)
  let processStopped = false

  try {
    const healthz = await waitForHealthyEndpoint({
      baseUrl,
      child,
      pathname: HEALTHZ_PATH,
    })
    if (!healthz.ok) {
      throw new Error(`${HEALTHZ_PATH} failed: ${healthz.body || healthz.error || "unknown"}`)
    }

    const health = await waitForHealthyEndpoint({
      baseUrl,
      child,
      pathname: HEALTH_PATH,
    })
    if (!health.ok) {
      throw new Error(`${HEALTH_PATH} failed: ${health.body || health.error || "unknown"}`)
    }

    console.log(`Compiled sidecar smoke passed at ${baseUrl}`)
  } catch (error) {
    await stopProcess(child)
    processStopped = true
    const [stdoutText, stderrText] = await Promise.all([stdout, stderr])
    console.error("Compiled sidecar smoke failed.")
    console.error(`stdout:\n${tail(stdoutText)}`)
    console.error(`stderr:\n${tail(stderrText)}`)
    throw error
  } finally {
    if (!processStopped) {
      await stopProcess(child)
    }
    if (!options.keepRuntime) {
      rmSync(runtimeRoot, { recursive: true, force: true })
    } else {
      console.log(`Kept smoke runtime root at ${runtimeRoot}`)
    }
  }
}

await main()
