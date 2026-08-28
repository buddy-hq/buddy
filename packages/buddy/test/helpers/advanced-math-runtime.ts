import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { AdvancedMathRuntimeService } from "../../src/local-runtimes/advanced-math/service"
import { temporaryDirectory } from "./temporary-directory"

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9p3xK+QAAAAASUVORK5CYII="
type MockRuntimeBundleOptions = {
  marker?: string
  selfCheckDelayMs?: number
}

function buildFakeRuntimeExecutable(options: MockRuntimeBundleOptions = {}) {
  const marker = options.marker ?? "default"
  const selfCheckDelayMs = Math.max(0, options.selfCheckDelayMs ?? 0)
  return `#!/usr/bin/env bun
import fs from "node:fs"
import path from "node:path"

const TINY_PNG_BASE64 = "${TINY_PNG_BASE64}"
const MARKER = ${JSON.stringify(marker)}
const SELF_CHECK_DELAY_MS = ${JSON.stringify(selfCheckDelayMs)}
const command = process.argv[2] ?? ""

if (command === "self-check") {
  if (SELF_CHECK_DELAY_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, SELF_CHECK_DELAY_MS))
  }
  process.exit(0)
}

if (command !== "execute") {
  process.stderr.write(\`Unknown command: \${command}\\n\`)
  process.exit(1)
}

const request = JSON.parse(fs.readFileSync(0, "utf8"))
const code = String(request.code ?? "")
const artifacts = []

if (code.includes("__sleep__")) {
  await new Promise((resolve) => setTimeout(resolve, 500))
}

if (code.includes("raise")) {
  process.stdout.write(JSON.stringify({
    ok: false,
    stdout: "",
    stderr: "Traceback (most recent call last):\\nRuntimeError: boom\\n",
    artifacts,
    error: "boom",
  }))
  process.exit(0)
}

if (code.includes("make_plot")) {
  const figurePath = path.join(request.artifactDirectory, "figure.png")
  fs.writeFileSync(figurePath, Buffer.from(TINY_PNG_BASE64, "base64"))
  artifacts.push(figurePath)
}

const stdout = code.includes("print") ? "hello\\n" : ""
const stderr = code.includes("stderr") ? "runtime warning\\n" : ""
const lastExpressionOutput = code.includes("null_last_expression")
  ? null
  : code.includes("none_last_expression")
    ? "None"
    : code.includes("__runtime_marker__")
      ? MARKER
    : code.includes("2 + 2") || code.includes("2+2")
      ? "4"
      : code.includes("sympy")
        ? "sqrt(2)"
        : undefined

const payload = {
  ok: true,
  stdout,
  stderr,
  artifacts,
}

if (lastExpressionOutput !== undefined) {
  payload.lastExpressionOutput = lastExpressionOutput
}

process.stdout.write(JSON.stringify(payload))
`
}

