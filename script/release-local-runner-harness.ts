#!/usr/bin/env bun

import { createHash } from "node:crypto"
import { appendFile, mkdir, readdir, readFile, rm, stat } from "node:fs/promises"
import { resolve } from "node:path"
import desktopPackage from "../packages/desktop-electron/package.json"

const BYTES_PER_MEBIBYTE = 1_024 * 1_024
const MILLISECONDS_PER_SECOND = 1_000
const DEFAULT_PLATFORM = "darwin"
const DEFAULT_ARCHITECTURE = "arm64"
const CURRENT_PROFILE = "current"
const OPTIMIZED_PROFILE = "optimized"
const SCHEMA_VERSION = 1
const CACHE_EPOCH = "v1"
const LOCKFILE_PATH = "bun.lock"
const PATCHES_DIRECTORY = "patches"
const DESKTOP_PACKAGE_PATH = "packages/desktop-electron/package.json"
const ELECTRON_PACKAGE_NAME = "electron"
const ELECTRON_BUILDER_PACKAGE_NAME = "electron-builder"
const HARNESS_CACHE_ROOT = ".release-local-runner-cache"
const HARNESS_OUTPUT_ENV_KEY = "BUDDY_RELEASE_HARNESS_OUTPUT"
const HARNESS_PROFILE_ENV_KEY = "BUDDY_RELEASE_HARNESS_PROFILE"
const HARNESS_CACHE_ROOT_ENV_KEY = "BUDDY_RELEASE_HARNESS_CACHE_ROOT"
const BUN_INSTALL_CACHE_DIR_ENV_KEY = "BUN_INSTALL_CACHE_DIR"
const ELECTRON_CACHE_ENV_KEY = "ELECTRON_CACHE"
const ELECTRON_BUILDER_CACHE_ENV_KEY = "ELECTRON_BUILDER_CACHE"
const TARGET_PLATFORM_ENV_KEY = "BUDDY_NODE_ARTIFACT_TARGET_PLATFORM"
const TARGET_ARCHITECTURE_ENV_KEY = "BUDDY_NODE_ARTIFACT_TARGET_ARCH"
const BUDDY_CHANNEL_ENV_KEY = "BUDDY_CHANNEL"
const BUDDY_VERSION_ENV_KEY = "BUDDY_VERSION"
const PRODUCTION_CHANNEL = "prod"

type HarnessProfile = typeof CURRENT_PROFILE | typeof OPTIMIZED_PROFILE

type CachePaths = {
  bunInstallCacheDirectory: string
  electronBuilderCacheDirectory: string
  electronCacheDirectory: string
  rootDirectory: string
}

type CommandMetric = {
  command: string[]
  durationMilliseconds: number
  exitCode: number
  finishedAt: string
  name: string
  startedAt: string
}

type DirectoryMetric = {
  bytes: number
  label: string
  mebibytes: number
  path: string
}

type OutputFileMetric = {
  bytes: number
  path: string
}

type HarnessMetrics = {
  architecture: string
  bunVersion: string
  cachePaths: CachePaths
  commands: CommandMetric[]
  directories: DirectoryMetric[]
  finishedAt?: string
  hostArchitecture: string
  hostPlatform: string
  outputFiles: OutputFileMetric[]
  profile: HarnessProfile
  repositoryRoot: string
  schemaVersion: number
  startedAt: string
  targetPlatform: string
  totalDurationMilliseconds?: number
  version: string
}

type CommandDefinition = {
  command: string[]
  cwd?: string
  name: string
}

const repositoryRoot = resolve(import.meta.dir, "..")
const desktopPackageDirectory = resolve(repositoryRoot, "packages/desktop-electron")
const commandDefinitions: readonly CommandDefinition[] = [
  {
    command: ["bun", "install", "--os=darwin", "--cpu=arm64"],
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
    command: [
      "bun",
      "run",
      "--cwd",
      "packages/desktop-electron",
      "smoke:backend-utility",
    ],
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
    cwd: desktopPackageDirectory,
    name: "package Electron app",
  },
]

