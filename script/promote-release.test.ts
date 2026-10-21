import { describe, expect, test } from "bun:test"
import {
  assertPrereleasePromotionMovesForward,
  assertPromotionDestination,
  promoteRelease,
  assertPromotableRelease,
  latestReleaseTagFromCommandResult,
  normalizePromotionTag,
  parseGithubReleasePromotionState,
  selectHighestStableReleaseTag,
} from "./promote-release"

describe("promote release", () => {
  test("accepts only stable semver release tags", () => {
    expect(normalizePromotionTag("v1.2.3")).toBe("v1.2.3")
    expect(() => normalizePromotionTag("1.2.3")).toThrow("Malformed release tag")
    expect(() => normalizePromotionTag("v1.2.3-preview.1")).toThrow("Malformed release tag")
    expect(() => normalizePromotionTag(undefined)).toThrow("Malformed release tag")
  })

  test("parses GitHub release promotion state", () => {
    expect(
      parseGithubReleasePromotionState({
        isDraft: false,
        isPrerelease: true,
        tagName: "v1.2.3",
      }),
    ).toEqual({
      isDraft: false,
      isPrerelease: true,
      tagName: "v1.2.3",
    })

    expect(() => parseGithubReleasePromotionState({ tagName: "v1.2.3" })).toThrow(
      "missing promotion fields",
    )
  })

  test("refuses drafts and mismatched tags", () => {
    expect(() =>
      assertPromotableRelease(
        {
          isDraft: true,
          isPrerelease: true,
          tagName: "v1.2.3",
        },
        "v1.2.3",
      ),
    ).toThrow("still a draft")

    expect(() =>
      assertPromotableRelease(
        {
          isDraft: false,
          isPrerelease: true,
          tagName: "v1.2.4",
        },
        "v1.2.3",
      ),
    ).toThrow("Release tag mismatch")
  })

  test("accepts published prerelease candidates", () => {
    expect(() =>
      assertPromotableRelease(
        {
          isDraft: false,
          isPrerelease: true,
          tagName: "v1.2.3",
        },
        "v1.2.3",
      ),
    ).not.toThrow()
  })

  test("accepts a stable release so interrupted promotion can be retried", () => {
    const release = {
      isDraft: false,
      isPrerelease: false,
      tagName: "v1.2.3",
    }
    expect(() => assertPromotableRelease(release, "v1.2.3")).not.toThrow()
  })

  test("refuses to promote an older Preview over a newer stable release", () => {
    expect(() => assertPrereleasePromotionMovesForward("v1.2.4", "v1.2.3")).not.toThrow()
    expect(() => assertPrereleasePromotionMovesForward("v2.0.0", "v1.99.99")).not.toThrow()
    expect(() => assertPrereleasePromotionMovesForward("v1.2.3", "v1.2.3")).toThrow(
      "refusing to move latest backward",
    )
    expect(() => assertPrereleasePromotionMovesForward("v1.2.2", "v1.2.3")).toThrow(
      "refusing to move latest backward",
    )
  })

  test("ignores non-release tags when selecting the highest stable version", () => {
    expect(
      selectHighestStableReleaseTag([
        { tagName: "desktop-hotfix" },
        { tagName: "v1.2.3" },
        { tagName: "v2.0.0-preview.1" },
        { tagName: "v1.10.0" },
      ]),
    ).toBe("v1.10.0")
  })

  test("never points latest at the candidate before repairing to the highest stable", async () => {
    const source = await Bun.file(new URL("./promote-release.ts", import.meta.url)).text()
    expect(source).toContain("--prerelease=false --latest=false")
    expect(source).not.toContain("--prerelease=false --latest --repo")
  })

  test("treats a missing GitHub latest pointer as repairable", () => {
    expect(latestReleaseTagFromCommandResult({ exitCode: 1, output: "" })).toBeUndefined()
    expect(latestReleaseTagFromCommandResult({ exitCode: 0, output: "v1.2.3\n" })).toBe("v1.2.3")
  })
})

test("rejects Beta promotion before reading or editing releases", async () => {
  expect(() => assertPromotionDestination("prashantbhudwal/buddy-releases", {})).not.toThrow()
  expect(() => assertPromotionDestination("prashantbhudwal/buddy-beta-releases", {})).toThrow(
    "conflicts with prod",
  )
  expect(() =>
    assertPromotionDestination("prashantbhudwal/buddy-releases", { BUDDY_CHANNEL: "beta" }),
  ).toThrow("promotion is not supported")
  await expect(
    promoteRelease({ repo: "prashantbhudwal/buddy-beta-releases", tag: "v0.1.0" }),
  ).rejects.toThrow("conflicts with prod")
})

