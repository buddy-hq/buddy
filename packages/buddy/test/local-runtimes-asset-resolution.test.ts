import { spawnSync } from "node:child_process"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, test } from "bun:test"
import z from "zod"
import { parseWithSchema, parseJsonText } from "./helpers/parse"

type RuntimeAssetProbe = {
  baseUrl: string
  bundleFilename: string
  checksumFilename: string
  installRoot: string
  executablePath: string
  targetTriple: string
  version: string
  operationInProgress: boolean
}

type StandardsAssetProbe = {
  archiveFilename: string
  baseUrl: string
  checksumFilename: string
  localAssetRoot: string
  manifestFilename: string
  operationInProgress: boolean
}

const runtimeAssetProbeSchema = z.object({
  baseUrl: z.string(),
  bundleFilename: z.string(),
  checksumFilename: z.string(),
  installRoot: z.string(),
  executablePath: z.string(),
  targetTriple: z.string(),
  version: z.string(),
  operationInProgress: z.boolean(),
})

const standardsAssetProbeSchema = z.object({
  archiveFilename: z.string(),
  baseUrl: z.string(),
  checksumFilename: z.string(),
  localAssetRoot: z.string(),
  manifestFilename: z.string(),
  operationInProgress: z.boolean(),
})

const advancedMathServicePath = path.resolve(
  import.meta.dir,
  "../src/local-runtimes/advanced-math/service.ts",
)
const standardsServicePath = path.resolve(
  import.meta.dir,
  "../src/local-runtimes/standards/service.ts",
)

function runRuntimeAssetProbe(input: {
  platform: "darwin"
  arch: "arm64" | "x64"
  version: string
  repo?: string
  baseUrl?: string
}): RuntimeAssetProbe {
  const script = `
    Object.defineProperty(process, "platform", { value: ${JSON.stringify(input.platform)} })
    Object.defineProperty(process, "arch", { value: ${JSON.stringify(input.arch)} })
    process.env.BUDDY_APP_VERSION = ${JSON.stringify(input.version)}
    process.env.BUDDY_ADVANCED_MATH_VERSION = ${JSON.stringify(input.version)}
    process.env.GITHUB_REPOSITORY = "example/private-source"
    ${
      input.repo
        ? `process.env.BUDDY_RELEASE_REPO = ${JSON.stringify(input.repo)}`
        : `delete process.env.BUDDY_RELEASE_REPO`
    }
    ${
      input.baseUrl
        ? `process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL = ${JSON.stringify(input.baseUrl)}`
        : `delete process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL`
    }

    const mod = await import(${JSON.stringify(pathToFileURL(advancedMathServicePath).href)})
    const info = mod.AdvancedMathRuntimeService.runtimeAssetInfo()
    process.stdout.write(JSON.stringify(info))
  `

  const result = spawnSync("bun", ["--eval", script], {
    cwd: path.resolve(import.meta.dir, ".."),
    env: {
      ...process.env,
    },
  })

  if (result.status !== 0) {
    throw new Error(
      `Failed to probe advanced math runtime assets: ${
        result.stderr?.toString("utf8") || result.stdout?.toString("utf8")
      }`,
    )
  }

  return parseWithSchema(
    runtimeAssetProbeSchema,
    parseJsonText(result.stdout.toString("utf8")),
    "runtime asset probe",
  )
}

function runStandardsAssetProbe(input: { repo?: string; version: string }): StandardsAssetProbe {
  const script = `
    process.env.BUDDY_APP_VERSION = ${JSON.stringify(input.version)}
    process.env.GITHUB_REPOSITORY = "example/private-source"
    ${
      input.repo
        ? `process.env.BUDDY_RELEASE_REPO = ${JSON.stringify(input.repo)}`
        : `delete process.env.BUDDY_RELEASE_REPO`
    }

    const mod = await import(${JSON.stringify(pathToFileURL(standardsServicePath).href)})
    const info = mod.StandardsRuntimeService.runtimeAssetInfo()
    process.stdout.write(JSON.stringify(info))
  `

  const result = spawnSync("bun", ["--eval", script], {
    cwd: path.resolve(import.meta.dir, ".."),
    env: {
      ...process.env,
    },
  })

  if (result.status !== 0) {
    throw new Error(
      `Failed to probe standards runtime assets: ${
        result.stderr?.toString("utf8") || result.stdout?.toString("utf8")
      }`,
    )
  }

  return parseWithSchema(
    standardsAssetProbeSchema,
    parseJsonText(result.stdout.toString("utf8")),
    "standards asset probe",
  )
}

describe("advanced math runtime asset resolution", () => {
  test("resolves GitHub release asset URLs and filenames for both mac targets", () => {
    const version = "1.2.3"
    const repository = "prashantbhudwal/buddy-releases"

    const cases = [
      {
        platform: "darwin" as const,
        arch: "arm64" as const,
        targetTriple: "aarch64-apple-darwin",
        bundleFilename: `buddy-advanced-math-v${version}-aarch64-apple-darwin.zip`,
      },
      {
        platform: "darwin" as const,
        arch: "x64" as const,
        targetTriple: "x86_64-apple-darwin",
        bundleFilename: `buddy-advanced-math-v${version}-x86_64-apple-darwin.zip`,
      },
    ]

    for (const testCase of cases) {
      const info = runRuntimeAssetProbe({
        platform: testCase.platform,
        arch: testCase.arch,
        version,
        repo: repository,
      })

      expect(info.targetTriple).toBe(testCase.targetTriple)
      expect(info.version).toBe(version)
      expect(info.baseUrl).toBe(`https://github.com/${repository}/releases/download/v${version}`)
      expect(info.bundleFilename).toBe(testCase.bundleFilename)
      expect(info.checksumFilename).toBe(`${testCase.bundleFilename}.sha256`)
      expect(info.executablePath).toContain(testCase.targetTriple)
      expect(info.installRoot).toContain(testCase.targetTriple)
    }
  })

  test("defaults to the public release repository", () => {
    const version = "1.2.3"

    const info = runRuntimeAssetProbe({
      platform: "darwin",
      arch: "arm64",
      version,
    })

    expect(info.baseUrl).toBe(
      `https://github.com/prashantbhudwal/buddy-releases/releases/download/v${version}`,
    )
  })

  test("honors a custom asset base url without changing filenames", () => {
    const version = "1.2.3"
    const baseUrl = "https://assets.example.invalid/advanced-math"

    const info = runRuntimeAssetProbe({
      platform: "darwin",
      arch: "arm64",
      version,
      baseUrl,
    })

    expect(info.baseUrl).toBe(baseUrl)
    expect(info.bundleFilename).toBe(`buddy-advanced-math-v${version}-aarch64-apple-darwin.zip`)
    expect(info.checksumFilename).toBe(
      `buddy-advanced-math-v${version}-aarch64-apple-darwin.zip.sha256`,
    )
  })
})

describe("standards runtime asset resolution", () => {
  test("defaults to the public release repository", () => {
    const version = "1.2.3"

    const info = runStandardsAssetProbe({ version })

    expect(info.baseUrl).toBe(
      `https://github.com/prashantbhudwal/buddy-releases/releases/download/v${version}`,
    )
  })

  test("honors a custom release repository", () => {
    const version = "1.2.3"
    const repository = "example/releases"

    const info = runStandardsAssetProbe({ repo: repository, version })

    expect(info.baseUrl).toBe(`https://github.com/${repository}/releases/download/v${version}`)
  })
})
