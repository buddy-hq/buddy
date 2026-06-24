#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import {
  DEFAULT_STARTUP_TIMEOUT_MS,
  PASSWORD,
  USERNAME,
  cleanupRuntimeRoot,
  delay,
  hasFlag,
  parsePort,
  readFlagValue,
  spawnNodeArtifact,
  stopProcess,
  tail,
  waitForHealthyEndpoint,
  type NodeArtifactProcess,
} from "./node-artifact-runtime"

const DEFAULT_ENDPOINTS = ["/api/healthz", "/api/health", "/api/provider", "/api/provider/auth"]
const DEFAULT_PROBE_TIMEOUT_MS = 180_000
const DEFAULT_SETTLE_MS = 2_000
const DEFAULT_FINAL_SETTLE_MS = 30_000
const DEFAULT_CYCLES = 2
const DEFAULT_OUTPUT_DIR = path.resolve(import.meta.dir, "../../../docs/memory-optimization/log")

type Options = {
  cycles: number
  endpoints: string[]
  entrypoint?: string
  finalSettleMs: number
  keepRuntime: boolean
  migrationDir?: string
  outFile?: string
  outputJson: boolean
  port?: number
  probeTimeoutMs: number
  settleMs: number
  startupTimeoutMs: number
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

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeEndpoint(value: string): string {
  return value.startsWith("/") ? value : `/${value}`
}

function timestampForPath(date: Date): string {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "-")
}

function defaultOutputFile() {
  return path.join(DEFAULT_OUTPUT_DIR, `${timestampForPath(new Date())}-node-artifact.json`)
}

function parseOptions(): Options {
  const args = Bun.argv.slice(2)
  const endpoints = readRepeatedFlagValues(args, "--endpoint").map(normalizeEndpoint)

  return {
    cycles: parsePositiveInteger(readFlagValue(args, "--cycles"), DEFAULT_CYCLES),
    endpoints: endpoints.length > 0 ? endpoints : [...DEFAULT_ENDPOINTS],
    entrypoint: readFlagValue(args, "--entrypoint"),
    finalSettleMs: parsePositiveInteger(
      readFlagValue(args, "--final-settle-ms"),
      DEFAULT_FINAL_SETTLE_MS,
    ),
    keepRuntime: hasFlag(args, "--keep-runtime"),
    migrationDir: readFlagValue(args, "--migration-dir"),
    outFile: hasFlag(args, "--no-out")
      ? undefined
      : (readFlagValue(args, "--out") ?? defaultOutputFile()),
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
  }
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
    throw new Error(
      "measure-node-memory currently reads private and working-set memory on Windows only",
    )
  }

  return await readWindowsProcessMemory(pid)
}

async function measureEndpoint(input: {
  baseUrl: string
  child: NodeArtifactProcess
  endpoint: string
  label: string
  probeTimeoutMs: number
  settleMs: number
}): Promise<MemorySnapshot> {
  const response = await fetch(new URL(input.endpoint, input.baseUrl), {
    headers: {
      authorization: `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`,
    },
    signal: AbortSignal.timeout(input.probeTimeoutMs),
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
  child: NodeArtifactProcess
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

function summarizeSnapshots(snapshots: MemorySnapshot[]) {
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

async function waitForHealthz(input: {
  baseUrl: string
  child: NodeArtifactProcess
  startupTimeoutMs: number
}) {
  const result = await waitForHealthyEndpoint({
    baseUrl: input.baseUrl,
    child: input.child,
    pathname: "/api/healthz",
    startupTimeoutMs: input.startupTimeoutMs,
  })

  if (!result.ok) {
    throw new Error(result.body || result.error || "/api/healthz did not become healthy")
  }
}

async function main(): Promise<void> {
  const options = parseOptions()
  const spawned = await spawnNodeArtifact({
    entrypoint: options.entrypoint,
    migrationDir: options.migrationDir,
    port: options.port,
  })

  let processStopped = false

  try {
    await waitForHealthz({
      baseUrl: spawned.baseUrl,
      child: spawned.child,
      startupTimeoutMs: options.startupTimeoutMs,
    })

    const snapshots: MemorySnapshot[] = []
    snapshots.push(
      await sampleProcess({
        child: spawned.child,
        endpoint: "process",
        label: "ready-after-healthz-poll",
        status: 0,
      }),
    )

    for (let cycle = 1; cycle <= options.cycles; cycle += 1) {
      for (const endpoint of options.endpoints) {
        snapshots.push(
          await measureEndpoint({
            baseUrl: spawned.baseUrl,
            child: spawned.child,
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
          child: spawned.child,
          endpoint: "process",
          label: `final-settle-${options.finalSettleMs}ms`,
          status: 0,
        }),
      )
    }

    const summary = summarizeSnapshots(snapshots)
    const result = {
      baseUrl: spawned.baseUrl,
      entrypoint: options.entrypoint,
      endpoints: options.endpoints,
      finalSettleMs: options.finalSettleMs,
      measuredAt: new Date().toISOString(),
      pid: spawned.child.pid,
      probeTimeoutMs: options.probeTimeoutMs,
      runtimeRoot: spawned.runtimeRoot,
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
      return
    }

    console.log(renderTable(snapshots))
    console.log(
      `summary=peak ${summary.peakPrivateMB.toFixed(1)} MB private / ${summary.peakWorkingSetMB.toFixed(1)} MB working set; final ${summary.finalPrivateMB.toFixed(1)} MB private / ${summary.finalWorkingSetMB.toFixed(1)} MB working set`,
    )
    console.log(`runtimeRoot=${spawned.runtimeRoot}`)
  } catch (error) {
    await stopProcess(spawned.child)
    processStopped = true
    const [stdoutText, stderrText] = await Promise.all([spawned.stdout, spawned.stderr])
    console.error("Buddy Node backend memory measurement failed.")
    console.error(`stdout:\n${tail(stdoutText)}`)
    console.error(`stderr:\n${tail(stderrText)}`)
    throw error
  } finally {
    if (!processStopped) {
      await stopProcess(spawned.child)
    }
    cleanupRuntimeRoot(spawned.runtimeRoot, options.keepRuntime)
  }
}

await main()
