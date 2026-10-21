import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  assertAssetDigestSet,
  parseGithubReleaseAssets,
  parseUploadArgs,
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
  assertReleaseFreezeIdentity,
  releaseFreezeIdentity,
  parseReleaseFreeze,
  renderReleaseFreeze,
  type ReleaseFreeze,
} from "./freeze"
import { appendGithubOutputs } from "./github-output"
import {
  assertMatchingReleasePlanIdentity,
  hashAdvancedMathInputs,
  parseReleasePlan,
  releasePlanDigest,
  releasePlanIdentity,
  renderReleasePlan,
} from "./plan"
import {
  assertReleaseSourceIsOnBranch,
  assertRequiredReleaseChecks,
  normalizeReleaseSourceSha,
} from "./preflight"
import { selectNewestPublishedReleaseWithAssets } from "./published-manifest"
import { advancedMathPlanCanBeReused } from "./reuse-advanced-math"

import { assertReleaseRecordChannel, releaseChannelIdentity } from "./distribution-guard"
import { requiredAssetsForRelease } from "../verify-release-assets"

const fixture = (filename: string) => Bun.file(new URL(`./fixtures/${filename}`, import.meta.url))

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

  test("fails closed unless both required release checks succeeded", () => {
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
    expect(() => assertReleaseSourceIsOnBranch("identical", "main")).not.toThrow()
    expect(() => assertReleaseSourceIsOnBranch("ahead", "main")).not.toThrow()
    expect(() => assertReleaseSourceIsOnBranch("behind", "main")).toThrow(
      "not an ancestor of main: behind",
    )
    expect(() => assertReleaseSourceIsOnBranch("diverged", "main")).toThrow(
      "not an ancestor of main: diverged",
    )
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

  test("compares release freeze identity field by field", () => {
    const identity = releaseFreezeIdentity({
      BUDDY_RELEASE_PLAN_DIGEST: PLAN_DIGEST,
      BUDDY_RELEASE_SOURCE_REPOSITORY: "buddy-hq/buddy",
      BUDDY_RELEASE_SOURCE_SHA: SOURCE_SHA.toUpperCase(),
      BUDDY_RELEASE_TAG: "v1.2.3",
      BUDDY_VERSION: "1.2.3",
    })
    expect(identity.sourceSha).toBe(SOURCE_SHA)
    expect(() => assertReleaseFreezeIdentity(identity, identity)).not.toThrow()
    expect(() =>
      assertReleaseFreezeIdentity(
        { ...identity, planDigest: "3".repeat(64) } satisfies Omit<ReleaseFreeze, "assets">,
        identity,
      ),
    ).toThrow("identity does not match")
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
            name: "legacy.zip",
            size: 100,
          },
        ],
      }),
    ).toHaveLength(1)
  })

  test("rejects unknown release asset upload options", () => {
    expect(() =>
      parseUploadArgs(["--repo", "buddy/releases", "--rep", "v1.2.3", "Buddy.zip"]),
    ).toThrow("Unknown option: --rep")
  })

  test("appends step outputs without replacing earlier entries", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-github-output-"))
    const outputPath = path.join(directory, "output")
    try {
      const environment = { GITHUB_OUTPUT: outputPath }
      await appendGithubOutputs(environment, ["first=1"])
      await appendGithubOutputs(environment, ["second=2"])
      expect(await Bun.file(outputPath).text()).toBe("first=1\nsecond=2\n")
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
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

describe("release stream protocol identity", () => {
  test("preserves exact committed prod plan bytes and digest", async () => {
    const bytes = await fixture("prod-plan.json").text()
    const plan = parseReleasePlan(JSON.parse(bytes))
    expect(renderReleasePlan(plan)).toBe(bytes)
    expect(releasePlanDigest(plan)).toBe((await fixture("prod-plan.sha256").text()).trim())
    const beta = parseReleasePlan({ ...plan, channel: "beta", tag: "beta-v" + plan.version })
    expect(releasePlanDigest(beta)).not.toBe(releasePlanDigest(plan))
    expect(releasePlanIdentity(beta).channel).toBe("beta")
    expect(() => assertReleaseRecordChannel(beta, "prod")).toThrow("conflicts with prod")
    expect(() => assertReleaseRecordChannel(plan, "beta")).toThrow("conflicts with beta")
    expect(releaseChannelIdentity({})).toEqual({})
    expect(releaseChannelIdentity({ BUDDY_CHANNEL: "beta" })).toEqual({ channel: "beta" })
  })

  test("preserves exact prod freeze bytes and binds Beta freezes", async () => {
    const bytes = await fixture("prod-freeze.json").text()
    const freeze = parseReleaseFreeze(JSON.parse(bytes))
    expect(renderReleaseFreeze(freeze)).toBe(bytes)
    expect(createHash("sha256").update(renderReleaseFreeze(freeze)).digest("hex")).toBe(
      (await fixture("prod-freeze.sha256").text()).trim(),
    )
    const beta = parseReleaseFreeze({ ...freeze, channel: "beta", tag: "beta-v" + freeze.version })
    expect(() => assertReleaseFreezeIdentity(beta, freeze)).toThrow("identity does not match")
    expect(() => assertReleaseFreezeIdentity(beta, beta)).not.toThrow()
  })

  test("preserves the exact prod draft and published inventory", async () => {
    const inventories = z
      .array(
        z.object({
          draft: z.boolean(),
          targets: z.object({
            macosArm64: z.boolean(),
            macosX64: z.boolean(),
            windowsX64: z.boolean(),
          }),
          inventory: z.array(z.object({ label: z.string(), matcher: z.string() })),
        }),
      )
      .parse(await fixture("prod-inventory.json").json())
    for (const expected of inventories) {
      const actual = requiredAssetsForRelease({
        draft: expected.draft,
        targets: expected.targets,
        repo: "prashantbhudwal/buddy-releases",
        tag: "v1.2.3",
      })
      expect(
        actual.map((asset) => ({ label: asset.label, matcher: asset.matcher.toString() })),
      ).toEqual(expected.inventory)
    }
  })

  test("never reuses advanced math across streams", async () => {
    const plan = parseReleasePlan(await fixture("prod-plan.json").json())
    const input = {
      currentInputSha256: plan.advancedMathInputSha256,
      currentPythonVersion: plan.toolchain.python,
      currentRuntimeVersion: plan.advancedMathVersion,
    }
    expect(advancedMathPlanCanBeReused({ ...input, previousPlan: plan })).toBe(true)
    expect(advancedMathPlanCanBeReused({ ...input, previousPlan: plan, channel: "beta" })).toBe(
      false,
    )
    expect(
      advancedMathPlanCanBeReused({
        ...input,
        previousPlan: { ...plan, channel: "beta" },
        channel: "beta",
      }),
    ).toBe(true)
    expect(
      advancedMathPlanCanBeReused({ ...input, previousPlan: { ...plan, channel: "beta" } }),
    ).toBe(false)
  })
})

describe("release namespace boundaries", () => {
  test.each([
    { channel: undefined, tag: "beta-v1.2.3" },
    { channel: "beta", tag: "v1.2.3" },
    { channel: "beta", tag: "beta-v1.2.4" },
    { channel: undefined, tag: "v1.2.4" },
  ] as const)(
    "rejects a conflicting plan/freeze tuple $tag, channel=$channel",
    async ({ channel, tag }) => {
      const plan = await fixture("prod-plan.json").json()
      const freeze = await fixture("prod-freeze.json").json()
      expect(() => parseReleasePlan({ ...plan, version: "1.2.3", channel, tag })).toThrow()
      expect(() => parseReleaseFreeze({ ...freeze, version: "1.2.3", channel, tag })).toThrow()
    },
  )

  test.each(["prod", "beta"] as const)(
    "%s refuses the other stream before asset reads, uploads, downloads, or freeze verification",
    async (channel) => {
      const { downloadReleaseAsset, readGithubReleaseState, uploadReleaseAssetSafely } =
        await import("./assets")
      const { verifyReleaseFreeze } = await import("./freeze")
      const environment = { BUDDY_CHANNEL: channel }
      const tag = channel === "prod" ? "beta-v0.1.0" : "v0.1.0"
      const repository = "prashantbhudwal/buddy-releases"
      const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-namespace-test-"))
      try {
        const filePath = path.join(directory, "payload.zip")
        await Bun.write(filePath, "preserve these bytes")
        await expect(readGithubReleaseState(repository, tag, environment)).rejects.toThrow(
          "does not belong",
        )
        await expect(
          uploadReleaseAssetSafely({ environment, repository, tag, filePath }),
        ).rejects.toThrow("does not belong")
        await expect(
          downloadReleaseAsset({ environment, repository, tag, directory, name: "payload.zip" }),
        ).rejects.toThrow("does not belong")
        expect(await Bun.file(filePath).text()).toBe("preserve these bytes")
        await expect(
          verifyReleaseFreeze({ environment, repository, tag, directory }),
        ).rejects.toThrow("does not belong")
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

  test.each(["prod", "beta"] as const)(
    "%s refuses the other stream before checkpoint inspection and recording",
    async (channel) => {
      const { inspectReleaseCheckpoint, recordReleaseCheckpoint } = await import("./checkpoint")
      const environment = {
        BUDDY_CHANNEL: channel,
        BUDDY_RELEASE_REPO: "prashantbhudwal/buddy-releases",
        BUDDY_RELEASE_TAG: channel === "prod" ? "beta-v0.1.0" : "v0.1.0",
        BUDDY_VERSION: "0.1.0",
      }
      const input = { environment, target: "standards" as const }
      await expect(inspectReleaseCheckpoint(input)).rejects.toThrow("does not belong")
      await expect(recordReleaseCheckpoint(input)).rejects.toThrow("does not belong")
      await expect(
        resolveReleaseBuildPlan({
          ...environment,
          BUDDY_RELEASE_TARGET_MACOS_ARM64: "true",
          BUDDY_RELEASE_TARGET_MACOS_X64: "false",
          BUDDY_RELEASE_TARGET_WINDOWS_X64: "false",
        }),
      ).rejects.toThrow("does not belong")
    },
  )

  test.each(["prod", "beta"] as const)(
    "%s checkpoint identity rejects a different numeric tag before reading",
    async (channel) => {
      const { inspectReleaseCheckpoint, recordReleaseCheckpoint } = await import("./checkpoint")
      const input = {
        environment: {
          BUDDY_CHANNEL: channel,
          BUDDY_RELEASE_REPO: "prashantbhudwal/buddy-releases",
          BUDDY_RELEASE_TAG: channel === "prod" ? "v0.1.1" : "beta-v0.1.1",
          BUDDY_VERSION: "0.1.0",
        },
        target: "standards" as const,
      }
      await expect(inspectReleaseCheckpoint(input)).rejects.toThrow("does not match")
      await expect(recordReleaseCheckpoint(input)).rejects.toThrow("does not match")
    },
  )
})

test.each(["prod", "beta"] as const)(
  "%s advanced math reuse filters every page before reading any asset",
  async (channel) => {
    const { chmod } = await import("node:fs/promises")
    const { spawnSync } = await import("node:child_process")
    const root = path.resolve(import.meta.dir, "../..")
    const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-math-pages-"))
    try {
      const bin = path.join(directory, "bin")
      await mkdir(bin)
      const gh = path.join(bin, "gh")
      await Bun.write(
        gh,
        `#!${process.execPath}
const args = process.argv.slice(2)
const prefix = process.env.BUDDY_CHANNEL === "beta" ? "beta-v" : "v"
const other = prefix === "v" ? "beta-v" : "v"
if (args[0] === "api" && args.includes("--paginate") && args.includes("--slurp")) {
  const release = (tag_name, draft = false, prerelease = true) => ({ tag_name, draft, prerelease, published_at: "2026-01-01T00:00:00Z" })
  console.log(JSON.stringify([
    [...Array.from({ length: 100 }, () => release(other + "99.0.0")), release("skill-artifacts"), release(prefix + "1.0.0-rc.1"), release(prefix + "98.0.0", true), release("beta-v97.0.0", false, false)],
    [release(prefix + "0.1.0"), release(prefix + "0.1.1")],
  ]))
} else if (args[1] === "view" && [prefix + "0.1.0", prefix + "0.1.1"].includes(args[2])) {
  console.log(JSON.stringify({ assets: [], isDraft: false, isPrerelease: true }))
} else throw new Error("Read assets outside selected stream: " + args.join(" "))
`,
      )
      await chmod(gh, 0o755)
      const result = spawnSync(
        process.execPath,
        [path.join(root, "script/release/reuse-advanced-math.ts")],
        {
          cwd: root,
          env: {
            ...process.env,
            PATH: `${bin}${path.delimiter}${process.env.PATH}`,
            BUDDY_CHANNEL: channel,
            GH_REPO: "",
            BUDDY_RELEASE_REPO: "prashantbhudwal/buddy-releases",
            BUDDY_RELEASE_TAG: channel === "prod" ? "v0.1.2" : "beta-v0.1.2",
            BUDDY_VERSION: "0.1.2",
            BUDDY_RELEASE_TARGET_MACOS_ARM64: "true",
            BUDDY_RELEASE_TARGET_MACOS_X64: "false",
            BUDDY_RELEASE_DRY_RUN: "1",
            RUNNER_TEMP: directory,
            GITHUB_OUTPUT: "",
          },
          encoding: "utf8",
        },
      )
      expect(result.stderr).toBe("")
      expect(result.status).toBe(0)
      expect(result.stdout).toContain("No compatible frozen published release")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)

test.each([
  { args: ["script/release/plan.ts"] },
  { args: ["script/release/freeze.ts", "record"] },
  { args: ["script/release/freeze.ts", "inspect"] },
  {
    args: [
      "script/release/assets.ts",
      "upload",
      "--repo",
      "prashantbhudwal/buddy-releases",
      "--tag",
      "beta-v0.1.0",
      "missing.zip",
    ],
  },
  { args: ["script/release-source-metadata.ts"] },
  {
    args: [
      "script/release-local-gate.ts",
      "--version",
      "0.1.0",
      "--commit",
      SOURCE_SHA,
      "--selected-targets",
      "macos-arm64",
    ],
  },
])("$args refuses a wrong-stream tag before release I/O", async ({ args }) => {
  const { chmod } = await import("node:fs/promises")
  const { spawnSync } = await import("node:child_process")
  const root = path.resolve(import.meta.dir, "../..")
  const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-cli-namespace-"))
  try {
    const bin = path.join(directory, "bin")
    await mkdir(bin)
    const gh = path.join(bin, "gh")
    await Bun.write(gh, `#!${process.execPath}\nthrow new Error("Unexpected GitHub operation");\n`)
    await chmod(gh, 0o755)
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        BUDDY_CHANNEL: "prod",
        BUDDY_RELEASE_REPO: "prashantbhudwal/buddy-releases",
        GH_REPO: "",
        BUDDY_RELEASE_TAG: "beta-v0.1.0",
        BUDDY_VERSION: "0.1.0",
        BUDDY_RELEASE_DRY_RUN: "",
        BUDDY_RELEASE_SOURCE_DRY_RUN: "",
        BUDDY_RELEASE_SOURCE_MODE: "record",
        BUDDY_RELEASE_SOURCE_SHA: SOURCE_SHA,
        BUDDY_RELEASE_SOURCE_REPOSITORY: "buddy-hq/buddy",
        RUNNER_TEMP: directory,
      },
      encoding: "utf8",
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/does not belong|does not match/u)
    expect(result.stderr).not.toContain("Unexpected GitHub operation")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
