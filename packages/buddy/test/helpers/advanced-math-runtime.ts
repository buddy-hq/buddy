import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { spawnSync } from "node:child_process"
import { AdvancedMathRuntimeService } from "../../src/local-runtimes/advanced-math/service"

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9p3xK+QAAAAASUVORK5CYII="
const BACKEND_ROOT = path.resolve(import.meta.dir, "../..")

function buildFakeRuntimeExecutable(marker = "default") {
  return `#!/usr/bin/env bun
import fs from "node:fs"
import path from "node:path"

const TINY_PNG_BASE64 = "${TINY_PNG_BASE64}"
const MARKER = ${JSON.stringify(marker)}
const command = process.argv[2] ?? ""

if (command === "self-check") {
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

function createArchive(sourceDir: string, outputArchive: string) {
  if (process.platform === "win32") {
    const result = spawnSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -LiteralPath '${sourceDir.replace(/'/g, "''")}' -DestinationPath '${outputArchive.replace(/'/g, "''")}' -Force`,
    ])
    if (result.status !== 0) {
      throw new Error(`Failed to create mock advanced math runtime archive: ${result.stderr?.toString("utf8") || result.stdout?.toString("utf8")}`)
    }
    return
  }

  const result = spawnSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", sourceDir, outputArchive])
  if (result.status !== 0) {
    throw new Error(`Failed to create mock advanced math runtime archive: ${result.stderr?.toString("utf8") || result.stdout?.toString("utf8")}`)
  }
}

async function buildMockRuntimeBundle(marker = "default") {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-advanced-math-test-"))
  const bundleDir = path.join(tempDir, "buddy-advanced-math")
  const executableName = process.platform === "win32" ? "buddy-advanced-math.exe" : "buddy-advanced-math"
  const executablePath = path.join(bundleDir, executableName)
  const archivePath = path.join(tempDir, "buddy-advanced-math.zip")

  await fs.mkdir(bundleDir, { recursive: true })
  await fs.writeFile(executablePath, buildFakeRuntimeExecutable(marker), "utf8")
  await fs.chmod(executablePath, 0o755).catch(() => undefined)
  createArchive(bundleDir, archivePath)
  const archiveBytes = await fs.readFile(archivePath)

  await fs.rm(tempDir, { recursive: true, force: true })
  return archiveBytes
}

export async function withMockAdvancedMathRuntimeAssets<T>(run: () => Promise<T>) {
  const previousFetch = globalThis.fetch
  const previousVersion = process.env.BUDDY_APP_VERSION
  const previousBaseUrl = process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL
  const version = `test-${randomUUID()}`
  const baseUrl = "https://advanced-math.invalid/releases"
  const archiveBytes = await buildMockRuntimeBundle()
  const checksum = sha256Bytes(archiveBytes)

  process.env.BUDDY_APP_VERSION = version
  process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL = baseUrl

  await AdvancedMathRuntimeService.remove().catch(() => undefined)

  const assetInfo = AdvancedMathRuntimeService.runtimeAssetInfo()
  globalThis.fetch = (async (input) => {
    const url = String(input)
    if (url === `${baseUrl}/${assetInfo.bundleFilename}`) {
      return new Response(archiveBytes, { status: 200 })
    }
    if (url === `${baseUrl}/${assetInfo.checksumFilename}`) {
      return new Response(`${checksum}  ${assetInfo.bundleFilename}\n`, { status: 200 })
    }
    return new Response("not found", { status: 404 })
  }) as typeof fetch

  try {
    return await run()
  } finally {
    await AdvancedMathRuntimeService.remove().catch(() => undefined)
    globalThis.fetch = previousFetch

    if (previousVersion === undefined) delete process.env.BUDDY_APP_VERSION
    else process.env.BUDDY_APP_VERSION = previousVersion

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
  run: (helpers: { replaceAssets: (marker?: string) => Promise<void> }) => Promise<T>,
) {
  const previousVersion = process.env.BUDDY_APP_VERSION
  const previousBaseUrl = process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL
  const previousLocalAssetDir = process.env.BUDDY_ADVANCED_MATH_LOCAL_ASSET_DIR
  const version = `test-${randomUUID()}`
  const localAssetRoot = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-advanced-math-local-assets-"))

  process.env.BUDDY_APP_VERSION = version
  delete process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL
  process.env.BUDDY_ADVANCED_MATH_LOCAL_ASSET_DIR = localAssetRoot

  await AdvancedMathRuntimeService.remove().catch(() => undefined)

  const assetInfo = AdvancedMathRuntimeService.runtimeAssetInfo()
  const targetDir = path.join(localAssetRoot, assetInfo.targetTriple)
  const bundlePath = path.join(targetDir, assetInfo.bundleFilename)
  const checksumPath = path.join(targetDir, assetInfo.checksumFilename)
  const replaceAssets = async (marker = "default") => {
    const archiveBytes = await buildMockRuntimeBundle(marker)
    const checksum = sha256Bytes(archiveBytes)

    await fs.mkdir(targetDir, { recursive: true })
    await fs.writeFile(bundlePath, archiveBytes)
    await fs.writeFile(checksumPath, `${checksum}  ${assetInfo.bundleFilename}\n`, "utf8")
  }

  await replaceAssets()

  try {
    return await run({ replaceAssets })
  } finally {
    await AdvancedMathRuntimeService.remove().catch(() => undefined)
    await fs.rm(localAssetRoot, { recursive: true, force: true }).catch(() => undefined)

    if (previousVersion === undefined) delete process.env.BUDDY_APP_VERSION
    else process.env.BUDDY_APP_VERSION = previousVersion

    if (previousBaseUrl === undefined) delete process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL
    else process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL = previousBaseUrl

    if (previousLocalAssetDir === undefined) delete process.env.BUDDY_ADVANCED_MATH_LOCAL_ASSET_DIR
    else process.env.BUDDY_ADVANCED_MATH_LOCAL_ASSET_DIR = previousLocalAssetDir
  }
}
