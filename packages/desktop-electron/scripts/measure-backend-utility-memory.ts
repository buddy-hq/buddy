#!/usr/bin/env bun

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_STARTUP_TIMEOUT_MS,
  HEALTHZ_PATH,
  HOSTNAME,
  PASSWORD,
  USERNAME,
  allocatePort,
  delay,
  readStream,
  tail,
} from "../../buddy/script/node-artifact-runtime"
import type { NodeArtifactProcess } from "../../buddy/script/node-artifact-runtime"
import { resolveElectronBin } from "./electron-bin"
import {
  resolveExplicitRuntimeRootEnvironment,
  resolveExplicitRuntimeRootPaths,
  syncDesktopRuntimeResources,
} from "./utils"
import { BUDDY_ENV, OPENCODE_ENV } from "@buddy/script/storage-env"
import { parseTJsonObject, parseTNumber, parseTString } from "../src/shared/parse-external"

const BACKEND_UTILITY_SCRIPT = "backend-utility.js" as const
const ELECTRON_RUN_AS_NODE_ENV = "ELECTRON_RUN_AS_NODE" as const
const NODE_PATH_ENV_KEY = "NODE_PATH" as const
const SMOKE_READY_FILENAME = "backend-utility-ready.json" as const
const SMOKE_STOP_FILENAME = "backend-utility-stop.json" as const
const SMOKE_ROOT_PREFIX = "buddy-backend-utility-memory-" as const
const SMOKE_EXIT_TIMEOUT_MS = 45_000
const UTILITY_CWD_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_CWD" as const
const UTILITY_EXIT_TIMEOUT_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_EXIT_TIMEOUT_MS" as const
const UTILITY_HOSTNAME_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_HOSTNAME" as const
const UTILITY_PATH_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_PATH" as const
const UTILITY_READY_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_READY_PATH" as const
const UTILITY_STARTUP_TIMEOUT_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_STARTUP_TIMEOUT_MS" as const
const UTILITY_STOP_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_STOP_PATH" as const
const API_HEALTH_PATH = "/api/health" as const
const API_PROVIDER_PATH = "/api/provider" as const
const API_PROVIDER_AUTH_PATH = "/api/provider/auth" as const
const API_SESSION_PATH = "/api/session" as const
const MODE_FLAG = "--mode" as const
const OUTPUT_FLAG = "--out" as const
const MODE_STANDARD = "standard" as const
const MODE_HEALTHZ_ONLY = "healthz-only" as const
const MODE_SAFE_READ_MATRIX = "safe-read-matrix" as const
const FINAL_SETTLE_MS = 30_000
const MEGABYTE = 1024 * 1024

type Mode = typeof MODE_STANDARD | typeof MODE_HEALTHZ_ONLY | typeof MODE_SAFE_READ_MATRIX

type MemorySample = {
  bodyBytes: number
  endpoint: string
  label: string
  privateMb: number
  status: number
  workingSetMb: number
}

type ReadyFile = {
  pid: number
  ready: true
}

type MeasurementResult = {
  binary: string
  commit: string
  finalPrivateMb: number
  finalWorkingSetMb: number
  mode: Mode
  peakPrivateMb: number
  peakWorkingSetMb: number
  runtimeRoot: string
  samples: MemorySample[]
  timestamp: string
  utilityPid: number
}

const packageDir = path.resolve(import.meta.dir, "..")
const mainOutputDir = path.resolve(packageDir, "out", "main")
const utilityPath = path.resolve(mainOutputDir, BACKEND_UTILITY_SCRIPT)
const memoryMainScript = path.resolve(import.meta.dir, "backend-utility-memory-main.mjs")
const electronBin = resolveElectronBin(packageDir)

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index < 0) return undefined
  return args[index + 1]
}

function resolveMode(raw: string | undefined): Mode {
  if (raw === undefined || raw === MODE_STANDARD) return MODE_STANDARD
  if (raw === MODE_HEALTHZ_ONLY) return MODE_HEALTHZ_ONLY
  if (raw === MODE_SAFE_READ_MATRIX) return MODE_SAFE_READ_MATRIX
  throw new Error(`Unsupported measurement mode: ${raw}`)
}