const subcommand = process.argv[2]

if (subcommand === "init") {
  await initHarness()
} else if (subcommand === "reset") {
  await resetLocalOutputs()
} else if (subcommand === "run") {
  await runMeasuredCommand()
} else if (subcommand === "run-all") {
  await runAllMeasuredCommands()
} else if (subcommand === "snapshot") {
  await snapshotHarness()
} else if (subcommand === "compare") {
  await compareHarnessRuns()
} else {
  throw new Error(
    "Usage: bun ./script/release-local-runner-harness.ts init|reset|run|run-all|snapshot|compare",
  )
}

async function initHarness(): Promise<void> {
  const profile = parseProfile(readFlag("--profile") || process.env[HARNESS_PROFILE_ENV_KEY])
  const outputPath = resolveOutputPath(profile)
  const cachePaths = await resolveCachePaths(profile)
  await Promise.all([
    mkdir(resolve(outputPath, ".."), { recursive: true }),
    mkdir(cachePaths.bunInstallCacheDirectory, { recursive: true }),
    mkdir(cachePaths.electronCacheDirectory, { recursive: true }),
    mkdir(cachePaths.electronBuilderCacheDirectory, { recursive: true }),
  ])

  const startedAt = new Date()
  const metrics: HarnessMetrics = {
    architecture: DEFAULT_ARCHITECTURE,
    bunVersion: Bun.version,
    cachePaths,
    commands: [],
    directories: [],
    hostArchitecture: process.arch,
    hostPlatform: process.platform,
    outputFiles: [],
    profile,
    repositoryRoot,
    schemaVersion: SCHEMA_VERSION,
    startedAt: startedAt.toISOString(),
    targetPlatform: DEFAULT_PLATFORM,
    version: desktopPackage.version,
  }

  await writeMetrics(outputPath, metrics)
  await appendGithubEnvironment({
    [BUDDY_CHANNEL_ENV_KEY]: PRODUCTION_CHANNEL,
    [BUDDY_VERSION_ENV_KEY]: desktopPackage.version,
    [BUN_INSTALL_CACHE_DIR_ENV_KEY]: cachePaths.bunInstallCacheDirectory,
    [ELECTRON_BUILDER_CACHE_ENV_KEY]: cachePaths.electronBuilderCacheDirectory,
    [ELECTRON_CACHE_ENV_KEY]: cachePaths.electronCacheDirectory,
    [HARNESS_OUTPUT_ENV_KEY]: outputPath,
    [HARNESS_PROFILE_ENV_KEY]: profile,
    [TARGET_ARCHITECTURE_ENV_KEY]: DEFAULT_ARCHITECTURE,
    [TARGET_PLATFORM_ENV_KEY]: DEFAULT_PLATFORM,
  })

  console.log(`Initialized ${profile} release harness metrics: ${outputPath}`)
}

async function resetLocalOutputs(): Promise<void> {
  const outputPaths = [
    resolve(repositoryRoot, "packages/desktop-electron/dist"),
    resolve(repositoryRoot, "packages/desktop-electron/out"),
    resolve(repositoryRoot, "packages/desktop-electron/.turbo"),
    resolve(repositoryRoot, ".turbo"),
  ]

  for (const outputPath of outputPaths) {
    await rm(outputPath, { force: true, recursive: true })
  }

  console.log(`Reset ${outputPaths.length} local release output directory/directories.`)
}

async function runMeasuredCommand(): Promise<void> {
  const name = readRequiredFlag("--name")
  const separatorIndex = process.argv.indexOf("--")
  if (separatorIndex < 0) {
    throw new Error("Measured command requires -- before the command")
  }

  const command = process.argv.slice(separatorIndex + 1)
  if (command.length === 0) {
    throw new Error("Measured command cannot be empty")
  }

  const cwd = readFlag("--cwd")
  const outputPath = readRequiredEnvironmentVariable(HARNESS_OUTPUT_ENV_KEY)
  const metrics = await readMetrics(outputPath)
  await appendCommandMetric(outputPath, metrics, {
    command,
    ...(cwd === undefined ? {} : { cwd: resolve(repositoryRoot, cwd) }),
    name,
  })
}

