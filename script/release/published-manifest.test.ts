import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { chmod, mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "../..")
const REPOSITORY = "prashantbhudwal/buddy-releases"
const MANIFEST = "latest-macos-x64.json"
const MANIFEST_BYTES = Buffer.from(`{
  "version": "0.1.0",
  "files": [{ "url": "https://github.com/${REPOSITORY}/releases/download/v0.1.0/buddy-v0.1.0-macos-intel.zip", "sha512": "fixture", "size": 1 }]
}\n`)
const SIGNATURE_BYTES = Buffer.from("previous signature bytes\n")

async function publishedFeedFixture(previousTag: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-published-feed-test-"))
  try {
    const current = path.join(directory, "current")
    const bin = path.join(directory, "bin")
    await Promise.all([mkdir(current), mkdir(bin)])
    for (const tag of new Set(["v0.1.0", previousTag])) {
      const release = path.join(directory, tag)
      await mkdir(release)
      await Bun.write(path.join(release, MANIFEST), MANIFEST_BYTES)
      await Bun.write(path.join(release, `${MANIFEST}.sig`), SIGNATURE_BYTES)
    }
    await Bun.write(path.join(current, MANIFEST), MANIFEST_BYTES)
    await Bun.write(path.join(current, `${MANIFEST}.sig`), SIGNATURE_BYTES)
    const gh = path.join(bin, "gh")
    await Bun.write(
      gh,
      `#!${process.execPath}
import { copyFileSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
const args = process.argv.slice(2)
const names = ["${MANIFEST}", "${MANIFEST}.sig"]
if (args[0] === "api" && args.includes("--slurp")) {
  console.log(JSON.stringify([[...new Set(["v0.1.0", process.env.FIXTURE_PREVIOUS_TAG])].map((tag) => ({
    tag_name: tag, draft: false, published_at: "2026-01-01T00:00:00Z", assets: names.map((name) => ({ name })),
  }))]))
} else if (args[0] === "release" && args[1] === "view") {
  const assets = names.map((name) => {
    const bytes = readFileSync(path.join(process.env.FIXTURE_DIRECTORY, args[2], name))
    return { name, apiUrl: "https://api.github.com/assets/fixture", size: bytes.length, digest: "sha256:" + createHash("sha256").update(bytes).digest("hex") }
  })
  console.log(JSON.stringify({ assets, isDraft: false, isPrerelease: false }))
} else if (args[0] === "release" && args[1] === "download") {
  if (args[2] !== process.env.FIXTURE_PREVIOUS_TAG) throw new Error("Did not select the newest published feed")
  const output = args[args.indexOf("--dir") + 1]
  for (let index = 0; index < args.length; index++) {
    if (args[index] !== "--pattern") continue
    const name = args[index + 1]
    copyFileSync(path.join(process.env.FIXTURE_DIRECTORY, args[2], name), path.join(output, name))
  }
} else { throw new Error("Unexpected GitHub command: " + args.join(" ")) }
`,
    )
    await chmod(gh, 0o755)
    return {
      directory,
      current,
      environment: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        BUDDY_CHANNEL: "prod",
        BUDDY_RELEASE_REPO: REPOSITORY,
        GH_REPO: REPOSITORY,
        BUDDY_VERSION: "0.1.2",
        BUDDY_RELEASE_TAG: "v0.1.2",
        BUDDY_RELEASE_TARGET_MACOS_ARM64: "true",
        BUDDY_RELEASE_TARGET_MACOS_X64: "false",
        BUDDY_RELEASE_TARGET_WINDOWS_X64: "true",
        BUDDY_RELEASE_CHECK_ONLY: "1",
        BUDDY_RELEASE_SELECTED_TARGETS_ONLY: "",
        BUDDY_UPDATE_OUTPUT_DIR: current,
        ELECTRON_DIST_DIR: directory,
        FIXTURE_DIRECTORY: directory,
        FIXTURE_PREVIOUS_TAG: previousTag,
      },
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

function verifyFeed(fixture: Awaited<ReturnType<typeof publishedFeedFixture>>, currentTag: string) {
  const input = {
    currentTag,
    directory: fixture.current,
    manifestName: MANIFEST,
    repository: REPOSITORY,
  }
  return spawnSync(
    process.execPath,
    [
      "--eval",
      `import { assertOmittedManifestUsesNewestPublishedFeed } from ${JSON.stringify(path.join(ROOT, "script/verify-release-assets.ts"))}; await assertOmittedManifestUsesNewestPublishedFeed(${JSON.stringify(input)}); console.log("Verified carried-forward feed")`,
    ],
    {
      env: fixture.environment,
      encoding: "utf8",
    },
  )
}

describe("omitted target feeds", () => {
  test.each([
    { currentTag: "v0.1.1", previousTag: "v0.1.0" },
    { currentTag: "v0.1.2", previousTag: "v0.1.1" },
  ])(
    "verifies $currentTag against $previousTag while artifacts still point at v0.1.0",
    async ({ currentTag, previousTag }) => {
      const fixture = await publishedFeedFixture(previousTag)
      try {
        const result = verifyFeed(fixture, currentTag)
        expect(result.stderr).toBe("")
        expect(result.status).toBe(0)
        expect(result.stdout).toContain("Verified carried-forward feed")
      } finally {
        await rm(fixture.directory, { recursive: true, force: true })
      }
    },
  )

  test.each([MANIFEST, `${MANIFEST}.sig`])(
    "rejects changed %s bytes even when artifact URLs point at the previous release",
    async (filename) => {
      const fixture = await publishedFeedFixture("v0.1.0")
      try {
        const file = path.join(fixture.current, filename)
        await Bun.write(file, Buffer.concat([await readFile(file), Buffer.from("\n")]))
        const result = verifyFeed(fixture, "v0.1.1")
        expect(result.status).toBe(1)
        expect(result.stderr).toContain(
          `${filename} does not carry forward newest compatible feed v0.1.0 byte-for-byte`,
        )
      } finally {
        await rm(fixture.directory, { recursive: true, force: true })
      }
    },
  )

  test("the target finalizer downloads a previous partial release's manifest and signature without rewriting them", async () => {
    const fixture = await publishedFeedFixture("v0.1.1")
    try {
      await rm(fixture.current, { recursive: true })
      const result = spawnSync(
        process.execPath,
        [path.join(ROOT, "packages/desktop-electron/scripts/finalize-target-update-manifests.ts")],
        {
          env: fixture.environment,
          encoding: "utf8",
        },
      )
      expect(result.status).toBe(0)
      expect(result.stdout).toContain("previous per-target manifest exists")
      expect(await readFile(path.join(fixture.current, MANIFEST))).toEqual(MANIFEST_BYTES)
      expect(await readFile(path.join(fixture.current, `${MANIFEST}.sig`))).toEqual(SIGNATURE_BYTES)
      const verified = verifyFeed(fixture, "v0.1.2")
      expect(verified.stderr).toBe("")
      expect(verified.status).toBe(0)
    } finally {
      await rm(fixture.directory, { recursive: true, force: true })
    }
  })
})