function resolveOutputPath(mode: Mode): string {
  const configured = readFlagValue(process.argv, OUTPUT_FLAG)
  if (configured) return path.resolve(configured)
  const shortCommit = currentCommit().slice(0, 8)
  return path.resolve(
    packageDir,
    "..",
    "..",
    "docs",
    "memory-optimization",
    "log",
    `current-backend-utility-${shortCommit}-${mode}.json`,
  )
}

function baseEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[0] !== NODE_PATH_ENV_KEY &&
        entry[0] !== ELECTRON_RUN_AS_NODE_ENV &&
        parseTString(entry[1]) !== undefined,
    ),
  )
}

function createBackendEnvironment(input: {
  backendResources: string
  migrations: string
  port: number
  runtimeRoot: string
  tessdata: string
}) {
  const { notebookRoot, xdgRoot } = resolveExplicitRuntimeRootPaths(input.runtimeRoot)
  mkdirSync(notebookRoot, { recursive: true })
  mkdirSync(xdgRoot, { recursive: true })

  return {
    ...baseEnvironment(),
    ...resolveExplicitRuntimeRootEnvironment(xdgRoot),
    [BUDDY_ENV.ALLOWED_DIRECTORY_ROOTS]: notebookRoot,
    [BUDDY_ENV.APP_VERSION]: "backend-utility-memory",
    [BUDDY_ENV.BACKEND_RESOURCES_DIR]: input.backendResources,
    [BUDDY_ENV.TESSDATA_DIR]: input.tessdata,
    [BUDDY_ENV.DIRECTORY_BASE]: notebookRoot,
    [BUDDY_ENV.MIGRATION_DIR]: path.join(input.migrations, "buddy"),
    [BUDDY_ENV.SERVER_PASSWORD]: PASSWORD,
    [BUDDY_ENV.SERVER_USERNAME]: USERNAME,
    [OPENCODE_ENV.CLIENT]: "desktop",
    [OPENCODE_ENV.DISABLE_DEFAULT_PLUGINS]: "1",
    [OPENCODE_ENV.DISABLE_EXTERNAL_SKILLS]: "1",
    [OPENCODE_ENV.DISABLE_MODELS_FETCH]: "1",
    [OPENCODE_ENV.EXPERIMENTAL_FILEWATCHER]: "true",
    [OPENCODE_ENV.EXPERIMENTAL_ICON_DISCOVERY]: "true",
    [OPENCODE_ENV.SERVER_PASSWORD]: PASSWORD,
    [OPENCODE_ENV.SERVER_USERNAME]: USERNAME,
    PORT: String(input.port),
  }
}

function createIsolatedMainOutput(smokeRoot: string) {
  const isolatedMainDir = path.join(smokeRoot, "main")
  cpSync(mainOutputDir, isolatedMainDir, { recursive: true, dereference: false })
  return {
    isolatedMainDir,
    utilityPath: path.join(isolatedMainDir, BACKEND_UTILITY_SCRIPT),
  }
}

function readableStream(stream: NodeArtifactProcess["stdout"]): ReadableStream<Uint8Array> | null {
  return stream instanceof ReadableStream ? stream : null
}

function authorizationHeader(): string {
  return `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`
}

async function request(input: {
  baseUrl: string
  body?: unknown
  method?: "GET" | "POST"
  pathname: string
  search?: Record<string, string>
}): Promise<{ bodyBytes: number; status: number }> {
  const url = new URL(input.pathname, input.baseUrl)
  for (const [key, value] of Object.entries(input.search ?? {})) {
    url.searchParams.set(key, value)
  }
  const response = await fetch(url, {
    method: input.method ?? "GET",
    headers: Object.assign(
      {
        authorization: authorizationHeader(),
      },
      input.body === undefined ? undefined : { "content-type": "application/json" },
    ),
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  })
  const body = await response.text()
  return { bodyBytes: Buffer.byteLength(body), status: response.status }
}