async function runAllMeasuredCommands(): Promise<void> {
  const outputPath = readRequiredEnvironmentVariable(HARNESS_OUTPUT_ENV_KEY)
  let metrics = await readMetrics(outputPath)
  for (const definition of commandDefinitions) {
    metrics = await appendCommandMetric(outputPath, metrics, definition)
  }
}

async function snapshotHarness(): Promise<void> {
  const outputPath = readRequiredEnvironmentVariable(HARNESS_OUTPUT_ENV_KEY)
  const metrics = await readMetrics(outputPath)
  const finishedAt = new Date()
  const startedAtTime = Date.parse(metrics.startedAt)
  const totalDurationMilliseconds = Number.isNaN(startedAtTime)
    ? undefined
    : Math.round(finishedAt.getTime() - startedAtTime)

  const nextMetrics: HarnessMetrics = {
    ...metrics,
    directories: await readDirectoryMetrics(metrics.cachePaths),
    finishedAt: finishedAt.toISOString(),
    outputFiles: await readOutputFiles(resolve(repositoryRoot, "packages/desktop-electron/dist")),
    totalDurationMilliseconds,
  }

  await writeMetrics(outputPath, nextMetrics)
  await appendStepSummary(nextMetrics)
  console.log(JSON.stringify(nextMetrics, null, 2))
}

async function compareHarnessRuns(): Promise<void> {
  const baselinePath = readRequiredFlag("--baseline")
  const candidatePath = readRequiredFlag("--candidate")
  const outputPath = readFlag("--output")
  const baseline = await readMetrics(resolve(repositoryRoot, baselinePath))
  const candidate = await readMetrics(resolve(repositoryRoot, candidatePath))
  const comparison = {
    baseline: summarizeRun(baseline),
    candidate: summarizeRun(candidate),
    commandDeltas: candidate.commands.map((candidateCommand) => {
      const baselineCommand = baseline.commands.find((command) => command.name === candidateCommand.name)
      return {
        baselineDurationMilliseconds: baselineCommand?.durationMilliseconds,
        candidateDurationMilliseconds: candidateCommand.durationMilliseconds,
        deltaMilliseconds:
          baselineCommand === undefined
            ? undefined
            : candidateCommand.durationMilliseconds - baselineCommand.durationMilliseconds,
        name: candidateCommand.name,
      }
    }),
  }

  const content = `${JSON.stringify(comparison, null, 2)}\n`
  if (outputPath) {
    await Bun.write(resolve(repositoryRoot, outputPath), content)
  }
  console.log(content)
}

async function appendCommandMetric(
  outputPath: string,
  metrics: HarnessMetrics,
  definition: CommandDefinition,
): Promise<HarnessMetrics> {
  const startedAt = new Date()
  const started = performance.now()
  const subprocess = Bun.spawn(definition.command, {
    cwd: definition.cwd ?? repositoryRoot,
    env: {
      ...process.env,
      [BUDDY_CHANNEL_ENV_KEY]: PRODUCTION_CHANNEL,
      [BUDDY_VERSION_ENV_KEY]: desktopPackage.version,
      [TARGET_ARCHITECTURE_ENV_KEY]: DEFAULT_ARCHITECTURE,
      [TARGET_PLATFORM_ENV_KEY]: DEFAULT_PLATFORM,
    },
    stderr: "inherit",
    stdin: "inherit",
    stdout: "inherit",
  })
  const exitCode = await subprocess.exited
  const finishedAt = new Date()
  const commandMetric: CommandMetric = {
    command: [...definition.command],
    durationMilliseconds: Math.round(performance.now() - started),
    exitCode,
    finishedAt: finishedAt.toISOString(),
    name: definition.name,
    startedAt: startedAt.toISOString(),
  }
  const nextMetrics: HarnessMetrics = {
    ...metrics,
    commands: [...metrics.commands, commandMetric],
  }
  await writeMetrics(outputPath, nextMetrics)

  if (exitCode !== 0) {
    throw new Error(`${definition.name} failed with exit code ${exitCode}`)
  }

  return nextMetrics
}

