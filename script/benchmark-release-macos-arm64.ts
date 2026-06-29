import { readdir, stat } from "node:fs/promises"
import { resolve } from "node:path"
import desktopPackage from "../packages/desktop-electron/package.json"

const MILLISECONDS_PER_SECOND = 1_000
const BYTES_PER_MEBIBYTE = 1_024 * 1_024
const BENCHMARK_PLATFORM = "darwin"
const BENCHMARK_ARCHITECTURE = "arm64"

type CommandMetric = {
  command: string[]
  durationMilliseconds: number
  exitCode: number
  name: string
}

type DirectoryMetric = {
  bytes: number
  mebibytes: number
  path: string
}

const repositoryRoot = resolve(import.meta.dir, "..")
const phase = readRequiredEnvironmentVariable("RELEASE_BENCHMARK_PHASE")
const outputPath = readRequiredEnvironmentVariable("RELEASE_BENCHMARK_OUTPUT")
const bunCacheDirectory = readRequiredEnvironmentVariable("BUN_INSTALL_CACHE_DIR")
const electronCacheDirectory = readRequiredEnvironmentVariable("ELECTRON_CACHE")
const electronBuilderCacheDirectory = readRequiredEnvironmentVariable("ELECTRON_BUILDER_CACHE")
const startedAt = new Date()
const started = performance.now()
const commands: CommandMetric[] = []
let failure: Error | undefined

const commandDefinitions = [
  {
    command: ["bun", "install", `--os=${BENCHMARK_PLATFORM}`, `--cpu=${BENCHMARK_ARCHITECTURE}`],
    name: "install dependencies",
  },
  {
    command: ["bun", "run", "sdk:generate"],
    name: "generate SDK",
  },
  {
    command: ["bun", "run", "--cwd", "packages/desktop-electron", "prepare:release"],
    name: "prepare release",
  },
  {
    command: ["bun", "run", "--cwd", "packages/desktop-electron", "build"],
    name: "build Electron app",
  },
  {
    command: ["bun", "run", "--cwd", "packages/desktop-electron", "smoke:backend-utility"],
    name: "smoke Electron backend utility",
  },
  {
    command: [
      "bunx",
      "--bun",
      "electron-builder",
      "--mac",
      "--arm64",
      "--publish",
      "never",
      "--config",
      "electron-builder.config.ts",
    ],
    cwd: resolve(repositoryRoot, "packages/desktop-electron"),
    name: "package Electron app",
  },
] as const

for (const definition of commandDefinitions) {
  const commandStarted = performance.now()
  const subprocess = Bun.spawn(definition.command, {
    cwd: "cwd" in definition ? definition.cwd : repositoryRoot,
    env: {
      ...process.env,
      BUDDY_VERSION: desktopPackage.version,
    },
    stderr: "inherit",
    stdin: "inherit",
    stdout: "inherit",
  })
  const exitCode = await subprocess.exited
  commands.push({
    command: [...definition.command],
    durationMilliseconds: roundMilliseconds(performance.now() - commandStarted),
    exitCode,
    name: definition.name,
  })

  if (exitCode !== 0) {
    failure = new Error(`${definition.name} failed with exit code ${exitCode}`)
    break
  }
}

const finishedAt = new Date()
const directories = await Promise.all(
  [
    bunCacheDirectory,
    electronCacheDirectory,
    electronBuilderCacheDirectory,
    resolve(repositoryRoot, "packages/desktop-electron/dist"),
  ].map(readDirectoryMetric),
)
const metrics = {
  architecture: BENCHMARK_ARCHITECTURE,
  bunVersion: Bun.version,
  commands,
  commit: process.env.GITHUB_SHA ?? "local",
  directories,
  finishedAt: finishedAt.toISOString(),
  githubRunId: process.env.GITHUB_RUN_ID,
  hostArchitecture: process.arch,
  hostPlatform: process.platform,
  phase,
  runnerName: process.env.RUNNER_NAME,
  startedAt: startedAt.toISOString(),
  targetPlatform: BENCHMARK_PLATFORM,
  totalDurationMilliseconds: roundMilliseconds(performance.now() - started),
  version: desktopPackage.version,
}

await Bun.write(outputPath, `${JSON.stringify(metrics, null, 2)}\n`)
await appendStepSummary(metrics)

if (failure) {
  throw failure
}

function readRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

function roundMilliseconds(value: number): number {
  return Math.round(value)
}

async function readDirectoryMetric(path: string): Promise<DirectoryMetric> {
  const bytes = await readDirectorySize(path)
  return {
    bytes,
    mebibytes: Math.round((bytes / BYTES_PER_MEBIBYTE) * 100) / 100,
    path,
  }
}

async function readDirectorySize(path: string): Promise<number> {
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch {
    return 0
  }

  let bytes = 0
  for (const entry of entries) {
    const entryPath = resolve(path, entry.name)
    if (entry.isDirectory()) {
      bytes += await readDirectorySize(entryPath)
      continue
    }
    if (!entry.isFile()) {
      continue
    }

    bytes += (await stat(entryPath)).size
  }
  return bytes
}

async function appendStepSummary(metrics: {
  commands: CommandMetric[]
  phase: string
  totalDurationMilliseconds: number
}): Promise<void> {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!summaryPath) {
    return
  }

  const rows = metrics.commands.map(
    (command) =>
      `| ${command.name} | ${(command.durationMilliseconds / MILLISECONDS_PER_SECOND).toFixed(2)}s | ${command.exitCode} |`,
  )
  const summary = [
    `## Release benchmark: ${metrics.phase}`,
    "",
    "| Command | Duration | Exit code |",
    "| --- | ---: | ---: |",
    ...rows,
    "",
    `Measured command total: ${(metrics.totalDurationMilliseconds / MILLISECONDS_PER_SECOND).toFixed(2)}s`,
    "",
  ].join("\n")

  await Bun.write(summaryPath, summary)
}
