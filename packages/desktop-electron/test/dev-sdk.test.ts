import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  ensureGeneratedSdk,
  generatedSdkFreshnessInput,
  generatedSdkNeedsRefresh,
  generatedSdkSourcePaths,
} from "../scripts/dev-sdk"

const TEST_DIRECTORY_PREFIX = "buddy-dev-sdk-test-"
const testDirectories: string[] = []

afterEach(() => {
  for (const directory of testDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function createTestDirectory(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), TEST_DIRECTORY_PREFIX))
  testDirectories.push(directory)
  return directory
}

describe("desktop development SDK preparation", () => {
  test("tracks Buddy and vendored OpenCode schema sources", () => {
    const repositoryRoot = path.resolve("repository")
    const sdkDir = path.join(repositoryRoot, "packages/sdk")
    const backendSourcePaths = [
      path.join(repositoryRoot, "packages/buddy/src"),
      path.join(repositoryRoot, "packages/opencode-adapter/src"),
      path.join(repositoryRoot, "vendor/opencode/packages/protocol/src"),
    ]

    expect(generatedSdkSourcePaths({ repositoryRoot, backendSourcePaths, sdkDir })).toEqual([
      ...backendSourcePaths,
      path.join(sdkDir, "scripts/generate.ts"),
      path.join(sdkDir, "package.json"),
      path.join(repositoryRoot, "bun.lock"),
    ])
  })

  test("shares the generated output and marker contract across dev entrypoints", () => {
    const repositoryRoot = path.resolve("repository")
    const sdkDir = path.join(repositoryRoot, "packages/sdk")
    const backendSourcePaths = [
      path.join(repositoryRoot, "packages/buddy/src"),
      path.join(repositoryRoot, "packages/opencode-adapter/src"),
    ]
    const sourceInput = { repositoryRoot, backendSourcePaths, sdkDir }

    expect(generatedSdkFreshnessInput(sourceInput)).toEqual({
      generatedOutputs: [
        path.join(sdkDir, "src/gen/sdk.gen.ts"),
        path.join(sdkDir, "src/gen/types.gen.ts"),
        path.join(sdkDir, "src/gen/client/index.ts"),
      ],
      successMarker: path.join(sdkDir, "src/gen/.generation-complete"),
      sourcePaths: generatedSdkSourcePaths(sourceInput),
    })
  })

  test("generates when the SDK entry is missing", () => {
    const root = createTestDirectory()
    const source = path.join(root, "source.ts")
    writeFileSync(source, "export const source = true\n")

    expect(
      generatedSdkNeedsRefresh({
        generatedOutputs: [path.join(root, "sdk.gen.ts")],
        successMarker: path.join(root, ".generation-complete"),
        sourcePaths: [source],
      }),
    ).toBe(true)
  })

  test("regenerates when generation did not complete or an output is missing", () => {
    const root = createTestDirectory()
    const source = path.join(root, "source.ts")
    const generatedEntry = path.join(root, "sdk.gen.ts")
    const generatedTypes = path.join(root, "types.gen.ts")
    const successMarker = path.join(root, ".generation-complete")

    writeFileSync(source, "export const source = true\n")
    writeFileSync(generatedEntry, "export const sdk = true\n")

    expect(
      generatedSdkNeedsRefresh({
        generatedOutputs: [generatedEntry, generatedTypes],
        successMarker,
        sourcePaths: [source],
      }),
    ).toBe(true)

    writeFileSync(successMarker, "")

    expect(
      generatedSdkNeedsRefresh({
        generatedOutputs: [generatedEntry, generatedTypes],
        successMarker,
        sourcePaths: [source],
      }),
    ).toBe(true)
  })

  test("regenerates only after a source input changes", () => {
    const root = createTestDirectory()
    const sourceDirectory = path.join(root, "src")
    const source = path.join(sourceDirectory, "route.ts")
    const generatedEntry = path.join(root, "sdk.gen.ts")
    const successMarker = path.join(root, ".generation-complete")
    const oldTime = new Date("2026-01-01T00:00:00.000Z")
    const generatedTime = new Date("2026-01-02T00:00:00.000Z")
    const changedTime = new Date("2026-01-03T00:00:00.000Z")

    mkdirSync(sourceDirectory, { recursive: true })
    writeFileSync(source, "export const route = true\n")
    writeFileSync(generatedEntry, "export const sdk = true\n")
    writeFileSync(successMarker, "")
    utimesSync(sourceDirectory, oldTime, oldTime)
    utimesSync(source, oldTime, oldTime)
    utimesSync(generatedEntry, generatedTime, generatedTime)
    utimesSync(successMarker, generatedTime, generatedTime)

    expect(
      generatedSdkNeedsRefresh({
        generatedOutputs: [generatedEntry],
        successMarker,
        sourcePaths: [sourceDirectory],
      }),
    ).toBe(false)

    utimesSync(source, changedTime, changedTime)

    expect(
      generatedSdkNeedsRefresh({
        generatedOutputs: [generatedEntry],
        successMarker,
        sourcePaths: [sourceDirectory],
      }),
    ).toBe(true)
  })

  test("marks a successful on-demand SDK refresh and skips duplicate generation", async () => {
    const root = createTestDirectory()
    const source = path.join(root, "source.ts")
    const generatedEntry = path.join(root, "sdk.gen.ts")
    const successMarker = path.join(root, ".generation-complete")
    const freshness = {
      generatedOutputs: [generatedEntry],
      successMarker,
      sourcePaths: [source],
    }
    let generationCount = 0

    writeFileSync(source, "export const source = true\n")
    const generated = await ensureGeneratedSdk(freshness, async () => {
      generationCount += 1
      writeFileSync(generatedEntry, "export const sdk = true\n")
    })
    const generatedAgain = await ensureGeneratedSdk(freshness, async () => {
      generationCount += 1
    })

    expect(generated).toBe(true)
    expect(generatedAgain).toBe(false)
    expect(generationCount).toBe(1)
    expect(existsSync(successMarker)).toBe(true)
  })
})