async function resolveCachePaths(profile: HarnessProfile): Promise<CachePaths> {
  const rootDirectory = resolve(
    repositoryRoot,
    process.env[HARNESS_CACHE_ROOT_ENV_KEY]?.trim() || HARNESS_CACHE_ROOT,
  )

  if (profile === CURRENT_PROFILE) {
    const dependencyHash = await hashReleaseDependencyInputs()
    const electronPackageHash = await hashFile(resolve(repositoryRoot, DESKTOP_PACKAGE_PATH))
    const electronRoot = resolve(
      rootDirectory,
      CURRENT_PROFILE,
      `electron-builder-${electronPackageHash}`,
    )
    return {
      bunInstallCacheDirectory: resolve(rootDirectory, CURRENT_PROFILE, `bun-${dependencyHash}`),
      electronBuilderCacheDirectory: resolve(electronRoot, "electron-builder"),
      electronCacheDirectory: resolve(electronRoot, "electron"),
      rootDirectory,
    }
  }

  const lockfile = await Bun.file(resolve(repositoryRoot, LOCKFILE_PATH)).text()
  const electronVersion = resolveLockedPackageVersion(lockfile, ELECTRON_PACKAGE_NAME)
  const electronBuilderVersion = resolveLockedPackageVersion(lockfile, ELECTRON_BUILDER_PACKAGE_NAME)
  const electronRoot = resolve(
    rootDirectory,
    OPTIMIZED_PROFILE,
    `electron-${electronVersion}-electron-builder-${electronBuilderVersion}-macos-arm64`,
  )
  return {
    bunInstallCacheDirectory: resolve(
      rootDirectory,
      OPTIMIZED_PROFILE,
      `release-bun-${CACHE_EPOCH}-${Bun.version}-macos-arm64`,
    ),
    electronBuilderCacheDirectory: resolve(electronRoot, "electron-builder"),
    electronCacheDirectory: resolve(electronRoot, "electron"),
    rootDirectory,
  }
}

async function hashReleaseDependencyInputs(): Promise<string> {
  const hash = createHash("sha256")
  hash.update(await readFile(resolve(repositoryRoot, LOCKFILE_PATH)))
  await hashDirectoryIfPresent(resolve(repositoryRoot, PATCHES_DIRECTORY), hash)
  return hash.digest("hex").slice(0, 16)
}

async function hashDirectoryIfPresent(directory: string, hash: ReturnType<typeof createHash>): Promise<void> {
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = resolve(directory, entry.name)
    hash.update(entryPath)
    if (entry.isDirectory()) {
      await hashDirectoryIfPresent(entryPath, hash)
      continue
    }

    if (entry.isFile()) {
      hash.update(await readFile(entryPath))
    }
  }
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex").slice(0, 16)
}

function resolveLockedPackageVersion(lockfileContent: string, packageName: string): string {
  const escapedPackageName = escapeRegExp(packageName)
  const pattern = new RegExp(
    `"${escapedPackageName}"\\s*:\\s*\\["${escapedPackageName}@([^"]+)"`,
    "u",
  )
  const match = lockfileContent.match(pattern)
  const version = match?.[1]
  if (!version) {
    throw new Error(`Could not resolve locked ${packageName} version from ${LOCKFILE_PATH}`)
  }

  return version
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
}

function resolveOutputPath(profile: HarnessProfile): string {
  const configured = readFlag("--output") || process.env[HARNESS_OUTPUT_ENV_KEY]?.trim()
  if (configured) {
    return resolve(repositoryRoot, configured)
  }

  const timestamp = new Date().toISOString().replaceAll(":", "-")
  return resolve(
    repositoryRoot,
    "docs/features/release/pipeline/measurements",
    `local-runner-macos-arm64-${profile}-${timestamp}.json`,
  )
}