function sha256Bytes(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

function assertArchiveCreated(result: ReturnType<typeof spawnSync>) {
  if (result.status === 0) return

  const failureDetails =
    result.error?.message ||
    result.stderr?.toString("utf8") ||
    result.stdout?.toString("utf8") ||
    "unknown archive command failure"
  throw new Error(`Failed to create mock advanced math runtime archive: ${failureDetails}`)
}

function createArchive(sourceDir: string, outputArchive: string) {
  if (process.platform === "win32") {
    const result = spawnSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -LiteralPath '${sourceDir.replace(/'/g, "''")}' -DestinationPath '${outputArchive.replace(/'/g, "''")}' -Force`,
    ])
    assertArchiveCreated(result)
    return
  }

  if (process.platform === "darwin") {
    const result = spawnSync("ditto", [
      "-c",
      "-k",
      "--sequesterRsrc",
      "--keepParent",
      sourceDir,
      outputArchive,
    ])
    assertArchiveCreated(result)
    return
  }

  const result = spawnSync("zip", ["-r", outputArchive, path.basename(sourceDir)], {
    cwd: path.dirname(sourceDir),
  })
  assertArchiveCreated(result)
}

async function buildMockRuntimeBundle(options: MockRuntimeBundleOptions = {}) {
  await using tempDir = await temporaryDirectory({ prefix: "buddy-advanced-math-test-" })
  const bundleDir = path.join(tempDir.path, "buddy-advanced-math")
  const executableName =
    process.platform === "win32" ? "buddy-advanced-math.exe" : "buddy-advanced-math"
  const executablePath = path.join(bundleDir, executableName)
  const archivePath = path.join(tempDir.path, "buddy-advanced-math.zip")

  await fs.mkdir(bundleDir, { recursive: true })
  await fs.writeFile(executablePath, buildFakeRuntimeExecutable(options), "utf8")
  await fs.chmod(executablePath, 0o755).catch(() => undefined)
  createArchive(bundleDir, archivePath)
  const archiveBytes = await fs.readFile(archivePath)

  return archiveBytes
}

export async function withMockAdvancedMathRuntimeAssets<T>(run: () => Promise<T>) {
  const previousFetch = globalThis.fetch
  const previousVersion = process.env.BUDDY_ADVANCED_MATH_VERSION
  const previousBaseUrl = process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL
  const version = `test-${randomUUID()}`
  const baseUrl = "https://advanced-math.invalid/releases"
  const archiveBytes = await buildMockRuntimeBundle()
  const checksum = sha256Bytes(archiveBytes)

  try {
    process.env.BUDDY_ADVANCED_MATH_VERSION = version
    process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL = baseUrl

    await AdvancedMathRuntimeService.remove().catch(() => undefined)

    const assetInfo = AdvancedMathRuntimeService.runtimeAssetInfo()
    const mockFetch: typeof fetch = Object.assign(
      async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === `${baseUrl}/${assetInfo.bundleFilename}`) {
          return new Response(Uint8Array.from(archiveBytes), { status: 200 })
        }
        if (url === `${baseUrl}/${assetInfo.checksumFilename}`) {
          return new Response(`${checksum}  ${assetInfo.bundleFilename}\n`, { status: 200 })
        }
        return new Response("not found", { status: 404 })
      },
      { preconnect: previousFetch.preconnect },
    )
    globalThis.fetch = mockFetch

    return await run()
  } finally {
    await AdvancedMathRuntimeService.remove().catch(() => undefined)
    globalThis.fetch = previousFetch

    if (previousVersion === undefined) delete process.env.BUDDY_ADVANCED_MATH_VERSION
    else process.env.BUDDY_ADVANCED_MATH_VERSION = previousVersion

    if (previousBaseUrl === undefined) delete process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL
    else process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL = previousBaseUrl
  }
}

export async function withInstalledMockAdvancedMathRuntime<T>(run: () => Promise<T>) {
  return withMockAdvancedMathRuntimeAssets(async () => {
    const status = await AdvancedMathRuntimeService.install()
    if (!status.ready) {
      throw new Error(status.lastError ?? "Failed to install mock advanced math runtime")
    }

    return run()
  })
}

export async function withLocalMockAdvancedMathRuntimeAssets<T>(
  run: (helpers: {
    replaceAssets: (options?: MockRuntimeBundleOptions) => Promise<void>
  }) => Promise<T>,
) {
  const previousVersion = process.env.BUDDY_ADVANCED_MATH_VERSION
  const previousBaseUrl = process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL
  const previousLocalAssetDir = process.env.BUDDY_ADVANCED_MATH_LOCAL_ASSET_DIR
  const version = `test-${randomUUID()}`
  await using localAssetDirectory = await temporaryDirectory({
    prefix: "buddy-advanced-math-local-assets-",
  })
  const localAssetRoot = localAssetDirectory.path
  try {
    process.env.BUDDY_ADVANCED_MATH_VERSION = version
    delete process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL
    process.env.BUDDY_ADVANCED_MATH_LOCAL_ASSET_DIR = localAssetRoot

    await AdvancedMathRuntimeService.remove().catch(() => undefined)

    const assetInfo = AdvancedMathRuntimeService.runtimeAssetInfo()
    const targetDir = path.join(localAssetRoot, assetInfo.targetTriple)
    const bundlePath = path.join(targetDir, assetInfo.bundleFilename)
    const checksumPath = path.join(targetDir, assetInfo.checksumFilename)
    const replaceAssets = async (options: MockRuntimeBundleOptions = {}) => {
      const archiveBytes = await buildMockRuntimeBundle(options)
      const checksum = sha256Bytes(archiveBytes)

      await fs.mkdir(targetDir, { recursive: true })
      await fs.writeFile(bundlePath, archiveBytes)
      await fs.writeFile(checksumPath, `${checksum}  ${assetInfo.bundleFilename}\n`, "utf8")
    }

    await replaceAssets()

    return await run({ replaceAssets })
  } finally {
    await AdvancedMathRuntimeService.remove().catch(() => undefined)

    if (previousVersion === undefined) delete process.env.BUDDY_ADVANCED_MATH_VERSION
    else process.env.BUDDY_ADVANCED_MATH_VERSION = previousVersion

    if (previousBaseUrl === undefined) delete process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL
    else process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL = previousBaseUrl

    if (previousLocalAssetDir === undefined) delete process.env.BUDDY_ADVANCED_MATH_LOCAL_ASSET_DIR
    else process.env.BUDDY_ADVANCED_MATH_LOCAL_ASSET_DIR = previousLocalAssetDir
  }
}
