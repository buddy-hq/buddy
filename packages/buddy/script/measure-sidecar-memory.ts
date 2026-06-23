#!/usr/bin/env bun

import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
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
const PASSWORD = "sidecar-measure"
const DEFAULT_ENDPOINTS = ["/api/healthz", "/api/health", "/api/provider", "/api/provider/auth"]
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000
const DEFAULT_PROBE_TIMEOUT_MS = 180_000
const DEFAULT_SETTLE_MS = 2_000
const DEFAULT_FINAL_SETTLE_MS = 30_000
const DEFAULT_CYCLES = 2
const POLL_INTERVAL_MS = 250
const SHUTDOWN_TIMEOUT_MS = 2_000
const LOG_TAIL_CHARACTERS = 8_000

type Options = {
  binary?: string
  cycles: number
  endpoints: string[]
  finalSettleMs: number
  keepRuntime: boolean
  modelsCache?: string
  outFile?: string
  outputJson: boolean
  port?: number
  probeTimeoutMs: number
  settleMs: number
  startupTimeoutMs: number
  target?: string
}

type MemorySnapshot = {
  bodyBytes: number
  endpoint: string
  label: string
  privateMB: number
  status: number
  workingSetMB: number
}

type WindowsProcessMemory = {
  PrivateMemorySize64: number
  WorkingSet64: number
}

type MeasurementProcess = ReturnType<typeof Bun.spawn>

const BACKEND_DIR = path.resolve(import.meta.dir, "..")
const REPO_ROOT = path.resolve(BACKEND_DIR, "../..")
const DEFAULT_MIGRATION_DIR = path.resolve(BACKEND_DIR, "migration")
const DEFAULT_OUTPUT_DIR = path.resolve(REPO_ROOT, "docs/memory-optimization/log")
const INSTALLED_MODELS_CACHE = path.join(
  os.homedir(),
  "AppData",
  "Local",
  "Programs",
  "Buddy",
  "resources",
  ".buddy-runtime",
  "xdg",
  "cache",
  "opencode",
  "models.json",
)

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index < 0) return undefined
  return args[index + 1]
}

function readRepeatedFlagValues(args: string[], flag: string): string[] {
  const values: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== flag) continue
    const value = args[index + 1]
    if (value) values.push(value)
    index += 1
  }
  return values
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag)
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parsePort(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function normalizeEndpoint(value: string): string {
  return value.startsWith("/") ? value : `/${value}`
}

function timestampForPath(date: Date): string {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "-")
}

function defaultOutputFile(target: string): string {
  const safeTarget = target.replaceAll(/[\\/:\s]+/g, "-")
  return path.join(DEFAULT_OUTPUT_DIR, `${timestampForPath(new Date())}-${safeTarget}.json`)
}