async function readDirectoryMetrics(cachePaths: CachePaths): Promise<DirectoryMetric[]> {
  const directories = [
    { label: "bun install cache", path: cachePaths.bunInstallCacheDirectory },
    { label: "electron cache", path: cachePaths.electronCacheDirectory },
    { label: "electron builder cache", path: cachePaths.electronBuilderCacheDirectory },
    { label: "electron dist", path: resolve(repositoryRoot, "packages/desktop-electron/dist") },
  ]

  return await Promise.all(
    directories.map(async (directory) => {
      const bytes = await readDirectorySize(directory.path)
      return {
        bytes,
        label: directory.label,
        mebibytes: Math.round((bytes / BYTES_PER_MEBIBYTE) * 100) / 100,
        path: directory.path,
      }
    }),
  )
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

    if (entry.isFile()) {
      bytes += (await stat(entryPath)).size
    }
  }
  return bytes
}

async function readOutputFiles(directory: string): Promise<OutputFileMetric[]> {
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }

  const files: OutputFileMetric[] = []
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }

    const entryPath = resolve(directory, entry.name)
    files.push({
      bytes: (await stat(entryPath)).size,
      path: entryPath,
    })
  }

  return files.toSorted((left, right) => left.path.localeCompare(right.path))
}

async function writeMetrics(path: string, metrics: HarnessMetrics): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true })
  await Bun.write(path, `${JSON.stringify(metrics, null, 2)}\n`)
}

async function readMetrics(path: string): Promise<HarnessMetrics> {
  const parsed: unknown = JSON.parse(await Bun.file(path).text())
  if (!isRecord(parsed)) {
    throw new Error(`Invalid harness metrics file: ${path}`)
  }

  const schemaVersion = readNumber(parsed, "schemaVersion")
  const profile = parseProfile(readString(parsed, "profile"))
  const cachePaths = readCachePaths(readRecord(parsed, "cachePaths"))
  const commands = readCommandMetrics(readArray(parsed, "commands"))
  const directories = readDirectoryMetricArray(readArray(parsed, "directories"))
  const outputFiles = readOutputFileMetricArray(readArray(parsed, "outputFiles"))
  const totalDurationMilliseconds = readOptionalNumber(parsed, "totalDurationMilliseconds")
  const finishedAt = readOptionalString(parsed, "finishedAt")

  return {
    architecture: readString(parsed, "architecture"),
    bunVersion: readString(parsed, "bunVersion"),
    cachePaths,
    commands,
    directories,
    ...(finishedAt === undefined ? {} : { finishedAt }),
    hostArchitecture: readString(parsed, "hostArchitecture"),
    hostPlatform: readString(parsed, "hostPlatform"),
    outputFiles,
    profile,
    repositoryRoot: readString(parsed, "repositoryRoot"),
    schemaVersion,
    startedAt: readString(parsed, "startedAt"),
    targetPlatform: readString(parsed, "targetPlatform"),
    ...(totalDurationMilliseconds === undefined ? {} : { totalDurationMilliseconds }),
    version: readString(parsed, "version"),
  }
}

function readCachePaths(value: Record<string, unknown>): CachePaths {
  return {
    bunInstallCacheDirectory: readString(value, "bunInstallCacheDirectory"),
    electronBuilderCacheDirectory: readString(value, "electronBuilderCacheDirectory"),
    electronCacheDirectory: readString(value, "electronCacheDirectory"),
    rootDirectory: readString(value, "rootDirectory"),
  }
}

function readCommandMetrics(values: unknown[]): CommandMetric[] {
  return values.map((value) => {
    if (!isRecord(value)) {
      throw new Error("Invalid command metric")
    }

    return {
      command: readStringArray(readArray(value, "command")),
      durationMilliseconds: readNumber(value, "durationMilliseconds"),
      exitCode: readNumber(value, "exitCode"),
      finishedAt: readString(value, "finishedAt"),
      name: readString(value, "name"),
      startedAt: readString(value, "startedAt"),
    }
  })
}

