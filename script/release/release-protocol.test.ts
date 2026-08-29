import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  assertAssetDigestSet,
  parseGithubReleaseAssets,
  releaseAssetDigestNeedsSettlement,
  releaseAssetUploadDecision,
} from "./assets"
import { resolveReleaseBuildPlan } from "./build-plan"
import {
  assertCheckpointMatches,
  checkpointGithubAssetDigests,
  parseReleaseCheckpoint,
  RELEASE_CHECKPOINT_SCHEMA_VERSION,
  releaseCheckpointIsReusable,
  type ReleaseCheckpoint,
} from "./checkpoint"
import {
  assertMatchingReleasePlanIdentity,
  hashAdvancedMathInputs,
  parseReleasePlan,
  releasePlanDigest,
  releasePlanIdentity,
} from "./plan"
import {
  assertReleaseSourceIsOnMain,
  assertRequiredReleaseChecks,
  normalizeReleaseSourceSha,
} from "./preflight"
import { selectNewestPublishedReleaseWithAssets } from "./published-manifest"
import { advancedMathPlanCanBeReused } from "./reuse-advanced-math"

const SOURCE_SHA = "1".repeat(40)
const PLAN_DIGEST = "2".repeat(64)

describe("release protocol", () => {
  test("plans native architecture builds on matching native runners", async () => {
    const plan = await resolveReleaseBuildPlan({
      BUDDY_RELEASE_DRY_RUN: "1",
      BUDDY_RELEASE_RUNNER_MACOS_ARM64: "macos-26",
      BUDDY_RELEASE_RUNNER_MACOS_X64: "macos-26-intel",
      BUDDY_RELEASE_RUNNER_WINDOWS_X64: "windows-2025-vs2026",
      BUDDY_RELEASE_TARGET_MACOS_ARM64: "true",
      BUDDY_RELEASE_TARGET_MACOS_X64: "true",
      BUDDY_RELEASE_TARGET_WINDOWS_X64: "true",
    })

    expect(plan.electron).toEqual([
      {
        architecture: "arm64",
        checkpoint: "electron-macos-arm64",
        platform: "darwin",
        runner: "macos-26",
        target: "macos-arm64",
      },
      {
        architecture: "x64",
        checkpoint: "electron-macos-x64",
        platform: "darwin",
        runner: "macos-26-intel",
        target: "macos-x64",
      },
      {
        architecture: "x64",
        checkpoint: "electron-windows-x64",
        platform: "win32",
        runner: "windows-2025-vs2026",
        target: "windows-x64",
      },
    ])
    expect(plan.advancedMath).toEqual([
      {
        checkpoint: "advanced-math-macos-arm64",
        runner: "macos-26",
        target: "aarch64-apple-darwin",
      },
      {
        checkpoint: "advanced-math-macos-x64",
        runner: "macos-26-intel",
        target: "x86_64-apple-darwin",
      },
    ])
    expect(plan.buildStandards).toBe(true)
    expect(plan.frozen).toBe(false)
  })

  test("dry-run mirrors reusable advanced math targets without rebuilding them", async () => {
    const plan = await resolveReleaseBuildPlan({
      BUDDY_RELEASE_DRY_RUN: "1",
      BUDDY_RELEASE_REUSED_MATH_MACOS_ARM64: "true",
      BUDDY_RELEASE_REUSED_MATH_MACOS_X64: "true",
      BUDDY_RELEASE_RUNNER_MACOS_ARM64: "macos-26",
      BUDDY_RELEASE_RUNNER_MACOS_X64: "macos-26-intel",
      BUDDY_RELEASE_RUNNER_WINDOWS_X64: "windows-2025-vs2026",
      BUDDY_RELEASE_TARGET_MACOS_ARM64: "true",
      BUDDY_RELEASE_TARGET_MACOS_X64: "true",
      BUDDY_RELEASE_TARGET_WINDOWS_X64: "true",
    })

    expect(plan.advancedMath).toEqual([])
  })

  test("separates non-math planning from reusable math preparation", async () => {
    const environment = {
      BUDDY_RELEASE_DRY_RUN: "1",
      BUDDY_RELEASE_REUSED_MATH_MACOS_ARM64: "true",
      BUDDY_RELEASE_REUSED_MATH_MACOS_X64: "false",
      BUDDY_RELEASE_RUNNER_MACOS_ARM64: "macos-26",
      BUDDY_RELEASE_RUNNER_MACOS_X64: "macos-26-intel",
      BUDDY_RELEASE_RUNNER_WINDOWS_X64: "windows-2025-vs2026",
      BUDDY_RELEASE_TARGET_MACOS_ARM64: "true",
      BUDDY_RELEASE_TARGET_MACOS_X64: "true",
      BUDDY_RELEASE_TARGET_WINDOWS_X64: "true",
    }
    const nonMath = await resolveReleaseBuildPlan(environment, "non-math")
    const math = await resolveReleaseBuildPlan(environment, "advanced-math")

    expect(nonMath.electron).toHaveLength(3)
    expect(nonMath.advancedMath).toEqual([])
    expect(nonMath.buildStandards).toBe(true)
    expect(math.electron).toEqual([])
    expect(math.advancedMath.map((target) => target.target)).toEqual(["x86_64-apple-darwin"])
    expect(math.buildStandards).toBe(false)
  })

  test("keeps advanced math reuse stable across unrelated lockfile changes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "buddy-math-inputs-"))
    const buildScript = path.join(root, "packages/buddy/script/build-advanced-math-runtime.ts")
    const runtime = path.join(
      root,
      "packages/buddy/src/local-runtimes/advanced-math/runtime/main.py",
    )
    try {
      await Promise.all([
        mkdir(path.dirname(buildScript), { recursive: true }),
        mkdir(path.dirname(runtime), { recursive: true }),
      ])
      await Promise.all([
        Bun.write(buildScript, "build-v1"),
        Bun.write(runtime, "runtime-v1"),
        Bun.write(path.join(root, "bun.lock"), "lock-v1"),
      ])
      const initial = await hashAdvancedMathInputs(root)
      await Bun.write(path.join(root, "bun.lock"), "lock-v2")
      expect(await hashAdvancedMathInputs(root)).toBe(initial)
      await Bun.write(runtime, "runtime-v2")
      expect(await hashAdvancedMathInputs(root)).not.toBe(initial)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  test("fails closed unless both protected-main checks succeeded", () => {
    expect(() =>
      assertRequiredReleaseChecks([
        { conclusion: "success", name: "Check", status: "completed" },
        { conclusion: "failure", name: "vendor-guard", status: "completed" },
      ]),
    ).toThrow("vendor-guard=completed/failure")

    expect(() =>
      assertRequiredReleaseChecks([
        { conclusion: "success", name: "Check", status: "completed" },
        { conclusion: "success", name: "vendor-guard", status: "completed" },
      ]),
    ).not.toThrow()
    expect(() =>
      assertRequiredReleaseChecks([
        { conclusion: "success", name: "Check", status: "completed" },
        { conclusion: "failure", name: "Check", status: "completed" },
        { conclusion: "success", name: "vendor-guard", status: "completed" },
      ]),
    ).toThrow("Check=completed/success,completed/failure")
    expect(normalizeReleaseSourceSha(SOURCE_SHA.toUpperCase())).toBe(SOURCE_SHA)
    expect(() => normalizeReleaseSourceSha(SOURCE_SHA.slice(1))).toThrow("full 40-character")
  })

  test("keeps a green source retryable after main advances", () => {
    expect(() => assertReleaseSourceIsOnMain("identical")).not.toThrow()
    expect(() => assertReleaseSourceIsOnMain("ahead")).not.toThrow()
    expect(() => assertReleaseSourceIsOnMain("behind")).toThrow("not an ancestor")
    expect(() => assertReleaseSourceIsOnMain("diverged")).toThrow("not an ancestor")
  })

  test("rejects a retry that changes immutable release identity", () => {
    const plan = parseReleasePlan({
      advancedMathInputSha256: "3".repeat(64),
      advancedMathVersion: "runtime-42",
      createdBy: {
        repository: "buddy-hq/buddy",
        runAttempt: "1",
        runId: "123",
        workflow: "publish",
      },
      releaseDate: "2026-08-29T10:00:00+00:00",
      schemaVersion: 1,
      sourceRepository: "buddy-hq/buddy",
      sourceSha: SOURCE_SHA,
      tag: "v1.2.3",
      targets: { macosArm64: true, macosX64: true, windowsX64: true },
      toolchain: {
        bun: "1.3.13",
        python: "3.12",
        runners: {
          macosArm64: "macos-26",
          macosX64: "macos-26-intel",
          windowsX64: "windows-2025-vs2026",
        },
      },
      version: "1.2.3",
    })
    const identity = releasePlanIdentity(plan)
    const rescheduledPlan = parseReleasePlan({
      ...plan,
      toolchain: {
        ...plan.toolchain,
        runners: {
          macosArm64: "macos-next",
          macosX64: "macos-intel-next",
          windowsX64: "windows-next",
        },
      },
    })

    expect(releasePlanDigest(plan)).toMatch(/^[0-9a-f]{64}$/u)
    expect(() => assertMatchingReleasePlanIdentity(plan, identity)).not.toThrow()
    expect(() => assertMatchingReleasePlanIdentity(rescheduledPlan, identity)).not.toThrow()
    expect(releasePlanDigest(rescheduledPlan)).toBe(releasePlanDigest(plan))
    expect(() =>
      assertMatchingReleasePlanIdentity(plan, {
        ...identity,
        sourceSha: "4".repeat(40),
      }),
    ).toThrow("does not match this release request")
    expect(
      advancedMathPlanCanBeReused({
        currentInputSha256: plan.advancedMathInputSha256,
        currentPythonVersion: plan.toolchain.python,
        currentRuntimeVersion: plan.advancedMathVersion,
        previousPlan: plan,
      }),
    ).toBe(true)
    expect(
      advancedMathPlanCanBeReused({
        currentInputSha256: "9".repeat(64),
        currentPythonVersion: plan.toolchain.python,
        currentRuntimeVersion: plan.advancedMathVersion,
        previousPlan: plan,
      }),
    ).toBe(false)
  })

  test("rejects a checkpoint when live release bytes drift", () => {
    const asset = {
      name: "learning-commons-knowledge-graph.db.json",
      sha256: "5".repeat(64),
      size: 10,
    }
    const identity: Omit<ReleaseCheckpoint, "assets"> = {
      planDigest: PLAN_DIGEST,
      schemaVersion: RELEASE_CHECKPOINT_SCHEMA_VERSION,
      sourceSha: SOURCE_SHA,
      target: "standards",
      version: "1.2.3",
    }
    const checkpoint = parseReleaseCheckpoint({ assets: [asset], ...identity })

    expect(() =>
      assertCheckpointMatches({
        checkpoint,
        currentAssets: [asset],
        expectedAssetNames: [asset.name],
        identity,
      }),
    ).not.toThrow()
    expect(() =>
      assertCheckpointMatches({
        checkpoint,
        currentAssets: [{ ...asset, sha256: "6".repeat(64) }],
        expectedAssetNames: [asset.name],
        identity,
      }),
    ).toThrow("asset mismatch")
    expect(
      releaseCheckpointIsReusable({
        checkpointValue: checkpoint,
        currentAssets: [{ ...asset, sha256: "6".repeat(64) }],
        expectedAssetNames: [asset.name],
        identity,
      }),
    ).toBe(false)
  })

  test("compares release asset sets by name, size, and digest", () => {
    const expected = [{ name: "Buddy.zip", sha256: "7".repeat(64), size: 100 }]
    expect(() =>
      assertAssetDigestSet({ actual: expected, expected, label: "release" }),
    ).not.toThrow()
    expect(() =>
      assertAssetDigestSet({
        actual: [{ ...expected[0], size: 99 }],
        expected,
        label: "release",
      }),
    ).toThrow("asset mismatch")
  })

  test("allows matching no-ops but locks frozen and published release bytes", () => {
    const local = { name: "Buddy.zip", sha256: "8".repeat(64), size: 100 }
    const matchingAsset = {
      apiUrl: "https://api.github.com/repos/buddy/releases/assets/1",
      digest: `sha256:${local.sha256}`,
      name: local.name,
      size: local.size,
    }
    expect(
      releaseAssetUploadDecision(
        { assets: [matchingAsset], isDraft: false, isPrerelease: true },
        local,
      ),
    ).toBe("noop")
    expect(() =>
      releaseAssetUploadDecision({ assets: [], isDraft: false, isPrerelease: true }, local),
    ).toThrow("published")
    expect(() =>
      releaseAssetUploadDecision(
        {
          assets: [{ ...matchingAsset, name: "buddy-release-freeze.json" }],
          isDraft: true,
          isPrerelease: false,
        },
        local,
      ),
    ).toThrow("frozen")
  })

  test("does not wait for digest settlement before uploading a new asset name", () => {
    const release = { assets: [], isDraft: true, isPrerelease: false }
    expect(releaseAssetDigestNeedsSettlement(release, "new.zip")).toBe(false)
    expect(
      releaseAssetDigestNeedsSettlement(
        {
          ...release,
          assets: [
            {
              apiUrl: "https://api.github.com/repos/buddy/releases/assets/1",
              digest: null,
              name: "existing.zip",
              size: 100,
            },
          ],
        },
        "existing.zip",
      ),
    ).toBe(true)
  })

  test("accepts legacy release assets without GitHub digests for read-only reuse", () => {
    expect(
      parseGithubReleaseAssets({
        assets: [
          {
            apiUrl: "https://api.github.com/repos/buddy/releases/assets/1",
            digest: null,
            name: "legacy.zip",
            size: 100,
          },
        ],
      }),
    ).toHaveLength(1)
  })

  test("ignores unsettled sibling assets when inspecting a checkpoint", () => {
    const expectedName = "Buddy-1.2.3-arm64-mac.zip"
    const expectedDigest = "9".repeat(64)
    const assets = parseGithubReleaseAssets({
      assets: [
        {
          apiUrl: "https://api.github.com/repos/buddy/releases/assets/1",
          digest: `sha256:${expectedDigest}`,
          name: expectedName,
          size: 100,
        },
        {
          apiUrl: "https://api.github.com/repos/buddy/releases/assets/2",
          digest: null,
          name: "sibling-upload.zip",
          size: 200,
        },
      ],
    })

    expect(checkpointGithubAssetDigests(assets, [expectedName])).toEqual([
      { name: expectedName, sha256: expectedDigest, size: 100 },
    ])
    expect(() => checkpointGithubAssetDigests(assets, ["sibling-upload.zip"])).toThrow(
      "did not provide",
    )
  })

  test("selects the newest published release containing a complete signed feed", () => {
    const manifest = "latest-macos-arm64.json"
    const release = selectNewestPublishedReleaseWithAssets({
      currentTag: "v1.2.4",
      requiredAssetNames: [manifest, `${manifest}.sig`],
      value: [
        [
          {
            assets: [{ name: manifest }, { name: `${manifest}.sig` }],
            draft: false,
            published_at: "2026-08-28T10:00:00Z",
            tag_name: "v1.2.2",
          },
          {
            assets: [{ name: manifest }],
            draft: false,
            published_at: "2026-08-30T10:00:00Z",
            tag_name: "v1.2.5",
          },
          {
            assets: [{ name: manifest }, { name: `${manifest}.sig` }],
            draft: false,
            published_at: "2026-08-29T10:00:00Z",
            tag_name: "v1.2.3",
          },
        ],
      ],
    })

    expect(release?.tag).toBe("v1.2.3")
  })
})