function parseOptions(): Options {
  const args = Bun.argv.slice(2)
  const endpoints = readRepeatedFlagValues(args, "--endpoint").map(normalizeEndpoint)
  const modelsCache = readFlagValue(args, "--models-cache")
  const target = readFlagValue(args, "--target") ?? currentDesktopRustTarget()

  return {
    binary: readFlagValue(args, "--binary"),
    cycles: parsePositiveInteger(readFlagValue(args, "--cycles"), DEFAULT_CYCLES),
    endpoints: endpoints.length > 0 ? endpoints : [...DEFAULT_ENDPOINTS],
    finalSettleMs: parsePositiveInteger(
      readFlagValue(args, "--final-settle-ms"),
      DEFAULT_FINAL_SETTLE_MS,
    ),
    keepRuntime: hasFlag(args, "--keep-runtime"),
    modelsCache:
      modelsCache === "none"
        ? undefined
        : modelsCache
          ? path.resolve(modelsCache)
          : existsSync(INSTALLED_MODELS_CACHE)
            ? INSTALLED_MODELS_CACHE
            : undefined,
    outFile: hasFlag(args, "--no-out") ? undefined : (readFlagValue(args, "--out") ?? defaultOutputFile(target)),
    outputJson: hasFlag(args, "--json"),
    port: parsePort(readFlagValue(args, "--port")),
    probeTimeoutMs: parsePositiveInteger(
      readFlagValue(args, "--probe-timeout-ms"),
      DEFAULT_PROBE_TIMEOUT_MS,
    ),
    settleMs: parsePositiveInteger(readFlagValue(args, "--settle-ms"), DEFAULT_SETTLE_MS),
    startupTimeoutMs: parsePositiveInteger(
      readFlagValue(args, "--startup-timeout-ms"),
      DEFAULT_STARTUP_TIMEOUT_MS,
    ),
    target,
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

function resolveBinary(options: Options): string {
  if (options.binary) return path.resolve(options.binary)
  return resolveDefaultBinary(options.target ?? currentDesktopRustTarget())
}

function createRuntimeRoot(): string {
  const runtimeRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-sidecar-memory-"))
  mkdirSync(path.join(runtimeRoot, "notebook"), { recursive: true })
  return runtimeRoot
}

function copyModelsCache(input: { modelsCache?: string; runtimeRoot: string }): string | undefined {
  if (!input.modelsCache) return undefined
  if (!existsSync(input.modelsCache)) {
    throw new Error(`Models cache not found: ${input.modelsCache}`)
  }

  const target = path.join(input.runtimeRoot, "xdg", "cache", "opencode", "models.json")
  mkdirSync(path.dirname(target), { recursive: true })
  cpSync(input.modelsCache, target)
  return target
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

function sidecarEnvironment(input: { port: number; runtimeRoot: string }): Record<string, string> {
  const xdgRoot = path.join(input.runtimeRoot, "xdg")
  const notebookRoot = path.join(input.runtimeRoot, "notebook")

  return {
    ...baseEnvironment(),
    BUDDY_ALLOWED_DIRECTORY_ROOTS: [notebookRoot, xdgRoot].join(","),
    BUDDY_APP_VERSION: "sidecar-measure",
    BUDDY_DIRECTORY_BASE: notebookRoot,
    BUDDY_MIGRATION_DIR: DEFAULT_MIGRATION_DIR,
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

function sidecarArgs(port: number): string[] {
  return ["serve", "--hostname", HOSTNAME, "--port", String(port)]
}

async function allocatePort(): Promise<number> {
  const { createServer } = await import("node:net")
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.on("error", reject)
    server.listen(0, HOSTNAME, () => {
      const address = server.address()
      if (!address || typeof address !== "object") {
        server.close()
        reject(new Error("Failed to allocate measurement port"))
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

function tail(text: string): string {
  if (text.length <= LOG_TAIL_CHARACTERS) return text
  return text.slice(text.length - LOG_TAIL_CHARACTERS)
}

async function stopProcess(child: MeasurementProcess): Promise<void> {
  child.kill()
  await Promise.race([child.exited, delay(SHUTDOWN_TIMEOUT_MS)])
}

async function probe(input: {
  baseUrl: string
  endpoint: string
  timeoutMs: number
}): Promise<Response> {
  return await fetch(new URL(input.endpoint, input.baseUrl), {
    headers: {
      authorization: basicAuthorizationHeader(),
    },
    signal: AbortSignal.timeout(input.timeoutMs),
  })
}

async function waitForHealthz(input: {
  baseUrl: string
  child: MeasurementProcess
  startupTimeoutMs: number
}): Promise<void> {
  const deadline = Date.now() + input.startupTimeoutMs
  let lastError = "not probed"

  while (Date.now() < deadline) {
    const exited = await Promise.race([
      input.child.exited.then((code) => code),
      delay(0).then(() => undefined),
    ])
    if (exited !== undefined) {
      throw new Error(`Sidecar exited before /api/healthz became healthy (code=${exited})`)
    }

    try {
      const response = await probe({
        baseUrl: input.baseUrl,
        endpoint: "/api/healthz",
        timeoutMs: POLL_INTERVAL_MS,
      })
      await response.arrayBuffer()
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }

    await delay(POLL_INTERVAL_MS)
  }

  throw new Error(`/api/healthz did not become healthy: ${lastError}`)
}

function isWindowsProcessMemory(value: unknown): value is WindowsProcessMemory {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  if (!("PrivateMemorySize64" in value) || !("WorkingSet64" in value)) return false
  return (
    typeof value.PrivateMemorySize64 === "number" && typeof value.WorkingSet64 === "number"
  )
}

async function readWindowsProcessMemory(pid: number): Promise<WindowsProcessMemory> {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    `$process = Get-Process -Id ${pid}`,
    "$process | Select-Object PrivateMemorySize64,WorkingSet64 | ConvertTo-Json -Compress",
  ].join("; ")
  const result = Bun.spawnSync(["powershell", "-NoProfile", "-Command", command], {
    stderr: "pipe",
    stdout: "pipe",
  })

  if (result.exitCode !== 0) {
    throw new Error(`Failed to read process memory: ${result.stderr.toString()}`)
  }

  const parsed: unknown = JSON.parse(result.stdout.toString())
  if (!isWindowsProcessMemory(parsed)) {
    throw new Error(`Unexpected process memory payload: ${result.stdout.toString()}`)
  }
  return parsed
}

async function readProcessMemory(pid: number): Promise<WindowsProcessMemory> {
  if (process.platform !== "win32") {
    throw new Error("measure-sidecar-memory currently reads private/working-set memory on Windows")
  }
  return readWindowsProcessMemory(pid)
}

async function measureEndpoint(input: {
  baseUrl: string
  child: MeasurementProcess
  endpoint: string
  label: string
  probeTimeoutMs: number
  settleMs: number
}): Promise<MemorySnapshot> {
  const response = await probe({
    baseUrl: input.baseUrl,
    endpoint: input.endpoint,
    timeoutMs: input.probeTimeoutMs,
  })
  const body = await response.arrayBuffer()
  await delay(input.settleMs)
  const memory = await readProcessMemory(input.child.pid)

  return {
    bodyBytes: body.byteLength,
    endpoint: input.endpoint,
    label: input.label,
    privateMB: Math.round((memory.PrivateMemorySize64 / 1024 / 1024) * 10) / 10,
    status: response.status,
    workingSetMB: Math.round((memory.WorkingSet64 / 1024 / 1024) * 10) / 10,
  }
}

async function sampleProcess(input: {
  child: MeasurementProcess
  endpoint: string
  label: string
  status: number
}): Promise<MemorySnapshot> {
  const memory = await readProcessMemory(input.child.pid)
  return {
    bodyBytes: 0,
    endpoint: input.endpoint,
    label: input.label,
    privateMB: Math.round((memory.PrivateMemorySize64 / 1024 / 1024) * 10) / 10,
    status: input.status,
    workingSetMB: Math.round((memory.WorkingSet64 / 1024 / 1024) * 10) / 10,
  }
}

function summarizeSnapshots(snapshots: MemorySnapshot[]): {
  peakPrivateMB: number
  peakWorkingSetMB: number
  finalPrivateMB: number
  finalWorkingSetMB: number
} {
  const peakPrivateMB = Math.max(...snapshots.map((snapshot) => snapshot.privateMB))
  const peakWorkingSetMB = Math.max(...snapshots.map((snapshot) => snapshot.workingSetMB))
  const final = snapshots[snapshots.length - 1]
  if (!final) {
    throw new Error("Cannot summarize an empty measurement")
  }
  return {
    finalPrivateMB: final.privateMB,
    finalWorkingSetMB: final.workingSetMB,
    peakPrivateMB,
    peakWorkingSetMB,
  }
}

function renderTable(snapshots: MemorySnapshot[]): string {
  const rows = [
    ["Label", "Endpoint", "Status", "Body bytes", "Private MB", "Working set MB"],
    ...snapshots.map((snapshot) => [
      snapshot.label,
      snapshot.endpoint,
      String(snapshot.status),
      String(snapshot.bodyBytes),
      snapshot.privateMB.toFixed(1),
      snapshot.workingSetMB.toFixed(1),
    ]),
  ]
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => row[column]?.length ?? 0)),
  )

  return rows
    .map((row) =>
      row
        .map((cell, column) => cell.padEnd(widths[column] ?? cell.length))
        .join("  ")
        .trimEnd(),
    )
    .join("\n")
}

async function main(): Promise<void> {
  const options = parseOptions()
  const binary = resolveBinary(options)

  if (!existsSync(binary)) {
    throw new Error(`Compiled sidecar binary not found at ${binary}`)
  }

  const runtimeRoot = createRuntimeRoot()
  const copiedModelsCache = copyModelsCache({
    modelsCache: options.modelsCache,
    runtimeRoot,
  })
  const port = options.port ?? (await allocatePort())
  const baseUrl = `http://${HOSTNAME}:${port}`
  const child = Bun.spawn([binary, ...sidecarArgs(port)], {
    cwd: path.dirname(binary),
    env: sidecarEnvironment({ port, runtimeRoot }),
    stderr: "pipe",
    stdout: "pipe",
    windowsHide: true,
  })
  const stdout = readStream(child.stdout)
  const stderr = readStream(child.stderr)
  let processStopped = false

  try {
    await waitForHealthz({
      baseUrl,
      child,
      startupTimeoutMs: options.startupTimeoutMs,
    })

    const snapshots: MemorySnapshot[] = []
    snapshots.push(
      await sampleProcess({
        child,
        endpoint: "process",
        label: "ready-after-healthz-poll",
        status: 0,
      }),
    )

    for (let cycle = 1; cycle <= options.cycles; cycle += 1) {
      for (const endpoint of options.endpoints) {
        snapshots.push(
          await measureEndpoint({
            baseUrl,
            child,
            endpoint,
            label: `cycle-${cycle}`,
            probeTimeoutMs: options.probeTimeoutMs,
            settleMs: options.settleMs,
          }),
        )
      }
    }

    if (options.finalSettleMs > 0) {
      await delay(options.finalSettleMs)
      snapshots.push(
        await sampleProcess({
          child,
          endpoint: "process",
          label: `final-settle-${options.finalSettleMs}ms`,
          status: 0,
        }),
      )
    }

    const summary = summarizeSnapshots(snapshots)

    const result = {
      baseUrl,
      binary,
      copiedModelsCache,
      endpoints: options.endpoints,
      finalSettleMs: options.finalSettleMs,
      measuredAt: new Date().toISOString(),
      pid: child.pid,
      probeTimeoutMs: options.probeTimeoutMs,
      runtimeRoot,
      settleMs: options.settleMs,
      snapshots,
      summary,
    }

    if (options.outFile) {
      const outFile = path.resolve(options.outFile)
      mkdirSync(path.dirname(outFile), { recursive: true })
      writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`)
      if (!options.outputJson) {
        console.log(`wrote=${outFile}`)
      }
    }

    if (options.outputJson) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(renderTable(snapshots))
      console.log(
        `summary=peak ${summary.peakPrivateMB.toFixed(1)} MB private / ${summary.peakWorkingSetMB.toFixed(1)} MB working set; final ${summary.finalPrivateMB.toFixed(1)} MB private / ${summary.finalWorkingSetMB.toFixed(1)} MB working set`,
      )
      console.log(`binary=${binary}`)
      console.log(`modelsCache=${copiedModelsCache ?? "none"}`)
      console.log(`runtimeRoot=${runtimeRoot}`)
    }
  } catch (error) {
    await stopProcess(child)
    processStopped = true
    const [stdoutText, stderrText] = await Promise.all([stdout, stderr])
    console.error("Sidecar memory measurement failed.")
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
      console.log(`Kept runtime root at ${runtimeRoot}`)
    }
  }
}

await main()