async function sampleMemory(pid: number): Promise<{ privateMb: number; workingSetMb: number }> {
  if (process.platform !== "win32") {
    throw new Error("This measurement script currently records Windows process counters only")
  }
  const script = [
    `$p = Get-Process -Id ${pid} -ErrorAction Stop`,
    `[Console]::WriteLine(("{0},{1}" -f $p.PrivateMemorySize64,$p.WorkingSet64))`,
  ].join("; ")
  const child = Bun.spawn(["powershell", "-NoProfile", "-Command", script], {
    stderr: "pipe",
    stdout: "pipe",
    windowsHide: true,
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    readStream(readableStream(child.stdout)),
    readStream(readableStream(child.stderr)),
    child.exited,
  ])
  if (exitCode !== 0) {
    throw new Error(`Failed to sample utility process ${pid}: ${stderr || stdout}`)
  }
  const [privateBytesRaw, workingSetBytesRaw] = stdout.trim().split(",")
  const privateBytes = Number(privateBytesRaw)
  const workingSetBytes = Number(workingSetBytesRaw)
  if (!Number.isFinite(privateBytes) || !Number.isFinite(workingSetBytes)) {
    throw new Error(`Unexpected memory sample for ${pid}: ${stdout}`)
  }
  return {
    privateMb: roundMb(privateBytes / MEGABYTE),
    workingSetMb: roundMb(workingSetBytes / MEGABYTE),
  }
}

async function waitForReadyFile(input: {
  child: NodeArtifactProcess
  readyPath: string
  startupTimeoutMs: number
}): Promise<ReadyFile> {
  const deadline = Date.now() + input.startupTimeoutMs

  while (Date.now() < deadline) {
    if (existsSync(input.readyPath)) {
      const parsed: unknown = JSON.parse(readFileSync(input.readyPath, "utf8"))
      if (isReadyFile(parsed)) return parsed
      throw new Error(`Invalid backend utility ready file: ${input.readyPath}`)
    }

    const exited = await Promise.race([
      input.child.exited.then((code) => code),
      delay(0).then(() => undefined),
    ])
    if (exited !== undefined) {
      throw new Error(`Electron backend utility memory probe exited before ready (code=${exited})`)
    }

    await delay(DEFAULT_POLL_INTERVAL_MS)
  }

  throw new Error("Electron backend utility memory probe did not report ready")
}

async function waitForProcessExit(
  child: NodeArtifactProcess,
  stdoutText: Promise<string>,
  stderrText: Promise<string>,
): Promise<void> {
  const exitCode = await Promise.race([
    child.exited,
    delay(SMOKE_EXIT_TIMEOUT_MS).then(() => {
      throw new Error("Electron backend utility memory probe did not exit")
    }),
  ])

  if (exitCode !== 0) {
    const [stdout, stderr] = await Promise.all([stdoutText, stderrText])
    throw new Error(
      `Electron backend utility memory probe failed.\nstdout:\n${tail(stdout)}\nstderr:\n${tail(stderr)}`,
    )
  }
}

async function record(input: {
  endpoint: string
  label: string
  pid: number
  request?: () => Promise<{ bodyBytes: number; status: number }>
  samples: MemorySample[]
}): Promise<void> {
  const response = input.request ? await input.request() : { bodyBytes: 0, status: 0 }
  const memory = await sampleMemory(input.pid)
  input.samples.push({
    bodyBytes: response.bodyBytes,
    endpoint: input.endpoint,
    label: input.label,
    privateMb: memory.privateMb,
    status: response.status,
    workingSetMb: memory.workingSetMb,
  })
}

type ScenarioStep = {
  endpoint: string
  label: string
  request?: (context: {
    baseUrl: string
    directory: string
  }) => Promise<{ bodyBytes: number; status: number }>
  settleMs?: number
}