function readDirectoryMetricArray(values: unknown[]): DirectoryMetric[] {
  return values.map((value) => {
    if (!isRecord(value)) {
      throw new Error("Invalid directory metric")
    }

    return {
      bytes: readNumber(value, "bytes"),
      label: readString(value, "label"),
      mebibytes: readNumber(value, "mebibytes"),
      path: readString(value, "path"),
    }
  })
}

function readOutputFileMetricArray(values: unknown[]): OutputFileMetric[] {
  return values.map((value) => {
    if (!isRecord(value)) {
      throw new Error("Invalid output file metric")
    }

    return {
      bytes: readNumber(value, "bytes"),
      path: readString(value, "path"),
    }
  })
}

function readStringArray(values: unknown[]): string[] {
  return values.map((value) => {
    if (typeof value !== "string") {
      throw new Error("Expected string array value")
    }

    return value
  })
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = Reflect.get(record, key)
  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be a string`)
  }

  return value
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = Reflect.get(record, key)
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be a string`)
  }

  return value
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = Reflect.get(record, key)
  if (typeof value !== "number") {
    throw new Error(`Expected ${key} to be a number`)
  }

  return value
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = Reflect.get(record, key)
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== "number") {
    throw new Error(`Expected ${key} to be a number`)
  }

  return value
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = Reflect.get(record, key)
  if (!isRecord(value)) {
    throw new Error(`Expected ${key} to be an object`)
  }

  return value
}

function readArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = Reflect.get(record, key)
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${key} to be an array`)
  }

  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseProfile(value: string | undefined): HarnessProfile {
  if (value === CURRENT_PROFILE || value === OPTIMIZED_PROFILE) {
    return value
  }

  throw new Error(`Profile must be ${CURRENT_PROFILE} or ${OPTIMIZED_PROFILE}`)
}

function readFlag(name: string): string | undefined {
  const args = process.argv.slice(3)
  const separatorIndex = args.indexOf("--")
  const harnessArgs = separatorIndex < 0 ? args : args.slice(0, separatorIndex)
  const index = harnessArgs.indexOf(name)
  if (index < 0) {
    return undefined
  }

  return harnessArgs[index + 1]
}

function readRequiredFlag(name: string): string {
  const value = readFlag(name)
  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

function readRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

async function appendGithubEnvironment(values: Record<string, string>): Promise<void> {
  const githubEnvironmentPath = process.env.GITHUB_ENV
  if (!githubEnvironmentPath) {
    return
  }

  const content = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
  await appendFile(githubEnvironmentPath, `${content}\n`)
}

async function appendStepSummary(metrics: HarnessMetrics): Promise<void> {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!summaryPath) {
    return
  }

  const rows = metrics.commands.map((command) =>
    [
      command.name,
      `${(command.durationMilliseconds / MILLISECONDS_PER_SECOND).toFixed(2)}s`,
      String(command.exitCode),
    ].join(" | "),
  )
  const summary = [
    `## Release local runner harness: ${metrics.profile}`,
    "",
    "| Unit | Duration | Exit code |",
    "| --- | ---: | ---: |",
    ...rows.map((row) => `| ${row} |`),
    "",
    `Total: ${(((metrics.totalDurationMilliseconds ?? 0) / MILLISECONDS_PER_SECOND)).toFixed(2)}s`,
    "",
  ].join("\n")

  await appendFile(summaryPath, summary)
}

function summarizeRun(metrics: HarnessMetrics) {
  return {
    commandTotalMilliseconds: metrics.commands.reduce(
      (total, command) => total + command.durationMilliseconds,
      0,
    ),
    profile: metrics.profile,
    totalDurationMilliseconds: metrics.totalDurationMilliseconds,
  }
}