test("promotes prod in the shared repository while preserving Beta releases and repairing latest", async () => {
  const { chmod, mkdir, mkdtemp, rm } = await import("node:fs/promises")
  const { spawnSync } = await import("node:child_process")
  const { createHash } = await import("node:crypto")
  const os = await import("node:os")
  const path = await import("node:path")
  const { parseReleasePlan, releasePlanDigest } = await import("./release/plan")
  const { renderReleaseFreeze } = await import("./release/freeze")
  const root = path.resolve(import.meta.dir, "..")
  const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-prod-promotion-"))
  try {
    const bin = path.join(directory, "bin")
    const assetsDirectory = path.join(directory, "assets")
    await Promise.all([mkdir(bin), mkdir(assetsDirectory)])
    const plan = parseReleasePlan(
      await Bun.file(path.join(root, "script/release/fixtures/prod-plan.json")).json(),
    )
    const planBytes = Buffer.from(JSON.stringify(plan))
    const planName = "buddy-release-plan.json"
    await Bun.write(path.join(assetsDirectory, planName), planBytes)
    const planAsset = {
      name: planName,
      size: planBytes.length,
      sha256: createHash("sha256").update(planBytes).digest("hex"),
    }
    const freezeBytes = Buffer.from(
      renderReleaseFreeze({
        assets: [planAsset],
        planDigest: releasePlanDigest(plan),
        schemaVersion: 1,
        sourceRepository: plan.sourceRepository,
        sourceSha: plan.sourceSha,
        tag: plan.tag,
        version: plan.version,
      }),
    )
    const freezeName = "buddy-release-freeze.json"
    await Bun.write(path.join(assetsDirectory, freezeName), freezeBytes)
    const state = path.join(directory, "state.json")
    await Bun.write(
      state,
      JSON.stringify({
        isDraft: false,
        isPrerelease: true,
        tagName: plan.tag,
        latest: "v1.2.2",
        assets: [
          {
            ...planAsset,
            digest: `sha256:${planAsset.sha256}`,
            apiUrl: "https://api.github.com/assets/1",
          },
          {
            name: freezeName,
            size: freezeBytes.length,
            digest: `sha256:${createHash("sha256").update(freezeBytes).digest("hex")}`,
            apiUrl: "https://api.github.com/assets/2",
          },
        ],
      }),
    )
    const log = path.join(directory, "calls.jsonl")
    const gh = path.join(bin, "gh")
    await Bun.write(
      gh,
      `#!${process.execPath}
import { appendFileSync, copyFileSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
const args = process.argv.slice(2)
appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify(args) + "\\n")
const state = JSON.parse(readFileSync(process.env.FIXTURE_STATE, "utf8"))
if (args[0] === "api" && args[1].endsWith("/releases/latest")) {
  console.log(state.latest)
} else if (args[1] === "list") {
  console.log(JSON.stringify([{ tagName: "v1.2.2" }, { tagName: "beta-v999.0.0" }, ...(!state.isPrerelease ? [{ tagName: state.tagName }] : [])]))
} else if (args[1] === "view" && args[2] === state.tagName) {
  console.log(JSON.stringify(state))
} else if (args[1] === "download" && args[2] === state.tagName) {
  const name = args[args.indexOf("--pattern") + 1]
  copyFileSync(path.join(process.env.FIXTURE_ASSETS, name), path.join(args[args.indexOf("--dir") + 1], name))
} else if (args[1] === "edit" && args[2] === state.tagName) {
  if (args.includes("--prerelease=false") && args.includes("--latest=false")) state.isPrerelease = false
  else if (args.includes("--latest")) state.latest = state.tagName
  else throw new Error("Unexpected edit: " + args.join(" "))
  writeFileSync(process.env.FIXTURE_STATE, JSON.stringify(state))
} else throw new Error("Unexpected GitHub call: " + args.join(" "))
`,
    )
    await chmod(gh, 0o755)
    const bun = path.join(bin, "bun")
    await Bun.write(
      bun,
      `#!${process.execPath}\nimport { appendFileSync } from "node:fs"; appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify(["bun", ...process.argv.slice(2)]) + "\\n");\n`,
    )
    await chmod(bun, 0o755)
    const result = spawnSync(
      process.execPath,
      [
        "--eval",
        `import { promoteRelease } from ${JSON.stringify(path.join(root, "script/promote-release.ts"))}; await promoteRelease({ repo: "prashantbhudwal/buddy-releases", tag: "v1.2.3" });`,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          BUDDY_CHANNEL: "prod",
          BUDDY_RELEASE_REPO: "prashantbhudwal/buddy-releases",
          GH_REPO: "",
          FIXTURE_CALLS: log,
          FIXTURE_STATE: state,
          FIXTURE_ASSETS: assetsDirectory,
        },
        encoding: "utf8",
      },
    )
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(await Bun.file(state).json()).toMatchObject({ isPrerelease: false, latest: "v1.2.3" })
    const calls: string[][] = (await Bun.file(log).text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    const edits = calls.filter((call) => call[1] === "edit")
    expect(edits).toHaveLength(2)
    expect(edits.every((call) => call[2] === "v1.2.3")).toBe(true)
    expect(edits[0]).toContain("--latest=false")
    expect(edits[1]).toContain("--latest")
    expect(
      calls.some((call) => call[0] === "bun" && call.includes("./script/verify-release-assets.ts")),
    ).toBe(true)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