function scenario(mode: Mode): ScenarioStep[] {
  if (mode === MODE_HEALTHZ_ONLY) {
    return [
      endpointStep("cycle-1", HEALTHZ_PATH),
      endpointStep("cycle-2", HEALTHZ_PATH),
      endpointStep("cycle-3", HEALTHZ_PATH),
      {
        endpoint: "process",
        label: `final-settle-${FINAL_SETTLE_MS}ms`,
        settleMs: FINAL_SETTLE_MS,
      },
    ]
  }

  if (mode === MODE_SAFE_READ_MATRIX) {
    return [
      endpointStep("safe-healthz-1", HEALTHZ_PATH),
      endpointStep("safe-health", API_HEALTH_PATH),
      endpointStep("safe-provider", API_PROVIDER_PATH),
      endpointStep("safe-provider-auth", API_PROVIDER_AUTH_PATH),
      endpointStep("safe-session-list", API_SESSION_PATH),
      endpointStep("safe-healthz-2", HEALTHZ_PATH),
      endpointStep("safe-provider-2", API_PROVIDER_PATH),
      endpointStep("safe-provider-auth-2", API_PROVIDER_AUTH_PATH),
      {
        endpoint: "process",
        label: `final-settle-${FINAL_SETTLE_MS}ms`,
        settleMs: FINAL_SETTLE_MS,
      },
    ]
  }

  return [
    endpointStep("cycle-1", HEALTHZ_PATH),
    endpointStep("cycle-1", API_HEALTH_PATH),
    endpointStep("cycle-1", API_PROVIDER_PATH),
    endpointStep("cycle-1", API_PROVIDER_AUTH_PATH),
    endpointStep("cycle-2", HEALTHZ_PATH),
    endpointStep("cycle-2", API_HEALTH_PATH),
    endpointStep("cycle-2", API_PROVIDER_PATH),
    endpointStep("cycle-2", API_PROVIDER_AUTH_PATH),
    { endpoint: "process", label: `final-settle-${FINAL_SETTLE_MS}ms`, settleMs: FINAL_SETTLE_MS },
  ]
}

function endpointStep(
  label: string,
  endpoint: string,
): ScenarioStep {
  return {
    endpoint,
    label,
    request: ({ baseUrl, directory }) =>
      request({
        baseUrl,
        pathname: endpoint,
        search:
          endpoint === HEALTHZ_PATH || endpoint === API_HEALTH_PATH ? undefined : { directory },
      }),
  }
}

function currentCommit(): string {
  return (
    Bun.spawnSync(["git", "rev-parse", "HEAD"], {
      cwd: path.resolve(packageDir, "..", ".."),
      stderr: "ignore",
      stdout: "pipe",
      windowsHide: true,
    })
      .stdout.toString()
      .trim() || "unknown"
  )
}

function isReadyFile<TValue>(value: TValue): value is TValue & ReadyFile {
  const record = parseTJsonObject(value)
  if (record === undefined) return false
  if (record.ready !== true) return false
  return parseTNumber(record.pid) !== undefined
}

function roundMb(value: number): number {
  return Math.round(value * 10) / 10
}

function printTable(samples: MemorySample[]): void {
  const headers = ["Label", "Endpoint", "Status", "Body bytes", "Private MB", "Working set MB"]
  const rows = samples.map((sample) => [
    sample.label,
    sample.endpoint,
    String(sample.status),
    String(sample.bodyBytes),
    sample.privateMb.toFixed(1),
    sample.workingSetMb.toFixed(1),
  ])
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  )
  console.log(headers.map((header, index) => header.padEnd(widths[index])).join("  "))
  for (const row of rows) {
    console.log(row.map((value, index) => value.padEnd(widths[index])).join("  "))
  }
}

if (!existsSync(utilityPath)) {
  throw new Error(
    `Backend utility build output missing at ${utilityPath}. Run desktop build first.`,
  )
}
if (!existsSync(electronBin)) {
  throw new Error(`Electron binary missing at ${electronBin}. Run bun install first.`)
}
if (!existsSync(memoryMainScript)) {
  throw new Error(`Electron backend utility memory main script missing at ${memoryMainScript}`)
}

const mode = resolveMode(readFlagValue(process.argv, MODE_FLAG))
const outputPath = resolveOutputPath(mode)
const resources = syncDesktopRuntimeResources()
const smokeRoot = mkdtempSync(path.join(os.tmpdir(), SMOKE_ROOT_PREFIX))
const runtimeRoot = path.join(smokeRoot, "runtime")
const readyPath = path.join(smokeRoot, SMOKE_READY_FILENAME)
const stopPath = path.join(smokeRoot, SMOKE_STOP_FILENAME)
const port = await allocatePort()
const isolatedMain = createIsolatedMainOutput(smokeRoot)
const notebookRoot = path.join(runtimeRoot, "notebook")
const samples: MemorySample[] = []

let child: NodeArtifactProcess | undefined
let stdoutText: Promise<string> | undefined
let stderrText: Promise<string> | undefined

try {
  child = Bun.spawn([electronBin, memoryMainScript], {
    cwd: smokeRoot,
    env: {
      ...createBackendEnvironment({
        backendResources: resources.backendResources,
        migrations: resources.migrations,
        port,
        runtimeRoot,
        tessdata: resources.tessdata,
      }),
      [UTILITY_CWD_ENV]: isolatedMain.isolatedMainDir,
      [UTILITY_EXIT_TIMEOUT_ENV]: String(SMOKE_EXIT_TIMEOUT_MS),
      [UTILITY_HOSTNAME_ENV]: HOSTNAME,
      [UTILITY_PATH_ENV]: isolatedMain.utilityPath,
      [UTILITY_READY_ENV]: readyPath,
      [UTILITY_STARTUP_TIMEOUT_ENV]: String(DEFAULT_STARTUP_TIMEOUT_MS),
      [UTILITY_STOP_ENV]: stopPath,
    },
    stderr: "pipe",
    stdout: "pipe",
    windowsHide: true,
  })
  stdoutText = readStream(readableStream(child.stdout))
  stderrText = readStream(readableStream(child.stderr))

  const ready = await waitForReadyFile({
    child,
    readyPath,
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
  })

  const baseUrl = `http://${HOSTNAME}:${port}`
  await record({
    endpoint: "process",
    label: "ready-after-utility-ready",
    pid: ready.pid,
    samples,
  })

  for (const step of scenario(mode)) {
    if (step.settleMs) await delay(step.settleMs)
    const stepRequest = step.request
    await record({
      endpoint: step.endpoint,
      label: step.label,
      pid: ready.pid,
      request: stepRequest ? () => stepRequest({ baseUrl, directory: notebookRoot }) : undefined,
      samples,
    })
  }

  writeFileSync(stopPath, JSON.stringify({ stop: true }), "utf8")
  await waitForProcessExit(child, stdoutText, stderrText)

  const peakPrivateMb = Math.max(...samples.map((sample) => sample.privateMb))
  const peakWorkingSetMb = Math.max(...samples.map((sample) => sample.workingSetMb))
  const finalSample = samples.at(-1)
  if (!finalSample) throw new Error("No memory samples recorded")

  const result: MeasurementResult = {
    binary: electronBin,
    commit: currentCommit(),
    finalPrivateMb: finalSample.privateMb,
    finalWorkingSetMb: finalSample.workingSetMb,
    mode,
    peakPrivateMb,
    peakWorkingSetMb,
    runtimeRoot,
    samples,
    timestamp: new Date().toISOString(),
    utilityPid: ready.pid,
  }
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8")

  console.log(`wrote=${outputPath}`)
  printTable(samples)
  console.log(
    `summary=peak ${peakPrivateMb.toFixed(1)} MB private / ${peakWorkingSetMb.toFixed(1)} MB working set; final ${finalSample.privateMb.toFixed(1)} MB private / ${finalSample.workingSetMb.toFixed(1)} MB working set`,
  )
  console.log(`binary=${electronBin}`)
  console.log(`runtimeRoot=${runtimeRoot}`)
} catch (error) {
  if (child) child.kill()
  if (stdoutText && stderrText) {
    const [stdout, stderr] = await Promise.all([stdoutText, stderrText])
    console.error(`stdout:\n${tail(stdout)}`)
    console.error(`stderr:\n${tail(stderr)}`)
  }
  throw error
} finally {
  rmSync(smokeRoot, { recursive: true, force: true })
}
